"use client";

import { Bot, CheckCircle2, ShieldCheck, ExternalLink, Terminal, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OfficialBotDashboard() {
    const clientId = process.env.DISCORD_CLIENT_ID;

    return (
        <div className="max-w-7xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-8">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b border-gray-200">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded w-fit">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-widest">System Mode: Managed</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                        Managed Integration
                    </h1>
                    <p className="text-gray-500 text-sm max-w-2xl">
                        Standard protocol mirroring via Discord API.
                        <span className="text-gray-700 font-semibold ml-2">100% Compliant.</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Info Card */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 relative overflow-hidden group">

                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-6">
                                <h2 className="text-2xl font-bold text-gray-900">DISBOT Protocol</h2>
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1.5 rounded flex items-center gap-1.5 uppercase tracking-wider">
                                    <CheckCircle2 className="w-3 h-3" /> Secure Connection
                                </span>
                            </div>

                            <div className="text-sm text-gray-600 space-y-4 mb-8 border-l-4 border-gray-200 pl-4">
                                <p>
                                    Initializing verified bot sequence...
                                </p>
                                <p>
                                    This module utilizes the official Discord API gateway for message replication.
                                    Ensures zero-risk of account suspension and full TOS compliance.
                                </p>
                                <p className="text-gray-500 italic">
                                    Requisite: <span className="text-gray-900 font-semibold">Manage Server</span> permissions on target guild.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <a
                                    href={`https://discord.com/oauth2/authorize?client_id=${clientId || "YOUR_CLIENT_ID"}&permissions=536870912&scope=bot%20applications.commands`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-6 py-3 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"
                                >
                                    <Bot className="w-5 h-5" />
                                    Initiate Auth Sequence
                                    <ExternalLink className="w-4 h-4 ml-1 opacity-70" />
                                </a>
                                <button disabled className="px-6 py-3 bg-gray-50 border border-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed flex items-center justify-center gap-2">
                                    <Terminal className="w-4 h-4" />
                                    Read Documentation
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 bg-white border border-gray-200 rounded-xl hover:border-emerald-200 hover:shadow-md transition-all group">
                            <div className="mb-4 text-emerald-500 bg-emerald-50 w-12 h-12 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <h3 className="text-gray-900 font-bold text-sm uppercase mb-2">Verified Security</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Audited codebase. End-to-end encryption for all transmitted payloads.
                            </p>
                        </div>
                        <div className="p-6 bg-white border border-gray-200 rounded-xl hover:border-blue-200 hover:shadow-md transition-all group">
                            <div className="mb-4 text-blue-500 bg-blue-50 w-12 h-12 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Zap className="w-6 h-6" />
                            </div>
                            <h3 className="text-gray-900 font-bold text-sm uppercase mb-2">High Availability</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Enterprise-grade infrastructure. 99.9% uptime SLA guarantee on all nodes.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Sidebar / Steps */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 h-fit">
                    <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-3 uppercase text-sm border-b border-gray-100 pb-4">
                        <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs font-bold text-gray-500">01</div>
                        Initialization Protocol
                    </h3>

                    <div className="space-y-8 relative pl-2">
                        {/* Connecting Line */}
                        <div className="absolute left-[11px] top-2 bottom-4 w-[2px] bg-gray-100" />

                        <div className="relative flex gap-4 group">
                            <div className="w-6 h-6 bg-white border-2 border-gray-300 group-hover:border-primary transition-colors rounded-full flex items-center justify-center shrink-0 z-10">
                                <div className="w-2 h-2 bg-gray-300 group-hover:bg-primary transition-colors rounded-full" />
                            </div>
                            <div className="-mt-1">
                                <h4 className="text-gray-900 font-bold text-sm mb-1 group-hover:text-primary transition-colors">Authorize Bot</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Authenticate DISBOT application via OAuth2 gateway.
                                </p>
                            </div>
                        </div>

                        <div className="relative flex gap-4 group">
                            <div className="w-6 h-6 bg-white border-2 border-gray-300 group-hover:border-cyan-500 transition-colors rounded-full flex items-center justify-center shrink-0 z-10">
                                <div className="w-2 h-2 bg-gray-300 group-hover:bg-cyan-500 transition-colors rounded-full" />
                            </div>
                            <div className="-mt-1">
                                <h4 className="text-gray-900 font-bold text-sm mb-1 group-hover:text-cyan-600 transition-colors">Execute Command</h4>
                                <p className="text-xs text-gray-500 leading-relaxed mb-2">
                                    Inject command payload:
                                </p>
                                <div className="bg-gray-900 rounded-md p-2 flex items-center gap-2 shadow-sm">
                                    <Terminal className="w-3 h-3 text-cyan-400" />
                                    <code className="text-cyan-400 font-mono text-xs">/setup mirror</code>
                                </div>
                            </div>
                        </div>

                        <div className="relative flex gap-4 group">
                            <div className="w-6 h-6 bg-white border-2 border-gray-300 group-hover:border-emerald-500 transition-colors rounded-full flex items-center justify-center shrink-0 z-10">
                                <div className="w-2 h-2 bg-gray-300 group-hover:bg-emerald-500 transition-colors rounded-full" />
                            </div>
                            <div className="-mt-1">
                                <h4 className="text-gray-900 font-bold text-sm mb-1 group-hover:text-emerald-600 transition-colors">Configure Node</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Select input/output channels via interactive terminal.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
