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
        <div className="flex items-start space-x-3 group hover:bg-black/5 p-2 rounded transition-colors">
            <div className={cn(
                "w-10 h-10 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-gray-200",
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
                    <User className="w-6 h-6 text-gray-400" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn("font-semibold text-sm hover:underline cursor-pointer", isBot ? "text-indigo-600" : "text-gray-900")}>
                        {author}
                    </span>
                    {isBot && (
                        <span className="bg-[#5865F2] text-[10px] text-white px-1.5 rounded flex items-center h-4 uppercase font-bold tracking-wide">
                            APP
                        </span>
                    )}
                    <span className="text-xs text-gray-500 ml-1">{timestamp}</span>
                </div>
                <p className={cn("text-gray-700 text-sm whitespace-pre-wrap font-normal mt-0.5 leading-relaxed", color)}>{content}</p>
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
            <div className="flex flex-col md:flex-row gap-8 relative items-center justify-center">

                {/* Source Server */}
                <div className="flex flex-col space-y-4 w-full md:w-1/2">
                    <div className="flex items-center space-x-2 mb-2">
                        <div className="bg-white p-1.5 rounded-lg border border-gray-200 shadow-sm">
                            <Hash className="w-4 h-4 text-gray-500" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Source: Alpha Calls</h3>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-0 h-[320px] overflow-hidden flex flex-col font-sans shadow-lg relative">
                        <div className="w-full h-10 bg-gray-50 border-b border-gray-100 flex items-center px-4 z-10">
                            <Hash className="w-4 h-4 text-gray-400 mr-2" />
                            <span className="text-sm font-semibold text-gray-700">crypto-signals</span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 p-4">
                            <DiscordMessage
                                author="Admin Alpha"
                                avatar="user"
                                timestamp="Today at 10:41 AM"
                                content="Watching $ETH closely here. Possible breakout."
                                color="text-gray-800"
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
                                            color="text-emerald-700 font-medium"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Connection Indicator */}
                <div className="hidden md:flex flex-col items-center justify-center mx-4 gap-2">
                    <motion.div
                        animate={{
                            scale: step === 1 || step === 2 ? [1, 1.1, 1] : 1,
                            opacity: step === 1 || step === 2 ? 1 : 0.5,
                        }}
                        className="p-3 bg-white rounded-full shadow-lg border border-gray-100 z-10 relative"
                    >
                        {step === 2 ? (
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        ) : (
                            <div className={cn("w-6 h-6 rounded-full transition-colors", step >= 3 ? "bg-green-500" : "bg-gray-300")} />
                        )}
                    </motion.div>
                    <div className="h-[2px] w-20 bg-gray-200 absolute -z-0" />
                </div>

                {/* Target Server */}
                <div className="flex flex-col space-y-4 w-full md:w-1/2">
                    <div className="flex items-center space-x-2 mb-2 justify-end md:justify-start">
                        <div className="bg-white p-1.5 rounded-lg border border-gray-200 shadow-sm order-2 md:order-1">
                            <Hash className="w-4 h-4 text-primary" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide order-1 md:order-2 mr-2 md:mr-0">Target: My Community</h3>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-0 h-[320px] overflow-hidden flex flex-col font-sans shadow-lg relative">
                        <div className="w-full h-10 bg-gray-50 border-b border-gray-100 flex items-center px-4 z-10">
                            <Hash className="w-4 h-4 text-gray-400 mr-2" />
                            <span className="text-sm font-semibold text-gray-700">vip-signals</span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 p-4">
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
                                            color="text-emerald-700 font-medium"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Text Mockup */}
            <div className="mt-10 text-center h-8">
                <AnimatePresence mode="wait">
                    {step === 0 && <motion.p key="s0" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-gray-400 text-sm font-medium">Waiting for incoming signals...</motion.p>}
                    {step === 1 && <motion.p key="s1" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-indigo-600 text-sm font-bold">New message detected in Source!</motion.p>}
                    {step === 2 && <motion.p key="s2" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-primary text-sm font-bold flex items-center justify-center gap-2">Processing & Syncing... <Loader2 className="w-3.5 h-3.5 animate-spin" /></motion.p>}
                    {step === 3 && <motion.p key="s3" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-green-600 text-sm font-bold flex items-center justify-center gap-2">Synced Instantly! <CheckCheck className="w-4 h-4" /></motion.p>}
                </AnimatePresence>
            </div>

        </div>
    );
};

export default SyncPreview;
