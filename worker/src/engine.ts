
import { Client, Message, Collection, TextChannel } from 'discord.js-selfbot-v13';
import { Client as BotClient, GatewayIntentBits, TextChannel as BotTextChannel } from 'discord.js';
import { WebhookClient } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { decrypt, validateEncryptionConfig, maskToken } from './lib/crypto';
import { logger } from './lib/logger';
import {
    parseAttachments,
    validateMediaForwarding,
    buildWebhookFilePayload,
    buildBotFilePayload,
    buildRejectionNotice,
    type MediaForwardResult,
    type ParsedAttachment
} from './lib/media';
import {
    enforcePathLimits,
    PLAN_PATH_LIMITS,
    PriorityMessageQueue,
} from './lib/plan-enforcer';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Validate Environment
validateEncryptionConfig();

// Setup Prisma
const prisma = new PrismaClient();

// Priority queue singleton
const messageQueue = PriorityMessageQueue.getInstance();

// ──────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────

type MirrorActiveConfig = {
    id: string;
    sourceChannelId: string;
    targetWebhookUrl: string;
    userToken: string;
    /** Mirror type determines forwarding strategy */
    type: 'CUSTOM_HOOK' | 'MANAGED_BOT';
    /** Target channel ID — only used for MANAGED_BOT */
    targetChannelId?: string;
    /** Owner's plan — controls media forwarding eligibility & size limits */
    userPlan: string;
    /** Owner's userId — for path-limit grouping */
    userId: string;
};

// ──────────────────────────────────────────────────────────────
//  Client Manager (Singleton)
// ──────────────────────────────────────────────────────────────

class ClientManager {
    private static instance: ClientManager;
    // Map<UserToken, { client, configs, lastActive }>
    private clients: Map<string, {
        client: Client;
        configs: Map<string, MirrorActiveConfig[]>;
        lastActive: number;
    }> = new Map();

    // Map<BotToken, { client, configs, lastActive }> — for MANAGED_BOT sessions
    private botClients: Map<string, {
        client: BotClient;
        configs: Map<string, MirrorActiveConfig[]>;
        lastActive: number;
    }> = new Map();

    private constructor() { }

    public static getInstance(): ClientManager {
        if (!ClientManager.instance) {
            ClientManager.instance = new ClientManager();
        }
        return ClientManager.instance;
    }

    // ────────────── SYNC CYCLE ──────────────
    // Called on startup and every 5 minutes.
    // Detects plan upgrades/downgrades automatically.

    public async sync() {
        logger.info('Starting sync cycle...');

        try {
            // 1. Fetch ALL active configs (both types) with user plan
            const activeConfigs = await prisma.mirrorConfig.findMany({
                where: { active: true },
                include: { user: { select: { plan: true } } }
            });

            // ── 2. Enforce path limits PER USER ──
            // Group by userId, apply plan caps, flatten back
            const configsByUser = new Map<string, any[]>();
            for (const cfg of activeConfigs) {
                const uid = cfg.userId;
                if (!configsByUser.has(uid)) configsByUser.set(uid, []);
                configsByUser.get(uid)!.push(cfg);
            }

            const allowedConfigs: any[] = [];

            for (const [userId, userConfigs] of configsByUser) {
                try {
                    const result = enforcePathLimits(userConfigs, userId);

                    // Add allowed configs to the global list
                    allowedConfigs.push(...result.allowed);

                    // Deactivate over-limit configs in the database (soft-disable)
                    if (result.overLimit.length > 0) {
                        const overIds = result.overLimit.map((c: any) => c.id);
                        await prisma.mirrorConfig.updateMany({
                            where: { id: { in: overIds } },
                            data: { active: false, status: 'PATH_LIMIT_REACHED' }
                        }).catch((err: any) => {
                            logger.error({ userId, error: err.message }, 'Failed to deactivate over-limit configs');
                        });
                    }
                } catch (error: any) {
                    // Isolated error — one user's limit error doesn't crash the engine
                    logger.error({
                        userId,
                        error: error.message || String(error),
                    }, 'Error enforcing path limits for user (skipping user, not crashing engine)');
                }
            }

            // ── 3. Separate by type & dispatch ──
            const hookConfigs: typeof allowedConfigs = [];
            const botConfigs: typeof allowedConfigs = [];

            for (const cfg of allowedConfigs) {
                if (cfg.type === 'CUSTOM_HOOK') hookConfigs.push(cfg);
                else if (cfg.type === 'MANAGED_BOT') botConfigs.push(cfg);
            }

            await this.syncCustomHookClients(hookConfigs);
            await this.syncManagedBotClients(botConfigs);

            logger.info({
                totalActive: allowedConfigs.length,
                hooks: hookConfigs.length,
                bots: botConfigs.length,
                queueDepth: messageQueue.queueDepth,
            }, 'Sync cycle complete');

        } catch (error: any) {
            logger.error({ msg: error.message || 'Unknown Error' }, 'Error during sync cycle');
        }
    }

    // ────────────── CUSTOM HOOK SYNC ──────────────

    private async syncCustomHookClients(activeConfigs: any[]) {
        const configsByToken = new Map<string, MirrorActiveConfig[]>();

        for (const cfg of activeConfigs) {
            if (!cfg.userToken) continue;

            let decryptedToken: string | null = null;

            if (cfg.userToken.includes(':')) {
                decryptedToken = decrypt(cfg.userToken, process.env.ENCRYPTION_KEY || '');
            } else {
                decryptedToken = cfg.userToken;
            }

            if (!decryptedToken) {
                logger.warn({ configId: cfg.id }, 'Invalid or undecryptable token. Marking config as invalid.');
                await this.markConfigInvalid(cfg.id, 'INVALID_TOKEN_FORMAT');
                continue;
            }

            if (!configsByToken.has(decryptedToken)) {
                configsByToken.set(decryptedToken, []);
            }
            configsByToken.get(decryptedToken)?.push({
                id: cfg.id,
                sourceChannelId: cfg.sourceChannelId,
                targetWebhookUrl: cfg.targetWebhookUrl,
                userToken: decryptedToken,
                type: 'CUSTOM_HOOK',
                userPlan: cfg.user?.plan || 'FREE',
                userId: cfg.userId,
            });
        }

        // Remove stale clients
        for (const [token, session] of this.clients) {
            if (!configsByToken.has(token)) {
                logger.info({ token: maskToken(token) }, 'Stopping inactive Custom Hook client');
                session.client.destroy();
                this.clients.delete(token);
            }
        }

        // Add / Update clients
        for (const [token, configs] of configsByToken) {
            const configMap = new Map<string, MirrorActiveConfig[]>();
            for (const cfg of configs) {
                if (!configMap.has(cfg.sourceChannelId)) {
                    configMap.set(cfg.sourceChannelId, []);
                }
                configMap.get(cfg.sourceChannelId)?.push(cfg);
            }

            if (this.clients.has(token)) {
                const session = this.clients.get(token)!;
                session.configs = configMap;
                session.lastActive = Date.now();
            } else {
                logger.info({ token: maskToken(token) }, 'Starting Custom Hook client session');
                await this.spawnSelfbotClient(token, configMap);
            }
        }
    }

    // ────────────── MANAGED BOT SYNC ──────────────

    private async syncManagedBotClients(activeConfigs: any[]) {
        const configsByToken = new Map<string, MirrorActiveConfig[]>();

        for (const cfg of activeConfigs) {
            if (!cfg.userToken) continue;

            let decryptedToken: string | null = null;

            if (cfg.userToken.includes(':')) {
                decryptedToken = decrypt(cfg.userToken, process.env.ENCRYPTION_KEY || '');
            } else {
                decryptedToken = cfg.userToken;
            }

            if (!decryptedToken) {
                logger.warn({ configId: cfg.id }, 'Invalid or undecryptable bot token. Marking config as invalid.');
                await this.markConfigInvalid(cfg.id, 'INVALID_TOKEN_FORMAT');
                continue;
            }

            if (!configsByToken.has(decryptedToken)) {
                configsByToken.set(decryptedToken, []);
            }
            configsByToken.get(decryptedToken)?.push({
                id: cfg.id,
                sourceChannelId: cfg.sourceChannelId,
                targetWebhookUrl: cfg.targetWebhookUrl,
                targetChannelId: cfg.targetChannelId ?? cfg.targetWebhookUrl,
                userToken: decryptedToken,
                type: 'MANAGED_BOT',
                userPlan: cfg.user?.plan || 'FREE',
                userId: cfg.userId,
            });
        }

        // Remove stale bot clients
        for (const [token, session] of this.botClients) {
            if (!configsByToken.has(token)) {
                logger.info({ token: maskToken(token) }, 'Stopping inactive Managed Bot client');
                session.client.destroy();
                this.botClients.delete(token);
            }
        }

        // Add / Update bot clients
        for (const [token, configs] of configsByToken) {
            const configMap = new Map<string, MirrorActiveConfig[]>();
            for (const cfg of configs) {
                if (!configMap.has(cfg.sourceChannelId)) {
                    configMap.set(cfg.sourceChannelId, []);
                }
                configMap.get(cfg.sourceChannelId)?.push(cfg);
            }

            if (this.botClients.has(token)) {
                const session = this.botClients.get(token)!;
                session.configs = configMap;
                session.lastActive = Date.now();
            } else {
                logger.info({ token: maskToken(token) }, 'Starting Managed Bot client session');
                await this.spawnBotClient(token, configMap);
            }
        }
    }

    // ────────────── CLIENT SPAWNING ──────────────

    private async spawnSelfbotClient(token: string, initialConfigs: Map<string, MirrorActiveConfig[]>) {
        const client = new Client({
            checkUpdate: false,
        } as any);

        const session = {
            client,
            configs: initialConfigs,
            lastActive: Date.now()
        };

        this.clients.set(token, session);

        client.on('ready', () => {
            logger.info({ user: client.user?.tag }, 'Custom Hook Client ready');
        });

        client.on('messageCreate', async (message: Message) => {
            this.dispatchMessage(token, message, 'CUSTOM_HOOK');
        });

        client.on('error', (err: any) => {
            logger.error({ msg: err.message || 'Unknown Connection Error' }, 'Selfbot client connection error');
        });

        try {
            if (token.length === 30 && !token.includes('.')) {
                logger.warn({ token: maskToken(token) }, 'WARNING: Token appears to be an OAuth Access Token. Gateway login requires a USER TOKEN.');
            }
            await client.login(token);
        } catch (error: any) {
            logger.error({ msg: error.message || 'Login Failed', code: error.code, token: maskToken(token) }, 'Selfbot login failed');
            if (error.message && (error.message.includes('Token') || error.code === 401)) {
                await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID', 'CUSTOM_HOOK');
                this.clients.delete(token);
            }
        }
    }

    private async spawnBotClient(token: string, initialConfigs: Map<string, MirrorActiveConfig[]>) {
        const client = new BotClient({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ]
        });

        const session = {
            client,
            configs: initialConfigs,
            lastActive: Date.now()
        };

        this.botClients.set(token, session);

        client.on('ready', () => {
            logger.info({ user: client.user?.tag }, 'Managed Bot Client ready');
        });

        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            this.dispatchMessage(token, message as any, 'MANAGED_BOT');
        });

        client.on('error', (err: any) => {
            logger.error({ msg: err.message || 'Unknown Connection Error' }, 'Bot client connection error');
        });

        try {
            await client.login(token);
        } catch (error: any) {
            logger.error({ msg: error.message || 'Login Failed', code: error.code, token: maskToken(token) }, 'Bot login failed');
            if (error.message && (error.message.includes('Token') || error.code === 401)) {
                await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID', 'MANAGED_BOT');
                this.botClients.delete(token);
            }
        }
    }

    // ────────────── MESSAGE DISPATCH (Priority Router) ──────────────

    /**
     * Entry point from the messageCreate event.
     * Routes the message through the PriorityMessageQueue:
     *  - ELITE → setImmediate (zero delay)
     *  - STARTER/PRO → shared FIFO queue
     */
    private dispatchMessage(token: string, message: Message, clientType: 'CUSTOM_HOOK' | 'MANAGED_BOT') {
        const sessionMap = clientType === 'CUSTOM_HOOK' ? this.clients : this.botClients;
        const session = sessionMap.get(token);
        if (!session) return;

        const configs = session.configs.get(message.channelId);
        if (!configs || configs.length === 0) return;

        const userPlan = configs[0].userPlan;

        messageQueue.enqueue({
            plan: userPlan,
            configId: configs[0].id,
            fn: () => this.handleMessage(token, message, clientType),
        });
    }

    // ────────────── MESSAGE HANDLING ──────────────

    private async handleMessage(token: string, message: Message, clientType: 'CUSTOM_HOOK' | 'MANAGED_BOT') {
        const sessionMap = clientType === 'CUSTOM_HOOK' ? this.clients : this.botClients;
        const session = sessionMap.get(token);
        if (!session) return;

        const configs = session.configs.get(message.channelId);
        if (!configs || configs.length === 0) return;

        // Detect forwarded messages
        const refType = (message.reference as any)?.type;
        const isForward = refType === 'FORWARD' || refType === 1
            || (message as any).flags?.has?.(1 << 14)
            || ((message as any).messageSnapshots?.size ?? 0) > 0;

        // Resolve the user's plan from the first matching config
        const userPlan = configs[0].userPlan;

        // ── Parse & filter attachments via validateMediaForwarding ──
        const rawAttachments = parseAttachments(message.attachments, (message as any).flags);
        let mediaResult: MediaForwardResult = { eligible: [], rejected: [] };

        if (rawAttachments.length > 0) {
            logger.debug({
                rawCount: rawAttachments.length,
                attachments: rawAttachments.map(a => ({
                    name: a.name,
                    category: a.category,
                    contentType: a.contentType,
                    size: a.size,
                    isVoiceMessage: a.isVoiceMessage,
                })),
                hasContent: !!message.content,
                plan: userPlan,
            }, 'Parsing attachments for forwarding');

            mediaResult = validateMediaForwarding(rawAttachments, userPlan);

            if (mediaResult.rejected.length > 0) {
                for (const r of mediaResult.rejected) {
                    logger.warn({
                        configId: configs[0].id,
                        fileName: r.attachment.name,
                        category: r.attachment.category,
                        reason: r.reason,
                        plan: userPlan,
                    }, `Media rejected: ${r.reason}`);
                }
            }

            if (mediaResult.eligible.length > 0) {
                logger.info({
                    eligible: mediaResult.eligible.length,
                    categories: [...new Set(mediaResult.eligible.map(e => e.category))],
                    plan: userPlan
                }, 'Media attachments eligible for forwarding');
            }
        }

        // ── Build base payload ──
        const payload: {
            username: string;
            avatarURL: string;
            content: string;
            embeds: any[];
            eligibleMedia: ParsedAttachment[];
        } = {
            username: message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            content: '',
            embeds: [],
            eligibleMedia: mediaResult.eligible,
        };

        // ── Handle Forwarded Content ──
        if (isForward) {
            const snapshot = (message as any).messageSnapshots?.first?.();

            let fwdContent = `-# 📨 Forwarded Message`;

            if (snapshot?.content) {
                fwdContent += `\n${snapshot.content}`;
            }

            if (snapshot?.attachments?.size > 0) {
                const urls = snapshot.attachments.map((a: any) => a.url);
                fwdContent += `\n${urls.join('\n')}`;
            }

            payload.content = fwdContent;

            // Fallback: no snapshot, try fetching original reference
            if (!snapshot && message.reference?.messageId) {
                try {
                    let refMsg: Message | null = null;
                    if (message.reference.channelId === message.channelId) {
                        refMsg = await message.channel.messages.fetch(message.reference.messageId);
                    } else {
                        const ch = await (session.client as any).channels.fetch(message.reference.channelId) as any;
                        if (ch?.messages?.fetch) {
                            refMsg = await ch.messages.fetch(message.reference.messageId);
                        }
                    }
                    if (refMsg) {
                        let fwd = `-# 📨 Forwarded Message`;
                        if (refMsg.content) fwd += `\n${refMsg.content}`;
                        payload.content = fwd;

                        if (refMsg.attachments.size > 0) {
                            const refParsed = parseAttachments(refMsg.attachments, (refMsg as any).flags);
                            const refFiltered = validateMediaForwarding(refParsed, userPlan);
                            // Merge allowed media from forwarded message
                            payload.eligibleMedia = [...payload.eligibleMedia, ...refFiltered.eligible];
                        }
                    }
                } catch (err: any) {
                    logger.warn({ error: err.message }, 'Failed to fetch forwarded reference message');
                }
            }

        } else if (message.reference && message.reference.messageId) {
            // ═══ REPLY MESSAGE ═══
            payload.content = message.content || '';
            payload.embeds = message.embeds as any;

            try {
                let ref: Message | null = null;
                if (message.reference.channelId === message.channelId) {
                    ref = await message.channel.messages.fetch(message.reference.messageId);
                } else {
                    const ch = await (session.client as any).channels.fetch(message.reference.channelId) as any;
                    if (ch?.messages?.fetch) {
                        ref = await ch.messages.fetch(message.reference.messageId);
                    }
                }
                if (ref) {
                    const preview = ref.content
                        ? ref.content.substring(0, 60).replace(/\n/g, ' ')
                        : '📎 Attachment';
                    const ellipsis = ref.content && ref.content.length > 60 ? '...' : '';
                    payload.content = `-# ↩️ ${ref.author.username}: ${preview}${ellipsis}\n${message.content || ''}`;
                }
            } catch {
                // Reply fetch failed — send reply content as-is
            }

        } else {
            // ═══ REGULAR MESSAGE ═══
            payload.content = message.content || '';
            payload.embeds = message.embeds as any;
        }

        // ── Handle SNAPSHOT Strategy (Images/Videos) ──
        // Generate Embeds for these items
        const snapshotItems = payload.eligibleMedia.filter(att => att.strategy === 'SNAPSHOT');

        for (const item of snapshotItems) {
            if (item.category === 'image') {
                payload.embeds.push({
                    title: item.name,
                    url: item.url,
                    image: { url: item.url },
                    color: 0x2b2d31 // Discord Dark Theme Color
                });
            } else if (item.category === 'video') {
                // For videos, we create a rich embed with the link
                payload.embeds.push({
                    title: `🎥 ${item.name}`,
                    description: `[Click to Watch Video](${item.url})`,
                    url: item.url,
                    color: 0x2b2d31
                });
            }
        }

        // Append rejection notices
        const rejectionNotice = buildRejectionNotice(mediaResult.rejected);
        if (rejectionNotice) {
            payload.content += rejectionNotice;
        }

        // Add watermark — always add when there's content OR files/embeds
        const hasFiles = payload.eligibleMedia.some(att => att.strategy === 'STREAM');
        const hasEmbeds = payload.embeds.length > 0;
        if (payload.content || hasFiles || hasEmbeds) {
            payload.content = (payload.content || '') + `\n-# 📡 via DisBot Engine`;
        }

        // Truncate content to 2000 chars (Discord API limit)
        if (payload.content && payload.content.length > 2000) {
            payload.content = payload.content.substring(0, 1997) + '...';
        }

        // Skip truly empty messages (no content, no embeds, no files)
        if (!payload.content && !hasEmbeds && !hasFiles) {
            return;
        }

        // ── Execute forwarding in parallel ──
        const promises = configs.map(async (cfg) => {
            try {
                if (cfg.type === 'CUSTOM_HOOK') {
                    await this.forwardViaWebhook(cfg, payload);
                } else if (cfg.type === 'MANAGED_BOT') {
                    await this.forwardViaManagedBot(cfg, payload, token);
                }
            } catch (error: any) {
                // Isolated: one config's error doesn't crash the others
                logger.error({
                    configId: cfg.id,
                    error: error.message || String(error),
                }, 'Forwarding error (isolated)');
            }
        });

        await Promise.all(promises);
    }

    // ────────────── WEBHOOK FORWARDING ──────────────

    private async forwardViaWebhook(
        cfg: MirrorActiveConfig,
        payload: {
            content: string;
            username: string;
            avatarURL: string;
            embeds: any[];
            eligibleMedia: ParsedAttachment[];
        }
    ) {
        // Build fresh file payload (including streams) for this request
        const files = await buildWebhookFilePayload(payload.eligibleMedia);

        const sendPayload: any = {
            content: payload.content || undefined,
            username: payload.username,
            avatarURL: payload.avatarURL,
            embeds: payload.embeds.length > 0 ? payload.embeds : undefined,
            files: files.length > 0 ? files : undefined,
            allowedMentions: { parse: [] as string[] }
        };

        // Ensure we always have content when files are present (Discord API requirement)
        if (!sendPayload.content && sendPayload.files) {
            sendPayload.content = `-# 📡 via DisBot Engine`;
        }

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const webhookClient = new WebhookClient({ url: cfg.targetWebhookUrl });

                const controller = new AbortController();
                // 60s timeout to allow large files (videos) to upload
                const timeout = setTimeout(() => controller.abort(), 60000);

                try {
                    await webhookClient.send({
                        ...sendPayload,
                        // @ts-ignore - abort signal for timeout
                        signal: controller.signal
                    });
                } finally {
                    clearTimeout(timeout);
                }

                // Success — update last active (fire and forget)
                prisma.mirrorConfig.update({
                    where: { id: cfg.id },
                    data: { updatedAt: new Date(), lastActiveAt: new Date() }
                }).catch(() => { });

                return;

            } catch (error: any) {
                const isLastAttempt = attempt === 3;

                // 413 Payload Too Large
                if (error.status === 413 || error.code === 40005) {
                    logger.error({
                        configId: cfg.id,
                        fileCount: sendPayload.files?.length,
                        status: 413
                    }, 'Failed to forward media: Payload too large (413). Retrying without files.');

                    sendPayload.files = undefined;
                    if (sendPayload.content) {
                        sendPayload.content += '\n-# ⚠️ Media attachments were too large to forward';
                    }
                    continue;
                }

                // Webhook permanently invalid
                if (error.code === 10015 || error.code === 404) {
                    logger.error({ configId: cfg.id, code: error.code }, 'Webhook not found — disabling config');
                    this.markConfigInvalid(cfg.id, 'WEBHOOK_INVALID').catch(() => { });
                    return;
                }

                // URL expired
                if (error.message?.includes('Invalid URL') || error.message?.includes('expired')) {
                    logger.error({
                        configId: cfg.id,
                        error: error.message,
                    }, 'Failed to forward media: URL expired or invalid');
                    sendPayload.files = undefined;
                    continue;
                }

                if (isLastAttempt) {
                    logger.error({
                        error: error.message || String(error),
                        code: error.code,
                        status: error.status,
                        configId: cfg.id,
                        attempt,
                    }, 'Webhook failed after 3 attempts');
                } else {
                    // Retry logic:
                    // If it's a timeout (AbortError), retry WITH files (maybe it was just slow).
                    // If it's another error (e.g. 400 Bad Request), retry WITHOUT files as fallback.
                    const isTimeout = error.name === 'AbortError' || error.code === 'ETIMEDOUT';

                    if (attempt === 1 && !isTimeout && (sendPayload.files || sendPayload.embeds)) {
                        logger.warn({ configId: cfg.id, error: error.message }, 'First attempt failed with non-timeout error. Retrying without files/embeds.');
                        sendPayload.files = undefined;
                        sendPayload.embeds = undefined;
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }
    }

    // ────────────── MANAGED BOT FORWARDING ──────────────

    private async forwardViaManagedBot(
        cfg: MirrorActiveConfig,
        payload: {
            content: string;
            username: string;
            avatarURL: string;
            embeds: any[];
            eligibleMedia: ParsedAttachment[];
        },
        botToken: string
    ) {
        const botSession = this.botClients.get(botToken);
        if (!botSession) {
            logger.error({ configId: cfg.id }, 'No bot session found for managed bot forwarding');
            return;
        }

        const targetChannelId = cfg.targetChannelId || cfg.targetWebhookUrl;

        // Build fresh bot files (streams)
        let botFiles = await buildBotFilePayload(payload.eligibleMedia);

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const channel = await botSession.client.channels.fetch(targetChannelId);
                if (!channel || !channel.isTextBased()) {
                    logger.error({ configId: cfg.id, channelId: targetChannelId }, 'Target channel not found or not text-based');
                    await this.markConfigInvalid(cfg.id, 'CHANNEL_NOT_FOUND');
                    return;
                }

                const sendOptions: any = {
                    allowedMentions: { parse: [] as string[] }
                };

                let content = '';
                if (payload.username) {
                    content += `-# 👤 ${payload.username}\n`;
                }
                if (payload.content) {
                    content += payload.content;
                }
                // Ensure we always have content when files are present
                if (!content && botFiles.length > 0) {
                    content = `-# 📡 via DisBot Engine`;
                }
                if (content) {
                    sendOptions.content = content.substring(0, 2000);
                }

                if (payload.embeds.length > 0) {
                    sendOptions.embeds = payload.embeds;
                }

                if (botFiles.length > 0) {
                    sendOptions.files = botFiles;
                }

                await (channel as any).send(sendOptions);

                prisma.mirrorConfig.update({
                    where: { id: cfg.id },
                    data: { updatedAt: new Date(), lastActiveAt: new Date() }
                }).catch(() => { });

                return;

            } catch (error: any) {
                const isLastAttempt = attempt === 3;

                // 413 Payload Too Large
                if (error.status === 413 || error.code === 40005) {
                    logger.error({
                        configId: cfg.id,
                        fileCount: botFiles.length,
                        status: 413
                    }, 'Failed to forward media via bot: Payload too large (413)');
                    botFiles = [];
                    continue;
                }

                // Missing permissions
                if (error.code === 50013 || error.code === 50001) {
                    logger.error({
                        configId: cfg.id,
                        code: error.code
                    }, 'Bot lacks permissions to send in target channel');
                    await this.markConfigInvalid(cfg.id, 'MISSING_PERMISSIONS');
                    return;
                }

                // URL expired
                if (error.message?.includes('Invalid URL') || error.message?.includes('expired') || error.message?.includes('Request entity too large')) {
                    logger.error({
                        configId: cfg.id,
                        error: error.message,
                    }, 'Failed to forward media via bot: URL expired or file error');
                    botFiles = [];
                    continue;
                }

                if (isLastAttempt) {
                    logger.error({
                        error: error.message || String(error),
                        code: error.code,
                        status: error.status,
                        configId: cfg.id,
                        attempt,
                    }, 'Managed Bot send failed after 3 attempts');
                } else {
                    if (attempt === 1 && botFiles.length > 0) {
                        botFiles = [];
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }
    }

    // ────────────── ADMIN HELPERS ──────────────

    private async markConfigInvalid(id: string, reason: string) {
        logger.warn({ configId: id, reason }, 'Marking config as invalid');
        await prisma.mirrorConfig.update({
            where: { id },
            data: { active: false, status: reason }
        });
    }

    private async invalidateAllConfigsForToken(token: string, reason: string, clientType: 'CUSTOM_HOOK' | 'MANAGED_BOT') {
        const sessionMap = clientType === 'CUSTOM_HOOK' ? this.clients : this.botClients;
        const session = sessionMap.get(token);
        if (!session) return;

        const allConfigIds = Array.from(session.configs.values()).flat().map(c => c.id);

        if (allConfigIds.length > 0) {
            logger.warn({ count: allConfigIds.length, reason, token: maskToken(token) }, 'Invalidating configs for token');
            await prisma.mirrorConfig.updateMany({
                where: { id: { in: allConfigIds } },
                data: { active: false, status: reason }
            });
        }
    }

    public async shutdown() {
        logger.info('Shutting down all clients...');

        for (const [token, session] of this.clients) {
            try {
                session.client.destroy();
                logger.info({ token: maskToken(token) }, 'Selfbot client destroyed');
            } catch (e: any) {
                logger.error({ msg: e.message || 'Error', token: maskToken(token) }, 'Error destroying selfbot client');
            }
        }
        this.clients.clear();

        for (const [token, session] of this.botClients) {
            try {
                session.client.destroy();
                logger.info({ token: maskToken(token) }, 'Bot client destroyed');
            } catch (e: any) {
                logger.error({ msg: e.message || 'Error', token: maskToken(token) }, 'Error destroying bot client');
            }
        }
        this.botClients.clear();
    }
}

// ──────────────────────────────────────────────────────────────
//  Start Engine
// ──────────────────────────────────────────────────────────────

const manager = ClientManager.getInstance();

// Initial Run
manager.sync();

// Poll every 5 minutes — picks up plan upgrades/downgrades automatically
const interval = setInterval(() => {
    manager.sync();
}, 5 * 60 * 1000);

// Graceful Shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Shutting down...');
    clearInterval(interval);
    await manager.shutdown();
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Shutting down...');
    clearInterval(interval);
    await manager.shutdown();
    await prisma.$disconnect();
    process.exit(0);
});

logger.info({
    pathLimits: PLAN_PATH_LIMITS,
    syncInterval: '5 minutes',
}, 'DISBOT Mirroring Engine Started — Feature Tiering Active');
