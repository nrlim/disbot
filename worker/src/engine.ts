
import dotenv from 'dotenv';
import path from 'path';
import { logger } from './lib/logger';
import { enforcePathLimits, PLAN_PATH_LIMITS } from './lib/plan-enforcer';
import { decrypt, validateEncryptionConfig } from './lib/crypto';
import { TelegramListener } from './lib/telegramMTProto';
import { DiscordMirror } from './lib/discordMirror';
import { BackgroundTaskManager } from './lib/backgroundTask';
import { MirrorActiveConfig, TelegramConfig } from './lib/types';
import { prisma } from './lib/prisma';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Validate Environment
validateEncryptionConfig();

// Singletons
const telegramListener = TelegramListener.getInstance();
const discordMirror = DiscordMirror.getInstance();
const backgroundTasks = BackgroundTaskManager.getInstance();

export class Engine {
    private isShuttingDown = false;
    private syncInterval: NodeJS.Timeout | null = null;

    public async start() {
        logger.info({
            pathLimits: PLAN_PATH_LIMITS,
            syncInterval: '5 minutes',
            mode: 'OPTIMIZED_STREAMING'
        }, 'DISBOT Mirroring Engine Started');

        // Initial Sync
        await this.sync();

        // Schedule Sync
        this.syncInterval = setInterval(() => this.sync(), 5 * 60 * 1000);

        // Signal Handlers
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    private async sync() {
        if (this.isShuttingDown) return;
        logger.info('Starting sync cycle...');

        try {
            // 1. Fetch Active Configs
            const activeConfigsRaw = await prisma.mirrorConfig.findMany({
                where: { active: true },
                include: { user: { select: { plan: true } } }
            });

            // Map to MirrorActiveConfig
            const activeConfigs: MirrorActiveConfig[] = activeConfigsRaw.map((cfg: any) => {
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

            // 2. Enforce Path Limits
            const allowedConfigs = this.enforceLimits(activeConfigs);

            // 3. Split & Prepare
            const telegramConfigs: TelegramConfig[] = [];
            const discordConfigs: MirrorActiveConfig[] = [];

            for (const cfg of allowedConfigs) {
                if (cfg.sourcePlatform === 'TELEGRAM') {
                    // Decrypt session for TelegramListener
                    let decryptedSession = cfg.telegramSession || '';
                    if (decryptedSession.includes(':')) {
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
                    }
                } else {
                    // Discord (Decryption happens inside DiscordMirror to verify tokens)
                    discordConfigs.push(cfg);
                }
            }

            // 4. Sync Managers
            await telegramListener.sync(telegramConfigs);
            await discordMirror.sync(discordConfigs);

            logger.info({
                discordCount: discordConfigs.length,
                telegramCount: telegramConfigs.length
            }, 'Sync cycle complete');

        } catch (err: any) {
            logger.error({ error: err.message }, 'Error during sync cycle');
        }
    }

    private enforceLimits(configs: MirrorActiveConfig[]): MirrorActiveConfig[] {
        const configsByUser = new Map<string, MirrorActiveConfig[]>();
        for (const cfg of configs) {
            if (!configsByUser.has(cfg.userId)) configsByUser.set(cfg.userId, []);
            configsByUser.get(cfg.userId)!.push(cfg);
        }

        const allowed: MirrorActiveConfig[] = [];

        for (const [userId, userConfigs] of configsByUser) {
            try {
                const result = enforcePathLimits(userConfigs, userId);
                allowed.push(...(result.allowed as MirrorActiveConfig[]));

                // Disable over-limit configs
                if (result.overLimit.length > 0) {
                    const ids = result.overLimit.map((c: any) => c.id);
                    prisma.mirrorConfig.updateMany({
                        where: { id: { in: ids } },
                        data: { active: false, status: 'PATH_LIMIT_REACHED' }
                    }).catch(() => { });
                }
            } catch (e) {
                logger.error({ userId }, 'Limit enforcement error');
                // Fallback: allow all if check fails to prevent outage
                allowed.push(...userConfigs);
            }
        }
        return allowed;
    }

    public async shutdown() {
        this.isShuttingDown = true;
        if (this.syncInterval) clearInterval(this.syncInterval);

        logger.info('Shutting down engine...');

        await backgroundTasks.shutdown();
        await telegramListener.shutdown();
        await discordMirror.shutdown();
        await prisma.$disconnect();

        logger.info('Engine Shutdown Complete');
        process.exit(0);
    }
}

// Start the engine
new Engine().start();
