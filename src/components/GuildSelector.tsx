
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { ShieldAlert, Server, ChevronRight, RefreshCw, Loader2 } from "lucide-react";
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-28 bg-white/5 rounded-xl animate-pulse border border-white/5" />
                ))}
            </div>
        );
    }



    if (error) {
        const isAuthError = error.includes("sign in");
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-sm">
                <ShieldAlert className="w-12 h-12 text-red-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Access Error</h3>
                <p className="text-gray-400 mb-6 max-w-md">{error}</p>
                {isAuthError ? (
                    <button
                        onClick={() => signIn("discord")}
                        className="flex items-center gap-2 px-6 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg transition-colors font-medium shadow-lg shadow-[#5865F2]/20"
                    >
                        <RefreshCw className="w-4 h-4" /> Reconnect Discord
                    </button>
                ) : (
                    <button
                        onClick={fetchGuilds}
                        className="flex items-center gap-2 px-6 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg transition-all font-medium"
                    >
                        <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                )}
            </div>
        );
    }

    if (guilds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-white/10 bg-white/5 backdrop-blur-sm">
                <Server className="w-12 h-12 text-gray-500 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">No Servers Found</h3>
                <p className="text-gray-400 max-w-md">
                    You don&apos;t seem to have <span className="text-[#5865F2]">Manage Guild</span> or <span className="text-[#5865F2]">Administrator</span> permissions in any Discord servers.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {guilds.map((guild) => (
                <motion.div
                    key={guild.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.02, backgroundColor: "rgba(255, 255, 255, 0.07)" }}
                    transition={{ duration: 0.2 }}
                    className="p-5 rounded-xl bg-white/5 border border-white/10 hover:border-[#5865F2]/50 backdrop-blur-sm transition-colors group flex items-center justify-between gap-4"
                >
                    <div className="flex items-center gap-4 min-w-0">
                        {/* Guild Icon */}
                        <div className="relative w-14 h-14 shrink-0 rounded-[18px] overflow-hidden bg-[#2f3136] flex items-center justify-center border border-white/10 group-hover:border-[#5865F2] transition-colors shadow-lg">
                            {guild.icon ? (
                                <Image
                                    src={guild.icon}
                                    alt={guild.name}
                                    width={56}
                                    height={56}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                />
                            ) : (
                                <span className="text-lg font-bold text-gray-400 group-hover:text-white transition-colors">
                                    {guild.name.substring(0, 2).toUpperCase()}
                                </span>
                            )}
                        </div>

                        {/* Guild Info */}
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-100 truncate text-lg group-hover:text-white transition-colors">
                                {guild.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                <span className="text-xs text-gray-400 font-medium">Ready</span>
                            </div>
                        </div>
                    </div>

                    {/* Action Button */}
                    <Link
                        href={`/dashboard/${guild.id}`}
                        className="shrink-0 px-4 py-2 rounded-lg bg-[#5865F2]/10 hover:bg-[#5865F2] border border-[#5865F2]/20 hover:border-[#5865F2] text-[#5865F2] hover:text-white transition-all font-medium text-sm shadow-sm flex items-center gap-1 group/btn"
                        aria-label={`Select ${guild.name}`}
                    >
                        Select
                        <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                    </Link>
                </motion.div>
            ))}
        </div>
    );
};

export default GuildSelector;
