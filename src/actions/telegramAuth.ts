"use server";

import { sendAuthCode as protoSendCode, completeAuth as protoCompleteAuth } from "@/lib/telegramClient";

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
        // Note: Password support is minimal in current helper,
        // but we pass it structures if we enhance the worker lib later.

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
