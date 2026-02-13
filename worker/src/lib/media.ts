import { logger } from './logger';

// ──────────────────────────────────────────────────────────────
//  Supported MIME types & extensions
// ──────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.avif']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv', '.flv']);
const DOCUMENT_EXTENSIONS = new Set([
    '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
    '.zip', '.rar', '.7z', '.tar', '.gz',
    '.txt', '.csv', '.json', '.xml'
]);

const AUDIO_MIMES = new Set([
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac',
    'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/x-ms-wma',
    'audio/opus', 'audio/webm', 'audio/x-wav'
]);

const VIDEO_MIMES = new Set([
    'video/mp4', 'video/quicktime', 'video/webm',
    'video/x-msvideo', 'video/x-matroska', 'video/x-flv',
    'video/mpeg', 'video/ogg'
]);

const DOCUMENT_MIMES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    'application/x-tar', 'application/gzip',
    'text/plain', 'text/csv', 'application/json', 'application/xml'
]);

// ──────────────────────────────────────────────────────────────
//  File size limits (in bytes)
// ──────────────────────────────────────────────────────────────

/** Default 25 MB limit — safe for Boost Level 2+ guilds and most webhooks */
const DEFAULT_FILE_SIZE_LIMIT = 25 * 1024 * 1024;
/** Strict 8 MB limit for free-tier / unboosted guilds */
const STRICT_FILE_SIZE_LIMIT = 8 * 1024 * 1024;

// Per-plan file size limits — FREE/Starter gets 8 MB, Pro/Elite get 25 MB
const PLAN_FILE_SIZE_LIMITS: Record<string, number> = {
    FREE: STRICT_FILE_SIZE_LIMIT,
    STARTER: STRICT_FILE_SIZE_LIMIT,
    PRO: DEFAULT_FILE_SIZE_LIMIT,
    ELITE: DEFAULT_FILE_SIZE_LIMIT,
};

// ──────────────────────────────────────────────────────────────
//  Per-Plan MIME-type Allowlists
//  Starter: image/* + audio/*
//  Pro:     image/* + audio/* + video/* + documents
//  Elite:   everything (no restriction)
// ──────────────────────────────────────────────────────────────

type MediaCategory = 'audio' | 'video' | 'document' | 'image' | 'unknown';
export type MediaStrategy = 'SNAPSHOT' | 'REJECT';

/**
 * Categories each plan tier is allowed to forward.
 * 'unknown' is never allowed for any plan — it's rejected at the category level.
 */
const PLAN_ALLOWED_CATEGORIES: Record<string, Set<MediaCategory>> = {
    FREE: new Set(['image']),                                          // FREE: images only
    STARTER: new Set(['image']),                                       // Starter: images only (Audio removed as per strategy)
    PRO: new Set(['image', 'audio', 'video']),                         // Pro: images+audio+video (Docs removed as per strategy)
    ELITE: new Set(['image', 'audio', 'video', 'document', 'unknown']), // Elite: everything
};

// ──────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────

export type { MediaCategory };

export interface ParsedAttachment {
    /** Discord CDN URL */
    url: string;
    /** Discord proxy URL — used for SNAPSHOT strategy (no download required) */
    proxyUrl: string;
    /** Original filename */
    name: string;
    /** Size in bytes */
    size: number;
    /** MIME / Content-Type as reported by Discord */
    contentType: string | null;
    /** Resolved media category */
    category: MediaCategory;
    /** True if the file is a Discord voice message */
    isVoiceMessage: boolean;
    /** Forwarding strategy determined by category & plan */
    strategy: MediaStrategy;
}

export interface MediaForwardResult {
    /** Attachments that passed all checks and can be forwarded */
    eligible: ParsedAttachment[];
    /** Attachments that were rejected with the reason */
    rejected: { attachment: ParsedAttachment; reason: string }[];
}

// ──────────────────────────────────────────────────────────────
//  Category detection
// ──────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    if (idx === -1) return '';
    return filename.slice(idx).toLowerCase();
}

/**
 * Determines the media category using both MIME type and file extension.
 * Extension is used as a fallback when MIME is missing or generic.
 */
export function categoriseAttachment(name: string, contentType: string | null): MediaCategory {
    const ext = getExtension(name);

    // Check content-type header first (most reliable)
    if (contentType) {
        const mime = contentType.toLowerCase().split(';')[0].trim();
        if (mime.startsWith('image/')) return 'image';
        if (AUDIO_MIMES.has(mime)) return 'audio';
        if (VIDEO_MIMES.has(mime)) return 'video';
        if (DOCUMENT_MIMES.has(mime)) return 'document';
        // Fallback: generic audio/* or video/* MIME types
        if (mime.startsWith('audio/')) return 'audio';
        if (mime.startsWith('video/')) return 'video';
    }

    // Fallback to extension
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
    if (VIDEO_EXTENSIONS.has(ext)) return 'video';
    if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';

    return 'unknown';
}

/**
 * Determines the forwarding strategy based on category.
 * 
 * Strategy 1: Images & Videos -> SNAPSHOT (Forward URL, wrap in Embed)
 * Strategy 2: Audio & Documents -> SNAPSHOT (Forward URL, wrap in Embed)
 */
export function getMediaStrategy(category: MediaCategory): MediaStrategy {
    switch (category) {
        case 'image':
        case 'video':
        case 'audio':
        case 'document':
            return 'SNAPSHOT';
        default:
            return 'REJECT'; // Unknown types are rejected or treated as documents if allowed
    }
}

// ──────────────────────────────────────────────────────────────
//  Attachment parsing
// ──────────────────────────────────────────────────────────────

/**
 * Parses raw Discord attachment Collection into structured metadata.
 * Handles both regular attachments and voice messages.
 */
export function parseAttachments(attachments: any, messageFlags?: any): ParsedAttachment[] {
    if (!attachments) return [];

    // Support both Collection (Map-like) and Array
    const isCollection = typeof attachments.size === 'number' && typeof attachments.entries === 'function';
    const isEmpty = isCollection ? attachments.size === 0 : (Array.isArray(attachments) && attachments.length === 0);

    if (isEmpty) return [];

    const parsed: ParsedAttachment[] = [];

    // Check if the message is a voice message (flag 1 << 13 = 8192)
    const isVoice = messageFlags?.has?.(1 << 13) ?? false;

    // Normalize iteration: if Map/Collection, use .values(); if Array, use valid iterator
    const iterator = isCollection ? attachments.values() : attachments;

    for (const att of iterator) {
        if (!att) continue;

        const name = att.name || 'unknown';
        const contentType: string | null = att.contentType ?? null;
        const category = categoriseAttachment(name, contentType);

        parsed.push({
            url: att.url,
            proxyUrl: att.proxyURL || att.proxy_url || att.url,
            name,
            size: att.size ?? 0,
            contentType,
            category,
            isVoiceMessage: isVoice && (category === 'audio' || name.endsWith('.ogg')),
            strategy: getMediaStrategy(category)
        });
    }

    return parsed;
}

// ──────────────────────────────────────────────────────────────
//  Plan checks
// ──────────────────────────────────────────────────────────────

/** Plans that are allowed to forward ANY media at all (FREE included for images) */
const MEDIA_ALLOWED_PLANS = new Set(['FREE', 'STARTER', 'PRO', 'ELITE']);

/**
 * Checks if the user's plan allows media forwarding at all.
 * All plans now allow at least basic image forwarding.
 * The per-category filtering in validateMediaForwarding() handles
 * restricting non-image media for lower-tier plans.
 */
export function isMediaForwardingAllowed(plan: string): boolean {
    return MEDIA_ALLOWED_PLANS.has(plan);
}

/**
 * Returns the per-file size limit (in bytes) for a given plan.
 */
export function getFileSizeLimit(plan: string): number {
    return PLAN_FILE_SIZE_LIMITS[plan] ?? STRICT_FILE_SIZE_LIMIT;
}

// ──────────────────────────────────────────────────────────────
//  validateMediaForwarding — Core MIME-type Middleware
//
//  The single entry point for all plan-aware attachment filtering.
//  Replaces the old filterAttachments().
//
//  Decision matrix:
//  ┌─────────┬─────────┬─────────┬──────────┬──────────┐
//  │  Plan   │ image/* │ audio/* │ video/*  │ docs/etc │
//  ├─────────┼─────────┼─────────┼──────────┼──────────┤
//  │ FREE    │    ✓    │    ✗    │    ✗     │    ✗     │
//  │ STARTER │    ✓    │    ✗    │    ✗     │    ✗     │
//  │ PRO     │    ✓    │    ✓    │    ✓     │    ✗     │
//  │ ELITE   │    ✓    │    ✓    │    ✓     │    ✓     │
//  └─────────┴─────────┴─────────┴──────────┴──────────┘
// ──────────────────────────────────────────────────────────────

/**
 * Middleware function that validates each attachment against
 * the user's plan tier. Applies three layers of filtering:
 * 
 *  1. **Plan-level gate** — FREE users get nothing.
 *  2. **MIME-type / category allowlist** — per plan (see matrix above).
 *  3. **File-size limit** — per plan (8 MB Starter, 25 MB Pro/Elite).
 * 
 * When a file is blocked, the text message is still forwarded;
 * only the attachment is skipped with a descriptive log entry.
 * 
 * @param attachments - Parsed attachments from `parseAttachments()`
 * @param userPlan    - The user's current plan: FREE | STARTER | PRO | ELITE
 * @returns MediaForwardResult with eligible and rejected arrays
 */
export function validateMediaForwarding(
    attachments: ParsedAttachment[],
    userPlan: string
): MediaForwardResult {
    const eligible: ParsedAttachment[] = [];
    const rejected: MediaForwardResult['rejected'] = [];

    // ── Layer 1: Plan-level gate ──
    if (!isMediaForwardingAllowed(userPlan)) {
        return {
            eligible: [],
            rejected: attachments.map(att => ({
                attachment: att,
                reason: `Media forwarding requires Starter plan or above (current: ${userPlan})`
            }))
        };
    }

    const allowedCategories = PLAN_ALLOWED_CATEGORIES[userPlan] ?? PLAN_ALLOWED_CATEGORIES.STARTER;
    const sizeLimit = getFileSizeLimit(userPlan);

    for (const att of attachments) {
        // Special case: Elite users can forward unknown types as Documents
        // We override the strategy to SNAPSHOT for unknown types on Elite plan
        if (userPlan === 'ELITE' && att.category === 'unknown') {
            att.strategy = 'SNAPSHOT';
            att.category = 'document'; // Treat as document for passing allowlist
        }

        // ── Layer 2: MIME-type / category check ──
        // Only check against allowed categories if not Elite (Elite allows everything)
        // Note: We already re-categorized 'unknown' to 'document' for Elite above, but strictly:
        if (userPlan !== 'ELITE') {
            if (!allowedCategories.has(att.category)) {
                const reason = `Feature not supported in your plan: ${att.category} files blocked on ${userPlan} plan (${att.name})`;
                rejected.push({ attachment: att, reason });

                logger.info({
                    fileName: att.name,
                    category: att.category,
                    contentType: att.contentType,
                    plan: userPlan,
                }, `Media skipped — ${att.category} not allowed on ${userPlan} plan`);

                continue;
            }
        }

        // ── Layer 3: File-size limit ──
        if (att.size > sizeLimit) {
            const limitMB = (sizeLimit / (1024 * 1024)).toFixed(0);
            const fileMB = (att.size / (1024 * 1024)).toFixed(2);
            const reason = `File too large: ${att.name} is ${fileMB} MB (limit: ${limitMB} MB for ${userPlan} plan)`;
            rejected.push({ attachment: att, reason });

            logger.warn({
                fileName: att.name,
                fileSize: att.size,
                limit: sizeLimit,
                plan: userPlan,
                category: att.category,
            }, `Failed to forward ${att.category}: File too large`);

            continue;
        }

        eligible.push(att);
    }

    return { eligible, rejected };
}

/**
 * @deprecated Use `validateMediaForwarding()` instead. Kept for backward
 * compatibility but internally delegates to the new function.
 */
export function filterAttachments(
    attachments: ParsedAttachment[],
    plan: string
): MediaForwardResult {
    return validateMediaForwarding(attachments, plan);
}


/**
 * Generates a human-readable summary line when some files were rejected.
 * Appended to the forwarded message content so operators know what was skipped.
 */
export function buildRejectionNotice(rejected: MediaForwardResult['rejected']): string {
    if (rejected.length === 0) return '';

    const lines = rejected.map(r => `⚠️ ${r.reason}`);
    return `\n-# ${lines.join('\n-# ')}`;
}
