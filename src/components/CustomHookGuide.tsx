"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Terminal, ShieldCheck, Globe, Keyboard, Search, Lock, Command } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function CustomHookGuide() {
    const [openSection, setOpenSection] = useState<string | null>("token");

    const toggle = (id: string) => setOpenSection(openSection === id ? null : id);

    const Step = ({ id, number, title, icon: Icon, children }: { id: string, number: string, title: string, icon: any, children: React.ReactNode }) => (
        <div className="border border-zinc-800 bg-zinc-950 transition-all hover:border-zinc-700 group">
            <button
                onClick={() => toggle(id)}
                className="w-full flex items-center justify-between p-4 transition-colors text-left"
            >
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "w-8 h-8 flex items-center justify-center text-xs font-mono font-bold transition-all border",
                        openSection === id ? "bg-primary text-black border-primary" : "bg-zinc-900 text-zinc-500 border-zinc-800 group-hover:border-zinc-600 group-hover:text-zinc-300"
                    )}>
                        {number}
                    </div>
                    <span className={cn("font-mono text-sm uppercase tracking-wider transition-colors", openSection === id ? "text-white font-bold" : "text-zinc-400 group-hover:text-zinc-200")}>
                        {title}
                    </span>
                </div>
                {openSection === id ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />}
            </button>
            <AnimatePresence>
                {openSection === id && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-6 pt-2 space-y-4 border-t border-zinc-800 bg-zinc-950">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    return (
        <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3 mb-6 px-1">
                <div className="p-2 border border-primary/20 bg-primary/10 text-primary">
                    <Terminal className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="font-bold text-white text-sm font-mono uppercase tracking-widest">Configuration Protocol</h3>
                    <p className="text-xs text-zinc-500 font-mono">Execute the following sequence for safe deployment.</p>
                </div>
            </div>

            <Step id="token" number="01" title="Retrieve User Token" icon={Lock}>
                {/* Security Note */}
                <div className="bg-primary/5 border border-primary/20 p-4 flex gap-4 mb-4">
                    <div className="p-2 bg-primary/10 h-fit border border-primary/20">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-primary font-bold text-xs uppercase tracking-wider mb-1 font-mono">Local Encryption Standard</h4>
                        <p className="text-zinc-400 text-xs leading-relaxed font-mono">
                            Token is encrypted (AES-256) pre-storage. Overrides default permissions for user-mimicry capabilities.
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex gap-4 group/step">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-6 h-6 bg-zinc-900 flex items-center justify-center border border-zinc-700 group-hover/step:border-primary/50 transition-colors">
                                <Globe className="w-3 h-3 text-zinc-500 group-hover/step:text-primary" />
                            </div>
                            <div className="w-px h-full bg-zinc-800 group-hover/step:bg-zinc-700 transition-colors" />
                        </div>
                        <div className="pb-2 pt-0.5">
                            <p className="text-zinc-200 font-bold text-xs font-mono uppercase mb-1">Access Discord via Browser</p>
                            <p className="text-xs text-zinc-500 leading-relaxed font-mono">Launch Discord web client (Chrome/Edge/Firefox). Desktop client unsupported for this method.</p>
                        </div>
                    </div>

                    <div className="flex gap-4 group/step">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-6 h-6 bg-zinc-900 flex items-center justify-center border border-zinc-700 group-hover/step:border-primary/50 transition-colors">
                                <Command className="w-3 h-3 text-zinc-500 group-hover/step:text-primary" />
                            </div>
                            <div className="w-px h-full bg-zinc-800 group-hover/step:bg-zinc-700 transition-colors" />
                        </div>
                        <div className="pb-2 pt-0.5">
                            <p className="text-zinc-200 font-bold text-xs font-mono uppercase mb-1">Initialize DevTools</p>
                            <p className="text-xs text-zinc-500 mb-2 font-mono">Press <code className="bg-zinc-800 px-1 py-0.5 text-zinc-300 font-mono text-[10px]">F12</code> or Right-Click &rarr; <strong className="text-zinc-300">Inspect</strong>.</p>
                            <div className="bg-zinc-900 border border-zinc-800 p-2 text-[10px] text-zinc-400 font-mono uppercase">
                                Build Target: <strong className="text-primary">Network Tab</strong>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 group/step">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-6 h-6 bg-zinc-900 flex items-center justify-center border border-zinc-700 group-hover/step:border-primary/50 transition-colors">
                                <Search className="w-3 h-3 text-zinc-500 group-hover/step:text-primary" />
                            </div>
                        </div>
                        <div className="pb-2 pt-0.5 w-full">
                            <p className="text-zinc-200 font-bold text-xs font-mono uppercase mb-2">Extract Auth Token</p>

                            <div className="bg-zinc-950 border border-zinc-800 font-mono text-[10px] mb-4">
                                <div className="flex items-center gap-3 p-2 border-b border-zinc-800 bg-zinc-900">
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-zinc-700" />
                                        <div className="w-2 h-2 rounded-full bg-zinc-700" />
                                        <div className="w-2 h-2 rounded-full bg-zinc-700" />
                                    </div>
                                    <div className="text-zinc-500 ml-auto uppercase tracking-wider">DevTools Console</div>
                                </div>
                                <div className="p-3 space-y-2">
                                    <div className="flex justify-between text-zinc-500 border-b border-zinc-800 pb-2">
                                        <span>FILTER_QUERY:</span>
                                        <span className="text-primary">messages</span>
                                    </div>
                                    <div className="pl-2 border-l border-zinc-800 space-y-1 text-zinc-400">
                                        <div className="flex justify-between bg-primary/10 text-primary p-1">
                                            <span>GET /messages</span>
                                            <span>200 OK</span>
                                        </div>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-zinc-800">
                                        <div className="text-zinc-500 mb-1 uppercase text-[9px]">Request Headers Payload</div>
                                        <div className="flex gap-2">
                                            <span className="text-amber-500">authorization:</span>
                                            <span className="text-zinc-300">Nzk0Mz... <span className="opacity-50 text-[9px] ml-1">[COPY VALUE]</span></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Step>

            <Step id="channel" number="02" title="Get Channel ID" icon={Keyboard}>
                <div className="space-y-4 font-mono">
                    <div className="flex gap-4">
                        <div className="w-6 h-6 bg-zinc-900 flex items-center justify-center border border-zinc-700 shrink-0">
                            <span className="text-primary font-bold text-[10px]">1</span>
                        </div>
                        <div className="pt-0.5">
                            <p className="text-zinc-300 text-xs">Activate <strong className="text-white">Developer Mode</strong> within User Settings &rarr; Advanced.</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-6 h-6 bg-zinc-900 flex items-center justify-center border border-zinc-700 shrink-0">
                            <span className="text-primary font-bold text-[10px]">2</span>
                        </div>
                        <div className="pt-0.5">
                            <p className="text-zinc-300 text-xs">Target desired channel in sidebar.</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-6 h-6 bg-zinc-900 flex items-center justify-center border border-zinc-700 shrink-0">
                            <span className="text-primary font-bold text-[10px]">3</span>
                        </div>
                        <div className="pt-0.5">
                            <p className="text-zinc-300 text-xs">Right-Click &rarr; <strong className="text-white uppercase">Copy Channel ID</strong>.</p>
                        </div>
                    </div>
                </div>
            </Step>

            <Step id="webhook" number="03" title="Create Target Webhook" icon={Globe}>
                <div className="space-y-4">
                    <div className="p-3 bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 leading-relaxed font-mono">
                        <span className="text-white font-bold uppercase mr-2">Info:</span>
                        Webhooks bypass user-bot requirements. Bot presence in destination is optional if webhook permissions are active.
                    </div>
                    <ul className="space-y-3 pl-1 font-mono text-xs">
                        <li className="flex items-center gap-3 text-zinc-400">
                            <div className="w-1 h-1 bg-primary" />
                            <span>Server Settings &rarr; <strong className="text-zinc-200">Integrations</strong></span>
                        </li>
                        <li className="flex items-center gap-3 text-zinc-400">
                            <div className="w-1 h-1 bg-primary" />
                            <span>Select <strong className="text-zinc-200">Webhooks</strong> &rarr; New Webhook</span>
                        </li>
                        <li className="flex items-center gap-3 text-zinc-400">
                            <div className="w-1 h-1 bg-primary" />
                            <span>Copy <strong className="text-zinc-200 uppercase">Webhook URL</strong></span>
                        </li>
                    </ul>
                </div>
            </Step>
        </div>
    );
}
