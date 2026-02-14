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
                        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50"
                    />

                    {/* Modal Content */}
                    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="bg-white border border-gray-200 w-full max-w-md pointer-events-auto relative overflow-hidden group shadow-xl rounded-xl"
                        >
                            {/* Decorative Gradients */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                            {/* Header */}
                            <div className="p-4 border-b border-gray-100 flex items-center justify-end relative z-10">
                                <button
                                    onClick={onClose}
                                    className="text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 hover:bg-gray-100 rounded-full p-1"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="px-8 pb-10 text-center relative z-10">
                                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-100 shadow-sm group-hover:scale-110 transition-transform duration-500">
                                    <Rocket className="w-8 h-8 text-primary" />
                                </div>

                                <h2 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">
                                    Coming Soon
                                </h2>
                                <p className="text-gray-500 text-sm leading-relaxed mb-8">
                                    We're working hard to bring <span className="text-primary font-semibold">{featureName}</span> to life.
                                    Expect something amazing very soon!
                                </p>

                                <div className="space-y-3">
                                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center gap-3 text-left">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                            <Zap className="w-4 h-4 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">High Performance</p>
                                            <p className="text-xs text-gray-500">Optimized for reliability and speed.</p>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center gap-3 text-left">
                                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                            <Bell className="w-4 h-4 text-purple-600" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">Stay Tuned</p>
                                            <p className="text-xs text-gray-500">We'll notify you when it's ready.</p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={onClose}
                                    className="mt-8 w-full py-2.5 bg-gray-900 text-white font-semibold text-sm rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
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
