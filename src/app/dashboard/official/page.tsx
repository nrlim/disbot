"use client";

import { Bot, CheckCircle2, ShieldCheck, ExternalLink, Server, Terminal } from "lucide-react";
import Image from "next/image";

export default function OfficialBotDashboard() {
    const clientId = process.env.DISCORD_CLIENT_ID;

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-2xl bg-[#5865F2]/20 border border-[#5865F2]/30 shadow-[0_0_20px_rgba(88,101,242,0.2)]">
                    <Bot className="w-8 h-8 text-[#5865F2]" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Official Bot Integration</h1>
                    <p className="text-gray-400">The safest, Discord-verified method for mirroring channels.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Info Card */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="obsidian-card rounded-3xl p-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#5865F2]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <h2 className="text-2xl font-bold text-white">DISBOT Official</h2>
                                <span className="bg-[#5865F2] text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1.5 uppercase tracking-wider shadow-lg shadow-[#5865F2]/20">
                                    <CheckCircle2 className="w-3 h-3" /> Verified App
                                </span>
                            </div>

                            <p className="text-gray-400 leading-relaxed mb-8">
                                Invite our verified bot to your server to enable seamless message mirroring.
                                This method utilizes Discord's official API, ensuring 100% Terms of Service compliance.
                                Requires <strong className="text-white">Manage Server</strong> permissions.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <a
                                    href={`https://discord.com/oauth2/authorize?client_id=${clientId || "YOUR_CLIENT_ID"}&permissions=536870912&scope=bot%20applications.commands`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#5865F2]/25 flex items-center justify-center gap-2 group transform hover:scale-105"
                                >
                                    <Bot className="w-5 h-5" />
                                    Invite to Server
                                    <ExternalLink className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                                </a>
                                <button disabled className="px-8 py-3.5 bg-[#161B2B] border border-white/10 text-gray-500 rounded-xl font-bold cursor-not-allowed">
                                    Documentation
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 rounded-2xl bg-[#161B2B]/50 border border-white/5 hover:border-[#5865F2]/30 transition-colors group">
                            <div className="mb-4 p-3 bg-[#5865F2]/10 rounded-xl w-fit group-hover:scale-110 transition-transform">
                                <ShieldCheck className="w-6 h-6 text-[#5865F2]" />
                            </div>
                            <h3 className="text-white font-bold mb-2">Secure & Verified</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Audited code and verified by Discord security teams. Your data is safe.
                            </p>
                        </div>
                        <div className="p-6 rounded-2xl bg-[#161B2B]/50 border border-white/5 hover:border-[#5865F2]/30 transition-colors group">
                            <div className="mb-4 p-3 bg-cyan-500/10 rounded-xl w-fit group-hover:scale-110 transition-transform">
                                <Server className="w-6 h-6 text-cyan-400" />
                            </div>
                            <h3 className="text-white font-bold mb-2">Zero Downtime</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Hosted on enterprise-grade infrastructure with 99.9% uptime SLA.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Sidebar / Steps */}
                <div className="obsidian-card rounded-3xl p-6 h-fit border-l-4 border-l-[#5865F2]">
                    <h3 className="font-bold text-white mb-6 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#5865F2]/20 text-[#5865F2] flex items-center justify-center text-sm font-bold">01</div>
                        Setup Instructions
                    </h3>

                    <div className="space-y-6 relative">
                        {/* Connecting Line */}
                        <div className="absolute left-[15px] top-8 bottom-8 w-0.5 bg-white/5" />

                        <div className="relative flex gap-4 group">
                            <div className="w-8 h-8 rounded-full bg-[#161B2B] border-4 border-[#0B0F1A] ring-1 ring-white/10 flex items-center justify-center shrink-0 z-10 group-hover:ring-[#5865F2] transition-all">
                                <div className="w-2 h-2 rounded-full bg-[#5865F2]" />
                            </div>
                            <div className="pt-1">
                                <h4 className="text-white font-bold text-sm mb-1">Authorize Bot</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Click the invite button and select the server you want to add the bot to.
                                </p>
                            </div>
                        </div>

                        <div className="relative flex gap-4 group">
                            <div className="w-8 h-8 rounded-full bg-[#161B2B] border-4 border-[#0B0F1A] ring-1 ring-white/10 flex items-center justify-center shrink-0 z-10 group-hover:ring-cyan-400 transition-all">
                                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                            </div>
                            <div className="pt-1">
                                <h4 className="text-white font-bold text-sm mb-1">Run Setup Command</h4>
                                <p className="text-xs text-gray-500 leading-relaxed mb-2">
                                    In any channel, type:
                                </p>
                                <div className="bg-black/30 rounded-lg p-2 flex items-center gap-2 border border-white/5">
                                    <Terminal className="w-3 h-3 text-gray-500" />
                                    <code className="text-cyan-400 font-mono text-xs">/setup mirror</code>
                                </div>
                            </div>
                        </div>

                        <div className="relative flex gap-4 group">
                            <div className="w-8 h-8 rounded-full bg-[#161B2B] border-4 border-[#0B0F1A] ring-1 ring-white/10 flex items-center justify-center shrink-0 z-10 group-hover:ring-emerald-400 transition-all">
                                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            </div>
                            <div className="pt-1">
                                <h4 className="text-white font-bold text-sm mb-1">Configuration</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Follow the interactive menu to select source channels and target destinations.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
