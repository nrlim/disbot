"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Terminal, ShieldCheck, Globe, Keyboard, Search, Lock, Command } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function ExpertGuide() {
    const [openSection, setOpenSection] = useState<string | null>("token");

    const toggle = (id: string) => setOpenSection(openSection === id ? null : id);

    const Step = ({ id, number, title, icon: Icon, children }: { id: string, number: string, title: string, icon: any, children: React.ReactNode }) => (
        <div className="border border-white/5 rounded-xl overflow-hidden bg-[#161B2B]/30 transition-all hover:border-white/10 group">
            <button
                onClick={() => toggle(id)}
                className="w-full flex items-center justify-between p-4 transition-colors text-left"
            >
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all",
                        openSection === id ? "bg-[#00D1FF] text-black shadow-[0_0_15px_rgba(0,209,255,0.4)]" : "bg-[#161B2B] text-gray-500 border border-white/5 group-hover:border-white/20 group-hover:text-white"
                    )}>
                        {number}
                    </div>
                    <span className={cn("font-bold transition-colors", openSection === id ? "text-white" : "text-gray-400 group-hover:text-gray-200")}>
                        {title}
                    </span>
                </div>
                {openSection === id ? <ChevronUp className="w-5 h-5 text-[#00D1FF]" /> : <ChevronDown className="w-5 h-5 text-gray-600 group-hover:text-gray-400" />}
            </button>
            <AnimatePresence>
                {openSection === id && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-6 pt-2 space-y-4 border-t border-white/5 bg-[#0B0F1A]/30">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    return (
        <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3 mb-6 px-2">
                <div className="p-2 rounded-lg bg-[#5865F2]/20 text-[#5865F2]">
                    <Terminal className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-white text-base">Configuration Guide</h3>
                    <p className="text-xs text-gray-500">Follow these steps to safely configure the mirroring bot.</p>
                </div>
            </div>

            <Step id="token" number="01" title="Retrieve User Token" icon={Lock}>
                {/* Security Note */}
                <div className="bg-[#00D1FF]/5 border border-[#00D1FF]/20 rounded-xl p-4 flex gap-4 mb-4">
                    <div className="p-2 bg-[#00D1FF]/10 rounded-lg h-fit">
                        <ShieldCheck className="w-5 h-5 text-[#00D1FF]" />
                    </div>
                    <div>
                        <h4 className="text-[#00D1FF] font-bold text-xs uppercase tracking-wider mb-1">Local Encryption Standard</h4>
                        <p className="text-gray-400 text-xs leading-relaxed">
                            Your token is encrypted with AES-256 before being stored. It overrides the bot's default permissions, allowing it to read channels as if it were you.
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex gap-4 group/step">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-8 h-8 rounded-lg bg-[#161B2B] flex items-center justify-center border border-white/5 group-hover/step:border-[#00D1FF]/30 transition-colors">
                                <Globe className="w-4 h-4 text-gray-400 group-hover/step:text-[#00D1FF]" />
                            </div>
                            <div className="w-px h-full bg-white/5" />
                        </div>
                        <div className="pb-2 pt-1.5">
                            <p className="text-gray-200 font-bold text-sm mb-1">Access Discord via Browser</p>
                            <p className="text-xs text-gray-500 leading-relaxed">Open Discord in Chrome, Edge, or Firefox. This method does not work on the desktop application.</p>
                        </div>
                    </div>

                    <div className="flex gap-4 group/step">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-8 h-8 rounded-lg bg-[#161B2B] flex items-center justify-center border border-white/5 group-hover/step:border-[#00D1FF]/30 transition-colors">
                                <Command className="w-4 h-4 text-gray-400 group-hover/step:text-[#00D1FF]" />
                            </div>
                            <div className="w-px h-full bg-white/5" />
                        </div>
                        <div className="pb-2 pt-1.5">
                            <p className="text-gray-200 font-bold text-sm mb-1">Open Developer Tools</p>
                            <p className="text-xs text-gray-500 mb-3">Press <code className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-gray-300 font-mono">F12</code> or right-click &rarr; <strong className="text-gray-300">Inspect</strong>.</p>
                            <div className="bg-[#0B0F1A] border border-white/5 rounded-lg p-3 text-xs text-gray-400">
                                Navigate to the <strong className="text-[#00D1FF]">Network</strong> tab in the developer panel.
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 group/step">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-8 h-8 rounded-lg bg-[#161B2B] flex items-center justify-center border border-white/5 group-hover/step:border-[#00D1FF]/30 transition-colors">
                                <Search className="w-4 h-4 text-gray-400 group-hover/step:text-[#00D1FF]" />
                            </div>
                        </div>
                        <div className="pb-2 pt-1.5 w-full">
                            <p className="text-gray-200 font-bold text-sm mb-3">Retrieve Token</p>

                            <div className="bg-[#0B0F1A] rounded-xl border border-white/5 overflow-hidden text-xs font-mono mb-4 shadow-inner">
                                <div className="flex items-center gap-3 p-3 border-b border-white/5 bg-[#161B2B]/50">
                                    <div className="w-2 h-2 rounded-full bg-red-500/50" />
                                    <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                                    <div className="w-2 h-2 rounded-full bg-green-500/50" />
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="flex justify-between text-gray-600">
                                        <span>Filter:</span>
                                        <span className="text-[#00D1FF]">messages</span>
                                    </div>
                                    <div className="pl-4 border-l border-white/10 space-y-2 text-gray-500">
                                        <div className="flex justify-between hover:bg-white/5 p-1 rounded cursor-default transition-colors">
                                            <span>library</span>
                                            <span>200</span>
                                        </div>
                                        <div className="flex justify-between bg-[#5865F2]/20 text-[#00D1FF] p-1 rounded font-bold">
                                            <span>messages</span>
                                            <span>200</span>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-white/10">
                                        <div className="text-gray-500 mb-1">Request Headers</div>
                                        <div className="flex gap-2">
                                            <span className="text-amber-500">authorization:</span>
                                            <span className="text-gray-300">Nzk0Mz... <span className="opacity-50">(copy value)</span></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Step>

            <Step id="channel" number="02" title="Get Channel ID" icon={Keyboard}>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-[#161B2B] flex items-center justify-center border border-white/5 shrink-0">
                            <span className="text-[#00D1FF] font-bold text-xs">1</span>
                        </div>
                        <div className="pt-1.5">
                            <p className="text-gray-300 text-sm">Enable <strong className="text-white">Developer Mode</strong> in User Settings → Advanced.</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-[#161B2B] flex items-center justify-center border border-white/5 shrink-0">
                            <span className="text-[#00D1FF] font-bold text-xs">2</span>
                        </div>
                        <div className="pt-1.5">
                            <p className="text-gray-300 text-sm">Right-click the target channel in your server list.</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-[#161B2B] flex items-center justify-center border border-white/5 shrink-0">
                            <span className="text-[#00D1FF] font-bold text-xs">3</span>
                        </div>
                        <div className="pt-1.5">
                            <p className="text-gray-300 text-sm">Select <strong className="text-white">Copy Channel ID</strong> from the context menu.</p>
                        </div>
                    </div>
                </div>
            </Step>

            <Step id="webhook" number="03" title="Create Target Webhook" icon={Globe}>
                <div className="space-y-4">
                    <div className="p-4 bg-[#161B2B] rounded-xl border border-white/5 text-xs text-gray-400 leading-relaxed">
                        Webhooks allow the bot to post messages into a channel without needing to be invited as a bot user in some cases, though for this tool the bot usually needs to be present in the destination or have webhook permissions.
                    </div>
                    <ul className="space-y-3 pl-2">
                        <li className="flex items-center gap-3 text-gray-300">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" />
                            <span>Server Settings → <strong className="text-white">Integrations</strong></span>
                        </li>
                        <li className="flex items-center gap-3 text-gray-300">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" />
                            <span>Select <strong className="text-white">Webhooks</strong> → New Webhook</span>
                        </li>
                        <li className="flex items-center gap-3 text-gray-300">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" />
                            <span>Copy the <strong className="text-white">Webhook URL</strong></span>
                        </li>
                    </ul>
                </div>
            </Step>
        </div>
    );
}
