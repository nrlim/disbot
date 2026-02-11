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
    Terminal,
    Cpu,
    Database,
    Hash
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
                staggerChildren: 0.05
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 }
    };

    const maskWebhook = (url: string) => {
        try {
            const parts = url.split("/");
            const id = parts[5] || "...";
            return `.../${id.substring(0, 8)}/••••`;
        } catch (e) {
            return "Invalid URL";
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-800 pb-6">
                <div>
                    <h1 className="text-2xl font-mono font-bold text-white mb-2 uppercase tracking-tight flex items-center gap-3">
                        <Terminal className="w-6 h-6 text-primary" />
                        Command Center
                    </h1>
                    <p className="text-zinc-400 text-sm font-mono">System Status & Control Grid</p>
                </div>
                <div className="flex items-center gap-3 px-3 py-1.5 bg-emerald-950/30 border border-emerald-900/50">
                    <div className="w-2 h-2 bg-emerald-500 animate-pulse rounded-none" />
                    <span className="text-xs font-mono font-bold text-emerald-500 uppercase tracking-widest">System Online</span>
                </div>
            </div>

            {/* Bento Grid */}
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-4 gap-4"
            >
                {/* Active Mirrors - Large Card */}
                <motion.div variants={item} className="md:col-span-2 md:row-span-1 p-6 bg-zinc-950 border border-zinc-800 relative group overflow-hidden">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-20" />
                    <div className="absolute top-0 right-0 p-2 opacity-50">
                        <Activity className="w-12 h-12 text-zinc-800 group-hover:text-primary/20 transition-colors" />
                    </div>

                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div>
                            <div className="flex items-center gap-2 mb-4 text-zinc-500 text-xs font-mono uppercase tracking-widest">
                                <Cpu className="w-3.5 h-3.5" />
                                Active Processes
                            </div>
                            <div className="text-5xl font-mono font-bold text-white tracking-tighter">
                                {stats.activeCount.toString().padStart(2, '0')}
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-zinc-900 flex items-center gap-2">
                            <span className="text-xs font-mono text-emerald-500 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-emerald-500" />
                                OPERATIONAL
                            </span>
                        </div>
                    </div>
                </motion.div>

                {/* Plan Status */}
                <motion.div variants={item} className="md:col-span-1 p-6 bg-zinc-950 border border-zinc-800 relative group">
                    <div className="flex flex-col h-full justify-between">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-zinc-500 text-xs font-mono uppercase tracking-widest">Tier</span>
                            <Zap className="w-4 h-4 text-amber-500" />
                        </div>
                        <div>
                            <div className="text-2xl font-mono font-bold text-white mb-1">{stats.planName}</div>
                            <div className="w-full bg-zinc-900 h-1 mt-2">
                                <div className="bg-amber-500 h-1" style={{ width: '60%' }} />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Quota Usage */}
                <motion.div variants={item} className="md:col-span-1 p-6 bg-zinc-950 border border-zinc-800 relative group">
                    <div className="flex flex-col h-full justify-between gap-4">
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-500 text-xs font-mono uppercase tracking-widest">Capacity</span>
                            <Database className="w-4 h-4 text-primary" />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs font-mono text-zinc-400">
                                <span>USED</span>
                                <span className={stats.percentage > 90 ? "text-red-500" : "text-primary"}>
                                    {Math.round(stats.percentage)}%
                                </span>
                            </div>
                            <div className="w-full bg-zinc-900 h-1.5 border border-zinc-800">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${stats.percentage}%` }}
                                    className={cn(
                                        "h-full",
                                        stats.percentage > 90 ? "bg-red-500" : "bg-primary"
                                    )}
                                />
                            </div>
                            <div className="text-[10px] font-mono text-zinc-600 text-right mt-1">
                                {stats.activeCount} / {stats.usageLimit > 1000 ? "UNL" : stats.usageLimit}
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Actions Row */}
                <motion.div variants={item} className="md:col-span-2 p-0 bg-transparent grid grid-cols-2 gap-4">
                    <Link href="/dashboard/expert" className="group rounded-none bg-zinc-900/50 border border-zinc-800 p-5 hover:bg-zinc-900 hover:border-primary/50 transition-all flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                            <Shield className="w-6 h-6 text-zinc-400 group-hover:text-primary transition-colors" />
                            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-primary -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                        </div>
                        <div className="mt-4">
                            <h3 className="font-mono font-bold text-white text-sm uppercase">Expert Mode</h3>
                            <p className="text-xs text-zinc-500 mt-1 font-mono">User Token Mirroring</p>
                        </div>
                    </Link>

                    <Link href="/dashboard/official" className="group rounded-none bg-zinc-900/50 border border-zinc-800 p-5 hover:bg-zinc-900 hover:border-indigo-500/50 transition-all flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                            <Bot className="w-6 h-6 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
                            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-indigo-500 -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                        </div>
                        <div className="mt-4">
                            <h3 className="font-mono font-bold text-white text-sm uppercase">Official Bot</h3>
                            <p className="text-xs text-zinc-500 mt-1 font-mono">Verified API Mirroring</p>
                        </div>
                    </Link>
                </motion.div>

                {/* Recent Activity Table - Spans remaining width */}
                <motion.div variants={item} className="md:col-span-4 bg-zinc-950 border border-zinc-800 mt-2">
                    <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                        <h3 className="text-sm font-mono font-bold text-zinc-300 flex items-center gap-2 uppercase tracking-wider">
                            <Clock className="w-4 h-4 text-zinc-500" />
                            System Logs
                        </h3>
                        <Link href="/dashboard/expert" className="text-[10px] font-mono font-bold text-primary hover:text-primary/80 uppercase">
                            View All Logs
                        </Link>
                    </div>

                    {recentConfigs.length === 0 ? (
                        <div className="p-12 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 border border-zinc-800 bg-zinc-900 flex items-center justify-center mb-4">
                                <Hash className="w-5 h-5 text-zinc-600" />
                            </div>
                            <h4 className="text-zinc-300 font-mono font-bold text-sm mb-1 uppercase">No Data</h4>
                            <p className="text-zinc-600 text-xs font-mono">Initialize mirror protocol to generate logs.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm font-mono text-zinc-400">
                                <thead className="bg-zinc-900/50 text-xs uppercase tracking-wider text-zinc-500">
                                    <tr>
                                        <th className="px-6 py-3 font-normal">Source ID</th>
                                        <th className="px-6 py-3 font-normal">Target</th>
                                        <th className="px-6 py-3 font-normal">State</th>
                                        <th className="px-6 py-3 font-normal text-right">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50">
                                    {recentConfigs.map((config) => (
                                        <tr key={config.id} className="group hover:bg-zinc-900/30 transition-colors">
                                            <td className="px-6 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-6 h-6 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] text-zinc-500">
                                                        {config.sourceGuildName?.[0] || "?"}
                                                    </div>
                                                    <span className="text-zinc-300">{config.sourceGuildName || "Unknown"}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 text-xs text-zinc-500">
                                                {maskWebhook(config.targetWebhookUrl)}
                                            </td>
                                            <td className="px-6 py-3.5">
                                                {config.active ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-950/30 border border-emerald-900/50 text-emerald-500 text-[10px] uppercase font-bold tracking-wider">
                                                        <div className="w-1 h-1 bg-emerald-500" />
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800/50 border border-zinc-700 text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
                                                        <div className="w-1 h-1 bg-zinc-500" />
                                                        Idle
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3.5 text-right text-xs text-zinc-600">
                                                {format(new Date(config.createdAt), "yyyy-MM-dd HH:mm")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </div>
    );
}
