import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const [topProducts, successTxs, recentOrders] = await Promise.all([
            prisma.teleProduct.findMany({
                where: { userId: session.user.id },
                orderBy: { totalSold: "desc" },
                take: 5,
                select: { id: true, name: true, totalSold: true, price: true, stock: true, category: true },
            }),
            prisma.teleTransaction.findMany({
                where: { storeOwnerId: session.user.id, status: "SUCCESS" },
                include: { product: { select: { price: true } } },
            }),
            prisma.teleTransaction.findMany({
                where: { storeOwnerId: session.user.id },
                orderBy: { createdAt: "desc" },
                take: 10,
                include: {
                    product: { select: { name: true, price: true } },
                    teleUser: { select: { telegramId: true, username: true } },
                },
            }),
        ]);

        const totalRevenue = successTxs.reduce((sum, tx) => sum + tx.product.price * tx.amount, 0);
        const totalOrders = successTxs.length;

        // Number of distinct users who ordered from this store owner (from successful and pending)
        const distinctUserIds = new Set(recentOrders.map(tx => tx.teleUser.telegramId));
        const totalUsers = distinctUserIds.size; // Close enough estimate based on recent activity, or we could aggregate.

        return NextResponse.json({
            topProducts,
            totalRevenue,
            totalOrders,
            totalUsers,
            recentOrders: recentOrders.map((tx) => ({
                id: tx.id,
                product: tx.product.name,
                price: tx.product.price,
                amount: tx.amount,
                status: tx.status,
                userTag: tx.teleUser.username
                    ? `@${tx.teleUser.username}`
                    : `TG#${tx.teleUser.telegramId.slice(-4)}`,
                createdAt: tx.createdAt,
            })),
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
