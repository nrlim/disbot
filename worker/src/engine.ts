
import dotenv from 'dotenv';
import path from 'path';
import { logger } from './lib/logger';
import { enforcePathLimits, validatePlanConfig, PLAN_PATH_LIMITS } from './lib/plan-enforcer';
import { decrypt, validateEncryptionConfig } from './lib/crypto';
import { TelegramListener } from './lib/telegramMTProto';
import { DiscordMirror } from './lib/discordMirror';
import { TelegramDeliveryService } from './lib/TelegramDeliveryService';
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
    private isSyncing = false;
    private syncInterval: NodeJS.Timeout | null = null;

    public async start() {
        logger.info({
            pathLimits: PLAN_PATH_LIMITS,
            syncInterval: '30 seconds',
            mode: 'OPTIMIZED_STREAMING'
        }, 'DISBOT Mirroring Engine Started');

        // Initial Sync
        await this.sync();

        // Schedule Sync (every 30 seconds for faster updates)
        this.syncInterval = setInterval(() => this.sync(), 30 * 1000);

        // Start Vercel-to-VPS Heartbeat & Remote Restart Listener
        setInterval(async () => {
            if (!this.isShuttingDown) {
                try {
                    const settings = await prisma.botConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
                    if (settings) {
                        // 1. Send Heartbeat to DB
                        await prisma.botConfig.update({
                            where: { id: settings.id },
                            data: { lastWorkerHeartbeat: new Date() }
                        });

                        // 2. Check for Remote Restart request from Dashboard
                        if (settings.restartWorkerAt && settings.restartWorkerAt > new Date(Date.now() - 60000)) {
                            logger.info('[Engine] Remote restart requested from Dashboard via DB. Exiting for PM2 restart...');
                            await prisma.botConfig.update({
                                where: { id: settings.id },
                                data: { restartWorkerAt: null }
                            });
                            process.exit(0); // PM2 will automatically restart the process
                        }
                    }
                } catch (e: any) {
                    // Silently fail if DB is temporarily unreachable
                }
            }
        }, 15000).unref();

        // Signal Handlers
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    private async sync() {
        if (this.isShuttingDown || this.isSyncing) return;
        this.isSyncing = true;
        logger.info('Starting sync cycle...');

        try {
            // 0. Re-activate Telegram configs that were wrongly auto-disabled
            // Previous sync cycles set active=false when sessions were invalid (double-encrypted).
            // Now that decryption is fixed, re-enable them so they can connect.
            const reactivated = await prisma.mirrorConfig.updateMany({
                where: {
                    active: false,
                    status: 'CONFIGURATION_ERROR',
                    telegramAccountId: { not: null }, // Has a linked Telegram account
                    sourcePlatform: 'TELEGRAM'
                },
                data: { active: true, status: 'ACTIVE' }
            });
            if (reactivated.count > 0) {
                logger.info({ count: reactivated.count }, '[Sync] Re-activated previously disabled Telegram configs with linked accounts');
            }

            // 1. Fetch Active Configs with Relations
            const activeConfigsRaw = await prisma.mirrorConfig.findMany({
                where: { active: true },
                include: {
                    user: { select: { plan: true } },
                    discordAccount: true,
                    telegramAccount: true
                }
            });

            // Map to MirrorActiveConfig
            const activeConfigs: MirrorActiveConfig[] = activeConfigsRaw.map((cfg: any) => {
                let platform = (cfg.sourcePlatform as 'DISCORD' | 'TELEGRAM');
                if (!platform) platform = 'DISCORD';

                // Resolve Credentials from Relations
                let resolvedUserToken = undefined;
                if (cfg.discordAccount && cfg.discordAccount.token) {
                    resolvedUserToken = cfg.discordAccount.token;
                } else if (cfg.userToken) {
                    // Fallback for legacy configs if field typically exists on type (though removed in schema, runtime object might still have it if DB not migrated cleanly? No, prisma won't fetch it if not in schema)
                    // Actually, if we use @ts-ignore or 'any', we might access it if the column exists in DB but not schema. 
                    // But strictly speaking, we should rely on relation.
                    resolvedUserToken = cfg.userToken;
                }

                let resolvedTgSession: string | undefined = undefined;
                const sessionSource = cfg.telegramAccount?.sessionString
                    ? 'TelegramAccount'
                    : cfg.telegramSession
                        ? 'MirrorConfig (legacy)'
                        : 'NONE';

                if (cfg.telegramAccount && cfg.telegramAccount.sessionString) {
                    resolvedTgSession = cfg.telegramAccount.sessionString;
                } else if (cfg.telegramSession) {
                    resolvedTgSession = cfg.telegramSession; // Legacy fallback
                }

                // Log raw session info before decryption
                if (resolvedTgSession) {
                    logger.debug({
                        configId: cfg.id,
                        sessionSource,
                        rawLength: resolvedTgSession.length,
                        rawFirstChar: resolvedTgSession[0],
                        containsColon: resolvedTgSession.includes(':'),
                    }, '[Sync] Raw Telegram session from DB');
                }

                // Decrypt session — may need multiple rounds if double-encrypted.
                // BUG: The dashboard's getTelegramAccounts() returns encrypted sessionString
                // to the frontend. When the user creates/updates a mirror, the frontend sends
                // this encrypted value back as `telegramSession`, and mirror.ts calls
                // encrypt(telegramSession) again — double-encrypting it. 
                // The worker must peel ALL encryption layers to get the raw session.
                if (resolvedTgSession && resolvedTgSession.includes(':')) {
                    let decryptionRound = 0;
                    const MAX_ROUNDS = 3; // Safety limit

                    while (resolvedTgSession && decryptionRound < MAX_ROUNDS) {
                        // Check if current value looks encrypted (iv:tag:data = exactly 3 colon-separated hex parts)
                        const parts = resolvedTgSession.split(':');
                        if (parts.length !== 3) break; // Not our encryption format

                        decryptionRound++;
                        const decrypted = decrypt(resolvedTgSession, process.env.ENCRYPTION_KEY || '');
                        if (decrypted && decrypted.trim().length > 0) {
                            logger.debug({
                                configId: cfg.id,
                                round: decryptionRound,
                                resultLength: decrypted.length,
                                resultFirstChar: decrypted[0],
                                stillEncrypted: decrypted.split(':').length === 3,
                            }, '[Sync] Decryption round complete');
                            resolvedTgSession = decrypted;
                        } else {
                            logger.warn({
                                configId: cfg.id,
                                userId: cfg.userId,
                                round: decryptionRound,
                            }, '[Sync] Telegram session decryption failed — skipping. Check ENCRYPTION_KEY or re-link Telegram account.');
                            resolvedTgSession = undefined;
                            break;
                        }
                    }

                    if (resolvedTgSession && decryptionRound > 1) {
                        logger.warn({
                            configId: cfg.id,
                            totalRounds: decryptionRound,
                        }, '[Sync] Session was multi-encrypted — peeled all layers successfully');
                    }
                } else if (resolvedTgSession) {
                    logger.debug({
                        configId: cfg.id,
                        sessionLength: resolvedTgSession.length,
                        firstChar: resolvedTgSession[0],
                    }, '[Sync] Session has no colon — using raw value');
                }

                // Final validation: Telegram StringSession MUST start with "1" and be 100+ chars.
                // This catches Discord tokens (start with "M", ~72 chars) or other garbage
                // that ended up in the telegramSession legacy field.
                if (resolvedTgSession && (resolvedTgSession[0] !== '1' || resolvedTgSession.length < 100)) {
                    logger.warn({
                        configId: cfg.id,
                        userId: cfg.userId,
                        firstChar: resolvedTgSession[0],
                        length: resolvedTgSession.length,
                        looksLikeDiscordToken: resolvedTgSession.includes('.') && resolvedTgSession.length < 100,
                    }, '[Sync] Resolved session is NOT a valid Telegram session — skipping. User needs to re-link Telegram account.');
                    resolvedTgSession = undefined;
                }

                let resolvedTgChatId = undefined;
                if (platform === 'TELEGRAM') {
                    // For Telegram source: sourceChannelId stores the source chat ID
                    resolvedTgChatId = cfg.sourceChannelId || cfg.telegramChatId;
                }

                // Destination Telegram Chat ID:
                // For D2T: telegramChatId in DB is the destination
                // For T2T: telegramChatId in DB is the destination (source is in sourceChannelId)
                // For D2D/T2D: no Telegram destination
                const resolvedTargetTgChatId = (
                    (platform === 'DISCORD' && cfg.telegramChatId) // D2T
                    || (platform === 'TELEGRAM' && cfg.telegramChatId && cfg.sourceChannelId && cfg.telegramChatId !== cfg.sourceChannelId) // T2T (dest != source)
                ) ? cfg.telegramChatId : undefined;

                return {
                    id: cfg.id,
                    sourcePlatform: platform,
                    sourceChannelId: cfg.sourceChannelId || '',
                    userToken: resolvedUserToken,
                    telegramSession: resolvedTgSession,
                    telegramChatId: resolvedTgChatId,
                    telegramTopicId: cfg.telegramTopicId || undefined,
                    telegramAccountId: cfg.telegramAccountId || undefined,
                    targetWebhookUrl: cfg.targetWebhookUrl,
                    type: cfg.type as 'CUSTOM_HOOK' | 'MANAGED_BOT',
                    targetChannelId: cfg.targetChannelId || undefined,
                    userPlan: cfg.user?.plan || 'FREE',
                    userId: cfg.userId,
                    sourceChannelName: cfg.sourceChannelName || undefined,
                    targetWebhookName: cfg.targetWebhookName || undefined,
                    customWatermark: cfg.customWatermark || undefined,
                    targetTelegramChatId: resolvedTargetTgChatId,
                    targetTelegramTopicId: cfg.telegramTopicId || undefined,

                    // Visual Watermark fields (PRO/ELITE only)
                    watermarkType: (['PRO', 'ELITE'].includes(cfg.user?.plan))
                        ? (cfg.watermarkType as 'TEXT' | 'VISUAL' || 'TEXT')
                        : 'TEXT',
                    watermarkImageUrl: (['PRO', 'ELITE'].includes(cfg.user?.plan) && cfg.watermarkImageUrl)
                        ? cfg.watermarkImageUrl
                        : undefined,
                    watermarkPosition: cfg.watermarkPosition || 'southeast',
                    watermarkOpacity: (['PRO', 'ELITE'].includes(cfg.user?.plan)) ? (cfg.watermarkOpacity ?? 100) : 100,
                    brandColor: cfg.brandColor || undefined,
                    // Only pass blur regions for Elite users (plan-gated feature)
                    blurRegions: (cfg.user?.plan === 'ELITE' && cfg.blurRegions)
                        ? (typeof cfg.blurRegions === 'string' ? JSON.parse(cfg.blurRegions) : cfg.blurRegions)
                        : undefined,

                    // Elite Anti-Spam (Frontend Managed)
                    antiSpamEnabled: cfg.user?.plan === 'ELITE' ? cfg.antiSpamEnabled : false,
                    blacklistedUsers: cfg.user?.plan === 'ELITE' && cfg.blacklistedUsers
                        ? (typeof cfg.blacklistedUsers === 'string' ? JSON.parse(cfg.blacklistedUsers) : cfg.blacklistedUsers)
                        : []
                };
            });

            // 2. Enforce Path Limits - Pass activeConfigs directly as they are already mapped
            const allowedConfigs = await this.enforceLimits(activeConfigs);

            logger.info({
                totalActive: activeConfigs.length,
                allowed: allowedConfigs.length
            }, '[Sync] Configs loaded after limit enforcement');

            // 3. Split & Prepare
            const telegramConfigs: TelegramConfig[] = [];
            const discordConfigs: MirrorActiveConfig[] = [];

            for (const cfg of allowedConfigs) {
                // Determine if this config needs a Telegram Session (Listening OR Sending)
                const needsTelegramSession = cfg.sourcePlatform === 'TELEGRAM' || !!cfg.targetTelegramChatId;

                if (needsTelegramSession) {
                    // Session is already decrypted during the MirrorActiveConfig mapping phase above
                    const sessionString = cfg.telegramSession || '';

                    if (sessionString) {
                        // Check if we have source (for Listener) or target (for Sender)
                        const hasSource = cfg.sourcePlatform === 'TELEGRAM' && cfg.telegramChatId;
                        const hasTarget = !!cfg.targetTelegramChatId;

                        if (hasSource || hasTarget) {
                            const resolvedSourceChatId = cfg.sourcePlatform === 'TELEGRAM' ? cfg.telegramChatId : undefined;
                            logger.info({
                                configId: cfg.id,
                                sourcePlatform: cfg.sourcePlatform,
                                sourceChannelName: cfg.sourceChannelName || '(unnamed)',
                                dbSourceChannelId: cfg.sourceChannelId || '(empty)',
                                dbTelegramChatId: cfg.telegramChatId || '(empty)',
                                resolvedSourceChatId: resolvedSourceChatId || '(none)',
                                hasTarget,
                            }, '[Sync] Telegram config → listener mapping');

                            telegramConfigs.push({
                                id: cfg.id,
                                telegramSession: sessionString,
                                telegramChatId: resolvedSourceChatId,
                                telegramTopicId: cfg.telegramTopicId,
                                targetWebhookUrl: cfg.targetWebhookUrl,
                                targetTelegramChatId: cfg.targetTelegramChatId,
                                targetTelegramTopicId: cfg.targetTelegramTopicId,
                                customWatermark: cfg.customWatermark,
                                watermarkType: cfg.watermarkType,
                                watermarkImageUrl: cfg.watermarkImageUrl,
                                watermarkPosition: cfg.watermarkPosition,
                                watermarkOpacity: cfg.watermarkOpacity ?? 100,
                                brandColor: cfg.brandColor,
                                blurRegions: cfg.blurRegions,
                                sourceChannelName: cfg.sourceChannelName,
                                tier: cfg.userPlan,
                                antiSpamEnabled: cfg.antiSpamEnabled,
                                blacklistedUsers: cfg.blacklistedUsers,
                            });
                        }
                    } else if (cfg.sourcePlatform === 'TELEGRAM') {
                        // Skip this cycle — do NOT auto-disable.
                        // The session may become available after user re-links or fixes encryption.
                        logger.warn({
                            configId: cfg.id,
                            userId: cfg.userId,
                            reason: 'NO_SESSION',
                            platform: cfg.sourcePlatform,
                            hasTelegramAccountId: !!cfg.telegramAccountId,
                            telegramAccountId: cfg.telegramAccountId || '(none)',
                            hasLegacySession: !!cfg.telegramSession,
                            sessionResolutionFailed: !cfg.telegramSession,
                        }, '[Sync] Skipping Telegram config — no valid session this cycle. User may need to re-link their Telegram account.');
                    }
                }

                // Add to Discord Configs if Source is Discord
                if (cfg.sourcePlatform === 'DISCORD') {
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
        } finally {
            this.isSyncing = false;
        }
    }

    private async enforceLimits(configs: MirrorActiveConfig[]): Promise<MirrorActiveConfig[]> {
        const configsByUser = new Map<string, MirrorActiveConfig[]>();
        const allowed: MirrorActiveConfig[] = [];

        // Group configs by user
        for (const cfg of configs) {
            if (!configsByUser.has(cfg.userId)) configsByUser.set(cfg.userId, []);
            configsByUser.get(cfg.userId)!.push(cfg);
        }

        for (const [userId, userConfigs] of configsByUser) {
            try {
                // 1. Filter out feature-invalid configs (e.g. Starter trying to use Telegram)
                const featureValidConfigs: MirrorActiveConfig[] = [];
                const featureInvalidIds: string[] = [];

                for (const cfg of userConfigs) {
                    const validation = validatePlanConfig(cfg);
                    if (validation.valid) {
                        featureValidConfigs.push(cfg);
                    } else {
                        featureInvalidIds.push(cfg.id);
                        logger.warn({ userId, configId: cfg.id, reason: validation.reason, plan: cfg.userPlan }, 'Config disabled: Plan feature restriction');
                    }
                }

                // Auto-disable feature-invalid configs in DB
                if (featureInvalidIds.length > 0) {
                    await prisma.mirrorConfig.updateMany({
                        where: { id: { in: featureInvalidIds } },
                        data: { active: false, status: 'PLAN_RESTRICTION' } // This status will trigger the inactive state in UI
                    });
                }

                // 2. Enforce Path Limits on the remaining valid configs
                // We pass featureValidConfigs because only those are eligible to run
                const result = enforcePathLimits(featureValidConfigs, userId);
                allowed.push(...(result.allowed as MirrorActiveConfig[]));

                // Disable over-limit configs
                if (result.overLimit.length > 0) {
                    const overLimitIds = result.overLimit.map((c: any) => c.id);
                    await prisma.mirrorConfig.updateMany({
                        where: { id: { in: overLimitIds } },
                        data: { active: false, status: 'PATH_LIMIT_REACHED' }
                    });

                    logger.warn({ userId, count: overLimitIds.length }, 'Disabled configs exceeding path limit');
                }
            } catch (e: any) {
                logger.error({ userId, error: e.message }, 'Limit enforcement error');
                // Fallback: allow all if check fails to prevent outage, but log critical error
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
        // Flush the delivery retry queue BEFORE destroying Telegram connections
        await TelegramDeliveryService.getInstance().shutdown();
        await telegramListener.shutdown();
        await discordMirror.shutdown();
        await prisma.$disconnect();

        logger.info('Engine Shutdown Complete');
        process.exit(0);
    }
}

// Start the engine
new Engine().start();
