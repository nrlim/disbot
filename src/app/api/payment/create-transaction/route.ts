import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
// @ts-ignore
import midtransClient from "midtrans-client";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { planType } = body;

        let price = 0;

        switch (planType) {
            case "STARTER":
                price = 75000;
                break;
            case "PRO":
                price = 199000;
                break;
            case "ELITE":
                price = 499000;
                break;
            default:
                return NextResponse.json({ error: "Invalid plan type" }, { status: 400 });
        }

        // Initialize Snap client
        const snap = new midtransClient.Snap({
            isProduction: false,
            serverKey: process.env.MIDTRANS_SERVER_KEY || "",
            clientKey: process.env.MIDTRANS_CLIENT_KEY || ""
        });

        const timestamp = Date.now();
        // Unique order_id: DISBOT-USERID-TIMESTAMP
        const orderId = `DISBOT-${session.user.id}-${timestamp}`;

        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: price,
            },
            item_details: [
                {
                    id: planType,
                    price: price,
                    quantity: 1,
                    name: `${planType} Plan (User: ${session.user.id})`, // Include userId in item name for metadata visibility
                    merchant_name: "DisBot"
                },
            ],
            customer_details: {
                first_name: session.user.name,
                email: session.user.email,
                // user_id is not a standard field in customer_details, but we have it in order_id
            }
        };

        const transaction = await snap.createTransaction(parameter);

        // Record Pending Transaction
        await prisma.paymentHistory.create({
            data: {
                userId: session.user.id,
                orderId: orderId,
                amount: price,
                plan: planType,
                status: "pending",
                snapToken: transaction.token,
            }
        });

        return NextResponse.json({
            token: transaction.token,
            redirect_url: transaction.redirect_url,
        });

    } catch (error) {
        console.error("[PAYMENT_CREATE]", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
