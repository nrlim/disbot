"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Users, Cpu, Activity, Trophy, Shield, Bot, Server, Clock } from "lucide-react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const fetchOverview = async () => {
    const res = await fetch("/api/dashboard/overview");
    if (!res.ok) throw new Error("Failed to fetch dashboard overview");
    return res.json();
};

export default function DashboardPage() {
    const { data, isLoading, error } = useQuery({
        queryKey: ["dashboardOverview"],
        queryFn: fetchOverview,
        refetchInterval: 60000, // Background refresh every 60s
    });

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                <Shield className="w-12 h-12 text-red-500 mb-4" />
                <h3 className="text-xl font-bold text-gray-900">Failed to Load Dashboard</h3>
                <p className="text-gray-500 mt-2">Could not retrieve system metrics. Please try again.</p>
            </div>
        );
    }

    if (isLoading || !data) {
        return <DashboardSkeleton />;
    }

    const { metrics, recentLogs, growthData } = data;

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-10">
            {/* Header / Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-gray-100">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3 mb-2">
                        <Activity className="w-8 h-8 text-primary" /> Engineering Overview
                    </h1>
                    <p className="text-gray-500">Real-time pulse of your Bot infrastructure & Economy ecosystem.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full sm:w-auto">
                    <Link href="/dashboard/factory" className="w-full sm:w-auto px-4 py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors shadow-sm flex items-center justify-center gap-2">
                        <Plus className="w-4 h-4" /> Add Bot
                    </Link>
                    <button className="w-full sm:w-auto px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl font-bold hover:bg-blue-100 transition-colors shadow-sm flex items-center justify-center gap-2">
                        <Clock className="w-4 h-4" /> Expiry
                    </button>
                    <button className="w-full sm:w-auto px-4 py-2.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl font-bold hover:bg-gray-100 transition-colors shadow-sm flex items-center justify-center gap-2">
                        <Shield className="w-4 h-4" /> Settings
                    </button>
                </div>
            </div>

            {/* Top Metrics Grid (Mobile First layout: 1 col on mobile, 4 on large) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

                {/* Active Mirrors Element */}
                <div className="sticky top-0 z-10 sm:static bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 shadow-lg shadow-gray-900/10 border border-gray-800 text-white relative overflow-hidden">
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-primary/20 rounded-full blur-2xl"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Mirror Engines</p>
                            <h3 className="text-2xl font-bold">{metrics.activeMirrors} <span className="text-gray-500 text-lg">/ {metrics.totalMirrors}</span></h3>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                            <Server className="w-5 h-5 text-green-400" />
                        </div>
                    </div>
                    <div className="mt-4 relative z-10">
                        <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${metrics.totalMirrors > 0 ? (metrics.activeMirrors / metrics.totalMirrors) * 100 : 0}%` }}></div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 font-medium">Synced webhooks active</p>
                    </div>
                </div>

                {/* Bot Instances */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Fleet Health</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {metrics.activeBots} <span className="text-gray-400 text-lg">/ {metrics.totalBots}</span>
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
                            <Bot className="w-5 h-5 text-blue-500" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-5 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 line-block animate-pulse"></span>
                        Active Client Connections
                    </p>
                </div>

                {/* Mirror Telemetry */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Mirror Heap</p>
                            <h3 className="text-2xl font-bold text-gray-900">{metrics.mirrorMemoryHeap} <span className="text-sm text-gray-400 font-medium">MB</span></h3>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-100">
                            <Activity className="w-5 h-5 text-purple-600" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-5 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 line-block animate-pulse"></span>
                        Relaying <span className="text-green-600 font-bold">{metrics.totalMessages.toLocaleString()}</span> active messages
                    </p>
                </div>

                {/* Bot Telemetry */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Bot Heap</p>
                            <h3 className="text-2xl font-bold text-gray-900">{metrics.botMemoryHeap} <span className="text-sm text-gray-400 font-medium">MB</span></h3>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center border border-orange-100">
                            <Cpu className="w-5 h-5 text-orange-500" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-5 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 line-block animate-pulse"></span>
                        Stable baseline allocation
                    </p>
                </div>

            </div>

            {/* Bottom Section: Chart & Activity Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Analytics Chart (Spans 2 columns on Desktop) */}
                <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm p-6 flex flex-col min-h-[400px]">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Cpu className="w-4 h-4 text-primary" /> Traffic & Points Distribution
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">7-Day volumetric analysis.</p>
                        </div>
                    </div>

                    <div className="flex-1 w-full h-full min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={growthData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    itemStyle={{ fontWeight: 600, fontSize: '14px' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="points"
                                    stroke="var(--primary)"
                                    strokeWidth={3}
                                    dot={{ r: 4, strokeWidth: 2 }}
                                    activeDot={{ r: 6 }}
                                    name="Loyalty Points"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="messages"
                                    stroke="#cbd5e1"
                                    strokeWidth={3}
                                    dot={false}
                                    name="Mirrored Messages"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Activity Feed */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col">
                    <div className="p-5 border-b border-gray-50 bg-gray-50/50 rounded-t-2xl">
                        <h3 className="font-bold text-gray-900 text-sm">System Logs</h3>
                    </div>
                    <div className="flex-1 p-5 overflow-y-auto max-h-[400px]">
                        <ul className="space-y-5">
                            {recentLogs.map((log: any) => (
                                <li key={log.id} className="relative pl-6 pb-2 border-l-2 border-gray-100 last:border-0 last:pb-0">
                                    <div className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full border-2 border-white ${log.type === 'activity' ? 'bg-indigo-400' :
                                        log.type === 'system' ? 'bg-primary' : 'bg-gray-400'
                                        }`}></div>
                                    <p className="text-sm text-gray-800 font-medium leading-tight">{log.action}</p>
                                    <p className="text-xs text-gray-500 leading-tight mt-0.5">{log.details}</p>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1 block">{log.time}</span>
                                </li>
                            ))}
                        </ul>
                        {recentLogs.length === 0 && (
                            <div className="text-center py-10 text-gray-400 text-sm">
                                <Activity className="w-8 h-8 mx-auto text-gray-200 mb-2" />
                                No recent activity
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────
// Skeleton Loader for initial fetch
// ──────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
    return (
        <div className="space-y-8 pb-10 animate-pulse">
            <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-gray-100">
                <div>
                    <div className="h-8 bg-gray-200 rounded-lg w-64 mb-3"></div>
                    <div className="h-4 bg-gray-100 rounded-lg w-96"></div>
                </div>
                <div className="flex gap-3">
                    <div className="h-10 bg-gray-200 rounded-xl w-32"></div>
                    <div className="h-10 bg-gray-100 rounded-xl w-32 hidden sm:block"></div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 space-y-4">
                        <div className="flex justify-between">
                            <div className="h-3 bg-gray-200 rounded w-20"></div>
                            <div className="w-10 h-10 rounded-xl bg-gray-100"></div>
                        </div>
                        <div className="h-8 bg-gray-200 rounded-lg w-24"></div>
                        <div className="h-3 bg-gray-100 rounded w-32"></div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 min-h-[400px] flex flex-col gap-4">
                    <div className="h-5 bg-gray-200 rounded w-48"></div>
                    <div className="flex-1 rounded-xl bg-gray-50 w-full h-full"></div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-6 min-h-[400px] flex flex-col gap-6">
                    <div className="h-5 bg-gray-200 rounded w-32"></div>
                    <div className="space-y-6">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex gap-4">
                                <div className="w-2 h-2 rounded-full bg-gray-300 mt-1"></div>
                                <div className="space-y-2 flex-1">
                                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                                    <div className="h-2 bg-gray-100 rounded w-16"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
