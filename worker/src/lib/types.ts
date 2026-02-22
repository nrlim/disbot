
export interface MirrorActiveConfig {
    id: string;
    sourcePlatform: 'DISCORD' | 'TELEGRAM';

    // Discord fields
    sourceChannelId: string; // Can be empty for Telegram
    userToken?: string;      // Can be null for Telegram

    // Telegram fields
    telegramSession?: string;
    telegramChatId?: string;
    telegramTopicId?: string;
    telegramAccountId?: string;

    targetWebhookUrl?: string;
    /** Mirror type determines forwarding strategy (Discord only currently) */
    type: 'CUSTOM_HOOK' | 'MANAGED_BOT';
    /** Target channel ID — only used for MANAGED_BOT */
    targetChannelId?: string;
    /** Owner's plan — controls media forwarding eligibility & size limits */
    userPlan: string;
    /** Owner's userId — for path-limit grouping */
    userId: string;
    // Display names
    sourceChannelName?: string;
    targetWebhookName?: string;
    // Branding
    customWatermark?: string;
    watermarkType?: 'TEXT' | 'VISUAL';
    watermarkImageUrl?: string;
    watermarkPosition?: string;
    watermarkOpacity?: number;
    brandColor?: string;
    // Privacy — Blur regions (Elite only)
    blurRegions?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    // New fields for D2T/T2T
    targetTelegramChatId?: string;
    targetTelegramTopicId?: string;
}

export interface TelegramConfig {
    id: string;
    telegramSession?: string;
    telegramChatId?: string; // Source Chat ID (for listener matching)
    telegramTopicId?: string; // Source Topic ID (for listener matching)
    targetWebhookUrl?: string; // Optional if targeting Telegram
    // New Target Fields
    targetTelegramChatId?: string;
    targetTelegramTopicId?: string;

    customWatermark?: string;
    watermarkType?: 'TEXT' | 'VISUAL';
    watermarkImageUrl?: string;
    watermarkPosition?: string;
    watermarkOpacity?: number; // 0-100
    brandColor?: string;
    blurRegions?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    sourceChannelName?: string; // For diagnostic logging
}
