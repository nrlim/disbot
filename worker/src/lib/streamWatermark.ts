/**
 * streamWatermark.ts — Non-Blocking Watermark via Sharp Composite
 *
 * Supports two overlay modes:
 *
 *  A) VISUAL (Logo Overlay):
 *     1. Fetch watermark image from URL (cached in memory, < 1MB limit)
 *     2. Fetch source image as a stream with 5MB ceiling
 *     3. Use Sharp composite to overlay the logo onto the source
 *     4. Return the composited buffer for the webhook payload
 *
 *  B) TEXT (SVG Text Overlay):
 *     1. Generate SVG string from user's branding text
 *     2. Rasterize SVG → PNG via Sharp (in-memory, ~10-50KB)
 *     3. Composite the rasterized text onto the source image
 *     4. Return the composited buffer for the webhook payload
 *
 * Design Decisions:
 *  - Watermark images are cached in a Map with TTL to avoid
 *    re-fetching the same logo on every message.
 *  - The 1MB limit on watermark files protects the 114.5MB RAM footprint.
 *  - SVG text rendering avoids external dependencies (no canvas, no
 *    font files) — relies on Sharp/libvips's built-in librsvg.
 *  - Gravity-based positioning (e.g., "southeast") is converted to
 *    pixel coordinates using the source image dimensions, providing
 *    an easy UX without needing raw coordinates.
 *  - PNG transparency (alpha channel) is preserved throughout the
 *    pipeline by forcing RGBA output in Sharp.
 *  - All errors are caught — the caller always gets a WatermarkResult,
 *    either a composited buffer or null (fallback to original URL).
 */

import axios from 'axios';
import sharp from 'sharp';
import { logger } from './logger';

// ──────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────

export type WatermarkGravity =
    | 'northwest' | 'north' | 'northeast'
    | 'west' | 'center' | 'east'
    | 'southwest' | 'south' | 'southeast';

export interface WatermarkConfig {
    /** URL of the watermark/logo image (PNG recommended) */
    imageUrl: string;
    /** Gravity-based position string or raw "top,left" pixel coordinates */
    position: string;
    /** Transparency (0-100). Default 100 (Opaque). */
    opacity?: number;
    /** Text overlay config — if present, renders text onto image instead of logo */
    textOverlay?: TextOverlayConfig;
}

/**
 * Configuration for burning text directly onto an image via SVG rendering.
 *
 * The text is rendered as an SVG <text> element, rasterized to PNG by Sharp,
 * then composited onto the source image at the configured position.
 *
 * Memory footprint: The SVG string + rasterized buffer are both small
 * (~10-50KB) and short-lived, well within the 114.5MB ceiling.
 */
export interface TextOverlayConfig {
    /** The watermark text to render (e.g., "via MyBrand") */
    text: string;
    /** Font size in pixels. Default: 24 */
    fontSize?: number;
    /** Hex color string (e.g., "#FFFFFF"). Default: "#FFFFFF" */
    color?: string;
    /** Text opacity 0-100. Default: 70 — slightly transparent for subtlety */
    opacity?: number;
    /** Gravity position for the text overlay. Default: "southeast" */
    position?: string;
    /** Font family. Default: "Arial, Helvetica, sans-serif" */
    fontFamily?: string;
    /** Whether to render a semi-transparent backdrop pill behind text. Default: true */
    enableBackdrop?: boolean;
}

export interface WatermarkResult {
    /** The composited image buffer, or null if fallback to original */
    buffer: Buffer | null;
    /** The filename for the result */
    filename: string;
    /** Whether the watermark was actually applied */
    applied: boolean;
    /** Reason if not applied */
    reason?: string;
}

// ──────────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────────

/** Maximum watermark image size (1MB) — Keeps RAM footprint safe */
const MAX_WATERMARK_SIZE = 1 * 1024 * 1024;

/** Maximum source image size for watermark processing (5MB) */
const MAX_SOURCE_SIZE = 5 * 1024 * 1024;

/** Axios timeout for fetching images */
const FETCH_TIMEOUT_MS = 8_000;

/** Padding from edge in pixels when using gravity positioning */
const GRAVITY_PADDING = 16;

/** Cache TTL for watermark buffers (10 minutes) */
const WATERMARK_CACHE_TTL_MS = 10 * 60 * 1000;

/** Maximum number of cached watermarks to prevent memory leak */
const MAX_CACHE_ENTRIES = 50;

// ──────────────────────────────────────────────────────────────
//  Watermark Image Cache
// ──────────────────────────────────────────────────────────────

interface CachedWatermark {
    buffer: Buffer;
    width: number;
    height: number;
    fetchedAt: number;
}

const watermarkCache = new Map<string, CachedWatermark>();

/**
 * Evicts expired entries from the watermark cache.
 */
function evictExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of watermarkCache) {
        if (now - entry.fetchedAt > WATERMARK_CACHE_TTL_MS) {
            watermarkCache.delete(key);
        }
    }
}

/**
 * Fetches and caches a watermark image buffer from a URL.
 * Returns cached version if available and not expired.
 *
 * The watermark is ensured to have an alpha channel (RGBA) for
 * proper transparency compositing.
 *
 * @param imageUrl - URL of the watermark image
 * @returns CachedWatermark with buffer and dimensions, or null on failure
 */
async function fetchWatermarkBuffer(imageUrl: string): Promise<CachedWatermark | null> {
    const logCtx = { fn: 'fetchWatermarkBuffer', url: imageUrl.substring(0, 80) };

    // Check cache
    const cached = watermarkCache.get(imageUrl);
    if (cached && (Date.now() - cached.fetchedAt < WATERMARK_CACHE_TTL_MS)) {
        logger.debug({ ...logCtx }, 'Using cached watermark buffer');
        return cached;
    }

    try {
        // Evict old entries before adding new ones
        evictExpiredCache();
        if (watermarkCache.size >= MAX_CACHE_ENTRIES) {
            // Emergency evict: remove oldest entry
            const oldestKey = watermarkCache.keys().next().value;
            if (oldestKey) watermarkCache.delete(oldestKey);
        }

        // Fetch watermark image
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: FETCH_TIMEOUT_MS,
            maxContentLength: MAX_WATERMARK_SIZE,
            maxBodyLength: MAX_WATERMARK_SIZE,
            headers: { 'User-Agent': 'DisBot-Worker/1.0' }
        });

        const rawBuffer = Buffer.from(response.data);

        // Validate size
        if (rawBuffer.length > MAX_WATERMARK_SIZE) {
            logger.warn({ ...logCtx, size: rawBuffer.length }, 'Watermark image exceeds 1MB limit');
            return null;
        }

        // Ensure RGBA (preserve transparency) and get dimensions
        const ensuredBuffer = await sharp(rawBuffer)
            .ensureAlpha()
            .png()
            .toBuffer();

        const metadata = await sharp(ensuredBuffer).metadata();
        if (!metadata.width || !metadata.height) {
            logger.warn({ ...logCtx }, 'Cannot determine watermark dimensions');
            return null;
        }

        const entry: CachedWatermark = {
            buffer: ensuredBuffer,
            width: metadata.width,
            height: metadata.height,
            fetchedAt: Date.now()
        };

        watermarkCache.set(imageUrl, entry);

        logger.info({
            ...logCtx,
            width: entry.width,
            height: entry.height,
            size: `${(ensuredBuffer.length / 1024).toFixed(1)}KB`
        }, 'Watermark image fetched and cached');

        return entry;

    } catch (err: any) {
        logger.warn({ ...logCtx, error: err.message }, 'Failed to fetch watermark image');
        return null;
    }
}

// ──────────────────────────────────────────────────────────────
//  Gravity → Pixel Coordinate Resolver
// ──────────────────────────────────────────────────────────────

/**
 * Resolves a gravity string or raw "top,left" coordinate pair
 * into pixel { top, left } values for Sharp's composite API.
 *
 * Gravity values map to positions relative to the source image:
 *   northwest | north     | northeast
 *   west      | center    | east
 *   southwest | south     | southeast  (default)
 *
 * @param position      - Gravity string or "top,left" raw coordinates
 * @param sourceWidth   - Width of the source image in pixels
 * @param sourceHeight  - Height of the source image in pixels
 * @param wmWidth       - Width of the watermark image in pixels
 * @param wmHeight      - Height of the watermark image in pixels
 * @returns { top, left } pixel coordinates
 */
function resolvePosition(
    position: string,
    sourceWidth: number,
    sourceHeight: number,
    wmWidth: number,
    wmHeight: number
): { top: number; left: number } {
    // Try parsing as raw coordinates: "top,left" (e.g., "100,200")
    const parts = position.split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return {
            top: Math.max(0, Math.min(parts[0], sourceHeight - wmHeight)),
            left: Math.max(0, Math.min(parts[1], sourceWidth - wmWidth))
        };
    }

    // Gravity-based positioning
    const gravity = position.toLowerCase().trim() as WatermarkGravity;
    const pad = GRAVITY_PADDING;

    // Vertical position
    let top: number;
    if (gravity.startsWith('north')) {
        top = pad;
    } else if (gravity.startsWith('south')) {
        top = sourceHeight - wmHeight - pad;
    } else if (gravity === 'west' || gravity === 'center' || gravity === 'east') {
        top = Math.round((sourceHeight - wmHeight) / 2);
    } else {
        // Default: southeast
        top = sourceHeight - wmHeight - pad;
    }

    // Horizontal position
    let left: number;
    if (gravity.endsWith('west')) {
        left = pad;
    } else if (gravity.endsWith('east')) {
        left = sourceWidth - wmWidth - pad;
    } else if (gravity === 'north' || gravity === 'center' || gravity === 'south') {
        left = Math.round((sourceWidth - wmWidth) / 2);
    } else {
        // Default: southeast
        left = sourceWidth - wmWidth - pad;
    }

    // Clamp to valid bounds
    top = Math.max(0, Math.min(top, sourceHeight - 1));
    left = Math.max(0, Math.min(left, sourceWidth - 1));

    return { top, left };
}

// ──────────────────────────────────────────────────────────────
//  Text Overlay: SVG → Buffer → Sharp Composite
// ──────────────────────────────────────────────────────────────

/**
 * Escapes special XML characters in a string to prevent SVG injection.
 * Critical for user-provided text that gets embedded in an SVG template.
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Generates an SVG buffer containing the watermark text.
 *
 * The SVG uses a simple <text> element with an optional semi-transparent
 * backdrop <rect> for readability over diverse image backgrounds.
 *
 * Design decisions:
 *  - Width is estimated at `fontSize * 0.6 * text.length` (monospace-ish)
 *    plus padding. This avoids needing a layout engine while being
 *    "good enough" for short branding strings (2-30 chars).
 *  - The backdrop pill uses 40% opacity black for contrast without
 *    obscuring the underlying image.
 *  - Font rendering quality depends on the system's SVG rasterizer
 *    (librsvg in Sharp/libvips). On most Linux VPS this produces
 *    crisp anti-aliased text.
 *
 * @param config - Text overlay configuration
 * @returns PNG buffer of the rendered text overlay, with dimensions
 */
async function generateTextOverlayBuffer(
    config: TextOverlayConfig
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
    const logCtx = { fn: 'generateTextOverlayBuffer' };

    try {
        const text = config.text.trim();
        if (!text) return null;

        const fontSize = Math.max(10, Math.min(config.fontSize || 24, 128));
        const color = config.color || '#FFFFFF';
        const opacity = Math.max(0, Math.min(config.opacity ?? 70, 100)) / 100;
        const fontFamily = config.fontFamily || 'Arial, Helvetica, sans-serif';
        const enableBackdrop = config.enableBackdrop !== false;

        // ── Estimate dimensions ──
        // Average character width ≈ 0.6 * fontSize for sans-serif fonts.
        // We add generous padding so text never clips.
        const charWidth = fontSize * 0.6;
        const textWidth = Math.ceil(charWidth * text.length);
        const hPad = Math.round(fontSize * 0.6);  // horizontal padding
        const vPad = Math.round(fontSize * 0.4);   // vertical padding

        const svgWidth = textWidth + (hPad * 2);
        const svgHeight = Math.ceil(fontSize * 1.4) + (vPad * 2);

        // ── Build SVG ──
        const escapedText = escapeXml(text);

        // Text anchor: centered horizontally within the SVG
        const textX = Math.round(svgWidth / 2);
        const textY = Math.round(vPad + fontSize * 1.05); // baseline offset

        let backdropSvg = '';
        if (enableBackdrop) {
            // Semi-transparent black pill behind the text
            const rx = Math.round(fontSize * 0.25); // corner radius
            backdropSvg = `<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" rx="${rx}" ry="${rx}" fill="rgba(0,0,0,0.4)" />`;
        }

        const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">
    ${backdropSvg}
    <text
        x="${textX}"
        y="${textY}"
        text-anchor="middle"
        font-family="${escapeXml(fontFamily)}"
        font-size="${fontSize}"
        font-weight="600"
        fill="${escapeXml(color)}"
        opacity="${opacity.toFixed(2)}"
        letter-spacing="0.5"
    >${escapedText}</text>
</svg>`.trim();

        // ── Rasterize SVG → PNG via Sharp ──
        const svgBuffer = Buffer.from(svgString);
        const pngBuffer = await sharp(svgBuffer)
            .png()
            .toBuffer();

        // Verify rasterization produced valid output
        const meta = await sharp(pngBuffer).metadata();
        if (!meta.width || !meta.height) {
            logger.warn({ ...logCtx }, 'SVG rasterization produced invalid output');
            return null;
        }

        logger.debug({
            ...logCtx,
            text: text.substring(0, 30),
            svgSize: svgBuffer.length,
            pngSize: pngBuffer.length,
            dimensions: `${meta.width}x${meta.height}`
        }, 'Text overlay SVG rasterized');

        return {
            buffer: pngBuffer,
            width: meta.width,
            height: meta.height
        };

    } catch (err: any) {
        logger.warn({ ...logCtx, error: err.message }, 'Failed to generate text overlay SVG buffer');
        return null;
    }
}

/**
 * Applies a text overlay watermark onto a source image.
 *
 * This is the text-burning counterpart to `applyVisualWatermark`.
 * Instead of fetching a logo from a URL, it generates an SVG text
 * buffer and composites it onto the source image.
 *
 * Pipeline:
 *   1. Generate SVG text buffer (in-memory, ~10-50KB)
 *   2. Fetch source image as stream (5MB ceiling)
 *   3. Resolve gravity position
 *   4. Composite text overlay onto source via Sharp
 *   5. Return result buffer
 *
 * @param sourceImageUrl  - Direct URL to source image
 * @param textConfig      - Text overlay configuration
 * @param filename        - Original filename
 * @returns WatermarkResult
 */
export async function applyTextOverlay(
    sourceImageUrl: string,
    textConfig: TextOverlayConfig,
    filename: string
): Promise<WatermarkResult> {
    const logCtx = {
        fn: 'applyTextOverlay',
        filename,
        text: (textConfig.text || '').substring(0, 30),
        position: textConfig.position || 'southeast'
    };

    try {
        // ── 1. Generate text overlay buffer ──
        const overlay = await generateTextOverlayBuffer(textConfig);
        if (!overlay) {
            return {
                buffer: null,
                filename,
                applied: false,
                reason: 'Failed to generate text overlay (empty text or SVG error)'
            };
        }

        // ── 2. Fetch source image ──
        const response = await axios.get(sourceImageUrl, {
            responseType: 'stream',
            timeout: FETCH_TIMEOUT_MS,
            maxContentLength: MAX_SOURCE_SIZE,
            maxBodyLength: MAX_SOURCE_SIZE,
            headers: { 'User-Agent': 'DisBot-Worker/1.0' }
        });

        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        if (contentLength > MAX_SOURCE_SIZE) {
            response.data.resume();
            return {
                buffer: null,
                filename,
                applied: false,
                reason: `Source too large (${(contentLength / 1024 / 1024).toFixed(1)}MB > 5MB limit)`
            };
        }

        // ── 3. Accumulate stream ──
        const chunks: Buffer[] = [];
        let totalSize = 0;

        const sourceBuffer: Buffer = await new Promise((resolve, reject) => {
            const stream = response.data;
            stream.on('data', (chunk: Buffer) => {
                totalSize += chunk.length;
                if (totalSize > MAX_SOURCE_SIZE) {
                    stream.destroy(new Error('TEXT_OVERLAY_SOURCE_SIZE_EXCEEDED'));
                    return;
                }
                chunks.push(chunk);
            });
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', (err: Error) => reject(err));
        });

        // ── 4. Get source dimensions ──
        const metadata = await sharp(sourceBuffer).metadata();
        const srcWidth = metadata.width;
        const srcHeight = metadata.height;

        if (!srcWidth || !srcHeight) {
            return { buffer: null, filename, applied: false, reason: 'Unknown source dimensions' };
        }

        // ── 5. Resolve position ──
        const { top, left } = resolvePosition(
            textConfig.position || 'southeast',
            srcWidth, srcHeight,
            overlay.width, overlay.height
        );

        // ── 6. Composite onto source ──
        const resultBuffer = await sharp(sourceBuffer)
            .composite([{
                input: overlay.buffer,
                top,
                left,
            }])
            .toBuffer();

        // ── 7. Cleanup ──
        chunks.length = 0;

        logger.info({
            ...logCtx,
            inputSize: `${(sourceBuffer.length / 1024).toFixed(1)}KB`,
            outputSize: `${(resultBuffer.length / 1024).toFixed(1)}KB`,
            overlaySize: `${overlay.width}x${overlay.height}`,
            top, left
        }, 'Text overlay watermark applied successfully');

        return { buffer: resultBuffer, filename, applied: true };

    } catch (err: any) {
        const errorMsg = err.message || 'Unknown error';

        if (errorMsg === 'TEXT_OVERLAY_SOURCE_SIZE_EXCEEDED') {
            logger.info({ ...logCtx }, 'Source image exceeded 5MB during text overlay — fallback');
            return { buffer: null, filename, applied: false, reason: 'Stream exceeded 5MB limit' };
        }

        logger.warn({ ...logCtx, error: errorMsg }, 'Text overlay failed — fallback to original');
        return { buffer: null, filename, applied: false, reason: errorMsg };
    }
}

/**
 * Applies a text overlay directly onto a pre-buffered image.
 * Used when the source is already in memory (e.g., after blur processing).
 *
 * @param sourceBuffer - Source image buffer
 * @param textConfig   - Text overlay configuration
 * @param filename     - Filename for logging
 * @returns Composited buffer, or original if overlay fails
 */
async function applyTextOverlayToBuffer(
    sourceBuffer: Buffer,
    textConfig: TextOverlayConfig,
    filename: string
): Promise<Buffer> {
    const logCtx = { fn: 'applyTextOverlayToBuffer', filename };

    try {
        const overlay = await generateTextOverlayBuffer(textConfig);
        if (!overlay) return sourceBuffer;

        const metadata = await sharp(sourceBuffer).metadata();
        const srcW = metadata.width || 0;
        const srcH = metadata.height || 0;

        if (srcW === 0 || srcH === 0) return sourceBuffer;

        const { top, left } = resolvePosition(
            textConfig.position || 'southeast',
            srcW, srcH,
            overlay.width, overlay.height
        );

        const result = await sharp(sourceBuffer)
            .composite([{ input: overlay.buffer, top, left }])
            .toBuffer();

        logger.debug({ ...logCtx, overlaySize: `${overlay.width}x${overlay.height}` },
            'Text overlay applied to pre-buffered image');

        return result;
    } catch (err: any) {
        logger.warn({ ...logCtx, error: err.message }, 'Text overlay on buffer failed — using original');
        return sourceBuffer;
    }
}

// ──────────────────────────────────────────────────────────────
//  Core: applyVisualWatermark
// ──────────────────────────────────────────────────────────────

/**
 * Applies a visual watermark (logo overlay) onto a source image.
 *
 * This function is designed to be called inside a fire-and-forget
 * async wrapper, so it never throws — it always returns a WatermarkResult.
 *
 * Pipeline:
 *   1. Fetch & cache the watermark image (with 1MB size guard)
 *   2. Fetch the source image as a stream (with 5MB size guard)
 *   3. Resolve position (gravity or raw coordinates)
 *   4. Composite the watermark onto the source using Sharp
 *   5. Return the result buffer
 *
 * Transparency:
 *   The watermark is processed through `ensureAlpha()` and `.png()`
 *   to guarantee the alpha channel is preserved during compositing.
 *   The final output format matches the source image format.
 *
 * @param sourceImageUrl - Direct URL to the source image (Discord CDN)
 * @param watermarkConfig - { imageUrl, position } for the watermark
 * @param filename - Original filename for the attachment
 * @returns WatermarkResult with the composited buffer or null for fallback
 */
export async function applyVisualWatermark(
    sourceImageUrl: string,
    watermarkConfig: WatermarkConfig,
    filename: string
): Promise<WatermarkResult> {
    const logCtx = {
        fn: 'applyVisualWatermark',
        filename,
        wmUrl: watermarkConfig.imageUrl.substring(0, 60),
        position: watermarkConfig.position
    };

    try {
        // ── 1. Fetch & cache watermark image ──
        const watermark = await fetchWatermarkBuffer(watermarkConfig.imageUrl);
        if (!watermark) {
            return {
                buffer: null,
                filename,
                applied: false,
                reason: 'Failed to fetch watermark image (invalid URL or > 1MB)'
            };
        }

        // ── 1.5 Apply Opacity (Runtime) ──
        let finalWatermarkBuffer = watermark.buffer;
        const opacity = watermarkConfig.opacity ?? 100;

        if (opacity < 100 && opacity >= 0) {
            try {
                // Apply global opacity by masking with a translucent layer
                // 'dest-in' keeps destination alpha * source alpha
                const alpha = Math.round((opacity / 100) * 255);

                finalWatermarkBuffer = await sharp(watermark.buffer)
                    .ensureAlpha()
                    .composite([{
                        input: Buffer.from([255, 255, 255, alpha]),
                        raw: { width: 1, height: 1, channels: 4 },
                        tile: true,
                        blend: 'dest-in'
                    }])
                    .toBuffer();
            } catch (err: any) {
                logger.warn({ ...logCtx, error: err.message }, 'Failed to apply opacity to watermark - using opaque');
            }
        }

        // ── 2. Fetch source image as stream with size guard ──
        const response = await axios.get(sourceImageUrl, {
            responseType: 'stream',
            timeout: FETCH_TIMEOUT_MS,
            maxContentLength: MAX_SOURCE_SIZE,
            maxBodyLength: MAX_SOURCE_SIZE,
            headers: { 'User-Agent': 'DisBot-Worker/1.0' }
        });

        // Check Content-Length header early
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        if (contentLength > MAX_SOURCE_SIZE) {
            response.data.resume();
            logger.info({ ...logCtx, contentLength }, 'Source image too large for watermark — fallback');
            return {
                buffer: null,
                filename,
                applied: false,
                reason: `Source too large (${(contentLength / 1024 / 1024).toFixed(1)}MB > 5MB limit)`
            };
        }

        // ── 3. Accumulate stream into buffer ──
        const chunks: Buffer[] = [];
        let totalSize = 0;

        const sourceBuffer: Buffer = await new Promise((resolve, reject) => {
            const stream = response.data;

            stream.on('data', (chunk: Buffer) => {
                totalSize += chunk.length;
                if (totalSize > MAX_SOURCE_SIZE) {
                    stream.destroy(new Error('WATERMARK_SOURCE_SIZE_EXCEEDED'));
                    return;
                }
                chunks.push(chunk);
            });

            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', (err: Error) => reject(err));
        });

        // ── 4. Get source image metadata ──
        const metadata = await sharp(sourceBuffer).metadata();
        const srcWidth = metadata.width;
        const srcHeight = metadata.height;

        if (!srcWidth || !srcHeight) {
            logger.warn({ ...logCtx }, 'Cannot determine source image dimensions — skipping watermark');
            return { buffer: null, filename, applied: false, reason: 'Unknown source dimensions' };
        }

        // Skip watermark if source is smaller than watermark
        if (srcWidth < watermark.width || srcHeight < watermark.height) {
            logger.info({
                ...logCtx,
                srcSize: `${srcWidth}x${srcHeight}`,
                wmSize: `${watermark.width}x${watermark.height}`
            }, 'Source image smaller than watermark — skipping');
            return {
                buffer: null,
                filename,
                applied: false,
                reason: 'Source image smaller than watermark'
            };
        }

        // ── 5. Resolve position ──
        const { top, left } = resolvePosition(
            watermarkConfig.position,
            srcWidth, srcHeight,
            watermark.width, watermark.height
        );

        logger.debug({
            ...logCtx,
            srcSize: `${srcWidth}x${srcHeight}`,
            wmSize: `${watermark.width}x${watermark.height}`,
            top, left
        }, 'Compositing watermark onto source');

        // ── 6. Composite watermark onto source ──
        const resultBuffer = await sharp(sourceBuffer)
            .composite([{
                input: finalWatermarkBuffer,
                top,
                left,
            }])
            .toBuffer();

        // ── 7. Explicit cleanup ──
        chunks.length = 0;

        logger.info({
            ...logCtx,
            inputSize: `${(sourceBuffer.length / 1024).toFixed(1)}KB`,
            outputSize: `${(resultBuffer.length / 1024).toFixed(1)}KB`,
            top, left
        }, 'Visual watermark applied successfully');

        return { buffer: resultBuffer, filename, applied: true };

    } catch (err: any) {
        const errorMsg = err.message || 'Unknown error';

        if (errorMsg === 'WATERMARK_SOURCE_SIZE_EXCEEDED') {
            logger.info({ ...logCtx }, 'Source image exceeded 5MB during stream — fallback');
            return { buffer: null, filename, applied: false, reason: 'Stream exceeded 5MB limit' };
        }

        logger.warn({ ...logCtx, error: errorMsg }, 'Visual watermark failed — fallback to original');
        return { buffer: null, filename, applied: false, reason: errorMsg };
    }
}

// ──────────────────────────────────────────────────────────────
//  Utility: processAttachmentsWithWatermark
// ──────────────────────────────────────────────────────────────

/**
 * High-level utility that processes eligible image attachments
 * by applying a visual watermark overlay.
 *
 * - Only images are watermarked; other attachment types pass through.
 * - If the watermark fails, the original URL is used (zero data loss).
 * - Can chain with blur processing: accepts pre-processed buffers.
 *
 * @param files          - Array of webhook files (may contain Buffer or URL strings)
 * @param watermarkConfig - Watermark configuration (imageUrl + position), or undefined
 * @returns Array of webhook file objects with watermarks applied where applicable
 */
export async function processAttachmentsWithWatermark(
    files: Array<{ attachment: Buffer | string; name: string }>,
    watermarkConfig: WatermarkConfig | undefined
): Promise<Array<{ attachment: Buffer | string; name: string }>> {
    // Determine mode: text overlay vs visual (logo) overlay
    const hasTextOverlay = watermarkConfig?.textOverlay && watermarkConfig.textOverlay.text?.trim();
    const hasVisualOverlay = watermarkConfig?.imageUrl;

    if (!hasTextOverlay && !hasVisualOverlay) {
        return files; // No-op: pass through if nothing configured
    }

    const result: Array<{ attachment: Buffer | string; name: string }> = [];
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif']);

    for (const file of files) {
        // Determine if this is an image by extension
        const ext = file.name.lastIndexOf('.') !== -1
            ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
            : '';

        if (!imageExtensions.has(ext)) {
            // Non-image: pass through
            result.push(file);
            continue;
        }

        // ─────────────── TEXT OVERLAY PATH ───────────────
        if (hasTextOverlay && watermarkConfig!.textOverlay) {
            const textConfig = watermarkConfig!.textOverlay;

            if (Buffer.isBuffer(file.attachment)) {
                // Buffer path: apply text overlay directly
                try {
                    const composited = await applyTextOverlayToBuffer(
                        file.attachment,
                        textConfig,
                        file.name
                    );
                    result.push({ attachment: composited, name: file.name });
                } catch (err: any) {
                    logger.warn({ fn: 'processAttachmentsWithWatermark', filename: file.name, error: err.message },
                        'Text overlay on buffer failed — using original');
                    result.push(file);
                }
            } else {
                // URL path: full fetch + text overlay pipeline
                const wmResult = await applyTextOverlay(
                    file.attachment,
                    textConfig,
                    file.name
                );

                if (wmResult.applied && wmResult.buffer) {
                    result.push({ attachment: wmResult.buffer, name: file.name });
                } else {
                    result.push(file);
                }
            }
            continue;
        }

        // ─────────────── VISUAL (LOGO) OVERLAY PATH ───────────────
        if (hasVisualOverlay && watermarkConfig) {
            if (Buffer.isBuffer(file.attachment)) {
                try {
                    const metadata = await sharp(file.attachment).metadata();
                    const srcW = metadata.width || 0;
                    const srcH = metadata.height || 0;

                    // Fetch watermark
                    const wm = await fetchWatermarkBuffer(watermarkConfig.imageUrl);
                    if (!wm || srcW < wm.width || srcH < wm.height) {
                        result.push(file); // Fallback
                        continue;
                    }

                    const { top, left } = resolvePosition(
                        watermarkConfig.position,
                        srcW, srcH,
                        wm.width, wm.height
                    );

                    // Apply Opacity if needed
                    let overlayBuffer = wm.buffer;
                    const opacity = watermarkConfig.opacity ?? 100;

                    if (opacity < 100 && opacity >= 0) {
                        const alpha = Math.round((opacity / 100) * 255);
                        overlayBuffer = await sharp(wm.buffer)
                            .ensureAlpha()
                            .composite([{
                                input: Buffer.from([255, 255, 255, alpha]),
                                raw: { width: 1, height: 1, channels: 4 },
                                tile: true,
                                blend: 'dest-in'
                            }])
                            .toBuffer();
                    }

                    const composited = await sharp(file.attachment)
                        .composite([{ input: overlayBuffer, top, left }])
                        .toBuffer();

                    result.push({ attachment: composited, name: file.name });

                    logger.debug({ fn: 'processAttachmentsWithWatermark', filename: file.name },
                        'Visual watermark applied to pre-processed buffer');
                } catch (err: any) {
                    logger.warn({ fn: 'processAttachmentsWithWatermark', filename: file.name, error: err.message },
                        'Watermark on buffer failed — using original buffer');
                    result.push(file);
                }
            } else {
                // URL path: full fetch + visual composite pipeline
                const wmResult = await applyVisualWatermark(
                    file.attachment,
                    watermarkConfig,
                    file.name
                );

                if (wmResult.applied && wmResult.buffer) {
                    result.push({ attachment: wmResult.buffer, name: file.name });
                } else {
                    result.push(file);
                }
            }
            continue;
        }

        // Fallback: no processing matched
        result.push(file);
    }

    return result;
}
