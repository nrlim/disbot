
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
        this.clients.set(token, session);

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

        client.on('error', (err) => logger.error({ msg: err.message }, 'Selfbot client error'));

        try {
            await client.login(token);
        } catch (error: any) {
            logger.error({ msg: error.message, token: maskToken(token) }, 'Selfbot login failed');
            if (error.message?.includes('Token') || error.code === 401) {
                await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID', 'CUSTOM_HOOK');
                this.clients.delete(token);
            }
        }
    }

    private async spawnBotClient(token: string, initialConfigs: Map<string, MirrorActiveConfig[]>) {
        const client = new BotClient({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
        });
        const session: ClientSession = { client, configs: initialConfigs, lastActive: Date.now() };
        this.botClients.set(token, session);

        client.on('ready', () => logger.info({ user: client.user?.tag }, 'Managed Bot Client ready'));

        client.on('messageCreate', (message) => {
            if (message.author.bot) return; // Ignore bots
            this.dispatchMessage(token, message as any, 'MANAGED_BOT');
        });

        client.on('error', (err) => logger.error({ msg: err.message }, 'Bot client error'));

        try {
            await client.login(token);
        } catch (error: any) {
            logger.error({ msg: error.message, token: maskToken(token) }, 'Bot login failed');
            if (error.message?.includes('Token') || error.code === 401) {
                await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID', 'MANAGED_BOT');
                this.botClients.delete(token);
            }
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
        // Wait briefly for embeds/attachments to popular if message relies on them
        if (message.attachments.size > 0 || message.embeds.length > 0) {
            await new Promise(r => setTimeout(r, 1000));
        }

        // Parse attachments
        const rawAttachments = parseAttachments(message.attachments, (message as any).flags);

        // Filter out undesired ones (e.g. no attachments and no content)
        if (!message.content && rawAttachments.length === 0 && message.embeds.length === 0) return;

        // Validate plan eligibility
        const { eligible, rejected } = validateMediaForwarding(rawAttachments, userPlan);

        // Build Payload
        let content = message.content || '';

        // Handle Rejection Notice
        const rejectionNotice = buildRejectionNotice(rejected);
        if (rejectionNotice) content += rejectionNotice;

        // Construct Webhook Files Payload directly with URLs
        // NO DOWNLOAD STRATEGY: Pass the proxyUrl or url string directly.
        const files = eligible.map(att => ({
            attachment: att.proxyUrl || att.url,
            name: att.name
        }));

        // Add Watermark
        const hasMedia = files.length > 0;
        if (content || hasMedia || message.embeds.length > 0) {
            content += `\n-# 📡 via DisBot Engine`;
        }

        if (content.length > 2000) content = content.substring(0, 1997) + '...';

        const payload: WebhookPayload = {
            username: message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            content: content,
            files: files // Passing URLs directly is efficient
        };

        // Forward to all webhooks
        // Deduplicate webhooks
        const uniqueParams = new Map<string, string>();
        for (const cfg of configs) {
            if (!uniqueParams.has(cfg.targetWebhookUrl)) {
                uniqueParams.set(cfg.targetWebhookUrl, cfg.id);
            }
        }

        const promises = Array.from(uniqueParams.entries()).map(([url, cfgId]) =>
            WebhookExecutor.send(url, payload, cfgId)
        );

        await Promise.allSettled(promises);
    }


    // ──────────────────────────────────────────────────────────────
    //  HELPERS
    // ──────────────────────────────────────────────────────────────

    private groupConfigsByToken(configs: MirrorActiveConfig[]): Map<string, MirrorActiveConfig[]> {
        const map = new Map<string, MirrorActiveConfig[]>();
        for (const cfg of configs) {
            if (!cfg.userToken) continue;
            // Handle decryption if needed (assuming token might be encrypted) - but engine.ts did it before passing?
            // Actually engine.ts decrypted BEFORE calling sync. So tokens here are plain.
            // Wait, looking at engine.ts, it decrypts then passes to sync.
            // But wait, the `configs` passed to `sync` might be raw from DB or processed.
            // In engine.ts, `manager.sync()` fetches from DB, decrypts, filters, THEN calls `this.syncCustomHookClients`.
            // So `DiscordMirror.sync` expects DECRYPTED tokens in `userToken`.

            // However, `engine.ts` logic was:
            // 1. Fetch all
            // 2. Decrypt tokens
            // 3. Pass to specialized syncs.

            // I should assume the caller (engine.ts) handles decryption before calling me, OR I handle it.
            // Let's handle it here to be safe if passed raw configs, or just assume plain if already processed.
            // Since `engine.ts` will call this with `allowedConfigs`, let's assume `engine.ts` decrypts.

            // Actually, `engine.ts` logic for `sync` does:
            // `const activeConfigsRaw = await prisma...`
            // `const activeConfigs = ... map`
            // `enforcePathLimits`
            // `telegramConfigs` logic decrypts.
            // `discordHookConfigs` logic decrypts.

            // So if I move logic here, I should handle decryption here if I want `engine.ts` to be simple.
            // Let's make `DiscordMirror` handle decryption.

            let token = cfg.userToken;
            if (token.includes(':')) {
                token = decrypt(token, process.env.ENCRYPTION_KEY || '') || '';
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

    public async shutdown() {
        this.clients.forEach(c => c.client.destroy());
        this.botClients.forEach(c => c.client.destroy());
        this.clients.clear();
        this.botClients.clear();
    }
}
