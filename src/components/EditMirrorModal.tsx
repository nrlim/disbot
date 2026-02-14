"use client";

import { useState, useEffect } from "react";
import { X, ChevronDown, Search, CheckCircle2, AlertTriangle, Loader2, Info, Terminal, ShieldAlert, Eye, EyeOff, Layers, FileText, Signal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { createMirrorConfig, updateMirrorConfig, bulkCreateMirrorConfig } from "@/actions/mirror";
import { getGuildsForAccount, addDiscordAccount, getChannelsForGuild, getWebhooksForChannel, createWebhook } from "@/actions/discord-account";
import { sendTelegramCode, loginTelegram } from "@/actions/telegramAuth";

// --- Types ---

interface Guild {
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
}

interface Channel {
    id: string;
    name: string;
    type: number;
    position: number;
    parentId?: string | null;
}

export interface MirrorConfig {
    id: string;
    sourcePlatform?: 'DISCORD' | 'TELEGRAM';
    sourceGuildName: string | null;
    sourceChannelId: string | null;
    targetWebhookUrl: string | null;
    active: boolean;
    userToken?: string | null;
    telegramSession?: string | null;
    telegramChatId?: string | null;
    telegramTopicId?: string | null;
    discordAccountId?: string | null;
}

interface EditMirrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    config?: MirrorConfig;
    accounts?: any[];
}

// --- Zod Schemas ---
const webhookSchema = z.string().url("Invalid Webhook URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord Webhook URL");
const channelIdSchema = z.string().min(17, "Invalid Channel ID").regex(/^\d+$/, "Channel ID must be numeric");

export default function EditMirrorModal({ isOpen, onClose, onSuccess, config, accounts }: EditMirrorModalProps) {
    // Form State
    const [sourcePlatform, setSourcePlatform] = useState<'DISCORD' | 'TELEGRAM'>('DISCORD');
    const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
    const [manualGuildName, setManualGuildName] = useState(""); // For Telegram source name
    const [channelId, setChannelId] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [userToken, setUserToken] = useState("");
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [useSavedAccount, setUseSavedAccount] = useState(true);

    // Target Lookup State - Enforce CHANNEL mode
    const [targetMode, setTargetMode] = useState<'CHANNEL'>('CHANNEL');
    const [targetGuild, setTargetGuild] = useState<Guild | null>(null);
    const [targetChannels, setTargetChannels] = useState<Channel[]>([]);
    const [targetChannelId, setTargetChannelId] = useState("");
    const [targetSearchQuery, setTargetSearchQuery] = useState("");
    const [targetChannelSearchQuery, setTargetChannelSearchQuery] = useState("");
    const [webhooks, setWebhooks] = useState<any[]>([]);
    const [selectedWebhook, setSelectedWebhook] = useState<any | null>(null);
    const [isTargetGuildDropdownOpen, setIsTargetGuildDropdownOpen] = useState(false);
    const [isTargetChannelDropdownOpen, setIsTargetChannelDropdownOpen] = useState(false);
    const [isLoadingTargetChannels, setIsLoadingTargetChannels] = useState(false);
    const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
    const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
    const [webhookError, setWebhookError] = useState("");

    // Account Management State (Local)
    const [localAccounts, setLocalAccounts] = useState<any[]>(accounts || []);
    const [isAddingAccount, setIsAddingAccount] = useState(false);
    const [newAccountToken, setNewAccountToken] = useState("");
    const [isAddingAccountLoading, setIsAddingAccountLoading] = useState(false);
    const [addAccountError, setAddAccountError] = useState("");

    // Telegram State
    const [telegramSession, setTelegramSession] = useState("");
    const [telegramChatId, setTelegramChatId] = useState("");
    const [telegramTopicId, setTelegramTopicId] = useState("");

    const [showUserToken, setShowUserToken] = useState(false);
    const [showTelegramSession, setShowTelegramSession] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [showTelegramGuide, setShowTelegramGuide] = useState(false);

    // Telegram Auth State
    const [telegramPhone, setTelegramPhone] = useState("");
    const [phoneCodeHash, setPhoneCodeHash] = useState("");
    const [tempSession, setTempSession] = useState("");
    const [telegramCode, setTelegramCode] = useState("");
    const [telegramPassword, setTelegramPassword] = useState("");
    const [authStep, setAuthStep] = useState<'PHONE' | 'CODE' | 'PASSWORD'>('PHONE');
    const [isAuthLoading, setIsAuthLoading] = useState(false);

    // Bulk State
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkText, setBulkText] = useState("");

    // UI State
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
    const [isLoadingChannels, setIsLoadingChannels] = useState(false);
    const [isGuildDropdownOpen, setIsGuildDropdownOpen] = useState(false);
    const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
    const [channelSearchQuery, setChannelSearchQuery] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authError, setAuthError] = useState(false);

    // Fetch Guilds when modal opens
    useEffect(() => {
        if (isOpen) {
            // Initialize local accounts from prop
            setLocalAccounts(accounts || []);
            setIsAddingAccount(false);
            setNewAccountToken("");

            // If editing, setup initial state
            if (config) {
                setSourcePlatform(config.sourcePlatform || 'DISCORD');
                setWebhookUrl(config.targetWebhookUrl || "");

                if (config.sourcePlatform === 'TELEGRAM') {
                    setManualGuildName(config.sourceGuildName || "");
                    // For Telegram, the session string is passed via userToken prop (decrypted by page)
                    setTelegramSession(config.telegramSession || config.userToken || "");
                    // Chat ID is now stored in sourceChannelId
                    setTelegramChatId(config.telegramChatId || config.sourceChannelId || "");
                    setTelegramTopicId(""); // Feature removed from schema
                } else {
                    setChannelId(config.sourceChannelId || "");
                    if (config.discordAccountId) {
                        setSelectedAccountId(config.discordAccountId);
                        setUseSavedAccount(true);
                    } else if (config.userToken) {
                        setUserToken(config.userToken);
                        setUseSavedAccount(false);
                    }
                }

                setIsBulkMode(false);
            } else {
                // Reset if adding new
                // Check localStorage for draft session
                const draftSession = localStorage.getItem("draft_telegram_session");
                if (draftSession) {
                    setTelegramSession(draftSession);
                    setManualGuildName("");
                } else {
                    setTelegramSession("");
                }
                setSourcePlatform('DISCORD');

                setChannelId("");
                setWebhookUrl("");
                setUserToken("");
                setTelegramChatId("");
                setTelegramTopicId("");
                setTelegramTopicId("");
                setSelectedGuild(null);
                setChannels([]);
                setBulkText("");
                setSelectedAccountId(null);
                setUseSavedAccount(true); // Default to saved account
            }
        }
    }, [isOpen, config, accounts]);

    // Fetch Guilds when account changes or mode changes
    useEffect(() => {
        if (!isOpen || !sourcePlatform || sourcePlatform !== 'DISCORD') return;

        const fetchGuilds = async () => {
            setIsLoadingGuilds(true);
            setAuthError(false);
            setGuilds([]); // Clear previous

            try {
                let data = [];
                if (useSavedAccount && selectedAccountId) {
                    // Fetch for specific account
                    const res = await getGuildsForAccount(selectedAccountId);
                    if (res.error) {
                        // setAuthError(true); // Maybe show specific error?
                    } else {
                        data = res;
                    }
                } else if (!useSavedAccount) {
                    // Fetch for login session (Manual mode fallback or default)
                    const res = await fetch("/api/discord/guilds?all=true");
                    if (res.status === 401) {
                        setAuthError(true);
                        return; // Stop here
                    }
                    if (res.ok) {
                        data = await res.json();
                    }
                }

                if (data && Array.isArray(data)) {
                    setGuilds(data);
                    // If editing DISCORD, try to find the guild object by name
                    if (config && (!config.sourcePlatform || config.sourcePlatform === 'DISCORD')) {
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

        // Debounce? No, just run on dependency change
        if (useSavedAccount && !selectedAccountId) {
            setGuilds([]); // No account selected
        } else {
            fetchGuilds();
        }

    }, [isOpen, sourcePlatform, useSavedAccount, selectedAccountId, config]);

    // Fetch Channels when Guild is selected
    useEffect(() => {
        if (!isOpen || !selectedGuild || !selectedAccountId || !useSavedAccount) {
            setChannels([]);
            return;
        }

        const fetchChannels = async () => {
            setIsLoadingChannels(true);
            try {
                const res = await getChannelsForGuild(selectedAccountId, selectedGuild.id);
                if (res.error) {
                    // Handle error silently or show toast
                    console.error(res.error);
                } else {
                    setChannels(res);
                    // If editing, check if current channelId exists in list (optional validation)
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoadingChannels(false);
            }
        };

        fetchChannels();
    }, [selectedGuild, selectedAccountId, useSavedAccount, isOpen]);

    // Original Guild Fetch Effect (Removed/Replaced above)
    /*
    useEffect(() => {
    ...
    }, [isOpen, config]);
    */

    // Auth Handlers
    const handleSendCode = async () => {
        setIsAuthLoading(true);
        setAuthError(false);
        try {
            const result = await sendTelegramCode(telegramPhone);
            if (result.error) {
                setError(result.error);
            } else if (result.phoneCodeHash) {
                setPhoneCodeHash(result.phoneCodeHash);
                if (result.tempSession) setTempSession(result.tempSession);
                setAuthStep('CODE');
            }
        } catch (e) {
            setError("Failed to send code. Please check your phone number.");
        } finally {
            setIsAuthLoading(false);
        }
    };

    const handleLogin = async () => {
        setIsAuthLoading(true);
        setAuthError(false);
        try {
            const result = await loginTelegram({
                phoneNumber: telegramPhone,
                phoneCodeHash: phoneCodeHash!,
                phoneCode: telegramCode,
                tempSession: tempSession,
                password: telegramPassword
            });

            if (result.error) {
                if (result.error.includes("2FA Password Required") || result.error.includes("SESSION_PASSWORD_NEEDED")) {
                    setAuthStep('PASSWORD');
                    setError(null);
                } else {
                    setError(result.error);
                }
            } else if (result.sessionString) {
                setTelegramSession(result.sessionString);
                localStorage.setItem("draft_telegram_session", result.sessionString);
                // Auto-fill chatId instruction if possible or just let user do it
            }
        } catch (e: any) {
            console.error(e);
            if (e.message && (e.message.includes("2FA Password Required") || e.message.includes("SESSION_PASSWORD_NEEDED"))) {
                setAuthStep('PASSWORD');
                setError(null); // Clear error as we are moving to next step
            } else {
                setError("Login failed: " + (e.message || "Unknown error"));
            }
        } finally {
            setIsAuthLoading(false);
        }
    };

    const handleAddNewAccount = async () => {
        if (!newAccountToken.trim()) return;
        setIsAddingAccountLoading(true);
        setAddAccountError("");

        try {
            const res: any = await addDiscordAccount(newAccountToken);
            if (res.error) {
                setAddAccountError(res.error);
            } else if (res.success && res.account) {
                // Success
                const newAcc = res.account;

                // Update local list
                setLocalAccounts(prev => {
                    // Check if exists
                    const exists = prev.find(a => a.id === newAcc.id);
                    if (exists) return prev.map(a => a.id === newAcc.id ? newAcc : a);
                    return [newAcc, ...prev];
                });

                // Select the new account
                setSelectedAccountId(newAcc.id);

                // Close add mode
                setIsAddingAccount(false);
                setNewAccountToken("");
            }
        } catch (e) {
            setAddAccountError("Internal Error");
        } finally {
            setIsAddingAccountLoading(false);
        }
    };

    // --- Target Logic ---
    useEffect(() => {
        if (targetMode === 'CHANNEL' && targetGuild && selectedAccountId) {
            const fetchCh = async () => {
                setIsLoadingTargetChannels(true);
                try {
                    const res = await getChannelsForGuild(selectedAccountId, targetGuild.id);
                    if (!res.error) setTargetChannels(res);
                } catch (e) { } finally { setIsLoadingTargetChannels(false); }
            };
            fetchCh();
        } else {
            setTargetChannels([]);
        }
    }, [targetGuild, targetMode, selectedAccountId]);

    useEffect(() => {
        if (targetMode === 'CHANNEL' && targetChannelId && selectedAccountId) {
            const fetchWh = async () => {
                setIsLoadingWebhooks(true);
                setWebhookError("");
                try {
                    const res = await getWebhooksForChannel(selectedAccountId, targetChannelId);
                    if (res.error) {
                        // setWebhookError(res.error);
                        setWebhooks([]);
                    } else {
                        setWebhooks(res);
                        // Auto-select if only one? No, let user choose
                    }
                } catch (e) { setWebhookError("Failed to fetch"); }
                finally { setIsLoadingWebhooks(false); }
            };
            fetchWh();
        } else {
            setWebhooks([]);
        }
    }, [targetChannelId, targetMode, selectedAccountId]);

    const handleCreateWebhook = async () => {
        if (!targetChannelId || !selectedAccountId) return;
        setIsCreatingWebhook(true);
        setWebhookError("");
        try {
            const res: any = await createWebhook(selectedAccountId, targetChannelId, "Disbot Mirror");
            if (res.error) {
                setWebhookError(res.error);
            } else if (res.success && res.webhook) {
                setWebhooks(prev => [...prev, res.webhook]);
                setSelectedWebhook(res.webhook);
                setWebhookUrl(res.webhook.url); // Auto fill
            }
        } catch (e) {
            setWebhookError("Failed to create webhook");
        } finally {
            setIsCreatingWebhook(false);
        }
    };

    const handleSelectWebhook = (wh: any) => {
        setSelectedWebhook(wh);
        setWebhookUrl(wh.url);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        const formData = new FormData();

        // --- BULK MODE SUBMISSION ---
        // Bulk mode currently supports only Discord via the text parser heuristic
        if (isBulkMode) {
            if (!bulkText.trim()) { setError("Please enter configuration data"); setIsSubmitting(false); return; }
            if (!userToken) { setError("User Token is required for all mirrors"); setIsSubmitting(false); return; }

            formData.append("bulkData", bulkText);
            formData.append("userToken", userToken);
            if (selectedGuild) formData.append("defaultGuildName", selectedGuild.name);

            try {
                const result: any = await bulkCreateMirrorConfig(null, formData);
                if (result.error) {
                    setError(result.error);
                } else {
                    onSuccess();
                    onClose();
                    setBulkText("");
                    setUserToken("");
                }
            } catch (e) {
                setError("Bulk creation failed. Check format.");
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        // --- STANDARD MODE SUBMISSION ---

        // Common Validation
        const webhookVal = webhookSchema.safeParse(webhookUrl);
        if (!webhookVal.success) { setError(webhookVal.error.issues[0].message); setIsSubmitting(false); return; }

        formData.append("sourcePlatform", sourcePlatform);
        formData.append("targetWebhookUrl", webhookUrl);

        if (sourcePlatform === 'DISCORD') {
            if (!selectedGuild) { setError("Please select a source server"); setIsSubmitting(false); return; }

            const channelVal = channelIdSchema.safeParse(channelId);
            if (!channelVal.success) { setError(channelVal.error.issues[0].message); setIsSubmitting(false); return; }

            if (useSavedAccount && !selectedAccountId) { setError("Please select an account or switch to Manual Token"); setIsSubmitting(false); return; }
            if (!useSavedAccount && !config && !userToken) { setError("User Token is required"); setIsSubmitting(false); return; }

            formData.append("sourceGuildName", selectedGuild.name);
            formData.append("sourceChannelId", channelId);

            if (useSavedAccount && selectedAccountId) {
                formData.append("discordAccountId", selectedAccountId);
            } else {
                formData.append("userToken", userToken);
            }
        } else {
            // TELEGRAM
            if (!manualGuildName.trim()) { setError("Please enter a source name (e.g. Channel Name)"); setIsSubmitting(false); return; }
            if (!telegramChatId.trim()) { setError("Telegram Chat ID is required"); setIsSubmitting(false); return; }
            if (!config && !telegramSession) { setError("Telegram Session is required"); setIsSubmitting(false); return; }

            formData.append("sourceGuildName", manualGuildName);
            formData.append("telegramSession", telegramSession);
            formData.append("telegramChatId", telegramChatId);
            if (telegramTopicId) formData.append("telegramTopicId", telegramTopicId);
            formData.append("telegramPhone", telegramPhone);
        }

        if (config) {
            formData.append("id", config.id);
        }

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
                onSuccess();
                onClose();
                // Reset form
                setSelectedGuild(null);
                setChannels([]);
                setChannelSearchQuery("");
                setChannelId("");
                setWebhookUrl("");
                setWebhookUrl("");
                setUserToken("");
                setSelectedAccountId(null);
                setTelegramSession("");
                setTelegramChatId("");
                setTelegramTopicId("");
                // Clear draft
                localStorage.removeItem("draft_telegram_session");
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

    const filteredChannels = channels.filter(c =>
        c.name.toLowerCase().includes(channelSearchQuery.toLowerCase())
    );

    const selectedChannel = channels.find(c => c.id === channelId);

    const filteredTargetGuilds = guilds.filter(g =>
        g.name.toLowerCase().includes(targetSearchQuery.toLowerCase())
    );

    const filteredTargetChannels = targetChannels.filter(c =>
        c.name.toLowerCase().includes(targetChannelSearchQuery.toLowerCase())
    );

    const selectedTargetChannel = targetChannels.find(c => c.id === targetChannelId);

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
                            className="bg-zinc-950 border border-zinc-800 w-full max-w-2xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]"
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
                                <div className="flex items-center gap-4">
                                    {/* isBulkMode button removed */}
                                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="p-8 overflow-y-auto space-y-8 bg-zinc-950">

                                {/* Platform Selector */}
                                {!isBulkMode && (
                                    <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-900/50 rounded-lg border border-zinc-800">
                                        <button
                                            onClick={() => setSourcePlatform('DISCORD')}
                                            className={cn(
                                                "py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-md transition-all",
                                                sourcePlatform === 'DISCORD'
                                                    ? "bg-zinc-800 text-white shadow-sm"
                                                    : "text-zinc-500 hover:text-zinc-300"
                                            )}
                                        >
                                            Discord
                                        </button>
                                        <button
                                            onClick={() => setSourcePlatform('TELEGRAM')}
                                            className={cn(
                                                "py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-md transition-all",
                                                sourcePlatform === 'TELEGRAM'
                                                    ? "bg-sky-900/40 text-sky-200 border border-sky-800/50 shadow-sm"
                                                    : "text-zinc-500 hover:text-zinc-300"
                                            )}
                                        >
                                            Telegram
                                        </button>
                                    </div>
                                )}

                                {/* Info Box - Warning */}
                                <div className="p-3 bg-amber-950/20 border border-amber-900/50 flex gap-3 items-start">
                                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <strong className="text-amber-500 text-xs font-mono block mb-1 uppercase tracking-wide">Sensitive Credential</strong>
                                        <p className="text-[10px] text-amber-500/80 font-mono leading-relaxed">
                                            Your Token is required for the engine to read messages. It is encrypted at rest using AES-256-GCM.
                                        </p>
                                    </div>
                                </div>

                                <form id="mirror-form" onSubmit={handleSubmit} className="space-y-6">

                                    {/* --- DYNAMIC CONTENT --- */}
                                    {isBulkMode ? (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            {/* Bulk User Token */}
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Discord User Token (Applied to All)</label>
                                                <div className="relative">
                                                    <input
                                                        type={showUserToken ? "text" : "password"}
                                                        value={userToken}
                                                        onChange={(e) => setUserToken(e.target.value)}
                                                        className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm pr-10"
                                                        placeholder="OTMz..."
                                                        autoComplete="off"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowUserToken(!showUserToken)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                                                    >
                                                        {showUserToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Bulk Configuration Data</label>
                                                    <span className="text-[10px] text-zinc-600 font-mono">Format: ChannelID | WebhookURL</span>
                                                </div>
                                                <textarea
                                                    value={bulkText}
                                                    onChange={(e) => setBulkText(e.target.value)}
                                                    className="w-full h-48 bg-zinc-950 border border-zinc-700 hover:border-zinc-500 p-4 text-zinc-300 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-xs leading-relaxed resize-none"
                                                    placeholder={`123456789012345678 https://discord.com/api/webhooks/...\n987654321098765432 https://discord.com/api/webhooks/...`}
                                                />
                                                <p className="text-[10px] text-zinc-500 font-mono">
                                                    Paste one configuration per line. The system automatically detects Channel IDs and Webhook URLs.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

                                            {/* DISCORD CONFIG */}
                                            {sourcePlatform === 'DISCORD' && (
                                                <>
                                                    {/* Account Selection Mode (Removed) */}
                                                    {/* Tabs removed as requested. We default to Saved Account logic. Manual tokens should be added as accounts. */}
                                                    {false && (
                                                        <div className="flex bg-zinc-900 p-1 rounded-md mb-4">
                                                            <button
                                                                type="button"
                                                                onClick={() => { setUseSavedAccount(true); setSelectedGuild(null); }}
                                                                className={cn("flex-1 text-[10px] font-bold uppercase py-1.5 rounded transition-all", useSavedAccount ? "bg-zinc-800 text-white shadow" : "text-zinc-500 hover:text-zinc-300")}
                                                            >
                                                                Saved Account
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setUseSavedAccount(false); setSelectedGuild(null); }}
                                                                className={cn("flex-1 text-[10px] font-bold uppercase py-1.5 rounded transition-all", !useSavedAccount ? "bg-zinc-800 text-white shadow" : "text-zinc-500 hover:text-zinc-300")}
                                                            >
                                                                Manual Token
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Saved Account Select */}
                                                    {useSavedAccount && (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Select Account</label>
                                                                {!isAddingAccount && localAccounts.length < 3 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setIsAddingAccount(true)}
                                                                        className="text-[9px] font-bold text-primary uppercase hover:underline"
                                                                    >
                                                                        + Link New
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {/* Add Account Inline Form */}
                                                            {isAddingAccount && (
                                                                <div className="p-3 border border-zinc-700 bg-zinc-900/50 rounded space-y-2 mb-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-[10px] font-bold text-white uppercase">Link Account</span>
                                                                        <button type="button" onClick={() => setIsAddingAccount(false)}><X className="w-3 h-3 text-zinc-500" /></button>
                                                                    </div>
                                                                    <input
                                                                        type="password"
                                                                        value={newAccountToken}
                                                                        onChange={(e) => setNewAccountToken(e.target.value)}
                                                                        placeholder="Paste User Token..."
                                                                        className="w-full bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-primary rounded"
                                                                    />
                                                                    {addAccountError && <p className="text-[9px] text-red-500 font-mono">{addAccountError}</p>}
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleAddNewAccount}
                                                                        disabled={isAddingAccountLoading || !newAccountToken}
                                                                        className="w-full py-1 bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-bold uppercase rounded border border-primary/30 flex justify-center gap-2"
                                                                    >
                                                                        {isAddingAccountLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                                                        Verify & Link
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {localAccounts && localAccounts.length > 0 ? (
                                                                <div className="grid grid-cols-1 gap-2">
                                                                    {localAccounts.map((acc: any) => (
                                                                        <div
                                                                            key={acc.id}
                                                                            onClick={() => setSelectedAccountId(acc.id)}
                                                                            className={cn(
                                                                                "flex items-center gap-3 p-3 border rounded cursor-pointer transition-all",
                                                                                selectedAccountId === acc.id ? "bg-primary/10 border-primary" : "bg-zinc-950 border-zinc-800 hover:border-zinc-700"
                                                                            )}
                                                                        >
                                                                            {acc.avatar ? (
                                                                                <Image src={`https://cdn.discordapp.com/avatars/${acc.discordId}/${acc.avatar}.png`} width={32} height={32} alt="" className="rounded-full" unoptimized />
                                                                            ) : (
                                                                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                                                                                    {acc.username[0]}
                                                                                </div>
                                                                            )}
                                                                            <div className="flex-1">
                                                                                <div className="text-xs font-bold text-white font-mono">{acc.username}</div>
                                                                                <div className="text-[10px] text-zinc-500 font-mono">ID: {acc.discordId}</div>
                                                                            </div>
                                                                            {selectedAccountId === acc.id && <CheckCircle2 className="w-4 h-4 text-primary" />}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                !isAddingAccount && (
                                                                    <div className="p-4 border border-dashed border-zinc-800 text-center">
                                                                        <p className="text-xs text-zinc-500 font-mono mb-2">No linked accounts found.</p>
                                                                        <button type="button" onClick={() => setIsAddingAccount(true)} className="text-primary text-xs font-bold hover:underline">Link an account now</button>
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    )}



                                                    {/* Source Guild Selector */}
                                                    <div className="space-y-2 relative">
                                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Source Server</label>
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
                                                                        {(!selectedAccountId && useSavedAccount) ? (
                                                                            // Custom Alert Component
                                                                            <div className="p-4 flex flex-col items-center justify-center text-center space-y-3">
                                                                                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                                                                                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                                                                                </div>
                                                                                <div>
                                                                                    <h4 className="text-xs font-bold text-white font-mono uppercase">Profile Required</h4>
                                                                                    <p className="text-[10px] text-zinc-500 font-mono mt-1 px-4">
                                                                                        Please select or link a Discord account to fetch available servers.
                                                                                    </p>
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => { setIsGuildDropdownOpen(false); }}
                                                                                    className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold font-mono uppercase tracking-wider rounded border border-zinc-700"
                                                                                >
                                                                                    Dismiss
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <>
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
                                                                            </>
                                                                        )}
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    </div>

                                                    {/* Channel ID / Selector */}
                                                    <div className="space-y-2 relative">
                                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Channel ID</label>

                                                        {selectedGuild ? (
                                                            <div className="relative">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
                                                                    disabled={channels.length === 0 && !isLoadingChannels}
                                                                    className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 flex items-center justify-between text-left transition-colors focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {channelId ? (
                                                                        <div className="flex items-center gap-2 truncate">
                                                                            <span className="text-zinc-500 font-mono">#</span>
                                                                            <span className="text-zinc-200 truncate font-mono text-sm">
                                                                                {selectedChannel ? selectedChannel.name : channelId}
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-zinc-600 text-sm font-mono">
                                                                            {isLoadingChannels ? "LOADING_CHANNELS..." : "SELECT_CHANNEL..."}
                                                                        </span>
                                                                    )}
                                                                    <ChevronDown className="w-4 h-4 text-zinc-600" />
                                                                </button>

                                                                <AnimatePresence>
                                                                    {isChannelDropdownOpen && (
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
                                                                                        value={channelSearchQuery}
                                                                                        onChange={(e) => {
                                                                                            setChannelSearchQuery(e.target.value);
                                                                                            // If user is searching/typing numbers manually, maybe update channelId?
                                                                                            // For now let's keep it strictly selection or ID paste if not found
                                                                                        }}
                                                                                        className="w-full bg-zinc-900/50 text-xs text-zinc-200 pl-9 pr-3 py-2 border border-zinc-800 outline-none focus:border-zinc-600 transition-colors font-mono"
                                                                                        placeholder="FILTER_CHANNELS..."
                                                                                        autoFocus
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                            <div className="overflow-y-auto p-1 flex-1">
                                                                                {filteredChannels.length > 0 ? (
                                                                                    filteredChannels.map(c => (
                                                                                        <button
                                                                                            key={c.id}
                                                                                            type="button"
                                                                                            onClick={() => { setChannelId(c.id); setIsChannelDropdownOpen(false); }}
                                                                                            className="w-full flex items-center gap-2 p-2 hover:bg-zinc-900 text-left transition-colors"
                                                                                        >
                                                                                            <span className="text-zinc-500 font-mono text-xs">#</span>
                                                                                            <span className="text-xs text-zinc-400 hover:text-white font-mono truncate">{c.name}</span>
                                                                                            <span className="text-[10px] text-zinc-600 font-mono ml-auto">{c.id}</span>
                                                                                        </button>
                                                                                    ))
                                                                                ) : (
                                                                                    <div className="p-4 text-center text-[10px] text-zinc-600 font-mono">NO CHANNELS FOUND</div>
                                                                                )}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        ) : (
                                                            <input
                                                                type="text"
                                                                value={channelId}
                                                                onChange={(e) => setChannelId(e.target.value)}
                                                                className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm"
                                                                placeholder="000000000000000000"
                                                            />
                                                        )}
                                                    </div>
                                                </>
                                            )}

                                            {/* TELEGRAM CONFIG (MTProto UserBot) */}
                                            {sourcePlatform === 'TELEGRAM' && (
                                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">

                                                    {/* Auth Flow / Session Status */}
                                                    <div className="bg-zinc-900/30 border border-zinc-800 p-4 space-y-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">
                                                                Telegram Session
                                                            </label>
                                                            {telegramSession ? (
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 uppercase tracking-wider bg-emerald-950/30 px-2 py-0.5 border border-emerald-900/50">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                    Connected
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider bg-amber-950/30 px-2 py-0.5 border border-amber-900/50">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                                    Disconnected
                                                                </span>
                                                            )}
                                                        </div>

                                                        {!telegramSession ? (
                                                            // LOGIN FLOW
                                                            <div className="space-y-4">
                                                                {authStep === 'PHONE' && (
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            type="text"
                                                                            value={telegramPhone}
                                                                            onChange={(e) => setTelegramPhone(e.target.value)}
                                                                            className="flex-1 bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-2 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm rounded-none"
                                                                            placeholder="+6281234567890"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleSendCode}
                                                                            disabled={isAuthLoading || !telegramPhone}
                                                                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-50 rounded-none border border-zinc-700"
                                                                        >
                                                                            {isAuthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Code"}
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                {(authStep === 'CODE' || authStep === 'PASSWORD') && (
                                                                    <div className="space-y-3">
                                                                        <div className="space-y-1">
                                                                            <label className="text-[9px] text-zinc-500 uppercase font-mono">SMS Code</label>
                                                                            <input
                                                                                type="text"
                                                                                value={telegramCode}
                                                                                onChange={(e) => setTelegramCode(e.target.value)}
                                                                                className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-2 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm rounded-none"
                                                                                placeholder="12345"
                                                                            />
                                                                        </div>

                                                                        <div className="space-y-1">
                                                                            <label className="text-[9px] text-zinc-500 uppercase font-mono flex items-center justify-between">
                                                                                <span>2FA Password</span>
                                                                                <span className="text-[8px] text-zinc-600">(Optional)</span>
                                                                            </label>
                                                                            <input
                                                                                type="password"
                                                                                value={telegramPassword}
                                                                                onChange={(e) => setTelegramPassword(e.target.value)}
                                                                                className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-2 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm rounded-none"
                                                                                placeholder="********"
                                                                            />
                                                                        </div>

                                                                        <div className="flex gap-2 pt-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setAuthStep('PHONE')}
                                                                                className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white text-xs font-mono font-bold uppercase tracking-wider rounded-none"
                                                                            >
                                                                                Back
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={handleLogin}
                                                                                disabled={isAuthLoading || !telegramCode}
                                                                                className="flex-1 px-4 py-2 bg-primary/10 border border-primary/50 text-primary hover:bg-primary/20 text-xs font-mono font-bold uppercase tracking-wider rounded-none flex items-center justify-center gap-2"
                                                                            >
                                                                                {isAuthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & Login"}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            // LOGGED IN STATE
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex-1 p-3 bg-zinc-950 border border-zinc-800 flex items-center gap-3">
                                                                    <div className="w-8 h-8 bg-zinc-900 flex items-center justify-center rounded-none border border-zinc-800">
                                                                        <div className="w-4 h-4 text-emerald-500">
                                                                            <Signal className="w-full h-full" />
                                                                        </div>
                                                                    </div>
                                                                    <div className="overflow-hidden">
                                                                        <p className="text-xs text-zinc-300 font-mono truncate">Session Active</p>
                                                                        <p className="text-[10px] text-zinc-600 font-mono truncate">ID: {telegramSession.substring(0, 12)}...</p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setTelegramSession("");
                                                                        localStorage.removeItem("draft_telegram_session");
                                                                        setAuthStep('PHONE');
                                                                        setTelegramCode("");
                                                                        setTelegramPassword("");
                                                                    }}
                                                                    className="px-4 py-3 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 text-red-500 text-xs font-mono font-bold uppercase tracking-wider rounded-none transition-colors"
                                                                >
                                                                    Reset
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Source Name */}
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Source Name</label>
                                                        <input
                                                            type="text"
                                                            value={manualGuildName}
                                                            onChange={(e) => setManualGuildName(e.target.value)}
                                                            className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm rounded-none"
                                                            placeholder="My Telegram Channel"
                                                        />
                                                    </div>

                                                    {/* Chat ID */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Source Chat ID</label>
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowTelegramGuide(!showTelegramGuide)}
                                                                className="text-[10px] text-primary hover:underline font-mono flex items-center gap-1"
                                                            >
                                                                <Info className="w-3 h-3" />
                                                                {showTelegramGuide ? "Hide Guide" : "How to find?"}
                                                            </button>
                                                        </div>

                                                        {showTelegramGuide && (
                                                            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-md space-y-2 text-[10px] text-zinc-400 font-mono">
                                                                <p className="font-bold text-zinc-300">Detailed Steps:</p>
                                                                <ol className="list-decimal list-inside space-y-1 ml-1">
                                                                    <li>Forward a message from the target channel to <span className="text-primary">@JsonDumpBot</span> or <span className="text-primary">@userinfobot</span>.</li>
                                                                    <li>Look for the <span className="text-zinc-200 font-bold">id</span> field in the forwarded data.</li>
                                                                    <li>Alternatively, open Telegram Web (K/Z version).</li>
                                                                    <li>Click on the chat/channel.</li>
                                                                    <li>Look at the URL: <span className="bg-zinc-800 px-1 rounded">web.telegram.org/k/#-100123...</span></li>
                                                                    <li>The ID usually starts with <span className="text-zinc-200 font-bold">-100</span> (mandatory for supergroups/channels).</li>
                                                                </ol>
                                                            </div>
                                                        )}

                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                value={telegramChatId}
                                                                onChange={(e) => setTelegramChatId(e.target.value)}
                                                                className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm rounded-none"
                                                                placeholder="-100123456789"
                                                            />
                                                        </div>
                                                        <p className="text-[10px] text-zinc-500 font-mono">
                                                            Enter the ID of the Channel/Group you want to listen to. You must be a member.
                                                        </p>
                                                    </div>

                                                    {/* Topic ID (Optional) */}
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono flex items-center justify-between">
                                                            <span>Topic ID (Forum)</span>
                                                            <span className="text-[8px] text-zinc-600">(Optional)</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={telegramTopicId}
                                                            onChange={(e) => setTelegramTopicId(e.target.value)}
                                                            className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-4 py-3 text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary font-mono text-sm rounded-none"
                                                            placeholder="123"
                                                        />
                                                        <p className="text-[10px] text-zinc-500 font-mono">
                                                            Only mirror messages from this specific topic/thread. Leave empty to mirror all.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Target Webhook URL */}
                                            <div className="space-y-4 pt-4 border-t border-zinc-900">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Target Webhook</label>
                                                </div>

                                                {/* Always show Lookup Channel UI */}
                                                <div className="space-y-3 p-3 border border-zinc-800 bg-zinc-900/20 rounded">
                                                    {/* Target Server Selector */}
                                                    <div className="relative">
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsTargetGuildDropdownOpen(!isTargetGuildDropdownOpen)}
                                                            className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 flex items-center justify-between text-left transition-colors focus:border-primary outline-none"
                                                        >
                                                            {targetGuild ? (
                                                                <span className="text-zinc-200 truncate font-mono text-xs">{targetGuild.name}</span>
                                                            ) : (
                                                                <span className="text-zinc-600 text-xs font-mono">SELECT TARGET SERVER...</span>
                                                            )}
                                                            <ChevronDown className="w-3 h-3 text-zinc-600" />
                                                        </button>

                                                        <AnimatePresence>
                                                            {isTargetGuildDropdownOpen && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                                                    className="absolute z-30 top-full left-0 right-0 mt-1 bg-zinc-950 border border-zinc-700 shadow-xl max-h-48 flex flex-col"
                                                                >
                                                                    <div className="p-2 border-b border-zinc-800 sticky top-0 bg-zinc-950">
                                                                        <input type="text" value={targetSearchQuery} onChange={(e) => setTargetSearchQuery(e.target.value)} className="w-full bg-zinc-900/50 text-xs text-zinc-200 px-2 py-1 border border-zinc-800 outline-none" placeholder="Search..." autoFocus />
                                                                    </div>
                                                                    <div className="overflow-y-auto p-1 flex-1">
                                                                        {filteredTargetGuilds.map(g => (
                                                                            <button key={g.id} type="button" onClick={() => { setTargetGuild(g); setIsTargetGuildDropdownOpen(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 text-xs text-zinc-400 hover:text-white truncate font-mono">{g.name}</button>
                                                                        ))}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>

                                                    {/* Target Channel Selector */}
                                                    {targetGuild && (
                                                        <div className="relative">
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsTargetChannelDropdownOpen(!isTargetChannelDropdownOpen)}
                                                                disabled={isLoadingTargetChannels}
                                                                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 flex items-center justify-between text-left transition-colors focus:border-primary outline-none disabled:opacity-50"
                                                            >
                                                                {targetChannelId ? (
                                                                    <span className="text-zinc-200 truncate font-mono text-xs">#{selectedTargetChannel?.name || targetChannelId}</span>
                                                                ) : (
                                                                    <span className="text-zinc-600 text-xs font-mono">{isLoadingTargetChannels ? "LOADING..." : "SELECT TARGET CHANNEL..."}</span>
                                                                )}
                                                                <ChevronDown className="w-3 h-3 text-zinc-600" />
                                                            </button>
                                                            <AnimatePresence>
                                                                {isTargetChannelDropdownOpen && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                                                        className="absolute z-30 top-full left-0 right-0 mt-1 bg-zinc-950 border border-zinc-700 shadow-xl max-h-48 flex flex-col"
                                                                    >
                                                                        <div className="p-2 border-b border-zinc-800 sticky top-0 bg-zinc-950">
                                                                            <input type="text" value={targetChannelSearchQuery} onChange={(e) => setTargetChannelSearchQuery(e.target.value)} className="w-full bg-zinc-900/50 text-xs text-zinc-200 px-2 py-1 border border-zinc-800 outline-none" placeholder="Search..." autoFocus />
                                                                        </div>
                                                                        <div className="overflow-y-auto p-1 flex-1">
                                                                            {filteredTargetChannels.map(c => (
                                                                                <button key={c.id} type="button" onClick={() => { setTargetChannelId(c.id); setIsTargetChannelDropdownOpen(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 text-xs text-zinc-400 hover:text-white truncate font-mono">#{c.name}</button>
                                                                            ))}
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    )}

                                                    {/* Webhook Selection / Creation */}
                                                    {targetChannelId && (
                                                        <div className="space-y-2 pt-2 border-t border-zinc-800/50">
                                                            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Available Webhooks</label>
                                                            {isLoadingWebhooks ? (
                                                                <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono"><Loader2 className="w-3 h-3 animate-spin" /> Check permissions...</div>
                                                            ) : webhookError ? (
                                                                <div className="text-[10px] text-red-500 font-mono">{webhookError}</div>
                                                            ) : webhooks.length > 0 ? (
                                                                <div className="grid gap-1">
                                                                    {webhooks.map((wh: any) => (
                                                                        <button
                                                                            key={wh.id}
                                                                            type="button"
                                                                            onClick={() => handleSelectWebhook(wh)}
                                                                            className={cn("w-full text-left px-3 py-2 border rounded flex items-center gap-2 transition-all", wh.url === webhookUrl ? "bg-primary/10 border-primary" : "bg-zinc-950 border-zinc-800 hover:bg-zinc-900")}
                                                                        >
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                                                            <span className="text-xs text-zinc-300 font-mono truncate flex-1">{wh.name}</span>
                                                                            {wh.url === webhookUrl && <CheckCircle2 className="w-3 h-3 text-primary" />}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div className="text-center py-2">
                                                                    <p className="text-[10px] text-zinc-500 font-mono mb-2">No webhooks found.</p>
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleCreateWebhook}
                                                                        disabled={isCreatingWebhook}
                                                                        className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold uppercase rounded border border-zinc-700 flex justify-center gap-2"
                                                                    >
                                                                        {isCreatingWebhook && <Loader2 className="w-3 h-3 animate-spin" />}
                                                                        Create New Webhook
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

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
                                        <span>
                                            {isBulkMode ? "BULK IMPORT" : (isEdit ? "CONFIRM UPDATE" : "INITIALIZE")}
                                        </span>
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
