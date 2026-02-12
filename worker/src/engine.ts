
import { Client, Message, Collection } from 'discord.js-selfbot-v13';
import { WebhookClient } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { decrypt, validateEncryptionConfig, maskToken } from './lib/crypto';
import { logger } from './lib/logger';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Validate Environment
validateEncryptionConfig();

// Setup Prisma
const prisma = new PrismaClient();

// Types
type MirrorActiveConfig = {
    id: string;
    sourceChannelId: string;
    targetWebhookUrl: string;
    userToken: string;
};

// Manager to handle multiple clients
class ClientManager {
    private static instance: ClientManager;
    // Map<UserToken, { client: Client, configs: Map<ChannelId, MirrorActiveConfig[]> }>
    private clients: Map<string, {
        client: Client;
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

    public async sync() {
        logger.info('Starting sync cycle...');

        try {
            // 1. Fetch all ACTIVE configs
            const activeConfigs = await prisma.mirrorConfig.findMany({
                where: {
                    active: true,
                    type: 'CUSTOM_HOOK'
                }
            });

            // Group by Token
            const configsByToken = new Map<string, MirrorActiveConfig[]>();

            for (const cfg of activeConfigs) {
                if (!cfg.userToken) continue;

                let decryptedToken: string | null = null;

                if (cfg.userToken.includes(':')) {
                    decryptedToken = decrypt(cfg.userToken, process.env.ENCRYPTION_KEY || '');
                } else {
                    // Fallback for dev/legacy unencrypted tokens
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
                    userToken: decryptedToken
                });
            }

            // 2. Reconcile Clients
            // Remove clients for tokens that no longer have active configs
            for (const [token, session] of this.clients) {
                if (!configsByToken.has(token)) {
                    logger.info({ token: maskToken(token) }, 'Stopping inactive client');
                    session.client.destroy();
                    this.clients.delete(token);
                }
            }

            // Add/Update clients
            for (const [token, configs] of configsByToken) {
                const configMap = new Map<string, MirrorActiveConfig[]>();
                // Group configs by Channel ID for fast lookup
                for (const cfg of configs) {
                    if (!configMap.has(cfg.sourceChannelId)) {
                        configMap.set(cfg.sourceChannelId, []);
                    }
                    configMap.get(cfg.sourceChannelId)?.push(cfg);
                }

                if (this.clients.has(token)) {
                    // Update existing client's config map
                    const session = this.clients.get(token)!;
                    session.configs = configMap;
                    session.lastActive = Date.now();
                } else {
                    // Create new client
                    logger.info({ token: maskToken(token) }, 'Starting Custom Hook client session');
                    await this.spawnClient(token, configMap);
                }
            }

        } catch (error: any) {
            logger.error({ msg: error.message || 'Unknown Error' }, 'Error during sync cycle');
        }
    }

    private async spawnClient(token: string, initialConfigs: Map<string, MirrorActiveConfig[]>) {
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
            this.handleMessage(token, message);
        });

        // Error handling
        client.on('error', (err: any) => {
            logger.error({ msg: err.message || 'Unknown Connection Error' }, 'Client connection error');
        });

        try {
            // Heuristic check for OAuth Access Token vs User Token
            // OAuth Access Tokens are typically 30 chars. User Tokens are 59+ chars and contain dots (id.timestamp.hmac).
            if (token.length === 30 && !token.includes('.')) {
                logger.warn({ token: maskToken(token) }, 'WARNING: Token appears to be an OAuth Access Token. Gateway login requires a USER TOKEN (authorization: value from local storage). Login will likely fail.');
            }

            await client.login(token);
        } catch (error: any) {
            logger.error({ msg: error.message || 'Login Failed', code: error.code, token: maskToken(token) }, 'Login failed');

            // Check for 401 or invalid token
            if (error.message && (error.message.includes('Token') || error.code === 401)) {
                await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID');
                this.clients.delete(token);
            }
        }
    }

    private async handleMessage(token: string, message: Message) {
        const session = this.clients.get(token);
        if (!session) return;

        const configs = session.configs.get(message.channelId);
        if (!configs || configs.length === 0) return;

        // Detect forward FIRST — before building payload
        const refType = (message.reference as any)?.type;
        const isForward = refType === 'FORWARD' || refType === 1
            || (message as any).flags?.has?.(1 << 14)  // HAS_SNAPSHOT flag
            || ((message as any).messageSnapshots?.size ?? 0) > 0;

        // Build payload based on message type
        const payload: { username: string; avatarURL: string; content: string; embeds: any[]; files: string[] } = {
            username: message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            content: '',
            embeds: [],
            files: []
        };

        if (isForward) {
            // === FORWARDED MESSAGE ===
            // Extract data from snapshot (immutable copy of original message)
            const snapshot = (message as any).messageSnapshots?.first?.();

            let fwdContent = `-# 📨 Forwarded Message`;

            if (snapshot?.content) {
                fwdContent += `\n${snapshot.content}`;
            }

            // Snapshot attachment URLs have expired CDN tokens — include as text links only
            // Discord will auto-embed/preview image links
            if (snapshot?.attachments?.size > 0) {
                const urls = snapshot.attachments.map((a: any) => a.url);
                fwdContent += `\n${urls.join('\n')}`;
            }

            payload.content = fwdContent;
            // Never send files/embeds from snapshots — CDN tokens are expired

            // Fallback: no snapshot, try fetching the original message
            if (!snapshot && message.reference?.messageId) {
                try {
                    let refMsg: Message | null = null;
                    if (message.reference.channelId === message.channelId) {
                        refMsg = await message.channel.messages.fetch(message.reference.messageId);
                    } else {
                        const ch = await session.client.channels.fetch(message.reference.channelId) as any;
                        if (ch?.messages?.fetch) {
                            refMsg = await ch.messages.fetch(message.reference.messageId);
                        }
                    }
                    if (refMsg) {
                        let fwd = `-# 📨 Forwarded Message`;
                        if (refMsg.content) fwd += `\n${refMsg.content}`;
                        payload.content = fwd;
                        // Fetched messages have valid CDN URLs
                        if (refMsg.attachments.size > 0) {
                            payload.files = refMsg.attachments.map((a: any) => a.url);
                        }
                    }
                } catch {
                    // Keep whatever content we have
                }
            }

        } else if (message.reference && message.reference.messageId) {
            // === REPLY MESSAGE ===
            // Mirror the reply content + add small context of what was replied to
            payload.content = message.content || '';
            payload.embeds = message.embeds as any;
            payload.files = message.attachments.map((a: any) => a.url);

            try {
                let ref: Message | null = null;
                if (message.reference.channelId === message.channelId) {
                    ref = await message.channel.messages.fetch(message.reference.messageId);
                } else {
                    const ch = await session.client.channels.fetch(message.reference.channelId) as any;
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
            // === REGULAR MESSAGE ===
            payload.content = message.content || '';
            payload.embeds = message.embeds as any;
            payload.files = message.attachments.map((a: any) => a.url);
        }

        // Truncate content to 2000 chars (Discord API limit)
        if (payload.content && payload.content.length > 2000) {
            payload.content = payload.content.substring(0, 1997) + '...';
        }

        // Skip empty messages (stickers, system messages, etc.)
        if (!payload.content && payload.embeds.length === 0 && payload.files.length === 0) {
            return;
        }

        // Execute Webhooks in Parallel
        const promises = configs.map(async (cfg) => {
            const sendPayload = {
                content: payload.content || undefined,
                username: payload.username,
                avatarURL: payload.avatarURL,
                embeds: payload.embeds.length > 0 ? payload.embeds : undefined,
                files: payload.files.length > 0 ? payload.files : undefined,
                allowedMentions: { parse: [] as string[] }
            };

            // Retry up to 3 times with timeout
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const webhookClient = new WebhookClient({ url: cfg.targetWebhookUrl });

                    // 10-second timeout to prevent hanging
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 10000);

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
                        data: { updatedAt: new Date() }
                    }).catch(() => { });

                    return; // Done, exit retry loop

                } catch (error: any) {
                    const isLastAttempt = attempt === 3;

                    // Webhook permanently invalid — don't retry
                    if (error.code === 10015 || error.code === 404) {
                        logger.error({ configId: cfg.id, code: error.code }, 'Webhook not found — disabling config');
                        this.markConfigInvalid(cfg.id, 'WEBHOOK_INVALID').catch(() => { });
                        return;
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
                        // On retry: strip files/embeds in case they caused the error
                        if (attempt === 1 && (sendPayload.files || sendPayload.embeds)) {
                            sendPayload.files = undefined;
                            sendPayload.embeds = undefined;
                        }
                        // Wait 1 second before retry
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }
        });

        await Promise.all(promises);
    }

    private async markConfigInvalid(id: string, reason: string) {
        logger.warn({ configId: id, reason }, 'Marking config as invalid');
        await prisma.mirrorConfig.update({
            where: { id },
            data: { active: false }
        });
    }

    private async invalidateAllConfigsForToken(token: string, reason: string) {
        const session = this.clients.get(token);
        if (!session) return;

        const allConfigIds = Array.from(session.configs.values()).flat().map(c => c.id);

        if (allConfigIds.length > 0) {
            logger.warn({ count: allConfigIds.length, reason, token: maskToken(token) }, 'Invalidating configs for token');
            await prisma.mirrorConfig.updateMany({
                where: { id: { in: allConfigIds } },
                data: { active: false }
            });
        }
    }

    public async shutdown() {
        logger.info('Shutting down all clients...');
        for (const [token, session] of this.clients) {
            try {
                session.client.destroy();
                logger.info({ token: maskToken(token) }, 'Client destroyed');
            } catch (e: any) {
                logger.error({ msg: e.message || 'Error', token: maskToken(token) }, 'Error destroying client');
            }
        }
        this.clients.clear();
    }
}

// Start Engine
const manager = ClientManager.getInstance();

// Initial Run
manager.sync();

// Poll every 5 minutes
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

// Also handle SIGTERM
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Shutting down...');
    clearInterval(interval);
    await manager.shutdown();
    await prisma.$disconnect();
    process.exit(0);
});

logger.info('DISBOT Mirroring Engine Started');
