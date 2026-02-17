"use server";

import { sendAuthCode as protoSendCode, completeAuth as protoCompleteAuth, getTelegramChats, getTelegramTopics, getTelegramMe } from "@/lib/telegramClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export async function getTelegramTopicsAction(sessionString: string, chatId: string) {
    if (!sessionString || !chatId) return { error: "Session and Chat ID required" };
    try {
        const topics = await getTelegramTopics(sessionString, chatId);
        return { success: true, topics };
    } catch (e: any) {
        return { error: e.message || "Failed to fetch topics" };
    }
}

export async function getTelegramChatsForAccount(accountId: string) {
    if (!accountId) return { error: "Account ID required" };
    try {
        const account = await prisma.telegramAccount.findUnique({
            where: { id: accountId }
        });

        if (!account) return { error: "Account not found" };

        const sessionString = decrypt(account.sessionString);
        const chats = await getTelegramChats(sessionString);
        return { success: true, chats };
    } catch (e: any) {
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

        const sessionString = decrypt(account.sessionString);
        const me = await getTelegramMe(sessionString);

        // Update DB with latest info (only schema fields)
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

        // Return full info for UI
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
        // Handle 2FA specifically if needed
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
            sessionString: true,
            createdAt: true,
            valid: true,
            firstName: true,
            lastName: true,
            photoUrl: true
        }
    });

    return accounts;
}
