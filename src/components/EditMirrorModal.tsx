"use client";

import { useState, useEffect } from "react";
import { X, ChevronDown, Search, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import Image from "next/image";
import { cn } from "@/lib/utils";
import ExpertGuide from "./ExpertGuide";
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
    userToken?: string | null; // Optional if we want to pre-fill (security risk to send back to client? Usually yes. )
    // Ideally we don't send back the token. If editing, maybe leave token blank unless they want to change it?
    // For this MVP, let's assume we might need to re-enter token or handle 'unchanged'.
    // If we don't return userToken from server for security, we can't prefill it.
    // Let's assume user must re-enter token for security or we treat empty token as "don't change".
    // But our schema requires token. Let's start by requiring re-entry or just accepting we don't edit token here often?
    // Actually, user might want to rotate token.
    // Let's ask them to re-enter for now to be safe, or just keep it required.
}

interface EditMirrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    config?: MirrorConfig; // explicit config to edit
}

// --- Zod Schemas ---
const tokenSchema = z.string().min(50, "Token seems too short").regex(/^[A-Za-z0-9_\-\.]+$/, "Invalid token format");
const webhookSchema = z.string().url("Invalid Webhook URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord Webhook URL");
const channelIdSchema = z.string().min(17, "Invalid Channel ID").regex(/^\d+$/, "Channel ID must be numeric");

export default function EditMirrorModal({ isOpen, onClose, onSuccess, config }: EditMirrorModalProps) {
    // Form State
    const [userToken, setUserToken] = useState("");
    const [showToken, setShowToken] = useState(false);
    const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
    const [channelId, setChannelId] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");

    // UI State
    const [showGuide, setShowGuide] = useState(false);
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
    const [isGuildDropdownOpen, setIsGuildDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch Guilds when modal opens
    // Fetch Guilds when modal opens
    useEffect(() => {
        if (isOpen) {
            // If editing, setup initial state and fetch details
            if (config) {
                setChannelId(config.sourceChannelId);
                setWebhookUrl(config.targetWebhookUrl);

                // Fetch detailed config including decrypted token
                const fetchDetails = async () => {
                    try {
                        const res = await fetch(`/api/expert/${config.id}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.userToken) {
                                setUserToken(data.userToken);
                            }
                        }
                    } catch (e) {
                        console.error("Failed to fetch mirror details");
                    }
                };
                fetchDetails();

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
                    try {
                        const res = await fetch("/api/discord/guilds?all=true");
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

        const tokenVal = tokenSchema.safeParse(userToken);
        if (!tokenVal.success) { setError(tokenVal.error.issues[0].message); setIsSubmitting(false); return; }

        if (!selectedGuild) { setError("Please select a source server"); setIsSubmitting(false); return; }

        const channelVal = channelIdSchema.safeParse(channelId);
        if (!channelVal.success) { setError(channelVal.error.issues[0].message); setIsSubmitting(false); return; }

        const webhookVal = webhookSchema.safeParse(webhookUrl);
        if (!webhookVal.success) { setError(webhookVal.error.issues[0].message); setIsSubmitting(false); return; }

        const formData = new FormData();
        if (config) {
            formData.append("id", config.id);
        }
        formData.append("userToken", userToken);
        formData.append("sourceGuildName", selectedGuild.name);
        formData.append("sourceChannelId", channelId);
        formData.append("targetWebhookUrl", webhookUrl);

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
                setUserToken("");
                setSelectedGuild(null);
                setChannelId("");
                setWebhookUrl("");
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
                        className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 transform-gpu"
                    />

                    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="bg-[#0B0F1A] border border-white/10 w-full max-w-2xl rounded-3xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh] ring-1 ring-white/5"
                        >
                            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#161B2B]/40 backdrop-blur-xl">
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">{isEdit ? "Edit Mirror Configuration" : "New Mirror Path"}</h2>
                                    <p className="text-xs text-gray-400 font-medium tracking-wide uppercase mt-1">
                                        {isEdit ? "Update Parameters" : "Advanced Setup"}
                                    </p>
                                </div>
                                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-all transform hover:rotate-90">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-8 overflow-y-auto custom-scrollbar space-y-8 bg-gradient-to-b from-[#0B0F1A] to-[#0f1219]">
                                <div className="p-4 bg-amber-500/5 border-l-2 border-amber-500 rounded-r-xl flex gap-4">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <strong className="text-amber-400 text-sm block mb-1 tracking-wide">SECURITY NOTICE</strong>
                                        <p className="text-xs text-gray-400 leading-relaxed">
                                            User Tokens grant full account access. Use a dedicated service account token to isolate risk.
                                        </p>
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <button
                                        onClick={() => setShowGuide(!showGuide)}
                                        className="text-xs flex items-center gap-1.5 text-[#00D1FF] hover:text-[#00B8E6] font-bold uppercase tracking-wider transition-colors group"
                                    >
                                        <Info className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                                        {showGuide ? "Hide Documentation" : "View Token Guide"}
                                    </button>

                                    <AnimatePresence>
                                        {showGuide && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="pt-4">
                                                    <ExpertGuide />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <form id="mirror-form" onSubmit={handleSubmit} className="space-y-6">
                                    <div className="space-y-3 group">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider group-focus-within:text-[#00D1FF] transition-colors">
                                            User Token <span className="text-red-400">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showToken ? "text" : "password"}
                                                value={userToken}
                                                onChange={(e) => setUserToken(e.target.value)}
                                                className="w-full bg-[#161B2B] border border-white/5 rounded-xl px-4 py-3.5 pr-12 text-white outline-none transition-all placeholder:text-gray-700 focus:bg-[#1c2236] focus:border-[#00D1FF]/30 focus:ring-1 focus:ring-[#00D1FF]/30 shadow-inner"
                                                placeholder={isEdit ? "••••••••••••••••••••••••••••••" : "Paste your user token securely..."}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowToken(!showToken)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white transition-colors"
                                            >
                                                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        {isEdit && <p className="text-[10px] text-gray-500 font-medium">Leave blank to keep current token.</p>}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3 group relative">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider group-focus-within:text-[#00D1FF] transition-colors">Source Server</label>
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsGuildDropdownOpen(!isGuildDropdownOpen)}
                                                    className="w-full bg-[#161B2B] border border-white/5 rounded-xl px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#1c2236] transition-all focus:border-[#00D1FF]/30 focus:ring-1 focus:ring-[#00D1FF]/30 outline-none"
                                                >
                                                    {selectedGuild ? (
                                                        <div className="flex items-center gap-2 truncate">
                                                            {selectedGuild.icon ? (
                                                                <Image src={selectedGuild.icon} width={20} height={20} alt="" className="rounded-full ring-1 ring-white/10" unoptimized />
                                                            ) : (
                                                                <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[8px] text-indigo-200 font-bold">{selectedGuild.name.substring(0, 2)}</div>
                                                            )}
                                                            <span className="text-white truncate font-medium text-sm">{selectedGuild.name}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-500 text-sm">Select Server...</span>
                                                    )}
                                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                                </button>

                                                <AnimatePresence>
                                                    {isGuildDropdownOpen && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            transition={{ duration: 0.15 }}
                                                            className="absolute z-30 top-full left-0 right-0 mt-2 bg-[#161B2B] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 flex flex-col ring-1 ring-black/50"
                                                        >
                                                            <div className="p-2 border-b border-white/5 sticky top-0 bg-[#161B2B] backdrop-blur-xl">
                                                                <div className="relative">
                                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                                                    <input
                                                                        type="text"
                                                                        value={searchQuery}
                                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                                        className="w-full bg-[#0B0F1A] text-xs text-white rounded-lg pl-9 pr-3 py-2.5 border border-white/5 outline-none focus:border-[#00D1FF]/30 transition-colors"
                                                                        placeholder="Filter servers..."
                                                                        autoFocus
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="overflow-y-auto p-1 custom-scrollbar flex-1">
                                                                {isLoadingGuilds ? (
                                                                    <div className="p-8 flex justify-center">
                                                                        <Loader2 className="w-5 h-5 animate-spin text-[#00D1FF]" />
                                                                    </div>
                                                                ) : filteredGuilds.length > 0 ? (
                                                                    filteredGuilds.map(g => (
                                                                        <button
                                                                            key={g.id}
                                                                            type="button"
                                                                            onClick={() => { setSelectedGuild(g); setIsGuildDropdownOpen(false); }}
                                                                            className="w-full flex items-center gap-3 p-2.5 hover:bg-white/5 rounded-lg text-left group/item transition-colors"
                                                                        >
                                                                            {g.icon ? (
                                                                                <Image src={g.icon} width={28} height={28} alt="" className="rounded-full ring-1 ring-white/5 group-hover/item:ring-white/20 transition-all" unoptimized />
                                                                            ) : (
                                                                                <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-[10px] text-white font-bold">{g.name.substring(0, 2)}</div>
                                                                            )}
                                                                            <span className="text-sm text-gray-300 group-hover/item:text-white truncate transition-colors">{g.name}</span>
                                                                        </button>
                                                                    ))
                                                                ) : (
                                                                    <div className="p-4 text-center text-xs text-gray-500">No servers found</div>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        <div className="space-y-3 group">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider group-focus-within:text-[#00D1FF] transition-colors">Channel ID</label>
                                            <input
                                                type="text"
                                                value={channelId}
                                                onChange={(e) => setChannelId(e.target.value)}
                                                className="w-full bg-[#161B2B] border border-white/5 rounded-xl px-4 py-3.5 text-white outline-none transition-all placeholder:text-gray-700 focus:bg-[#1c2236] focus:border-[#00D1FF]/30 focus:ring-1 focus:ring-[#00D1FF]/30 shadow-inner font-mono text-sm"
                                                placeholder="123456789..."
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3 group">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider group-focus-within:text-[#00D1FF] transition-colors">Target Webhook URL</label>
                                        <input
                                            type="url"
                                            value={webhookUrl}
                                            onChange={(e) => setWebhookUrl(e.target.value)}
                                            className="w-full bg-[#161B2B] border border-white/5 rounded-xl px-4 py-3.5 text-white outline-none transition-all placeholder:text-gray-700 focus:bg-[#1c2236] focus:border-[#00D1FF]/30 focus:ring-1 focus:ring-[#00D1FF]/30 shadow-inner font-mono text-sm"
                                            placeholder="https://discord.com/api/webhooks/..."
                                        />
                                    </div>

                                    {error && (
                                        <div className="p-4 bg-red-500/10 border-l-2 border-red-500 rounded-r-xl flex items-center gap-3">
                                            <AlertTriangle className="w-5 h-5 text-red-500" />
                                            <span className="text-sm text-red-400 font-medium">{error}</span>
                                        </div>
                                    )}

                                </form>
                            </div>

                            <div className="p-6 border-t border-white/5 bg-[#161B2B]/40 backdrop-blur-xl flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-6 py-2.5 text-gray-400 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider"
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    form="mirror-form"
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-8 py-2.5 bg-gradient-to-r from-[#00D1FF] to-[#5865F2] hover:opacity-90 text-white rounded-xl shadow-[0_0_20px_rgba(88,101,242,0.3)] text-sm font-bold flex items-center gap-2 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Processing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>{isEdit ? "Update Mirror" : "Create Mirror"}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
