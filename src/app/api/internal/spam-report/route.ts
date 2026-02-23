import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization");
        const key = process.env.ENCRYPTION_KEY || "";

        if (!authHeader || authHeader !== `Bearer ${key}`) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const { configIds, senderId } = body;

        if (!configIds || !Array.isArray(configIds) || !senderId) {
            return new NextResponse("Invalid payload", { status: 400 });
        }

        // Fetch current configs to update
        const configs = await prisma.mirrorConfig.findMany({
            where: {
                id: { in: configIds }
            }
        });

        // Update each config by adding senderId to blacklistedUsers if not present
        const updatePromises = configs.map(async (config) => {
            let currentBlacklist: string[] = [];

            if (config.blacklistedUsers) {
                if (typeof config.blacklistedUsers === "string") {
                    try {
                        currentBlacklist = JSON.parse(config.blacklistedUsers);
                    } catch (e) {
                        currentBlacklist = [];
                    }
                } else if (Array.isArray(config.blacklistedUsers)) {
                    currentBlacklist = config.blacklistedUsers as string[];
                }
            }

            if (!currentBlacklist.includes(senderId)) {
                currentBlacklist.push(senderId);
                return prisma.mirrorConfig.update({
                    where: { id: config.id },
                    data: { blacklistedUsers: JSON.stringify(currentBlacklist) } // store as JS array which prisma maps to Json
                });
            }
        });

        await Promise.all(updatePromises);

        return NextResponse.json({ success: true, added: senderId });
    } catch (error: any) {
        console.error("Spam report API error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
