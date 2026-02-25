/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  DISBOT Manager — Discord Auto-Role Management Service      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                              ║
 * ║  Runs as a SEPARATE PM2 process from the Mirroring Engine.  ║
 * ║  Memory budget: 512 MB                                       ║
 * ║                                                              ║
 * ║  Features:                                                   ║
 * ║  • DB-driven config (BotSettings table, no .env tokens)      ║
 * ║  • Temporary role assignments with auto-expiry               ║
 * ║  • Trial role revert on expiry                               ║
 * ║  • Hot-reload: Dashboard config changes picked up live       ║
 * ║  • DM notifications on role expiry                           ║
 * ║                                                              ║
 * ║  PM2: pm2 start ecosystem.config.js --only disbot-manager   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables (DATABASE_URL, ENCRYPTION_KEY)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { DiscordRoleManager } from './lib/discordRoleManager';

// ──────────────────────────────────────────────────────────────
//  Manager Service
// ──────────────────────────────────────────────────────────────

class DisbotManager {
    private botManagers: Map<string, DiscordRoleManager> = new Map();
    private isShuttingDown = false;
    private configSyncInterval: NodeJS.Timeout | null = null;

    public async start(): Promise<void> {
        logger.info({
            service: 'disbot-manager',
            pid: process.pid,
            nodeVersion: process.version,
            heapLimit: `${Math.round((process as any).memoryUsage?.().heapTotal / 1024 / 1024) || '?'} MB`,
        }, '═══ DISBOT Manager Multi-Tenant Service Starting ═══');

        // Verify database connectivity
        try {
            await prisma.$connect();
            logger.info('[Manager] Database connected');
        } catch (err: any) {
            logger.fatal({ error: err.message }, '[Manager] Database connection failed — exiting');
            process.exit(1);
        }

        // Initial sync of all active bots
        await this.syncBots();

        // 1 minute — check for new active bots or deactivated bots
        this.configSyncInterval = setInterval(() => {
            this.syncBots().catch(err => {
                logger.error({ error: err.message }, '[Manager] Global bots sync failed');
            });
        }, 60 * 1000);
        this.configSyncInterval.unref();

        logger.info({ activeBots: this.botManagers.size }, '═══ DISBOT Manager Multi-Tenant Service Ready ═══');

        // Memory monitoring (every 5 min) — keep under 512MB
        setInterval(() => {
            const mem = process.memoryUsage();
            const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
            const rssMB = Math.round(mem.rss / 1024 / 1024);

            if (heapMB > 400) {
                logger.warn({ heapMB, rssMB }, '[Manager] High memory usage — approaching 512MB limit');
            } else {
                logger.debug({ heapMB, rssMB }, '[Manager] Memory stats');
            }
        }, 5 * 60 * 1000).unref();

        // Signal handlers for graceful shutdown
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        process.on('uncaughtException', (err) => {
            logger.fatal({ error: err.message, stack: err.stack }, '[Manager] Uncaught exception');
            this.shutdown('UNCAUGHT_EXCEPTION');
        });
        process.on('unhandledRejection', (reason: any) => {
            logger.error({ error: reason?.message || reason }, '[Manager] Unhandled rejection');
        });
    }

    private async syncBots(): Promise<void> {
        if (this.isShuttingDown) return;

        const activeConfigs = await prisma.botConfig.findMany({
            where: { active: true }
        });

        const activeConfigIds = new Set(activeConfigs.map(c => c.id));

        // Start new bots
        for (const config of activeConfigs) {
            if (!this.botManagers.has(config.id)) {
                logger.info({ botId: config.id }, '[Manager] Starting new bot instance');
                const manager = new DiscordRoleManager(config.id);
                this.botManagers.set(config.id, manager);
                manager.start().catch(err => {
                    logger.error({ botId: config.id, error: err.message }, 'Failed to start bot instance');
                });
            }
        }

        // Shut down disabled/removed bots
        for (const [botId, manager] of this.botManagers.entries()) {
            if (!activeConfigIds.has(botId)) {
                logger.info({ botId }, '[Manager] Shutting down removed or deactivated bot instance');
                manager.shutdown().catch(err => logger.error({ botId, error: err.message }, 'Error shutting down bot instance'));
                this.botManagers.delete(botId);
            }
        }
    }

    private async shutdown(signal: string): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        if (this.configSyncInterval) clearInterval(this.configSyncInterval);

        logger.info({ signal }, '═══ DISBOT Manager Service Shutting Down ═══');

        const shutdownPromises = Array.from(this.botManagers.values()).map(manager => manager.shutdown());
        await Promise.allSettled(shutdownPromises);

        await prisma.$disconnect();

        logger.info('═══ DISBOT Manager Service Stopped ═══');
        process.exit(0);
    }
}

// ──────────────────────────────────────────────────────────────
//  Boot
// ──────────────────────────────────────────────────────────────

new DisbotManager().start();
