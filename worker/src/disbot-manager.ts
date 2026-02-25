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
    private roleManager = DiscordRoleManager.getInstance();
    private isShuttingDown = false;

    public async start(): Promise<void> {
        logger.info({
            service: 'disbot-manager',
            pid: process.pid,
            nodeVersion: process.version,
            heapLimit: `${Math.round((process as any).memoryUsage?.().heapTotal / 1024 / 1024) || '?'} MB`,
        }, '═══ DISBOT Manager Service Starting ═══');

        // Verify database connectivity
        try {
            await prisma.$connect();
            logger.info('[Manager] Database connected');
        } catch (err: any) {
            logger.fatal({ error: err.message }, '[Manager] Database connection failed — exiting');
            process.exit(1);
        }

        // Start the Role Manager (loads config from DB)
        await this.roleManager.start();

        // Log status
        const status = this.roleManager.getStatus();
        logger.info({
            botReady: status.ready,
            configLoaded: status.configLoaded,
            guildId: status.guildId,
            guilds: status.guilds,
        }, '═══ DISBOT Manager Service Ready ═══');

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

    private async shutdown(signal: string): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        logger.info({ signal }, '═══ DISBOT Manager Service Shutting Down ═══');

        await this.roleManager.shutdown();
        await prisma.$disconnect();

        logger.info('═══ DISBOT Manager Service Stopped ═══');
        process.exit(0);
    }
}

// ──────────────────────────────────────────────────────────────
//  Boot
// ──────────────────────────────────────────────────────────────

new DisbotManager().start();
