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
    Hash,
    Plus,
    LayoutGrid,
    Search
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ComingSoonModal from "@/components/ComingSoonModal";
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
    const [isComingSoonOpen, setIsComingSoonOpen] = useState(false);

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
        <div className="max-w-7xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-8">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-200">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
                        Dashboard
                    </h1>
                    <p className="text-gray-500 text-sm font-medium">Manage your mirroring services and configurations.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full border border-green-200 shadow-sm">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-semibold uppercase tracking-wide">System Operational</span>
                    </div>
                </div>
            </div>

            {/* Bento Grid */}
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-4 gap-6"
            >
                {/* Active Mirrors - Large Card */}
                <motion.div variants={item} className="md:col-span-2 md:row-span-1 p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-50 bg-gray-50 rounded-bl-xl border-l border-b border-gray-100">
                        <Activity className="w-6 h-6 text-gray-400 group-hover:text-primary transition-colors" />
                    </div>

                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-primary font-semibold text-xs uppercase tracking-wide">
                                <Cpu className="w-4 h-4" />
                                Active Processes
                            </div>
                            <div className="text-5xl font-bold text-gray-900 tracking-tight">
                                {stats.activeCount.toString()}
                            </div>
                        </div>

                        <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-500 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                All services are running smoothly
                            </span>
                            <Link href="/dashboard/expert" className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
                                View Details <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>
                </motion.div>

                {/* Plan Status */}
                <motion.div variants={item} className="md:col-span-1 p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="flex flex-col h-full justify-between relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-500" />
                                Current Plan
                            </span>
                            {stats.planName !== "ELITE" && (
                                <Link
                                    href="/dashboard/settings"
                                    className="text-xs font-semibold text-primary bg-primary/5 px-2 py-1 rounded-md hover:bg-primary/10 transition-colors"
                                >
                                    Upgrade
                                </Link>
                            )}
                        </div>
                        <div>
                            <div className={cn(
                                "text-3xl font-bold text-gray-900 mb-2 tracking-tight",
                                stats.planName === "STARTER" && "text-emerald-600",
                                stats.planName === "PRO" && "text-blue-600",
                                stats.planName === "ELITE" && "text-purple-600",
                                stats.planName === "FREE" && "text-gray-700"
                            )}>
                                {stats.planName}
                            </div>

                            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-3">
                                <Server className="w-3.5 h-3.5 text-gray-400" />
                                <span>
                                    {stats.usageLimit === 9999 ? "Unlimited Nodes" : `${stats.usageLimit} Max Nodes`}
                                </span>
                            </div>

                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${stats.percentage}%` }}
                                    className={cn(
                                        "h-full rounded-full transition-all duration-700 ease-out",
                                        stats.planName === "STARTER" && "bg-emerald-500",
                                        stats.planName === "PRO" && "bg-blue-500",
                                        stats.planName === "ELITE" && "bg-purple-500",
                                        stats.planName === "FREE" && "bg-amber-500"
                                    )}
                                />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Quota Usage */}
                <motion.div variants={item} className="md:col-span-1 p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow relative group">
                    <div className="flex flex-col h-full justify-between gap-4">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Capacity</span>
                            <Database className="w-5 h-5 text-gray-400" />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-medium text-gray-500">
                                <span>Usage</span>
                                <span className={stats.percentage > 90 ? "text-red-600 font-bold" : "text-primary font-bold"}>
                                    {Math.round(stats.percentage)}%
                                </span>
                            </div>
                            <div className="w-full bg-gray-100 h-2 rounded-full border border-gray-100 overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${stats.percentage}%` }}
                                    className={cn(
                                        "h-full rounded-full transition-all duration-700 ease-out",
                                        stats.percentage > 90 ? "bg-red-500" : "bg-primary"
                                    )}
                                />
                            </div>
                            <div className="text-xs font-medium text-gray-500 text-right mt-1">
                                {stats.activeCount} used of {stats.usageLimit > 1000 ? "Use Limit" : stats.usageLimit} available
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Actions Row */}
                <motion.div variants={item} className="md:col-span-2 p-0 bg-transparent flex gap-4">
                    <Link href="/dashboard/expert" className="flex-1 group bg-white border border-gray-200 p-5 rounded-xl hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-2">
                            <div className="p-2 bg-blue-50 text-primary rounded-lg">
                                <Terminal className="w-5 h-5" />
                            </div>
                            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm">Create New Mirror</h3>
                            <p className="text-xs text-gray-500 mt-1">Configure a new source to target mapping.</p>
                        </div>
                    </Link>

                    <Link
                        href="/dashboard/official"
                        onClick={(e) => { e.preventDefault(); setIsComingSoonOpen(true); }}
                        className="flex-1 group bg-white border border-gray-200 p-5 rounded-xl hover:border-indigo-500/50 hover:shadow-md transition-all flex flex-col justify-between"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                <Bot className="w-5 h-5" />
                            </div>
                            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm">Managed Bot</h3>
                            <p className="text-xs text-gray-500 mt-1">Add a verified bot to your server.</p>
                        </div>
                    </Link>
                </motion.div>

                {/* Recent Activity Table - Spans remaining width */}
                <motion.div variants={item} className="md:col-span-4 bg-white border border-gray-200 rounded-xl shadow-sm mt-4 overflow-hidden">
                    <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            Recent Activity Logs
                        </h3>
                        <Link href="/dashboard/expert" className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                            View All Logs
                        </Link>
                    </div>

                    {recentConfigs.length === 0 ? (
                        <div className="p-16 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <Hash className="w-6 h-6 text-gray-400" />
                            </div>
                            <h4 className="text-gray-900 font-bold text-sm mb-1">No Activity Yet</h4>
                            <p className="text-gray-500 text-xs max-w-xs mx-auto">Initialize a mirror protocol to start generating logs and tracking activity.</p>
                            <Link href="/dashboard/expert" className="mt-4 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors">
                                Create Config
                            </Link>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-600">
                                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold">Source ID</th>
                                        <th className="px-6 py-4 font-semibold">Destination</th>
                                        <th className="px-6 py-4 font-semibold">Status</th>
                                        <th className="px-6 py-4 font-semibold text-right">Date Created</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {recentConfigs.map((config) => (
                                        <tr key={config.id} className="group hover:bg-gray-50/80 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 shadow-sm">
                                                        {config.sourceGuildName?.[0] || "?"}
                                                    </div>
                                                    <span className="font-medium text-gray-900">{config.sourceGuildName || "Unknown Source"}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs font-mono text-gray-500">
                                                {maskWebhook(config.targetWebhookUrl)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {config.active ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">
                                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium border border-gray-200">
                                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                                        Idle
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right text-xs text-gray-500">
                                                {format(new Date(config.createdAt), "MMM dd, yyyy HH:mm")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            </motion.div>
            <ComingSoonModal isOpen={isComingSoonOpen} onClose={() => setIsComingSoonOpen(false)} featureName="Managed Bot" />
        </div >
    );
}
