import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const bots = await prisma.botConfig.findMany({
            orderBy: { createdAt: 'desc' },
            include: { package: true, pointConfig: true, redeemItems: true }
        });

        // Masks token and calculates status based on heartbeats
        const formattedBots = bots.map((bot: any) => {
            const now = Date.now();
            let isOnline = false;

            if (bot.lastManagerHeartbeat && (now - bot.lastManagerHeartbeat.getTime()) < 90000) {
                isOnline = true;
            }

            return {
                id: bot.id,
                name: bot.name,
                clientId: bot.clientId,
                guildId: bot.guildId,
                features: bot.features || [],
                active: bot.active,
                isOnline,
                botToken: bot.botToken ? `${bot.botToken.substring(0, 5)}...` : '',
                pointConfig: bot.pointConfig,
                redeemItems: bot.redeemItems || [],
            };
        });

        return NextResponse.json({ bots: formattedBots });
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
        const { action, payload } = body;

        if (action === 'CREATE_BOT') {
            const { name, botToken, clientId, guildId, adminRoleId, trialRoleId } = payload;

            const encryptedToken = encrypt(botToken);

            const newBot = await prisma.botConfig.create({
                data: {
                    name,
                    botToken: encryptedToken,
                    clientId,
                    guildId,
                    adminRoleId: adminRoleId || null,
                    trialRoleId: trialRoleId || null,
                    active: true,
                    features: [],
                }
            });

            return NextResponse.json({ success: true, bot: newBot });
        }

        if (action === 'UPDATE_FEATURES') {
            const { botId, features } = payload;

            // Validate dependencies
            if (features.includes('ELITE') && !features.includes('BASE')) {
                features.push('BASE');
            }

            const updatedBot = await prisma.botConfig.update({
                where: { id: botId },
                data: {
                    features,
                    restartManagerAt: new Date() // Trigger hot-reload
                }
            });

            return NextResponse.json({ success: true, bot: updatedBot });
        }

        if (action === 'TOGGLE_BOT') {
            const { botId, active } = payload;

            const updatedBot = await prisma.botConfig.update({
                where: { id: botId },
                data: {
                    active,
                    // If deactivating, technically the manager handles shutdown, so setting active:false is enough.
                    restartManagerAt: new Date() // Trigger update loop in manager
                }
            });

            return NextResponse.json({ success: true, bot: updatedBot });
        }

        if (action === 'UPDATE_POINT_CONFIG') {
            const { botId, pointsPerMessage, cooldownSeconds, earningChannels } = payload;

            await prisma.pointConfig.upsert({
                where: { botId },
                update: { pointsPerMessage, cooldownSeconds },
                create: { botId, pointsPerMessage, cooldownSeconds }
            });

            await prisma.botConfig.update({
                where: { id: botId },
                data: {
                    earningChannels: earningChannels || [],
                    restartManagerAt: new Date()
                } // Trigger hot-reload
            });

            return NextResponse.json({ success: true });
        }

        if (action === 'ADD_REDEEM_ITEM') {
            const { botId, roleId, roleName, pointCost, durationDays } = payload;

            const newItem = await prisma.redeemItem.create({
                data: { botId, roleId, roleName, pointCost, durationDays }
            });

            await prisma.botConfig.update({
                where: { id: botId },
                data: { restartManagerAt: new Date() }
            });

            return NextResponse.json({ success: true, item: newItem });
        }

        if (action === 'DELETE_REDEEM_ITEM') {
            const { itemId, botId } = payload;

            await prisma.redeemItem.delete({
                where: { id: itemId }
            });

            await prisma.botConfig.update({
                where: { id: botId },
                data: { restartManagerAt: new Date() }
            });

            return NextResponse.json({ success: true });
        }

        if (action === 'TOGGLE_REDEEM_ITEM') {
            const { itemId, active, botId } = payload;

            await prisma.redeemItem.update({
                where: { id: itemId },
                data: { isActive: active }
            });

            await prisma.botConfig.update({
                where: { id: botId },
                data: { restartManagerAt: new Date() }
            });

            return NextResponse.json({ success: true });
        }

        if (action === 'DELETE_BOT') {
            const { botId } = payload;

            await prisma.botConfig.delete({
                where: { id: botId }
            });

            return NextResponse.json({ success: true, message: "Bot deleted successfully." });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
