
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

    targetWebhookUrl: string;
    /** Mirror type determines forwarding strategy (Discord only currently) */
    type: 'CUSTOM_HOOK' | 'MANAGED_BOT';
    /** Target channel ID — only used for MANAGED_BOT */
    targetChannelId?: string;
    /** Owner's plan — controls media forwarding eligibility & size limits */
    userPlan: string;
    /** Owner's userId — for path-limit grouping */
    userId: string;
}

export interface TelegramConfig {
    id: string;
    telegramSession?: string;
    telegramChatId?: string;
    telegramTopicId?: string;
    targetWebhookUrl: string;
}
