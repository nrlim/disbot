"use server";

import { PlatformType } from "@prisma/client";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { encrypt } from "@/lib/encryption";
import { PLAN_LIMITS } from "@/lib/constants";

// --- Schema ---

const mirrorSchema = z.object({
    sourcePlatform: z.enum(["DISCORD", "TELEGRAM"]).default("DISCORD"),
    sourceGuildName: z.string().min(1, "Server name is required"),
    targetWebhookUrl: z.string().url("Invalid Webhook URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord Webhook URL"),

    // Discord Specific
    sourceChannelId: z.string().optional(),
    userToken: z.string().optional(),

    // Telegram Specific
    telegramSession: z.string().optional(),
    telegramChatId: z.string().optional(),
    telegramTopicId: z.string().optional(),
    telegramPhone: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.sourcePlatform === "DISCORD") {
        if (!data.sourceChannelId || data.sourceChannelId.length < 17) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Valid Discord Channel ID is required",
                path: ["sourceChannelId"]
            });
        }
        if (!data.userToken || data.userToken.length < 10) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "User Token is required for Discord Custom Hook",
                path: ["userToken"]
            });
        }
    } else if (data.sourcePlatform === "TELEGRAM") {
        if (!data.telegramSession || data.telegramSession.length < 10) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Telegram Session is required",
                path: ["telegramSession"]
            });
        }
        if (!data.telegramChatId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Telegram Chat ID is required",
                path: ["telegramChatId"]
            });
        }
    }
});

// --- Actions ---

export async function createMirrorConfig(prevState: any, formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const rawData = {
        sourcePlatform: formData.get("sourcePlatform") || "DISCORD",
        sourceGuildName: formData.get("sourceGuildName") as string || undefined,
        sourceChannelId: formData.get("sourceChannelId") as string || undefined,
        targetWebhookUrl: formData.get("targetWebhookUrl") as string || undefined,
        userToken: formData.get("userToken") as string || undefined,

        telegramSession: formData.get("telegramSession") || undefined,
        telegramChatId: formData.get("telegramChatId") || undefined,
        telegramTopicId: formData.get("telegramTopicId") || undefined,
        telegramPhone: formData.get("telegramPhone") || undefined,
    };

    const validated = mirrorSchema.safeParse(rawData);

    if (!validated.success) {
        return { error: validated.error.issues[0].message };
    }

    // Check Limits
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { _count: { select: { configs: true } } }
    });

    if (!user) return { error: "User not found" };

    const limit = PLAN_LIMITS[(user as any).plan] || PLAN_LIMITS.FREE;
    if ((user as any)._count.configs >= limit) {
        return { error: "Plan limit reached. Upgrade to Pro for more." };
    }

    // Create
    try {
        const { sourcePlatform, telegramSession, userToken } = validated.data;

        await prisma.mirrorConfig.create({
            data: {
                userId: session.user.id,
                sourcePlatform: sourcePlatform as PlatformType,
                sourceGuildName: validated.data.sourceGuildName,
                // Discord
                sourceChannelId: sourcePlatform === "DISCORD" ? validated.data.sourceChannelId || "" : "",
                userToken: (sourcePlatform === "DISCORD" && userToken) ? encrypt(userToken) : null,
                // Telegram
                telegramSession: (sourcePlatform === "TELEGRAM" && telegramSession) ? encrypt(telegramSession) : null,
                telegramChatId: sourcePlatform === "TELEGRAM" ? validated.data.telegramChatId : null,
                telegramTopicId: sourcePlatform === "TELEGRAM" ? validated.data.telegramTopicId : null,
                telegramPhone: sourcePlatform === "TELEGRAM" ? validated.data.telegramPhone : null,

                targetWebhookUrl: validated.data.targetWebhookUrl,
                active: true
            }
        });

        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e) {
        console.error("Failed to create mirror:", (e as Error)?.message || "Unknown error");
        return { error: `Error: ${(e as Error)?.message}` }; // Expose error for debugging
    }
}

export async function bulkCreateMirrorConfig(prevState: any, formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { error: "Unauthorized" };

    const bulkData = formData.get("bulkData") as string;
    const userToken = formData.get("userToken") as string;
    const defaultGuildName = (formData.get("defaultGuildName") as string) || "Bulk Import";

    // Bulk create generally assumes Discord for now as per text format heuristic
    if (!bulkData || !userToken) return { error: "Missing required data" };

    // Parse Lines
    const lines = bulkData.split("\n").filter(l => l.trim().length > 0);
    const parsedConfigs = [];

    for (const line of lines) {
        // Simple heuristic parser: 
        // Look for Channel ID (17-20 digits)
        // Look for Webhook URL (https://discord.com/api/webhooks/...)
        // Rest is Guild Name if provided

        const channelIdMatch = line.match(/\b\d{17,20}\b/);
        const webhookMatch = line.match(/https:\/\/discord\.com\/api\/webhooks\/[^\s]+/);

        if (channelIdMatch && webhookMatch) {
            parsedConfigs.push({
                sourceChannelId: channelIdMatch[0],
                targetWebhookUrl: webhookMatch[0],
                sourceGuildName: defaultGuildName, // Could try to extract name from line if needed?
                userToken
            });
        }
    }

    if (parsedConfigs.length === 0) {
        return { error: "No valid configurations found in text." };
    }

    // Check Limits
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { _count: { select: { configs: true } } }
    });

    if (!user) return { error: "User not found" };

    const limit = PLAN_LIMITS[(user as any).plan] || PLAN_LIMITS.FREE;
    const currentCount = (user as any)._count.configs;

    if (currentCount + parsedConfigs.length > limit) {
        return { error: `Bulk create exceeds plan limit. You can only create ${limit - currentCount} more.` };
    }

    // Bulk Create
    try {
        const encryptedToken = encrypt(userToken);

        await prisma.mirrorConfig.createMany({
            data: parsedConfigs.map(c => ({
                userId: session.user.id,
                sourcePlatform: "DISCORD" as PlatformType, // Default to Discord for bulk text parser
                sourceGuildName: c.sourceGuildName,
                sourceChannelId: c.sourceChannelId,
                targetWebhookUrl: c.targetWebhookUrl,
                userToken: encryptedToken,
                active: true,
            }))
        });

        revalidatePath("/dashboard/expert");
        return { success: true, count: parsedConfigs.length };
    } catch (e) {
        console.error("Failed to bulk create:", (e as Error)?.message || "Unknown error");
        return { error: `Error: ${(e as Error)?.message}` }; // Expose error
    }
}

export async function updateMirrorConfig(prevState: any, formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { error: "Unauthorized" };

    const id = formData.get("id") as string;
    if (!id) return { error: "Missing Config ID" };

    const rawData = {
        sourcePlatform: formData.get("sourcePlatform") || "DISCORD",
        sourceGuildName: formData.get("sourceGuildName") as string || undefined,
        sourceChannelId: formData.get("sourceChannelId") as string || undefined,
        targetWebhookUrl: formData.get("targetWebhookUrl") as string || undefined,
        userToken: formData.get("userToken") as string || undefined,
        telegramSession: formData.get("telegramSession") as string || undefined,
        telegramChatId: formData.get("telegramChatId") || undefined,
        telegramTopicId: formData.get("telegramTopicId") || undefined,
        telegramPhone: formData.get("telegramPhone") || undefined,
    };

    const validated = mirrorSchema.safeParse(rawData);

    if (!validated.success) {
        return { error: validated.error.issues[0].message };
    }

    try {
        // Ensure user owns this config
        const existing = await prisma.mirrorConfig.findFirst({
            where: { id, userId: session.user.id }
        });

        if (!existing) return { error: "Configuration not found" };

        const { sourcePlatform, telegramSession, userToken } = validated.data;

        // Handle token encryption if changed or new
        // If token is mask or empty, we might sustain old one? 
        // For simplicity, we assume if provided it updates.

        const updateData: any = {
            sourcePlatform: sourcePlatform as PlatformType,
            sourceGuildName: validated.data.sourceGuildName,
            targetWebhookUrl: validated.data.targetWebhookUrl,
        };

        if (sourcePlatform === "DISCORD") {
            updateData.sourceChannelId = validated.data.sourceChannelId!;
            // Only update token if provided (and not just masked stars)
            if (userToken && !userToken.includes("***")) {
                updateData.userToken = encrypt(userToken);
            }
            // Clear telegram fields? Optional, but cleaner.
            updateData.telegramSession = null;
            updateData.telegramChatId = null;
        } else {
            updateData.telegramChatId = validated.data.telegramChatId!;
            updateData.telegramTopicId = validated.data.telegramTopicId || null;
            updateData.telegramPhone = validated.data.telegramPhone!;
            if (telegramSession && !telegramSession.includes("***")) {
                updateData.telegramSession = encrypt(telegramSession);
            }
            // Clear discord fields
            updateData.sourceChannelId = "";
            updateData.userToken = null;
        }

        // Reset status to ACTIVE when updated by user
        updateData.active = true;
        updateData.status = "ACTIVE";

        await prisma.mirrorConfig.update({
            where: { id },
            data: updateData
        });

        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e: any) {
        console.error("Failed to update mirror:", e?.message || e);
        // Distinguish specific errors if possible, otherwise generic
        if (e?.code === 'P2002') return { error: "Unique constraint violation." };
        if (e?.code === 'P2025') return { error: "Configuration no longer exists." };
        return { error: `Error: ${e?.message || e}` }; // Expose error for debugging
    }
}

export async function deleteMirrorConfig(id: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { error: "Unauthorized" };

    try {
        await prisma.mirrorConfig.delete({
            where: {
                id,
                userId: session.user.id // Ensure ownership
            }
        });
        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e) {
        return { error: "Failed to delete" };
    }
}

export async function toggleMirrorConfig(id: string, active: boolean) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { error: "Unauthorized" };

    try {
        await prisma.mirrorConfig.update({
            where: { id, userId: session.user.id },
            data: { active }
        });
        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e) {
        return { error: "Failed to update" };
    }
}
