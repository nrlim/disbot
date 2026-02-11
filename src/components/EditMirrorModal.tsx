"use client";

import { useState, useEffect } from "react";
import { X, ChevronDown, Search, CheckCircle2, AlertTriangle, Loader2, Info, Terminal, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { createMirrorConfig, updateMirrorConfig } from "@/actions/mirror";

// --- Types ---

interface Guild {
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
}

export interface MirrorConfig {
    id: string;
    sourceGuildName: string | null;
    sourceChannelId: string;
    targetWebhookUrl: string;
    active: boolean;
    userToken?: string | null;
}

interface EditMirrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    config?: MirrorConfig;
}

// --- Zod Schemas ---
const webhookSchema = z.string().url("Invalid Webhook URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord Webhook URL");
const channelIdSchema = z.string().min(17, "Invalid Channel ID").regex(/^\d+$/, "Channel ID must be numeric");

export default function EditMirrorModal({ isOpen, onClose, onSuccess, config }: EditMirrorModalProps) {
    // Form State
    const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
    const [channelId, setChannelId] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [userToken, setUserToken] = useState("");

    // UI State
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
    const [isGuildDropdownOpen, setIsGuildDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authError, setAuthError] = useState(false);

    // Fetch Guilds when modal opens
    useEffect(() => {
        if (isOpen) {
            // If editing, setup initial state
            if (config) {
                setChannelId(config.sourceChannelId);
                setWebhookUrl(config.targetWebhookUrl);
                // We don't populate userToken for security, user sees empty and can keep existing if valid?
                // Actually server action updates it. If they leave it blank, we might want to keep old.
                // But for now strict re-entry of token might be safer or just expected.
            } else {
                // Reset if adding new
                setChannelId("");
                setWebhookUrl("");
                setUserToken("");
                setSelectedGuild(null);
            }

            if (guilds.length === 0) {
                const fetchGuilds = async () => {
                    setIsLoadingGuilds(true);
                    setAuthError(false);
                    try {
                        const res = await fetch("/api/discord/guilds?all=true");
                        if (res.status === 401) {
                            setAuthError(true);
                            setIsLoadingGuilds(false);
                            return;
                        }
                        if (res.ok) {
                            const data = await res.json();
                            setGuilds(data);
                            // If editing, try to find the guild object by name
                            if (config) {
                                const found = data.find((g: Guild) => g.name === config.sourceGuildName);
                                if (found) setSelectedGuild(found);
                            }
                        }
                    } catch (e) {
                        // silent
                    } finally {
                        setIsLoadingGuilds(false);
                    }
                };
                fetchGuilds();
            } else if (config) {
                // Guilds already loaded, just match
                const found = guilds.find((g: Guild) => g.name === config.sourceGuildName);
                if (found) setSelectedGuild(found);
            }
        }
    }, [isOpen, config]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        if (!selectedGuild) { setError("Please select a source server"); setIsSubmitting(false); return; }

        const channelVal = channelIdSchema.safeParse(channelId);
        if (!channelVal.success) { setError(channelVal.error.issues[0].message); setIsSubmitting(false); return; }

        const webhookVal = webhookSchema.safeParse(webhookUrl);
        if (!webhookVal.success) { setError(webhookVal.error.issues[0].message); setIsSubmitting(false); return; }

        if (!config && !userToken) { setError("User Token is required"); setIsSubmitting(false); return; } // Validate token if new

        const formData = new FormData();
        if (config) {
            formData.append("id", config.id);
        }
        formData.append("sourceGuildName", selectedGuild.name);
        formData.append("sourceChannelId", channelId);
        formData.append("targetWebhookUrl", webhookUrl);
        formData.append("userToken", userToken);

        try {
            const result = config
                ? await updateMirrorConfig(null, formData)
                : await createMirrorConfig(null, formData);

            if (result.error) {
                setError(result.error);
            } else {
                onSuccess();
                onClose();
                // Reset form
                setSelectedGuild(null);
                setChannelId("");
                setWebhookUrl("");
                setUserToken("");
            }
        } catch (e) {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredGuilds = guilds.filter(g =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const isEdit = !!config;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50"
                    />

                    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="bg-zinc-950 border border-zinc-800 w-full max-w-lg shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
                                <div>
                                    <h2 className="text-lg font-mono font-bold text-white uppercase tracking-tight flex items-center gap-2">
                                        <Terminal className="w-5 h-5 text-primary" />
                                        {isEdit ? "Reconfigure Node" : "Initialize Node"}
                                    </h2>
                                    <p className="text-[10px] text-zinc-500 font-mono mt-1 uppercase tracking-wider">
                                        {isEdit ? "Update existing parameters" : "Establish new mirror connection"}
                                    </p>
                                </div>
                                <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-8 overflow-y-auto space-y-8 bg-zinc-950">

                                {/* Info Box - Warning */}
                                <div className="p-3 bg-amber-950/20 border border-amber-900/50 flex gap-3 items-start">
                                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <strong className="text-amber-500 text-xs font-mono block mb-1 uppercase tracking-wide">Sensitive Credential</strong>
                                        <p className="text-[10px] text-amber-500/80 font-mono leading-relaxed">
                                            Your User Token is required for the engine to read messages. It is encrypted at rest using AES-256-GCM.
                                        </p>
                                    </div>
                                </div>

                                <form id="mirror-form" onSubmit={handleSubmit} className="space-y-6">

                                    {/* User Token */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">User Token</label>
                                        <input
                                            type="password"
                                            value={userToken}
                                            onChange={(e) => setUserToken(e.target.value)}
                                            className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm"
                                            placeholder="OTMz..."
                                            autoComplete="off"
                                        />
                                        <p className="text-[10px] text-zinc-600 font-mono">
                                            Found in Discord Console (Ctrl+Shift+I) &gt; Application &gt; Local Storage
                                        </p>
                                    </div>

                                    {/* Source Guild */}
                                    <div className="space-y-2 relative">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Source Server (Reference)</label>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setIsGuildDropdownOpen(!isGuildDropdownOpen)}
                                                className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 flex items-center justify-between text-left transition-colors focus:border-primary outline-none"
                                            >
                                                {selectedGuild ? (
                                                    <div className="flex items-center gap-2 truncate">
                                                        {selectedGuild.icon ? (
                                                            <Image src={selectedGuild.icon} width={20} height={20} alt="" className="rounded-none ring-1 ring-zinc-800" unoptimized />
                                                        ) : (
                                                            <div className="w-5 h-5 bg-zinc-800 flex items-center justify-center text-[8px] text-zinc-400 font-bold">{selectedGuild.name.substring(0, 2)}</div>
                                                        )}
                                                        <span className="text-zinc-200 truncate font-mono text-sm">{selectedGuild.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-zinc-600 text-sm font-mono">SELECT_SOURCE_NAME...</span>
                                                )}
                                                <ChevronDown className="w-4 h-4 text-zinc-600" />
                                            </button>

                                            <AnimatePresence>
                                                {isGuildDropdownOpen && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -5 }}
                                                        className="absolute z-30 top-full left-0 right-0 mt-1 bg-zinc-950 border border-zinc-700 shadow-xl max-h-60 flex flex-col"
                                                    >
                                                        <div className="p-2 border-b border-zinc-800 sticky top-0 bg-zinc-950">
                                                            <div className="relative">
                                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                                                                <input
                                                                    type="text"
                                                                    value={searchQuery}
                                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                                    className="w-full bg-zinc-900/50 text-xs text-zinc-200 pl-9 pr-3 py-2 border border-zinc-800 outline-none focus:border-zinc-600 transition-colors font-mono"
                                                                    placeholder="FILTER_SERVERS..."
                                                                    autoFocus
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="overflow-y-auto p-1 flex-1">
                                                            {isLoadingGuilds ? (
                                                                <div className="p-4 flex justify-center">
                                                                    <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                                                                </div>
                                                            ) : authError ? (
                                                                <div className="p-4 text-center">
                                                                    <p className="text-[10px] text-amber-500 font-mono mb-2">AUTH REQUIRED</p>
                                                                    <a href="/api/auth/signin" className="inline-block px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold font-mono uppercase">Login</a>
                                                                </div>
                                                            ) : filteredGuilds.length > 0 ? (
                                                                filteredGuilds.map(g => (
                                                                    <button
                                                                        key={g.id}
                                                                        type="button"
                                                                        onClick={() => { setSelectedGuild(g); setIsGuildDropdownOpen(false); }}
                                                                        className="w-full flex items-center gap-3 p-2 hover:bg-zinc-900 text-left transition-colors"
                                                                    >
                                                                        {g.icon ? (
                                                                            <Image src={g.icon} width={24} height={24} alt="" className="rounded-none ring-1 ring-zinc-800" unoptimized />
                                                                        ) : (
                                                                            <div className="w-6 h-6 bg-zinc-800 flex items-center justify-center text-[9px] text-zinc-400 font-bold">{g.name.substring(0, 2)}</div>
                                                                        )}
                                                                        <span className="text-xs text-zinc-400 hover:text-white font-mono truncate">{g.name}</span>
                                                                    </button>
                                                                ))
                                                            ) : (
                                                                <div className="p-4 text-center text-[10px] text-zinc-600 font-mono">NO DATA FOUND</div>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    {/* Channel ID */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Channel ID</label>
                                        <input
                                            type="text"
                                            value={channelId}
                                            onChange={(e) => setChannelId(e.target.value)}
                                            className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm"
                                            placeholder="000000000000000000"
                                        />
                                    </div>

                                    {/* Webhook URL */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Target Webhook URL</label>
                                        <input
                                            type="url"
                                            value={webhookUrl}
                                            onChange={(e) => setWebhookUrl(e.target.value)}
                                            className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm"
                                            placeholder="https://discord.com/api/webhooks/..."
                                        />
                                    </div>

                                    {error && (
                                        <div className="p-3 bg-red-950/20 border-l-2 border-red-900 flex items-center gap-3">
                                            <AlertTriangle className="w-4 h-4 text-red-900" />
                                            <span className="text-xs text-red-800 font-mono">{error}</span>
                                        </div>
                                    )}

                                </form>
                            </div>

                            {/* Footer */}
                            <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-6 py-2.5 text-zinc-500 hover:text-white transition-colors text-xs font-mono font-bold uppercase tracking-wider"
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    form="mirror-form"
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 bg-zinc-100 hover:bg-white text-black text-xs font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            PROCESSING...
                                        </span>
                                    ) : (
                                        <span>{isEdit ? "CONFIRM UPDATE" : "INITIALIZE"}</span>
                                    )}
                                </button>
                            </div>
                        </motion.div >
                    </div >
                </>
            )
            }
        </AnimatePresence >
    );
}
