/**
 * streamBlur.ts — Non-Blocking Image Blur via Streams
 *
 * Architecture:
 *  1. Fetch image as a stream (axios responseType: 'stream')
 *  2. Accumulate into a buffer with a hard 5MB ceiling
 *  3. Use Sharp to extract, blur, and composite each region
 *  4. Return the processed buffer for the webhook payload
 *
 * Design Decisions:
 *  - We use a single-pass buffer accumulation instead of piping, because
 *    Sharp's composite API requires the full image metadata (width/height)
 *    to convert percentage-based regions to pixel coordinates.
 *  - The 5MB limit protects the 114.5MB RAM footprint from OOM.
 *  - All errors are caught and logged — the caller always gets a result,
 *    either a blurred buffer or a null (fallback to original URL).
 */

import axios from 'axios';
import sharp from 'sharp';
import { logger } from './logger';

// ──────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────

export interface BlurRegion {
    id: string;
    x: number;      // percentage 0-100
    y: number;      // percentage 0-100
    width: number;   // percentage 0-100
    height: number;  // percentage 0-100
}

export interface BlurResult {
    /** The blurred image buffer, or null if fallback to original */
    buffer: Buffer | null;
    /** The filename to use for the blurred image */
    filename: string;
    /** Whether blur was actually applied */
    applied: boolean;
    /** Reason if not applied */
    reason?: string;
}

// ──────────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────────

/** Maximum image size for blur processing (5MB) */
const MAX_BLUR_FILE_SIZE = 5 * 1024 * 1024;

/** Axios timeout for fetching the image stream */
const FETCH_TIMEOUT_MS = 8_000;

/** Sharp blur sigma — higher = stronger blur */
const BLUR_SIGMA = 20;

// ──────────────────────────────────────────────────────────────
//  Core: streamBlurImage
// ──────────────────────────────────────────────────────────────

/**
 * Fetches an image from a URL as a stream, applies selective region
 * blurring using Sharp's composite API, and returns the result buffer.
 *
 * This function is designed to be called inside a fire-and-forget
 * async wrapper, so it never throws — it always returns a BlurResult.
 *
 * @param imageUrl   - Direct URL to the image (Discord CDN / proxy)
 * @param regions    - Array of blur regions (percentage-based coordinates)
 * @param filename   - Original filename for the attachment
 * @returns BlurResult with the processed buffer or null for fallback
 */
export async function streamBlurImage(
    imageUrl: string,
    regions: BlurRegion[],
    filename: string
): Promise<BlurResult> {
    const logCtx = { fn: 'streamBlurImage', filename, regionCount: regions.length };

    try {
        // ── 1. Validate regions ──
        if (!regions || regions.length === 0) {
            return { buffer: null, filename, applied: false, reason: 'No regions defined' };
        }

        // ── 2. Fetch image as stream with size guard ──
        const response = await axios.get(imageUrl, {
            responseType: 'stream',
            timeout: FETCH_TIMEOUT_MS,
            maxContentLength: MAX_BLUR_FILE_SIZE,
            maxBodyLength: MAX_BLUR_FILE_SIZE,
            headers: {
                'User-Agent': 'DisBot-Worker/1.0'
            }
        });

        // Check Content-Length header early (before consuming stream)
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        if (contentLength > MAX_BLUR_FILE_SIZE) {
            // Drain the stream to avoid socket hang
            response.data.resume();
            logger.info({ ...logCtx, contentLength }, 'Image too large for blur — falling back to original URL');
            return { buffer: null, filename, applied: false, reason: `File too large (${(contentLength / 1024 / 1024).toFixed(1)}MB > 5MB limit)` };
        }

        // ── 3. Accumulate stream into buffer with safety valve ──
        const chunks: Buffer[] = [];
        let totalSize = 0;

        const imageBuffer: Buffer = await new Promise((resolve, reject) => {
            const stream = response.data;

            stream.on('data', (chunk: Buffer) => {
                totalSize += chunk.length;
                if (totalSize > MAX_BLUR_FILE_SIZE) {
                    stream.destroy(new Error('BLUR_SIZE_EXCEEDED'));
                    return;
                }
                chunks.push(chunk);
            });

            stream.on('end', () => {
                resolve(Buffer.concat(chunks));
            });

            stream.on('error', (err: Error) => {
                reject(err);
            });
        });

        // ── 4. Get image metadata for coordinate conversion ──
        const metadata = await sharp(imageBuffer).metadata();
        const imgWidth = metadata.width;
        const imgHeight = metadata.height;

        if (!imgWidth || !imgHeight) {
            logger.warn({ ...logCtx }, 'Cannot determine image dimensions — skipping blur');
            return { buffer: null, filename, applied: false, reason: 'Unknown image dimensions' };
        }

        logger.debug({ ...logCtx, imgWidth, imgHeight }, 'Image loaded — applying blur regions');

        // ── 5. Build composite overlays for each region ──
        //
        // Strategy: For each blur region:
        //   a) Extract the sub-region from the original image
        //   b) Apply a Gaussian blur to that sub-region
        //   c) Composite (paste) the blurred sub-region back at the same position
        //
        // This is faster than full-image blur + mask, and uses minimal extra memory.

        const compositeInputs: sharp.OverlayOptions[] = [];

        for (const region of regions) {
            // Convert percentage to pixel coordinates
            const left = Math.round((region.x / 100) * imgWidth);
            const top = Math.round((region.y / 100) * imgHeight);
            let width = Math.round((region.width / 100) * imgWidth);
            let height = Math.round((region.height / 100) * imgHeight);

            // Clamp to image bounds
            const clampedLeft = Math.max(0, Math.min(left, imgWidth - 1));
            const clampedTop = Math.max(0, Math.min(top, imgHeight - 1));
            width = Math.min(width, imgWidth - clampedLeft);
            height = Math.min(height, imgHeight - clampedTop);

            // Skip degenerate regions
            if (width < 2 || height < 2) {
                logger.debug({ ...logCtx, regionId: region.id, width, height }, 'Skipping degenerate blur region');
                continue;
            }

            // Extract and blur the sub-region
            const blurredRegionBuffer = await sharp(imageBuffer)
                .extract({ left: clampedLeft, top: clampedTop, width, height })
                .blur(BLUR_SIGMA)
                .toBuffer();

            compositeInputs.push({
                input: blurredRegionBuffer,
                left: clampedLeft,
                top: clampedTop,
            });
        }

        if (compositeInputs.length === 0) {
            logger.debug({ ...logCtx }, 'No valid blur regions to apply — returning original');
            return { buffer: null, filename, applied: false, reason: 'All regions were degenerate' };
        }

        // ── 6. Composite blurred regions onto the original image ──
        const resultBuffer = await sharp(imageBuffer)
            .composite(compositeInputs)
            .toBuffer();

        // ── 7. Explicit cleanup ──
        // Null out intermediate references for faster GC
        chunks.length = 0;

        logger.info({
            ...logCtx,
            appliedRegions: compositeInputs.length,
            inputSize: (imageBuffer.length / 1024).toFixed(1) + 'KB',
            outputSize: (resultBuffer.length / 1024).toFixed(1) + 'KB'
        }, 'Blur applied successfully');

        return { buffer: resultBuffer, filename, applied: true };

    } catch (err: any) {
        // ── Graceful fallback: Never crash the worker ──
        const errorMsg = err.message || 'Unknown error';

        if (errorMsg === 'BLUR_SIZE_EXCEEDED') {
            logger.info({ ...logCtx }, 'Image exceeded 5MB during stream — falling back to original URL');
            return { buffer: null, filename, applied: false, reason: 'Stream exceeded 5MB limit' };
        }

        logger.warn({ ...logCtx, error: errorMsg }, 'Blur processing failed — falling back to original URL');
        return { buffer: null, filename, applied: false, reason: errorMsg };
    }
}

// ──────────────────────────────────────────────────────────────
//  Utility: processAttachmentsWithBlur
// ──────────────────────────────────────────────────────────────

/**
 * High-level utility that processes an array of eligible media attachments,
 * applying blur to image types that match the config's blur regions.
 *
 * Non-image attachments pass through unchanged.
 * Failed blurs fall back to the original proxy URL (zero data loss).
 *
 * @param attachments - Eligible ParsedAttachments from media.ts
 * @param blurRegions - Blur regions from MirrorConfig (or undefined)
 * @returns Array of webhook file objects (with Buffer for blurred, URL for others)
 */
export async function processAttachmentsWithBlur(
    attachments: Array<{ proxyUrl: string; url: string; name: string; category: string }>,
    blurRegions: BlurRegion[] | undefined
): Promise<Array<{ attachment: Buffer | string; name: string }>> {
    const files: Array<{ attachment: Buffer | string; name: string }> = [];

    const hasBlurRegions = blurRegions && blurRegions.length > 0;

    for (const att of attachments) {
        // Only attempt blur on images when regions are defined
        if (hasBlurRegions && att.category === 'image') {
            const blurResult = await streamBlurImage(
                att.proxyUrl || att.url,
                blurRegions!,
                att.name
            );

            if (blurResult.applied && blurResult.buffer) {
                // Use the blurred buffer directly
                files.push({
                    attachment: blurResult.buffer,
                    name: att.name
                });
            } else {
                // Fallback: use the original URL (no blur)
                files.push({
                    attachment: att.proxyUrl || att.url,
                    name: att.name
                });
            }
        } else {
            // Non-image or no blur regions: pass through as URL
            files.push({
                attachment: att.proxyUrl || att.url,
                name: att.name
            });
        }
    }

    return files;
}
