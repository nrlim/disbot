import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { PLAN_DETAILS, PLAN_LIMITS, PLAN_PLATFORMS, PLAN_DESTINATION_PLATFORMS } from "@/lib/constants";
import { Plan } from "@prisma/client";

export async function POST(
    req: Request,
    props: { params: Promise<{ secret: string }> }
) {
    const params = await props.params;
    // Validate Secret
    const { secret } = params;
    const correctSecret = process.env.MIDTRANS_WEBHOOK_SECRET;

    if (!correctSecret || secret !== correctSecret) {
        console.error(`[WEBHOOK_MIDTRANS] Invalid Secret URL: ${secret}`);
        return new NextResponse("Forbidden", { status: 403 });
    }

    try {
        const text = await req.text();
        const notification = JSON.parse(text);

        const {
            order_id,
            transaction_status,
            fraud_status,
            gross_amount,
            signature_key,
            status_code
        } = notification;

        // Verify Signature
        // Signature = SHA512(order_id + status_code + gross_amount + ServerKey)
        const serverKey = process.env.MIDTRANS_SERVER_KEY || "";
        const expectedSignature = crypto
            .createHash("sha512")
            .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
            .digest("hex");

        if (signature_key !== expectedSignature) {
            console.error("[WEBHOOK_MIDTRANS] Invalid Signature");
            return new NextResponse("Invalid Signature", { status: 403 });
        }

        console.log(`[WEBHOOK_MIDTRANS] Processing ${order_id} - ${transaction_status}`);

        // Parse User ID from order_id: DISBOT-USERID-TIMESTAMP
        // Example: DISBOT-clh12345-1681234567890
        const parts = order_id.split("-");
        if (parts.length < 3 || parts[0] !== "DISBOT") {
            console.error("[WEBHOOK_MIDTRANS] Invalid Order ID Format:", order_id);
            return new NextResponse("Invalid Order ID", { status: 400 });
        }

        const timestamp = parts[parts.length - 1];
        const userId = parts.slice(1, parts.length - 1).join("-");

        // Determine Plan based on price
        // Normalize gross_amount (it might be string "75000.00")
        const amount = parseFloat(gross_amount);

        let targetPlan: Plan | null = null;

        if (amount === 75000) targetPlan = "STARTER";
        else if (amount === 199000) targetPlan = "PRO";
        else if (amount === 499000) targetPlan = "ELITE";

        if (!targetPlan) {
            // Check constants if prices change
            const planMatch = PLAN_DETAILS.find(p => p.price === amount);
            if (planMatch) {
                targetPlan = planMatch.name as Plan;
            } else {
                console.error("[WEBHOOK_MIDTRANS] Unknown Price Amount:", amount);
                return new NextResponse("Unknown Price Amount", { status: 400 });
            }
        }

        // Process Transaction Status
        if (transaction_status === 'capture' || transaction_status === 'settlement') {
            if (transaction_status === 'capture' && fraud_status === 'challenge') {
                // Update Payment History to challenge
                await prisma.paymentHistory.update({
                    where: { orderId: order_id },
                    data: { status: 'challenge' }
                });
                return new NextResponse("OK", { status: 200 });
            }

            // Update Payment History to success
            await prisma.paymentHistory.update({
                where: { orderId: order_id },
                data: { status: 'success' }
            });

            // Calculate Expiry (30 days from now)
            const now = new Date();
            const expiryDate = new Date(now.setDate(now.getDate() + 30));

            // Update User
            await prisma.user.update({
                where: { id: userId },
                data: {
                    plan: targetPlan,
                    packageExpiredAt: expiryDate
                }
            });

            // Activate Mirror Configs up to limit and within plan features
            const limit = PLAN_LIMITS[targetPlan] || 0;
            const allowedSources = PLAN_PLATFORMS[targetPlan] || ['DISCORD'];
            const allowedDestinations = PLAN_DESTINATION_PLATFORMS[targetPlan] || ['DISCORD'];

            // Get all user configs
            const userConfigs = await prisma.mirrorConfig.findMany({
                where: { userId: userId },
                orderBy: { createdAt: 'asc' } // Enable oldest/first created configs by default
            });

            let activeCount = 0;
            const updates = userConfigs.map((config) => {
                // 1. Feature Check: Source Platform
                const sourceAllowed = allowedSources.includes(config.sourcePlatform);

                // 2. Feature Check: Destination Platform
                // D2T: source DISCORD + telegramChatId present
                // T2T: source TELEGRAM + telegramChatId (dest) != sourceChannelId (source)
                const isTelegramDest = (config.sourcePlatform === 'DISCORD' && !!config.telegramChatId) ||
                    (config.sourcePlatform === 'TELEGRAM' && !!config.telegramChatId && !!config.sourceChannelId && config.telegramChatId !== config.sourceChannelId);

                const destAllowed = !isTelegramDest || allowedDestinations.includes('TELEGRAM');

                const isFeatureValid = sourceAllowed && destAllowed;

                // 3. Path Limit
                let shouldBeActive = false;
                let status = "ACTIVE";

                if (!isFeatureValid) {
                    shouldBeActive = false;
                    status = "PLAN_RESTRICTION";
                } else if (activeCount < limit) {
                    shouldBeActive = true;
                    activeCount++;
                    status = "ACTIVE";
                } else {
                    shouldBeActive = false;
                    status = "PATH_LIMIT_REACHED";
                }

                return prisma.mirrorConfig.update({
                    where: { id: config.id },
                    data: {
                        active: shouldBeActive,
                        status: status
                    }
                });
            });

            await prisma.$transaction(updates);

            console.log(`[Payment Success] User ${userId} upgraded to ${targetPlan}.`);
        } else if (transaction_status === 'cancel' || transaction_status === 'deny' || transaction_status === 'expire') {
            // Update Payment History to failed
            await prisma.paymentHistory.update({
                where: { orderId: order_id },
                data: { status: 'failed' }
            });
            console.log(`[WEBHOOK_MIDTRANS] Payment failed/cancelled for ${order_id}`);
        } else if (transaction_status === 'pending') {
            await prisma.paymentHistory.update({
                where: { orderId: order_id },
                data: { status: 'pending' }
            });
        }

        return new NextResponse("OK", { status: 200 });

    } catch (error) {
        console.error("[WEBHOOK_MIDTRANS] Error:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
