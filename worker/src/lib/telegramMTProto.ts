
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { logger } from './logger';
import { WebhookExecutor, WebhookPayload } from './webhook';
import { TelegramConfig } from './types';
import { MessageFormatter } from './messageFormatter';
import { processAttachmentsWithWatermark, WatermarkConfig, TextOverlayConfig } from './streamWatermark';
import { applyBlurToBuffer, BlurRegion } from './streamBlur';

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
    keepAliveInterval?: NodeJS.Timeout;
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
    private static readonly AVATAR_CACHE_MAX_SIZE = 500;
    private static readonly AVATAR_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

    private apiId: number;
    private apiHash: string;
    private isShuttingDown = false;
    private avatarCache: Map<string, { buffer: Buffer; expiresAt: number }> = new Map();

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

            // Re-check session after setup
            if (session) {
                if (!session.client.connected) {
                    logger.warn({ token: token.substring(0, 10) + '...' }, 'Client disconnected immediately? Triggering fierce reconnect.');
                    await session.client.connect(); // Await this time
                }

                // robust-keep-alive
                if (session.keepAliveInterval) clearInterval(session.keepAliveInterval);
                session.keepAliveInterval = setInterval(async () => {
                    try {
                        if (!session.client.connected) {
                            logger.warn({ token: token.substring(0, 8) + '...' }, 'Active Keep-Alive: Client disconnected, reconnecting...');
                            await session.client.connect();
                        } else {
                            // Active Ping to ensure socket is responsive
                            // We use getMe() as a reliable test of session validity + connectivity
                            // A timeout here means the socket is hung
                            const pingPromise = session.client.getMe();
                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Ping Timeout')), 10000));

                            await Promise.race([pingPromise, timeoutPromise]);
                            // logger.debug({ token: token.substring(0, 8) + '...' }, 'Active Keep-Alive: Ping successful');
                        }
                    } catch (err: any) {
                        logger.error({ error: err.message }, 'Active Keep-Alive: Ping failed, forcing reconnect');
                        try {
                            await session.client.disconnect();
                            await session.client.connect();
                        } catch (e: any) {
                            logger.error({ error: e.message }, 'Active Keep-Alive: Reconnect failed');
                        }
                    }
                }, 30_000); // Check every 30s
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
        const matchedConfigs = session.configs.filter(c => {
            if (!c.telegramChatId) return false;
            return this.matchChatId(c.telegramChatId, chatId);
        });

        if (matchedConfigs.length === 0) return;

        // Resolve Topic ID (Forum thread ID)
        const replyHeader = message.replyTo as any;
        let messageTopicId: string | null = null;
        if (replyHeader) {
            messageTopicId = (replyHeader.replyToTopId || replyHeader.replyToMsgId)?.toString() || null;
        }

        logger.info({
            chatId,
            messageTopicId,
            matchedCount: matchedConfigs.length
        }, '[Telegram] Checking topic filters');

        const targetConfigs = matchedConfigs.filter(c => {
            if (!c.telegramTopicId) return true; // Matches everything if no filter set
            return c.telegramTopicId === messageTopicId;
        });

        if (targetConfigs.length === 0) {
            logger.debug({ messageTopicId }, '[Telegram] No configs matched the topic ID');
            return;
        }

        logger.info({ targetCount: targetConfigs.length }, '[Telegram] Matches found, proceeding with forward');

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

        // Fetch avatar buffer - used for Embed Author Icon via attachment
        const avatarBuffer = await this.getAvatarBuffer(session.client, sender).catch(() => null);

        const content = (message.text || '').trim();
        const finalContent = `${replyContext}${forwardContext}${content}`.trim();

        const normalizedChatId = chatId.replace(/^-100/, '');
        const sourceLink = `https://t.me/c/${normalizedChatId}/${message.id}`;

        // Separate T2D (Webhook) and T2T (DeliveryService) configs
        const webhookConfigs = targetConfigs.filter(c => c.targetWebhookUrl);
        const telegramConfigs = targetConfigs.filter(c => c.targetTelegramChatId);

        // Determine strategy
        const mediaInfo = this.analyzeMedia(message);
        let webhookContent = finalContent;

        if (mediaInfo.skippedReason) {
            webhookContent += `\n\n**⚠️ Media Skipped:** ${mediaInfo.skippedReason}`;
        }

        // ── EXECUTE T2T Delivery ──
        if (telegramConfigs.length > 0) {
            // Lazy load service to avoid circular dependency
            import('./TelegramDeliveryService').then(({ TelegramDeliveryService }) => {
                const service = TelegramDeliveryService.getInstance();

                // For T2T, we might ideally forward the message object directly?
                // But our service interface expects content/files.
                // We'll mimic the download flow or implement direct forward later.
                // For now, reuse download if media exists, or send text.

                // NOTE: Proper T2T usually forwards the message object (retaining original sender etc).
                // But if we want to apply watermarks/blur, we MUST download and re-upload.
                // The requirement says: "Ensure 'customWatermark' and 'blurRegions'... are applied".
                // So we CANNOT use native forward. We must download-edit-upload.

                // We'll hook into the downloadAndForward flow below, but enable it to target Telegram Delivery.
            });
        }

        // We will modify downloadAndForward to accept mixed targets or split logic.
        // Actually, let's just make downloadAndForward handle both.

        if (mediaInfo.shouldDownload && mediaInfo.fileName) {
            logger.info({ fileName: mediaInfo.fileName }, '[Telegram] Media detected - attempting download');

            this.downloadAndForward(
                message,
                targetConfigs, // ALL VALID CONFIGS (T2D + T2T)
                username,
                avatarBuffer || undefined,
                webhookContent,
                sourceLink,
                mediaInfo.fileName
            ).catch((err: any) => {
                logger.error({ error: err.message }, '[Telegram] Download/Forward failed');
            });
        } else {
            // Text only
            this.handleMessageDelivery(
                targetConfigs,
                username,
                avatarBuffer || undefined,
                webhookContent,
                sourceLink,
                []
            ).catch((err: any) => {
                logger.error({ error: err.message }, '[Telegram] Text forward failed');
            });
        }
    }

    /**
     * Unified delivery handler for both Webhooks (T2D) and Telegram (T2T)
     */
    private async handleMessageDelivery(
        configs: TelegramConfig[],
        username: string,
        avatarBuffer: Buffer | undefined,
        content: string,
        sourceLink: string,
        files: { attachment: Buffer; name: string }[]
    ): Promise<void> {
        const webhookConfigs = configs.filter(c => c.targetWebhookUrl);
        const telegramConfigs = configs.filter(c => c.targetTelegramChatId);

        const promises: Promise<any>[] = [];

        // 1. T2D (Webhooks)
        if (webhookConfigs.length > 0) {
            promises.push(this.forwardToWebhooks(webhookConfigs, username, avatarBuffer, content, sourceLink, files));
        }

        // 2. T2T (Telegram Targets)
        if (telegramConfigs.length > 0) {
            promises.push(
                import('./TelegramDeliveryService').then(async ({ TelegramDeliveryService }) => {
                    const service = TelegramDeliveryService.getInstance();
                    for (const cfg of telegramConfigs) {
                        // Apply watermarks/blur is handled inside TelegramDeliveryService? 
                        // No, we should probably process images HERE once, then send?
                        // But different configs might have different watermarks.
                        // For T2T, we should apply specific config watermarks.
                        // WebhookExecutor does per-webhook processing.
                        // TelegramDeliveryService expects `files`. 

                        // We will replicate the per-target processing logic for T2T here?
                        // Or make TelegramDeliveryService capable of processing?
                        // Let's process here to reuse the logic in forwardToWebhooks (extracted if possible).
                        // Since we can't easily extract private method in one edit, I'll inline the processing for T2T for now.

                        let finalFiles = [...files];

                        // Apply Blur (Privacy)
                        if (cfg.blurRegions && cfg.blurRegions.length > 0) {
                            // ... blur logic ...
                            // Reuse logic is hard without extraction.
                            // I'll call a helper if I can, or duplicate for now given constraints.
                            const blurredFiles: Array<{ attachment: Buffer; name: string }> = [];
                            for (const file of finalFiles) {
                                if (Buffer.isBuffer(file.attachment) && /\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
                                    const blurRes = await applyBlurToBuffer(file.attachment, cfg.blurRegions, file.name);
                                    if (blurRes.applied && blurRes.buffer) {
                                        blurredFiles.push({ attachment: blurRes.buffer, name: file.name });
                                    } else {
                                        blurredFiles.push(file as any);
                                    }
                                } else {
                                    blurredFiles.push(file as any);
                                }
                            }
                            finalFiles = blurredFiles;
                        }

                        // Apply Watermark
                        let watermarkCfg: WatermarkConfig | undefined;
                        if (cfg.watermarkType === 'VISUAL' && cfg.watermarkImageUrl) {
                            watermarkCfg = { imageUrl: cfg.watermarkImageUrl, position: cfg.watermarkPosition || 'southeast', opacity: cfg.watermarkOpacity ?? 100 };
                        } else if (cfg.watermarkType === 'TEXT' && cfg.customWatermark?.trim()) {
                            watermarkCfg = {
                                imageUrl: '',
                                position: cfg.watermarkPosition || 'southeast',
                                textOverlay: {
                                    text: cfg.customWatermark.startsWith('via ') ? cfg.customWatermark : `via ${cfg.customWatermark}`,
                                    fontSize: 20, color: '#FFFFFF', opacity: 70, position: cfg.watermarkPosition || 'southeast', enableBackdrop: true
                                }
                            };
                        }

                        if (watermarkCfg) {
                            finalFiles = (await processAttachmentsWithWatermark(finalFiles as any, watermarkCfg)) as any;
                        }

                        // Send
                        await service.deliver(cfg, content, finalFiles, { username, avatarURL: '' });
                    }
                })
            );
        }

        await Promise.allSettled(promises);
    }

    /**
     * Public accessor for TelegramDeliveryService to reuse active sessions
     */
    public async getOrConnectClient(sessionString: string): Promise<TelegramClient | undefined> {
        const token = sessionString.trim();
        if (!token) return undefined;

        // 1. Check active sessions (reusing Listener connection)
        if (this.sessions.has(token)) {
            const session = this.sessions.get(token);
            if (session && session.client.connected) {
                return session.client;
            }
        }

        // 2. If not active or connected, this might be a Sender-only session or broken session.
        // We'll attempt to return the client if it exists (even if disconnected, caller might reconnect? No, we should ensure connection).
        // Since this is called by DeliveryService, creating a new connection for EVERY send is bad.
        // But getOrConnectClient implies retrieving.

        // TODO: Ideally we should add this session to 'this.sessions' to cache it.
        // But 'this.sessions' requires a list of Configs to be valid for Sync.
        // Sync logic removes sessions not in configs.
        // So `engine.ts` MUST include these sessions in the sync list.
        // If they are in sync list, they are in `this.sessions`.
        // So falling through here means it's NOT in sync list or sync hasn't run yet.

        return undefined;
    }

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
        avatarBuffer: Buffer | undefined,
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

        await this.handleMessageDelivery(configs, username, avatarBuffer, content, sourceLink, files);

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
        avatarBuffer: Buffer | undefined,
        content: string,
        sourceLink: string,
        files: { attachment: Buffer; name: string }[]
    ): Promise<void> {
        // Group unique webhooks
        const uniqueWebhooks = new Map<string, string>(); // url -> configId
        for (const cfg of configs) {
            if (cfg.targetWebhookUrl && !uniqueWebhooks.has(cfg.targetWebhookUrl)) {
                uniqueWebhooks.set(cfg.targetWebhookUrl, cfg.id);
            }
        }

        // Send in parallel
        // We must format the message individually for each target because branding might differ
        await Promise.allSettled(
            Array.from(uniqueWebhooks.entries()).map(async ([url, configId]) => {
                const targetConfig = configs.find(c => c.id === configId);
                let processedFiles: Array<{ attachment: Buffer | string; name: string }> = [...files];

                // ── 1. Apply Image Blur (Privacy) ──
                if (targetConfig?.blurRegions && targetConfig.blurRegions.length > 0 && processedFiles.length > 0) {
                    const blurredFiles: Array<{ attachment: Buffer | string; name: string }> = [];
                    for (const file of processedFiles) {
                        // Only blur if it's a buffer (Telegram always sends buffers) and is an image
                        if (Buffer.isBuffer(file.attachment) && /\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
                            const blurRes = await applyBlurToBuffer(
                                file.attachment,
                                targetConfig.blurRegions,
                                file.name
                            );
                            if (blurRes.applied && blurRes.buffer) {
                                blurredFiles.push({ attachment: blurRes.buffer, name: file.name });
                            } else {
                                blurredFiles.push(file);
                            }
                        } else {
                            blurredFiles.push(file);
                        }
                    }
                    processedFiles = blurredFiles;
                }

                // ── 2. Apply Watermark (VISUAL or TEXT overlay) ──
                let watermarkCfg: WatermarkConfig | undefined;

                if (targetConfig?.watermarkType === 'VISUAL' && targetConfig.watermarkImageUrl && processedFiles.length > 0) {
                    // VISUAL mode: overlay logo image
                    watermarkCfg = {
                        imageUrl: targetConfig.watermarkImageUrl,
                        position: targetConfig.watermarkPosition || 'southeast',
                        opacity: targetConfig.watermarkOpacity ?? 100
                    };
                } else if (targetConfig?.watermarkType === 'TEXT' && targetConfig.customWatermark?.trim() && processedFiles.length > 0) {
                    // TEXT mode: burn branding text directly onto image pixels via SVG
                    const wmText = targetConfig.customWatermark;
                    const textOverlay: TextOverlayConfig = {
                        text: wmText.startsWith('via ') ? wmText : `via ${wmText}`,
                        fontSize: 20,
                        color: '#FFFFFF',
                        opacity: 70,
                        position: targetConfig.watermarkPosition || 'southeast',
                        enableBackdrop: true
                    };
                    watermarkCfg = {
                        imageUrl: '', // No logo — text overlay only
                        position: targetConfig.watermarkPosition || 'southeast',
                        textOverlay
                    };
                }

                if (watermarkCfg) {
                    processedFiles = await processAttachmentsWithWatermark(processedFiles, watermarkCfg);
                }

                // ── 3. Attach Avatar (as separate attachment, no watermark/blur) ──
                const finalFiles = [...processedFiles];
                const avatarAttachmentName = avatarBuffer ? `profile_avatar_${Date.now()}.jpg` : undefined;

                if (avatarBuffer && avatarAttachmentName) {
                    finalFiles.push({
                        attachment: avatarBuffer,
                        name: avatarAttachmentName
                    });
                }

                // Use Formatter
                const formatted = MessageFormatter.formatTelegramMessage(
                    content,
                    sourceLink,
                    { name: username, avatarAttachmentName },
                    {
                        customWatermark: targetConfig?.watermarkType === 'VISUAL'
                            ? '' // VISUAL mode: suppress text watermark (logo is on the image)
                            : targetConfig?.customWatermark,
                        brandColor: targetConfig?.brandColor
                    }
                );

                return WebhookExecutor.send(url, {
                    username: formatted.username,
                    avatarURL: formatted.avatarURL,
                    content: formatted.content,
                    embeds: formatted.embeds,
                    files: finalFiles as any // WebhookExecutor handles Buffer | string
                }, configId);
            })
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

    private async getAvatarBuffer(client: TelegramClient, sender: any): Promise<Buffer | undefined> {
        if (!sender || !sender.photo) return undefined;

        const senderId = sender.id?.toString();
        if (!senderId) return undefined;

        // Check cache with TTL
        const cached = this.avatarCache.get(senderId);
        if (cached) {
            if (Date.now() < cached.expiresAt) {
                return cached.buffer;
            }
            this.avatarCache.delete(senderId); // Expired
        }

        try {
            const buffer = await Promise.race([
                client.downloadProfilePhoto(sender, { isBig: false }),
                new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Avatar Timeout')), 3000))
            ]).catch((err: any) => {
                logger.debug({ senderId, error: err?.message || 'Unknown error' }, 'Telegram avatar fetch failed/timed out');
                return null;
            }) as Buffer | null;

            if (buffer && buffer.length > 0) {
                // Evict oldest entries if cache is full
                if (this.avatarCache.size >= TelegramListener.AVATAR_CACHE_MAX_SIZE) {
                    const firstKey = this.avatarCache.keys().next().value;
                    if (firstKey) this.avatarCache.delete(firstKey);
                }

                this.avatarCache.set(senderId, {
                    buffer: buffer,
                    expiresAt: Date.now() + TelegramListener.AVATAR_CACHE_TTL_MS
                });
                return buffer;
            }
        } catch (err: any) {
            logger.debug({ senderId, error: err?.message || 'Unknown error' }, 'Failed to process Telegram profile photo');
        }
        return undefined;
    }

    private async destroySession(token: string, session: ActiveSession): Promise<void> {
        if (session.keepAliveInterval) {
            clearInterval(session.keepAliveInterval);
            session.keepAliveInterval = undefined;
        }
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