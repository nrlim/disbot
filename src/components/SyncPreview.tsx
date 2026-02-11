"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hash, CheckCheck, Loader2, User } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface Message {
    id: string;
    author: string;
    avatar: "user" | "bot";
    content: string;
    timestamp: string;
    isBot?: boolean;
}

// Discord Message Component
const DiscordMessage = ({ author, avatar, timestamp, content, isBot, color }: any) => {
    return (
        <div className="flex items-start space-x-3 group hover:bg-black/5 p-1 -mx-1 rounded transition-colors">
            <div className={cn(
                "w-10 h-10 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-gray-600",
                avatar === "bot" ? "bg-transparent" : ""
            )}>
                {avatar === "bot" ? (
                    <div className="relative w-full h-full">
                        <Image
                            src="/main-logo.png"
                            alt="Bot"
                            fill
                            className="object-contain"
                        />
                    </div>
                ) : (
                    <User className="w-6 h-6 text-gray-300" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn("font-medium text-sm hover:underline cursor-pointer", isBot ? "text-white" : "text-gray-100")}>
                        {author}
                    </span>
                    {isBot && (
                        <span className="bg-[#5865F2] text-[10px] text-white px-1.5 rounded flex items-center h-4 uppercase font-bold tracking-wide">
                            APP
                        </span>
                    )}
                    <span className="text-xs text-gray-500 ml-1">{timestamp}</span>
                </div>
                <p className={cn("text-gray-300 text-sm whitespace-pre-wrap font-light mt-0.5", color)}>{content}</p>
            </div>
        </div>
    );
};

const SyncPreview = () => {
    const [step, setStep] = useState(0);

    // Animation sequence loop
    useEffect(() => {
        const interval = setInterval(() => {
            setStep((prev) => (prev + 1) % 4);
        }, 3000); // 3 seconds per step
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full max-w-5xl mx-auto p-4 md:p-8">
            <div className="grid md:grid-cols-2 gap-8 relative">
                {/* Connection Line */}
                <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <motion.div
                        animate={{
                            scale: step === 1 || step === 2 ? [1, 1.2, 1] : 1,
                            opacity: step === 1 || step === 2 ? 1 : 0.3,
                            color: step === 1 || step === 2 ? "#00D1FF" : "#4B5563",
                        }}
                        transition={{ duration: 0.5 }}
                    >
                        {step === 1 || step === 2 ? (
                            <Loader2 className="w-8 h-8 animate-spin text-secondary drop-shadow-[0_0_10px_rgba(0,209,255,0.5)]" />
                        ) : (
                            <div className="w-16 h-1 bg-gray-700/50 rounded-full" />
                        )}
                    </motion.div>
                </div>

                {/* Source Server */}
                <div className="flex flex-col space-y-4">
                    <div className="flex items-center space-x-2 mb-2">
                        <div className="bg-indigo-500/20 p-2 rounded-lg">
                            <Hash className="w-5 h-5 text-indigo-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-200">Source: Alpha Calls</h3>
                    </div>

                    <div className="bg-[#2f3136] rounded-xl border border-white/5 p-4 h-[300px] overflow-hidden flex flex-col font-sans shadow-2xl relative">
                        <div className="absolute top-0 left-0 w-full h-8 bg-[#2f3136] border-b border-white/5 flex items-center px-3 z-10">
                            <span className="text-xs text-gray-400"># crypto-signals</span>
                        </div>
                        <div className="mt-8 flex-1 overflow-y-auto space-y-4 pt-2">
                            <DiscordMessage
                                author="Admin Alpha"
                                avatar="user"
                                timestamp="Today at 10:41 AM"
                                content="Watching $ETH closely here. Possible breakout."
                                color="text-yellow-400"
                            />

                            <AnimatePresence>
                                {step >= 1 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <DiscordMessage
                                            author="Admin Alpha"
                                            avatar="user"
                                            timestamp="Today at 10:42 AM"
                                            content="New Signal: Buy $BTC at 45000, TP 48000. 🚀"
                                            color="text-green-400"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Target Server */}
                <div className="flex flex-col space-y-4">
                    <div className="flex items-center space-x-2 mb-2 justify-end md:justify-start">
                        <div className="bg-cyan-500/20 p-2 rounded-lg order-2 md:order-1">
                            <Hash className="w-5 h-5 text-secondary" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-200 order-1 md:order-2 mr-2 md:mr-0">Target: My Community</h3>
                    </div>

                    <div className="bg-[#2f3136] rounded-xl border border-white/5 p-4 h-[300px] overflow-hidden flex flex-col font-sans shadow-2xl relative">
                        <div className="absolute top-0 left-0 w-full h-8 bg-[#2f3136] border-b border-white/5 flex items-center px-3 z-10">
                            <span className="text-xs text-gray-400"># vip-signals</span>
                        </div>
                        <div className="mt-8 flex-1 overflow-y-auto space-y-4 pt-2">
                            <DiscordMessage
                                author="DISBOT"
                                avatar="bot"
                                timestamp="Today at 10:41 AM"
                                content="Watching $ETH closely here. Possible breakout."
                                isBot
                            />

                            <AnimatePresence>
                                {step >= 3 && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    >
                                        <DiscordMessage
                                            author="DISBOT"
                                            avatar="bot"
                                            timestamp="Today at 10:42 AM"
                                            content="New Signal: Buy $BTC at 45000, TP 48000. 🚀"
                                            isBot
                                            color="text-green-400"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Text Mockup */}
            <div className="mt-8 text-center h-8">
                <AnimatePresence mode="wait">
                    {step === 0 && <motion.p key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-gray-400 text-sm">Waiting for incoming signals...</motion.p>}
                    {step === 1 && <motion.p key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-indigo-400 text-sm font-medium">New message detected in Source!</motion.p>}
                    {step === 2 && <motion.p key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-secondary text-sm font-medium flex items-center justify-center gap-2">Processing & Syncing via DISBOT Engine... <Loader2 className="w-3 h-3 animate-spin" /></motion.p>}
                    {step === 3 && <motion.p key="s3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-green-400 text-sm font-medium flex items-center justify-center gap-2">Synced Instantly! <CheckCheck className="w-4 h-4" /></motion.p>}
                </AnimatePresence>
            </div>

        </div>
    );
};

export default SyncPreview;
