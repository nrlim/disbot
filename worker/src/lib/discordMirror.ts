
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

        // Construct Webhook Files (Direct URLs)
        const files = eligibleMedia.map(att => ({
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
            files: files // Passing URLs directly
        };

        // Forward to all webhooks
        const uniqueParams = new Map<string, string>();
        for (const cfg of configs) {
            if (!uniqueParams.has(cfg.targetWebhookUrl)) {
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

        const results = await Promise.allSettled(promises);
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

    public async shutdown() {
        this.clients.forEach(c => c.client.destroy());
        this.botClients.forEach(c => c.client.destroy());
        this.clients.clear();
        this.botClients.clear();
    }
}
