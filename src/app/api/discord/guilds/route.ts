
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

        // Used to filter by Administrator/Manage Guild, but user feedback requested
        // access to all guilds ("mirror any server I'm in").
        // Permissions logic removed to show all servers.
        const guildsToReturn = guilds;

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
