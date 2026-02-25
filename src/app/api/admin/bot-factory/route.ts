import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { z } from 'zod';

const rateLimitCache = new Map<string, { count: number, timestamp: number }>();
function checkRateLimit(userId: string) {
    const now = Date.now();
    const entry = rateLimitCache.get(userId);
    if (!entry || now - entry.timestamp > 60000) {
        rateLimitCache.set(userId, { count: 1, timestamp: now });
        return true;
    }
    // Limit to 20 actions per minute per user on factory settings
    if (entry.count >= 20) return false;
    entry.count++;
    return true;
}

// Zod schemas for input validation
const createBotSchema = z.object({
    name: z.string().min(1),
    botToken: z.string().min(10),
    clientId: z.string().min(10),
    guildId: z.string().min(10),
    adminRoleId: z.string().optional().nullable(),
    trialRoleId: z.string().optional().nullable(),
});

const updateFeaturesSchema = z.object({
    botId: z.string(),
    features: z.array(z.string()),
});

const toggleBotSchema = z.object({
    botId: z.string(),
    active: z.boolean(),
});

const updatePointConfigSchema = z.object({
    botId: z.string(),
    pointsPerMessage: z.number().min(1).max(100),
    cooldownSeconds: z.number().min(0).max(3600),
    earningChannels: z.array(z.string()).optional(),
});

const addRedeemItemSchema = z.object({
    botId: z.string(),
    roleId: z.string(),
    roleName: z.string().min(1),
    pointCost: z.number().min(1),
    durationDays: z.number().min(1),
});

const deleteRedeemItemSchema = z.object({
    itemId: z.string(),
    botId: z.string(),
});

const toggleRedeemItemSchema = z.object({
    itemId: z.string(),
    active: z.boolean(),
    botId: z.string(),
});

const deleteBotSchema = z.object({
    botId: z.string(),
});

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const bots = await prisma.botConfig.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                clientId: true,
                guildId: true,
                features: true,
                active: true,
                botToken: true,
                lastManagerHeartbeat: true,
                pointConfig: true,
                redeemItems: true,
            }
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
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkRateLimit(session.user.id)) {
        return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 });
    }

    try {
        const body = await req.json();
        const { action, payload } = body;

        if (action === 'CREATE_BOT') {
            const parsed = createBotSchema.parse(payload);
            const { name, botToken, clientId, guildId, adminRoleId, trialRoleId } = parsed;

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
            const parsed = updateFeaturesSchema.parse(payload);
            const { botId, features } = parsed;

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
            const parsed = toggleBotSchema.parse(payload);
            const { botId, active } = parsed;

            const updatedBot = await prisma.botConfig.update({
                where: { id: botId },
                data: {
                    active,
                    restartManagerAt: new Date() // Trigger update loop in manager
                }
            });

            return NextResponse.json({ success: true, bot: updatedBot });
        }

        if (action === 'UPDATE_POINT_CONFIG') {
            const parsed = updatePointConfigSchema.parse(payload);
            const { botId, pointsPerMessage, cooldownSeconds, earningChannels } = parsed;

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
            const parsed = addRedeemItemSchema.parse(payload);
            const { botId, roleId, roleName, pointCost, durationDays } = parsed;

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
            const parsed = deleteRedeemItemSchema.parse(payload);
            const { itemId, botId } = parsed;

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
            const parsed = toggleRedeemItemSchema.parse(payload);
            const { itemId, active, botId } = parsed;

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
            const parsed = deleteBotSchema.parse(payload);
            const { botId } = parsed;

            await prisma.botConfig.delete({
                where: { id: botId }
            });

            return NextResponse.json({ success: true, message: "Bot deleted successfully." });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation Failed", details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
