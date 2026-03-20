import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { telegramId, amount } = body;

        if (!telegramId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return NextResponse.json({ error: "telegramId and a positive amount are required" }, { status: 400 });
        }

        const parsedAmount = parseFloat(amount);

        // Note: For real isolated stores, balance should be per store.
        // But our TeleUser has a global balance. To keep things decoupled, top-up remains global to the TeleUser,
        // or we can adjust it if required. Since the schema remains 'balance' on TeleUser, we will just up it.
        const user = await prisma.teleUser.upsert({
            where: { telegramId: String(telegramId) },
            update: { balance: { increment: parsedAmount } },
            create: { telegramId: String(telegramId), balance: parsedAmount },
            select: { id: true, telegramId: true, username: true },
        });

        console.info(`[TOPUP] Owner ${session.user.id.slice(0, 8)}*** topped up TG#${user.telegramId.slice(-4)} by Rp ${parsedAmount.toLocaleString("id-ID")}`);

        return NextResponse.json({
            success: true,
            user: { telegramId: user.telegramId, username: user.username },
            addedAmount: parsedAmount,
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
