
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
    private avatarCache: Map<string, string> = new Map();

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
        if (!this.apiId || !this.apiHash) {
            logger.warn('Skipping Telegram sync: Missing API credentials');
            return;
        }

        logger.info({ count: configs.length }, 'Syncing Telegram MTProto listeners');

        const activeSessionKeys = new Set<string>();
        const configsByToken = new Map<string, TelegramConfig[]>();

        for (const config of configs) {
            if (!config.telegramSession) continue;
            // Trim just in case of weird whitespace during decryption/storage
            const token = config.telegramSession.trim();
            if (!token) continue;

            if (!configsByToken.has(token)) {
                configsByToken.set(token, []);
            }
            configsByToken.get(token)!.push(config);
        }

        // 1. Cleanup stale sessions (not in active configs)
        for (const [token, session] of this.sessions) {
            if (!configsByToken.has(token)) {
                logger.info('Stopping stale Telegram session');
                await this.destroySession(token, session);
            }
        }

        // 2. Add or Update sessions (In parallel to speed up initial connection)
        const syncPromises = Array.from(configsByToken.entries()).map(async ([token, sessionConfigs]) => {
            activeSessionKeys.add(token);

            let session = this.sessions.get(token);

            if (session) {
                // 1. Update existing session configs
                session.configs = sessionConfigs;
                session.lastActive = Date.now();
                logger.debug({ configCount: sessionConfigs.length }, 'Updated existing Telegram session configs');

                // 2. Ensure client is still connected
                if (!session.client.connected) {
                    logger.warn({ token: token.substring(0, 10) + '...' }, 'Telegram client disconnected — attempting auto-reconnect');
                    session.client.connect().catch(e => {
                        logger.error({ error: e.message }, 'Failed to reconnect Telegram client during sync');
                    });
                }
            } else {
                logger.info({ configCount: sessionConfigs.length }, 'Starting new Telegram MTProto session');
                try {
                    const client = new TelegramClient(
                        new StringSession(token),
                        this.apiId,
                        this.apiHash,
                        {
                            connectionRetries: 10,
                            useWSS: true, // Switched to WSS for better stability on VPS firewalls
                            autoReconnect: true,
                            floodSleepThreshold: 60,
                            deviceModel: 'DisBot Mirror Worker',
                            systemVersion: 'Linux/Windows',
                            appVersion: '2.1.0'
                        }
                    );

                    // Listen for updates (existing handler covers messages)
                    // We rely on the sync loop for connection health checks instead of faulty event listeners

                    let connectResult = false;
                    try {
                        connectResult = await Promise.race([
                            (async () => {
                                await client.connect();
                                return await client.checkAuthorization();
                            })(),
                            new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("Connection Timeout")), 60000))
                        ]);
                    } catch (err: any) {
                        logger.error({ error: err?.message || 'Unknown error' }, 'Failed during Telegram connection attempt');
                        // Ensure we cleanup the client if it timed out or errored
                        try { await client.disconnect(); } catch { }
                        try { await client.destroy(); } catch { }
                        return;
                    }

                    if (!connectResult) {
                        logger.warn({ configCount: sessionConfigs.length }, 'Telegram session invalid or expired — skipping');
                        try { await client.disconnect(); } catch { }
                        try { await client.destroy(); } catch { }
                        return;
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
                }
            }
        });

        await Promise.allSettled(syncPromises);
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

        // ── 1. Resolve Global Metadata (Replies & Forwards) ──
        let replyContext = '';
        let forwardContext = '';

        try {
            // Handle Replies
            if (message.replyTo) {
                const replyMsg = await message.getReplyMessage().catch(() => null);
                if (replyMsg) {
                    const replySender = await replyMsg.getSender().catch(() => null);
                    const replyUser = this.extractUsername(replySender);
                    const snippet = replyMsg.text
                        ? (replyMsg.text.substring(0, 60).replace(/\n/g, ' ') + (replyMsg.text.length > 60 ? '...' : ''))
                        : '[Media]';
                    replyContext = `-# 💬 Replying to **${replyUser}**: _${snippet}_\n`;
                }
            }

            // Handle Forwards
            if (message.fwdFrom) {
                let fwdName = 'Unknown Source';
                if (message.fwdFrom.fromName) {
                    fwdName = message.fwdFrom.fromName;
                } else if (message.fwdFrom.fromId) {
                    const entity = await session.client.getEntity(message.fwdFrom.fromId).catch(() => null);
                    if (entity) fwdName = this.extractUsername(entity);
                }
                forwardContext = `-# 📨 Forwarded from **${fwdName}**\n`;
            }
        } catch (err) {
            logger.debug({ err }, 'Metadata resolution failed/timed out - skipping headers');
        }

        // Build sender info
        const sender = await message.getSender().catch(() => null);
        const username = this.extractUsername(sender);
        const avatarURL = await this.getAvatarUrl(session.client, sender);

        const content = (message.text || '').trim();
        const finalContent = `${replyContext}${forwardContext}${content}`.trim();

        const normalizedChatId = chatId.replace(/^-100/, '');
        const sourceLink = `https://t.me/c/${normalizedChatId}/${message.id}`;

        // Determine strategy
        const mediaInfo = this.analyzeMedia(message);
        let webhookContent = finalContent;

        if (mediaInfo.skippedReason) {
            webhookContent += `\n\n**⚠️ Media Skipped:** ${mediaInfo.skippedReason}`;
        }

        if (mediaInfo.shouldDownload && mediaInfo.fileName) {
            logger.info({ fileName: mediaInfo.fileName }, '[Telegram] Media detected - attempting download');

            // Fire-and-forget logic with explicit catch
            this.downloadAndForward(
                message,
                targetConfigs,
                username,
                avatarURL,
                webhookContent,
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
                avatarURL,
                webhookContent,
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
        avatarURL: string | undefined,
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

        await this.forwardToWebhooks(configs, username, avatarURL, content, sourceLink, files);

        // Explicit cleanup
        if (buffer) buffer = null;
    }

    private async downloadWithTimeout(message: any, timeoutMs: number): Promise<Buffer | null> {
        return new Promise<Buffer | null>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Download timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            logger.debug({ msgId: message.id }, '[Telegram] Starting media download stream');

            message.downloadMedia({
                progressCallback: (progress: number) => {
                    // Log progress every 25% to avoid spamming
                    if (Math.round(progress * 100) % 25 === 0 && progress > 0) {
                        logger.debug({ msgId: message.id, progress: Math.round(progress * 100) + '%' }, '[Telegram] Download progress');
                    }
                }
            })
                .then((result: any) => {
                    clearTimeout(timer);
                    if (result && Buffer.isBuffer(result)) {
                        logger.debug({ msgId: message.id, size: result.length }, '[Telegram] Download component successful');
                        resolve(result);
                    } else {
                        logger.warn({ msgId: message.id }, '[Telegram] Download returned non-buffer result');
                        resolve(null);
                    }
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
        avatarURL: string | undefined,
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

        // Professional formatting - Prepend sender profile info
        // Using bold for name and -# for metadata
        const header = `👤 **${username}**`;
        const bodyContent = content ? `\n${content}` : '';
        const footer = `\n\n-# via Telegram • [Source](${sourceLink})`;

        const messageContent = `${header}${bodyContent}${footer}`.substring(0, 2000);

        // Send in parallel
        await Promise.allSettled(
            Array.from(uniqueWebhooks.entries()).map(([url, configId]) =>
                WebhookExecutor.send(url, {
                    username: username || 'Telegram Mirror',
                    avatarURL: avatarURL,
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

        // 1. Handle Channels/Groups (they have 'title')
        if (sender.title) {
            return sender.title;
        }

        // 2. Handle Users (they have 'firstName', 'lastName', 'username')
        let name = '';
        if (sender.firstName) {
            name = sender.firstName;
            if (sender.lastName) name += ` ${sender.lastName}`;
        } else if (sender.username) {
            name = sender.username;
        } else {
            name = 'Telegram User';
        }

        // Add handle if available for more clarity, unless it's already the name
        if (sender.username && name.toLowerCase() !== sender.username.toLowerCase()) {
            return `${name} (@${sender.username})`;
        }

        return name;
    }

    private async getAvatarUrl(client: TelegramClient, sender: any): Promise<string | undefined> {
        if (!sender || !sender.photo) return undefined;

        const senderId = sender.id?.toString();
        if (!senderId) return undefined;

        if (this.avatarCache.has(senderId)) {
            return this.avatarCache.get(senderId);
        }

        try {
            // Download thumbnail only (small data URI)
            const buffer = await client.downloadProfilePhoto(sender, { isBig: false }).catch(() => null);
            if (buffer && buffer.length > 0) {
                const dataUri = `data:image/jpeg;base64,${buffer.toString('base64')}`;

                // Overflow protection
                if (this.avatarCache.size > 500) this.avatarCache.clear();

                this.avatarCache.set(senderId, dataUri);
                return dataUri;
            }
        } catch (err) {
            logger.debug({ senderId }, 'Failed to download Telegram profile photo');
        }
        return undefined;
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
