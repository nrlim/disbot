import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const settings = await prisma.botSettings.findFirst({
            orderBy: { updatedAt: 'desc' },
            where: { active: true }
        });

        if (!settings || !settings.botToken || !settings.guildId) {
            return NextResponse.json({ error: 'Bot is not configured or missing Guild ID' }, { status: 400 });
        }

        let token = settings.botToken;
        try {
            const dec = decrypt(token);
            if (dec) token = dec;
        } catch (e) {
            // Might be unencrypted (fallback)
        }

        // Fetch Roles from Discord API
        const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${settings.guildId}/roles`, {
            headers: {
                Authorization: `Bot ${token}`
            },
            next: { revalidate: 60 } // Cache for 60s
        });

        if (!rolesRes.ok) {
            const err = await rolesRes.json().catch(() => ({}));
            throw new Error(`Failed to fetch roles: ${err.message || rolesRes.statusText}`);
        }

        const rawRoles = await rolesRes.json();

        // Fetch Members from Discord API (up to 1000 for lookup)
        const membersRes = await fetch(`https://discord.com/api/v10/guilds/${settings.guildId}/members?limit=1000`, {
            headers: {
                Authorization: `Bot ${token}`
            },
            next: { revalidate: 60 } // Cache for 1 min
        });

        let members = [];
        if (membersRes.ok) {
            const rawMembers = await membersRes.json();
            members = rawMembers.map((m: any) => ({
                id: m.user.id,
                username: m.user.username,
                global_name: m.user.global_name,
                avatar: m.user.avatar
            }));
        }

        const roles = rawRoles
            .filter((r: any) => r.name !== '@everyone')
            .map((r: any) => ({
                id: r.id,
                name: r.name,
                color: r.color,
                position: r.position
            }))
            .sort((a: any, b: any) => b.position - a.position);

        return NextResponse.json({ roles, members, guildId: settings.guildId });
    } catch (error: any) {
        console.error('Discord API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
