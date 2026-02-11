
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { ShieldAlert, Server, ChevronRight, RefreshCw, Loader2, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface Guild {
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
}

const GuildSelector = () => {
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchGuilds = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/discord/guilds");

            if (res.status === 401) {
                setError("Please sign in to view your servers.");
                return;
            }

            if (!res.ok) {
                throw new Error("Failed to load servers");
            }

            const data = await res.json();
            setGuilds(data);
        } catch (err) {
            console.error(err);
            setError("Failed to fetch Discord servers. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGuilds();
    }, []);

    // Skeleton Loader
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 animate-pulse" />
                ))}
            </div>
        );
    }

    if (error) {
        const isAuthError = error.includes("sign in");
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center border-l-2 border-red-500 bg-red-950/10">
                <ShieldAlert className="w-10 h-10 text-red-500 mb-4" />
                <h3 className="text-lg font-mono font-bold text-red-400 mb-2 uppercase tracking-tight">Access Error</h3>
                <p className="text-zinc-500 mb-6 max-w-md font-mono text-xs">{error}</p>
                {isAuthError ? (
                    <button
                        onClick={() => signIn("discord")}
                        className="flex items-center gap-2 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white transition-colors font-mono font-bold text-xs uppercase"
                    >
                        <RefreshCw className="w-3 h-3" /> Reconnect Discord
                    </button>
                ) : (
                    <button
                        onClick={fetchGuilds}
                        className="flex items-center gap-2 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all font-mono font-bold text-xs uppercase"
                    >
                        <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                )}
            </div>
        );
    }

    if (guilds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-zinc-800 bg-zinc-950/50">
                <Server className="w-10 h-10 text-zinc-600 mb-4" />
                <h3 className="text-lg font-mono font-bold text-zinc-300 mb-2 uppercase tracking-tight">No Servers Found</h3>
                <p className="text-zinc-500 max-w-md font-mono text-xs">
                    You don&apos;t seem to have <span className="text-primary">Manage Guild</span> or <span className="text-primary">Administrator</span> permissions in any Discord servers.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {guilds.map((guild) => (
                <Link
                    key={guild.id}
                    href={`/dashboard/${guild.id}`}
                    className="block group"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className="p-4 bg-zinc-950 border border-zinc-800 hover:border-primary/50 transition-all flex items-center justify-between gap-4 group-hover:bg-zinc-900/50"
                    >
                        <div className="flex items-center gap-4 min-w-0">
                            {/* Guild Icon */}
                            <div className="relative w-10 h-10 shrink-0 bg-zinc-900 border border-zinc-700 flex items-center justify-center group-hover:border-primary/50 transition-colors">
                                {guild.icon ? (
                                    <Image
                                        src={guild.icon}
                                        alt={guild.name}
                                        width={40}
                                        height={40}
                                        className="w-full h-full object-cover rounded-none"
                                        unoptimized
                                    />
                                ) : (
                                    <span className="text-xs font-bold text-zinc-500 font-mono group-hover:text-primary transition-colors">
                                        {guild.name.substring(0, 2).toUpperCase()}
                                    </span>
                                )}
                            </div>

                            {/* Guild Info */}
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <h3 className="font-mono font-bold text-zinc-300 truncate text-sm group-hover:text-white transition-colors">
                                        {guild.name}
                                    </h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-none" />
                                    <span className="text-[10px] text-zinc-500 font-mono font-medium uppercase tracking-wider">Available</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Icon */}
                        <div className="text-zinc-600 group-hover:text-primary transition-colors transform group-hover:translate-x-1 duration-200">
                            <ChevronRight className="w-4 h-4" />
                        </div>
                    </motion.div>
                </Link>
            ))}
        </div>
    );
};

export default GuildSelector;
