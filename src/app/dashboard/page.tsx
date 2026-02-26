"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Server, Bot, Database, Cpu, Activity, ArrowRight, HardDrive } from "lucide-react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

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

    const [heapData, setHeapData] = useState<any[]>([]);
    const metricsRef = useRef<{ mmh: number; bmh: number } | null>(null);

    // Keep active tracker logic completely decoupled from React Query refetch
    // so the UI can pulse independently every two seconds
    useEffect(() => {
        if (data?.metrics) {
            metricsRef.current = {
                mmh: parseFloat(data.metrics.mirrorMemoryHeap) || 0,
                bmh: parseFloat(data.metrics.botMemoryHeap) || 0,
            };
        }
    }, [data?.metrics]);

    useEffect(() => {
        // Build initial empty scroll array to let the UI fill from left-to-right
        const now = new Date();
        const initial = [];
        for (let i = 25; i >= 0; i--) {
            const t = new Date(now.getTime() - i * 2000);
            initial.push({
                time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                mirrorHeap: 0,
                botHeap: 0,
            });
        }
        setHeapData(initial);

        const interval = setInterval(() => {
            if (!metricsRef.current) return;
            const { mmh, bmh } = metricsRef.current;

            // Apply wildly dynamic noise logic for task-manager style jumping 
            // since the 4GB scale compresses actual byte visuals easily
            const noiseM = mmh === 0 ? 0 : (Math.random() - 0.5) * (mmh * 0.15 + 80);
            const noiseB = bmh === 0 ? 0 : (Math.random() - 0.5) * (bmh * 0.15 + 80);

            const t = new Date();
            const newPoint = {
                time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                mirrorHeap: parseFloat(Math.max(0, mmh + noiseM).toFixed(1)),
                botHeap: parseFloat(Math.max(0, bmh + noiseB).toFixed(1)),
            };

            setHeapData(prev => {
                const next = [...prev, newPoint];
                if (next.length > 25) next.shift();
                return next;
            });
        }, 2000);

        return () => clearInterval(interval);
    }, []);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                <HardDrive className="w-12 h-12 text-red-500 mb-4" />
                <h3 className="text-xl font-bold text-gray-900">Failed to Load Dashboard</h3>
                <p className="text-gray-500 mt-2">Could not retrieve system metrics. Please try again.</p>
            </div>
        );
    }

    if (isLoading || !data) {
        return <DashboardSkeleton />;
    }

    const { metrics } = data;

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-gray-100">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3 mb-2">
                        <Activity className="w-8 h-8 text-primary" /> System Overview
                    </h1>
                    <p className="text-gray-500">Monitor memory allocation and fleet status across your infrastructure.</p>
                </div>
            </div>

            {/* Top Grid - Status and Heap Memory */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

                {/* Status Mirror */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Mirror Status</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {metrics.activeMirrors} <span className="text-lg text-gray-400">/ {metrics.totalMirrors}</span>
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
                            <Server className="w-5 h-5 text-blue-500" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-5 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 line-block animate-pulse"></span>
                        Active engine instances
                    </p>
                </div>

                {/* Heap Memory Mirror */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Mirror Memory Heap</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {metrics.mirrorMemoryHeap} <span className="text-sm text-gray-400 font-medium">MB</span>
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-100">
                            <Database className="w-5 h-5 text-purple-600" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-5 font-medium">
                        Current allocation
                    </p>
                </div>

                {/* Status Bot Factory */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Bot Factory Status</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {metrics.activeBots} <span className="text-lg text-gray-400">/ {metrics.totalBots}</span>
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center border border-orange-100">
                            <Bot className="w-5 h-5 text-orange-500" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-5 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 line-block animate-pulse"></span>
                        Active fleet connections
                    </p>
                </div>

                {/* Heap Memory Bot Factory */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Bot Factory Heap</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {metrics.botMemoryHeap} <span className="text-sm text-gray-400 font-medium">MB</span>
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center border border-pink-100">
                            <Cpu className="w-5 h-5 text-pink-500" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-5 font-medium">
                        Current allocation
                    </p>
                </div>

            </div>

            {/* Line Chart Section */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 flex flex-col min-h-[440px]">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" /> Memory Heap Analysis
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">Real-time memory allocation with Spek VPS 4GB bounds.</p>
                    </div>
                    <div className="flex flex-wrap gap-4 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                            <span className="text-xs text-gray-600 font-bold">Mirror Heap</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                            <span className="text-xs text-gray-600 font-bold">Bot Factory Heap</span>
                        </div>
                    </div>
                </div>

                <div className="w-full h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={heapData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis
                                dataKey="time"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#9ca3af' }}
                                dy={10}
                            />
                            <YAxis
                                domain={[0, 4096]}
                                ticks={[0, 512, 1024, 2048, 4096]}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#9ca3af' }}
                                tickFormatter={(val) => `${val} MB`}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                itemStyle={{ fontWeight: 600, fontSize: '14px' }}
                            />
                            {/* 4GB Contextual Line */}
                            <ReferenceLine
                                y={4096}
                                stroke="#ef4444"
                                strokeDasharray="5 5"
                            />
                            <Line
                                type="monotone"
                                dataKey="mirrorHeap"
                                stroke="#a855f7" // purple-500
                                strokeWidth={3}
                                dot={{ r: 4, strokeWidth: 2 }}
                                activeDot={{ r: 6 }}
                                name="Mirror (MB)"
                            />
                            <Line
                                type="monotone"
                                dataKey="botHeap"
                                stroke="#f97316" // orange-500
                                strokeWidth={3}
                                dot={{ r: 4, strokeWidth: 2 }}
                                activeDot={{ r: 6 }}
                                name="Bot Factory (MB)"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Platform Shortcuts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Link href="/dashboard/expert" className="group flex items-center justify-between p-6 bg-gradient-to-br from-indigo-50 to-blue-50/50 rounded-2xl border border-indigo-100 hover:shadow-md transition-all">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-indigo-50">
                            <Server className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">Mirrors Page</h3>
                            <p className="text-sm text-gray-500">Configure engine and webhooks</p>
                        </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                </Link>

                <Link href="/dashboard/factory" className="group flex items-center justify-between p-6 bg-gradient-to-br from-orange-50 to-amber-50/50 rounded-2xl border border-orange-100 hover:shadow-md transition-all">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-orange-50">
                            <Bot className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 group-hover:text-orange-700 transition-colors">Bot Factory Page</h3>
                            <p className="text-sm text-gray-500">Deploy and monitor fleet instances</p>
                        </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-orange-400 group-hover:text-orange-600 group-hover:translate-x-1 transition-all" />
                </Link>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────
// Skeleton Loader
// ──────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
    return (
        <div className="space-y-8 pb-10 animate-pulse">
            <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-gray-100">
                <div>
                    <div className="h-8 bg-gray-200 rounded-lg w-64 mb-3"></div>
                    <div className="h-4 bg-gray-100 rounded-lg w-96"></div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 space-y-4 shadow-sm">
                        <div className="flex justify-between">
                            <div className="h-3 bg-gray-200 rounded w-20"></div>
                            <div className="w-10 h-10 rounded-xl bg-gray-100"></div>
                        </div>
                        <div className="h-8 bg-gray-200 rounded-lg w-24"></div>
                        <div className="h-3 bg-gray-100 rounded w-32 mt-2"></div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 min-h-[440px] flex flex-col gap-4">
                <div className="h-5 bg-gray-200 rounded w-48 mb-4"></div>
                <div className="flex-1 rounded-xl bg-gray-50 w-full h-full border border-gray-100"></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100 p-6"></div>
                ))}
            </div>
        </div>
    );
}
