
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import { TelegramListener } from './telegramMTProto';
import { logger } from './logger';
import { MirrorActiveConfig, TelegramConfig } from './types';
import path from 'path';

export class TelegramDeliveryService {
    private static instance: TelegramDeliveryService;

    private constructor() { }

    public static getInstance(): TelegramDeliveryService {
        if (!TelegramDeliveryService.instance) {
            TelegramDeliveryService.instance = new TelegramDeliveryService();
        }
        return TelegramDeliveryService.instance;
    }

    /**
     * Entry point for delivering content to a Telegram Destination.
     * Supports both D2T and T2T flows.
     */
    public async deliver(
        config: MirrorActiveConfig | TelegramConfig,
        content: string,
        files: { attachment: Buffer | string; name: string }[],
        meta?: {
            avatarURL?: string;
            username?: string;
            embeds?: any[];
        }
    ): Promise<void> {
        const sessionString = config.telegramSession; // Currently maps to 'targetTelegramChatId' via linked account logic
        const targetChatId = config.targetTelegramChatId;
        const targetTopicId = config.targetTelegramTopicId;

        if (!sessionString || !targetChatId) {
            logger.warn({
                configId: config.id,
                hasSession: !!sessionString,
                hasTarget: !!targetChatId
            }, '[Telegram Delivery] Missing session or target chat ID');
            return;
        }

        // 1. Get Client (Reuse existing session or connect new one)
        // We use the Listener singleton to manage connections to avoid duplication
        const client = await TelegramListener.getInstance().getOrConnectClient(sessionString);

        if (!client || !client.connected) {
            logger.error({ configId: config.id }, '[Telegram Delivery] Failed to get active Telegram client');
            return;
        }

        // 2. Format Content (Embeds -> Markdown)
        let messageText = content;
        if (meta?.embeds && meta.embeds.length > 0) {
            const embedText = this.convertEmbedsToMarkdown(meta.embeds);
            if (messageText) {
                messageText += '\n\n' + embedText;
            } else {
                messageText = embedText;
            }
        }

        // Add User Attribution if D2T
        if ('sourcePlatform' in config && config.sourcePlatform === 'DISCORD' && meta?.username) {
            const attribution = `**${meta.username}** via Discord`;
            messageText = `${attribution}\n${messageText}`;
        }

        // 3. Send Logic
        try {
            const entity = await client.getEntity(targetChatId).catch(() => null);
            if (!entity) {
                logger.warn({ targetChatId }, '[Telegram Delivery] Could not resolve target chat entity');
                return;
            }

            // Prepare Send Options
            const sendParams: any = {
                message: messageText,
            };

            if (targetTopicId) {
                // Determine if it's a forum topic reply
                // In Telegram API, replyTo is usually enough for topics
                sendParams.replyTo = parseInt(targetTopicId);
            }

            // Handle Media
            if (files && files.length > 0) {
                // Telegram sendFile can handle arrays (albums)
                // We need to map our simple file structure to what Telegram expects
                // TelegramClient.sendFile accepts 'file' which can be a buffer or list of buffers

                const fileList = files.map(f => {
                    // Start of buffer check
                    if (Buffer.isBuffer(f.attachment)) {
                        return new CustomFile(f.name, f.attachment.length, '', f.attachment);
                    }
                    return f.attachment; // String URL? Telegram client supports URLs too
                });

                sendParams.file = fileList.length === 1 ? fileList[0] : fileList;

                // If pure text was empty but we have files, ensure message can send
                if (!messageText && fileList.length > 0) {
                    sendParams.message = ''; // Caption
                }
            }

            // Fire and forget? No, we await to catch errors logger
            await client.sendMessage(entity, sendParams);

            logger.info({
                configId: config.id,
                targetChatId,
                fileCount: files.length
            }, '[Telegram Delivery] Message sent successfully');

        } catch (err: any) {
            logger.error({
                configId: config.id,
                error: err.message,
                targetChatId
            }, '[Telegram Delivery] Failed to send message');
        }
    }

    /**
     * Converts Discord Embeds to Telegram-friendly MarkdownV2/HTML.
     * Simple implementation.
     */
    private convertEmbedsToMarkdown(embeds: any[]): string {
        return embeds.map(embed => {
            let text = '';

            if (embed.title) text += `**${embed.title}**\n`;
            if (embed.description) text += `${embed.description}\n`;

            if (embed.fields) {
                embed.fields.forEach((field: any) => {
                    text += `\n**${field.name}**\n${field.value}`;
                });
            }

            if (embed.footer?.text) {
                text += `\n_${embed.footer.text}_`;
            }

            return text;
        }).join('\n\n--- \n\n');
    }
}
