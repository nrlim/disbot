"use client";

import { useSession } from "next-auth/react";
import Image from "next/image";
import { CreditCard, Shield, User, Zap } from "lucide-react";
import { motion } from "framer-motion";

export default function SettingsPage() {
    const { data: session } = useSession();

    if (!session?.user) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Account Settings</h1>
                <p className="text-gray-400">Manage your profile and subscription preferences.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Profile Card */}
                <div className="md:col-span-2 space-y-6">
                    <div className="obsidian-card rounded-3xl p-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#5865F2]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-[#5865F2]/20 text-[#5865F2]">
                                <User className="w-5 h-5" />
                            </div>
                            Profile Information
                        </h2>

                        <div className="flex items-center gap-6 mb-8">
                            <div className="relative">
                                {session.user.image ? (
                                    <Image
                                        src={session.user.image}
                                        alt={session.user.name || "User"}
                                        width={80}
                                        height={80}
                                        className="rounded-full ring-4 ring-[#161B2B] shadow-lg"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-[#161B2B] flex items-center justify-center text-3xl font-bold text-[#5865F2] ring-4 ring-[#161B2B]">
                                        {session.user.name?.[0] || "?"}
                                    </div>
                                )}
                                <div className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 rounded-full border-4 border-[#0B0F1A]" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white">{session.user.name}</h3>
                                <p className="text-gray-400">{session.user.email}</p>
                                <div className="mt-2 text-xs font-mono bg-[#161B2B] px-2 py-1 rounded w-fit text-gray-500 border border-white/5">
                                    ID: {session.user.id}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-[#161B2B]/50 border border-white/5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Account Type</label>
                                <div className="text-white font-medium flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-emerald-400" />
                                    Verified User
                                </div>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#161B2B]/50 border border-white/5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Member Since</label>
                                <div className="text-white font-medium">
                                    2024
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Subscription / Plan */}
                <div className="md:col-span-1">
                    <div className="obsidian-card rounded-3xl p-6 h-full flex flex-col relative overflow-hidden border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Zap className="w-5 h-5 text-amber-500" />
                                Current Plan
                            </h2>
                            <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-transparent bg-clip-text text-4xl font-extrabold tracking-tight mb-1">
                                STARTER
                            </div>
                            <p className="text-sm text-gray-400">Free Tier</p>
                        </div>

                        <div className="space-y-4 mb-8 flex-1">
                            <div className="bg-[#161B2B] rounded-xl p-3 border border-white/5">
                                <div className="flex justify-between text-xs text-gray-400 mb-2">
                                    <span>Active Mirrors</span>
                                    <span className="text-white font-bold">0 / 2</span>
                                </div>
                                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 w-[0%] rounded-full" />
                                </div>
                            </div>
                            <ul className="text-sm space-y-2 text-gray-300">
                                <li className="flex gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    <span>2 Active Configurations</span>
                                </li>
                                <li className="flex gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    <span>Basic Support</span>
                                </li>
                            </ul>
                        </div>

                        <button className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 hover:scale-105 transition-transform flex items-center justify-center gap-2">
                            <CreditCard className="w-4 h-4" />
                            Upgrade Plan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CheckCircle2({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}
