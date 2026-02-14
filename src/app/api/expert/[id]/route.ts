import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    // Await params in Next.js 15+
    const { id } = await params;

    try {
        const config = await prisma.mirrorConfig.findFirst({
            where: {
                id: id,
                userId: session.user.id
            },
            include: {
                discordAccount: true,
                telegramAccount: true
            }
        });

        if (!config) {
            return new NextResponse("Not Found", { status: 404 });
        }

        // Decrypt the token from connected account if available
        let decryptedToken = "";
        let decryptedSession = "";

        try {
            if (config.discordAccount?.token) {
                decryptedToken = decrypt(config.discordAccount.token);
            }
            if (config.telegramAccount?.sessionString) {
                decryptedSession = decrypt(config.telegramAccount.sessionString);
            }
        } catch (e) {
            console.error("Token decryption failed", e);
        }

        return NextResponse.json({
            ...config,
            userToken: decryptedToken,
            telegramSession: decryptedSession
            // Note: Schema removed userToken column, so we synthesized it here for backward compat
        });
    } catch (e) {
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
