"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ShieldAlert,
    ShieldCheck,
    Bot,
    User,
    ChevronDown,
    Search,
    ArrowRight,
    CheckCircle2,
    AlertTriangle,
    Eye,
    EyeOff,
    Send
} from "lucide-react";
import { z } from "zod";
import Image from "next/image";
import { cn } from "@/lib/utils";

// --- Types & Interfaces ---

type Mode = "expert" | "official";

interface Guild {
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
}

interface ValidationState {
    success: boolean;
    error?: string;
}

// --- Zod Schemas ---

const tokenSchema = z.string().min(50, "Token seems too short").regex(/^[A-Za-z0-9_\-\.]+$/, "Invalid token format");
const webhookSchema = z.string().url("Invalid Webhook URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord Webhook URL");
const channelIdSchema = z.string().min(17, "Invalid Channel ID").max(20, "Invalid Channel ID").regex(/^\d+$/, "Channel ID must be numeric");

// --- Component ---

interface ModeSelectorProps {
    discordClientId?: string;
}

export default function ModeSelector({ discordClientId }: ModeSelectorProps) {
    // State
    const [mode, setMode] = useState<Mode>("expert");
    const [isLoading, setIsLoading] = useState(false);
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    // Form State
    const [userToken, setUserToken] = useState("");
    const [showToken, setShowToken] = useState(false);
    const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
    const [channelId, setChannelId] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [isGuildDropdownOpen, setIsGuildDropdownOpen] = useState(false);

    // Validation State
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [webhookError, setWebhookError] = useState<string | null>(null);
    const [channelError, setChannelError] = useState<string | null>(null);

    // Fetch Guilds based on Mode
    useEffect(() => {
        const fetchGuilds = async () => {
            setIsLoading(true);
            setGuilds([]);
            setSelectedGuild(null);

            try {
                const params = new URLSearchParams();
                if (mode === "expert") {
                    params.append("all", "true");
                }

                const res = await fetch(`/api/discord/guilds?${params.toString()}`);
                if (res.ok) {
                    const data = await res.json();
                    setGuilds(data);
                }
            } catch (error) {
                console.error("Failed to fetch guilds", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchGuilds();
    }, [mode]);

    // Handlers
    const handleModeSwitch = (newMode: Mode) => {
        if (mode === newMode) return;
        setMode(newMode);
        // Reset form specific to mode if needed, but keeping some state might be user-friendly
        // Resetting guild selection as the list changes
        setSelectedGuild(null);
    };

    const validateToken = (token: string) => {
        const result = tokenSchema.safeParse(token);
        if (!result.success) {
            setTokenError(result.error.issues[0].message);
            return false;
        }
        setTokenError(null);
        return true;
    };

    const validateWebhook = (url: string) => {
        const result = webhookSchema.safeParse(url);
        if (!result.success) {
            setWebhookError(result.error.issues[0].message);
            return false;
        }
        setWebhookError(null);
        return true;
    };

    const validateChannel = (id: string) => {
        const result = channelIdSchema.safeParse(id);
        if (!result.success) {
            setChannelError(result.error.issues[0].message);
            return false;
        }
        setChannelError(null);
        return true;
    };

    const handleTestConnection = () => {
        // Mock Test
        if (validateWebhook(webhookUrl)) {
            alert("Test message sent! (Mock)");
        }
    };

    const filteredGuilds = guilds.filter(g =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="w-full max-w-4xl mx-auto space-y-8">

            {/* --- Mode Selector Switch --- */}
            <div className="bg-[#0f172a] p-1 rounded-2xl border border-white/10 flex relative">
                <motion.div
                    layoutId="active-pill"
                    className={cn(
                        "absolute top-1 bottom-1 rounded-xl shadow-lg transition-colors",
                        mode === "expert"
                            ? "left-1 active-expert-bg w-[calc(50%-4px)] bg-amber-500/10 border border-amber-500/50 shadow-amber-500/20"
                            : "left-[50%] active-official-bg w-[calc(50%-4px)] bg-[#5865F2]/10 border border-[#5865F2]/50 shadow-[#5865F2]/20"
                    )}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />

                <button
                    onClick={() => handleModeSwitch("expert")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-3 py-4 rounded-xl relative z-10 transition-colors duration-300",
                        mode === "expert" ? "text-amber-400" : "text-gray-400 hover:text-gray-200"
                    )}
                >
                    <User className="w-5 h-5" />
                    <div>
                        <div className="font-bold text-lg">Expert Mode</div>
                        <div className="text-xs opacity-70">User Token (Any Server)</div>
                    </div>
                    {mode === "expert" && (
                        <motion.div
                            layoutId="glow-expert"
                            className="absolute inset-0 rounded-xl bg-amber-500/5 blur-xl -z-10"
                        />
                    )}
                </button>

                <button
                    onClick={() => handleModeSwitch("official")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-3 py-4 rounded-xl relative z-10 transition-colors duration-300",
                        mode === "official" ? "text-[#5865F2]" : "text-gray-400 hover:text-gray-200"
                    )}
                >
                    <Bot className="w-5 h-5" />
                    <div>
                        <div className="font-bold text-lg">Official Bot</div>
                        <div className="text-xs opacity-70">Verified & Safe</div>
                    </div>
                </button>
            </div>

            {/* --- Main Content Area --- */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="bg-[#1e293b]/50 backdrop-blur-md rounded-2xl border border-white/5 p-8 shadow-2xl overflow-hidden"
                >
                    {/* Header Info */}
                    <div className="mb-8 border-b border-white/5 pb-6">
                        <div className="flex items-start gap-4">
                            <div className={cn(
                                "p-3 rounded-xl shrink-0",
                                mode === "expert" ? "bg-amber-500/10 text-amber-400" : "bg-[#5865F2]/10 text-[#5865F2]"
                            )}>
                                {mode === "expert" ? <ShieldAlert className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-2">
                                    {mode === "expert" ? "Expert Configuration" : "Official Bot Setup"}
                                </h2>
                                <p className="text-gray-400 text-sm leading-relaxed max-w-xl">
                                    {mode === "expert"
                                        ? "Mirror any channel you have joined. This mode uses a User Token to bypass admin requirements. While powerful, please use caution."
                                        : "The recommended, 100% TOS compliant method. Requires 'Manage Guild' permissions to invite the bot."
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Expert Warning */}
                        {mode === "expert" && (
                            <div className="mt-6 flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                <div className="text-sm text-amber-200/80">
                                    <strong className="text-amber-400 block mb-1">Safety Warning</strong>
                                    Using a User Token is technically against Discord ToS and carries a risk of account suspension.
                                    We strongly recommend using a <span className="text-white underline decoration-dashed">secondary or disposable account</span> for this operation.
                                </div>
                            </div>
                        )}

                        {/* Official Invite Button */}
                        {mode === "official" && (
                            <div className="mt-6">
                                <a
                                    href={`https://discord.com/oauth2/authorize?client_id=${discordClientId || "YOUR_CLIENT_ID"}&permissions=536870912&scope=bot`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#5865F2]/25"
                                >
                                    <Bot className="w-5 h-5" />
                                    Invite DISBOT to Server
                                </a>
                            </div>
                        )}
                    </div>

                    {/* --- Unified Configuration Form --- */}
                    <div className="space-y-6">

                        {/* 1. User Token (Expert Only) */}
                        <AnimatePresence>
                            {mode === "expert" && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-2 overflow-hidden"
                                >
                                    <label className="block text-sm font-medium text-gray-300">
                                        Discord User Token <span className="text-amber-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showToken ? "text" : "password"}
                                            value={userToken}
                                            onChange={(e) => {
                                                setUserToken(e.target.value);
                                                validateToken(e.target.value);
                                            }}
                                            className={cn(
                                                "w-full bg-[#0b1121] border text-white rounded-xl px-4 py-3 pr-12 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all outline-none",
                                                tokenError ? "border-red-500/50" : "border-white/10"
                                            )}
                                            placeholder="OTk5..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowToken(!showToken)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                        >
                                            {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    {tokenError && (
                                        <p className="text-red-400 text-xs mt-1">{tokenError}</p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* 2. Source Configuration (Grid) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Guild Selector */}
                            <div className="space-y-2 relative">
                                <label className="block text-sm font-medium text-gray-300">
                                    Source Server <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsGuildDropdownOpen(!isGuildDropdownOpen)}
                                        className={cn(
                                            "w-full flex items-center justify-between bg-[#0b1121] border rounded-xl px-4 py-3 text-left transition-all",
                                            isGuildDropdownOpen ? "border-[#5865F2] ring-2 ring-[#5865F2]/20" : "border-white/10 hover:border-white/20"
                                        )}
                                    >
                                        {selectedGuild ? (
                                            <div className="flex items-center gap-3">
                                                {selectedGuild.icon ? (
                                                    <Image
                                                        src={selectedGuild.icon}
                                                        alt={selectedGuild.name}
                                                        width={24}
                                                        height={24}
                                                        className="rounded-full"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold">
                                                        {selectedGuild.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <span className="font-medium text-white truncate max-w-[180px]">
                                                    {selectedGuild.name}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-500">Select a server...</span>
                                        )}
                                        <ChevronDown className={cn("w-5 h-5 text-gray-500 transition-transform", isGuildDropdownOpen && "rotate-180")} />
                                    </button>

                                    {/* Dropdown Menu */}
                                    <AnimatePresence>
                                        {isGuildDropdownOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute z-50 top-full left-0 right-0 mt-2 bg-[#0b1121] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                                            >
                                                <div className="p-2 border-b border-white/5 sticky top-0 bg-[#0b1121]">
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                        <input
                                                            type="text"
                                                            value={searchQuery}
                                                            onChange={(e) => setSearchQuery(e.target.value)}
                                                            className="w-full bg-[#1e293b] text-sm text-white rounded-lg pl-9 pr-3 py-2 border border-white/5 focus:outline-none focus:border-[#5865F2]"
                                                            placeholder="Search servers..."
                                                            autoFocus
                                                        />
                                                    </div>
                                                </div>
                                                <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                                                    {isLoading ? (
                                                        <div className="p-4 text-center text-gray-500 text-sm">Loading servers...</div>
                                                    ) : filteredGuilds.length > 0 ? (
                                                        filteredGuilds.map((guild) => (
                                                            <button
                                                                key={guild.id}
                                                                onClick={() => {
                                                                    setSelectedGuild(guild);
                                                                    setIsGuildDropdownOpen(false);
                                                                }}
                                                                className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors text-left group"
                                                            >
                                                                <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center shrink-0 border border-transparent group-hover:border-white/20">
                                                                    {guild.icon ? (
                                                                        <Image src={guild.icon} alt={guild.name} width={32} height={32} unoptimized />
                                                                    ) : (
                                                                        <span className="text-xs font-medium text-gray-300">{guild.name.substring(0, 2)}</span>
                                                                    )}
                                                                </div>
                                                                <span className="text-gray-300 group-hover:text-white truncate text-sm font-medium">
                                                                    {guild.name}
                                                                </span>
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className="p-4 text-center text-gray-500 text-sm">No servers found</div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Channel ID Input */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">
                                    Source Channel ID <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={channelId}
                                    onChange={(e) => {
                                        setChannelId(e.target.value);
                                        validateChannel(e.target.value);
                                    }}
                                    className={cn(
                                        "w-full bg-[#0b1121] border text-white rounded-xl px-4 py-3 focus:ring-2 transition-all outline-none",
                                        channelError
                                            ? "border-red-500/50 focus:ring-red-500/20"
                                            : "border-white/10 focus:ring-[#5865F2]/20 focus:border-[#5865F2]/50"
                                    )}
                                    placeholder="123456789012345678"
                                />
                                {channelError && (
                                    <p className="text-red-400 text-xs mt-1">{channelError}</p>
                                )}
                            </div>
                        </div>

                        {/* 3. Target Configuration */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">
                                Destination Webhook URL <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    value={webhookUrl}
                                    onChange={(e) => {
                                        setWebhookUrl(e.target.value);
                                        validateWebhook(e.target.value);
                                    }}
                                    className={cn(
                                        "flex-1 bg-[#0b1121] border text-white rounded-xl px-4 py-3 focus:ring-2 transition-all outline-none",
                                        webhookError
                                            ? "border-red-500/50 focus:ring-red-500/20"
                                            : "border-white/10 focus:ring-[#5865F2]/20 focus:border-[#5865F2]/50"
                                    )}
                                    placeholder="https://discord.com/api/webhooks/..."
                                />
                                <button
                                    type="button"
                                    onClick={handleTestConnection}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 transition-colors flex items-center gap-2"
                                >
                                    <Send className="w-4 h-4" />
                                    Test
                                </button>
                            </div>
                            {webhookError && (
                                <p className="text-red-400 text-xs mt-1">{webhookError}</p>
                            )}
                        </div>

                        {/* 4. Action Buttons */}
                        <div className="pt-6 flex items-center justify-end gap-4 border-t border-white/5">
                            <button
                                type="button"
                                className="px-6 py-3 text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    "px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center gap-2",
                                    mode === "expert"
                                        ? "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-orange-900/20"
                                        : "bg-gradient-to-r from-[#5865F2] to-[#4752C4] hover:from-[#4752C4] hover:to-[#3c45a5] shadow-indigo-900/20"
                                )}
                            >
                                <CheckCircle2 className="w-5 h-5" />
                                Start Mirroring
                            </button>
                        </div>

                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
