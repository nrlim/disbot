
import { Client, Message } from 'discord.js-selfbot-v13';
import { Client as BotClient, GatewayIntentBits } from 'discord.js';
import { logger } from './logger';
import { prisma } from './prisma';
import {
    validateMediaForwarding,
    filterAttachments,
    parseAttachments,
    buildRejectionNotice,
    type MediaForwardResult,
    type ParsedAttachment
} from './media';
import { PriorityMessageQueue } from './plan-enforcer';
import { MirrorActiveConfig } from './types';
import { WebhookExecutor, WebhookPayload } from './webhook';
import { decrypt, maskToken } from './crypto';
import { processAttachmentsWithBlur } from './streamBlur';
import { processAttachmentsWithWatermark, WatermarkConfig, TextOverlayConfig } from './streamWatermark';

const messageQueue = PriorityMessageQueue.getInstance();

const PLAN_PRIORITY: Record<string, number> = { 'FREE': 0, 'STARTER': 1, 'PRO': 2, 'ELITE': 3 };

// Interface for holding active sessions
interface ClientSession {
    client: Client | BotClient;
    configs: Map<string, MirrorActiveConfig[]>; // channelId -> configs
    lastActive: number;
}

export class DiscordMirror {
    private static instance: DiscordMirror;

    // Map<UserToken, Session>
    private clients: Map<string, ClientSession> = new Map();
    // Map<BotToken, Session>
    private botClients: Map<string, ClientSession> = new Map();

    private constructor() { }

    public static getInstance(): DiscordMirror {
        if (!DiscordMirror.instance) {
            DiscordMirror.instance = new DiscordMirror();
        }
        return DiscordMirror.instance;
    }

    /**
     * Syncs active configurations with running Discord clients.
     */
    public async sync(configs: MirrorActiveConfig[]) {
        logger.info({ count: configs.length }, 'Syncing Discord clients');

        // Separate by type
        const hookConfigs = configs.filter(c => c.type === 'CUSTOM_HOOK' && c.sourcePlatform === 'DISCORD');
        const botConfigs = configs.filter(c => c.type === 'MANAGED_BOT' && c.sourcePlatform === 'DISCORD');

        await this.syncCustomHookClients(hookConfigs);
        await this.syncManagedBotClients(botConfigs);
    }

    private async syncCustomHookClients(configs: MirrorActiveConfig[]) {
        const configsByToken = this.groupConfigsByToken(configs);

        // Remove stale clients
        for (const [token, session] of this.clients) {
            if (!configsByToken.has(token)) {
                logger.info({ token: maskToken(token) }, 'Stopping inactive Custom Hook client');
                try { session.client.destroy(); } catch { }
                this.clients.delete(token);
            }
        }

        // Add / Update clients
        for (const [token, tokenConfigs] of configsByToken) {
            const configMap = this.groupConfigsByChannel(tokenConfigs);

            if (this.clients.has(token)) {
                const session = this.clients.get(token)!;
                session.configs = configMap;
                session.lastActive = Date.now();

                // Health check: detect zombie sessions where the WebSocket died silently
                const wsStatus = (session.client as any)?.ws?.status;
                if (wsStatus !== undefined && wsStatus !== 0) {
                    logger.warn({ token: maskToken(token), wsStatus }, 'Custom Hook client WebSocket is not READY — respawning');
                    try { session.client.destroy(); } catch { }
                    this.clients.delete(token);
                    await this.spawnSelfbotClient(token, configMap);
                }
            } else {
                logger.info({ token: maskToken(token) }, 'Starting Custom Hook client session');
                await this.spawnSelfbotClient(token, configMap);
            }
        }
    }

    private async syncManagedBotClients(configs: MirrorActiveConfig[]) {
        const configsByToken = this.groupConfigsByToken(configs);

        for (const [token, session] of this.botClients) {
            if (!configsByToken.has(token)) {
                logger.info({ token: maskToken(token) }, 'Stopping inactive Managed Bot client');
                try { session.client.destroy(); } catch { }
                this.botClients.delete(token);
            }
        }

        for (const [token, tokenConfigs] of configsByToken) {
            const configMap = this.groupConfigsByChannel(tokenConfigs);

            if (this.botClients.has(token)) {
                const session = this.botClients.get(token)!;
                session.configs = configMap;
                session.lastActive = Date.now();

                // Health check: detect zombie sessions where the WebSocket died silently
                const wsStatus = (session.client as any)?.ws?.status;
                if (wsStatus !== undefined && wsStatus !== 0) {
                    logger.warn({ token: maskToken(token), wsStatus }, 'Managed Bot client WebSocket is not READY — respawning');
                    try { session.client.destroy(); } catch { }
                    this.botClients.delete(token);
                    await this.spawnBotClient(token, configMap);
                }
            } else {
                logger.info({ token: maskToken(token) }, 'Starting Managed Bot client session');
                await this.spawnBotClient(token, configMap);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  CLIENT SPAWNING
    // ──────────────────────────────────────────────────────────────

    private async spawnSelfbotClient(token: string, initialConfigs: Map<string, MirrorActiveConfig[]>) {
        const client = new Client({ checkUpdate: false } as any);
        const session: ClientSession = { client, configs: initialConfigs, lastActive: Date.now() };

        client.on('ready', () => logger.info({ user: client.user?.tag }, 'Custom Hook Client ready'));

        client.on('messageCreate', (message) => {
            this.dispatchMessage(token, message as Message, 'CUSTOM_HOOK');
        });

        // Simplified update handler
        client.on('messageUpdate', async (oldMessage, newMessage) => {
            if (newMessage.partial) {
                try { await newMessage.fetch(); } catch { return; }
            }
            if (!oldMessage.partial && oldMessage.content === newMessage.content && oldMessage.attachments.size === newMessage.attachments.size) return;
            this.dispatchMessage(token, newMessage as Message, 'CUSTOM_HOOK');
        });

        client.on('error', (err) => logger.error({ msg: err.message, token: maskToken(token) }, 'Selfbot client error'));

        // ── Reconnect on disconnect (critical for production reliability) ──
        // discord.js-selfbot-v13 emits 'close' when the WebSocket connection drops.
        // Without this, the session dies silently until the next engine sync (5 min).
        let reconnectAttempts = 0;
        const MAX_RECONNECT_ATTEMPTS = 5;

        const handleDisconnect = async (reason?: string) => {
            if (!this.clients.has(token)) return; // Already cleaned up
            reconnectAttempts++;
            const backoffMs = Math.min(5_000 * Math.pow(2, reconnectAttempts - 1), 120_000);

            logger.warn({
                token: maskToken(token),
                attempt: reconnectAttempts,
                maxAttempts: MAX_RECONNECT_ATTEMPTS,
                backoffMs,
                reason
            }, 'Selfbot client disconnected — scheduling reconnect');

            if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
                logger.error({ token: maskToken(token) }, 'Selfbot max reconnect attempts reached — giving up (will retry on next sync)');
                try { client.destroy(); } catch { }
                this.clients.delete(token);
                return;
            }

            await new Promise(r => setTimeout(r, backoffMs));
            if (!this.clients.has(token)) return; // Cleaned up during backoff wait

            try {
                await client.login(token);
                reconnectAttempts = 0; // Reset on success
                logger.info({ token: maskToken(token) }, 'Selfbot client reconnected successfully');
            } catch (err: any) {
                logger.error({ msg: err.message, token: maskToken(token) }, 'Selfbot reconnect failed');
                if (err.message?.includes('TOKEN_INVALID') || err.code === 401) {
                    await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID', 'CUSTOM_HOOK');
                    try { client.destroy(); } catch { }
                    this.clients.delete(token);
                }
            }
        };

        client.on('close', (event: any) => handleDisconnect(event?.reason || 'close'));
        (client as any).on?.('shardDisconnect', (_: any, id: number) => handleDisconnect(`shard ${id} disconnect`));
        (client as any).on?.('invalidated', () => {
            logger.error({ token: maskToken(token) }, 'Selfbot session invalidated by Discord');
            this.invalidateAllConfigsForToken(token, 'SESSION_INVALIDATED', 'CUSTOM_HOOK');
            try { client.destroy(); } catch { }
            this.clients.delete(token);
        });

        // ── Login (store session only on success) ──
        try {
            await client.login(token);
            this.clients.set(token, session); // Only store after successful login
            reconnectAttempts = 0;
        } catch (error: any) {
            logger.error({ msg: error.message, token: maskToken(token) }, 'Selfbot login failed');
            if (error.message?.includes('Token') || error.code === 401) {
                await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID', 'CUSTOM_HOOK');
            }
            // Don't store dead session in the map
            try { client.destroy(); } catch { }
        }
    }

    private async spawnBotClient(token: string, initialConfigs: Map<string, MirrorActiveConfig[]>) {
        const client = new BotClient({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
        });
        const session: ClientSession = { client, configs: initialConfigs, lastActive: Date.now() };

        client.on('ready', () => logger.info({ user: client.user?.tag }, 'Managed Bot Client ready'));

        client.on('messageCreate', (message) => {
            if (message.author.bot) return; // Ignore bots
            this.dispatchMessage(token, message as any, 'MANAGED_BOT');
        });

        client.on('error', (err) => logger.error({ msg: err.message, token: maskToken(token) }, 'Bot client error'));

        // ── Reconnect on disconnect (critical for production reliability) ──
        let reconnectAttempts = 0;
        const MAX_RECONNECT_ATTEMPTS = 5;

        const handleDisconnect = async (reason?: string) => {
            if (!this.botClients.has(token)) return; // Already cleaned up
            reconnectAttempts++;
            const backoffMs = Math.min(5_000 * Math.pow(2, reconnectAttempts - 1), 120_000);

            logger.warn({
                token: maskToken(token),
                attempt: reconnectAttempts,
                maxAttempts: MAX_RECONNECT_ATTEMPTS,
                backoffMs,
                reason
            }, 'Bot client disconnected — scheduling reconnect');

            if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
                logger.error({ token: maskToken(token) }, 'Bot max reconnect attempts reached — giving up (will retry on next sync)');
                try { client.destroy(); } catch { }
                this.botClients.delete(token);
                return;
            }

            await new Promise(r => setTimeout(r, backoffMs));
            if (!this.botClients.has(token)) return; // Cleaned up during backoff wait

            try {
                await client.login(token);
                reconnectAttempts = 0;
                logger.info({ token: maskToken(token) }, 'Bot client reconnected successfully');
            } catch (err: any) {
                logger.error({ msg: err.message, token: maskToken(token) }, 'Bot reconnect failed');
                if (err.message?.includes('TOKEN_INVALID') || err.code === 401) {
                    await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID', 'MANAGED_BOT');
                    try { client.destroy(); } catch { }
                    this.botClients.delete(token);
                }
            }
        };

        client.on('shardDisconnect', (_: any, id: number) => handleDisconnect(`shard ${id} disconnect`));
        client.on('invalidated', () => {
            logger.error({ token: maskToken(token) }, 'Bot session invalidated by Discord');
            this.invalidateAllConfigsForToken(token, 'SESSION_INVALIDATED', 'MANAGED_BOT');
            try { client.destroy(); } catch { }
            this.botClients.delete(token);
        });

        // ── Login (store session only on success) ──
        try {
            await client.login(token);
            this.botClients.set(token, session); // Only store after successful login
            reconnectAttempts = 0;
        } catch (error: any) {
            logger.error({ msg: error.message, token: maskToken(token) }, 'Bot login failed');
            if (error.message?.includes('Token') || error.code === 401) {
                await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID', 'MANAGED_BOT');
            }
            // Don't store dead session in the map
            try { client.destroy(); } catch { }
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  MESSAGE DISPATCH & PROCESSING
    // ──────────────────────────────────────────────────────────────

    private dispatchMessage(token: string, message: Message, clientType: 'CUSTOM_HOOK' | 'MANAGED_BOT') {
        const sessionMap = clientType === 'CUSTOM_HOOK' ? this.clients : this.botClients;
        const session = sessionMap.get(token);
        if (!session) return;

        const configs = session.configs.get(message.channelId);
        if (!configs || configs.length === 0) return;

        // Resolve highest priority plan
        const userPlan = configs.reduce((best, current) => {
            const pCurrent = PLAN_PRIORITY[current.userPlan] ?? 0;
            const pBest = PLAN_PRIORITY[best] ?? 0;
            return pCurrent > pBest ? current.userPlan : best;
        }, 'FREE');

        messageQueue.enqueue({
            plan: userPlan,
            configId: configs[0].id,
            fn: () => this.handleMessage(token, message, configs, userPlan)
        });
    }

    private async handleMessage(token: string, message: Message, configs: MirrorActiveConfig[], userPlan: string) {
        const logContext = {
            msgId: message.id,
            author: message.author.tag,
            channel: message.channelId,
            plan: userPlan,
            configId: configs[0]?.id
        };

        // Wait briefly for embeds/attachments to popular if message relies on them
        if (message.attachments.size > 0 || message.embeds.length > 0) {
            await new Promise(r => setTimeout(r, 1000));
        }

        // ── Detect Forwarded Messages (Robust Race Condition Handling) ──
        let isForward = false;

        // Loop to check for Snapshots/Forward flags (up to 3 times / 750ms)
        for (let i = 0; i < 3; i++) {
            const refType = (message.reference as any)?.type;
            const hasForwardFlag = (message as any).flags?.has?.(1 << 14); // IS_FORWARD

            // Robust snapshot check (Collection or Array)
            const snapshots = (message as any).messageSnapshots || (message as any).message_snapshots;
            const hasSnapshots = (snapshots?.size ?? snapshots?.length ?? 0) > 0;

            const isForwardRef = refType === 'FORWARD' || refType === 1;

            if (isForwardRef || hasForwardFlag || hasSnapshots) {
                isForward = true;
                break;
            }

            // Only wait if it *looks* like it might be a forward (has reference but no content yet?)
            if ((message.reference || hasForwardFlag) && !message.content && !hasSnapshots) {
                await new Promise(r => setTimeout(r, 250));
            } else {
                break; // Not a forward candidate
            }
        }

        if (isForward) {
            logger.info({ ...logContext, type: 'FORWARD' }, 'Processing Forwarded Message');
        } else {
            logger.info({ ...logContext, type: 'CREATE' }, 'Processing New Message');
        }

        // ── Parse Attachments & Content ──

        let content = message.content || '';
        let eligibleMedia: ParsedAttachment[] = [];
        let rejectedMedia: { attachment: ParsedAttachment, reason: string }[] = [];

        // 1. Process Main Message Attachments
        const rawAttachments = parseAttachments(message.attachments, (message as any).flags);
        const mainResult = validateMediaForwarding(rawAttachments, userPlan);
        eligibleMedia = [...mainResult.eligible];
        rejectedMedia = [...mainResult.rejected];

        // 2. Process Forwarded Content (Snapshots)
        if (isForward) {
            const snapshots = (message as any).messageSnapshots || (message as any).message_snapshots;
            const snapshot = snapshots?.first?.() || snapshots?.[0];

            let fwdContent = `-# 📨 Forwarded Message`;

            if (snapshot?.content) {
                fwdContent += `\n${snapshot.content}`;
            }

            // Handle Snapshot Media
            if ((snapshot?.attachments?.size ?? 0) > 0 || (snapshot?.attachments?.length ?? 0) > 0) {
                const snapParsed = parseAttachments(snapshot.attachments, (message as any).flags);
                const snapFiltered = validateMediaForwarding(snapParsed, userPlan);

                eligibleMedia = [...eligibleMedia, ...snapFiltered.eligible];
                rejectedMedia = [...rejectedMedia, ...snapFiltered.rejected];
            }

            // If main content is empty, use forward content
            if (!content) {
                content = fwdContent;
            } else {
                // If main content exists, append forward content
                content += `\n${fwdContent}`;
            }

            // Fallback: no snapshot but reference exists (Legacy Forward)
            if (!snapshot && message.reference?.messageId) {
                try {
                    const session = this.clients.get(token) || this.botClients.get(token);
                    if (session) {
                        let refMsg: Message | null = null;
                        if (message.reference.channelId === message.channelId) {
                            refMsg = await message.channel.messages.fetch(message.reference.messageId);
                        } else {
                            const ch = await (session.client as any).channels.fetch(message.reference.channelId) as any;
                            // Safe check for method existence
                            if (ch && typeof ch.messages?.fetch === 'function') {
                                refMsg = await ch.messages.fetch(message.reference.messageId);
                            }
                        }

                        if (refMsg) {
                            let fwd = `-# 📨 Forwarded Message`;
                            if (refMsg.content) fwd += `\n${refMsg.content}`;
                            content = content ? `${content}\n${fwd}` : fwd;

                            if (refMsg.attachments.size > 0) {
                                const refParsed = parseAttachments(refMsg.attachments, (refMsg as any).flags);
                                const refFiltered = validateMediaForwarding(refParsed, userPlan);
                                eligibleMedia = [...eligibleMedia, ...refFiltered.eligible];
                                rejectedMedia = [...rejectedMedia, ...refFiltered.rejected];
                            }
                        }
                    }
                } catch (err: any) {
                    logger.warn({ error: err.message }, 'Failed to fetch forwarded reference message');
                }
            }
        }

        // ── Process Replies (Non-Forward) ──
        else if (message.reference && message.reference.messageId) {
            // Optional: Reply handling logic if needed. 
        }

        // Detailed Media Logging
        if (eligibleMedia.length > 0) {
            const categories = [...new Set(eligibleMedia.map(m => m.category))];

            logger.info({
                ...logContext,
                mediaCount: eligibleMedia.length,
                categories,
                files: eligibleMedia.map(f => f.name)
            }, `Processing ${eligibleMedia.length} media item(s): ${categories.join(', ')}`);

            // Specific loggers for requested types
            if (categories.includes('image')) logger.info({ ...logContext, type: 'MEDIA_IMAGE' }, 'Mirroring Image Attachment');
            if (categories.includes('video')) logger.info({ ...logContext, type: 'MEDIA_VIDEO' }, 'Mirroring Video Attachment');
            if (categories.includes('audio')) logger.info({ ...logContext, type: 'MEDIA_AUDIO' }, 'Mirroring Audio Attachment');
            if (categories.includes('document')) logger.info({ ...logContext, type: 'MEDIA_DOCUMENT' }, 'Mirroring Document Attachment');
        }

        // Filter out empty messages
        if (!content && eligibleMedia.length === 0 && message.embeds.length === 0) {
            logger.debug({ ...logContext }, 'Skipping empty message (No content, media, or embeds)');
            return;
        }

        // Build Final Payload
        // Handle Rejection Notice
        const rejectionNotice = buildRejectionNotice(rejectedMedia);
        if (rejectionNotice) content += rejectionNotice;

        // Construct Webhook Files
        // If blur regions exist on the config (Elite only), process images through blur pipeline.
        // Non-image attachments and failed blurs fall back to direct URL (zero data loss).
        // SAFEGUARD: Explicit plan check — if user downgraded from ELITE, skip blur entirely.
        // The engine.ts sync already nullifies blurRegions for non-ELITE, but this is a
        // defense-in-depth guard against stale configs during sync delay or race conditions.
        const isEliteForBlur = userPlan === 'ELITE';
        const blurRegions = isEliteForBlur ? configs[0]?.blurRegions : undefined;

        if (!isEliteForBlur && configs[0]?.blurRegions) {
            logger.info({ ...logContext, userPlan }, 'Blur regions present but user is not ELITE — skipping blur processing (plan downgrade safeguard)');
        }

        let files = await processAttachmentsWithBlur(eligibleMedia, blurRegions, userPlan);

        // ── Apply Watermark onto images (if configured) ──
        // Chain after blur so watermarks appear on top of blurred regions.
        // PRO/ELITE users get either VISUAL (logo) or TEXT (burn text) overlay.
        const isPremiumForWm = ['PRO', 'ELITE'].includes(userPlan);
        const { watermarkType, watermarkImageUrl, watermarkPosition, watermarkOpacity, customWatermark: wmText, brandColor: wmColor } = configs[0] || {};

        let watermarkCfg: WatermarkConfig | undefined;

        if (isPremiumForWm && watermarkType === 'VISUAL' && watermarkImageUrl) {
            // VISUAL mode: overlay logo image
            watermarkCfg = {
                imageUrl: watermarkImageUrl,
                position: watermarkPosition || 'southeast',
                opacity: watermarkOpacity ?? 100
            };
        } else if (isPremiumForWm && watermarkType === 'TEXT' && wmText && wmText.trim()) {
            // TEXT mode: burn branding text directly onto image pixels via SVG
            const textOverlay: TextOverlayConfig = {
                text: wmText.startsWith('via ') ? wmText : `via ${wmText}`,
                fontSize: 20,
                color: '#FFFFFF',
                opacity: 70,
                position: watermarkPosition || 'southeast',
                enableBackdrop: true
            };
            watermarkCfg = {
                imageUrl: '', // No logo — text overlay only
                position: watermarkPosition || 'southeast',
                textOverlay
            };
        }

        if (watermarkCfg) {
            files = await processAttachmentsWithWatermark(files, watermarkCfg);
        }

        // Add Watermark
        // 5. Construct Embeds & Apply Branding
        const finalEmbeds = this.constructEmbed(message.embeds, configs[0], userPlan);

        // 6. Fallback: Add Watermark as Embed if No Embeds (Discord Hierarchy Fix)
        if (finalEmbeds.length === 0) {
            const isPremium = ['PRO', 'ELITE'].includes(userPlan);
            const { customWatermark, brandColor } = configs[0];

            let footerText = 'via DisBot Engine'; // Default
            let showEmbed = true;

            // VISUAL mode: The logo is already overlaid on images.
            // Skip the text-based footer embed when visual watermark is active.
            if (isPremium && watermarkType === 'VISUAL' && watermarkImageUrl) {
                showEmbed = false;
            } else if (isPremium && customWatermark !== undefined && customWatermark !== null) {
                if (customWatermark.trim() === "") {
                    showEmbed = false; // Clean Mode
                } else {
                    footerText = customWatermark.startsWith("via ") ? customWatermark : `via ${customWatermark}`;
                }
            } else if (isPremium === false) {
                // Force default for non-premium
                footerText = 'via DisBot Engine';
            }

            if (showEmbed) {
                // Resolve Color
                let colorInt = 0x5865F2; // Discord Blurple
                if (isPremium && brandColor && /^#[0-9A-F]{6}$/i.test(brandColor)) {
                    colorInt = parseInt(brandColor.replace('#', ''), 16);
                }

                // Create Branding Embed
                // We use a manual object to avoid dependency on discord.js Builders if not already imported, 
                // but we can just push a raw object which WebhookClient accepts.
                finalEmbeds.push({
                    description: `[Open Original Message](https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id})`,
                    color: colorInt,
                    footer: {
                        text: footerText,
                        icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png' // Generic icon or configurable
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }

        if (content.length > 2000) content = content.substring(0, 1997) + '...';

        if (content.length > 2000) content = content.substring(0, 1997) + '...';

        // ── ROUTING ──
        // Check if destination is Telegram (D2T) or Discord (Webhook)

        // Group by destination type
        const webhookConfigs = configs.filter(c => c.targetWebhookUrl);
        const telegramConfigs = configs.filter(c => c.targetTelegramChatId);

        const deliveryPromises: Promise<any>[] = [];

        // 1. Send to Discord Webhooks
        if (webhookConfigs.length > 0) {
            const payload: WebhookPayload = {
                username: message.author.username,
                avatarURL: message.author.displayAvatarURL(),
                content: content,
                files: files,
                embeds: finalEmbeds
            };

            const uniqueParams = new Map<string, string>();
            for (const cfg of webhookConfigs) {
                if (cfg.targetWebhookUrl && !uniqueParams.has(cfg.targetWebhookUrl)) {
                    uniqueParams.set(cfg.targetWebhookUrl, cfg.id);
                }
            }

            logger.info({
                ...logContext,
                targets: uniqueParams.size
            }, `Dispatching message to ${uniqueParams.size} webhook(s)`);

            const promises = Array.from(uniqueParams.entries()).map(([url, cfgId]) =>
                WebhookExecutor.send(url, payload, cfgId)
            );
            deliveryPromises.push(...promises);
        }

        // 2. Send to Telegram (D2T)
        if (telegramConfigs.length > 0) {
            // Lazy load service
            const { TelegramDeliveryService } = await import('./TelegramDeliveryService');
            const service = TelegramDeliveryService.getInstance();

            for (const cfg of telegramConfigs) {
                logger.info({ ...logContext, target: 'TELEGRAM', chatId: cfg.targetTelegramChatId }, 'Dispatching message to Telegram');

                // Map files to simple buffer structure for DeliveryService
                const tFiles = files.map(f => {
                    if (Buffer.isBuffer(f.attachment)) return { attachment: f.attachment, name: f.name };
                    // If it's a string (blur failed or not image), we might need to download it or pass URL?
                    // TelegramDeliveryService handles strings as URLs?
                    // Let's assume it does or we filter.
                    return { attachment: f.attachment, name: f.name };
                });

                deliveryPromises.push(
                    service.deliver(cfg, content, tFiles, {
                        username: message.author.username,
                        avatarURL: message.author.displayAvatarURL(),
                        embeds: message.embeds
                    })
                );
            }
        }

        const results = await Promise.allSettled(deliveryPromises);
        const successes = results.filter(r => r.status === 'fulfilled').length;
        const failures = results.filter(r => r.status === 'rejected').length;

        logger.info({
            ...logContext,
            successes,
            failures
        }, `Mirroring complete: ${successes} sent, ${failures} failed`);
    }

    // ──────────────────────────────────────────────────────────────
    //  HELPERS
    // ──────────────────────────────────────────────────────────────

    private groupConfigsByToken(configs: MirrorActiveConfig[]): Map<string, MirrorActiveConfig[]> {
        const map = new Map<string, MirrorActiveConfig[]>();
        for (const cfg of configs) {
            // Configs from new schema (via engine.ts) will have the encrypted token populated in userToken
            if (!cfg.userToken) continue;

            let token = cfg.userToken;

            // Decrypt if token is in encrypted format (IV:Tag:Data)
            if (token.includes(':')) {
                const decrypted = decrypt(token, process.env.ENCRYPTION_KEY || '');
                if (decrypted) {
                    token = decrypted;
                } else {
                    // Decryption failed (invalid key or corrupted data)
                    logger.warn({ configId: cfg.id }, 'Failed to decrypt Discord token for config');
                    continue;
                }
            }

            if (!token) continue;

            if (!map.has(token)) map.set(token, []);
            map.get(token)!.push(cfg);
        }
        return map;
    }

    private groupConfigsByChannel(configs: MirrorActiveConfig[]): Map<string, MirrorActiveConfig[]> {
        const map = new Map<string, MirrorActiveConfig[]>();
        for (const cfg of configs) {
            if (!map.has(cfg.sourceChannelId)) map.set(cfg.sourceChannelId, []);
            map.get(cfg.sourceChannelId)!.push(cfg);
        }
        return map;
    }

    private async invalidateAllConfigsForToken(token: string, reason: string, type: 'CUSTOM_HOOK' | 'MANAGED_BOT') {
        const sessionMap = type === 'CUSTOM_HOOK' ? this.clients : this.botClients;
        const session = sessionMap.get(token);
        if (!session) return;

        const ids = Array.from(session.configs.values()).flat().map(c => c.id);
        if (ids.length > 0) {
            await prisma.mirrorConfig.updateMany({
                where: { id: { in: ids } },
                data: { active: false, status: reason }
            });
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  EMBED CONSTRUCTION
    // ──────────────────────────────────────────────────────────────

    private constructEmbed(
        originalEmbeds: any[],
        config: MirrorActiveConfig,
        userPlan: string
    ): any[] {
        if (!originalEmbeds || originalEmbeds.length === 0) return [];

        const isPremium = ['PRO', 'ELITE'].includes(userPlan);
        const { customWatermark, brandColor } = config;

        // Default Branding Constants
        const DEFAULT_FOOTER = 'Via DisBot Engine';
        // const DEFAULT_COLOR = '#5865F2'; // Optional: Enforce default color if needed, currently leaving original if not branded

        // Map to API Embed Objects
        const newEmbeds = originalEmbeds.map(e => {
            // Convert to plain object if it has toJSON (MessageEmbed)
            return typeof e.toJSON === 'function' ? e.toJSON() : { ...e };
        });

        // Determine Branding Values
        // Plan Guard: Only PRO/ELITE can use custom values
        const targetText = (isPremium && customWatermark) ? customWatermark : DEFAULT_FOOTER;
        const targetColor = (isPremium && brandColor) ? brandColor : null;

        // Resolve Color Integer
        let colorInt: number | null = null;
        if (targetColor) {
            // Remove # if present and parse
            const hex = targetColor.replace(/^#/, '');
            colorInt = parseInt(hex, 16);
        }

        // Apply modifications
        for (let i = 0; i < newEmbeds.length; i++) {
            const embed = newEmbeds[i];

            // 1. Apply Brand Color (to Sidebar)
            if (colorInt !== null && !isNaN(colorInt)) {
                embed.color = colorInt;
            }

            // 2. Append Watermark (Only to the LAST embed)
            if (i === newEmbeds.length - 1) {
                const currentFooter = embed.footer?.text;
                let newFooterText = targetText;

                if (currentFooter) {
                    // Avoid double appending if already present (unlikely in fresh mirror but good safety)
                    if (!currentFooter.includes(targetText)) {
                        newFooterText = `${currentFooter} • ${targetText}`;
                    } else {
                        newFooterText = currentFooter;
                    }
                }

                embed.footer = {
                    text: newFooterText,
                    icon_url: embed.footer?.icon_url
                };

                // Ensure timestamp is valid string if present
                if (embed.timestamp) {
                    embed.timestamp = new Date(embed.timestamp).toISOString();
                }
            }
        }

        return newEmbeds;
    }

    public async shutdown() {
        const destroyPromises: Promise<void>[] = [];

        for (const [token, session] of this.clients) {
            destroyPromises.push(
                (async () => {
                    try { session.client.destroy(); } catch (err: any) {
                        logger.warn({ token: maskToken(token), error: err.message }, 'Error destroying selfbot client during shutdown');
                    }
                })()
            );
        }

        for (const [token, session] of this.botClients) {
            destroyPromises.push(
                (async () => {
                    try { session.client.destroy(); } catch (err: any) {
                        logger.warn({ token: maskToken(token), error: err.message }, 'Error destroying bot client during shutdown');
                    }
                })()
            );
        }

        await Promise.allSettled(destroyPromises);
        this.clients.clear();
        this.botClients.clear();
    }
}
