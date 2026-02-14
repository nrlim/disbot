"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { ShieldAlert, Server, ChevronRight, RefreshCw, Loader2 } from "lucide-react";

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
                    <div key={i} className="h-20 bg-gray-50 border border-gray-200 rounded-lg animate-pulse" />
                ))}
            </div>
        );
    }

    if (error) {
        const isAuthError = error.includes("sign in");
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center border-l-4 border-red-500 bg-red-50 rounded-r-lg">
                <ShieldAlert className="w-8 h-8 text-red-500 mb-3" />
                <h3 className="text-sm font-bold text-red-700 mb-1 uppercase tracking-wide">Access Error</h3>
                <p className="text-red-600/80 mb-4 max-w-sm text-xs">{error}</p>
                {isAuthError ? (
                    <button
                        onClick={() => signIn("discord")}
                        className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors text-xs font-bold uppercase"
                    >
                        <RefreshCw className="w-3 h-3" /> Reconnect Discord
                    </button>
                ) : (
                    <button
                        onClick={fetchGuilds}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-md transition-all text-xs font-bold uppercase"
                    >
                        <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                )}
            </div>
        );
    }

    if (guilds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-gray-300 rounded-xl bg-gray-50">
                <Server className="w-10 h-10 text-gray-400 mb-4" />
                <h3 className="text-gray-900 font-bold mb-2">No Servers Found</h3>
                <p className="text-gray-500 max-w-md text-sm">
                    You don&apos;t seem to have <span className="text-primary font-semibold">Manage Guild</span> permissions in any Discord servers.
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
                        className="p-4 bg-white border border-gray-200 rounded-xl hover:border-primary/50 hover:shadow-md transition-all flex items-center justify-between gap-4"
                    >
                        <div className="flex items-center gap-4 min-w-0">
                            {/* Guild Icon */}
                            <div className="relative w-10 h-10 shrink-0 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200 overflow-hidden group-hover:border-primary/30 transition-colors">
                                {guild.icon ? (
                                    <Image
                                        src={guild.icon}
                                        alt={guild.name}
                                        width={40}
                                        height={40}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                    />
                                ) : (
                                    <span className="text-xs font-bold text-gray-500 group-hover:text-primary transition-colors">
                                        {guild.name.substring(0, 2).toUpperCase()}
                                    </span>
                                )}
                            </div>

                            {/* Guild Info */}
                            <div className="min-w-0">
                                <h3 className="font-bold text-gray-900 truncate text-sm group-hover:text-primary transition-colors">
                                    {guild.name}
                                </h3>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Available</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Icon */}
                        <div className="text-gray-400 group-hover:text-primary transition-colors transform group-hover:translate-x-1 duration-200">
                            <ChevronRight className="w-4 h-4" />
                        </div>
                    </motion.div>
                </Link>
            ))}
        </div>
    );
};

export default GuildSelector;
