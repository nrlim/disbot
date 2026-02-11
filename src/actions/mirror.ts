"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { encrypt } from "@/lib/encryption";

// --- Schema ---

const mirrorSchema = z.object({
    sourceGuildName: z.string().min(1, "Server name is required"),
    sourceChannelId: z.string().min(17, "Invalid Channel ID"),
    targetWebhookUrl: z.string().url("Invalid Webhook URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord Webhook URL"),
    userToken: z.string().min(10, "User Token is required for Expert Mode"),
});

// --- Actions ---

export async function createMirrorConfig(prevState: any, formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const rawData = {
        sourceGuildName: formData.get("sourceGuildName"),
        sourceChannelId: formData.get("sourceChannelId"),
        targetWebhookUrl: formData.get("targetWebhookUrl"),
        userToken: formData.get("userToken"),
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

    const PLAN_LIMITS: Record<string, number> = {
        STARTER: 2,
        PRO: 15,
        ELITE: 9999
    };

    const limit = PLAN_LIMITS[(user as any).plan] || 2;
    if ((user as any)._count.configs >= limit) {
        return { error: "Plan limit reached. Upgrade to Pro for more." };
    }

    // Create
    try {
        await prisma.mirrorConfig.create({
            data: {
                userId: session.user.id,
                sourceGuildName: validated.data.sourceGuildName,
                sourceChannelId: validated.data.sourceChannelId,
                targetWebhookUrl: validated.data.targetWebhookUrl,
                userToken: encrypt(validated.data.userToken), // Use provided User Token
                active: true
            }
        });

        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e) {
        console.error("Failed to create mirror:", e);
        return { error: "Database error. Please try again." };
    }
}

export async function updateMirrorConfig(prevState: any, formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { error: "Unauthorized" };

    const id = formData.get("id") as string;
    if (!id) return { error: "Missing Config ID" };

    const rawData = {
        sourceGuildName: formData.get("sourceGuildName"),
        sourceChannelId: formData.get("sourceChannelId"),
        targetWebhookUrl: formData.get("targetWebhookUrl"),
        userToken: formData.get("userToken"),
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

        await prisma.mirrorConfig.update({
            where: { id },
            data: {
                sourceGuildName: validated.data.sourceGuildName,
                sourceChannelId: validated.data.sourceChannelId,
                targetWebhookUrl: validated.data.targetWebhookUrl,
                userToken: encrypt(validated.data.userToken), // Use provided User Token
            }
        });

        revalidatePath("/dashboard/expert");
        return { success: true };
    } catch (e) {
        console.error("Failed to update mirror:", e);
        return { error: "Database error. Please try again." };
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
