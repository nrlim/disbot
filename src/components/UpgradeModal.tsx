"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Crown, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    reason: string;
}

export default function UpgradeModal({ isOpen, onClose, reason }: UpgradeModalProps) {
    const router = useRouter();

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50"
                    />

                    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full pointer-events-auto overflow-hidden text-center relative"
                        >
                            <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none" />

                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100/50 text-gray-400 hover:text-gray-600 transition-colors z-10"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="p-8 pt-10">
                                <div className="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-orange-50">
                                    <Crown className="w-8 h-8 text-amber-500" />
                                </div>

                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Upgrade Required</h2>
                                <p className="text-sm font-medium text-amber-600 bg-amber-50 inline-block px-3 py-1 rounded-full mb-4">
                                    {reason}
                                </p>
                                <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                                    Your current plan doesn't support this feature. Upgrade to <span className="font-bold text-gray-900">Pro</span> or <span className="font-bold text-gray-900">Elite</span> to unlock unlimited power and exclusive features.
                                </p>

                                <div className="space-y-3 mb-8 text-left">
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                                        <span className="text-sm font-medium text-gray-700">Telegram Mirroring Support</span>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                                        <span className="text-sm font-medium text-gray-700">Increased Path Limits</span>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                                        <span className="text-sm font-medium text-gray-700">Priority Support & Updates</span>
                                    </div>
                                </div>

                                <div className="space-y-3 pointer-events-auto">
                                    <button
                                        onClick={() => {
                                            router.push("/");
                                            onClose();
                                        }}
                                        className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-gray-200 active:scale-95"
                                    >
                                        View Pricing Plans
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="w-full py-3 text-gray-500 font-medium hover:text-gray-700 transition-colors text-sm"
                                    >
                                        No thanks, maybe later
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
