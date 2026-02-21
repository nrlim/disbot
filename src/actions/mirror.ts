"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { encrypt, decrypt } from "@/lib/encryption";
import { PLAN_LIMITS, PLAN_PLATFORMS, PLAN_DESTINATION_PLATFORMS } from "@/lib/constants";
import { cacheTelegramChatsForAccount } from "@/actions/telegramAuth";

// --- Schema ---

const mirrorSchema = z.object({
    sourcePlatform: z.enum(["DISCORD", "TELEGRAM"]).default("DISCORD"),
    destinationPlatform: z.enum(["DISCORD", "TELEGRAM"]).default("DISCORD"),
    sourceGuildName: z.string().min(1, "Server name is required"),
    targetWebhookUrl: z.string().url("Invalid Webhook URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord Webhook URL").optional().or(z.literal("")),

    // Discord Specific
    sourceChannelId: z.string().optional(),
    sourceGuildId: z.string().optional(),
    userToken: z.string().optional(),
    discordAccountId: z.string().optional(),

    // Telegram Specific
    telegramSession: z.string().optional(),
    telegramChatId: z.string().optional(),
    telegramTopicId: z.string().optional(),
    telegramPhone: z.string().optional(),
    telegramAccountId: z.string().optional().nullable(),

    // Destination Metadata (for UI pre-fill)
    targetChannelId: z.string().optional(),
    targetGuildId: z.string().optional(),
    targetGuildName: z.string().optional(),
    targetChannelName: z.string().optional(),
    targetWebhookName: z.string().optional(),
    sourceChannelName: z.string().optional(),
    groupId: z.string().optional(),

    // Branding
    customWatermark: z.string().optional(),
    brandColor: z.string().optional(),
    blurRegions: z.string().optional().transform(val => {
        try {
            return val ? JSON.parse(val) : undefined;
        } catch {
            return undefined;
        }
    }),
    watermarkType: z.enum(["TEXT", "VISUAL"]).optional().default("TEXT"),
    watermarkImageUrl: z.string().url().optional().or(z.literal("")),
    watermarkPosition: z.string().optional(),
    watermarkOpacity: z.coerce.number().min(0).max(100).optional().default(100),
}).superRefine((data, ctx) => {
    // --- Source Platform Validation ---
    if (data.sourcePlatform === "DISCORD") {
        if (!data.sourceChannelId || data.sourceChannelId.length < 17) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Valid Discord Channel ID is required",
                path: ["sourceChannelId"]
            });
        }
        if ((!data.userToken || data.userToken.length < 10) && !data.discordAccountId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "User Token is required (or select an account)",
                path: ["userToken"]
            });
        }
    } else if (data.sourcePlatform === "TELEGRAM") {
        // For T2D and T2T: source requires session + source chat ID
        // Session can come from telegramAccountId OR telegramSession
        if ((!data.telegramSession || data.telegramSession.length < 10) && !data.telegramAccountId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Telegram Session or Account is required",
                path: ["telegramSession"]
            });
        }

        // Source Chat ID: for T2T it's in sourceChannelId, for T2D it's in telegramChatId
        if (data.destinationPlatform === "TELEGRAM") {
            // T2T: source chat is in sourceChannelId
            if (!data.sourceChannelId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Source Telegram Chat ID is required",
                    path: ["sourceChannelId"]
                });
            }
        } else {
            // T2D: source chat is in telegramChatId
            if (!data.telegramChatId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Telegram Chat ID is required",
                    path: ["telegramChatId"]
                });
            }
        }

        if ((!data.telegramPhone || data.telegramPhone.length < 5) && !data.telegramAccountId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Telegram Phone Number is required for account linking",
                path: ["telegramPhone"]
            });
        }
    }

    // --- Destination Platform Validation ---
    if (data.destinationPlatform === "TELEGRAM") {
        // D2T or T2T: destination requires a Telegram Chat ID
        if (!data.telegramChatId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Destination Telegram Chat ID is required",
                path: ["telegramChatId"]
            });
        }
        // Also require a Telegram account for destination
        if (!data.telegramAccountId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Destination Telegram Account is required",
                path: ["telegramAccountId"]
            });
        }
    } else {
        // D2D or T2D: destination requires a Discord Webhook URL
        if (!data.targetWebhookUrl || data.targetWebhookUrl.length < 10) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Destination Discord Webhook URL is required",
                path: ["targetWebhookUrl"]
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
        destinationPlatform: formData.get("destinationPlatform") || "DISCORD",
        sourceGuildName: formData.get("sourceGuildName") as string || undefined,
        sourceGuildId: formData.get("sourceGuildId") as string || undefined,
        sourceChannelId: formData.get("sourceChannelId") as string || undefined,
        targetWebhookUrl: formData.get("targetWebhookUrl") as string || undefined,
        userToken: (formData.get("userToken") as string) || undefined,
        discordAccountId: (formData.get("discordAccountId") as string) || undefined,

        telegramSession: formData.get("telegramSession") || undefined,
        telegramChatId: formData.get("telegramChatId") || undefined,
        telegramTopicId: formData.get("telegramTopicId") || undefined,
        telegramPhone: formData.get("telegramPhone") || undefined,
        telegramAccountId: (formData.get("telegramAccountId") as string) || undefined,

        targetChannelId: (formData.get("targetChannelId") as string) || undefined,
        targetGuildId: (formData.get("targetGuildId") as string) || undefined,
        targetChannelName: (formData.get("targetChannelName") as string) || undefined,
        targetGuildName: (formData.get("targetGuildName") as string) || undefined,
        targetWebhookName: (formData.get("targetWebhookName") as string) || undefined,
        sourceChannelName: (formData.get("sourceChannelName") as string) || undefined,
        groupId: (formData.get("groupId") as string) || undefined,
        customWatermark: (formData.get("customWatermark") as string) || undefined,
        brandColor: (formData.get("brandColor") as string) || undefined,
        blurRegions: (formData.get("blurRegions") as string) || undefined, // JSON string
        watermarkType: (formData.get("watermarkType") as string) || undefined,
        watermarkImageUrl: (formData.get("watermarkImageUrl") as string) || undefined,
        watermarkPosition: (formData.get("watermarkPosition") as string) || undefined,
        watermarkOpacity: formData.get("watermarkOpacity") || undefined,
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
        const { sourcePlatform, destinationPlatform, telegramSession, userToken, discordAccountId, telegramChatId, telegramPhone } = validated.data; // Note: telegramSession/userToken from input are now ignored or used to find account if not provided (though manual token is deprecated)

        // Enforce account selection for Discord
        if (sourcePlatform === "DISCORD" && !discordAccountId) {
            return { error: "Discord Account selection is required." };
        }

        // Enforce Plan Platform Restrictions
        const userPlan = (user as any).plan || "FREE";
        const allowedPlatforms = PLAN_PLATFORMS[userPlan] || PLAN_PLATFORMS.FREE;

        if (!allowedPlatforms.includes(sourcePlatform)) {
            return { error: `Your ${userPlan} plan does not support ${sourcePlatform} mirroring.` };
        }

        if (destinationPlatform && !PLAN_DESTINATION_PLATFORMS[userPlan]?.includes(destinationPlatform)) {
            return { error: `Your ${userPlan} plan does not support ${destinationPlatform} as a destination. Upgrade to Elite to unlock Discord → Telegram and Telegram → Telegram mirroring.` };
        }

        // Enforce account selection for Discord
        // Note: The UI currently sends session string. Ideally we should have a TelegramAccount model and ID. 
        // For now, if we don't have TelegramAccount ID in form, we might need to create one? 
        // OR the user should have linked Telegram first?
        // Given the request "clean schema, remove info... just discord account id", we should assume similar for Telegram.
        // But the schema added TelegramAccount.
        // Let's assume for now we only support Discord fully via ID as requested, or finding an existing TelegramAccount?
        // The modal UI for Telegram still does manual session login. 
        // We probably need to update the UI to "Link Telegram Account" separately, similar to Discord.
        // BUT, for this step, let's just make it compilable with the current schema.

        // Use a dummy or look up telegram account?
        // Since we removed `telegramSession` from MirrorConfig, we CANNOT store it there.
        // We must store it in a TelegramAccount and link it.

        let telegramAccountIdToLink = validated.data.telegramAccountId || null;

        if (sourcePlatform === "TELEGRAM" && telegramSession && telegramPhone) {
            // Check if account exists or create it
            let tgAccount = await prisma.telegramAccount.findFirst({
                where: { userId: session.user.id, phone: telegramPhone }
            });

            if (!tgAccount) {
                tgAccount = await prisma.telegramAccount.create({
                    data: {
                        userId: session.user.id,
                        phone: telegramPhone,
                        sessionString: encrypt(telegramSession),
                        username: "Telegram User", // Placeholder or fetch if possible
                    }
                });
            } else {
                // Update session if needed
                await prisma.telegramAccount.update({
                    where: { id: tgAccount.id },
                    data: { sessionString: encrypt(telegramSession) }
                });
            }
            telegramAccountIdToLink = tgAccount.id;

            // Cache chats in background so future create/edit flows don't need live connections
            cacheTelegramChatsForAccount(tgAccount.id).catch(() => { });
        }

        // Find or Create Mirror Group by Name
        // We use sourceGuildName as the Group Name
        let finalGroupId = validated.data.groupId || null;
        if (validated.data.sourceGuildName) {
            let type: any = "DISCORD_TO_DISCORD";
            if (sourcePlatform === "DISCORD" && destinationPlatform === "TELEGRAM") type = "DISCORD_TO_TELEGRAM";
            else if (sourcePlatform === "TELEGRAM" && destinationPlatform === "DISCORD") type = "TELEGRAM_TO_DISCORD";
            else if (sourcePlatform === "TELEGRAM" && destinationPlatform === "TELEGRAM") type = "TELEGRAM_TO_TELEGRAM";

            let existingGroup = await prisma.mirrorGroup.findFirst({
                where: {
                    userId: session.user.id,
                    name: validated.data.sourceGuildName,
                    type: type
                }
            });

            if (!existingGroup) {
                existingGroup = await prisma.mirrorGroup.create({
                    data: {
                        name: validated.data.sourceGuildName,
                        userId: session.user.id,
                        type: type,
                        active: true
                    }
                });
            }
            finalGroupId = existingGroup.id;
        }

        await prisma.mirrorConfig.create({
            data: {
                userId: session.user.id,
                sourcePlatform: sourcePlatform as any,
                sourceGuildName: validated.data.sourceGuildName,
                // Universal (Legacy)
                sourceChannelId: sourcePlatform === "DISCORD"
                    ? (validated.data.sourceChannelId || "")
                    : (destinationPlatform === "TELEGRAM" ? (validated.data.sourceChannelId || "") : (validated.data.telegramChatId || "")),
                sourceGuildId: validated.data.sourceGuildId,

                // Relations
                discordAccountId: discordAccountId || null,
                telegramAccountId: (sourcePlatform === "TELEGRAM" || destinationPlatform === "TELEGRAM") ? telegramAccountIdToLink : null,

                telegramChatId: validated.data.telegramChatId, // Store Telegram Chat ID (Source for T2D, Dest for D2T/T2T)

                targetWebhookUrl: validated.data.targetWebhookUrl, // Legacy
                targetChannelId: validated.data.targetChannelId,
                targetGuildId: validated.data.targetGuildId,
                targetChannelName: validated.data.targetChannelName,
                targetWebhookName: validated.data.targetWebhookName,
                sourceChannelName: validated.data.sourceChannelName,
                targetGuildName: validated.data.targetGuildName,
                telegramTopicId: validated.data.telegramTopicId,
                groupId: finalGroupId,
                active: true,
                customWatermark: validated.data.customWatermark,
                brandColor: validated.data.brandColor,
                blurRegions: validated.data.blurRegions ?? undefined,
                watermarkType: validated.data.watermarkType as any,
                watermarkImageUrl: validated.data.watermarkImageUrl || null,
                watermarkPosition: validated.data.watermarkPosition || "southeast",
                watermarkOpacity: validated.data.watermarkOpacity ?? 100,
            }
        });

        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e) {
        console.error("Failed to create mirror:", (e as Error)?.message || "Unknown error");
        return { error: `Error: ${(e as Error)?.message}` };
    }
}

export async function bulkCreateMirrorConfig(prevState: any, formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { error: "Unauthorized" };

    const bulkData = formData.get("bulkData") as string;
    const userToken = formData.get("userToken") as string;
    const defaultGuildName = (formData.get("defaultGuildName") as string) || "Bulk Import";
    const groupId = (formData.get("groupId") as string) || undefined;

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
        const newAccount = await prisma.discordAccount.create({
            data: {
                userId: session.user.id,
                token: encryptedToken,
                username: "Bulk Imported Account",
                discordId: `bulk_${Date.now()}`,
            }
        });

        await prisma.mirrorConfig.createMany({
            data: parsedConfigs.map(c => ({
                userId: session.user.id,
                // @ts-ignore
                sourcePlatform: "DISCORD",
                sourceGuildName: c.sourceGuildName,
                sourceChannelId: c.sourceChannelId,
                targetWebhookUrl: c.targetWebhookUrl,
                discordAccountId: newAccount.id,
                groupId: groupId,
                active: true,
            }))
        });

        revalidatePath("/dashboard/expert");
        return { success: true, count: parsedConfigs.length };
    } catch (e) {
        console.error("Failed to bulk create:", (e as Error)?.message || "Unknown error");
        return { error: `Error: ${(e as Error)?.message}` };
    }
}

export async function updateMirrorConfig(prevState: any, formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { error: "Unauthorized" };

    const id = formData.get("id") as string;
    if (!id) return { error: "Missing Config ID" };

    const rawData = {
        sourcePlatform: formData.get("sourcePlatform") || "DISCORD",
        destinationPlatform: formData.get("destinationPlatform") || "DISCORD",
        sourceGuildName: formData.get("sourceGuildName") as string || undefined,
        sourceGuildId: formData.get("sourceGuildId") as string || undefined,
        sourceChannelId: formData.get("sourceChannelId") as string || undefined,
        targetWebhookUrl: formData.get("targetWebhookUrl") as string || undefined,
        userToken: (formData.get("userToken") as string) || undefined,
        discordAccountId: (formData.get("discordAccountId") as string) || undefined,

        telegramSession: formData.get("telegramSession") || undefined,
        telegramChatId: formData.get("telegramChatId") || undefined,
        telegramTopicId: formData.get("telegramTopicId") || undefined,
        telegramPhone: formData.get("telegramPhone") || undefined,
        telegramAccountId: (formData.get("telegramAccountId") as string) || undefined,

        targetChannelId: (formData.get("targetChannelId") as string) || undefined,
        targetGuildId: (formData.get("targetGuildId") as string) || undefined,
        targetChannelName: (formData.get("targetChannelName") as string) || undefined,
        targetGuildName: (formData.get("targetGuildName") as string) || undefined,
        targetWebhookName: (formData.get("targetWebhookName") as string) || undefined,
        sourceChannelName: (formData.get("sourceChannelName") as string) || undefined,
        groupId: (formData.get("groupId") as string) || undefined,
        customWatermark: (formData.get("customWatermark") as string) || undefined,
        brandColor: (formData.get("brandColor") as string) || undefined,
        blurRegions: (formData.get("blurRegions") as string) || undefined,
        watermarkType: (formData.get("watermarkType") as string) || undefined,
        watermarkImageUrl: (formData.get("watermarkImageUrl") as string) || undefined,
        watermarkPosition: (formData.get("watermarkPosition") as string) || undefined,
        watermarkOpacity: formData.get("watermarkOpacity") || undefined,
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

        const { sourcePlatform, destinationPlatform, telegramSession, userToken, discordAccountId, telegramChatId, telegramPhone } = validated.data;

        // Enforce Plan Platform Restrictions
        const user = await prisma.user.findUnique({ where: { id: session.user.id } });
        const userPlan = user?.plan || "FREE";
        const allowedPlatforms = PLAN_PLATFORMS[userPlan] || PLAN_PLATFORMS.FREE;

        if (!allowedPlatforms.includes(sourcePlatform)) {
            return { error: `Your ${userPlan} plan does not support ${sourcePlatform} mirroring.` };
        }

        // Find or Create Mirror Group by Name
        let finalGroupId = validated.data.groupId || null;

        if (destinationPlatform && !PLAN_DESTINATION_PLATFORMS[userPlan]?.includes(destinationPlatform)) {
            return { error: `Your ${userPlan} plan does not support ${destinationPlatform} as a destination. Upgrade to Elite to unlock Discord → Telegram and Telegram → Telegram mirroring.` };
        }

        if (validated.data.sourceGuildName) {
            let type: any = "DISCORD_TO_DISCORD";
            if (sourcePlatform === "DISCORD" && destinationPlatform === "TELEGRAM") type = "DISCORD_TO_TELEGRAM";
            else if (sourcePlatform === "TELEGRAM" && destinationPlatform === "DISCORD") type = "TELEGRAM_TO_DISCORD";
            else if (sourcePlatform === "TELEGRAM" && destinationPlatform === "TELEGRAM") type = "TELEGRAM_TO_TELEGRAM";

            let existingGroup = await prisma.mirrorGroup.findFirst({
                where: {
                    userId: session.user.id,
                    name: validated.data.sourceGuildName,
                    type: type
                }
            });

            if (!existingGroup) {
                existingGroup = await prisma.mirrorGroup.create({
                    data: {
                        name: validated.data.sourceGuildName,
                        userId: session.user.id,
                        type: type,
                        active: true
                    }
                });
            }
            finalGroupId = existingGroup.id;
        }

        const updateData: any = {
            sourcePlatform: sourcePlatform as any,
            sourceGuildName: validated.data.sourceGuildName,
            sourceGuildId: validated.data.sourceGuildId,
            targetWebhookUrl: validated.data.targetWebhookUrl,
            // Metadata for pre-filling UI
            targetChannelId: validated.data.targetChannelId,
            targetGuildId: validated.data.targetGuildId,
            targetChannelName: validated.data.targetChannelName,
            targetWebhookName: validated.data.targetWebhookName,
            sourceChannelName: validated.data.sourceChannelName,
            targetGuildName: validated.data.targetGuildName,
            telegramTopicId: validated.data.telegramTopicId,
            groupId: finalGroupId,
            customWatermark: validated.data.customWatermark,
            brandColor: validated.data.brandColor,
            blurRegions: validated.data.blurRegions ?? undefined,
            watermarkType: validated.data.watermarkType as any,
            watermarkImageUrl: validated.data.watermarkImageUrl || null,
            watermarkPosition: validated.data.watermarkPosition || "southeast",
            watermarkOpacity: validated.data.watermarkOpacity ?? 100,
        };

        if (sourcePlatform === "DISCORD") {
            updateData.sourceChannelId = validated.data.sourceChannelId!;

            // Account Logic
            // We only update discordAccountId if provided. 
            // Manual token override is deprecated/removed from schema.
            if (discordAccountId) {
                updateData.discordAccountId = discordAccountId;
            }

            // Clear telegram fields (by removing the relation if we switched platform, but Prisma doesn't auto-clear relation unless we set to null)
            // Only clear if destination is NOT Telegram either
            if (destinationPlatform !== 'TELEGRAM') {
                updateData.telegramAccountId = null;
                updateData.telegramChatId = null;
            }
        } else {
            // Telegram
            // We need to link a TelegramAccount.
            let telegramAccountIdToLink = validated.data.telegramAccountId || null;
            if (telegramSession && telegramPhone) {
                // Check/Create account similar to createMirrorConfig
                let tgAccount = await prisma.telegramAccount.findFirst({
                    where: { userId: session.user.id, phone: telegramPhone }
                });
                if (!tgAccount) {
                    tgAccount = await prisma.telegramAccount.create({
                        data: {
                            userId: session.user.id,
                            phone: telegramPhone,
                            sessionString: encrypt(telegramSession),
                            username: "Telegram User",
                        }
                    });
                } else {
                    await prisma.telegramAccount.update({
                        where: { id: tgAccount.id },
                        data: { sessionString: encrypt(telegramSession) }
                    });
                }
                telegramAccountIdToLink = tgAccount.id;

                // Cache chats in background so future create/edit flows don't need live connections
                cacheTelegramChatsForAccount(tgAccount.id).catch(() => { });
            }

            if (telegramAccountIdToLink) {
                updateData.telegramAccountId = telegramAccountIdToLink;
            }
            // Logic for Source Channel ID update
            updateData.sourceChannelId = (destinationPlatform === "TELEGRAM")
                ? (validated.data.sourceChannelId || "")
                : (telegramChatId || "");

            updateData.telegramChatId = telegramChatId; // Ensure updated

            if (discordAccountId) {
                updateData.discordAccountId = discordAccountId;
            }
        }

        // Account Logic for Destination Telegram (D2T)
        // If Source was Discord, we handled Account above. But we need to link Telegram Account for Dest.
        if (sourcePlatform === "DISCORD" && destinationPlatform === "TELEGRAM") {
            // Check/Create Telegram Account logic needs to run even for D2T
            // We need to copy the logic block or refactor.
            // For now, let's just run it if we have session/phone
            let telegramAccountIdToLink = validated.data.telegramAccountId || null;
            if (telegramSession && telegramPhone) {
                let tgAccount = await prisma.telegramAccount.findFirst({ where: { userId: session.user.id, phone: telegramPhone } });
                if (!tgAccount) {
                    tgAccount = await prisma.telegramAccount.create({ data: { userId: session.user.id, phone: telegramPhone, sessionString: encrypt(telegramSession), username: "Telegram User" } });
                } else {
                    await prisma.telegramAccount.update({ where: { id: tgAccount.id }, data: { sessionString: encrypt(telegramSession) } });
                }
                telegramAccountIdToLink = tgAccount.id;

                // Cache chats in background
                cacheTelegramChatsForAccount(tgAccount.id).catch(() => { });
            }
            if (telegramAccountIdToLink) updateData.telegramAccountId = telegramAccountIdToLink;
            updateData.telegramChatId = telegramChatId;
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
        if (e?.code === 'P2002') return { error: "Unique constraint violation." };
        if (e?.code === 'P2025') return { error: "Configuration no longer exists." };
        return { error: `Error: ${e?.message || e}` };
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
        // If enabling, check plan restrictions
        if (active) {
            const config = await prisma.mirrorConfig.findUnique({
                where: { id, userId: session.user.id },
                include: { user: { select: { plan: true } } }
            });

            if (!config) return { error: "Configuration not found" };

            const userPlan = config.user.plan || "FREE";

            // 1. Source Check
            const allowedSources = PLAN_PLATFORMS[userPlan] || PLAN_PLATFORMS.FREE;
            if (!allowedSources.includes(config.sourcePlatform)) {
                return { error: `Your ${userPlan} plan does not support ${config.sourcePlatform} mirroring.` };
            }

            // 2. Destination Check (D2T, T2T)
            const allowedDestinations = PLAN_DESTINATION_PLATFORMS[userPlan] || ['DISCORD'];
            const isTelegramDest = (config.sourcePlatform === 'DISCORD' && !!config.telegramChatId) ||
                (config.sourcePlatform === 'TELEGRAM' && !!config.telegramChatId && !!config.sourceChannelId && config.telegramChatId !== config.sourceChannelId);

            if (isTelegramDest && !allowedDestinations.includes('TELEGRAM')) {
                return { error: `Your ${userPlan} plan does not support Telegram as a destination. Elite required.` };
            }

            // 3. Path Limit Check
            const activeCount = await prisma.mirrorConfig.count({
                where: { userId: session.user.id, active: true }
            });
            const limit = PLAN_LIMITS[userPlan] || 0;
            if (activeCount >= limit) {
                return { error: `You have reached your ${userPlan} plan limit of ${limit} active mirrors.` };
            }
        }

        await prisma.mirrorConfig.update({
            where: { id, userId: session.user.id },
            data: {
                active,
                // If activating, reset status to ACTIVE
                ...(active ? { status: "ACTIVE" } : {})
            }
        });
        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e) {
        console.error("Toggle error:", e);
        return { error: "Failed to update mirror status" };
    }
}

// --- Mirror Group Actions ---

export async function getMirrorConfig(id: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;

    return prisma.mirrorConfig.findFirst({
        where: {
            id,
            userId: session.user.id
        },
        include: {
            discordAccount: true,
            telegramAccount: true,
            group: true
        }
    });
}

export async function getMirrorConfigs(limit?: number) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return [];

    return prisma.mirrorConfig.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
            discordAccount: true,
            telegramAccount: true,
            group: true
        }
    });
}

export async function getMirrorGroups() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return [];

    return prisma.mirrorGroup.findMany({
        where: { userId: session.user.id },
        orderBy: { name: "asc" },
        include: {
            _count: {
                select: { configs: true }
            }
        }
    });
}

export async function createMirrorGroup(name: string, type: any) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { error: "Unauthorized" };

    try {
        const group = await prisma.mirrorGroup.create({
            data: {
                name,
                type,
                userId: session.user.id
            }
        });
        revalidatePath("/dashboard/expert");
        return { success: true, group };
    } catch (e) {
        return { error: "Failed to create group" };
    }
}

export async function deleteMirrorGroup(id: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { error: "Unauthorized" };

    try {
        await prisma.mirrorGroup.delete({
            where: { id, userId: session.user.id }
        });
        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e) {
        return { error: "Failed to delete group" };
    }
}
