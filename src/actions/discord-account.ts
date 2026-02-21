"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { encrypt, decrypt } from "@/lib/encryption";

// Simple TTL Cache to prevent rapid 429s from UI re-renders
const discordCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

function getCached(key: string) {
    const cached = discordCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCache(key: string, data: any) {
    discordCache.set(key, { data, timestamp: Date.now() });
}

export async function getGuildsForAccount(accountId: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    const cacheKey = `guilds_${accountId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const account = await prisma.discordAccount.findUnique({
        where: { id: accountId, userId: session.user.id }
    });

    if (!account) return { error: "Account not found" };

    try {
        const token = decrypt(account.token);
        const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
            headers: { Authorization: token },
            cache: 'no-store'
        });

        if (!res.ok) {
            console.error(`[getGuildsForAccount] Error: ${res.status} ${res.statusText} for account ${accountId}`);
            if (res.status === 401) {
                await prisma.discordAccount.update({
                    where: { id: accountId },
                    data: { valid: false }
                });
                return { error: "Token expired or invalid" };
            }
            if (res.status === 429) {
                return { error: "Rate limited by Discord. Please wait a few seconds." };
            }
            return { error: `Failed to fetch guilds (${res.status})` };
        }

        const guilds = await res.json();
        const result = guilds.map((g: any) => ({
            id: g.id,
            name: g.name,
            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
            permissions: g.permissions
        }));

        setCache(cacheKey, result);
        console.log(`[getGuildsForAccount] Fetched ${guilds.length} guilds for account ${accountId}`);
        return result;

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
        const res = await fetch("https://discord.com/api/v10/users/@me", {
            headers: { Authorization: token },
            cache: 'no-store'
        });

        if (!res.ok) {
            console.error(`[addDiscordAccount] Error: ${res.status} ${res.statusText}`);
            if (res.status === 401) return { error: "Invalid Discord Token" };
            return { error: `Failed to verify token with Discord (${res.status})` };
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

    // 1. Get existing expert-mode accounts
    const accounts = await prisma.discordAccount.findMany({
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

    // 2. Try to "Discover" the login account if no expert accounts exist or if it's missing
    // This helps with the "linked from akun login" issue
    try {
        const oauthAccount = await prisma.account.findFirst({
            where: { userId: session.user.id, provider: 'discord' }
        });

        if (oauthAccount && oauthAccount.access_token) {
            const hasExpAccount = accounts.some(a => a.discordId === oauthAccount.providerAccountId);

            if (!hasExpAccount) {
                // Auto-create an expert-mode record for the login account 
                // Note: OAuth tokens are shorter-lived, but this provides a better first-time experience
                const res = await fetch("https://discord.com/api/v10/users/@me", {
                    headers: { Authorization: `Bearer ${oauthAccount.access_token}` },
                    cache: 'no-store'
                });

                if (res.ok) {
                    const data = await res.json();
                    const newAcc = await prisma.discordAccount.create({
                        data: {
                            userId: session.user.id,
                            discordId: data.id,
                            username: data.username,
                            discriminator: data.discriminator,
                            avatar: data.avatar,
                            token: encrypt(`Bearer ${oauthAccount.access_token}`),
                            valid: true
                        },
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
                    return [newAcc, ...accounts];
                }
            }
        }
    } catch (e) {
        console.error("Auto-sync OAuth account error:", e);
    }

    return accounts;
}

export async function deleteDiscordAccount(id: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    try {
        await prisma.discordAccount.delete({
            where: { id, userId: session.user.id }
        });
        revalidatePath("/dashboard/settings");
        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e) {
        return { error: "Failed to delete account" };
    }
}

export async function getChannelsForGuild(accountId: string, guildId: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    const cacheKey = `channels_${accountId}_${guildId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const account = await prisma.discordAccount.findUnique({
        where: { id: accountId, userId: session.user.id }
    });

    if (!account) return { error: "Account not found" };

    try {
        const token = decrypt(account.token);
        const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
            headers: { Authorization: token },
            cache: 'no-store'
        });

        if (!res.ok) {
            console.error(`[getChannelsForGuild] Error: ${res.status} ${res.statusText} for guild ${guildId}`);
            if (res.status === 401) {
                await prisma.discordAccount.update({
                    where: { id: accountId },
                    data: { valid: false }
                });
                return { error: "Token expired or invalid" };
            }
            if (res.status === 429) return { error: "Rate limited. Please wait." };
            if (res.status === 403) return { error: "Access Denied (Not in Server?)" };
            if (res.status === 404) return { error: "Server Not Found" };
            return { error: `Failed to fetch channels (${res.status})` };
        }

        const channels = await res.json();
        // Filter for text, news and forum channels 
        // (0: GUILD_TEXT, 5: GUILD_ANNOUNCEMENT, 15: GUILD_FORUM)
        const result = channels
            .filter((c: any) => c.type === 0 || c.type === 5 || c.type === 15)
            .map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                position: c.position,
                parentId: c.parent_id
            }))
            .sort((a: any, b: any) => a.position - b.position);

        setCache(cacheKey, result);
        console.log(`[getChannelsForGuild] Fetched ${channels.length} channels for guild ${guildId}`);
        return result;

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
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
            headers: { Authorization: token },
            cache: 'no-store'
        });

        if (!res.ok) {
            console.error(`[getWebhooksForChannel] Error: ${res.status} ${res.statusText} for channel ${channelId}`);
            if (res.status === 401) {
                await prisma.discordAccount.update({
                    where: { id: accountId },
                    data: { valid: false }
                });
                return { error: "Token expired or invalid" };
            }
            // If they don't have manage webhooks permission, this will fail
            return { error: "Failed to fetch webhooks (Missing Permissions?)" };
        }

        const webhooks = await res.json();

        if (!Array.isArray(webhooks)) {
            console.error(`[getWebhooksForChannel] Unexpected response format:`, webhooks);
            return { error: "Unexpected response from Discord" };
        }

        console.log(`[getWebhooksForChannel] Fetched ${webhooks.length} webhooks for channel ${channelId}`);

        return webhooks
            .filter((w: any) => w.token)
            .map((w: any) => ({
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
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
            method: "POST",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: name || "Disbot Mirror" }),
            cache: 'no-store'
        });

        if (!res.ok) {
            console.error(`[createWebhook] Error: ${res.status} ${res.statusText} for channel ${channelId}`);
            return { error: `Failed to create webhook (${res.status})` };
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
