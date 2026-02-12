"use client";

import { X, Rocket, Bell, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ComingSoonModalProps {
    isOpen: boolean;
    onClose: () => void;
    featureName?: string;
}

export default function ComingSoonModal({ isOpen, onClose, featureName = "Feature" }: ComingSoonModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
                    />

                    {/* Modal Content */}
                    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="bg-zinc-950 border border-zinc-800 w-full max-w-md pointer-events-auto relative overflow-hidden group shadow-2xl"
                        >
                            {/* Decorative Gradients */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                            {/* Header */}
                            <div className="p-6 border-b border-zinc-900 flex items-center justify-end relative z-10">
                                <button
                                    onClick={onClose}
                                    className="text-zinc-500 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="px-8 pb-10 text-center relative z-10">
                                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-800 shadow-inner group-hover:scale-110 transition-transform duration-500">
                                    <Rocket className="w-8 h-8 text-primary" />
                                </div>

                                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                                    Coming Soon
                                </h2>
                                <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                                    We're working hard to bring <span className="text-primary font-mono font-bold">{featureName}</span> to life.
                                    Expect something amazing very soon!
                                </p>

                                <div className="space-y-3">
                                    <div className="p-3 bg-zinc-900/50 border border-zinc-800/50 rounded flex items-center gap-3 text-left">
                                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                            <Zap className="w-4 h-4 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-zinc-200 uppercase tracking-wide">High Performance</p>
                                            <p className="text-[10px] text-zinc-500">Optimized for reliability and speed.</p>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-zinc-900/50 border border-zinc-800/50 rounded flex items-center gap-3 text-left">
                                        <div className="w-8 h-8 rounded bg-purple-500/10 flex items-center justify-center shrink-0">
                                            <Bell className="w-4 h-4 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-zinc-200 uppercase tracking-wide">Stay Tuned</p>
                                            <p className="text-[10px] text-zinc-500">We'll notify you when it's ready.</p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={onClose}
                                    className="mt-8 w-full py-3 bg-white text-black font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 transition-colors"
                                >
                                    Got it
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
