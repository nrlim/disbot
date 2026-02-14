"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Terminal, ShieldCheck, Globe, Keyboard, Search, Lock, Command } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function CustomHookGuide() {
    const [openSection, setOpenSection] = useState<string | null>("token");

    const toggle = (id: string) => setOpenSection(openSection === id ? null : id);

    const Step = ({ id, number, title, icon: Icon, children }: { id: string, number: string, title: string, icon: any, children: React.ReactNode }) => (
        <div className="border border-gray-200 bg-white rounded-lg transition-all hover:border-gray-300 group overflow-hidden">
            <button
                onClick={() => toggle(id)}
                className="w-full flex items-center justify-between p-4 transition-colors text-left"
            >
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "w-8 h-8 flex items-center justify-center text-xs font-bold transition-all rounded-full border",
                        openSection === id ? "bg-primary text-white border-primary" : "bg-gray-50 text-gray-400 border-gray-100 group-hover:border-gray-200 group-hover:text-gray-500"
                    )}>
                        {number}
                    </div>
                    <span className={cn("text-sm font-bold uppercase tracking-wider transition-colors", openSection === id ? "text-gray-900" : "text-gray-500 group-hover:text-gray-700")}>
                        {title}
                    </span>
                </div>
                {openSection === id ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-500" />}
            </button>
            <AnimatePresence>
                {openSection === id && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-6 pt-2 space-y-4 border-t border-gray-100 bg-gray-50/50">
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
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <Terminal className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-900 text-sm uppercase tracking-widest">Configuration Protocol</h3>
                    <p className="text-xs text-gray-500">Execute the following sequence for safe deployment.</p>
                </div>
            </div>

            <Step id="token" number="01" title="Retrieve User Token" icon={Lock}>
                {/* Security Note */}
                <div className="bg-blue-50 border border-blue-100 text-blue-900 p-4 flex gap-4 mb-4 rounded-lg">
                    <div className="p-2 bg-blue-100 rounded-full h-fit">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                        <h4 className="font-bold text-xs uppercase tracking-wider mb-1 text-blue-800">Local Encryption Standard</h4>
                        <p className="text-blue-700/80 text-xs leading-relaxed">
                            Token is encrypted (AES-256) pre-storage. Overrides default permissions for user-mimicry capabilities.
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex gap-4 group/step">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-6 h-6 bg-white flex items-center justify-center border border-gray-200 rounded-full group-hover/step:border-primary/50 transition-colors shadow-sm">
                                <Globe className="w-3 h-3 text-gray-400 group-hover/step:text-primary" />
                            </div>
                            <div className="w-px h-full bg-gray-200 group-hover/step:bg-gray-300 transition-colors" />
                        </div>
                        <div className="pb-2 pt-0.5">
                            <p className="text-gray-900 font-bold text-xs uppercase mb-1">Access Discord via Browser</p>
                            <p className="text-xs text-gray-500 leading-relaxed">Launch Discord web client (Chrome/Edge/Firefox). Desktop client unsupported for this method.</p>
                        </div>
                    </div>

                    <div className="flex gap-4 group/step">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-6 h-6 bg-white flex items-center justify-center border border-gray-200 rounded-full group-hover/step:border-primary/50 transition-colors shadow-sm">
                                <Command className="w-3 h-3 text-gray-400 group-hover/step:text-primary" />
                            </div>
                            <div className="w-px h-full bg-gray-200 group-hover/step:bg-gray-300 transition-colors" />
                        </div>
                        <div className="pb-2 pt-0.5">
                            <p className="text-gray-900 font-bold text-xs uppercase mb-1">Initialize DevTools</p>
                            <p className="text-xs text-gray-500 mb-2">Press <code className="bg-gray-100 px-1.5 py-0.5 text-gray-700 rounded text-[10px] font-mono border border-gray-200">F12</code> or Right-Click &rarr; <strong className="text-gray-700">Inspect</strong>.</p>
                            <div className="bg-gray-100 border border-gray-200 p-2 text-[10px] text-gray-500 font-mono uppercase rounded">
                                Build Target: <strong className="text-primary">Network Tab</strong>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 group/step">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-6 h-6 bg-white flex items-center justify-center border border-gray-200 rounded-full group-hover/step:border-primary/50 transition-colors shadow-sm">
                                <Search className="w-3 h-3 text-gray-400 group-hover/step:text-primary" />
                            </div>
                        </div>
                        <div className="pb-2 pt-0.5 w-full">
                            <p className="text-gray-900 font-bold text-xs uppercase mb-2">Extract Auth Token</p>

                            <div className="bg-white border border-gray-200 rounded-lg shadow-sm font-mono text-[10px] mb-4 overflow-hidden">
                                <div className="flex items-center gap-3 p-2 border-b border-gray-100 bg-gray-50">
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-red-400" />
                                        <div className="w-2 h-2 rounded-full bg-yellow-400" />
                                        <div className="w-2 h-2 rounded-full bg-green-400" />
                                    </div>
                                    <div className="text-gray-400 ml-auto uppercase tracking-wider font-sans text-[10px] font-bold">DevTools Console</div>
                                </div>
                                <div className="p-3 space-y-2">
                                    <div className="flex justify-between text-gray-500 border-b border-gray-100 pb-2">
                                        <span>FILTER_QUERY:</span>
                                        <span className="text-primary font-semibold">messages</span>
                                    </div>
                                    <div className="pl-2 border-l-2 border-gray-100 space-y-1 text-gray-600">
                                        <div className="flex justify-between bg-blue-50 text-blue-600 p-1 rounded">
                                            <span>GET /messages</span>
                                            <span>200 OK</span>
                                        </div>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-gray-100">
                                        <div className="text-gray-400 mb-1 uppercase text-[9px] font-sans font-bold">Request Headers Payload</div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="text-orange-500 font-semibold">authorization:</span>
                                            <span className="text-gray-700 bg-gray-50 px-1 rounded break-all">Nzk0Mz... <span className="opacity-50 text-[9px] ml-1 select-none">[COPY VALUE]</span></span>
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
                        <div className="w-6 h-6 bg-white flex items-center justify-center border border-gray-200 rounded-full shrink-0 shadow-sm">
                            <span className="text-primary font-bold text-[10px]">1</span>
                        </div>
                        <div className="pt-0.5">
                            <p className="text-gray-600 text-xs">Activate <strong className="text-gray-900">Developer Mode</strong> within User Settings &rarr; Advanced.</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-6 h-6 bg-white flex items-center justify-center border border-gray-200 rounded-full shrink-0 shadow-sm">
                            <span className="text-primary font-bold text-[10px]">2</span>
                        </div>
                        <div className="pt-0.5">
                            <p className="text-gray-600 text-xs">Target desired channel in sidebar.</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-6 h-6 bg-white flex items-center justify-center border border-gray-200 rounded-full shrink-0 shadow-sm">
                            <span className="text-primary font-bold text-[10px]">3</span>
                        </div>
                        <div className="pt-0.5">
                            <p className="text-gray-600 text-xs">Right-Click &rarr; <strong className="text-gray-900 uppercase">Copy Channel ID</strong>.</p>
                        </div>
                    </div>
                </div>
            </Step>

            <Step id="webhook" number="03" title="Create Target Webhook" icon={Globe}>
                <div className="space-y-4">
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-[10px] text-gray-500 leading-relaxed font-mono">
                        <span className="text-gray-900 font-bold uppercase mr-2">Info:</span>
                        Webhooks bypass user-bot requirements. Bot presence in destination is optional if webhook permissions are active.
                    </div>
                    <ul className="space-y-3 pl-1 text-xs">
                        <li className="flex items-center gap-3 text-gray-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span>Server Settings &rarr; <strong className="text-gray-900">Integrations</strong></span>
                        </li>
                        <li className="flex items-center gap-3 text-gray-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span>Select <strong className="text-gray-900">Webhooks</strong> &rarr; New Webhook</span>
                        </li>
                        <li className="flex items-center gap-3 text-gray-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span>Copy <strong className="text-gray-900 uppercase">Webhook URL</strong></span>
                        </li>
                    </ul>
                </div>
            </Step>
        </div>
    );
}
