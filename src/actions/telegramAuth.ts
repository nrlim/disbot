"use server";

import { sendAuthCode as protoSendCode, completeAuth as protoCompleteAuth, getTelegramChats, getTelegramTopics, getTelegramMe } from "@/lib/telegramClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";

// ──────────────────────────────────────────────────────────────
//  Cache Duration: How long before we consider cached chats stale
//  Set high (24h) because refreshing kicks the worker off
// ──────────────────────────────────────────────────────────────
const CHAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function getTelegramTopicsAction(sessionString: string, chatId: string) {
    if (!sessionString || !chatId) return { error: "Session and Chat ID required" };
    try {
        const topics = await getTelegramTopics(sessionString, chatId);
        return { success: true, topics };
    } catch (e: any) {
        return { error: e.message || "Failed to fetch topics" };
    }
}

/**
 * Get Telegram topics for a linked account.
 * This still requires a live connection since topics are per-chat and change frequently.
 * But it's a short-lived operation.
 */
export async function getTelegramTopicsForAccount(accountId: string, chatId: string, forceRefresh = false) {
    if (!accountId || !chatId) return { error: "Account ID and Chat ID required" };
    try {
        const account = await prisma.telegramAccount.findUnique({
            where: { id: accountId }
        });

        if (!account) return { error: "Account not found" };

        // 1. Check Cache
        const cachedData = (account.cachedTopics || {}) as Record<string, { topics: any[], cachedAt: string }>;
        const entry = cachedData[chatId];

        if (!forceRefresh && entry) {
            const age = Date.now() - new Date(entry.cachedAt).getTime();
            if (age < CHAT_CACHE_TTL_MS) {
                return { success: true, topics: entry.topics, fromCache: true };
            }
        }

        // 2. Fetch Live
        const sessionString = decrypt(account.sessionString);
        const topics = await getTelegramTopics(sessionString, chatId);

        // 3. Update Cache (merge with existing)
        const updatedCache = {
            ...cachedData,
            [chatId]: {
                topics,
                cachedAt: new Date().toISOString()
            }
        };

        // Update in background to not block UI too much? No, await ensures consistency.
        await prisma.telegramAccount.update({
            where: { id: accountId },
            data: { cachedTopics: updatedCache }
        });

        return { success: true, topics, fromCache: false };
    } catch (e: any) {
        // Fallback to cache if live fetch fails
        try {
            const account = await prisma.telegramAccount.findUnique({ where: { id: accountId } });
            const cachedData = (account?.cachedTopics || {}) as Record<string, { topics: any[] }>;
            if (cachedData[chatId]) {
                return { success: true, topics: cachedData[chatId].topics, fromCache: true, warning: "Using cached topics (live fetch failed)" };
            }
        } catch { }

        return { error: e.message || "Failed to fetch topics" };
    }
}

/**
 * Get Telegram chats for a linked account.
 * 
 * IMPORTANT: Uses cached data by default to avoid creating a competing MTProto
 * connection that would kick the worker off and cause lost messages.
 * 
 * @param accountId - The Telegram account ID
 * @param forceRefresh - If true, fetches fresh data (will momentarily disconnect worker!)
 */
export async function getTelegramChatsForAccount(accountId: string, forceRefresh = false) {
    if (!accountId) return { error: "Account ID required" };
    try {
        const account = await prisma.telegramAccount.findUnique({
            where: { id: accountId }
        });

        if (!account) return { error: "Account not found" };

        // Check if we have fresh cached data
        const cacheAge = account.cachedAt
            ? Date.now() - new Date(account.cachedAt).getTime()
            : Infinity;
        const cacheValid = cacheAge < CHAT_CACHE_TTL_MS;

        if (!forceRefresh && cacheValid && account.cachedChannel) {
            // Return cached data — no MTProto connection needed!
            return { success: true, chats: account.cachedChannel as any[], fromCache: true };
        }

        // Cache is stale or force refresh requested — connect and fetch
        const sessionString = decrypt(account.sessionString);
        const chats = await getTelegramChats(sessionString);

        // Update cache in DB
        await prisma.telegramAccount.update({
            where: { id: accountId },
            data: {
                cachedChannel: chats as any,
                cachedAt: new Date()
            }
        });

        return { success: true, chats, fromCache: false };
    } catch (e: any) {
        // If live fetch fails but we have stale cache, return it as fallback
        try {
            const account = await prisma.telegramAccount.findUnique({
                where: { id: accountId }
            });
            if (account?.cachedChannel) {
                return {
                    success: true,
                    chats: account.cachedChannel as any[],
                    fromCache: true,
                    warning: "Using cached data (live fetch failed)"
                };
            }
        } catch { }

        return { error: e.message || "Failed to fetch chats" };
    }
}

export async function getTelegramMeAction(accountId: string) {
    if (!accountId) return { error: "Account ID required" };
    try {
        const account = await prisma.telegramAccount.findUnique({
            where: { id: accountId }
        });

        if (!account) return { error: "Account not found" };

        // If we already have profile data cached in the account record, return it
        // without making a live connection
        if (account.firstName || account.username) {
            return {
                success: true,
                user: {
                    id: account.telegramId || "",
                    username: account.username || "",
                    firstName: account.firstName || "",
                    lastName: account.lastName || "",
                    phone: account.phone || "",
                    photoUrl: account.photoUrl || ""
                },
                fromCache: true
            };
        }

        // No cached profile — fetch live (only happens once after linking)
        const sessionString = decrypt(account.sessionString);
        const me = await getTelegramMe(sessionString);

        // Update DB with latest info
        await prisma.telegramAccount.update({
            where: { id: accountId },
            data: {
                username: me.username || account.username,
                telegramId: me.id,
                firstName: me.firstName || null,
                lastName: me.lastName || null,
                photoUrl: me.photoUrl || null
            }
        });

        return { success: true, user: me };
    } catch (e: any) {
        return { error: e.message || "Failed to fetch user info" };
    }
}


// ──────────────────────────────────────────────────────────────
//  Server Actions for Telegram Auth (MTProto)
// ──────────────────────────────────────────────────────────────

export async function sendTelegramCode(phoneNumber: string) {
    if (!phoneNumber) return { error: "Phone number required" };
    try {
        const { phoneCodeHash, tempSession } = await protoSendCode(phoneNumber);
        return { success: true, phoneCodeHash, tempSession };
    } catch (e: any) {
        console.error("Telegram Send Code Error:", e?.message || "Unknown error");
        return { error: e.message || "Failed to send code" };
    }
}

export async function loginTelegram(params: {
    phoneNumber: string;
    phoneCodeHash: string;
    phoneCode: string;
    tempSession?: string;
    password?: string;
}) {
    const { phoneNumber, phoneCodeHash, phoneCode, tempSession, password } = params;

    if (!phoneNumber || !phoneCodeHash || !phoneCode) {
        return { error: "Missing required auth parameters" };
    }

    try {
        const sessionString = await protoCompleteAuth({
            phoneNumber,
            phoneCodeHash,
            phoneCode,
            tempSession,
            password
        });

        return { success: true, sessionString };
    } catch (e: any) {
        console.error("Telegram Login Error:", e?.message || "Unknown error");
        if (e.message.includes("2FA Password Required") || e.message.includes("SESSION_PASSWORD_NEEDED")) {
            return { error: "2FA Password Required" };
        }
        return { error: e.message || "Failed to login" };
    }
}

export async function getTelegramChatsAction(sessionString: string) {
    if (!sessionString) return { error: "Session required" };
    try {
        const chats = await getTelegramChats(sessionString);
        return { success: true, chats };
    } catch (e: any) {
        return { error: e.message || "Failed to fetch chats" };
    }
}

export async function getTelegramAccounts() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return [];

    const accounts = await prisma.telegramAccount.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            username: true,
            phone: true,
            // NOTE: Do NOT return sessionString to the frontend.
            // It caused double-encryption: frontend sent it back → mirror.ts encrypted again.
            createdAt: true,
            valid: true,
            firstName: true,
            lastName: true,
            photoUrl: true
        }
    });

    return accounts;
}

/**
 * Cache chats for a newly linked Telegram account.
 * Called right after account linking to populate the cache
 * so subsequent create/edit flows don't need live connections.
 */
export async function cacheTelegramChatsForAccount(accountId: string) {
    if (!accountId) return;
    try {
        const account = await prisma.telegramAccount.findUnique({
            where: { id: accountId }
        });
        if (!account) return;

        const sessionString = decrypt(account.sessionString);
        const chats = await getTelegramChats(sessionString);

        // Also fetch profile info while we're connected
        let me: any = null;
        try {
            me = await getTelegramMe(sessionString);
        } catch { }

        await prisma.telegramAccount.update({
            where: { id: accountId },
            data: {
                cachedChannel: chats as any,
                cachedAt: new Date(),
                ...(me ? {
                    username: me.username || account.username,
                    telegramId: me.id,
                    firstName: me.firstName || null,
                    lastName: me.lastName || null,
                    photoUrl: me.photoUrl || null
                } : {})
            }
        });
    } catch (e: any) {
        console.error("Cache Telegram chats error:", e?.message);
    }
}

// ──────────────────────────────────────────────────────────────
//  Delete Telegram Account
// ──────────────────────────────────────────────────────────────

export async function deleteTelegramAccount(id: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    try {
        // 1. Deactivate any mirrors currently using this Telegram account
        await prisma.mirrorConfig.updateMany({
            where: { telegramAccountId: id, userId: session.user.id },
            data: { active: false, status: "Account Deleted", telegramAccountId: null }
        });

        // 2. Delete the Telegram account record
        await prisma.telegramAccount.delete({
            where: { id, userId: session.user.id }
        });

        revalidatePath("/dashboard/settings");
        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e: any) {
        console.error("Delete Telegram account error:", e?.message);
        return { error: "Failed to delete Telegram account" };
    }
}

// ──────────────────────────────────────────────────────────────
//  Save (Link) a New Telegram Account
// ──────────────────────────────────────────────────────────────

export async function saveTelegramAccount(params: {
    phone: string;
    sessionString: string;
}) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { error: "Unauthorized" };

    const { phone, sessionString } = params;
    if (!phone || !sessionString) return { error: "Phone and session are required" };

    try {
        // Check limit (Max 5 Telegram accounts)
        const count = await prisma.telegramAccount.count({
            where: { userId: session.user.id }
        });

        if (count >= 5) {
            return { error: "Telegram account limit reached (Max 5)." };
        }

        // Check for duplicate by phone number
        const existing = await prisma.telegramAccount.findFirst({
            where: { userId: session.user.id, phone }
        });

        if (existing) {
            // Update session string if re-adding the same phone
            await prisma.telegramAccount.update({
                where: { id: existing.id },
                data: {
                    sessionString: encrypt(sessionString),
                    valid: true
                }
            });

            // Refresh profile + cache in background
            cacheTelegramChatsForAccount(existing.id).catch(() => { });

            revalidatePath("/dashboard/settings");
            revalidatePath("/dashboard/expert");
            return { success: true, accountId: existing.id, updated: true };
        }

        // Fetch profile info before saving
        let profileData: any = {};
        try {
            const me = await getTelegramMe(sessionString);
            profileData = {
                username: me.username || null,
                telegramId: me.id || null,
                firstName: me.firstName || null,
                lastName: me.lastName || null,
                photoUrl: me.photoUrl || null,
            };
        } catch (e) {
            console.error("Failed to fetch Telegram profile during save:", e);
        }

        // Create new account
        const newAccount = await prisma.telegramAccount.create({
            data: {
                userId: session.user.id,
                phone,
                sessionString: encrypt(sessionString),
                valid: true,
                ...profileData
            }
        });

        // Cache chats in background
        cacheTelegramChatsForAccount(newAccount.id).catch(() => { });

        revalidatePath("/dashboard/settings");
        revalidatePath("/dashboard/expert");
        return { success: true, accountId: newAccount.id };
    } catch (e: any) {
        console.error("Save Telegram account error:", e?.message);
        return { error: "Failed to save Telegram account: " + (e.message || "Unknown") };
    }
}
