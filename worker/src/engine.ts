
import { Client, Message, TextChannel } from 'discord.js-selfbot-v13';
import { WebhookClient, APIMessage } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import dotenv from 'dotenv';
import path from 'path';
import { decrypt } from './lib/crypto';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Setup Logger
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

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

    // Main sync function called every interval
    public async sync() {
        logger.info('Starting sync cycle...');

        try {
            // 1. Fetch all ACTIVE configs
            const activeConfigs = await prisma.mirrorConfig.findMany({
                where: {
                    active: true
                }
            });

            // Group by Token
            const configsByToken = new Map<string, MirrorActiveConfig[]>();

            for (const cfg of activeConfigs) {
                if (!cfg.userToken) continue;

                let decryptedToken: string;
                try {
                    // Assume token is encrypted in DB if not raw. 
                    // For now, mirroring engine assumes prompt requirement: "Integrate AES-256-GCM decryption"
                    // We try to decrypt. If fail (maybe raw for dev), we handle or log.
                    // Note: In a real scenario, we'id have a flag or strict format.
                    // Here we assume it's encrypted if it looks like it, or just try.
                    // Actually, let's look at the schema. It says "Encrypted in production".
                    // We will try decrypt.
                    if (cfg.userToken.includes(':')) {
                        decryptedToken = decrypt(cfg.userToken, process.env.MASTER_ENCRYPTION_KEY || '');
                    } else {
                        decryptedToken = cfg.userToken; // Fallback for dev/unencrypted
                    }
                } catch (e) {
                    logger.error({ err: e, configId: cfg.id }, 'Failed to decrypt token. Marking as invalid.');
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
                    logger.info(`Stopping client for token ending in ...${token.slice(-4)}`);
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
                    logger.info(`Starting new client for token ending in ...${token.slice(-4)}`);
                    await this.spawnClient(token, configMap);
                }
            }

        } catch (error) {
            logger.error({ err: error }, 'Error during sync cycle');
        }
    }

    private async spawnClient(token: string, initialConfigs: Map<string, MirrorActiveConfig[]>) {
        const client = new Client();

        const session = {
            client,
            configs: initialConfigs,
            lastActive: Date.now()
        };

        this.clients.set(token, session);

        client.on('ready', () => {
            logger.info(`Client ready: ${client.user?.tag}`);
        });

        client.on('messageCreate', async (message: Message) => {
            // Logic to handle mirroring
            this.handleMessage(token, message);
        });

        // Error handling
        client.on('error', (err: Error) => {
            logger.error({ err }, 'Client error');
            // Logic to detect auth errors is often in login or specific error codes
        });

        try {
            await client.login(token);
        } catch (error: any) {
            logger.error({ err: error, token: `...${token.slice(-4)}` }, 'Login failed');

            // Check for 401 or invalid token
            if (error.message && (error.message.includes('Token') || error.code === 401)) { // Simplified check
                await this.invalidateAllConfigsForToken(token, 'TOKEN_INVALID');
                this.clients.delete(token); // Remove tracking
            }
        }
    }

    private async handleMessage(token: string, message: Message) {
        const session = this.clients.get(token);
        if (!session) return;

        const configs = session.configs.get(message.channelId);
        if (!configs || configs.length === 0) return;

        // Filter out own messages if needed, or loops? 
        // Usually mirrors want to mirror everything in source.

        // Check for embeds, attachments, content
        const payload = {
            username: message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            content: message.content,
            embeds: message.embeds,
            files: message.attachments.map((a: any) => a.url)
        };

        // Execute Webhooks
        for (const cfg of configs) {
            try {
                const webhookClient = new WebhookClient({ url: cfg.targetWebhookUrl });

                await webhookClient.send({
                    content: payload.content,
                    username: payload.username,
                    avatarURL: payload.avatarURL,
                    embeds: payload.embeds,
                    files: payload.files,
                    allowedMentions: { parse: [] } // Prevent mass pings
                });

                // Update Last Active
                await prisma.mirrorConfig.update({
                    where: { id: cfg.id },
                    data: { updatedAt: new Date() }
                });

            } catch (error: any) {
                logger.error({ err: error, configId: cfg.id }, 'Failed to send webhook');

                if (error.code === 10015 || error.code === 404) { // Webhook not found
                    await this.markConfigInvalid(cfg.id, 'WEBHOOK_INVALID');
                } else if (error.code === 429) { // Rate limited
                    // Backoff?
                    logger.warn('Rate limited on webhook');
                }
            }
        }
    }

    private async markConfigInvalid(id: string, reason: string) {
        logger.warn({ configId: id, reason }, 'Marking config as invalid');
        await prisma.mirrorConfig.update({
            where: { id },
            data: { active: false }
        });
    }

    private async invalidateAllConfigsForToken(token: string, reason: string) {
        // This is tricky because we only have the token, and configs might be encrypted in DB.
        // But we have the configs in memory for this token!
        const session = this.clients.get(token);
        if (!session) return;

        const allConfigIds = Array.from(session.configs.values()).flat().map(c => c.id);

        if (allConfigIds.length > 0) {
            logger.warn({ count: allConfigIds.length, reason }, 'Invalidating configs for token');
            await prisma.mirrorConfig.updateMany({
                where: { id: { in: allConfigIds } },
                data: { active: false }
            });
        }
    }
}

// Start Engine
const manager = ClientManager.getInstance();

// Initial Run
manager.sync();

// Poll every 5 minutes
setInterval(() => {
    manager.sync();
}, 5 * 60 * 1000);

// Graceful Shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await prisma.$disconnect();
    process.exit(0);
});

logger.info('Disbot Mirroring Engine Started');
