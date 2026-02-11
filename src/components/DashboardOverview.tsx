"use client";

import { motion } from "framer-motion";
import {
    Activity,
    Zap,
    Shield,
    Server,
    ArrowRight,
    Bot,
    CheckCircle2,
    Clock,
    ShieldAlert,
    TrendingUp,
    BarChart3
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// --- Types ---

interface MirrorConfig {
    id: string;
    sourceGuildName: string | null;
    sourceChannelId: string;
    targetWebhookUrl: string;
    active: boolean;
    createdAt: Date;
}

interface DashboardOverviewProps {
    stats: {
        activeCount: number;
        planName: string;
        usageLimit: number;
        percentage: number;
    };
    recentConfigs: MirrorConfig[];
}

export default function DashboardOverview({ stats, recentConfigs }: DashboardOverviewProps) {

    // Animation Variants
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    const maskWebhook = (url: string) => {
        try {
            const parts = url.split("/");
            const id = parts[5] || "...";
            return `.../${id}/••••`;
        } catch (e) {
            return "Invalid URL";
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Command Center</h1>
                    <p className="text-gray-400">System overview and quick controls.</p>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-[#00D1FF]/5 border border-[#00D1FF]/20 rounded-full shadow-[0_0_15px_rgba(0,209,255,0.15)]">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00D1FF]"></span>
                    </span>
                    <span className="text-xs font-bold text-[#00D1FF] uppercase tracking-wide">System Online</span>
                </div>
            </div>

            {/* Stats Grid */}
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
                {/* Active Paths Card */}
                <motion.div variants={item} className="p-6 rounded-3xl obsidian-card group hover:border-[#00D1FF]/30 transition-all duration-500 relative overflow-hidden">
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#00D1FF]/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-[#161B2B] rounded-xl border border-white/5 text-[#00D1FF]">
                            <Activity className="w-6 h-6" />
                        </div>
                        <div className="px-2.5 py-1 rounded-lg bg-[#00D1FF]/10 border border-[#00D1FF]/20 text-[10px] font-bold text-[#00D1FF] uppercase tracking-wider">
                            Live
                        </div>
                    </div>

                    <div>
                        <h3 className="text-4xl font-bold text-white mb-1 group-hover:scale-105 transition-transform origin-left">{stats.activeCount}</h3>
                        <p className="text-gray-400 text-sm font-medium">Active Mirrors</p>
                    </div>

                    <div className="mt-6 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/5 px-3 py-1.5 rounded-lg border border-emerald-500/10 w-fit">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Running smoothly</span>
                    </div>
                </motion.div>

                {/* Subscription Card */}
                <motion.div variants={item} className="p-6 rounded-3xl obsidian-card group hover:border-amber-500/30 transition-all duration-500 relative overflow-hidden">
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-[#161B2B] rounded-xl border border-white/5 text-amber-500">
                            <Zap className="w-6 h-6" />
                        </div>
                        <Link href="/dashboard/settings" className="px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-wider transition-colors flex items-center gap-1">
                            Manage <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>

                    <div>
                        <h3 className="text-4xl font-bold text-white mb-1 uppercase tracking-tight">{stats.planName}</h3>
                        <p className="text-gray-400 text-sm font-medium">Current Plan</p>
                    </div>

                    <div className="mt-6 w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 w-3/4 rounded-full" />
                    </div>
                </motion.div>

                {/* Quota Usage Card */}
                <motion.div variants={item} className="p-6 rounded-3xl obsidian-card group hover:border-[#5865F2]/30 transition-all duration-500 relative overflow-hidden">
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#5865F2]/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-[#161B2B] rounded-xl border border-white/5 text-[#5865F2]">
                            <BarChart3 className="w-6 h-6" />
                        </div>
                        <div className={cn(
                            "px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider",
                            stats.percentage >= 90
                                ? "bg-red-500/10 border-red-500/20 text-red-500"
                                : "bg-[#5865F2]/10 border-[#5865F2]/20 text-[#5865F2]"
                        )}>
                            {Math.round(stats.percentage)}% Used
                        </div>
                    </div>

                    <div>
                        <h3 className="text-4xl font-bold text-white mb-1">
                            {stats.activeCount} <span className="text-2xl text-gray-600 font-normal">/ {stats.usageLimit > 1000 ? "∞" : stats.usageLimit}</span>
                        </h3>
                        <p className="text-gray-400 text-sm font-medium">Quota Usage</p>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-6 w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.percentage}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn(
                                "h-full rounded-full relative",
                                stats.percentage >= 90
                                    ? "bg-gradient-to-r from-red-500 to-orange-500"
                                    : "bg-gradient-to-r from-[#00D1FF] to-[#5865F2]"
                            )}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                        </motion.div>
                    </div>
                </motion.div>
            </motion.div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Link href="/dashboard/expert" className="group relative p-8 rounded-3xl bg-gradient-to-br from-[#161B2B] to-[#0B0F1A] border border-white/5 hover:border-[#00D1FF]/30 transition-all duration-300 overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#00D1FF]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-[#00D1FF]/10 transition-colors" />

                    <div className="relative z-10">
                        <div className="w-14 h-14 rounded-2xl bg-[#161B2B] border border-white/5 flex items-center justify-center mb-6 text-[#00D1FF] shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                            <Shield className="w-7 h-7" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Expert Mode</h3>
                        <p className="text-gray-400 mb-8 max-w-sm text-sm leading-relaxed">
                            Configure advanced mirroring using User Tokens. This method bypasses typical bot restrictions and admin requirements.
                        </p>
                        <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00D1FF]/10 text-[#00D1FF] font-bold text-sm border border-[#00D1FF]/20 group-hover:bg-[#00D1FF] group-hover:text-black transition-all">
                            Launch Expert Mode <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                    </div>
                </Link>

                <Link href="/dashboard/official" className="group relative p-8 rounded-3xl bg-gradient-to-br from-[#161B2B] to-[#0B0F1A] border border-white/5 hover:border-[#5865F2]/30 transition-all duration-300 overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#5865F2]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-[#5865F2]/10 transition-colors" />

                    <div className="relative z-10">
                        <div className="w-14 h-14 rounded-2xl bg-[#161B2B] border border-white/5 flex items-center justify-center mb-6 text-[#5865F2] shadow-lg group-hover:scale-110 group-hover:-rotate-3 transition-all duration-300">
                            <Bot className="w-7 h-7" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Official Bot</h3>
                        <p className="text-gray-400 mb-8 max-w-sm text-sm leading-relaxed">
                            The verified way to mirror channels using Discord's official API. Requires Admin permissions on the source server.
                        </p>
                        <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5865F2]/10 text-[#5865F2] font-bold text-sm border border-[#5865F2]/20 group-hover:bg-[#5865F2] group-hover:text-white transition-all">
                            Open Bot Panel <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                    </div>
                </Link>
            </div>

            {/* Recent Activity */}
            <div className="obsidian-card rounded-3xl overflow-hidden">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-bold text-white flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-[#5865F2]/20 text-[#5865F2]">
                            <Clock className="w-4 h-4" />
                        </div>
                        Recent Activity
                    </h3>
                    <Link href="/dashboard/expert" className="px-3 py-1.5 rounded-lg hover:bg-white/5 text-xs font-bold text-gray-400 hover:text-white transition-colors">
                        View All
                    </Link>
                </div>

                {recentConfigs.length === 0 ? (
                    <div className="p-12 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <Activity className="w-6 h-6 text-gray-500" />
                        </div>
                        <h4 className="text-gray-300 font-bold mb-1">No Activity Yet</h4>
                        <p className="text-gray-500 text-sm max-w-xs">Start by creating your first mirror configuration in Expert or Official mode.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#0B0F1A]/50 text-gray-500 text-xs uppercase tracking-wider font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Source Server</th>
                                    <th className="px-6 py-4">Target Webhook</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {recentConfigs.map((config) => (
                                    <tr key={config.id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4 font-medium text-white">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-[#161B2B] border border-white/5 flex items-center justify-center text-xs font-bold text-gray-400 group-hover:text-white group-hover:border-white/10 transition-colors">
                                                    {config.sourceGuildName?.[0] || "?"}
                                                </div>
                                                <span className="truncate max-w-[150px]">{config.sourceGuildName || "Unknown"}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-400 font-mono text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" />
                                                {maskWebhook(config.targetWebhookUrl)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {config.active ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                    </span>
                                                    <span className="text-emerald-400 text-xs font-bold">Active</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-gray-600" />
                                                    <span className="text-gray-500 text-xs font-bold">Paused</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-500 text-xs font-mono">
                                            {format(new Date(config.createdAt), "MMM d, yyyy")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
