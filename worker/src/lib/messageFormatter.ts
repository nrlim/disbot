
import { EmbedBuilder } from 'discord.js';

export interface FormattedMessage {
    username: string;
    avatarURL?: string;
    content: string;
    embeds?: any[];
}

/**
 * Metadata extracted from a Telegram reply message.
 * Passed to formatReplyContext for clean separation of concerns.
 */
export interface ReplyMeta {
    authorName: string;
    snippet: string | null;
    mediaType: 'photo' | 'video' | 'document' | 'sticker' | 'voice' | 'audio' | 'animation' | null;
}

/**
 * Metadata extracted from a forwarded Telegram message.
 */
export interface ForwardMeta {
    sourceName: string;
}

export class MessageFormatter {
    /**
     * Formats a message for delivery via Discord Webhook.
     * 
     * STRATEGY:
     * - Main Content: Goes into 'content' field (clean text).
     * - Branding: Goes into a small footer Embed or side-color.
     * - Meta (Reply/Forward): Prepended to content with blockquotes or markdown.
     */

    public static formatTelegramMessage(
        content: string,
        sourceStartLink: string,
        user: { name: string; avatarUrl?: string; avatarAttachmentName?: string },
        config: { customWatermark?: string; brandColor?: string; cleanMode?: boolean } // cleanMode logic TBD
    ): FormattedMessage {

        // 1. Branding Logic
        // If config.customWatermark is empty -> "via Telegram" (Default)
        // If config.customWatermark is " " (space) -> Clean Mode (hidden)
        // If config.customWatermark is "MyBrand" -> "via MyBrand"

        let footerText = "via Telegram";

        // Handle "Remove Watermark" scenario (empty string) vs "Custom Brand"
        if (config.customWatermark !== undefined && config.customWatermark !== null) {
            if (config.customWatermark.trim() === "") {
                footerText = "";
            } else {
                footerText = config.customWatermark.startsWith("via ")
                    ? config.customWatermark
                    : `via ${config.customWatermark}`;
            }
        }

        // Color Logic with Safety
        let embedColor = 0x0088cc; // Default Telegram Blue
        if (config.brandColor && /^#[0-9A-F]{6}$/i.test(config.brandColor)) {
            embedColor = parseInt(config.brandColor.replace('#', ''), 16);
        }

        const embeds: any[] = [];

        // Always create embed for the "Open Original Message" link even if watermark is gone?
        // Or should we hide the embed entirely if clean mode?
        // User asked: "Place the original message in the 'description' or 'content' field... 
        // using a Discord Embed for the watermark/branding." 

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTimestamp();

        // ─── NEW: Set Author using Avatar Attachment ───
        // This ensures the Telegram User's profile is visible even if Webhook Avatar checks fail
        if (user.avatarAttachmentName) {
            embed.setAuthor({
                name: user.name,
                iconURL: `attachment://${user.avatarAttachmentName}`
            });
        } else {
            // Fallback to text name or standard URL if available
            embed.setAuthor({
                name: user.name,
                iconURL: user.avatarUrl
            });
        }

        if (footerText) {
            embed.setFooter({
                text: footerText,
                // Only show Telegram icon if default, otherwise custom usually doesn't have icon URL passed here yet
                iconURL: footerText === "via Telegram" ? 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/1024px-Telegram_logo.svg.png' : undefined
            });
        }

        // Use a clickable Title for the source link (Cleaner UI)
        embed.setTitle('Jump to Original Message ↗');
        embed.setURL(sourceStartLink);

        embeds.push(embed.toJSON());

        // 4. Content Formatting
        // Remove markdown clutter if needed, but usually we keep it.
        // User requesting: "Place the original message in the 'description' or 'content' field"
        // BEST PRACTICE: Real message in 'content' to allow standard Discord rendering (emoji, mentions clean).
        // Embed is purely decorative/meta.

        return {
            username: user.name,
            avatarURL: user.avatarUrl,
            // Add a trailing newline to separate text from the embed watermark
            content: content ? content + "\n" : content,
            embeds: embeds    // The branding & link
        };
    }

    // ────────────── REPLY FORMATTING ──────────────

    /** Max characters for the reply snippet before truncation */
    private static readonly REPLY_SNIPPET_MAX = 100;

    /**
     * Maps raw Telegram media class names to user-friendly labels.
     */
    private static readonly MEDIA_LABELS: Record<string, string> = {
        photo: '📷 Photo',
        video: '📹 Video',
        document: '📄 Document',
        sticker: '🎨 Sticker',
        voice: '🎙️ Voice Message',
        audio: '🎵 Audio',
        animation: '🎞️ GIF',
    };

    /**
     * Detects the media type from a Telegram message's media object.
     * Returns a specific type key or null if no recognized media is present.
     */
    public static detectMediaType(media: any): ReplyMeta['mediaType'] {
        if (!media) return null;
        const className = media.className?.toLowerCase() || '';
        if (className.includes('photo')) return 'photo';
        if (className.includes('gif') || className.includes('animation')) return 'animation';
        if (className.includes('video')) return 'video';
        if (className.includes('sticker')) return 'sticker';
        if (className.includes('voice')) return 'voice';
        if (className.includes('audio')) return 'audio';
        if (className.includes('document')) return 'document';
        // Some media types wrap in MessageMediaXxx
        if (media.photo) return 'photo';
        if (media.document) {
            const attrs = media.document.attributes || [];
            for (const attr of attrs) {
                const attrClass = attr.className?.toLowerCase() || '';
                if (attrClass.includes('video')) return 'video';
                if (attrClass.includes('audio')) return 'audio';
                if (attrClass.includes('sticker')) return 'sticker';
                if (attrClass.includes('animated')) return 'animation';
            }
            return 'document';
        }
        return null;
    }

    /**
     * Formats a reply context block for Discord rendering.
     *
     * Output example (Discord blockquote style):
     *   > 💬 **OriginalUser:**
     *   > _This is the original message text that was replied to..._
     *
     * - Text is truncated at 100 characters with "…"
     * - Media-only replies show a specific label like [📷 Photo]
     * - Mixed (text + media) shows the text snippet + media label
     */
    public static formatReplyContext(meta: ReplyMeta): string {
        const { authorName, snippet, mediaType } = meta;

        // Build the content portion
        let contentPart = '';

        const mediaLabel = mediaType ? MessageFormatter.MEDIA_LABELS[mediaType] || '📎 Media' : null;

        if (snippet && snippet.trim().length > 0) {
            // Truncate and sanitize the snippet
            const clean = snippet.replace(/\n/g, ' ').trim();
            const truncated = clean.length > MessageFormatter.REPLY_SNIPPET_MAX
                ? clean.substring(0, MessageFormatter.REPLY_SNIPPET_MAX) + '…'
                : clean;
            contentPart = `_${truncated}_`;

            // If there's ALSO media, append the label
            if (mediaLabel) {
                contentPart += ` [${mediaLabel}]`;
            }
        } else if (mediaLabel) {
            // Media-only reply (no text)
            contentPart = `[${mediaLabel}]`;
        } else {
            contentPart = '_[Message]_';
        }

        // Discord blockquote format for visual hierarchy
        return `> 💬 **${authorName}:**\n> ${contentPart}\n`;
    }

    /**
     * Formats a forward context header for Discord rendering.
     *
     * Output example (Discord small text):
     *   -# 📨 Forwarded from **SourceName**
     */
    public static formatForwardContext(meta: ForwardMeta): string {
        return `-# 📨 Forwarded from **${meta.sourceName}**\n`;
    }
}
