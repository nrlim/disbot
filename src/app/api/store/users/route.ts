import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Get users who have transacted in this store
        const userTxs = await prisma.teleTransaction.findMany({
            where: { storeOwnerId: session.user.id },
            include: { teleUser: true },
            distinct: ['teleUserId'],
        });

        const users = userTxs.map(tx => tx.teleUser);

        return NextResponse.json({ users });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
