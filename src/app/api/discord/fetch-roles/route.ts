import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        let { botToken, guildId, botId } = body;

        if (botId) {
            const config = await prisma.botConfig.findUnique({ where: { id: botId } });
            if (!config) return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
            const encryptionKey = process.env.ENCRYPTION_KEY || '';
            botToken = encryptionKey && config.botToken.includes(':')
                ? decrypt(config.botToken)
                : config.botToken;

            guildId = config.guildId;
        }

        if (!botToken || !guildId) {
            return NextResponse.json({ error: 'Missing token or guild ID' }, { status: 400 });
        }

        const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
            headers: {
                Authorization: `Bot ${botToken}`
            }
        });

        if (!rolesRes.ok) {
            const err = await rolesRes.json().catch(() => ({}));
            throw new Error(`Failed to fetch roles: ${err.message || rolesRes.statusText}`);
        }

        const rawRoles = await rolesRes.json();

        const roles = rawRoles
            .filter((r: any) => r.name !== '@everyone')
            .map((r: any) => ({
                id: r.id,
                name: r.name,
                color: r.color,
                position: r.position
            }))
            .sort((a: any, b: any) => b.position - a.position);

        return NextResponse.json({ roles });
    } catch (error: any) {
        console.error('Discord API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
