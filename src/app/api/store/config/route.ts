import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const config = await prisma.storeConfig.findUnique({
            where: { userId: session.user.id },
        });

        return NextResponse.json({ config });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { botToken, botUsername, welcomeMsg, welcomeImageUrl, active, cmdMenu, cmdBalance, cmdHistory } = body;

        const config = await prisma.storeConfig.upsert({
            where: { userId: session.user.id },
            update: {
                ...(botToken !== undefined && { botToken }),
                ...(botUsername !== undefined && { botUsername }),
                ...(welcomeMsg !== undefined && { welcomeMsg }),
                ...(welcomeImageUrl !== undefined && { welcomeImageUrl }),
                ...(active !== undefined && { active }),
                ...(cmdMenu !== undefined && { cmdMenu }),
                ...(cmdBalance !== undefined && { cmdBalance }),
                ...(cmdHistory !== undefined && { cmdHistory }),
            },
            create: {
                userId: session.user.id,
                botToken: botToken || "",
                botUsername: botUsername || "",
                welcomeMsg: welcomeMsg || "Selamat datang di AUTO ORDER",
                welcomeImageUrl: welcomeImageUrl || null,
                active: active || false,
                cmdMenu: cmdMenu || "Menu Utama",
                cmdBalance: cmdBalance || "Saldo Kamu",
                cmdHistory: cmdHistory || "Riwayat Pesanan",
            },
        });

        // Also update bot restarts timestamp so manager picks it up (if implemented logic)
        // Similar to BotConfig restartWorkerAt but we will just have the manager poll every 30s.

        return NextResponse.json({ config });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
