"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { encrypt, decrypt } from "@/lib/encryption";
import { PLAN_LIMITS } from "@/lib/constants";

// --- Schema ---

const mirrorSchema = z.object({
    sourcePlatform: z.enum(["DISCORD", "TELEGRAM"]).default("DISCORD"),
    sourceGuildName: z.string().min(1, "Server name is required"),
    targetWebhookUrl: z.string().url("Invalid Webhook URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord Webhook URL"),

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

    // Destination Metadata (for UI pre-fill)
    targetChannelId: z.string().optional(),
    targetGuildId: z.string().optional(),
    targetGuildName: z.string().optional(),
    targetChannelName: z.string().optional(),
}).superRefine((data, ctx) => {
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
        if (!data.telegramPhone || data.telegramPhone.length < 5) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Telegram Phone Number is required for account linking",
                path: ["telegramPhone"]
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
        sourceGuildId: formData.get("sourceGuildId") as string || undefined,
        sourceChannelId: formData.get("sourceChannelId") as string || undefined,
        targetWebhookUrl: formData.get("targetWebhookUrl") as string || undefined,
        userToken: (formData.get("userToken") as string) || undefined,
        discordAccountId: (formData.get("discordAccountId") as string) || undefined,

        telegramSession: formData.get("telegramSession") || undefined,
        telegramChatId: formData.get("telegramChatId") || undefined,
        telegramTopicId: formData.get("telegramTopicId") || undefined,
        telegramPhone: formData.get("telegramPhone") || undefined,

        targetChannelId: (formData.get("targetChannelId") as string) || undefined,
        targetGuildId: (formData.get("targetGuildId") as string) || undefined,
        targetChannelName: (formData.get("targetChannelName") as string) || undefined,
        targetGuildName: (formData.get("targetGuildName") as string) || undefined,
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
        const { sourcePlatform, telegramSession, userToken, discordAccountId, telegramChatId, telegramPhone } = validated.data; // Note: telegramSession/userToken from input are now ignored or used to find account if not provided (though manual token is deprecated)

        // Enforce account selection for Discord
        if (sourcePlatform === "DISCORD" && !discordAccountId) {
            return { error: "Discord Account selection is required." };
        }

        // Enforce account selection for Telegram
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

        let telegramAccountIdToLink = null;
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
        }

        await prisma.mirrorConfig.create({
            data: {
                userId: session.user.id,
                sourcePlatform: sourcePlatform as any,
                sourceGuildName: validated.data.sourceGuildName,
                // Universal (Legacy)
                sourceChannelId: sourcePlatform === "DISCORD"
                    ? (validated.data.sourceChannelId || "")
                    : (validated.data.telegramChatId || ""),
                sourceGuildId: validated.data.sourceGuildId,

                // Relations
                discordAccountId: sourcePlatform === "DISCORD" ? discordAccountId : null,
                telegramAccountId: sourcePlatform === "TELEGRAM" ? telegramAccountIdToLink : null,

                targetWebhookUrl: validated.data.targetWebhookUrl, // Legacy
                targetChannelId: validated.data.targetChannelId,
                targetGuildId: validated.data.targetGuildId,
                targetChannelName: validated.data.targetChannelName,
                targetGuildName: validated.data.targetGuildName,
                active: true,
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

        targetChannelId: (formData.get("targetChannelId") as string) || undefined,
        targetGuildId: (formData.get("targetGuildId") as string) || undefined,
        targetChannelName: (formData.get("targetChannelName") as string) || undefined,
        targetGuildName: (formData.get("targetGuildName") as string) || undefined,
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

        const { sourcePlatform, telegramSession, userToken, discordAccountId, telegramChatId, telegramPhone } = validated.data;

        const updateData: any = {
            sourcePlatform: sourcePlatform as any,
            sourceGuildName: validated.data.sourceGuildName,
            sourceGuildId: validated.data.sourceGuildId,
            targetWebhookUrl: validated.data.targetWebhookUrl,
            // Metadata for pre-filling UI
            targetChannelId: validated.data.targetChannelId,
            targetGuildId: validated.data.targetGuildId,
            targetChannelName: validated.data.targetChannelName,
            targetGuildName: validated.data.targetGuildName,
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
            updateData.telegramAccountId = null;

        } else {
            // Telegram
            // We need to link a TelegramAccount.
            let telegramAccountIdToLink = null;
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
            }

            if (telegramAccountIdToLink) {
                updateData.telegramAccountId = telegramAccountIdToLink;
            }
            updateData.sourceChannelId = telegramChatId || ""; // Use chat ID as sourceChannelId

            // Clear discord fields
            updateData.discordAccountId = null;
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
