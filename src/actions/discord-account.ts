"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { encrypt, decrypt } from "@/lib/encryption";

export async function getGuildsForAccount(accountId: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    const account = await prisma.discordAccount.findUnique({
        where: { id: accountId, userId: session.user.id }
    });

    if (!account) return { error: "Account not found" };

    try {
        const token = decrypt(account.token);
        const res = await fetch("https://discord.com/api/v9/users/@me/guilds", {
            headers: { Authorization: token }
        });

        if (!res.ok) {
            if (res.status === 401) {
                // Mark invalid?
                await prisma.discordAccount.update({
                    where: { id: accountId },
                    data: { valid: false }
                });
                return { error: "Token expired or invalid" };
            }
            return { error: "Failed to fetch guilds" };
        }

        const guilds = await res.json();
        return guilds.map((g: any) => ({
            id: g.id,
            name: g.name,
            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
            permissions: g.permissions
        }));

    } catch (e) {
        return { error: "Internal Error" };
    }
}

export async function addDiscordAccount(token: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    if (!token) return { error: "Token is required" };

    // Check limits (Max 3)
    const count = await prisma.discordAccount.count({
        where: { userId: session.user.id }
    });

    if (count >= 3) {
        return { error: "Account limit reached (Max 3)." };
    }

    // Verify Token
    try {
        const res = await fetch("https://discord.com/api/v9/users/@me", {
            headers: { Authorization: token }
        });

        if (!res.ok) {
            if (res.status === 401) return { error: "Invalid Discord Token" };
            return { error: "Failed to verify token with Discord" };
        }

        const data = await res.json();
        const discordId = data.id;
        const username = data.username;
        const discriminator = data.discriminator;
        const avatar = data.avatar;

        // Check duplicate
        const existing = await prisma.discordAccount.findFirst({
            where: {
                userId: session.user.id,
                discordId: discordId
            }
        });

        if (existing) {
            // Update token if re-adding
            await prisma.discordAccount.update({
                where: { id: existing.id },
                data: {
                    token: encrypt(token),
                    username,
                    discriminator,
                    avatar,
                    valid: true
                }
            });
            revalidatePath("/dashboard/settings");
            return {
                success: true,
                account: {
                    id: existing.id,
                    username,
                    discriminator,
                    avatar,
                    discordId,
                    valid: true,
                    createdAt: existing.createdAt
                }
            };
        }

        // Create
        const newAccount = await prisma.discordAccount.create({
            data: {
                userId: session.user.id,
                discordId,
                username,
                discriminator,
                avatar,
                token: encrypt(token),
                valid: true
            }
        });

        revalidatePath("/dashboard/settings");
        return {
            success: true,
            account: {
                id: newAccount.id,
                username: newAccount.username,
                discriminator: newAccount.discriminator,
                avatar: newAccount.avatar,
                discordId: newAccount.discordId,
                valid: newAccount.valid,
                createdAt: newAccount.createdAt
            }
        };

    } catch (e: any) {
        console.error("Add Account Error:", e);
        return { error: "Internal Error: " + (e.message || "Unknown") };
    }
}

export async function getDiscordAccounts() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return [];

    return await prisma.discordAccount.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            username: true,
            discriminator: true,
            avatar: true,
            discordId: true,
            createdAt: true,
            valid: true
        }
    });
}

export async function deleteDiscordAccount(id: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    try {
        await prisma.discordAccount.delete({
            where: { id, userId: session.user.id }
        });
        revalidatePath("/dashboard/settings");
        return { success: true };
    } catch (e) {
        return { error: "Failed to delete account" };
    }
}

export async function getChannelsForGuild(accountId: string, guildId: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    const account = await prisma.discordAccount.findUnique({
        where: { id: accountId, userId: session.user.id }
    });

    if (!account) return { error: "Account not found" };

    try {
        const token = decrypt(account.token);
        const res = await fetch(`https://discord.com/api/v9/guilds/${guildId}/channels`, {
            headers: { Authorization: token }
        });

        if (!res.ok) {
            return { error: "Failed to fetch channels" };
        }

        const channels = await res.json();
        // Filter for text and news channels (0: GUILD_TEXT, 5: GUILD_ANNOUNCEMENT)
        return channels
            .filter((c: any) => c.type === 0 || c.type === 5)
            .map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                position: c.position,
                parentId: c.parent_id
            }))
            .sort((a: any, b: any) => a.position - b.position);

    } catch (e) {
        return { error: "Internal Error" };
    }
}

export async function getWebhooksForChannel(accountId: string, channelId: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    const account = await prisma.discordAccount.findUnique({
        where: { id: accountId, userId: session.user.id }
    });

    if (!account) return { error: "Account not found" };

    try {
        const token = decrypt(account.token);
        const res = await fetch(`https://discord.com/api/v9/channels/${channelId}/webhooks`, {
            headers: { Authorization: token }
        });

        if (!res.ok) {
            // If they don't have manage webhooks permission, this will fail
            return { error: "Failed to fetch webhooks (Missing Permissions?)" };
        }

        const webhooks = await res.json();
        return webhooks.map((w: any) => ({
            id: w.id,
            name: w.name,
            token: w.token,
            url: `https://discord.com/api/webhooks/${w.id}/${w.token}`,
            avatar: w.avatar
        }));

    } catch (e) {
        return { error: "Internal Error" };
    }
}

export async function createWebhook(accountId: string, channelId: string, name: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    const account = await prisma.discordAccount.findUnique({
        where: { id: accountId, userId: session.user.id }
    });

    if (!account) return { error: "Account not found" };

    try {
        const token = decrypt(account.token);
        const res = await fetch(`https://discord.com/api/v9/channels/${channelId}/webhooks`, {
            method: "POST",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: name || "Disbot Mirror" })
        });

        if (!res.ok) {
            return { error: "Failed to create webhook (Missing Permissions?)" };
        }

        const webhook = await res.json();
        return {
            success: true,
            webhook: {
                id: webhook.id,
                name: webhook.name,
                token: webhook.token,
                url: `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`,
                avatar: webhook.avatar
            }
        };

    } catch (e) {
        return { error: "Internal Error" };
    }
}
