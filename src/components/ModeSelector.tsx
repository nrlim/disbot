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
    CheckCircle2,
    AlertTriangle,
    Eye,
    EyeOff,
    Send,
    Terminal
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
            <div className="bg-zinc-950 p-0.5 border border-zinc-800 flex relative">
                <motion.div
                    layoutId="active-pill"
                    className={cn(
                        "absolute top-0.5 bottom-0.5 transition-colors z-0 bg-zinc-900 border border-zinc-700 shadow-sm",
                        mode === "expert"
                            ? "left-0.5 w-[calc(50%-2px)]"
                            : "left-[50%] w-[calc(50%-2px)]"
                    )}
                    transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                />

                <button
                    onClick={() => handleModeSwitch("expert")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-3 py-4 relative z-10 transition-colors duration-200",
                        mode === "expert" ? "text-primary" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <User className="w-4 h-4" />
                    <div className="text-left">
                        <div className="font-mono font-bold text-xs uppercase tracking-wider">Expert Mode</div>
                        <div className="text-[10px] font-mono opacity-70">User Token (Any Server)</div>
                    </div>
                </button>

                <button
                    onClick={() => handleModeSwitch("official")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-3 py-4 relative z-10 transition-colors duration-200",
                        mode === "official" ? "text-emerald-500" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <Bot className="w-4 h-4" />
                    <div className="text-left">
                        <div className="font-mono font-bold text-xs uppercase tracking-wider">Official Bot</div>
                        <div className="text-[10px] font-mono opacity-70">Verified & Safe</div>
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
                    transition={{ duration: 0.2 }}
                    className="bg-zinc-950 border border-zinc-800 p-8 overflow-hidden"
                >
                    {/* Header Info */}
                    <div className="mb-8 border-b border-zinc-800 pb-6">
                        <div className="flex items-start gap-4">
                            <div className={cn(
                                "p-3 border shrink-0",
                                mode === "expert" ? "bg-amber-950/10 border-amber-900/50 text-amber-500" : "bg-emerald-950/10 border-emerald-900/50 text-emerald-500"
                            )}>
                                {mode === "expert" ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white mb-2 font-mono uppercase tracking-tight">
                                    {mode === "expert" ? "Expert Configuration" : "Official Bot Setup"}
                                </h2>
                                <p className="text-zinc-400 text-sm font-mono leading-relaxed max-w-xl">
                                    {mode === "expert"
                                        ? "Mirror any channel via User Token. Bypasses admin requirements. Powerful but requires caution."
                                        : "Recommended, TOS-compliant method. Requires 'Manage Guild' permissions to invite the bot."
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Expert Warning */}
                        {mode === "expert" && (
                            <div className="mt-6 flex items-start gap-3 p-4 bg-amber-950/10 border-l-2 border-amber-500">
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-amber-500/80 font-mono">
                                    <strong className="text-amber-500 block mb-1 uppercase">Warning: Account Safety</strong>
                                    Using a User Token is technically against Discord ToS.
                                    We recommend using a <span className="underline decoration-dashed">secondary account</span>.
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
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all"
                                >
                                    <Bot className="w-4 h-4" />
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
                                    <label className="block text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
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
                                                "w-full bg-zinc-900 border text-white px-4 py-3 pr-12 focus:border-primary transition-all outline-none font-mono text-sm placeholder:text-zinc-700 rounded-none",
                                                tokenError ? "border-red-900 focus:border-red-500" : "border-zinc-800"
                                            )}
                                            placeholder="OTk5..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowToken(!showToken)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors"
                                        >
                                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {tokenError && (
                                        <p className="text-red-500 text-[10px] font-mono mt-1 uppercase">{tokenError}</p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* 2. Source Configuration (Grid) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Guild Selector */}
                            <div className="space-y-2 relative">
                                <label className="block text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                                    Source Server <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsGuildDropdownOpen(!isGuildDropdownOpen)}
                                        className={cn(
                                            "w-full flex items-center justify-between bg-zinc-900 border px-4 py-3 text-left transition-all rounded-none",
                                            isGuildDropdownOpen ? "border-primary" : "border-zinc-800 hover:border-zinc-700"
                                        )}
                                    >
                                        {selectedGuild ? (
                                            <div className="flex items-center gap-3">
                                                {selectedGuild.icon ? (
                                                    <Image
                                                        src={selectedGuild.icon}
                                                        alt={selectedGuild.name}
                                                        width={20}
                                                        height={20}
                                                        className="rounded-none grayscale group-hover:grayscale-0"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="w-5 h-5 bg-zinc-800 flex items-center justify-center text-[8px] font-bold font-mono">
                                                        {selectedGuild.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <span className="font-mono text-sm text-zinc-200 truncate max-w-[180px]">
                                                    {selectedGuild.name}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-zinc-600 font-mono text-sm">Select a server...</span>
                                        )}
                                        <ChevronDown className={cn("w-4 h-4 text-zinc-600 transition-transform", isGuildDropdownOpen && "rotate-180")} />
                                    </button>

                                    {/* Dropdown Menu */}
                                    <AnimatePresence>
                                        {isGuildDropdownOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden"
                                            >
                                                <div className="p-2 border-b border-zinc-800 sticky top-0 bg-zinc-950">
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                                                        <input
                                                            type="text"
                                                            value={searchQuery}
                                                            onChange={(e) => setSearchQuery(e.target.value)}
                                                            className="w-full bg-zinc-900 text-xs text-white pl-8 pr-3 py-2 border border-zinc-800 focus:outline-none focus:border-primary font-mono rounded-none"
                                                            placeholder="SEARCH..."
                                                            autoFocus
                                                        />
                                                    </div>
                                                </div>
                                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                                    {isLoading ? (
                                                        <div className="p-4 text-center text-zinc-500 text-xs font-mono">LOADING...</div>
                                                    ) : filteredGuilds.length > 0 ? (
                                                        filteredGuilds.map((guild) => (
                                                            <button
                                                                key={guild.id}
                                                                onClick={() => {
                                                                    setSelectedGuild(guild);
                                                                    setIsGuildDropdownOpen(false);
                                                                }}
                                                                className="w-full flex items-center gap-3 p-3 hover:bg-zinc-900/50 transition-colors text-left group border-b border-zinc-900 last:border-0"
                                                            >
                                                                <div className="w-6 h-6 bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700 group-hover:border-white/50">
                                                                    {guild.icon ? (
                                                                        <Image src={guild.icon} alt={guild.name} width={24} height={24} unoptimized className="object-cover" />
                                                                    ) : (
                                                                        <span className="text-[10px] font-mono text-zinc-400">{guild.name.substring(0, 2)}</span>
                                                                    )}
                                                                </div>
                                                                <span className="text-zinc-400 group-hover:text-white truncate text-xs font-mono uppercase tracking-tight">
                                                                    {guild.name}
                                                                </span>
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className="p-4 text-center text-zinc-500 text-xs font-mono">NO SERVERS FOUND</div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Channel ID Input */}
                            <div className="space-y-2">
                                <label className="block text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
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
                                        "w-full bg-zinc-900 border text-white px-4 py-3 focus:outline-none transition-all font-mono text-sm placeholder:text-zinc-700 rounded-none",
                                        channelError
                                            ? "border-red-900 focus:border-red-500"
                                            : "border-zinc-800 focus:border-primary"
                                    )}
                                    placeholder="123456789012345678"
                                />
                                {channelError && (
                                    <p className="text-red-500 text-[10px] font-mono mt-1 uppercase">{channelError}</p>
                                )}
                            </div>
                        </div>

                        {/* 3. Target Configuration */}
                        <div className="space-y-2">
                            <label className="block text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
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
                                        "flex-1 bg-zinc-900 border text-white px-4 py-3 focus:outline-none transition-all font-mono text-sm placeholder:text-zinc-700 rounded-none",
                                        webhookError
                                            ? "border-red-900 focus:border-red-500"
                                            : "border-zinc-800 focus:border-primary"
                                    )}
                                    placeholder="https://discord.com/api/webhooks/..."
                                />
                                <button
                                    type="button"
                                    onClick={handleTestConnection}
                                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-colors flex items-center gap-2 rounded-none font-mono text-xs uppercase"
                                >
                                    <Send className="w-3 h-3" />
                                    Test
                                </button>
                            </div>
                            {webhookError && (
                                <p className="text-red-500 text-[10px] font-mono mt-1 uppercase">{webhookError}</p>
                            )}
                        </div>

                        {/* 4. Action Buttons */}
                        <div className="pt-6 flex items-center justify-end gap-4 border-t border-zinc-800">
                            <button
                                type="button"
                                className="px-6 py-3 text-zinc-500 hover:text-white transition-colors font-mono text-xs uppercase tracking-wider border border-transparent hover:border-zinc-800"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    "px-8 py-3 font-bold text-black transition-all flex items-center gap-2 font-mono text-xs uppercase tracking-widest rounded-none",
                                    mode === "expert"
                                        ? "bg-amber-500 hover:bg-amber-400"
                                        : "bg-emerald-500 hover:bg-emerald-400"
                                )}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                Start Mirroring
                            </button>
                        </div>

                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
