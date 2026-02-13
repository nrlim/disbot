
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
    buildFilePayloadBuffer,
    buildRejectionNotice,
    type MediaForwardResult,
    type ParsedAttachment,
    type MediaStrategy
} from './lib/media';
import {
    enforcePathLimits,
    PLAN_PATH_LIMITS,
    PriorityMessageQueue,
} from './lib/plan-enforcer';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ──────────────────────────────────────────────────────────────
//  Background Task Manager — Resource Guard
//
//  Tracks all fire-and-forget snapshot forwarding tasks.
//  Enforces a per-task timeout (default 10s) and auto-cleans
//  settled/timed-out entries to maintain the 114.5 MB footprint.
// ──────────────────────────────────────────────────────────────

interface TrackedTask {
    promise: Promise<void>;
    messageId: string;
    startedAt: number;
    abortController: AbortController;
}

class BackgroundTaskManager {
    private static instance: BackgroundTaskManager;
    private tasks: Map<string, TrackedTask> = new Map();

    /** Max time a snapshot forwarding task may run before it's force-aborted.
     *  Set to 300s (5m) for Elite Tier heavy media tasks & retry buffers. */
    private static readonly TASK_TIMEOUT_MS = 300_000;

    /** Cleanup interval — sweep every 10 seconds */
    private static readonly CLEANUP_INTERVAL_MS = 10_000;

    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    private constructor() {
        this.cleanupTimer = setInterval(() => this.sweep(), BackgroundTaskManager.CLEANUP_INTERVAL_MS);
        // Ensure the interval doesn't prevent process exit
        if (this.cleanupTimer.unref) this.cleanupTimer.unref();
    }

    public static getInstance(): BackgroundTaskManager {
        if (!BackgroundTaskManager.instance) {
            BackgroundTaskManager.instance = new BackgroundTaskManager();
        }
        return BackgroundTaskManager.instance;
    }

    /**
     * Track a background snapshot task with an automatic timeout.
     * Returns the AbortController so the caller can wire up timeout logic.
     */
    public track(taskId: string, messageId: string, taskFn: (signal: AbortSignal) => Promise<void>): void {
        const ac = new AbortController();

        // Auto-abort after TASK_TIMEOUT_MS
        const timer = setTimeout(() => {
            ac.abort();
            logger.warn({ taskId, messageId, timeoutMs: BackgroundTaskManager.TASK_TIMEOUT_MS }, '[Async] Snapshot task timed out — aborted after 10s');
        }, BackgroundTaskManager.TASK_TIMEOUT_MS);

        const wrappedPromise = taskFn(ac.signal)
            .catch((err: any) => {
                // Swallow AbortError — it's expected on timeout
                if (err?.name === 'AbortError' || ac.signal.aborted) return;
                logger.error({ taskId, messageId, error: err.message || String(err) },
                    '[Async] Background snapshot task failed');
            })
            .finally(() => {
                clearTimeout(timer);
                this.tasks.delete(taskId);
            });

        this.tasks.set(taskId, {
            promise: wrappedPromise,
            messageId,
            startedAt: Date.now(),
            abortController: ac,
        });
    }

    /** Sweep stale entries (defensive — tasks self-cleanup in .finally) */
    private sweep(): void {
        const now = Date.now();
        for (const [id, task] of this.tasks) {
            if (now - task.startedAt > BackgroundTaskManager.TASK_TIMEOUT_MS * 2) {
                task.abortController.abort();
                this.tasks.delete(id);
                logger.warn({ taskId: id, messageId: task.messageId },
                    '[Async] Swept stale background task');
            }
        }
    }

    /** Current number of in-flight background tasks */
    public get activeCount(): number {
        return this.tasks.size;
    }

    /** Graceful shutdown — abort all pending tasks */
    public async shutdown(): Promise<void> {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        for (const [id, task] of this.tasks) {
            task.abortController.abort();
        }
        // Wait for all tasks to settle (they'll resolve/reject quickly after abort)
        await Promise.allSettled(Array.from(this.tasks.values()).map(t => t.promise));
        this.tasks.clear();
    }
}

// Singleton
const backgroundTasks = BackgroundTaskManager.getInstance();

// Validate Environment
validateEncryptionConfig();

// Setup Prisma
const prisma = new PrismaClient();

// Priority queue singleton
const messageQueue = PriorityMessageQueue.getInstance();

// Plan priority for resolving best available tier
const PLAN_PRIORITY: Record<string, number> = { 'FREE': 0, 'STARTER': 1, 'PRO': 2, 'ELITE': 3 };


import { TelegramListener, TelegramConfig } from './lib/telegramMTProto';

// ──────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────

type MirrorActiveConfig = {
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
};

// Singleton for Telegram Listener
const telegramListener = TelegramListener.getInstance();

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
            // The query naturally returns new fields because they are part of the model
            const activeConfigsRaw = await prisma.mirrorConfig.findMany({
                where: { active: true },
                include: { user: { select: { plan: true } } }
            });

            // Map Prisma result to MirrorActiveConfig
            // We need to handle nulls/formatting
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const activeConfigs: MirrorActiveConfig[] = activeConfigsRaw.map((cfg: any) => {
                // Auto-detect platform if not explicitly set
                let platform = (cfg.sourcePlatform as 'DISCORD' | 'TELEGRAM');
                if (!platform && cfg.telegramSession) platform = 'TELEGRAM';
                if (!platform) platform = 'DISCORD';

                return {
                    id: cfg.id,
                    sourcePlatform: platform,
                    sourceChannelId: cfg.sourceChannelId || '',
                    userToken: cfg.userToken || undefined,
                    telegramSession: cfg.telegramSession || undefined,
                    telegramChatId: cfg.telegramChatId || undefined,
                    telegramTopicId: cfg.telegramTopicId || undefined,
                    targetWebhookUrl: cfg.targetWebhookUrl,
                    type: cfg.type as 'CUSTOM_HOOK' | 'MANAGED_BOT',
                    targetChannelId: cfg.targetChannelId || undefined,
                    userPlan: cfg.user?.plan || 'FREE',
                    userId: cfg.userId
                };
            });

            // ── 2. Enforce path limits PER USER ──
            // Group by userId, apply plan caps, flatten back
            const configsByUser = new Map<string, any[]>();
            for (const cfg of activeConfigs) {
                const uid = cfg.userId;
                if (!configsByUser.has(uid)) configsByUser.set(uid, []);
                configsByUser.get(uid)!.push(cfg);
            }

            const allowedConfigs: MirrorActiveConfig[] = [];

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

            // ── 3. Separate by Platform & Type ──
            const discordHookConfigs: MirrorActiveConfig[] = [];
            const discordBotConfigs: MirrorActiveConfig[] = [];
            const telegramConfigs: TelegramConfig[] = []; // Using simplified type for Telegram listener

            logger.info({
                totalAllowed: allowedConfigs.length,
                breakdown: {
                    telegram: allowedConfigs.filter(c => c.sourcePlatform === 'TELEGRAM').length,
                    discord: allowedConfigs.filter(c => c.sourcePlatform === 'DISCORD').length
                }
            }, '[Sync] Config breakdown by platform');

            for (const cfg of allowedConfigs) {
                if (cfg.sourcePlatform === 'TELEGRAM') {
                    // Decrypt token if needed before passing to listener
                    // Assuming telegramSession is encrypted
                    let decryptedSession = cfg.telegramSession || '';
                    if (decryptedSession && decryptedSession.includes(':')) {
                        // Decrypting
                        decryptedSession = decrypt(decryptedSession, process.env.ENCRYPTION_KEY || '') || '';
                    }

                    if (decryptedSession && cfg.telegramChatId) {
                        telegramConfigs.push({
                            id: cfg.id,
                            telegramSession: decryptedSession,
                            telegramChatId: cfg.telegramChatId,
                            telegramTopicId: cfg.telegramTopicId,
                            targetWebhookUrl: cfg.targetWebhookUrl,
                        });
                    } else {
                        logger.warn({ configId: cfg.id, hasSession: !!decryptedSession, hasChatId: !!cfg.telegramChatId }, '[Sync] Skipping Telegram config: Missing session or Chat ID');
                    }
                    continue;
                }

                // Implicitly DISCORD
                if (cfg.type === 'CUSTOM_HOOK') discordHookConfigs.push(cfg);
                else if (cfg.type === 'MANAGED_BOT') discordBotConfigs.push(cfg);
            }

            // Sync Clients
            await this.syncCustomHookClients(discordHookConfigs);
            await this.syncManagedBotClients(discordBotConfigs);
            await telegramListener.sync(telegramConfigs);

            logger.info({
                totalActive: allowedConfigs.length,
                discordHooks: discordHookConfigs.length,
                discordBots: discordBotConfigs.length,
                telegramListeners: telegramConfigs.length,
                queueDepth: messageQueue.queueDepth,
            }, 'Sync cycle complete');

        } catch (error: any) {
            logger.error({ msg: error.message || 'Unknown Error' }, 'Error during sync cycle');
        }
    }

    // ────────────── CUSTOM HOOK SYNC ──────────────

    private async syncCustomHookClients(activeConfigs: MirrorActiveConfig[]) {
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
                sourcePlatform: cfg.sourcePlatform,
                sourceChannelId: cfg.sourceChannelId,
                targetWebhookUrl: cfg.targetWebhookUrl,
                userToken: decryptedToken,
                type: 'CUSTOM_HOOK',
                userPlan: cfg.userPlan,
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

    private async syncManagedBotClients(activeConfigs: MirrorActiveConfig[]) {
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
                sourcePlatform: cfg.sourcePlatform,
                sourceChannelId: cfg.sourceChannelId,
                targetWebhookUrl: cfg.targetWebhookUrl,
                targetChannelId: cfg.targetChannelId ?? cfg.targetWebhookUrl,
                userToken: decryptedToken,
                type: 'MANAGED_BOT',
                userPlan: cfg.userPlan,
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

        client.on('messageUpdate', async (oldMessage, newMessage) => {
            if (newMessage.partial) {
                try { await newMessage.fetch(); } catch { return; }
            }
            // ── Reliability: Catch Placeholder Updates ──
            // Triggers if content/attachments were added or significantly changed
            const oldContent = oldMessage.partial ? null : oldMessage.content;
            const oldAttachCount = oldMessage.partial ? 0 : oldMessage.attachments.size;

            const hasNewContent = !oldContent && !!newMessage.content;
            const hasNewMedia = oldAttachCount === 0 && newMessage.attachments.size > 0;
            const contentChanged = oldContent !== newMessage.content && !!newMessage.content;

            if (hasNewContent || hasNewMedia || contentChanged) {
                this.dispatchMessage(token, newMessage as Message, 'CUSTOM_HOOK');
            }
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

        client.on('messageUpdate', async (oldMessage, newMessage) => {
            if (newMessage.author?.bot) return;
            if (newMessage.partial) {
                try { await newMessage.fetch(); } catch { return; }
            }
            const oldContent = oldMessage.partial ? null : oldMessage.content;
            const oldAttachCount = oldMessage.partial ? 0 : oldMessage.attachments.size;

            if (
                (!oldContent && newMessage.content) ||
                (oldAttachCount === 0 && newMessage.attachments.size > 0) ||
                (oldContent !== newMessage.content && !!newMessage.content)
            ) {
                this.dispatchMessage(token, newMessage as any, 'MANAGED_BOT');
            }
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

        // Resolve the best plan from all configs to ensure Elite priority is respected
        const userPlan = configs.reduce((best, current) => {
            const pCurrent = PLAN_PRIORITY[current.userPlan] ?? 0;
            const pBest = PLAN_PRIORITY[best] ?? 0;
            return pCurrent > pBest ? current.userPlan : best;
        }, 'FREE');

        messageQueue.enqueue({
            plan: userPlan,
            configId: configs[0].id,
            fn: () => this.handleMessage(token, message, clientType),
        });
    }

    // ────────────── NON-BLOCKING SNAPSHOT FORWARDING ──────────────

    /**
     * Async fire-and-forget function for SNAPSHOT strategy items.
     *
     * Extracts `proxy_url` from attachment metadata immediately (zero I/O),
     * builds lightweight embeds, and forwards them in the background.
     * Uses `Promise.allSettled` to ensure one failing config never blocks
     * or crashes the others.
     *
     * IMPORTANT: Receives deep-copied configs and snapshot items to prevent
     * state mutation from the main thread during the next message cycle.
     *
     * Wrapped with a 10-second AbortController timeout via BackgroundTaskManager.
     */
    private async forwardSnapshotAsync(
        configs: MirrorActiveConfig[],
        snapshotItems: ParsedAttachment[],
        basePayload: {
            username: string;
            avatarURL: string;
            content: string;
        },
        messageId: string,
        token: string,
        signal: AbortSignal
    ): Promise<void> {
        // ── Fast-Path Strategy: URL-based Forwarding Only ──
        // We force SNAPSHOT strategy for Images/Videos for ALL tiers (including Elite).
        // This prevents re-download/re-upload overhead and mimics native "Forward Message" behavior.

        logger.debug({ messageId, items: snapshotItems.length }, '[Async] Fast-Path: Processing snapshot items via Proxy URLs');

        const snapshotEmbeds: any[] = [];
        const fallbackUrls: string[] = [];

        for (const item of snapshotItems) {
            if (signal.aborted) return;

            const proxyUrl = item.proxyUrl || item.url;
            fallbackUrls.push(proxyUrl);

            // Build standard embeds
            if (item.category === 'image') {
                snapshotEmbeds.push({
                    image: { url: proxyUrl },
                    color: 0x2b2d31
                });
            } else if (item.category === 'video') {
                snapshotEmbeds.push({
                    title: `🎥 ${item.name}`,
                    description: `[Click to Watch Video](${proxyUrl})`,
                    url: proxyUrl,
                    color: 0x2b2d31
                });
            }
        }

        if (snapshotEmbeds.length === 0) return;

        // ── Dispatch to all configs ──
        const results = await Promise.allSettled(
            configs.map(async (cfg) => {
                if (signal.aborted) throw new DOMException('Snapshot task timed out', 'AbortError');

                // ── Re-validate media for THIS specific config ──
                // Prevents feature leakage (e.g. Free plan getting Videos)
                const { eligible } = validateMediaForwarding(snapshotItems, cfg.userPlan);
                if (eligible.length === 0) return; // Nothing allowed for this plan

                // Construct config-specific embeds from eligible items
                const configEmbeds: any[] = [];
                for (const item of eligible) {
                    const proxyUrl = item.proxyUrl || item.url;
                    if (item.category === 'image') {
                        configEmbeds.push({ image: { url: proxyUrl }, color: 0x2b2d31 });
                    } else if (item.category === 'video') {
                        configEmbeds.push({
                            title: `🎥 ${item.name}`,
                            description: `[Click to Watch Video](${proxyUrl})`,
                            url: proxyUrl,
                            color: 0x2b2d31
                        });
                    }
                }

                if (configEmbeds.length === 0) return;

                if (cfg.type === 'CUSTOM_HOOK') {
                    // Pass undefined for 'configFiles' as we are strictly in Fast-Path
                    await this.sendWebhookSnapshot(cfg, basePayload, configEmbeds, fallbackUrls, messageId, signal, undefined);
                } else if (cfg.type === 'MANAGED_BOT') {
                    await this.sendBotSnapshot(cfg, basePayload, configEmbeds, fallbackUrls, messageId, token, signal, undefined);
                }
            })
        );

        // ── Log results ──
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            logger.warn({
                messageId,
                failed: failures.length,
                total: configs.length,
                reason: (failures[0] as PromiseRejectedResult).reason?.message
            }, '[Async] Some snapshot tasks failed');
        } else {
            logger.debug({ messageId, mode: 'FAST_PATH_URL' }, '[Async] Snapshot tasks completed');
        }
    }

    // ────────────── SNAPSHOT WEBHOOK DELIVERY ──────────────

    /**
     * Dedicated webhook sender for SNAPSHOT payloads.
     *
     * Key differences from `forwardViaWebhook`:
     * - Strict Discord-compliant payload: `content` is always a string (never null/undefined)
     * - 10s request timeout (no files to upload, so 60s is overkill)
     * - AbortError diagnostics: logs DNS/Connection/TLS failure context
     * - Fallback: if embed delivery fails, retries as a plain-text URL message
     */
    private async sendWebhookSnapshot(
        cfg: MirrorActiveConfig,
        basePayload: { username: string; avatarURL: string; content: string },
        embeds: any[],
        fallbackUrls: string[],
        messageId: string,
        taskSignal: AbortSignal,
        files?: any[]
    ): Promise<void> {
        const webhookClient = new WebhookClient({ url: cfg.targetWebhookUrl });

        // ── Strict payload structure (content is always "" not null/undefined) ──
        // ── Elite Tier: Send with Files if available ──
        const sendPayload: any = {
            content: basePayload.content || '',
            username: basePayload.username,
            avatarURL: basePayload.avatarURL,
            embeds: embeds,
            files: files,
            allowedMentions: { parse: [] }
        };

        // If sending files, ensure content is non-empty (Discord requirement workaround)
        if (files && files.length > 0 && !sendPayload.content) {
            sendPayload.content = '-# 📡 via DisBot Engine';
        }

        // ── Attempt 1: Send with embeds ──
        for (let attempt = 1; attempt <= 2; attempt++) {
            // Bail if the background task was timed out
            if (taskSignal.aborted) {
                throw new DOMException('Background task aborted', 'AbortError');
            }

            const controller = new AbortController();
            // Dynamic timeout: 30s for lightweight JSON (Fast-Path), 180s (3m) for file uploads (Elite Buffer)
            const timeoutDuration = (files && files.length > 0) ? 180_000 : 30_000;
            const requestTimer = setTimeout(() => controller.abort(), timeoutDuration);

            try {
                await webhookClient.send({
                    ...sendPayload,
                    // @ts-ignore - abort signal for per-request timeout
                    signal: controller.signal
                });

                clearTimeout(requestTimer);

                // Success — update lastActiveAt (fire and forget)
                prisma.mirrorConfig.update({
                    where: { id: cfg.id },
                    data: { updatedAt: new Date(), lastActiveAt: new Date() }
                }).catch(() => { });

                logger.info({ configId: cfg.id, messageId, attempt }, '[Async] Snapshot webhook delivered');
                return;

            } catch (error: any) {
                clearTimeout(requestTimer);

                // ── AbortError diagnostics ──
                if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
                    const phase = this.diagnoseAbortPhase(error);
                    logger.error({
                        configId: cfg.id,
                        messageId,
                        attempt,
                        phase,
                        errorCode: error.code,
                        errorCause: error.cause?.code || error.cause?.message || undefined,
                    }, `[Async] Snapshot webhook aborted during: ${phase}`);

                    // If task-level signal triggered, don't retry
                    if (taskSignal.aborted) return;

                    // Retry once after a brief pause
                    if (attempt < 2) {
                        await new Promise(r => setTimeout(r, 500));
                        continue;
                    }
                }

                // Webhook permanently invalid
                if (error.code === 10015 || error.code === 404) {
                    logger.error({ configId: cfg.id, code: error.code, messageId }, '[Async] Snapshot webhook not found — disabling config');
                    this.markConfigInvalid(cfg.id, 'WEBHOOK_INVALID').catch(() => { });
                    return;
                }

                // ── Non-retriable on attempt 2: fall through to fallback ──
                if (attempt >= 2) {
                    logger.warn({
                        configId: cfg.id,
                        messageId,
                        error: error.message || String(error),
                        code: error.code,
                    }, '[Async] Snapshot embed delivery failed — attempting plain-text fallback');
                    break; // Fall through to fallback below
                }

                // Brief backoff before retry
                await new Promise(r => setTimeout(r, 500));
            }
        }

        // ── Fallback: Send snapshot as plain-text URL ──
        // Ensures the image is never silently lost
        if (taskSignal.aborted) return;

        try {
            const urlLines = fallbackUrls.join('\n');
            await webhookClient.send({
                content: `${basePayload.content || ''}\n${urlLines}\n-# 📡 via DisBot Engine`.substring(0, 2000),
                username: basePayload.username,
                avatarURL: basePayload.avatarURL,
                allowedMentions: { parse: [] }
            });

            logger.info({ configId: cfg.id, messageId, urlCount: fallbackUrls.length },
                '[Async] Snapshot delivered via plain-text URL fallback');

            prisma.mirrorConfig.update({
                where: { id: cfg.id },
                data: { updatedAt: new Date(), lastActiveAt: new Date() }
            }).catch(() => { });

        } catch (fallbackError: any) {
            logger.error({
                configId: cfg.id,
                messageId,
                error: fallbackError.message || String(fallbackError),
            }, '[Async] Snapshot plain-text fallback also failed');
        }
    }

    // ────────────── SNAPSHOT BOT DELIVERY ──────────────

    /**
     * Dedicated bot sender for SNAPSHOT payloads.
     * Mirrors `sendWebhookSnapshot` logic for MANAGED_BOT type.
     */
    private async sendBotSnapshot(
        cfg: MirrorActiveConfig,
        basePayload: { username: string; avatarURL: string; content: string },
        embeds: any[],
        fallbackUrls: string[],
        messageId: string,
        botToken: string,
        taskSignal: AbortSignal,
        files?: any[]
    ): Promise<void> {
        const botSession = this.botClients.get(botToken);
        if (!botSession) {
            logger.error({ configId: cfg.id, messageId }, '[Async] No bot session found for snapshot delivery');
            return;
        }

        const targetChannelId = cfg.targetChannelId || cfg.targetWebhookUrl;

        for (let attempt = 1; attempt <= 2; attempt++) {
            if (taskSignal.aborted) {
                throw new DOMException('Background task aborted', 'AbortError');
            }

            try {
                const channel = await botSession.client.channels.fetch(targetChannelId);
                if (!channel || !channel.isTextBased()) {
                    logger.error({ configId: cfg.id, channelId: targetChannelId, messageId }, '[Async] Target channel not found or not text-based');
                    await this.markConfigInvalid(cfg.id, 'CHANNEL_NOT_FOUND');
                    return;
                }

                let content = '';
                if (basePayload.username) {
                    content += `-# 👤 ${basePayload.username}\n`;
                }
                if (basePayload.content) {
                    content += basePayload.content;
                }

                await (channel as any).send({
                    content: content || (files && files.length > 0 ? '' : ''),
                    embeds: embeds,
                    files: files,
                    allowedMentions: { parse: [] }
                });

                prisma.mirrorConfig.update({
                    where: { id: cfg.id },
                    data: { updatedAt: new Date(), lastActiveAt: new Date() }
                }).catch(() => { });

                logger.info({ configId: cfg.id, messageId, attempt }, '[Async] Snapshot bot message delivered');
                return;

            } catch (error: any) {
                if (error.name === 'AbortError') {
                    const phase = this.diagnoseAbortPhase(error);
                    logger.error({ configId: cfg.id, messageId, attempt, phase },
                        `[Async] Snapshot bot send aborted during: ${phase}`);
                    if (taskSignal.aborted) return;
                }

                if (error.code === 50013 || error.code === 50001) {
                    logger.error({ configId: cfg.id, code: error.code, messageId }, '[Async] Bot lacks permissions for snapshot delivery');
                    await this.markConfigInvalid(cfg.id, 'MISSING_PERMISSIONS');
                    return;
                }

                if (attempt >= 2) {
                    logger.warn({ configId: cfg.id, messageId, error: error.message }, '[Async] Snapshot bot delivery failed — attempting plain-text fallback');
                    break;
                }

                await new Promise(r => setTimeout(r, 500));
            }
        }

        // ── Fallback: plain-text URL ──
        if (taskSignal.aborted) return;

        try {
            const channel = await botSession.client.channels.fetch(targetChannelId);
            if (channel && channel.isTextBased()) {
                const urlLines = fallbackUrls.join('\n');
                let content = basePayload.username ? `-# 👤 ${basePayload.username}\n` : '';
                content += `${basePayload.content || ''}\n${urlLines}\n-# 📡 via DisBot Engine`;

                await (channel as any).send({
                    content: content.substring(0, 2000),
                    allowedMentions: { parse: [] }
                });

                logger.info({ configId: cfg.id, messageId, urlCount: fallbackUrls.length },
                    '[Async] Snapshot delivered via bot plain-text URL fallback');
            }
        } catch (fallbackError: any) {
            logger.error({ configId: cfg.id, messageId, error: fallbackError.message },
                '[Async] Snapshot bot plain-text fallback also failed');
        }
    }

    // ────────────── ABORT PHASE DIAGNOSTICS ──────────────

    /**
     * Diagnoses which network phase was active when an AbortError occurred.
     * Inspects the error cause chain to determine DNS/Connection/TLS/Response.
     */
    private diagnoseAbortPhase(error: any): string {
        const causeCode = error.cause?.code || error.cause?.message || '';
        const message = error.message || '';

        if (causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN' || message.includes('getaddrinfo')) {
            return 'DNS_RESOLUTION';
        }
        if (causeCode === 'ECONNREFUSED' || causeCode === 'ECONNRESET' || causeCode === 'EPIPE') {
            return 'TCP_CONNECTION';
        }
        if (causeCode === 'ERR_TLS_CERT_ALTNAME_INVALID' || causeCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || message.includes('TLS') || message.includes('SSL')) {
            return 'TLS_HANDSHAKE';
        }
        if (causeCode === 'ETIMEDOUT' || causeCode === 'ESOCKETTIMEDOUT') {
            return 'SOCKET_TIMEOUT';
        }
        if (causeCode === 'UND_ERR_CONNECT_TIMEOUT') {
            return 'CONNECT_TIMEOUT';
        }
        return 'UNKNOWN_PHASE';
    }

    // ────────────── MESSAGE HANDLING ──────────────

    private async handleMessage(token: string, message: Message, clientType: 'CUSTOM_HOOK' | 'MANAGED_BOT') {
        const sessionMap = clientType === 'CUSTOM_HOOK' ? this.clients : this.botClients;
        const session = sessionMap.get(token);
        if (!session) return;

        const configs = session.configs.get(message.channelId);
        if (!configs || configs.length === 0) return;

        // ── 1. Ready-State Delay (prevent 403 Forbidden) ──
        // Discord CDN can be slow to index new attachments. Waiting 1000ms ensures URLs are valid.
        if (message.attachments.size > 0 || message.embeds.length > 0) {
            await new Promise(r => setTimeout(r, 1000));
        }

        // ── 2. Wait for Content (Handle Empty Messages) ──
        // If message is completely empty (no content, no attachments, no embeds), wait for population.
        if (!message.content && message.attachments.size === 0 && message.embeds.length === 0 && !message.stickers.size) {
            await new Promise(r => setTimeout(r, 1500));
            try {
                if (message.partial) await message.fetch();
                else await message.channel.messages.fetch(message.id); // Force refresh
            } catch (e) { /* Ignore fetch error, message might be deleted */ }

            // Re-check emptiness
            if (!message.content && message.attachments.size === 0 && message.embeds.length === 0 && !message.stickers.size) {
                return; // Still empty -> ignore
            }
        }

        // ── 3. Detect Forwarded Messages (Robust Race Condition Handling) ──
        let isForward = false;

        // Loop to check for Snapshots/Forward flags (up to 3 times / 750ms)
        for (let i = 0; i < 3; i++) {
            const refType = (message.reference as any)?.type;
            const hasForwardFlag = (message as any).flags?.has?.(1 << 14); // IS_FORWARD
            const hasSnapshots = ((message as any).messageSnapshots?.size ?? 0) > 0;
            const isForwardRef = refType === 'FORWARD' || refType === 1;

            if (isForwardRef || hasForwardFlag || hasSnapshots) {
                isForward = true;
                break;
            }

            // Only wait if it *looks* like it might be a forward (has reference but no content yet?)
            if (message.reference && !message.content && !hasSnapshots) {
                await new Promise(r => setTimeout(r, 250));
            } else {
                break; // Not a forward candidate
            }
        }

        // Resolve the user's plan: Use the HIGHEST tier among all matching configs
        // Priority: ELITE > PRO > STARTER > FREE
        const userPlan = configs.reduce((best, current) => {
            const pCurrent = PLAN_PRIORITY[current.userPlan] ?? 0;
            const pBest = PLAN_PRIORITY[best] ?? 0;
            return pCurrent > pBest ? current.userPlan : best;
        }, 'FREE');

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

        // ──────────────────────────────────────────────────────────────
        //  SNAPSHOT Strategy — Non-Blocking Fire-and-Forget
        //
        //  Immediately extract proxy_url from metadata (zero I/O),
        //  then dispatch snapshot forwarding as a background task.
        //  The main thread continues to process STREAM items without waiting.
        // ──────────────────────────────────────────────────────────────

        const snapshotItems = payload.eligibleMedia.filter(att => att.strategy === 'SNAPSHOT');

        if (snapshotItems.length > 0) {
            const taskId = `snap_${message.id}_${Date.now()}`;

            logger.info({
                messageId: message.id,
                taskId,
                snapshotCount: snapshotItems.length,
                items: snapshotItems.map(s => ({ name: s.name, category: s.category })),
            }, `[Async] Snapshot task started for MessageID: ${message.id}`);

            // ── Deep-copy to prevent state mutation from the main thread ──
            // The main thread may reassign `configs` during the next sync cycle
            // or the next messageCreate event. The background task must own its data.
            const frozenConfigs: MirrorActiveConfig[] = configs.map(c => ({ ...c }));
            const frozenSnapshots: ParsedAttachment[] = snapshotItems.map(s => ({ ...s }));
            const frozenPayload = {
                username: payload.username,
                avatarURL: payload.avatarURL,
                content: '', // Snapshot embeds don't need duplicate content
            };

            // ── Fire-and-forget: use `void` to ensure zero blocking ──
            // BackgroundTaskManager handles timeout (10s) and cleanup
            void backgroundTasks.track(taskId, message.id, (signal) =>
                this.forwardSnapshotAsync(
                    frozenConfigs,
                    frozenSnapshots,
                    frozenPayload,
                    message.id,
                    token,
                    signal
                )
            );

            // ── Main thread continues immediately — zero blocking ──
        }

        // ── Handle STREAM Strategy (Audio/Documents) — remains synchronous ──
        // STREAM items require downloading and piping, so they stay on the main flow
        const streamItems = payload.eligibleMedia.filter(att => att.strategy === 'STREAM');

        // Only include STREAM items in the synchronous forwarding payload
        payload.eligibleMedia = streamItems;

        // Append rejection notices
        const rejectionNotice = buildRejectionNotice(mediaResult.rejected);
        if (rejectionNotice) {
            payload.content += rejectionNotice;
        }

        // Add watermark — always add when there's content OR files/embeds
        const hasFiles = streamItems.length > 0;
        const hasSnapshotEmbeds = snapshotItems.length > 0;
        const hasEmbeds = payload.embeds.length > 0 || hasSnapshotEmbeds;
        if (payload.content || hasFiles || hasEmbeds) {
            payload.content = (payload.content || '') + `\n-# 📡 via DisBot Engine`;
        }

        // Truncate content to 2000 chars (Discord API limit)
        if (payload.content && payload.content.length > 2000) {
            payload.content = payload.content.substring(0, 1997) + '...';
        }

        // Skip truly empty messages (no content, no embeds, no stream files)
        // Note: snapshot embeds are handled in the background, so we still
        // need to forward text content and stream files synchronously
        // ── Check if we have ANYTHING to send (Sync or Async) ──
        // Reliability Fix: Don't perform the strict "sync content check" yet.
        // If we had snapshot items, the background task is handling them.
        // We only abort here if we have NO content, NO embeds, NO sync-files AND NO async-snapshots.
        if (!payload.content && !hasEmbeds && !hasFiles && !hasSnapshotEmbeds) {
            return;
        }

        // ── DOWNLOAD ONCE OPTIMIZATION (Sync Media) ──
        // Instead of downloading inside each config loop locally, download once to RAM here.
        let sharedSyncFiles: any[] | undefined = undefined;
        if (streamItems.length > 0) {
            logger.debug({ count: streamItems.length }, 'Downloading sync media to shared buffer...');
            sharedSyncFiles = await buildFilePayloadBuffer(streamItems);
        }

        // ── Execute synchronous forwarding (text + STREAM items) in parallel ──
        const promises = configs.map(async (cfg) => {
            // ── Re-validate STREAM media for THIS specific config ──
            // Prevents Audio/Docs from leaking to Free/Starter plans
            const { eligible } = validateMediaForwarding(streamItems, cfg.userPlan);

            // Filter the shared buffer list to match eligible items for this config
            let configFiles: any[] | undefined = undefined;
            if (sharedSyncFiles && sharedSyncFiles.length > 0 && eligible.length > 0) {
                const eligibleNames = new Set(eligible.map(e => e.name));
                configFiles = sharedSyncFiles.filter(f => eligibleNames.has(f.name));
            }

            // If this config has no allowed stream media, and no text/embeds, skip it
            // (Unless there was snapshot media, which is handled separately)
            const configHasFiles = configFiles && configFiles.length > 0;
            const configHasContent = !!payload.content || payload.embeds.length > 0;

            // If strictly nothing to send in this sync phase
            if (!configHasFiles && !configHasContent) return;

            // Clone payload with filtered media
            const configPayload = {
                ...payload,
                eligibleMedia: eligible
            };

            try {
                if (cfg.type === 'CUSTOM_HOOK') {
                    // Pass pre-downloaded buffer files
                    await this.forwardViaWebhook(cfg, configPayload, configFiles);
                } else if (cfg.type === 'MANAGED_BOT') {
                    await this.forwardViaManagedBot(cfg, configPayload, token, configFiles);
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
        },
        preloadedFiles?: any[]
    ) {
        // Build fresh file payload (including streams) for this request
        // OR use preloaded buffer files if available (Download Once Optimization)
        const files = preloadedFiles || await buildWebhookFilePayload(payload.eligibleMedia);

        const sendPayload: any = {
            content: payload.content || undefined,
            username: payload.username,
            avatarURL: payload.avatarURL,
            embeds: payload.embeds.length > 0 ? payload.embeds : undefined,
            files: files.length > 0 ? files : undefined,
            allowedMentions: { parse: [] }
        };

        // Ensure we always have content when files are present (Discord API requirement)
        if (!sendPayload.content && sendPayload.files) {
            sendPayload.content = `-# 📡 via DisBot Engine`;
        }

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const webhookClient = new WebhookClient({ url: cfg.targetWebhookUrl });

                // 300s (5m) timeout for reliable media uploads (matches download timeout)
                const UPLOAD_TIMEOUT_MS = 300_000;

                await Promise.race([
                    webhookClient.send(sendPayload),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Webhook upload timed out')), UPLOAD_TIMEOUT_MS)
                    )
                ]);

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
                    // Treat 'other side closed' (premature close) as a timeout/network error.
                    // If it's a network error, retry WITH files (maybe it was just glitch).
                    // If it's a logical error (e.g. 400 Bad Request), retry WITHOUT files as fallback.
                    const isTimeout = error.name === 'AbortError' || error.message === 'Webhook upload timed out' || error.code === 'ETIMEDOUT';
                    const isNetworkError = isTimeout ||
                        error.message?.includes('other side closed') ||
                        error.code === 'ECONNRESET' ||
                        error.code === 'EPIPE' ||
                        error.message?.includes('socket hang up');

                    if (attempt === 1 && !isNetworkError && (sendPayload.files || sendPayload.embeds)) {
                        logger.warn({ configId: cfg.id, error: error.message }, 'First attempt failed with data error. Retrying without files/embeds (Falling back to Links).');

                        // ── LINK FALLBACK ──
                        // Mimic "Forward Message" behavior: If upload fails, send the URLs.
                        const mediaUrls = payload.eligibleMedia.map(m => m.url).join('\n');
                        if (mediaUrls) {
                            sendPayload.content = (sendPayload.content || '') + '\n' + mediaUrls;
                        }

                        sendPayload.files = undefined;
                        sendPayload.embeds = undefined;
                    } else if (isNetworkError) {
                        if (attempt === 3) {
                            // Last attempt failed due to network? Fallback to links for the final (failed) log/state
                            // (Ideally we would retry one last time with links, but simpler to just log/accept fail here
                            //  or maybe force a 4th attempt? Let's keep it simple: if network fails twice,
                            //  the next loop might trigger the fallback if we change logic slightly.
                            //  Actually, let's apply Link Fallback on the *Last* retry if it's about to fail?)
                        }
                        logger.warn({ configId: cfg.id, error: error.message }, 'Network/Connection error. Retrying with files...');
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
        botToken: string,
        preloadedFiles?: any[]
    ) {
        const botSession = this.botClients.get(botToken);
        if (!botSession) {
            logger.error({ configId: cfg.id }, 'No bot session found for managed bot forwarding');
            return;
        }

        const targetChannelId = cfg.targetChannelId || cfg.targetWebhookUrl;

        // Build fresh bot files OR use preloaded
        let botFiles = preloadedFiles || await buildBotFilePayload(payload.eligibleMedia);

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const channel = await botSession.client.channels.fetch(targetChannelId);
                if (!channel || !channel.isTextBased()) {
                    logger.error({ configId: cfg.id, channelId: targetChannelId }, 'Target channel not found or not text-based');
                    await this.markConfigInvalid(cfg.id, 'CHANNEL_NOT_FOUND');
                    return;
                }

                const sendOptions: any = {
                    allowedMentions: { parse: [] }
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

                // ── LINK FALLBACK ──
                // If files were stripped (botFiles empty) but we have eligible media, append links
                if (botFiles.length === 0 && payload.eligibleMedia.length > 0) {
                    const mediaUrls = payload.eligibleMedia.map(m => m.url).join('\n');
                    if (sendOptions.content) {
                        sendOptions.content = (sendOptions.content + '\n' + mediaUrls).substring(0, 2000);
                    } else {
                        sendOptions.content = mediaUrls.substring(0, 2000);
                    }
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

                // URL expired or File Error
                // Fallback to Links
                const isMediaError = error.message?.includes('Invalid URL') ||
                    error.message?.includes('expired') ||
                    error.message?.includes('Request entity too large') ||
                    error.status === 413;

                if (isMediaError) {
                    logger.error({
                        configId: cfg.id,
                        error: error.message,
                    }, 'Failed to forward media via bot: File error. Falling back to Links.');

                    botFiles = [];
                    // Just continue. The logic at start of loop detects (botFiles.length === 0) 
                    // and automatically appends links.
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

        // ── Drain background snapshot tasks before destroying clients ──
        logger.info({ activeTasks: backgroundTasks.activeCount }, 'Draining background snapshot tasks...');
        await backgroundTasks.shutdown();

        // ── Shutdown Telegram MTProto sessions ──
        await telegramListener.shutdown();

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
    snapshotStrategy: 'ASYNC_FIRE_AND_FORGET',
    snapshotTimeoutMs: 10_000,
    telegramMediaTimeout: 15_000,
    telegramMaxConcurrentDownloads: 5,
}, 'DISBOT Mirroring Engine Started — Feature Tiering Active | Async Snapshot & Telegram Mirroring Enabled');
