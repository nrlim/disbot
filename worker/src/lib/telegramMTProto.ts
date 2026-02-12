
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { WebhookClient } from 'discord.js';
import { logger } from './logger';

// ──────────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────────

/** Max time to wait for a single media download (prevents hanging forever) */
const MEDIA_DOWNLOAD_TIMEOUT_MS = 15_000;

/** Max media file size to attempt downloading (8MB safety — Discord webhook limit) */
const MAX_MEDIA_SIZE_BYTES = 8 * 1024 * 1024;

/** Max concurrent media downloads across all sessions (prevents memory pressure) */
const MAX_CONCURRENT_DOWNLOADS = 5;

/** Max retry attempts for webhook delivery */
const MAX_WEBHOOK_RETRIES = 2;

/** Base delay between webhook retries (ms) — exponential backoff */
const WEBHOOK_RETRY_BASE_DELAY_MS = 500;

/** Webhook delivery timeout (ms) */
const WEBHOOK_SEND_TIMEOUT_MS = 15_000;

// ──────────────────────────────────────────────────────────────
//  Types & Interfaces
// ──────────────────────────────────────────────────────────────

export interface TelegramConfig {
    id: string;
    telegramSession?: string;
    telegramChatId?: string;
    telegramTopicId?: string;
    targetWebhookUrl: string;
}

interface ActiveSession {
    client: TelegramClient;
    configs: TelegramConfig[];
    lastActive: number;
}

// ──────────────────────────────────────────────────────────────
//  Concurrency Limiter
//
//  Prevents memory exhaustion when many media downloads happen
//  simultaneously. Uses a simple semaphore pattern.
// ──────────────────────────────────────────────────────────────

class ConcurrencyLimiter {
    private running = 0;
    private queue: (() => void)[] = [];

    constructor(private maxConcurrent: number) { }

    async acquire(): Promise<void> {
        if (this.running < this.maxConcurrent) {
            this.running++;
            return;
        }
        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.running++;
                resolve();
            });
        });
    }

    release(): void {
        this.running--;
        const next = this.queue.shift();
        if (next) next();
    }

    get activeCount(): number {
        return this.running;
    }

    get pendingCount(): number {
        return this.queue.length;
    }
}

// Singleton download limiter
const downloadLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_DOWNLOADS);

// ──────────────────────────────────────────────────────────────
//  Telegram Listener (Singleton)
// ──────────────────────────────────────────────────────────────

export class TelegramListener {
    private static instance: TelegramListener;
    private sessions: Map<string, ActiveSession> = new Map();
    private apiId: number;
    private apiHash: string;
    private isShuttingDown = false;

    private constructor() {
        this.apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
        this.apiHash = process.env.TELEGRAM_API_HASH || '';
        if (!this.apiId || !this.apiHash) {
            logger.error('Missing TELEGRAM_API_ID or TELEGRAM_API_HASH. Telegram listener disabled.');
        }
    }

    public static getInstance(): TelegramListener {
        if (!TelegramListener.instance) {
            TelegramListener.instance = new TelegramListener();
        }
        return TelegramListener.instance;
    }

    // ────────────── SYNC ──────────────

    /**
     * Syncs active configurations with running Telegram MTProto clients.
     * Called by the engine on startup and every 5 minutes.
     */
    public async sync(configs: TelegramConfig[]) {
        if (this.isShuttingDown) return;

        logger.info({ count: configs.length }, 'Syncing Telegram MTProto listeners');

        const activeSessionKeys = new Set<string>();
        const configsByToken = new Map<string, TelegramConfig[]>();

        // 1. Group configs by Session Token
        for (const config of configs) {
            if (!config.telegramSession) continue;

            const token = config.telegramSession;
            if (!configsByToken.has(token)) {
                configsByToken.set(token, []);
            }
            configsByToken.get(token)!.push(config);
        }

        // 2. Start/Update Sessions
        for (const [token, sessionConfigs] of configsByToken) {
            activeSessionKeys.add(token);

            let session = this.sessions.get(token);

            if (!session) {
                logger.info({ configCount: sessionConfigs.length }, 'Starting new Telegram MTProto session');
                try {
                    const client = new TelegramClient(
                        new StringSession(token),
                        this.apiId,
                        this.apiHash,
                        {
                            connectionRetries: 5,
                            useWSS: false,
                        }
                    );

                    await client.connect();

                    if (!await client.checkAuthorization()) {
                        logger.warn({ configCount: sessionConfigs.length }, 'Telegram session invalid or expired — skipping');
                        continue;
                    }

                    // Event handler — fire-and-forget (no await = non-blocking)
                    client.addEventHandler((event: NewMessageEvent) => {
                        if (this.isShuttingDown) return;
                        this.handleNewMessage(event, token).catch((err: any) => {
                            logger.error({ error: err?.message || 'Unknown error' }, 'Unhandled error in Telegram message handler');
                        });
                    }, new NewMessage({}));

                    session = {
                        client,
                        configs: sessionConfigs,
                        lastActive: Date.now()
                    };
                    this.sessions.set(token, session);

                    logger.info('Telegram MTProto session established successfully');

                } catch (error: any) {
                    logger.error({ error: error?.message || 'Unknown error' }, 'Failed to start Telegram MTProto session');
                    continue;
                }
            } else {
                // Update configs for existing session
                session.configs = sessionConfigs;
                session.lastActive = Date.now();
            }
        }

        // 3. Cleanup stale sessions
        for (const [token, session] of this.sessions) {
            if (!activeSessionKeys.has(token)) {
                logger.info('Stopping stale Telegram session');
                await this.destroySession(token, session);
            }
        }
    }

    // ────────────── MESSAGE HANDLER ──────────────

    /**
     * Handles incoming Telegram messages.
     *
     * Design: Non-blocking. Media downloads and webhook deliveries
     * run as fire-and-forget tasks. The event loop is never blocked.
     */
    private async handleNewMessage(event: NewMessageEvent, token: string) {
        const message = event.message;
        if (!message) return;

        const chat = await message.getChat();
        if (!chat) return;

        const session = this.sessions.get(token);
        if (!session) return;

        const chatId = chat.id.toString();

        // ── Match configs by Chat ID ──
        const matchedConfigs = session.configs.filter(c => {
            if (!c.telegramChatId) return false;
            return this.matchChatId(c.telegramChatId, chatId);
        });

        if (matchedConfigs.length === 0) return;

        // ── Filter by Topic ID (Forum support) ──
        const messageTopicId = (message.replyTo as any)?.replyToTopId?.toString() || null;

        const targetConfigs = matchedConfigs.filter(c => {
            if (!c.telegramTopicId) return true; // No filter = accept all
            return c.telegramTopicId === messageTopicId;
        });

        if (targetConfigs.length === 0) return;

        // ── Build sender info ──
        const sender = await message.getSender().catch(() => null);
        const username = this.extractUsername(sender);

        const content = message.text || '';
        const normalizedChatId = chatId.replace(/^-100/, '');
        const sourceLink = `https://t.me/c/${normalizedChatId}/${message.id}`;

        // ── Determine media handling strategy ──
        const mediaInfo = this.analyzeMedia(message);

        if (mediaInfo.shouldDownload) {
            // Fire-and-forget: Download media in background, then forward
            // This does NOT block the event loop for subsequent messages
            this.downloadAndForward(
                message,
                targetConfigs,
                username,
                content,
                sourceLink,
                mediaInfo.fileName
            ).catch((err: any) => {
                logger.error(
                    { error: err?.message || 'Unknown error', chatId: normalizedChatId },
                    'Background media download+forward failed'
                );
            });
        } else {
            // No media — forward text immediately (also non-blocking)
            this.forwardToWebhooks(
                targetConfigs,
                username,
                content,
                sourceLink,
                []
            ).catch((err: any) => {
                logger.error(
                    { error: err?.message || 'Unknown error', chatId: normalizedChatId },
                    'Text forwarding failed'
                );
            });
        }
    }

    // ────────────── MEDIA ANALYSIS ──────────────

    /**
     * Analyzes a message's media to determine if we should download it.
     * Returns metadata without performing any I/O.
     */
    private analyzeMedia(message: any): { shouldDownload: boolean; fileName: string } {
        if (!message.media) {
            return { shouldDownload: false, fileName: '' };
        }

        if (message.photo) {
            return { shouldDownload: true, fileName: 'photo.jpg' };
        }

        if (message.document) {
            const size = message.document.size;

            // Skip files that exceed Discord's webhook limit
            if (size && size > MAX_MEDIA_SIZE_BYTES) {
                logger.debug(
                    { size, limit: MAX_MEDIA_SIZE_BYTES },
                    'Telegram media exceeds size limit — skipping download'
                );
                return { shouldDownload: false, fileName: '' };
            }

            // Extract filename from document attributes
            const attrs = message.document.attributes;
            const filenameAttr = attrs?.find((a: any) => a.fileName);
            const fileName = filenameAttr?.fileName || 'document.dat';

            return { shouldDownload: true, fileName };
        }

        // Stickers, voice notes, etc. — attempt download
        if (message.sticker) {
            return { shouldDownload: true, fileName: 'sticker.webp' };
        }

        if (message.voice || message.audio) {
            const size = (message.voice || message.audio)?.size;
            if (size && size > MAX_MEDIA_SIZE_BYTES) {
                return { shouldDownload: false, fileName: '' };
            }
            return { shouldDownload: true, fileName: message.voice ? 'voice.ogg' : 'audio.mp3' };
        }

        if (message.video || message.videoNote) {
            const size = (message.video || message.videoNote)?.size;
            if (size && size > MAX_MEDIA_SIZE_BYTES) {
                logger.debug({ size }, 'Telegram video exceeds size limit — skipping');
                return { shouldDownload: false, fileName: '' };
            }
            return { shouldDownload: true, fileName: message.videoNote ? 'videonote.mp4' : 'video.mp4' };
        }

        return { shouldDownload: false, fileName: '' };
    }

    // ────────────── DOWNLOAD + FORWARD ──────────────

    /**
     * Downloads media with concurrency limiting and timeout,
     * then forwards to all target webhooks in parallel.
     */
    private async downloadAndForward(
        message: any,
        configs: TelegramConfig[],
        username: string,
        content: string,
        sourceLink: string,
        fileName: string
    ): Promise<void> {
        // Acquire download slot (blocks if at max concurrency)
        await downloadLimiter.acquire();

        let buffer: Buffer | null = null;

        try {
            // Download with timeout
            buffer = await this.downloadWithTimeout(message, MEDIA_DOWNLOAD_TIMEOUT_MS);
        } catch (err: any) {
            logger.warn(
                { error: err?.message || 'Unknown error', fileName },
                'Media download failed or timed out'
            );
        } finally {
            // Always release the download slot
            downloadLimiter.release();
        }

        // Build files array
        const files: { attachment: Buffer; name: string }[] = [];
        if (buffer && Buffer.isBuffer(buffer)) {
            files.push({ attachment: buffer, name: fileName });
        }

        // Forward (even if media download failed — text content still goes through)
        await this.forwardToWebhooks(configs, username, content, sourceLink, files);
    }

    /**
     * Downloads media with an AbortController timeout.
     * Prevents the handler from hanging indefinitely on slow or stuck downloads.
     */
    private async downloadWithTimeout(message: any, timeoutMs: number): Promise<Buffer | null> {
        return new Promise<Buffer | null>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Media download timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            message.downloadMedia()
                .then((result: any) => {
                    clearTimeout(timer);
                    if (result && Buffer.isBuffer(result)) {
                        resolve(result);
                    } else {
                        resolve(null);
                    }
                })
                .catch((err: any) => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    // ────────────── WEBHOOK FORWARDING ──────────────

    /**
     * Forwards a message to all target webhooks in PARALLEL with retry logic.
     *
     * Uses Promise.allSettled to ensure one failing webhook never blocks
     * or crashes delivery to others. Each webhook gets independent retries.
     */
    private async forwardToWebhooks(
        configs: TelegramConfig[],
        username: string,
        content: string,
        sourceLink: string,
        files: { attachment: Buffer; name: string }[]
    ): Promise<void> {
        // Deduplicate webhooks (multiple configs may share the same target)
        const uniqueWebhooks = new Map<string, TelegramConfig>();
        for (const cfg of configs) {
            if (!uniqueWebhooks.has(cfg.targetWebhookUrl)) {
                uniqueWebhooks.set(cfg.targetWebhookUrl, cfg);
            }
        }

        // Build payload
        const messageContent = `${content}\n\n-# via Telegram • [Source](${sourceLink})`.substring(0, 2000);

        // Deliver to all webhooks in parallel
        const results = await Promise.allSettled(
            Array.from(uniqueWebhooks.entries()).map(([webhookUrl, cfg]) =>
                this.sendWebhookWithRetry(webhookUrl, cfg.id, {
                    username: username || 'Telegram Mirror',
                    content: messageContent,
                    files,
                })
            )
        );

        // Log failures (non-blocking, informational)
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            logger.warn(
                {
                    totalWebhooks: uniqueWebhooks.size,
                    failed: failures.length,
                    errors: failures.map(f =>
                        (f as PromiseRejectedResult).reason?.message || 'Unknown'
                    ),
                },
                'Some Telegram→Discord webhook deliveries failed (isolated)'
            );
        }
    }

    /**
     * Sends a payload to a single webhook with retry + exponential backoff.
     * Handles webhook-specific errors (invalid URL, rate limited, etc.)
     */
    private async sendWebhookWithRetry(
        webhookUrl: string,
        configId: string,
        payload: {
            username: string;
            content: string;
            files: { attachment: Buffer; name: string }[];
        }
    ): Promise<void> {
        let lastError: any = null;

        for (let attempt = 1; attempt <= MAX_WEBHOOK_RETRIES; attempt++) {
            try {
                const webhookClient = new WebhookClient({ url: webhookUrl });

                // Build send options
                const sendOptions: any = {
                    username: payload.username,
                    content: payload.content,
                    allowedMentions: { parse: [] },
                };

                // Attach files if present
                if (payload.files.length > 0) {
                    sendOptions.files = payload.files;
                }

                // Send with timeout
                await Promise.race([
                    webhookClient.send(sendOptions),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error('Webhook send timed out')),
                            WEBHOOK_SEND_TIMEOUT_MS
                        )
                    ),
                ]);

                // Success
                logger.debug(
                    { configId, attempt },
                    'Telegram message forwarded to Discord webhook'
                );
                return;

            } catch (err: any) {
                lastError = err;

                // ── Permanent failures — don't retry ──

                // Webhook URL is invalid/deleted
                if (err.code === 10015 || err.code === 404) {
                    logger.error(
                        { configId, code: err.code },
                        'Discord webhook not found — this config should be disabled'
                    );
                    throw err; // Bubble up immediately
                }

                // Payload too large (413) — retry without files
                if (err.status === 413 || err.code === 40005) {
                    logger.warn({ configId }, 'Webhook payload too large — retrying without files');
                    payload.files = [];
                    payload.content = `${payload.content}\n-# ⚠️ Media was too large to forward`.substring(0, 2000);
                    continue;
                }

                // ── Retriable failures ──

                // Rate limited
                if (err.status === 429) {
                    const retryAfter = err.retry_after || 2;
                    logger.warn(
                        { configId, retryAfter },
                        'Discord webhook rate limited — waiting'
                    );
                    await this.sleep(retryAfter * 1000);
                    continue;
                }

                // Other errors — exponential backoff
                if (attempt < MAX_WEBHOOK_RETRIES) {
                    const delay = WEBHOOK_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                    logger.debug(
                        { configId, attempt, delay, error: err?.message },
                        'Webhook delivery failed — retrying'
                    );
                    await this.sleep(delay);
                }
            }
        }

        // All retries exhausted
        throw lastError || new Error('Webhook delivery failed after all retries');
    }

    // ────────────── HELPERS ──────────────

    /**
     * Flexible Chat ID matching to handle Telegram's various ID formats.
     * GramJS may return IDs with or without the -100 prefix for channels.
     */
    private matchChatId(configChatId: string, messageChatId: string): boolean {
        // Normalize both: strip leading minus and "100" prefix
        const normalize = (id: string): string => {
            const s = id.replace(/^-/, '');
            return s.startsWith('100') ? s.substring(3) : s;
        };

        // Exact match first (fastest path)
        if (configChatId === messageChatId) return true;

        // Check with -100 prefix variations
        if (configChatId === `-100${messageChatId}`) return true;
        if (messageChatId === `-100${configChatId}`) return true;

        // Normalized comparison (handles edge cases)
        return normalize(configChatId) === normalize(messageChatId);
    }

    /**
     * Extracts a display name from a Telegram sender entity.
     */
    private extractUsername(sender: any): string {
        if (!sender) return 'Unknown Telegram User';

        if (sender.username) return sender.username;
        if (sender.title) return sender.title;
        if (sender.firstName) {
            return sender.lastName
                ? `${sender.firstName} ${sender.lastName}`
                : sender.firstName;
        }
        return 'Telegram User';
    }

    /** Promise-based sleep utility */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ────────────── SESSION MANAGEMENT ──────────────

    /**
     * Safely destroys a Telegram session and removes it from tracking.
     */
    private async destroySession(token: string, session: ActiveSession): Promise<void> {
        try {
            await session.client.disconnect();
        } catch (e: any) {
            logger.warn({ error: e?.message || 'Unknown error' }, 'Error disconnecting Telegram client');
        }
        try {
            await session.client.destroy();
        } catch (e: any) {
            logger.warn({ error: e?.message || 'Unknown error' }, 'Error destroying Telegram client');
        }
        this.sessions.delete(token);
    }

    /**
     * Graceful shutdown — disconnects all active Telegram sessions.
     * Called by the engine's SIGINT/SIGTERM handler.
     */
    public async shutdown(): Promise<void> {
        this.isShuttingDown = true;
        logger.info(
            {
                sessions: this.sessions.size,
                activeDownloads: downloadLimiter.activeCount,
                pendingDownloads: downloadLimiter.pendingCount,
            },
            'Shutting down Telegram listener'
        );

        const shutdownPromises: Promise<void>[] = [];
        for (const [token, session] of this.sessions) {
            shutdownPromises.push(this.destroySession(token, session));
        }
        await Promise.allSettled(shutdownPromises);

        logger.info('Telegram listener shutdown complete');
    }

    /** Number of active MTProto sessions */
    public get sessionCount(): number {
        return this.sessions.size;
    }
}
