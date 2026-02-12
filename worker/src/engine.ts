
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

        const payload = {
            username: message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            content: message.content,
            embeds: message.embeds,
            files: message.attachments.map((a: any) => a.url)
        };

        // Handle Forwarded Messages (Discord's native forward feature)
        // Forwarded messages have empty content; actual data lives in messageSnapshots
        const isForward = (message.reference as any)?.type === 'FORWARD';

        if (isForward) {
            try {
                const snapshot = (message as any).messageSnapshots?.first?.();

                if (snapshot) {
                    // Format: 📨 Forwarded label + original content
                    let fwdContent = `📨 **Forwarded Message**\n`;

                    if (snapshot.content) {
                        fwdContent += `>>> ${snapshot.content}`;
                    }
                    payload.content = fwdContent;

                    // Carry over embeds from the snapshot
                    if (payload.embeds.length === 0 && snapshot.embeds?.length > 0) {
                        payload.embeds = snapshot.embeds.map((e: any) => e.toJSON ? e.toJSON() : e) as any;
                    }

                    // Carry over attachments from the snapshot
                    if (payload.files.length === 0 && snapshot.attachments?.size > 0) {
                        payload.files = snapshot.attachments.map((a: any) => a.url);
                    }
                }

                // Truncate content to 2000 characters to prevent API errors
                if (payload.content && payload.content.length > 2000) {
                    payload.content = payload.content.substring(0, 1997) + '...';
                }
            } catch (err: any) {
                logger.warn({ msg: err?.message || 'Unknown error' }, 'Error processing forwarded message');
            }
        }
        // Handle Reply Messages - add context so readers understand what is being replied to
        else if (message.reference && message.reference.messageId) {
            try {
                let referencedMessage: Message | null = null;

                if (message.reference.channelId === message.channelId) {
                    referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
                } else {
                    const remoteChannel = await session.client.channels.fetch(message.reference.channelId) as any;
                    if (remoteChannel && typeof remoteChannel.messages?.fetch === 'function') {
                        referencedMessage = await remoteChannel.messages.fetch(message.reference.messageId);
                    }
                }

                if (referencedMessage) {
                    // Format: ↩️ reply context + user's reply
                    const preview = referencedMessage.content
                        ? referencedMessage.content.substring(0, 80).replace(/\n/g, ' ')
                        : '📎 Attachment';
                    const ellipsis = referencedMessage.content && referencedMessage.content.length > 80 ? '...' : '';
                    const replyHeader = `> ↩️ **${referencedMessage.author.username}**: ${preview}${ellipsis}\n\n`;

                    payload.content = replyHeader + (message.content || '');
                }

                // Truncate content to 2000 characters to prevent API errors
                if (payload.content && payload.content.length > 2000) {
                    payload.content = payload.content.substring(0, 1997) + '...';
                }
            } catch (err) {
                // If fetch fails (message deleted, no access), send reply content as-is
            }
        }

        // Skip empty messages (e.g. stickers, system messages)
        if (!payload.content && payload.embeds.length === 0 && payload.files.length === 0) {
            return;
        }

        // Execute Webhooks in Parallel (High Performance Mode)
        const promises = configs.map(async (cfg) => {
            try {
                // Create client (Lightweight operation)
                const webhookClient = new WebhookClient({ url: cfg.targetWebhookUrl });

                // Send message
                await webhookClient.send({
                    content: payload.content,
                    username: payload.username,
                    avatarURL: payload.avatarURL,
                    embeds: payload.embeds,
                    files: payload.files,
                    allowedMentions: { parse: [] }
                });

                // Update Last Active - Fire and Forget (Non-blocking)
                prisma.mirrorConfig.update({
                    where: { id: cfg.id },
                    data: { updatedAt: new Date() }
                }).catch(() => {
                    // Ignore DB update errors to maintain speed
                });

            } catch (error: any) {
                logger.error({ msg: error.message || 'Webhook Send Failed', code: error.code, configId: cfg.id }, 'Failed to send webhook');

                if (error.code === 10015 || error.code === 404) { // Webhook not found
                    // Mark invalid asynchronously
                    this.markConfigInvalid(cfg.id, 'WEBHOOK_INVALID').catch(() => { });
                } else if (error.code === 429) { // Rate limited
                    logger.warn({ configId: cfg.id }, 'Rate limited on webhook');
                }
            }
        });

        // Wait for all requests to initiate/complete (Parallel)
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
