
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { logger } from './logger';
import { WebhookExecutor, WebhookPayload } from './webhook';
import { TelegramConfig } from './types';

// ──────────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────────

/** Max time to wait for a single media download (prevents hanging forever) */
const MEDIA_DOWNLOAD_TIMEOUT_MS = 300_000;

/** 
 * Strict limit for media size to avoid OOM on 68MB Heap.
 * 20MB is the safety threshold.
 */
const MAX_MEDIA_SIZE_BYTES = 20 * 1024 * 1024;

/** 
 * Max concurrent media downloads.
 * Kept low (2) to prevent memory spikes.
 */
const MAX_CONCURRENT_DOWNLOADS = 2;

interface ActiveSession {
    client: TelegramClient;
    configs: TelegramConfig[];
    lastActive: number;
}

// ──────────────────────────────────────────────────────────────
//  Concurrency Limiter
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

    public async sync(configs: TelegramConfig[]) {
        if (this.isShuttingDown) return;

        logger.info({ count: configs.length }, 'Syncing Telegram MTProto listeners');

        const activeSessionKeys = new Set<string>();
        const configsByToken = new Map<string, TelegramConfig[]>();

        for (const config of configs) {
            if (!config.telegramSession) continue;
            const token = config.telegramSession;
            if (!configsByToken.has(token)) {
                configsByToken.set(token, []);
            }
            configsByToken.get(token)!.push(config);
        }

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
                session.configs = sessionConfigs;
                session.lastActive = Date.now();
            }
        }

        for (const [token, session] of this.sessions) {
            if (!activeSessionKeys.has(token)) {
                logger.info('Stopping stale Telegram session');
                await this.destroySession(token, session);
            }
        }
    }

    // ────────────── MESSAGE HANDLER ──────────────

    private async handleNewMessage(event: NewMessageEvent, token: string) {
        const message = event.message;
        if (!message) return;

        const chat = await message.getChat();
        if (!chat) return;

        const session = this.sessions.get(token);
        if (!session) return;

        const chatId = chat.id.toString();

        logger.info({
            chatId,
            messageId: message.id,
            hasMedia: !!message.media
        }, '[Telegram] New message received');

        // Match configs
        const matchedConfigs = session.configs.filter(c => {
            if (!c.telegramChatId) return false;
            return this.matchChatId(c.telegramChatId, chatId);
        });

        if (matchedConfigs.length === 0) return;

        // Filter by Topic ID
        const messageTopicId = (message.replyTo as any)?.replyToTopId?.toString() || null;
        const targetConfigs = matchedConfigs.filter(c => {
            if (!c.telegramTopicId) return true;
            return c.telegramTopicId === messageTopicId;
        });

        if (targetConfigs.length === 0) return;

        // Build sender info
        const sender = await message.getSender().catch(() => null);
        const username = this.extractUsername(sender);

        const content = message.text || '';
        const normalizedChatId = chatId.replace(/^-100/, '');
        const sourceLink = `https://t.me/c/${normalizedChatId}/${message.id}`;

        // Determine strategy
        const mediaInfo = this.analyzeMedia(message);
        let finalContent = content;

        if (mediaInfo.skippedReason) {
            finalContent += `\n\n**⚠️ Media Skipped:** ${mediaInfo.skippedReason}`;
        }

        if (mediaInfo.shouldDownload && mediaInfo.fileName) {
            logger.info({ fileName: mediaInfo.fileName }, '[Telegram] Media detected - attempting download');

            // Fire-and-forget logic with explicit catch
            this.downloadAndForward(
                message,
                targetConfigs,
                username,
                finalContent,
                sourceLink,
                mediaInfo.fileName
            ).catch((err: any) => {
                logger.error({ error: err.message }, '[Telegram] Download/Forward failed');
            });
        } else {
            // Text only
            this.forwardToWebhooks(
                targetConfigs,
                username,
                finalContent,
                sourceLink,
                [] // No files
            ).catch((err: any) => {
                logger.error({ error: err.message }, '[Telegram] Text forward failed');
            });
        }
    }

    // ────────────── MEDIA ANALYSIS ──────────────

    private analyzeMedia(message: any): { shouldDownload: boolean; fileName: string; skippedReason?: string } {
        if (!message.media) return { shouldDownload: false, fileName: '' };

        // Helper to check size
        const checkSize = (size: number | undefined): string | null => {
            if (size && size > MAX_MEDIA_SIZE_BYTES) return 'File too large (>20MB)';
            return null;
        };

        if (message.photo) return { shouldDownload: true, fileName: 'photo.jpg' };

        if (message.document) {
            const sizeCheck = checkSize(message.document.size);
            if (sizeCheck) return { shouldDownload: false, fileName: '', skippedReason: sizeCheck };

            const attrs = message.document.attributes;
            const filenameAttr = attrs?.find((a: any) => a.fileName);
            const fileName = filenameAttr?.fileName || 'document.dat';
            return { shouldDownload: true, fileName };
        }

        if (message.sticker) return { shouldDownload: true, fileName: 'sticker.webp' }; // Stickers are usually small

        if (message.voice || message.audio) {
            const sizeCheck = checkSize((message.voice || message.audio)?.size);
            if (sizeCheck) return { shouldDownload: false, fileName: '', skippedReason: sizeCheck };
            return { shouldDownload: true, fileName: message.voice ? 'voice.ogg' : 'audio.mp3' };
        }

        if (message.video || message.videoNote) {
            const sizeCheck = checkSize((message.video || message.videoNote)?.size);
            if (sizeCheck) return { shouldDownload: false, fileName: '', skippedReason: sizeCheck };
            return { shouldDownload: true, fileName: message.videoNote ? 'videonote.mp4' : 'video.mp4' };
        }

        return { shouldDownload: false, fileName: '' };
    }

    // ────────────── DOWNLOAD + FORWARD ──────────────

    private async downloadAndForward(
        message: any,
        configs: TelegramConfig[],
        username: string,
        content: string,
        sourceLink: string,
        fileName: string
    ): Promise<void> {
        await downloadLimiter.acquire();

        let buffer: Buffer | null = null;

        try {
            buffer = await this.downloadWithTimeout(message, MEDIA_DOWNLOAD_TIMEOUT_MS);
        } catch (err: any) {
            logger.warn({ error: err?.message, fileName }, '[Telegram] Download failed/timed out');
        } finally {
            downloadLimiter.release();
        }

        const files = [];
        // Only attach if valid buffer
        if (buffer && Buffer.isBuffer(buffer)) {
            // Redundancy check for empty buffer
            if (buffer.length > 0) {
                files.push({ attachment: buffer, name: fileName });
            } else {
                buffer = null; // GC
            }
        }

        await this.forwardToWebhooks(configs, username, content, sourceLink, files);

        // Explicit cleanup
        if (buffer) buffer = null;
    }

    private async downloadWithTimeout(message: any, timeoutMs: number): Promise<Buffer | null> {
        return new Promise<Buffer | null>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Download timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            message.downloadMedia()
                .then((result: any) => {
                    clearTimeout(timer);
                    if (result && Buffer.isBuffer(result)) resolve(result);
                    else resolve(null);
                })
                .catch((err: any) => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    // ────────────── WEBHOOK DELIVERY ──────────────

    private async forwardToWebhooks(
        configs: TelegramConfig[],
        username: string,
        content: string,
        sourceLink: string,
        files: { attachment: Buffer; name: string }[]
    ): Promise<void> {
        // Group unique webhooks
        const uniqueWebhooks = new Map<string, string>(); // url -> configId
        for (const cfg of configs) {
            if (!uniqueWebhooks.has(cfg.targetWebhookUrl)) {
                uniqueWebhooks.set(cfg.targetWebhookUrl, cfg.id);
            }
        }

        const messageContent = `${content}\n\n-# via Telegram • [Source](${sourceLink})`.substring(0, 2000);

        // Send in parallel
        await Promise.allSettled(
            Array.from(uniqueWebhooks.entries()).map(([url, configId]) =>
                WebhookExecutor.send(url, {
                    username: username || 'Telegram Mirror',
                    content: messageContent,
                    files: files // WebhookExecutor will handle buffering/streaming
                }, configId)
            )
        );

        // Note: 'files' buffer references are cleared inside WebhookExecutor? 
        // No, WebhookExecutor receives the array. 
        // We do cleanup in the caller (downloadAndForward) to be safe.
    }

    // ────────────── HELPERS ──────────────

    private matchChatId(configChatId: string, messageChatId: string): boolean {
        const normalize = (id: string) => {
            const s = id.replace(/^-/, '');
            return s.startsWith('100') ? s.substring(3) : s;
        };
        if (configChatId === messageChatId) return true;
        if (configChatId === `-100${messageChatId}`) return true;
        if (messageChatId === `-100${configChatId}`) return true;
        return normalize(configChatId) === normalize(messageChatId);
    }

    private extractUsername(sender: any): string {
        if (!sender) return 'Unknown Telegram User';
        if (sender.username) return sender.username;
        if (sender.title) return sender.title; // Channels
        if (sender.firstName) return sender.lastName ? `${sender.firstName} ${sender.lastName}` : sender.firstName;
        return 'Telegram User';
    }

    private async destroySession(token: string, session: ActiveSession): Promise<void> {
        try { await session.client.disconnect(); } catch { }
        try { await session.client.destroy(); } catch { }
        this.sessions.delete(token);
    }

    public async shutdown(): Promise<void> {
        this.isShuttingDown = true;
        const shutdownPromises: Promise<void>[] = [];
        for (const [token, session] of this.sessions) {
            shutdownPromises.push(this.destroySession(token, session));
        }
        await Promise.allSettled(shutdownPromises);
    }
}
