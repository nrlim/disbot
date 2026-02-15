
import { EmbedBuilder } from 'discord.js';

export interface FormattedMessage {
    username: string;
    avatarURL?: string;
    content: string;
    embeds?: any[];
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
        user: { name: string; avatarUrl?: string },
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
}
