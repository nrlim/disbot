import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const config = await prisma.mirrorConfig.findFirst({
            where: {
                id: params.id,
                userId: session.user.id
            }
        });

        if (!config) {
            return new NextResponse("Not Found", { status: 404 });
        }

        // Decrypt the token
        let decryptedToken = "";
        try {
            decryptedToken = config.userToken ? decrypt(config.userToken) : "";
        } catch (e) {
            console.error("Token decryption failed", e);
            // If decryption fails, we might return empty or error. 
            // Return empty to allow user to overwrite it.
        }

        return NextResponse.json({
            ...config,
            userToken: decryptedToken
        });
    } catch (e) {
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
