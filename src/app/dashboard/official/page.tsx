"use client";

import { Bot, CheckCircle2, ShieldCheck, ExternalLink, Server, Terminal, Activity, Zap } from "lucide-react";
import Image from "next/image";

export default function OfficialBotDashboard() {
    const clientId = process.env.DISCORD_CLIENT_ID;

    return (
        <div className="max-w-7xl mx-auto space-y-8">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b border-zinc-800">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-500">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-xs font-mono font-bold uppercase tracking-widest">System Mode: Managed</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight uppercase font-mono">
                        Managed Integration
                    </h1>
                    <p className="text-zinc-500 font-mono text-sm max-w-2xl">
                        Standard protocol mirroring via Discord API.
                        <span className="text-zinc-400 ml-2">100% Compliant.</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Info Card */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-zinc-950 border border-zinc-800 p-8 relative overflow-hidden group">

                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-6">
                                <h2 className="text-2xl font-bold text-white font-mono uppercase">DISBOT Protocol</h2>
                                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold px-2 py-1 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                                    <CheckCircle2 className="w-3 h-3" /> Secure Connection
                                </span>
                            </div>

                            <div className="font-mono text-sm text-zinc-400 space-y-4 mb-8 border-l-2 border-zinc-800 pl-4">
                                <p>
                                    Initializing verified bot sequence...
                                </p>
                                <p>
                                    This module utilizes the official Discord API gateway for message replication.
                                    Ensures zero-risk of account suspension and full TOS compliance.
                                </p>
                                <p className="text-zinc-500">
                                    Requisite: <span className="text-zinc-300">Manage Server</span> permissions on target guild.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <a
                                    href={`https://discord.com/oauth2/authorize?client_id=${clientId || "YOUR_CLIENT_ID"}&permissions=536870912&scope=bot%20applications.commands`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-8 py-3 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold font-mono uppercase flex items-center justify-center gap-2 transition-transform active:scale-95"
                                >
                                    <Bot className="w-4 h-4" />
                                    Initiate Auth Sequence
                                    <ExternalLink className="w-3 h-3 ml-1" />
                                </a>
                                <button disabled className="px-8 py-3 bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs font-bold font-mono uppercase cursor-not-allowed flex items-center justify-center gap-2">
                                    <Terminal className="w-4 h-4" />
                                    Read Documentation
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 transition-colors group">
                            <div className="mb-4 text-emerald-500 group-hover:scale-110 transition-transform origin-left">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <h3 className="text-zinc-200 font-bold font-mono text-sm uppercase mb-2">Verified Security</h3>
                            <p className="text-xs text-zinc-500 font-mono leading-relaxed">
                                Audited codebase. End-to-end encryption for all transmitted payloads.
                            </p>
                        </div>
                        <div className="p-6 bg-zinc-950 border border-zinc-800 hover:border-blue-500/50 transition-colors group">
                            <div className="mb-4 text-blue-500 group-hover:scale-110 transition-transform origin-left">
                                <Zap className="w-6 h-6" />
                            </div>
                            <h3 className="text-zinc-200 font-bold font-mono text-sm uppercase mb-2">High Availability</h3>
                            <p className="text-xs text-zinc-500 font-mono leading-relaxed">
                                Enterprise-grade infrastructure. 99.9% uptime SLA guarantee on all nodes.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Sidebar / Steps */}
                <div className="bg-zinc-950 border border-zinc-800 p-6 h-fit">
                    <h3 className="font-bold text-white mb-6 flex items-center gap-3 font-mono uppercase text-sm border-b border-zinc-800 pb-4">
                        <div className="w-6 h-6 bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center justify-center text-[10px]">01</div>
                        Initialization Protocol
                    </h3>

                    <div className="space-y-8 relative pl-2">
                        {/* Connecting Line */}
                        <div className="absolute left-[11px] top-2 bottom-4 w-[1px] bg-zinc-800" />

                        <div className="relative flex gap-4 group">
                            <div className="w-5 h-5 bg-zinc-950 border border-zinc-600 group-hover:border-white transition-colors flex items-center justify-center shrink-0 z-10">
                                <div className="w-1.5 h-1.5 bg-zinc-600 group-hover:bg-white transition-colors" />
                            </div>
                            <div className="-mt-1">
                                <h4 className="text-zinc-200 font-bold text-xs uppercase font-mono mb-1 group-hover:text-white transition-colors">Authorize Bot</h4>
                                <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                                    Authenticate DISBOT application via OAuth2 gateway.
                                </p>
                            </div>
                        </div>

                        <div className="relative flex gap-4 group">
                            <div className="w-5 h-5 bg-zinc-950 border border-zinc-600 group-hover:border-cyan-400 transition-colors flex items-center justify-center shrink-0 z-10">
                                <div className="w-1.5 h-1.5 bg-zinc-600 group-hover:bg-cyan-400 transition-colors" />
                            </div>
                            <div className="-mt-1">
                                <h4 className="text-zinc-200 font-bold text-xs uppercase font-mono mb-1 group-hover:text-cyan-400 transition-colors">Execute Command</h4>
                                <p className="text-[10px] text-zinc-500 font-mono leading-relaxed mb-2">
                                    Inject command payload:
                                </p>
                                <div className="bg-zinc-900 p-2 flex items-center gap-2 border-l-2 border-cyan-500/50">
                                    <Terminal className="w-3 h-3 text-cyan-500" />
                                    <code className="text-cyan-400 font-mono text-[10px]">/setup mirror</code>
                                </div>
                            </div>
                        </div>

                        <div className="relative flex gap-4 group">
                            <div className="w-5 h-5 bg-zinc-950 border border-zinc-600 group-hover:border-emerald-400 transition-colors flex items-center justify-center shrink-0 z-10">
                                <div className="w-1.5 h-1.5 bg-zinc-600 group-hover:bg-emerald-400 transition-colors" />
                            </div>
                            <div className="-mt-1">
                                <h4 className="text-zinc-200 font-bold text-xs uppercase font-mono mb-1 group-hover:text-emerald-400 transition-colors">Configure Node</h4>
                                <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
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
