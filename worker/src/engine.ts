
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

        // Detect forwarded messages using multiple signals
        const refType = (message.reference as any)?.type;
        const hasSnapshot = (message as any).flags?.has?.(1 << 14); // HAS_SNAPSHOT = 16384
        const snapshotsCollection = (message as any).messageSnapshots;
        const snapshotsSize = snapshotsCollection?.size ?? 0;
        const isForward = refType === 'FORWARD' || refType === 1 || hasSnapshot || snapshotsSize > 0;

        // Debug log for any message that has a reference (reply or forward)
        if (message.reference) {
            logger.info({
                channelId: message.channelId,
                messageId: message.id,
                author: message.author.username,
                content: message.content?.substring(0, 50) || '(empty)',
                referenceType: refType,
                referenceTypeOf: typeof refType,
                referenceMessageId: message.reference.messageId,
                referenceChannelId: message.reference.channelId,
                hasSnapshot,
                snapshotsSize,
                flagsBitfield: (message as any).flags?.bitfield,
                isForward,
            }, 'Message with reference detected');
        }

        // Handle Forwarded Messages
        if (isForward) {
            try {
                const snapshot = snapshotsCollection?.first?.();

                logger.info({
                    messageId: message.id,
                    hasSnapshotObj: !!snapshot,
                    snapshotContent: snapshot?.content?.substring(0, 50) || '(no content)',
                    snapshotEmbedsCount: snapshot?.embeds?.length ?? 0,
                    snapshotAttachmentsCount: snapshot?.attachments?.size ?? 0,
                }, 'Processing forwarded message');

                if (snapshot) {
                    // Format: small label + original content
                    let fwdContent = `-# 📨 Forwarded Message`;

                    if (snapshot.content) {
                        fwdContent += `\n${snapshot.content}`;
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
                } else {
                    // No snapshot available - try fetching the referenced message as fallback
                    logger.warn({ messageId: message.id }, 'Forward detected but no snapshot available, trying fetch fallback');

                    if (message.reference?.messageId) {
                        try {
                            let refMsg: Message | null = null;
                            if (message.reference.channelId === message.channelId) {
                                refMsg = await message.channel.messages.fetch(message.reference.messageId);
                            } else {
                                const remoteCh = await session.client.channels.fetch(message.reference.channelId) as any;
                                if (remoteCh && typeof remoteCh.messages?.fetch === 'function') {
                                    refMsg = await remoteCh.messages.fetch(message.reference.messageId);
                                }
                            }

                            if (refMsg) {
                                let fwdContent = `-# 📨 Forwarded Message`;
                                if (refMsg.content) {
                                    fwdContent += `\n${refMsg.content}`;
                                }
                                payload.content = fwdContent;

                                if (payload.embeds.length === 0 && refMsg.embeds.length > 0) {
                                    payload.embeds = refMsg.embeds.map((e: any) => e.toJSON ? e.toJSON() : e) as any;
                                }
                                if (payload.files.length === 0 && refMsg.attachments.size > 0) {
                                    payload.files = refMsg.attachments.map((a: any) => a.url);
                                }
                            }
                        } catch (fetchErr: any) {
                            logger.warn({ msg: fetchErr?.message || 'Fetch failed' }, 'Forward fallback fetch failed');
                        }
                    }
                }

                // Truncate content to 2000 characters to prevent API errors
                if (payload.content && payload.content.length > 2000) {
                    payload.content = payload.content.substring(0, 1997) + '...';
                }
            } catch (err: any) {
                logger.error({ msg: err?.message || 'Unknown error', stack: err?.stack }, 'Error processing forwarded message');
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
                    // Format: small text reply context + user's reply on next line
                    const preview = referencedMessage.content
                        ? referencedMessage.content.substring(0, 60).replace(/\n/g, ' ')
                        : '📎 Attachment';
                    const ellipsis = referencedMessage.content && referencedMessage.content.length > 60 ? '...' : '';

                    payload.content = `-# ↩️ ${referencedMessage.author.username}: ${preview}${ellipsis}\n${message.content || ''}`;
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
            logger.debug({ messageId: message.id }, 'Skipping empty message');
            return;
        }

        // Log payload before sending
        logger.info({
            messageId: message.id,
            author: payload.username,
            contentLength: payload.content?.length ?? 0,
            contentPreview: payload.content?.substring(0, 80) || '(empty)',
            embedsCount: payload.embeds.length,
            filesCount: payload.files.length,
            isForward,
            configCount: configs.length,
        }, 'Sending to webhook(s)');

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

                logger.info({ configId: cfg.id }, 'Webhook sent successfully');

                // Update Last Active - Fire and Forget (Non-blocking)
                prisma.mirrorConfig.update({
                    where: { id: cfg.id },
                    data: { updatedAt: new Date() }
                }).catch(() => {
                    // Ignore DB update errors to maintain speed
                });

            } catch (error: any) {
                logger.error({ msg: error.message || 'Webhook Send Failed', code: error.code, configId: cfg.id, status: error.status }, 'Failed to send webhook');

                // If send failed and we had files, retry without files (snapshot attachment URLs may have expired)
                if (payload.files.length > 0) {
                    try {
                        logger.info({ configId: cfg.id }, 'Retrying webhook without files...');
                        const webhookClient = new WebhookClient({ url: cfg.targetWebhookUrl });
                        await webhookClient.send({
                            content: payload.content,
                            username: payload.username,
                            avatarURL: payload.avatarURL,
                            embeds: payload.embeds,
                            allowedMentions: { parse: [] }
                        });
                        logger.info({ configId: cfg.id }, 'Webhook retry without files succeeded');
                    } catch (retryErr: any) {
                        logger.error({ msg: retryErr.message || 'Retry Failed', configId: cfg.id }, 'Webhook retry also failed');
                    }
                }

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
