
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const DISCORD_API_BASE = "https://discord.com/api";

export async function GET(req: NextRequest) {
    try {
        // Securely retrieve the token from the encrypted session cookie
        const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

        console.log("Debug: API Route Token Check");
        console.log("Token exists:", !!token);
        console.log("Token has accessToken:", !!token?.accessToken);

        if (!token || !token.accessToken) {
            console.log("Debug: Returning 401 Unauthorized");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
            headers: {
                Authorization: `Bearer ${token.accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Discord API Error: ${response.status} ${response.statusText}`, errorText);

            if (response.status === 429) {
                return NextResponse.json({ error: "Rate limited by Discord API" }, { status: 429 });
            }
            return NextResponse.json(
                { error: `Failed to fetch guilds from Discord: ${response.status}`, details: errorText },
                { status: response.status }
            );
        }

        const guilds = await response.json();

        // Permission constants (BigInt for bitwise operations)
        const ADMINISTRATOR = BigInt(0x8);
        const MANAGE_GUILD = BigInt(0x20);

        const fetchAll = req.nextUrl.searchParams.get("all") === "true";

        const guildsToReturn = fetchAll
            ? guilds
            : guilds.filter((guild: any) => {
                const permissions = BigInt(guild.permissions);
                const hasAdmin = (permissions & ADMINISTRATOR) === ADMINISTRATOR;
                const hasManageGuild = (permissions & MANAGE_GUILD) === MANAGE_GUILD;
                return hasAdmin || hasManageGuild;
            });

        const formattedGuilds = guildsToReturn.map((guild: any) => ({
            id: guild.id,
            name: guild.name,
            icon: guild.icon
                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
                : null,
            permissions: guild.permissions
        }));

        return NextResponse.json(formattedGuilds);

    } catch (error) {
        console.error("Error fetching guilds:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
