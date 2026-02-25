import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Fetch BotSettings
        let botSettings = await prisma.botSettings.findFirst({
            orderBy: { updatedAt: 'desc' }
        });

        // Decrypt token to send to frontend but masked
        if (botSettings && botSettings.botToken) {
            try {
                const dec = decrypt(botSettings.botToken);
                botSettings.botToken = dec;
            } catch (e) {
                // If decryption fails, keep it empty
                botSettings.botToken = '';
            }
        }

        // 2. Fetch Discord Users
        const discordUsers = await prisma.discordUser.findMany({
            orderBy: { expiryDate: 'asc' },
            take: 100
        });

        const autoReverted = await prisma.discordUser.findMany({
            where: { status: 'EXPIRED' },
            orderBy: { updatedAt: 'desc' },
            take: 5
        });

        // 3. Fetch Telegram Blacklist
        const spammers = await prisma.spamBlacklist.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // 4. Fetch PM2 Status
        let pm2WorkerStatus = 'unknown';
        let pm2ManagerStatus = 'unknown';
        let workerMem = 0;
        let managerMem = 0;

        try {
            const { stdout } = await execAsync('pm2 jlist');
            const processes = JSON.parse(stdout);

            const workerProc = processes.find((p: any) => p.name === 'disbot-worker');
            const managerProc = processes.find((p: any) => p.name === 'disbot-manager');

            if (workerProc) {
                pm2WorkerStatus = workerProc.pm2_env.status;
                workerMem = workerProc.monit.memory;
            }
            if (managerProc) {
                pm2ManagerStatus = managerProc.pm2_env.status;
                managerMem = managerProc.monit.memory;
            }
        } catch (e) {
            // Silently ignore PM2 missing errors in dev mode
        }

        return NextResponse.json({
            botSettings,
            discordUsers,
            autoReverted,
            spammers,
            pm2: {
                worker: { status: pm2WorkerStatus, memory: workerMem },
                manager: { status: pm2ManagerStatus, memory: managerMem }
            }
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { action } = body;

        switch (action) {
            case 'SAVE_SETTINGS': {
                const { botToken, clientId, guildId, adminRoleId, trialRoleId, globalAntiSpam } = body.payload;

                let encryptedToken = botToken;
                // If it's not masked / already masked logic
                if (botToken && !botToken.includes('•')) {
                    encryptedToken = encrypt(botToken);
                } else if (botToken.includes('•')) {
                    // Do not update the token if it's currently masked
                    const existing = await prisma.botSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
                    encryptedToken = existing?.botToken || '';
                }

                await prisma.botSettings.upsert({
                    where: { id: body.payload.id || 'new' }, // 'new' won't match, so creates
                    update: {
                        botToken: encryptedToken,
                        clientId,
                        guildId,
                        adminRoleId,
                        trialRoleId,
                        globalAntiSpam
                    },
                    create: {
                        botToken: encryptedToken,
                        clientId,
                        guildId,
                        adminRoleId,
                        trialRoleId,
                        globalAntiSpam,
                        active: true
                    }
                });

                // Restart manager automatically
                try {
                    await execAsync('pm2 restart disbot-manager');
                } catch (e) {
                    // Silently ignore restart errors in dev mode
                }

                return NextResponse.json({ success: true, message: 'Settings saved & Bot Manager restarted.' });
            }

            case 'RESTART_PROCESS': {
                const { target } = body.payload; // 'disbot-manager' or 'disbot-worker'
                try {
                    await execAsync(`pm2 restart ${target}`);
                    return NextResponse.json({ success: true, message: `${target} restarted.` });
                } catch (e) {
                    return NextResponse.json({ error: `Failed to restart ${target}` }, { status: 500 });
                }
            }

            case 'GRANT_ROLE': {
                const { discordId, guildId, durationDays, roleId } = body.payload;

                // Set expiry
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + parseInt(durationDays));

                await prisma.discordUser.upsert({
                    where: { discordId_guildId: { discordId, guildId } },
                    update: {
                        currentRole: roleId,
                        expiryDate,
                        status: 'ACTIVE'
                    },
                    create: {
                        discordId,
                        guildId,
                        currentRole: roleId,
                        expiryDate,
                        status: 'ACTIVE'
                    }
                });

                // NOTE: Real role assignment via API is handled gracefully 
                // However, since disbot-manager is a separate service, 
                // ideally its internal system will detect the new DB row or the user can force a resync.
                // Or we do direct Discord API call here to actually grant the role:
                // Because we have the bot Token, we can do a simple fetch:
                try {
                    const settings = await prisma.botSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
                    if (settings && settings.botToken) {
                        const tokenRaw = decrypt(settings.botToken);
                        await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bot ${tokenRaw}`, 'X-Audit-Log-Reason': 'Manual Grant via Admin Dash' }
                        });
                    }
                } catch (err) {
                    console.error('Discord API grant failed', err);
                }

                return NextResponse.json({ success: true, message: 'Role granted manually in DB.' });
            }

            case 'BLOCK_TELEGRAM': {
                const { telegramId } = body.payload;
                await prisma.spamBlacklist.upsert({
                    where: { telegramId },
                    update: { reason: 'Manual Block' },
                    create: { telegramId, reason: 'Manual Block' }
                });
                return NextResponse.json({ success: true });
            }

            case 'UNLOCK_TELEGRAM': {
                const { telegramId } = body.payload;
                await prisma.spamBlacklist.delete({ where: { telegramId } });
                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
