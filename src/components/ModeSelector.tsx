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
    Terminal,
    AlertCircle
} from "lucide-react";
import { z } from "zod";
import Image from "next/image";
import { cn } from "@/lib/utils";
import ComingSoonModal from "@/components/ComingSoonModal";

// --- Types & Interfaces ---

type Mode = "custom" | "managed";

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
    const [mode, setMode] = useState<Mode>("custom");
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
    const [isComingSoonOpen, setIsComingSoonOpen] = useState(false);

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
                if (mode === "custom") {
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
        if (newMode === "managed") {
            setIsComingSoonOpen(true);
            return;
        }
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
            <div className="bg-gray-100 p-1 rounded-xl flex relative">
                <motion.div
                    layoutId="active-pill"
                    className={cn(
                        "absolute top-1 bottom-1 transition-colors z-0 bg-white border border-gray-200 shadow-sm rounded-lg",
                        mode === "custom"
                            ? "left-1 w-[calc(50%-4px)]"
                            : "left-[50%] w-[calc(50%-4px)]"
                    )}
                    transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                />

                <button
                    onClick={() => handleModeSwitch("custom")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-3 py-3 relative z-10 transition-colors duration-200",
                        mode === "custom" ? "text-primary" : "text-gray-500 hover:text-gray-700"
                    )}
                >
                    <User className="w-4 h-4" />
                    <div className="text-left">
                        <div className="font-bold text-xs uppercase tracking-wider">Custom Hook</div>
                        <div className="text-[10px] opacity-70">User Token (Any Server)</div>
                    </div>
                </button>

                <button
                    onClick={() => handleModeSwitch("managed")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-3 py-3 relative z-10 transition-colors duration-200",
                        mode === "managed" ? "text-emerald-600" : "text-gray-500 hover:text-gray-700"
                    )}
                >
                    <Bot className="w-4 h-4" />
                    <div className="text-left">
                        <div className="font-bold text-xs uppercase tracking-wider">Managed Bot</div>
                        <div className="text-[10px] opacity-70">Verified & Safe</div>
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
                    className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 overflow-hidden"
                >
                    {/* Header Info */}
                    <div className="mb-8 border-b border-gray-100 pb-6">
                        <div className="flex items-start gap-4">
                            <div className={cn(
                                "p-3 border rounded-lg shrink-0",
                                mode === "custom" ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-emerald-50 border-emerald-200 text-emerald-600"
                            )}>
                                {mode === "custom" ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2 uppercase tracking-tight">
                                    {mode === "custom" ? "Custom Hook Configuration" : "Managed Bot Setup"}
                                </h2>
                                <p className="text-gray-500 text-sm leading-relaxed max-w-xl">
                                    {mode === "custom"
                                        ? "Mirror any channel via User Token. Bypasses admin requirements. Powerful but requires caution."
                                        : "Recommended, TOS-compliant method. Requires 'Manage Guild' permissions to invite the bot."
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Custom Hook Warning */}
                        {mode === "custom" && (
                            <div className="mt-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="text-xs text-amber-800">
                                    <strong className="text-amber-900 block mb-1 uppercase">Warning: Account Safety</strong>
                                    Using a User Token is technically against Discord ToS.
                                    We recommend using a <span className="underline decoration-dashed font-semibold">secondary account</span>.
                                </div>
                            </div>
                        )}

                        {/* Managed Invite Button */}
                        {mode === "managed" && (
                            <div className="mt-6">
                                <a
                                    href={`https://discord.com/oauth2/authorize?client_id=${discordClientId || "YOUR_CLIENT_ID"}&permissions=536870912&scope=bot`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition-all rounded-lg shadow-sm"
                                >
                                    <Bot className="w-4 h-4" />
                                    Invite DISBOT to Server
                                </a>
                            </div>
                        )}
                    </div>

                    {/* --- Unified Configuration Form --- */}
                    <div className="space-y-6">

                        {/* 1. User Token (Custom Hook Only) */}
                        <AnimatePresence>
                            {mode === "custom" && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-2 overflow-hidden"
                                >
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Discord User Token <span className="text-red-500">*</span>
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
                                                "w-full bg-white border px-4 py-3 pr-12 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-mono text-sm placeholder:text-gray-400 rounded-lg text-gray-900",
                                                tokenError ? "border-red-300 focus:border-red-500 focus:ring-red-200" : "border-gray-200"
                                            )}
                                            placeholder="OTk5..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowToken(!showToken)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {tokenError && (
                                        <div className="flex items-center gap-1.5 mt-1.5 text-red-600">
                                            <AlertCircle className="w-3 h-3" />
                                            <p className="text-xs font-medium">{tokenError}</p>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* 2. Source Configuration (Grid) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Guild Selector */}
                            <div className="space-y-2 relative">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Source Server <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsGuildDropdownOpen(!isGuildDropdownOpen)}
                                        className={cn(
                                            "w-full flex items-center justify-between bg-white border px-4 py-3 text-left transition-all rounded-lg",
                                            isGuildDropdownOpen ? "border-primary ring-2 ring-primary/20" : "border-gray-200 hover:border-gray-300"
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
                                                        className="rounded-full"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[9px] font-bold text-gray-500">
                                                        {selectedGuild.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <span className="font-medium text-sm text-gray-900 truncate max-w-[180px]">
                                                    {selectedGuild.name}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-500 text-sm">Select a server...</span>
                                        )}
                                        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isGuildDropdownOpen && "rotate-180")} />
                                    </button>

                                    {/* Dropdown Menu */}
                                    <AnimatePresence>
                                        {isGuildDropdownOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
                                            >
                                                <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                                        <input
                                                            type="text"
                                                            value={searchQuery}
                                                            onChange={(e) => setSearchQuery(e.target.value)}
                                                            className="w-full bg-gray-50 text-xs text-gray-900 pl-9 pr-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                                            placeholder="Search servers..."
                                                            autoFocus
                                                        />
                                                    </div>
                                                </div>
                                                <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                                                    {isLoading ? (
                                                        <div className="p-4 text-center text-gray-400 text-xs">Loading servers...</div>
                                                    ) : filteredGuilds.length > 0 ? (
                                                        filteredGuilds.map((guild) => (
                                                            <button
                                                                key={guild.id}
                                                                onClick={() => {
                                                                    setSelectedGuild(guild);
                                                                    setIsGuildDropdownOpen(false);
                                                                }}
                                                                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors text-left group"
                                                            >
                                                                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0 border border-gray-200 overflow-hidden">
                                                                    {guild.icon ? (
                                                                        <Image src={guild.icon} alt={guild.name} width={32} height={32} unoptimized className="object-cover w-full h-full" />
                                                                    ) : (
                                                                        <span className="text-[10px] font-bold text-gray-400">{guild.name.substring(0, 2)}</span>
                                                                    )}
                                                                </div>
                                                                <span className="text-gray-700 font-medium text-sm truncate">
                                                                    {guild.name}
                                                                </span>
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className="p-4 text-center text-gray-400 text-xs">No servers found</div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Channel ID Input */}
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
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
                                        "w-full bg-white border px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm placeholder:text-gray-400 rounded-lg text-gray-900",
                                        channelError
                                            ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                                            : "border-gray-200 focus:border-primary"
                                    )}
                                    placeholder="123456789012345678"
                                />
                                {channelError && (
                                    <div className="flex items-center gap-1.5 mt-1.5 text-red-600">
                                        <AlertCircle className="w-3 h-3" />
                                        <p className="text-xs font-medium">{channelError}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. Target Configuration */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
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
                                        "flex-1 bg-white border px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm placeholder:text-gray-400 rounded-lg text-gray-900",
                                        webhookError
                                            ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                                            : "border-gray-200 focus:border-primary"
                                    )}
                                    placeholder="https://discord.com/api/webhooks/..."
                                />
                                <button
                                    type="button"
                                    onClick={handleTestConnection}
                                    className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 transition-colors flex items-center gap-2 rounded-lg font-bold text-xs uppercase shadow-sm"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Test
                                </button>
                            </div>
                            {webhookError && (
                                <div className="flex items-center gap-1.5 mt-1.5 text-red-600">
                                    <AlertCircle className="w-3 h-3" />
                                    <p className="text-xs font-medium">{webhookError}</p>
                                </div>
                            )}
                        </div>

                        {/* 4. Action Buttons */}
                        <div className="pt-6 flex items-center justify-end gap-3 border-t border-gray-100">
                            <button
                                type="button"
                                className="px-5 py-2.5 text-gray-500 hover:text-gray-900 transition-colors font-bold text-xs uppercase tracking-wider"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    "px-6 py-2.5 font-bold text-white transition-all flex items-center gap-2 text-xs uppercase tracking-widest rounded-lg shadow-sm hover:shadow-md active:scale-95",
                                    mode === "custom"
                                        ? "bg-amber-500 hover:bg-amber-600"
                                        : "bg-emerald-600 hover:bg-emerald-700"
                                )}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                Start Mirroring
                            </button>
                        </div>

                    </div>
                </motion.div>
            </AnimatePresence>
            <ComingSoonModal isOpen={isComingSoonOpen} onClose={() => setIsComingSoonOpen(false)} featureName="Managed Bot" />
        </div>
    );
}
