
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import { TelegramListener } from './telegramMTProto';
import { logger } from './logger';
import { MirrorActiveConfig, TelegramConfig } from './types';
import path from 'path';

// ──────────────────────────────────────────────────────────────
//  Retry Queue Constants (Memory-safe for 68MB heap VPS)
// ──────────────────────────────────────────────────────────────

/** Max queued messages to prevent OOM. Text-only items are tiny, but buffered files can be large. */
const MAX_QUEUE_SIZE = 30;

/** Max retry attempts per message before permanent drop */
const MAX_RETRIES = 3;

/** Messages older than this are stale and should be discarded (5 minutes) */
const MESSAGE_TTL_MS = 5 * 60 * 1000;

/** How often the retry flush runs (15 seconds — half of the engine sync interval) */
const FLUSH_INTERVAL_MS = 15_000;

/** Max file payload size we'll queue (5MB). Larger payloads are dropped to protect memory. */
const MAX_QUEUED_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// ──────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────

interface QueuedDelivery {
    /** Unique delivery ID for logging */
    id: string;
    /** The session string needed to get the TelegramClient */
    sessionString: string;
    /** Target chat ID */
    targetChatId: string;
    /** Target topic ID (forum threads) */
    targetTopicId?: string;
    /** Pre-formatted message text (already includes embeds/attribution) */
    messageText: string;
    /** Files to send. Only kept if total payload is under MAX_QUEUED_FILE_SIZE_BYTES. */
    files: { attachment: Buffer | string; name: string }[];
    /** Config ID for logging */
    configId: string;
    /** Timestamp when this delivery was first attempted */
    createdAt: number;
    /** How many times we've retried this delivery */
    retryCount: number;
}

// ──────────────────────────────────────────────────────────────
//  Service
// ──────────────────────────────────────────────────────────────

export class TelegramDeliveryService {
    private static instance: TelegramDeliveryService;

    /** Pending deliveries waiting for the TelegramClient to reconnect */
    private retryQueue: QueuedDelivery[] = [];

    /** Flush timer reference for cleanup on shutdown */
    private flushTimer: NodeJS.Timeout | null = null;

    private constructor() {
        // Start the background flush loop
        this.startFlushLoop();
    }

    public static getInstance(): TelegramDeliveryService {
        if (!TelegramDeliveryService.instance) {
            TelegramDeliveryService.instance = new TelegramDeliveryService();
        }
        return TelegramDeliveryService.instance;
    }

    // ────────────── PUBLIC API ──────────────

    /**
     * Entry point for delivering content to a Telegram Destination.
     * Supports both D2T and T2T flows.
     * If the client is temporarily unavailable, the message is queued for retry.
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
        const sessionString = config.telegramSession;
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

        // Pre-format the message text (embeds + attribution) so we don't need to keep config/meta references in the queue
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

        // Try immediate delivery
        const client = await TelegramListener.getInstance().getOrConnectClient(sessionString);

        if (client && client.connected) {
            // Client available — send immediately
            const success = await this.sendToTelegram(client, targetChatId, targetTopicId, messageText, files, config.id);
            if (success) return; // Done!
            // If sendToTelegram returned false (network error during send), fall through to queue
        }

        // Client unavailable or send failed — queue for retry
        this.enqueue({
            sessionString,
            targetChatId,
            targetTopicId,
            messageText,
            files,
            configId: config.id
        });
    }

    /**
     * Shutdown: flush remaining queue items (best-effort) and stop the timer.
     */
    public async shutdown(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }

        // Best-effort final flush
        if (this.retryQueue.length > 0) {
            logger.info({ pending: this.retryQueue.length }, '[Telegram Delivery] Shutdown — attempting final flush');
            await this.flushQueue();
        }

        // Log any permanently dropped messages
        if (this.retryQueue.length > 0) {
            logger.warn({ dropped: this.retryQueue.length }, '[Telegram Delivery] Shutdown — dropped remaining queued messages');
            this.retryQueue = [];
        }
    }

    // ────────────── RETRY QUEUE ──────────────

    private enqueue(params: {
        sessionString: string;
        targetChatId: string;
        targetTopicId?: string;
        messageText: string;
        files: { attachment: Buffer | string; name: string }[];
        configId: string;
    }): void {
        // Calculate total file payload size
        const totalFileSize = params.files.reduce((sum, f) => {
            if (Buffer.isBuffer(f.attachment)) return sum + f.attachment.length;
            return sum; // String URLs are negligible
        }, 0);

        // If files are too large to buffer safely, queue text-only version
        let queuedFiles = params.files;
        if (totalFileSize > MAX_QUEUED_FILE_SIZE_BYTES) {
            logger.warn({
                configId: params.configId,
                fileSize: totalFileSize,
                maxSize: MAX_QUEUED_FILE_SIZE_BYTES
            }, '[Telegram Delivery] Files too large to queue — will retry text-only');
            queuedFiles = [];
        }

        // Evict oldest if queue is full
        if (this.retryQueue.length >= MAX_QUEUE_SIZE) {
            const evicted = this.retryQueue.shift()!;
            logger.warn({
                evictedId: evicted.id,
                evictedConfigId: evicted.configId,
                queueSize: this.retryQueue.length
            }, '[Telegram Delivery] Queue full — evicting oldest message');
        }

        const delivery: QueuedDelivery = {
            id: `${params.configId}-${Date.now()}`,
            sessionString: params.sessionString,
            targetChatId: params.targetChatId,
            targetTopicId: params.targetTopicId,
            messageText: params.messageText,
            files: queuedFiles,
            configId: params.configId,
            createdAt: Date.now(),
            retryCount: 0
        };

        this.retryQueue.push(delivery);

        logger.info({
            deliveryId: delivery.id,
            configId: params.configId,
            targetChatId: params.targetChatId,
            queueSize: this.retryQueue.length,
            hasFiles: queuedFiles.length > 0
        }, '[Telegram Delivery] Message queued for retry — client temporarily unavailable');
    }

    private startFlushLoop(): void {
        this.flushTimer = setInterval(() => {
            if (this.retryQueue.length === 0) return;
            this.flushQueue().catch((err: any) => {
                logger.error({ error: err?.message }, '[Telegram Delivery] Flush loop error');
            });
        }, FLUSH_INTERVAL_MS);
    }

    private async flushQueue(): Promise<void> {
        if (this.retryQueue.length === 0) return;

        const now = Date.now();

        // 1. Prune expired messages first
        const beforePrune = this.retryQueue.length;
        this.retryQueue = this.retryQueue.filter(item => {
            if (now - item.createdAt > MESSAGE_TTL_MS) {
                logger.warn({
                    deliveryId: item.id,
                    configId: item.configId,
                    ageMs: now - item.createdAt
                }, '[Telegram Delivery] Dropping expired queued message (TTL exceeded)');
                return false;
            }
            if (item.retryCount >= MAX_RETRIES) {
                logger.warn({
                    deliveryId: item.id,
                    configId: item.configId,
                    retries: item.retryCount
                }, '[Telegram Delivery] Dropping queued message (max retries exceeded)');
                return false;
            }
            return true;
        });

        if (beforePrune !== this.retryQueue.length) {
            logger.info({
                pruned: beforePrune - this.retryQueue.length,
                remaining: this.retryQueue.length
            }, '[Telegram Delivery] Pruned expired/exhausted queue items');
        }

        if (this.retryQueue.length === 0) return;

        // 2. Group by session string to avoid redundant getOrConnectClient calls
        const bySession = new Map<string, QueuedDelivery[]>();
        for (const item of this.retryQueue) {
            if (!bySession.has(item.sessionString)) bySession.set(item.sessionString, []);
            bySession.get(item.sessionString)!.push(item);
        }

        const successIds = new Set<string>();

        for (const [sessionString, items] of bySession) {
            // Try to get the client for this session
            const client = await TelegramListener.getInstance().getOrConnectClient(sessionString);

            if (!client || !client.connected) {
                // Client still unavailable — increment retry count and skip
                for (const item of items) {
                    item.retryCount++;
                }
                logger.debug({
                    session: sessionString.substring(0, 10) + '...',
                    pendingCount: items.length
                }, '[Telegram Delivery] Client still unavailable — will retry next cycle');
                continue;
            }

            // Client is back! Process all pending deliveries for this session
            logger.info({
                session: sessionString.substring(0, 10) + '...',
                count: items.length
            }, '[Telegram Delivery] Client reconnected — flushing queued messages');

            for (const item of items) {
                const success = await this.sendToTelegram(
                    client,
                    item.targetChatId,
                    item.targetTopicId,
                    item.messageText,
                    item.files,
                    item.configId
                );

                if (success) {
                    successIds.add(item.id);
                    logger.info({
                        deliveryId: item.id,
                        configId: item.configId,
                        retryCount: item.retryCount
                    }, '[Telegram Delivery] Queued message delivered successfully');
                } else {
                    item.retryCount++;
                    // If client dropped again mid-flush, stop processing this session
                    if (!client.connected) {
                        logger.warn({
                            session: sessionString.substring(0, 10) + '...'
                        }, '[Telegram Delivery] Client dropped mid-flush — stopping session flush');
                        break;
                    }
                }
            }
        }

        // 3. Remove successfully delivered items
        if (successIds.size > 0) {
            this.retryQueue = this.retryQueue.filter(item => !successIds.has(item.id));
            logger.info({
                delivered: successIds.size,
                remaining: this.retryQueue.length
            }, '[Telegram Delivery] Queue flush complete');
        }
    }

    // ────────────── SEND LOGIC ──────────────

    /**
     * Attempts to send a message to Telegram. Returns true on success, false on failure.
     */
    private async sendToTelegram(
        client: any,
        targetChatId: string,
        targetTopicId: string | undefined,
        messageText: string,
        files: { attachment: Buffer | string; name: string }[],
        configId: string
    ): Promise<boolean> {
        try {
            const entity = await client.getEntity(targetChatId).catch(() => null);
            if (!entity) {
                logger.warn({ targetChatId, configId }, '[Telegram Delivery] Could not resolve target chat entity');
                return false;
            }

            // Prepare Send Options
            const sendParams: any = {
                message: messageText,
            };

            if (targetTopicId) {
                sendParams.replyTo = parseInt(targetTopicId);
            }

            // Handle Media
            if (files && files.length > 0) {
                const fileList = files.map(f => {
                    if (Buffer.isBuffer(f.attachment)) {
                        return new CustomFile(f.name, f.attachment.length, '', f.attachment);
                    }
                    return f.attachment; // String URL
                });

                sendParams.file = fileList.length === 1 ? fileList[0] : fileList;

                if (!messageText && fileList.length > 0) {
                    sendParams.message = ''; // Caption
                }
            }

            await client.sendMessage(entity, sendParams);

            logger.info({
                configId,
                targetChatId,
                fileCount: files.length
            }, '[Telegram Delivery] Message sent successfully');

            return true;

        } catch (err: any) {
            logger.error({
                configId,
                error: err.message,
                targetChatId
            }, '[Telegram Delivery] Failed to send message');
            return false;
        }
    }

    // ────────────── HELPERS ──────────────

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
