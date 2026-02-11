"use client";

import { useSession } from "next-auth/react";
import Image from "next/image";
import { CreditCard, Shield, User, Zap, CheckCircle2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
    const { data: session } = useSession();

    if (!session?.user) return null;

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="mb-8 border-b border-zinc-800 pb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2 font-mono uppercase tracking-tight">System Configuration</h1>
                    <p className="text-zinc-500 font-mono text-sm">Manage user credentials and subscription vectors.</p>
                </div>
                <div className="p-2 border border-primary/20 bg-primary/10 text-primary">
                    <Terminal className="w-5 h-5" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Profile Card */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-zinc-950 border border-zinc-800 p-8 relative overflow-hidden group">

                        <div className="flex flex-col md:flex-row items-start gap-8 mb-8">
                            <div className="relative shrink-0">
                                {session.user.image ? (
                                    <Image
                                        src={session.user.image}
                                        alt={session.user.name || "User"}
                                        width={100}
                                        height={100}
                                        className="border border-zinc-700 shadow-lg grayscale group-hover:grayscale-0 transition-all duration-500"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="w-24 h-24 bg-zinc-900 flex items-center justify-center text-4xl font-bold text-primary border border-zinc-800 font-mono">
                                        {session.user.name?.[0] || "?"}
                                    </div>
                                )}
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-zinc-950" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className="text-2xl font-bold text-white font-mono uppercase tracking-tight">{session.user.name}</h3>
                                    <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 text-[10px] font-mono uppercase tracking-wider font-bold">
                                        Active
                                    </span>
                                </div>
                                <p className="text-zinc-400 font-mono text-sm mb-4">{session.user.email}</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="p-3 bg-zinc-900 border border-zinc-800">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block font-mono">User ID</label>
                                        <div className="text-zinc-300 font-mono text-xs truncate">
                                            {session.user.id || "N/A"}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-zinc-900 border border-zinc-800">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block font-mono">Role</label>
                                        <div className="text-zinc-300 font-mono text-xs flex items-center gap-2">
                                            <Shield className="w-3 h-3 text-primary" />
                                            OPERATOR
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-zinc-800 pt-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <div className="text-xs text-zinc-500 font-mono uppercase">Member Since</div>
                                    <div className="text-white font-mono font-bold">2024 CYCLE</div>
                                </div>
                                <button className="px-4 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white transition-colors font-mono text-xs uppercase tracking-wider">
                                    Edit Profile
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Subscription / Plan */}
                <div className="md:col-span-1">
                    <div className="h-full bg-zinc-950 border border-zinc-800 p-6 flex flex-col relative overflow-hidden group hover:border-primary/30 transition-colors">
                        <div className="absolute top-0 right-0 p-4 opacity-50">
                            <Zap className="w-12 h-12 text-zinc-800 group-hover:text-primary/20 transition-colors" />
                        </div>

                        <div className="mb-8 relative z-10">
                            <h2 className="text-xs font-bold text-zinc-500 mb-2 font-mono uppercase tracking-widest">
                                Current Plan
                            </h2>
                            <div className="text-4xl font-black text-white font-mono tracking-tighter mb-1">
                                STARTER
                            </div>
                            <p className="text-xs text-primary font-mono bg-primary/10 border border-primary/20 px-2 py-0.5 w-fit uppercase">
                                Free Tier
                            </p>
                        </div>

                        <div className="space-y-6 mb-8 flex-1 relative z-10">
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] text-zinc-400 font-mono uppercase">
                                    <span>Usage Quota</span>
                                    <span className="text-white font-bold">0 / 2</span>
                                </div>
                                <div className="w-full h-1 bg-zinc-900">
                                    <div className="h-full bg-primary w-[0%]" />
                                </div>
                            </div>

                            <ul className="text-xs space-y-3 text-zinc-400 font-mono">
                                <li className="flex gap-3 items-start">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <span>2 Active Mirror Nodes</span>
                                </li>
                                <li className="flex gap-3 items-start">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <span>Standard Latency</span>
                                </li>
                                <li className="flex gap-3 items-start">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <span>Community Support</span>
                                </li>
                            </ul>
                        </div>

                        <button className="w-full py-3 bg-zinc-100 hover:bg-white text-black font-bold text-xs uppercase tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-2 relative z-10">
                            <CreditCard className="w-3 h-3" />
                            Upgrade Plan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
