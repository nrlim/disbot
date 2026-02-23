"use client";

import { useState, useEffect } from "react";
import { X, ChevronDown, Search, CheckCircle2, AlertTriangle, Loader2, Info, Terminal, ShieldAlert, Eye, EyeOff, Layers, FileText, Signal, ArrowRight, UserPlus, Trash2, Globe, MessageSquare, Monitor, LayoutGrid, ChevronLeft, Lock, ScanEye, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { createMirrorConfig, updateMirrorConfig, bulkCreateMirrorConfig } from "@/actions/mirror";
import { getGuildsForAccount, addDiscordAccount, getChannelsForGuild, getWebhooksForChannel, createWebhook, deleteDiscordAccount } from "@/actions/discord-account";
import { toast } from "react-hot-toast";
import { sendTelegramCode, loginTelegram, getTelegramChatsAction, getTelegramTopicsAction, getTelegramChatsForAccount, getTelegramMeAction, getTelegramTopicsForAccount } from "@/actions/telegramAuth";
import { PLAN_PLATFORMS, PLAN_DESTINATION_PLATFORMS, PLAN_LIMITS } from "@/lib/constants";
import { BrandingCustomizer } from "@/components/BrandingCustomizer";
import { BlurAreaSelector, Region } from "@/components/BlurAreaSelector";
import UpgradeModal from "./UpgradeModal";

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
    sourceGuildId?: string | null;
    sourceChannelId: string | null;
    targetWebhookUrl: string | null;
    active: boolean;
    groupId?: string | null;
    userToken?: string | null;
    telegramSession?: string | null;
    telegramChatId?: string | null;
    telegramTopicId?: string | null;
    discordAccountId?: string | null;
    telegramAccountId?: string | null;
    telegramPhone?: string | null;
    targetChannelId?: string | null;
    targetGuildId?: string | null;
    targetChannelName?: string | null;
    targetGuildName?: string | null;
    customWatermark?: string | null;
    brandColor?: string | null;
    blurRegions?: any; // JSON
    watermarkType?: 'TEXT' | 'VISUAL';
    watermarkImageUrl?: string | null;
    watermarkPosition?: string | null;
    watermarkOpacity?: number | null;
    antiSpamEnabled?: boolean;
    blacklistedUsers?: any;
}

interface EditMirrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    config?: MirrorConfig;
    accounts?: any[];
    groups?: any[];
    telegramAccounts?: any[];
    initialTitle?: string;
    initialStep?: 1 | 2;
    userPlan: string;
}

// --- Zod Schemas ---
const webhookSchema = z.string().url("Invalid Webhook URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord Webhook URL");
const channelIdSchema = z.string().min(17, "Invalid Channel ID").regex(/^\d+$/, "Channel ID must be numeric");

const DiscordLogo = ({ className }: { className?: string }) => (
    <svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
);

const TelegramLogo = ({ className }: { className?: string }) => (
    <svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
);

export default function EditMirrorModal({ isOpen, onClose, onSuccess, config, accounts = [], telegramAccounts = [], groups = [], initialTitle, initialStep = 1, userPlan }: EditMirrorModalProps) {
    // Flow State
    const [step, setStep] = useState<1 | 2>(1);
    const [mirrorTitle, setMirrorTitle] = useState("");

    // Form State
    const [sourcePlatform, setSourcePlatform] = useState<'DISCORD' | 'TELEGRAM'>('DISCORD');
    const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
    const [channelId, setChannelId] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [userToken, setUserToken] = useState("");
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [selectedDestAccountId, setSelectedDestAccountId] = useState<string | null>(null);
    const [useSavedAccount, setUseSavedAccount] = useState(true);

    // Target Lookup State
    const [targetMode, setTargetMode] = useState<'CHANNEL'>('CHANNEL');
    const [targetGuild, setTargetGuild] = useState<Guild | null>(null);
    const [targetChannels, setTargetChannels] = useState<Channel[]>([]);
    const [targetChannelsError, setTargetChannelsError] = useState<string | null>(null);
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
    const [newWebhookName, setNewWebhookName] = useState("");

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

    // Telegram Auth State
    const [telegramPhone, setTelegramPhone] = useState("");
    const [phoneCodeHash, setPhoneCodeHash] = useState("");
    const [tempSession, setTempSession] = useState("");
    const [telegramCode, setTelegramCode] = useState("");
    const [telegramPassword, setTelegramPassword] = useState("");
    const [authStep, setAuthStep] = useState<'PHONE' | 'CODE' | 'PASSWORD'>('PHONE');
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    const [telegramChats, setTelegramChats] = useState<any[]>([]);
    const [isLoadingTelegramChats, setIsLoadingTelegramChats] = useState(false);
    const [isTelegramChatDropdownOpen, setIsTelegramChatDropdownOpen] = useState(false);
    const [telegramChatSearchQuery, setTelegramChatSearchQuery] = useState("");

    // Destination Telegram Chats
    const [destinationTelegramChats, setDestinationTelegramChats] = useState<any[]>([]);
    const [isLoadingDestChats, setIsLoadingDestChats] = useState(false);
    const [isDestChatDropdownOpen, setIsDestChatDropdownOpen] = useState(false);
    const [destChatSearchQuery, setDestChatSearchQuery] = useState("");
    const [destinationUserProfile, setDestinationUserProfile] = useState<any>(null); // For display
    const [sourceUserProfile, setSourceUserProfile] = useState<any>(null); // For display

    const [telegramTopics, setTelegramTopics] = useState<any[]>([]);
    const [isLoadingTopics, setIsLoadingTopics] = useState(false);
    const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);
    const [topicSearchQuery, setTopicSearchQuery] = useState("");

    // Bulk State
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkText, setBulkText] = useState("");

    // Branding State
    const [customWatermark, setCustomWatermark] = useState("");
    const [brandColor, setBrandColor] = useState("#5865F2");
    const [watermarkType, setWatermarkType] = useState<'TEXT' | 'VISUAL'>('TEXT');
    const [watermarkImageUrl, setWatermarkImageUrl] = useState("");
    const [watermarkPosition, setWatermarkPosition] = useState("southeast");
    const [watermarkOpacity, setWatermarkOpacity] = useState(100);
    const [blurRegions, setBlurRegions] = useState<Region[]>([]);

    // Telegram Destination State
    const [destinationPlatform, setDestinationPlatform] = useState<'DISCORD' | 'TELEGRAM'>('DISCORD');
    const [targetTelegramChatId, setTargetTelegramChatId] = useState("");
    const [selectedTelegramDestAccountId, setSelectedTelegramDestAccountId] = useState<string | null>(null);
    const [selectedTelegramSourceAccountId, setSelectedTelegramSourceAccountId] = useState<string | null>(null);

    // Anti-Spam State (ELITE)
    const [antiSpamEnabled, setAntiSpamEnabled] = useState(true);
    const [blacklistedUsers, setBlacklistedUsers] = useState<string[]>([]);
    const [newBlacklistId, setNewBlacklistId] = useState("");

    // Group Context
    const currentGroup = groups?.find(g => (config?.groupId && g.id === config.groupId) || (initialTitle && g.name === initialTitle));
    const isTelegramDestination = (currentGroup?.type === 'DISCORD_TO_TELEGRAM' || currentGroup?.type === 'TELEGRAM_TO_TELEGRAM') || destinationPlatform === 'TELEGRAM';


    // UI State
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [targetGuilds, setTargetGuilds] = useState<Guild[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [channelsError, setChannelsError] = useState<string | null>(null);
    const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
    const [isLoadingTargetGuilds, setIsLoadingTargetGuilds] = useState(false);
    const [isLoadingChannels, setIsLoadingChannels] = useState(false);
    const [isGuildDropdownOpen, setIsGuildDropdownOpen] = useState(false);
    const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
    const [channelSearchQuery, setChannelSearchQuery] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authError, setAuthError] = useState(false);
    const [targetGuildsError, setTargetGuildsError] = useState<string | null>(null);

    // Upgrade Modal State
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
    const [upgradeReason, setUpgradeReason] = useState("");

    // Initialize Modal
    useEffect(() => {
        if (isOpen) {
            setLocalAccounts(accounts || []);
            setIsAddingAccount(false);
            setNewAccountToken("");
            setError(null);

            if (config) {
                // Edit Mode
                setStep(2);
                setMirrorTitle(config.sourceGuildName || "");
                setSourcePlatform(config.sourcePlatform || 'DISCORD');

                // Determine destination platform from group type if editing
                if (config.groupId) {
                    const g = groups?.find(grp => grp.id === config.groupId);
                    if (g) {
                        if (g.type === 'DISCORD_TO_TELEGRAM' || g.type === 'TELEGRAM_TO_TELEGRAM') {
                            setDestinationPlatform('TELEGRAM');
                        } else {
                            setDestinationPlatform('DISCORD');
                        }
                    }
                } else if (config.telegramAccountId && !config.targetWebhookUrl) {
                    // Heuristic default if no group found
                    setDestinationPlatform('TELEGRAM');
                }

                setWebhookUrl(config.targetWebhookUrl || "");
                setTelegramPhone(config.telegramPhone || localStorage.getItem("draft_telegram_phone") || "");

                // Source Logic
                if (config.sourcePlatform === 'TELEGRAM') {
                    setTelegramSession(config.telegramSession || config.userToken || "");
                    setTelegramChatId(config.telegramChatId || config.sourceChannelId || "");
                    setTelegramTopicId(config.telegramTopicId || "");
                    setSelectedTelegramSourceAccountId(config.telegramAccountId || null);

                    if (config.discordAccountId) {
                        setSelectedAccountId(config.discordAccountId);
                        setSelectedDestAccountId(config.discordAccountId);
                        setUseSavedAccount(true);
                    }
                } else {
                    setChannelId(config.sourceChannelId || "");
                    if (config.discordAccountId) {
                        setSelectedAccountId(config.discordAccountId);
                        setSelectedDestAccountId(config.discordAccountId);
                        setUseSavedAccount(true);
                    } else if (config.userToken) {
                        setUserToken(config.userToken);
                        setUseSavedAccount(false);
                    }
                }

                // Destination Logic
                if (config.targetChannelId) setTargetChannelId(config.targetChannelId);
                // Note: targetGuild and selectedWebhook are handled by their respective load effects

                // Branding
                setCustomWatermark(config.customWatermark || "");
                setBrandColor(config.brandColor || "#5865F2");
                setWatermarkType(config.watermarkType || 'TEXT');
                setWatermarkImageUrl(config.watermarkImageUrl || "");
                setWatermarkPosition(config.watermarkPosition || "southeast");
                setWatermarkOpacity(config.watermarkOpacity ?? 100);

                if (config.blurRegions) {
                    try {
                        setBlurRegions(typeof config.blurRegions === 'string' ? JSON.parse(config.blurRegions) : config.blurRegions);
                    } catch (e) {
                        setBlurRegions([]);
                    }
                } else {
                    setBlurRegions([]);
                }

                setAntiSpamEnabled(config.antiSpamEnabled ?? true);
                if (config.blacklistedUsers) {
                    try {
                        setBlacklistedUsers(typeof config.blacklistedUsers === 'string' ? JSON.parse(config.blacklistedUsers) : config.blacklistedUsers);
                    } catch (e) {
                        setBlacklistedUsers([]);
                    }
                } else {
                    setBlacklistedUsers([]);
                }

                setIsBulkMode(false);

                // Telegram Destination Logic
                if (isTelegramDestination) {
                    setTargetTelegramChatId(config.telegramChatId || "");
                    setSelectedTelegramDestAccountId(config.telegramAccountId || null);

                    // If T2T, Source is likely in sourceChannelId, not telegramChatId (which is dest)
                    if (config.sourcePlatform === 'TELEGRAM') {
                        // For T2T, we use sourceChannelId for source chat ID in the UI state
                        setTelegramChatId(config.sourceChannelId || "");
                    }
                }

            } else {
                // Create Mode
                setStep(initialStep);
                const title = initialTitle || "";
                setMirrorTitle(title);

                // Smart platform detection based on existing group type
                if (title && groups) {
                    const matchedGroup = groups.find(g => g.name === title);
                    if (matchedGroup) {
                        setSourcePlatform(matchedGroup.type === "TELEGRAM_TO_DISCORD" ? 'TELEGRAM' : 'DISCORD');
                    } else {
                        setSourcePlatform('DISCORD');
                    }
                } else {
                    setSourcePlatform('DISCORD');
                }

                const draftSession = localStorage.getItem("draft_telegram_session");
                setTelegramSession(draftSession || "");
                setTelegramPhone(localStorage.getItem("draft_telegram_phone") || "");

                setChannelId("");
                setWebhookUrl("");
                setUserToken("");
                setTelegramChatId("");
                setTelegramTopicId("");
                setSelectedGuild(null);
                setChannels([]);
                setBulkText("");
                setSelectedAccountId(null);
                setSelectedDestAccountId(null);
                setUseSavedAccount(true);

                // Reset Target/Destination State
                setTargetGuild(null);
                setTargetChannelId("");
                setSelectedWebhook(null);
                setWebhooks([]);
                setWebhookError("");
                setTargetSearchQuery("");
                setTargetChannelSearchQuery("");

                // Branding
                setCustomWatermark("");
                setBrandColor("#5865F2");
                setWatermarkType('TEXT');
                setWatermarkImageUrl("");
                setWatermarkPosition("southeast");
                setWatermarkOpacity(100);
                setBlurRegions([]);
                setTargetTelegramChatId("");
                setSelectedTelegramDestAccountId(null);
                setDestinationPlatform('DISCORD');
                setTargetGuildsError(null);
                setAntiSpamEnabled(true);
                setBlacklistedUsers([]);
            }
        } else {
            // Reset when closing
            setStep(1);
            setMirrorTitle("");
            setError(null);

            // Branding
            setCustomWatermark("");
            setBrandColor("#5865F2");
            setWatermarkType('TEXT');
            setWatermarkImageUrl("");
            setWatermarkPosition("southeast");
            setWatermarkOpacity(100);
            setBlurRegions([]);
            setAntiSpamEnabled(true);
            setBlacklistedUsers([]);
        }
    }, [isOpen, config, groups, initialTitle]); // Added groups and initialTitle for smart pre-fill

    // Fetch Guilds

    useEffect(() => {
        if (!isOpen) return;

        const fetchGuilds = async () => {
            setIsLoadingGuilds(true);
            setAuthError(false);
            setGuilds([]);

            try {
                let data = [];
                if (useSavedAccount && selectedAccountId) {
                    const res = await getGuildsForAccount(selectedAccountId);
                    if (!res.error) {
                        data = res;
                    }
                } else if (!useSavedAccount) {
                    const res = await fetch("/api/discord/guilds?all=true");
                    if (res.status === 401) {
                        setAuthError(true);
                        return;
                    }
                    if (res.ok) {
                        data = await res.json();
                    }
                }

                if (data && Array.isArray(data)) {
                    setGuilds(data);
                }
            } catch (e) {
                // silent
            } finally {
                setIsLoadingGuilds(false);
            }
        };

        if (useSavedAccount && !selectedAccountId) {
            setGuilds([]);
        } else {
            fetchGuilds();
        }

    }, [isOpen, sourcePlatform, useSavedAccount, selectedAccountId, config]);

    // Fetch Target Guilds
    useEffect(() => {
        if (!isOpen || destinationPlatform !== 'DISCORD' || !selectedDestAccountId) {
            setTargetGuilds([]);
            return;
        }

        const fetchTargetGuilds = async () => {
            // Optimization: If source and dest account are same, and we already have guilds, just copy them
            if (sourcePlatform === 'DISCORD' && selectedAccountId === selectedDestAccountId && guilds.length > 0) {
                setTargetGuilds(guilds);
                setIsLoadingTargetGuilds(false);
                setTargetGuildsError(null);
                return;
            }

            setIsLoadingTargetGuilds(true);
            setTargetGuilds([]);
            setTargetGuildsError(null);

            try {
                const res: any = await getGuildsForAccount(selectedDestAccountId);
                if (!res.error && Array.isArray(res)) {
                    setTargetGuilds(res);
                } else if (res.error) {
                    console.error("Fetch Target Guilds Error:", res.error);
                    setTargetGuildsError(res.error);
                }
            } catch (e) {
                console.error("Fetch Target Guilds Exception:", e);
                setTargetGuildsError("Failed to load servers");
            } finally {
                setIsLoadingTargetGuilds(false);
            }
        };

        fetchTargetGuilds();
    }, [isOpen, destinationPlatform, selectedDestAccountId, selectedAccountId, sourcePlatform, guilds]);

    // When Source Account changes, if Dest Account is not set or was same, sync it (Optional UX preference)
    useEffect(() => {
        if (selectedAccountId && !selectedDestAccountId && !config) {
            setSelectedDestAccountId(selectedAccountId);
        }
    }, [selectedAccountId, selectedDestAccountId, config]);

    // For T2D: Default destination account to first available
    useEffect(() => {
        if (sourcePlatform === 'TELEGRAM' && destinationPlatform === 'DISCORD' && localAccounts.length > 0 && !selectedDestAccountId && !config) {
            setSelectedDestAccountId(localAccounts[0].id);
        }
    }, [sourcePlatform, destinationPlatform, localAccounts, selectedDestAccountId, config]);

    // Sync Source/Target Guilds when list loads
    useEffect(() => {
        if (config && (guilds.length > 0 || targetGuilds.length > 0)) {
            // Source Pre-fill
            if (!selectedGuild && (config.sourcePlatform === 'DISCORD' || !config.sourcePlatform)) {
                const found = guilds.find(g => g.id === config.sourceGuildId || g.name === config.sourceGuildName);
                if (found) setSelectedGuild(found);
            }
            // Target Pre-fill (search in targetGuilds if available, else wait)
            if (!targetGuild && config.targetGuildId) {
                // We might find it in guilds if source=dest account, or we need to wait for targetGuilds
                const foundTarget = targetGuilds.find(g => g.id === config.targetGuildId) || guilds.find(g => g.id === config.targetGuildId);
                if (foundTarget) setTargetGuild(foundTarget);
            }
        }
    }, [guilds, targetGuilds, config, selectedGuild, targetGuild]);

    // Fetch Channels
    useEffect(() => {
        if (!isOpen || !selectedGuild || !selectedAccountId || !useSavedAccount) {
            setChannels([]);
            return;
        }

        const fetchChannels = async () => {
            setChannels([]);
            setIsLoadingChannels(true);
            setChannelsError(null);
            try {
                const res: any = await getChannelsForGuild(selectedAccountId, selectedGuild.id);
                if (!res.error && Array.isArray(res)) {
                    setChannels(res);
                } else if (res.error) {
                    console.error("Fetch Channels Error:", res.error);
                    setChannelsError(res.error);
                }
            } catch (e) {
                console.error(e);
                setChannelsError("Failed to fetch channels");
            } finally {
                setIsLoadingChannels(false);
            }
        };

        fetchChannels();
    }, [selectedGuild?.id, selectedAccountId, useSavedAccount, isOpen]);


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
                localStorage.setItem("draft_telegram_phone", telegramPhone);
            }
        } catch (e: any) {
            console.error(e);
            if (e.message && (e.message.includes("2FA Password Required") || e.message.includes("SESSION_PASSWORD_NEEDED"))) {
                setAuthStep('PASSWORD');
                setError(null);
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
                const newAcc = res.account;
                setLocalAccounts(prev => {
                    const exists = prev.find(a => a.id === newAcc.id);
                    if (exists) return prev.map(a => a.id === newAcc.id ? newAcc : a);
                    return [newAcc, ...prev];
                });
                setSelectedAccountId(newAcc.id);
                // Also set as destination account if we're configuring destination
                if (sourcePlatform === 'TELEGRAM' || !selectedDestAccountId) {
                    setSelectedDestAccountId(newAcc.id);
                }
                setIsAddingAccount(false);
                setNewAccountToken("");
            }
        } catch (e) {
            setAddAccountError("Internal Error");
        } finally {
            setIsAddingAccountLoading(false);
        }
    };

    const handleDeleteAccount = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to remove this account? This will not log you out, but it will disconnect any active mirrors using this profile.")) return;

        try {
            const res: any = await deleteDiscordAccount(id);
            if (res.error) {
                toast.error(res.error);
            } else {
                setLocalAccounts(prev => prev.filter(a => a.id !== id));
                if (selectedAccountId === id) {
                    setSelectedAccountId(null);
                    setSelectedGuild(null);
                    setChannelId("");
                    setChannels([]);
                }
                if (selectedDestAccountId === id) {
                    setSelectedDestAccountId(null);
                    setTargetGuild(null);
                    setTargetChannelId("");
                    setTargetChannels([]);
                }
                toast.success("Account removed");
            }
        } catch (e) {
            toast.error("Failed to remove account");
        }
    };

    // --- Target Logic ---
    useEffect(() => {
        if (targetMode === 'CHANNEL' && targetGuild && selectedDestAccountId) {
            const fetchCh = async () => {
                setTargetChannels([]);
                setIsLoadingTargetChannels(true);
                setTargetChannelsError(null);
                try {
                    const res: any = await getChannelsForGuild(selectedDestAccountId, targetGuild.id);
                    if (!res.error && Array.isArray(res)) {
                        setTargetChannels(res);
                    } else if (res.error) {
                        setTargetChannelsError(res.error);
                    }
                } catch (e) {
                    console.error("Fetch Error:", e);
                    setTargetChannelsError("Failed to load target channels");
                } finally {
                    setIsLoadingTargetChannels(false);
                }
            };
            fetchCh();
        } else {
            setTargetChannels([]);
            setTargetChannelsError(null);
        }
    }, [targetGuild?.id, targetMode, selectedDestAccountId]);

    useEffect(() => {
        if (targetMode === 'CHANNEL' && targetChannelId && selectedDestAccountId) {
            const fetchWh = async () => {
                setWebhooks([]);
                setIsLoadingWebhooks(true);
                setWebhookError("");
                try {
                    const res: any = await getWebhooksForChannel(selectedDestAccountId, targetChannelId);
                    if (!res.error && Array.isArray(res)) {
                        setWebhooks(res);
                    } else if (res.error) {
                        setWebhookError(res.error);
                    }
                } catch (e) {
                    setWebhookError("Failed to load webhooks");
                } finally {
                    setIsLoadingWebhooks(false);
                }
            };
            fetchWh();
        } else {
            setWebhooks([]);
        }
    }, [targetChannelId, targetMode, selectedDestAccountId]);

    // Pre-fill Webhook selection when webhooks are loaded
    useEffect(() => {
        if (config && webhooks.length > 0 && !selectedWebhook) {
            const found = webhooks.find(bh => bh.url === config.targetWebhookUrl);
            if (found) {
                setSelectedWebhook(found);
                setWebhookUrl(found.url);
            }
        }
    }, [webhooks, config, selectedWebhook]);

    // Pre-fill mirror title and webhook if missing but ID/URL is present in config
    useEffect(() => {
        if (config) {
            if (!mirrorTitle && config.sourceGuildName) {
                setMirrorTitle(config.sourceGuildName);
            }
            if (!webhookUrl && config.targetWebhookUrl) {
                setWebhookUrl(config.targetWebhookUrl);
            }
        }
    }, [config, mirrorTitle, webhookUrl]);

    // Reset Target Channel when Guild changes to prevent stale state
    useEffect(() => {
        // Only reset if we change guilds manually (the new guild id doesn't match the saved configuration)
        if (targetGuild && config && targetGuild.id !== config.targetGuildId) {
            setTargetChannelId("");
            setWebhookUrl("");
            setSelectedWebhook(null);
            setWebhooks([]);
            setWebhookError("");
            setTargetChannelSearchQuery("");
        }

        // If we are in CREATE mode, always reset
        if (!config && targetGuild) {
            setTargetChannelId("");
            setWebhookUrl("");
            setSelectedWebhook(null);
            setWebhooks([]);
            setWebhookError("");
            setTargetChannelSearchQuery("");
        }
    }, [targetGuild, config]);

    const handleCreateWebhook = async () => {
        if (!targetChannelId || !selectedDestAccountId) return;
        setIsCreatingWebhook(true);
        setWebhookError("");
        try {
            const hookName = newWebhookName.trim() || "Disbot Mirror";
            const res: any = await createWebhook(selectedDestAccountId, targetChannelId, hookName);
            if (res.error) {
                setWebhookError(res.error);
            } else if (res.success && res.webhook) {
                setWebhooks(prev => [...prev, res.webhook]);
                setSelectedWebhook(res.webhook);
                setWebhookUrl(res.webhook.url);
            }
        } catch (e) {
            setWebhookError("Failed to create webhook");
        } finally {
            setIsCreatingWebhook(false);
        }
    };

    // Fetch Telegram Chats (uses cached data to avoid kicking worker off)
    useEffect(() => {
        if (sourcePlatform === 'TELEGRAM' && (telegramSession || selectedTelegramSourceAccountId) && isOpen) {
            const fetchTgChats = async () => {
                setIsLoadingTelegramChats(true);
                try {
                    let res;
                    if (selectedTelegramSourceAccountId) {
                        // Uses cached chats from DB — no live MTProto connection
                        res = await getTelegramChatsForAccount(selectedTelegramSourceAccountId);
                        // Profile info is also cached in DB
                        getTelegramMeAction(selectedTelegramSourceAccountId).then(me => {
                            if (me.success) setSourceUserProfile(me.user);
                        });
                    } else if (telegramSession) {
                        res = await getTelegramChatsAction(telegramSession);
                    }

                    if (res && res.success && res.chats) {
                        setTelegramChats(res.chats);
                    }
                } catch (e) {
                    console.error("Fetch TG Chats Error:", e);
                    setTelegramChats([]);
                } finally {
                    setIsLoadingTelegramChats(false);
                }
            };
            fetchTgChats();
        } else {
            setTelegramChats([]);
        }
    }, [telegramSession, sourcePlatform, isOpen, selectedTelegramSourceAccountId]);

    // Fetch Telegram Topics (short-lived connection — unavoidable for per-chat data)
    useEffect(() => {
        const isTgSource = sourcePlatform === 'TELEGRAM' && (telegramSession || selectedTelegramSourceAccountId);
        const isTgDest = isTelegramDestination && selectedTelegramDestAccountId;

        if ((isTgSource || isTgDest) && telegramChatId) {
            const fetchTopics = async () => {
                setIsLoadingTopics(true);
                try {
                    let res;
                    const activeAccountId = isTgDest ? selectedTelegramDestAccountId : selectedTelegramSourceAccountId;

                    if (activeAccountId) {
                        res = await getTelegramTopicsForAccount(activeAccountId, telegramChatId);
                    } else if (telegramSession) {
                        res = await getTelegramTopicsAction(telegramSession, telegramChatId);
                    }

                    if (res?.success && res.topics) {
                        setTelegramTopics(res.topics);
                    } else {
                        setTelegramTopics([]);
                    }
                } catch (e) {
                    console.error("Fetch Topics Error:", e);
                    setTelegramTopics([]);
                } finally {
                    setIsLoadingTopics(false);
                }
            };
            fetchTopics();
        } else {
            setTelegramTopics([]);
        }
    }, [telegramChatId, telegramSession, selectedTelegramSourceAccountId, selectedTelegramDestAccountId, sourcePlatform, isTelegramDestination]);


    // Fetch Destination Telegram Chats when Account changes (uses cached data)
    useEffect(() => {
        if (selectedTelegramDestAccountId && isTelegramDestination) {
            const fetchDestChats = async () => {
                setIsLoadingDestChats(true);
                try {
                    // Uses cached chats from DB — no live MTProto connection
                    const res = await getTelegramChatsForAccount(selectedTelegramDestAccountId);
                    if (res.success && res.chats) {
                        setDestinationTelegramChats(res.chats);
                    } else {
                        setDestinationTelegramChats([]);
                        console.error("Failed to fetch dest chats:", res.error);
                    }
                } catch (e) {
                    console.error("Fetch Dest Chats Error:", e);
                    setDestinationTelegramChats([]);
                } finally {
                    setIsLoadingDestChats(false);
                }
            };
            fetchDestChats();

            // Profile info is also cached in DB — no live connection needed
            getTelegramMeAction(selectedTelegramDestAccountId).then(res => {
                if (res.success) setDestinationUserProfile(res.user);
            });
        } else {
            setDestinationTelegramChats([]);
            setDestinationUserProfile(null);
        }
    }, [selectedTelegramDestAccountId, isTelegramDestination]);

    const handleSelectWebhook = (wh: any) => {
        setSelectedWebhook(wh);
        setWebhookUrl(wh.url);
    };

    const handleSelectTelegramDestAccount = (accId: string) => {
        setSelectedTelegramDestAccountId(accId);
    };

    const handleRefreshSourceChats = async () => {
        if (!selectedTelegramSourceAccountId) return;
        if (!confirm("Refeshing chats requires a live connection which may momentarily disconnect your active mirror worker. Continue?")) return;

        setIsLoadingTelegramChats(true);
        try {
            const res = await getTelegramChatsForAccount(selectedTelegramSourceAccountId, true);
            if (res.success && res.chats) {
                setTelegramChats(res.chats);
                // Also refresh profile
                getTelegramMeAction(selectedTelegramSourceAccountId).then(me => {
                    if (me.success) setSourceUserProfile(me.user);
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingTelegramChats(false);
        }
    };

    const handleRefreshDestChats = async () => {
        if (!selectedTelegramDestAccountId) return;
        if (!confirm("Refeshing chats requires a live connection which may momentarily disconnect your active mirror worker. Continue?")) return;

        setIsLoadingDestChats(true);
        try {
            const res = await getTelegramChatsForAccount(selectedTelegramDestAccountId, true);
            if (res.success && res.chats) {
                setDestinationTelegramChats(res.chats);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingDestChats(false);
        }
    };

    const handleRefreshTopics = async () => {
        if (!selectedTelegramSourceAccountId || !telegramChatId) return;
        if (!confirm("Refeshing topics requires a live connection. Continue?")) return;

        setIsLoadingTopics(true);
        try {
            const res = await getTelegramTopicsForAccount(selectedTelegramSourceAccountId, telegramChatId, true);
            if (res.success && res.topics) {
                setTelegramTopics(res.topics);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingTopics(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        // --- Plan Feature Validation ---
        const allowedSources = PLAN_PLATFORMS[userPlan] || PLAN_PLATFORMS.FREE;
        if (!allowedSources.includes(sourcePlatform)) {
            setUpgradeReason(`Your ${userPlan} plan does not support ${sourcePlatform} mirroring.`);
            setUpgradeModalOpen(true);
            setIsSubmitting(false);
            return;
        }

        const allowedDestinations = PLAN_DESTINATION_PLATFORMS[userPlan] || ['DISCORD'];
        if (destinationPlatform === 'TELEGRAM' && !allowedDestinations.includes('TELEGRAM')) {
            setUpgradeReason(`Your ${userPlan} plan does not support Telegram as a destination. Upgrade to Elite to unlock Discord → Telegram and Telegram → Telegram mirroring.`);
            setUpgradeModalOpen(true);
            setIsSubmitting(false);
            return;
        }

        const formData = new FormData();

        if (!isTelegramDestination) {
            const webhookVal = webhookSchema.safeParse(webhookUrl);
            if (!webhookVal.success) { setError(webhookVal.error.issues[0].message); setIsSubmitting(false); return; }
        }

        formData.append("sourcePlatform", sourcePlatform);
        formData.append("destinationPlatform", destinationPlatform);
        if (selectedWebhook) {
            formData.append("targetWebhookName", selectedWebhook.name);
        }

        // Target Logic
        if (isTelegramDestination) {
            if (!targetTelegramChatId) { setError("Destination Telegram Chat ID is required"); setIsSubmitting(false); return; }
            if (!selectedTelegramDestAccountId) { setError("Destination Telegram Account is required"); setIsSubmitting(false); return; }

            formData.append("telegramChatId", targetTelegramChatId);
            formData.append("telegramAccountId", selectedTelegramDestAccountId);

            const destChat = destinationTelegramChats.find(c => c.id === targetTelegramChatId);
            if (destChat) formData.append("targetChannelName", destChat.title);
        } else {
            formData.append("targetWebhookUrl", webhookUrl);
        }

        // Metadata for pre-filling UI later
        if (targetGuild) {
            formData.append("targetGuildId", targetGuild.id);
            formData.append("targetGuildName", targetGuild.name);
        }
        if (targetChannelId) {
            formData.append("targetChannelId", targetChannelId);
            const ch = targetChannels.find(c => c.id === targetChannelId);
            if (ch) formData.append("targetChannelName", ch.name);
        }

        // Branding
        if (customWatermark) formData.append("customWatermark", customWatermark);
        if (brandColor) formData.append("brandColor", brandColor);
        if (blurRegions.length > 0) formData.append("blurRegions", JSON.stringify(blurRegions));

        formData.append("antiSpamEnabled", antiSpamEnabled.toString());
        formData.append("blacklistedUsers", JSON.stringify(blacklistedUsers));

        formData.append("watermarkType", watermarkType);
        if (watermarkImageUrl) formData.append("watermarkImageUrl", watermarkImageUrl);
        if (watermarkPosition) formData.append("watermarkPosition", watermarkPosition);
        formData.append("watermarkOpacity", watermarkOpacity.toString());

        if (sourcePlatform === 'DISCORD') {
            if (!selectedGuild) { setError("Please select a source server"); setIsSubmitting(false); return; }

            const channelVal = channelIdSchema.safeParse(channelId);
            if (!channelVal.success) { setError(channelVal.error.issues[0].message); setIsSubmitting(false); return; }

            if (useSavedAccount && !selectedAccountId) { setError("Please select an account or switch to Manual Token"); setIsSubmitting(false); return; }
            if (!useSavedAccount && !config && !userToken) { setError("User Token is required"); setIsSubmitting(false); return; }

            // Use the Manual Title if provided, otherwise default to Guild Name
            const finalSourceGuildName = mirrorTitle.trim() || selectedGuild.name;
            formData.append("sourceGuildName", finalSourceGuildName);
            formData.append("sourceGuildId", selectedGuild.id);
            formData.append("sourceChannelId", channelId);

            const srcCh = channels.find(c => c.id === channelId);
            if (srcCh) formData.append("sourceChannelName", srcCh.name);

            if (useSavedAccount && selectedAccountId) {
                formData.append("discordAccountId", selectedAccountId);
            } else {
                formData.append("userToken", userToken);
            }
        } else {
            // Telegram Source (T2D or T2T)
            const finalSourceName = mirrorTitle.trim();
            if (!finalSourceName) { setError("Please provide a name for this mirror"); setIsSubmitting(false); return; }
            if (!telegramChatId.trim()) { setError("Telegram Chat ID is required"); setIsSubmitting(false); return; }
            if (!config && !telegramSession && !selectedTelegramSourceAccountId) { setError("Telegram Session or Account is required"); setIsSubmitting(false); return; }

            formData.append("sourceGuildName", finalSourceName);
            if (telegramSession) formData.append("telegramSession", telegramSession);

            // Source account: only set telegramAccountId for source if NOT a Telegram destination
            // (because for T2T, telegramAccountId is already set to the DESTINATION account in the target block above)
            if (selectedTelegramSourceAccountId && !isTelegramDestination) {
                formData.append("telegramAccountId", selectedTelegramSourceAccountId);
            }

            if (isTelegramDestination) {
                // T2T: Source Chat ID -> sourceChannelId
                //       Dest Chat ID -> telegramChatId (already set in target block via line 757)
                formData.set("sourceChannelId", telegramChatId);
            } else {
                // T2D: Source Chat ID -> telegramChatId
                formData.append("telegramChatId", telegramChatId);
            }

            const srcChat = telegramChats.find(c => c.id === telegramChatId);
            let channelName = srcChat ? srcChat.title : undefined;

            if (telegramTopicId) {
                formData.append("telegramTopicId", telegramTopicId);
                const srcTopic = telegramTopics.find(t => t.id === telegramTopicId);
                if (srcTopic && srcTopic.title) {
                    channelName = srcTopic.title;
                }
            }

            if (channelName) formData.append("sourceChannelName", channelName);
            if (telegramPhone) formData.append("telegramPhone", telegramPhone);

            // T2D: Save the selected Discord Destination Account
            if (!isTelegramDestination && selectedDestAccountId) {
                formData.append("discordAccountId", selectedDestAccountId);
            }
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
            }
        } catch (e) {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Filter Logic
    const filteredGuilds = guilds.filter(g => (g.name || "").toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredChannels = channels.filter(c => (c.name || "").toLowerCase().includes(channelSearchQuery.toLowerCase()));
    const filteredTargetGuilds = targetGuilds.filter(g => (g.name || "").toLowerCase().includes(targetSearchQuery.toLowerCase()));
    const filteredTargetChannels = targetChannels.filter(c => (c.name || "").toLowerCase().includes(targetChannelSearchQuery.toLowerCase()));
    const filteredTelegramChats = telegramChats.filter(c => (c.title || "").toLowerCase().includes(telegramChatSearchQuery.toLowerCase()));
    const filteredDestTelegramChats = destinationTelegramChats.filter(c => (c.title || "").toLowerCase().includes(destChatSearchQuery.toLowerCase()));

    const selectedChannel = channels.find(c => c.id === channelId);
    const selectedTargetChannel = targetChannels.find(c => c.id === targetChannelId);
    const selectedTelegramChat = telegramChats.find(c => c.id === telegramChatId);
    const isEdit = !!config;

    // Step Logic
    const nextStep = () => {
        if (step === 1) {
            if (!mirrorTitle.trim()) {
                setError("Please provide a name for this mirror");
                return;
            }
            setError(null);
            setStep(2);
        }
    }
    const prevStep = () => setStep(1);

    return (
        <>
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
                                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-5xl pointer-events-auto flex flex-col max-h-[90vh]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Header */}
                                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                            {step === 1 ? (
                                                <>
                                                    <Layers className="w-5 h-5 text-gray-400" />
                                                    Select Platform
                                                </>
                                            ) : (
                                                <>
                                                    {sourcePlatform === 'DISCORD' ? <DiscordLogo className="w-5 h-5 text-gray-400" /> : <TelegramLogo className="w-5 h-5 text-blue-500" />}
                                                    Configure Mirror
                                                </>
                                            )}
                                        </h2>
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            {step === 1 ? "Choose your source and target platforms" : `Setup your ${sourcePlatform === 'DISCORD' ? 'Discord' : 'Telegram'} connection details`}
                                        </p>
                                    </div>
                                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Body */}
                                <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                                    <AnimatePresence mode="wait">
                                        {step === 1 ? (
                                            <motion.div
                                                key="step1"
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -10 }}
                                                className="space-y-6"
                                            >
                                                <div className="space-y-4">
                                                    <label className="text-sm font-semibold text-gray-900">Choose Mirror Type</label>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div
                                                            onClick={() => {
                                                                setSourcePlatform('DISCORD');
                                                                setDestinationPlatform('DISCORD');
                                                            }}
                                                            className={cn(
                                                                "cursor-pointer relative p-5 rounded-xl border-2 transition-all hover:shadow-md",
                                                                sourcePlatform === 'DISCORD' && destinationPlatform === 'DISCORD' ? "border-primary bg-blue-50/50" : "border-gray-200 bg-white hover:border-blue-200"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <div className="w-10 h-10 rounded-lg bg-[#5865F2] flex items-center justify-center text-white">
                                                                    <DiscordLogo className="w-5 h-5" />
                                                                </div>
                                                                <ArrowRight className="w-4 h-4 text-gray-400" />
                                                                <div className="w-10 h-10 rounded-lg bg-[#5865F2] flex items-center justify-center text-white">
                                                                    <DiscordLogo className="w-5 h-5" />
                                                                </div>
                                                            </div>
                                                            <h3 className="font-bold text-gray-900">Discord to Discord</h3>
                                                            <p className="text-xs text-gray-500 mt-1">Mirror messages between Discord servers instantly.</p>
                                                            {sourcePlatform === 'DISCORD' && destinationPlatform === 'DISCORD' && <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-primary" />}
                                                        </div>

                                                        <div
                                                            onClick={() => {
                                                                if (!PLAN_PLATFORMS[userPlan]?.includes('TELEGRAM')) return;
                                                                setSourcePlatform('TELEGRAM');
                                                                setDestinationPlatform('DISCORD');
                                                            }}
                                                            className={cn(
                                                                "cursor-pointer relative p-5 rounded-xl border-2 transition-all hover:shadow-md",
                                                                sourcePlatform === 'TELEGRAM' && destinationPlatform === 'DISCORD' ? "border-blue-500 bg-blue-50/50" : "border-gray-200 bg-white hover:border-blue-200",
                                                                !PLAN_PLATFORMS[userPlan]?.includes('TELEGRAM') && "opacity-50 grayscale cursor-not-allowed hover:border-gray-200 hover:shadow-none bg-gray-50"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <div className="w-10 h-10 rounded-lg bg-[#24A1DE] flex items-center justify-center text-white">
                                                                    <TelegramLogo className="w-5 h-5" />
                                                                </div>
                                                                <ArrowRight className="w-4 h-4 text-gray-400" />
                                                                <div className="w-10 h-10 rounded-lg bg-[#5865F2] flex items-center justify-center text-white">
                                                                    <DiscordLogo className="w-5 h-5" />
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <h3 className="font-bold text-gray-900">Telegram to Discord</h3>
                                                                    <p className="text-xs text-gray-500 mt-1">Forward Telegram channel posts to Discord webhooks.</p>
                                                                </div>
                                                                {!PLAN_PLATFORMS[userPlan]?.includes('TELEGRAM') && (
                                                                    <div className="bg-amber-100 text-amber-700 p-1.5 rounded-lg" title="Upgrade to Pro to unlock">
                                                                        <ShieldAlert className="w-4 h-4" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {sourcePlatform === 'TELEGRAM' && destinationPlatform === 'DISCORD' && <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-blue-500" />}
                                                        </div>

                                                        <div
                                                            onClick={() => {
                                                                if (!PLAN_DESTINATION_PLATFORMS[userPlan]?.includes('TELEGRAM')) return;
                                                                setSourcePlatform('DISCORD');
                                                                setDestinationPlatform('TELEGRAM');
                                                            }}
                                                            className={cn(
                                                                "cursor-pointer relative p-5 rounded-xl border-2 transition-all hover:shadow-md",
                                                                sourcePlatform === 'DISCORD' && destinationPlatform === 'TELEGRAM' ? "border-blue-500 bg-blue-50/50" : "border-gray-200 bg-white hover:border-blue-200",
                                                                !PLAN_DESTINATION_PLATFORMS[userPlan]?.includes('TELEGRAM') && "opacity-50 grayscale cursor-not-allowed hover:border-gray-200 hover:shadow-none bg-gray-50"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <div className="w-10 h-10 rounded-lg bg-[#5865F2] flex items-center justify-center text-white">
                                                                    <DiscordLogo className="w-5 h-5" />
                                                                </div>
                                                                <ArrowRight className="w-4 h-4 text-gray-400" />
                                                                <div className="w-10 h-10 rounded-lg bg-[#24A1DE] flex items-center justify-center text-white">
                                                                    <TelegramLogo className="w-5 h-5" />
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <h3 className="font-bold text-gray-900">Discord to Telegram</h3>
                                                                    <p className="text-xs text-gray-500 mt-1">Mirror Discord messages to a Telegram chat.</p>
                                                                </div>
                                                                {!PLAN_DESTINATION_PLATFORMS[userPlan]?.includes('TELEGRAM') ? (
                                                                    <div className="bg-amber-100 text-amber-700 p-1.5 rounded-lg" title="Upgrade to Elite to unlock">
                                                                        <ShieldAlert className="w-4 h-4" />
                                                                    </div>
                                                                ) : (
                                                                    <div className="bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded text-[10px] uppercase">ELITE</div>
                                                                )}
                                                            </div>
                                                            {sourcePlatform === 'DISCORD' && destinationPlatform === 'TELEGRAM' && <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-blue-500" />}
                                                        </div>

                                                        <div
                                                            onClick={() => {
                                                                if (!PLAN_DESTINATION_PLATFORMS[userPlan]?.includes('TELEGRAM')) return;
                                                                setSourcePlatform('TELEGRAM');
                                                                setDestinationPlatform('TELEGRAM');
                                                            }}
                                                            className={cn(
                                                                "cursor-pointer relative p-5 rounded-xl border-2 transition-all hover:shadow-md",
                                                                sourcePlatform === 'TELEGRAM' && destinationPlatform === 'TELEGRAM' ? "border-blue-500 bg-blue-50/50" : "border-gray-200 bg-white hover:border-blue-200",
                                                                !PLAN_DESTINATION_PLATFORMS[userPlan]?.includes('TELEGRAM') && "opacity-50 grayscale cursor-not-allowed hover:border-gray-200 hover:shadow-none bg-gray-50"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <div className="w-10 h-10 rounded-lg bg-[#24A1DE] flex items-center justify-center text-white">
                                                                    <TelegramLogo className="w-5 h-5" />
                                                                </div>
                                                                <ArrowRight className="w-4 h-4 text-gray-400" />
                                                                <div className="w-10 h-10 rounded-lg bg-[#24A1DE] flex items-center justify-center text-white">
                                                                    <TelegramLogo className="w-5 h-5" />
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <h3 className="font-bold text-gray-900">Telegram to Telegram</h3>
                                                                    <p className="text-xs text-gray-500 mt-1">Mirror messages between Telegram chats.</p>
                                                                </div>
                                                                {!PLAN_DESTINATION_PLATFORMS[userPlan]?.includes('TELEGRAM') ? (
                                                                    <div className="bg-amber-100 text-amber-700 p-1.5 rounded-lg" title="Upgrade to Elite to unlock">
                                                                        <ShieldAlert className="w-4 h-4" />
                                                                    </div>
                                                                ) : (
                                                                    <div className="bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded text-[10px] uppercase">ELITE</div>
                                                                )}
                                                            </div>
                                                            {sourcePlatform === 'TELEGRAM' && destinationPlatform === 'TELEGRAM' && <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-blue-500" />}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-sm font-semibold text-gray-900">Mirror Title</label>
                                                    <input
                                                        type="text"
                                                        value={mirrorTitle}
                                                        onChange={(e) => setMirrorTitle(e.target.value)}
                                                        placeholder="e.g. VIP Crypto Signals"
                                                        className={cn(
                                                            "w-full px-4 py-3 bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium",
                                                            error && !mirrorTitle.trim() ? "border-red-300 ring-red-100" : ""
                                                        )}
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">Give this mirror a recognizable name for your dashboard.</p>
                                                </div>

                                                {error && (
                                                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 border border-red-100">
                                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                                        {error}
                                                    </div>
                                                )}
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="step2"
                                                initial={{ opacity: 0, x: 10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 10 }}
                                                className="space-y-6"
                                            >
                                                <form onSubmit={handleSubmit} className="space-y-6">

                                                    {/* Account Selection - Only for Discord source (used as Source context) */}
                                                    {sourcePlatform === 'DISCORD' && (
                                                        <div className="space-y-3">
                                                            <label className="text-sm font-medium text-gray-700">
                                                                Account Context
                                                            </label>

                                                            {localAccounts.length > 0 ? (
                                                                <div className="grid grid-cols-1 gap-2">
                                                                    {localAccounts.map((acc: any) => (
                                                                        <div
                                                                            key={acc.id}
                                                                            onClick={() => {
                                                                                setSelectedAccountId(acc.id);
                                                                                if (!config || acc.id !== config.discordAccountId) {
                                                                                    setSelectedGuild(null);
                                                                                    setChannelId("");
                                                                                    setChannels([]);
                                                                                }
                                                                            }}
                                                                            className={cn(
                                                                                "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all",
                                                                                selectedAccountId === acc.id ? "bg-blue-50 border-primary ring-1 ring-primary" : "bg-white border-gray-200 hover:border-gray-300"
                                                                            )}
                                                                        >
                                                                            {acc.avatar ? (
                                                                                <Image src={`https://cdn.discordapp.com/avatars/${acc.discordId}/${acc.avatar}.png`} width={36} height={36} alt="" className="rounded-full bg-gray-200" unoptimized />
                                                                            ) : (
                                                                                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                                                                                    {acc.username[0]}
                                                                                </div>
                                                                            )}
                                                                            <div className="flex-1">
                                                                                <div className="text-sm font-semibold text-gray-900">{acc.username}</div>
                                                                                <div className="text-xs text-gray-500">ID: {acc.discordId}</div>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => handleDeleteAccount(acc.id, e)}
                                                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                                >
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                                {selectedAccountId === acc.id && <CheckCircle2 className="w-5 h-5 text-primary" />}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div className="text-center p-4 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500">
                                                                    No accounts linked. Please add one.
                                                                </div>
                                                            )}

                                                            {/* Add Account Button */}
                                                            {!isAddingAccount ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setIsAddingAccount(true)}
                                                                    className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400 transition-all flex items-center justify-center gap-2"
                                                                >
                                                                    <UserPlus className="w-4 h-4" /> Link Another Account
                                                                </button>
                                                            ) : (
                                                                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium text-gray-900">Link New Account</span>
                                                                        <button onClick={() => setIsAddingAccount(false)}><X className="w-4 h-4 text-gray-400" /></button>
                                                                    </div>
                                                                    <input
                                                                        type="password"
                                                                        value={newAccountToken}
                                                                        onChange={(e) => setNewAccountToken(e.target.value)}
                                                                        placeholder="Paste User Token Here"
                                                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleAddNewAccount}
                                                                        disabled={isAddingAccountLoading || !newAccountToken}
                                                                        className="w-full py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90 transition-colors flex justify-center gap-2"
                                                                    >
                                                                        {isAddingAccountLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                                                        Verify & Link
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* DISCORD CONFIG */}
                                                    {sourcePlatform === 'DISCORD' && (
                                                        <div className="space-y-6">

                                                            {/* Guild & Channel Selection */}
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                {/* Guild Select */}
                                                                <div className="space-y-1.5 relative">
                                                                    <label className="text-xs font-medium text-gray-500 uppercase">Source Server</label>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setIsGuildDropdownOpen(!isGuildDropdownOpen)}
                                                                        disabled={!selectedAccountId}
                                                                        className="w-full bg-white border border-gray-300 px-3 py-2.5 rounded-lg flex items-center justify-between text-left focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
                                                                    >
                                                                        {selectedGuild ? (
                                                                            <div className="flex items-center gap-2 truncate">
                                                                                {selectedGuild.icon ? (
                                                                                    <Image src={selectedGuild.icon} width={20} height={20} alt="" className="rounded-full" unoptimized />
                                                                                ) : (
                                                                                    <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[9px] font-bold text-gray-500">{(selectedGuild.name || "").substring(0, 2)}</div>
                                                                                )}
                                                                                <span className="text-sm text-gray-900 truncate font-medium">{selectedGuild.name}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-sm text-gray-500">Select Server...</span>
                                                                        )}
                                                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                                                    </button>

                                                                    {/* Guild Dropdown */}
                                                                    <AnimatePresence>
                                                                        {isGuildDropdownOpen && (
                                                                            <motion.div
                                                                                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                                                                className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 flex flex-col overflow-hidden"
                                                                            >
                                                                                <div className="p-2 border-b border-gray-100 bg-gray-50">
                                                                                    <Search className="absolute left-4 top-4 w-4 h-4 text-gray-400" />
                                                                                    <input
                                                                                        type="text"
                                                                                        value={searchQuery}
                                                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                                                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-primary"
                                                                                        placeholder="Search servers..."
                                                                                        autoFocus
                                                                                    />
                                                                                </div>
                                                                                <div className="overflow-y-auto p-1 max-h-48 custom-scrollbar">
                                                                                    {isLoadingGuilds ? (
                                                                                        <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                                                                                    ) : filteredGuilds.length > 0 ? (
                                                                                        filteredGuilds.map(g => (
                                                                                            <button
                                                                                                key={g.id}
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    setSelectedGuild(g);
                                                                                                    setIsGuildDropdownOpen(false);
                                                                                                    setChannelId("");
                                                                                                    setChannels([]);
                                                                                                }}
                                                                                                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors text-left"
                                                                                            >
                                                                                                {g.icon ? <Image src={g.icon} width={24} height={24} alt="" className="rounded-full" unoptimized /> : <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-bold">{(g.name || "").substring(0, 2)}</div>}
                                                                                                <span className="text-sm text-gray-700 truncate">{g.name}</span>
                                                                                            </button>
                                                                                        ))
                                                                                    ) : (
                                                                                        <div className="p-3 text-center text-xs text-gray-500">No servers found</div>
                                                                                    )}
                                                                                </div>
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>

                                                                {/* Channel ID */}
                                                                <div className="space-y-1.5">
                                                                    <label className="text-xs font-medium text-gray-500 uppercase">Channel ID</label>
                                                                    <div className="relative">
                                                                        {selectedGuild ? (
                                                                            <div className="relative">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
                                                                                    disabled={channels.length === 0}
                                                                                    className="w-full bg-white border border-gray-300 px-3 py-2.5 rounded-lg flex items-center justify-between text-left focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50"
                                                                                >
                                                                                    {channelId ? (
                                                                                        <div className="flex items-center gap-1 overflow-hidden">
                                                                                            <span className="text-gray-400">#</span>
                                                                                            <span className="text-sm text-gray-900 truncate font-medium">{selectedChannel?.name || channelId}</span>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-sm text-gray-500">{isLoadingChannels ? "Loading..." : "Select Channel..."}</span>
                                                                                    )}
                                                                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                                                                </button>
                                                                                <AnimatePresence>
                                                                                    {isChannelDropdownOpen && (
                                                                                        <motion.div
                                                                                            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                                                                            className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 flex flex-col overflow-hidden"
                                                                                        >
                                                                                            <div className="p-2 border-b border-gray-100 bg-gray-50">
                                                                                                <input type="text" value={channelSearchQuery} onChange={(e) => setChannelSearchQuery(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-primary" placeholder="Search..." autoFocus />
                                                                                            </div>
                                                                                            <div className="overflow-y-auto p-1 max-h-48 custom-scrollbar">
                                                                                                {isLoadingChannels ? (
                                                                                                    <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                                                                                                ) : channelsError ? (
                                                                                                    <div className="p-3 text-center text-xs text-red-500 font-medium bg-red-50 rounded-md m-1 border border-red-100">{channelsError}</div>
                                                                                                ) : filteredChannels.map(c => (
                                                                                                    <button key={c.id} type="button" onClick={() => { setChannelId(c.id); setIsChannelDropdownOpen(false); }} className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-md text-left text-sm text-gray-700">
                                                                                                        <span className="text-gray-400">#</span>
                                                                                                        <span className="truncate flex-1">{c.name}</span>
                                                                                                        <span className="text-xs text-gray-400 font-mono">{(c.id || "").substring(0, 4)}...</span>
                                                                                                    </button>
                                                                                                ))}
                                                                                                {!isLoadingChannels && !channelsError && filteredChannels.length === 0 && (
                                                                                                    <div className="p-3 text-center text-xs text-gray-400">No channels found</div>
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
                                                                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono placeholder:text-gray-400"
                                                                                placeholder="Channel ID..."
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* TELEGRAM CONFIG */}
                                                    {sourcePlatform === 'TELEGRAM' && (
                                                        <div className="space-y-6">
                                                            {/* Telegram Auth UI */}
                                                            <div className="space-y-4">
                                                                {/* Saved Accounts Selection */}
                                                                {telegramAccounts && telegramAccounts.length > 0 && !telegramSession && (
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-xs font-medium text-gray-500 uppercase">Select Source Account</label>
                                                                        <div className="grid grid-cols-1 gap-2">
                                                                            {telegramAccounts.map((acc: any) => (
                                                                                <button
                                                                                    key={acc.id}
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        setSelectedTelegramSourceAccountId(acc.id);
                                                                                        setTelegramSession(""); // Reset session string if using account ID
                                                                                    }}
                                                                                    className={cn(
                                                                                        "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all text-left w-full",
                                                                                        selectedTelegramSourceAccountId === acc.id ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500" : "bg-white border-gray-200 hover:border-gray-300"
                                                                                    )}
                                                                                >
                                                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                                                                        <TelegramLogo className="w-4 h-4" />
                                                                                    </div>
                                                                                    <div className="flex-1 overflow-hidden">
                                                                                        <div className="text-sm font-semibold text-gray-900 truncate">
                                                                                            {selectedTelegramSourceAccountId === acc.id && sourceUserProfile ?
                                                                                                (sourceUserProfile.firstName || acc.firstName || acc.username || acc.phone) :
                                                                                                (acc.firstName || acc.username || acc.phone)
                                                                                            }
                                                                                        </div>
                                                                                        {selectedTelegramSourceAccountId === acc.id && sourceUserProfile && (
                                                                                            <div className="text-xs text-gray-500 truncate">
                                                                                                ID: {sourceUserProfile.id} | @{sourceUserProfile.username}
                                                                                            </div>
                                                                                        )}
                                                                                        {!acc.valid && <span className="text-xs text-red-500">Invalid Session</span>}
                                                                                    </div>
                                                                                    {selectedTelegramSourceAccountId === acc.id && <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <button type="button" onClick={() => { setSelectedTelegramSourceAccountId(""); setTelegramSession(""); }} className="text-xs text-primary hover:underline">
                                                                                + Add / Use New Account
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Manual Auth / New Account */}
                                                                {(!selectedTelegramSourceAccountId || telegramSession) && (
                                                                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
                                                                        <div className="flex items-center justify-between">
                                                                            <h3 className="text-sm font-semibold text-gray-900">Telegram Authentication</h3>
                                                                            <TelegramLogo className="w-6 h-6 text-[#24A1DE]" />
                                                                        </div>
                                                                        {!telegramSession ? (
                                                                            <div className="space-y-3">
                                                                                {authStep === 'PHONE' && (
                                                                                    <div className="flex gap-2">
                                                                                        <input type="text" value={telegramPhone} onChange={(e) => setTelegramPhone(e.target.value)} className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:border-primary" placeholder="Phone Number (+62...)" />
                                                                                        <button type="button" onClick={handleSendCode} disabled={isAuthLoading} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">Send Code</button>
                                                                                    </div>
                                                                                )}
                                                                                {(authStep === 'CODE' || authStep === 'PASSWORD') && (
                                                                                    <div className="space-y-3">
                                                                                        <input type="text" value={telegramCode} onChange={(e) => setTelegramCode(e.target.value)} placeholder="SMS Code" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" />
                                                                                        {authStep === 'PASSWORD' && (
                                                                                            <input type="password" value={telegramPassword} onChange={(e) => setTelegramPassword(e.target.value)} placeholder="2FA Password" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" />
                                                                                        )}
                                                                                        <div className="flex gap-2">
                                                                                            <button type="button" onClick={() => setAuthStep('PHONE')} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Back</button>
                                                                                            <button type="button" onClick={handleLogin} disabled={isAuthLoading} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">Verify</button>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                                {telegramAccounts.length > 0 && (
                                                                                    <div className="text-center pt-2">
                                                                                        <button type="button" onClick={() => setSelectedTelegramSourceAccountId(telegramAccounts[0].id)} className="text-xs text-gray-500 hover:text-gray-900">Cancel & Use Saved Accounts</button>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-100">
                                                                                <div className="flex items-center gap-2 text-green-700 text-sm font-medium"><Signal className="w-4 h-4" /> Session Active</div>
                                                                                <button type="button" onClick={() => { setTelegramSession(""); setAuthStep('PHONE'); localStorage.removeItem("draft_telegram_session"); }} className="text-xs text-red-600 hover:underline">Disconnect</button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="space-y-1.5 relative">
                                                                <div className="flex items-center justify-between pointer-events-none">
                                                                    <label className="text-xs font-medium text-gray-500 uppercase">Chat Context</label>
                                                                    {selectedTelegramSourceAccountId && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleRefreshSourceChats}
                                                                            disabled={isLoadingTelegramChats}
                                                                            className="pointer-events-auto flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full transition-colors"
                                                                            title="Force refresh cached chats"
                                                                        >
                                                                            <RefreshCw className={cn("w-3 h-3", isLoadingTelegramChats && "animate-spin")} />
                                                                            Refresh
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                {(telegramSession || selectedTelegramSourceAccountId) && (telegramChats.length > 0 || isLoadingTelegramChats) ? (
                                                                    <div className="relative">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setIsTelegramChatDropdownOpen(!isTelegramChatDropdownOpen)}
                                                                            disabled={isLoadingTelegramChats}
                                                                            className="w-full bg-white border border-gray-300 px-3 py-2.5 rounded-lg flex items-center justify-between text-left focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50"
                                                                        >
                                                                            {telegramChatId ? (
                                                                                <div className="flex items-center gap-2 truncate">
                                                                                    <span className="text-sm text-gray-900 truncate font-medium">{selectedTelegramChat?.title || telegramChatId}</span>
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-sm text-gray-500">{isLoadingTelegramChats ? "Loading..." : "Select Telegram Chat..."}</span>
                                                                            )}
                                                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                                                        </button>

                                                                        <AnimatePresence>
                                                                            {isTelegramChatDropdownOpen && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                                                                    className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 flex flex-col overflow-hidden"
                                                                                >
                                                                                    <div className="p-2 border-b border-gray-100 bg-gray-50">
                                                                                        <div className="relative">
                                                                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                                                            <input
                                                                                                type="text"
                                                                                                value={telegramChatSearchQuery}
                                                                                                onChange={(e) => setTelegramChatSearchQuery(e.target.value)}
                                                                                                className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-primary"
                                                                                                placeholder="Search chats..."
                                                                                                autoFocus
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="overflow-y-auto p-1 max-h-48 custom-scrollbar">
                                                                                        {filteredTelegramChats.length > 0 ? (
                                                                                            filteredTelegramChats.map(c => (
                                                                                                <button
                                                                                                    key={c.id}
                                                                                                    type="button"
                                                                                                    onClick={() => {
                                                                                                        setTelegramChatId(c.id);
                                                                                                        setIsTelegramChatDropdownOpen(false);
                                                                                                        if (!mirrorTitle.trim()) setMirrorTitle(c.title || "");
                                                                                                    }}
                                                                                                    className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-md transition-colors text-left"
                                                                                                >
                                                                                                    <div className="flex-1 min-w-0">
                                                                                                        <div className="text-sm text-gray-700 truncate font-medium">{c.title}</div>
                                                                                                        <div className="text-[10px] text-gray-400 font-mono">ID: {c.id}</div>
                                                                                                    </div>
                                                                                                    {telegramChatId === c.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                                                                                </button>
                                                                                            ))
                                                                                        ) : (
                                                                                            <div className="p-4 text-center text-xs text-gray-500">No chats found</div>
                                                                                        )}
                                                                                    </div>
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                ) : (
                                                                    <input
                                                                        type="text"
                                                                        value={telegramChatId}
                                                                        onChange={(e) => setTelegramChatId(e.target.value)}
                                                                        placeholder="Source Chat ID (-100...)"
                                                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:border-primary font-mono"
                                                                    />
                                                                )}
                                                                <p className="text-xs text-gray-500">
                                                                    {telegramSession && (telegramChats.length > 0 || isLoadingTelegramChats)
                                                                        ? "Select from your active channels/groups."
                                                                        : "Enter the Channel ID or User ID you want to mirror from."}
                                                                </p>
                                                            </div>

                                                            {telegramTopics.length > 0 && (
                                                                <div className="space-y-1.5 relative">
                                                                    <div className="flex items-center justify-between pointer-events-none">
                                                                        <label className="text-xs font-medium text-gray-500 uppercase flex items-center gap-2">
                                                                            Topic / Forum Thread <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Optional</span>
                                                                        </label>
                                                                        {selectedTelegramSourceAccountId && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={handleRefreshTopics}
                                                                                disabled={isLoadingTopics}
                                                                                className="pointer-events-auto flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full transition-colors"
                                                                                title="Force refresh cached topics"
                                                                            >
                                                                                <RefreshCw className={cn("w-3 h-3", isLoadingTopics && "animate-spin")} />
                                                                                Refresh
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <div className="relative">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setIsTopicDropdownOpen(!isTopicDropdownOpen)}
                                                                            disabled={isLoadingTopics}
                                                                            className="w-full bg-white border border-gray-300 px-3 py-2.5 rounded-lg flex items-center justify-between text-left focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50"
                                                                        >
                                                                            {telegramTopicId ? (
                                                                                <div className="flex items-center gap-2 truncate">
                                                                                    <span className="text-sm text-gray-900 truncate font-medium">
                                                                                        {telegramTopics.find(t => t.id === telegramTopicId)?.title || telegramTopicId}
                                                                                    </span>
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-sm text-gray-500">All Topics / General</span>
                                                                            )}
                                                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                                                        </button>
                                                                        <AnimatePresence>
                                                                            {isTopicDropdownOpen && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                                                                    className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 flex flex-col overflow-hidden"
                                                                                >
                                                                                    <div className="p-2 border-b border-gray-100 bg-gray-50">
                                                                                        <input
                                                                                            type="text"
                                                                                            value={topicSearchQuery}
                                                                                            onChange={(e) => setTopicSearchQuery(e.target.value)}
                                                                                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-primary"
                                                                                            placeholder="Search topics..."
                                                                                            autoFocus
                                                                                        />
                                                                                    </div>
                                                                                    <div className="overflow-y-auto p-1 max-h-48 custom-scrollbar">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => { setTelegramTopicId(""); setIsTopicDropdownOpen(false); }}
                                                                                            className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-md transition-colors text-left"
                                                                                        >
                                                                                            <div className="w-1 h-4 bg-gray-300 rounded-full"></div>
                                                                                            <span className="text-sm text-gray-700 font-medium">All Topics / General</span>
                                                                                            {!telegramTopicId && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                                                                                        </button>
                                                                                        {telegramTopics.filter(t => (t.title || "").toLowerCase().includes(topicSearchQuery.toLowerCase())).map(t => (
                                                                                            <button
                                                                                                key={t.id}
                                                                                                type="button"
                                                                                                onClick={() => { setTelegramTopicId(t.id); setIsTopicDropdownOpen(false); }}
                                                                                                className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-md transition-colors text-left"
                                                                                            >
                                                                                                <div className="w-1 h-4 rounded-full" style={{ backgroundColor: t.color ? `#${t.color.toString(16)}` : '#ccc' }}></div>
                                                                                                <span className="text-sm text-gray-700 truncate font-medium flex-1">{t.title}</span>
                                                                                                <span className="text-[10px] text-gray-400 font-mono">ID: {t.id}</span>
                                                                                                {telegramTopicId === t.id && <CheckCircle2 className="w-4 h-4 text-primary" />}
                                                                                            </button>
                                                                                        ))}
                                                                                    </div>
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* TARGET CONFIGURATION */}
                                                    <div className="pt-6 border-t border-gray-200">
                                                        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                                            <ArrowRight className="w-4 h-4 text-gray-400" /> Destination
                                                            {isTelegramDestination && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-wide">Elite</span>}
                                                        </h3>

                                                        {isTelegramDestination ? (
                                                            <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">

                                                                {/* Telegram Account Selection */}
                                                                <div className="space-y-1.5">
                                                                    <label className="text-xs font-medium text-gray-500 uppercase">Destination Account</label>
                                                                    {telegramAccounts && telegramAccounts.length > 0 ? (
                                                                        <div className="grid grid-cols-1 gap-2">
                                                                            {telegramAccounts.map((acc: any) => (
                                                                                <div
                                                                                    key={acc.id}
                                                                                    onClick={() => handleSelectTelegramDestAccount(acc.id)}
                                                                                    className={cn(
                                                                                        "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all",
                                                                                        selectedTelegramDestAccountId === acc.id ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500" : "bg-white border-gray-200 hover:border-gray-300"
                                                                                    )}
                                                                                >
                                                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                                                                        <TelegramLogo className="w-4 h-4" />
                                                                                    </div>
                                                                                    <div className="flex-1">
                                                                                        <div className="text-sm font-semibold text-gray-900">
                                                                                            {selectedTelegramDestAccountId === acc.id && destinationUserProfile
                                                                                                ? (destinationUserProfile.firstName || acc.firstName || acc.username || acc.phone) // Prefer fetch
                                                                                                : (acc.firstName || acc.username || acc.phone)
                                                                                            }
                                                                                        </div>
                                                                                        {selectedTelegramDestAccountId === acc.id && destinationUserProfile && (
                                                                                            <div className="text-xs text-gray-500">
                                                                                                ID: {destinationUserProfile.id} | @{destinationUserProfile.username}
                                                                                            </div>
                                                                                        )}
                                                                                        {!acc.valid && <span className="text-xs text-red-500">Invalid Session</span>}
                                                                                    </div>
                                                                                    {selectedTelegramDestAccountId === acc.id && <CheckCircle2 className="w-5 h-5 text-blue-500" />}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-sm text-gray-500 italic p-2">No Telegram accounts found. Please add one in Settings.</div>
                                                                    )}
                                                                </div>

                                                                {/* Destination Chat ID */}
                                                                <div className="space-y-1.5">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <label className="text-xs font-medium text-gray-500 uppercase">Target Chat ID</label>
                                                                            {selectedTelegramDestAccountId && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={handleRefreshDestChats}
                                                                                    disabled={isLoadingDestChats}
                                                                                    className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full transition-colors"
                                                                                    title="Force refresh cached chats"
                                                                                >
                                                                                    <RefreshCw className={cn("w-3 h-3", isLoadingDestChats && "animate-spin")} />
                                                                                    Refresh
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        <div className="group relative">
                                                                            <Info className="w-3 h-3 text-gray-400 cursor-help" />
                                                                            <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                                Use @userinfobot or @getidsbot on Telegram to find the numeric ID of your channel or group (usually starts with -100).
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="relative">
                                                                        {selectedTelegramDestAccountId && (destinationTelegramChats.length > 0 || isLoadingDestChats) ? (
                                                                            <div className="relative">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setIsDestChatDropdownOpen(!isDestChatDropdownOpen)}
                                                                                    disabled={isLoadingDestChats}
                                                                                    className="w-full bg-white border border-gray-300 px-3 py-2.5 rounded-lg flex items-center justify-between text-left focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
                                                                                >
                                                                                    {targetTelegramChatId ? (
                                                                                        <div className="flex items-center gap-2 truncate">
                                                                                            <span className="text-sm text-gray-900 truncate font-medium">
                                                                                                {destinationTelegramChats.find(c => c.id === targetTelegramChatId)?.title || targetTelegramChatId}
                                                                                            </span>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-sm text-gray-500">{isLoadingDestChats ? "Loading..." : "Select Target Chat..."}</span>
                                                                                    )}
                                                                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                                                                </button>

                                                                                <AnimatePresence>
                                                                                    {isDestChatDropdownOpen && (
                                                                                        <motion.div
                                                                                            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                                                                            className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 flex flex-col overflow-hidden"
                                                                                        >
                                                                                            <div className="p-2 border-b border-gray-100 bg-gray-50">
                                                                                                <div className="relative">
                                                                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                                                                    <input
                                                                                                        type="text"
                                                                                                        value={destChatSearchQuery}
                                                                                                        onChange={(e) => setDestChatSearchQuery(e.target.value)}
                                                                                                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500"
                                                                                                        placeholder="Search chats..."
                                                                                                        autoFocus
                                                                                                    />
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="overflow-y-auto p-1 max-h-48 custom-scrollbar">
                                                                                                {filteredDestTelegramChats.length > 0 ? (
                                                                                                    filteredDestTelegramChats.map(c => (
                                                                                                        <button
                                                                                                            key={c.id}
                                                                                                            type="button"
                                                                                                            onClick={() => {
                                                                                                                setTargetTelegramChatId(c.id);
                                                                                                                setIsDestChatDropdownOpen(false);
                                                                                                            }}
                                                                                                            className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-md transition-colors text-left"
                                                                                                        >
                                                                                                            <div className="flex-1 min-w-0">
                                                                                                                <div className="text-sm text-gray-700 truncate font-medium">{c.title}</div>
                                                                                                                <div className="text-[10px] text-gray-400 font-mono">ID: {c.id}</div>
                                                                                                            </div>
                                                                                                            {targetTelegramChatId === c.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                                                                                        </button>
                                                                                                    ))
                                                                                                ) : (
                                                                                                    <div className="p-4 text-center text-xs text-gray-500">No chats found</div>
                                                                                                )}
                                                                                            </div>
                                                                                        </motion.div>
                                                                                    )}
                                                                                </AnimatePresence>
                                                                            </div>
                                                                        ) : (
                                                                            <input
                                                                                type="text"
                                                                                value={targetTelegramChatId}
                                                                                onChange={(e) => setTargetTelegramChatId(e.target.value)}
                                                                                placeholder="-100123456789"
                                                                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                                                                            />
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs text-gray-500">
                                                                        The bot must be an admin in this channel/group to post messages.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                                                {/* Destination Account Context */}
                                                                <div className="space-y-1.5">
                                                                    <label className="text-xs font-medium text-gray-500 uppercase">Destination Account</label>
                                                                    {localAccounts.length > 0 ? (
                                                                        <div className="grid grid-cols-1 gap-2">
                                                                            {localAccounts.map((acc: any) => (
                                                                                <div
                                                                                    key={acc.id}
                                                                                    onClick={() => {
                                                                                        setSelectedDestAccountId(acc.id);
                                                                                        if (!config || acc.id !== config.discordAccountId) {
                                                                                            setTargetGuild(null);
                                                                                            setTargetChannelId("");
                                                                                            setTargetChannels([]);
                                                                                        }
                                                                                    }}
                                                                                    className={cn(
                                                                                        "flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-all",
                                                                                        selectedDestAccountId === acc.id ? "bg-white border-primary ring-1 ring-primary shadow-sm" : "bg-white/50 border-gray-200 hover:border-gray-300 hover:bg-white"
                                                                                    )}
                                                                                >
                                                                                    {acc.avatar ? (
                                                                                        <Image src={`https://cdn.discordapp.com/avatars/${acc.discordId}/${acc.avatar}.png`} width={32} height={32} alt="" className="rounded-full bg-gray-200" unoptimized />
                                                                                    ) : (
                                                                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                                                                            {acc.username[0]}
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className="text-sm font-semibold text-gray-900 truncate">{acc.username}</div>
                                                                                        <div className="text-[10px] text-gray-500 truncate">ID: {acc.discordId}</div>
                                                                                    </div>
                                                                                    {selectedDestAccountId === acc.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-center p-3 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 bg-white/50">
                                                                            No Discord accounts linked.
                                                                        </div>
                                                                    )}

                                                                    {/* Add Account UI for Destination */}
                                                                    <div className="mt-2">
                                                                        {!isAddingAccount ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setIsAddingAccount(true)}
                                                                                className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400 transition-all flex items-center justify-center gap-2"
                                                                            >
                                                                                <UserPlus className="w-3.5 h-3.5" /> Link Another Account
                                                                            </button>
                                                                        ) : (
                                                                            <div className="p-3 bg-white rounded-lg border border-gray-200 space-y-2.5 shadow-sm">
                                                                                <div className="flex justify-between items-center">
                                                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Manual Token Setup</span>
                                                                                    <button onClick={() => setIsAddingAccount(false)}><X className="w-4 h-4 text-gray-400" /></button>
                                                                                </div>
                                                                                <input
                                                                                    type="password"
                                                                                    value={newAccountToken}
                                                                                    onChange={(e) => setNewAccountToken(e.target.value)}
                                                                                    placeholder="Paste User Token Here"
                                                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm outline-none focus:border-primary transition-all font-mono"
                                                                                />
                                                                                {addAccountError && <p className="text-[10px] text-red-500 font-medium">{addAccountError}</p>}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={handleAddNewAccount}
                                                                                    disabled={isAddingAccountLoading || !newAccountToken}
                                                                                    className="w-full py-2 bg-primary text-white text-xs font-bold rounded-md hover:bg-primary/90 transition-all flex justify-center gap-2 shadow-sm"
                                                                                >
                                                                                    {isAddingAccountLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                                                    Verify & Select Account
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {/* Target Guild Select */}
                                                                <div className="space-y-1.5 relative">
                                                                    <label className="text-xs font-medium text-gray-500 uppercase">Target Server</label>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setIsTargetGuildDropdownOpen(!isTargetGuildDropdownOpen)}
                                                                        className="w-full bg-white border border-gray-300 px-3 py-2.5 rounded-lg flex items-center justify-between text-left focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50"
                                                                        disabled={isLoadingTargetGuilds && targetGuilds.length === 0}
                                                                    >
                                                                        <span className={cn("text-sm", targetGuild ? "text-gray-900 font-medium" : "text-gray-500")}>
                                                                            {targetGuild?.name || (isLoadingTargetGuilds ? "Loading Servers..." : "Select Destination Server...")}
                                                                        </span>
                                                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                                                    </button>
                                                                    <AnimatePresence>
                                                                        {isTargetGuildDropdownOpen && (
                                                                            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 flex flex-col overflow-hidden">
                                                                                <div className="p-2 border-b border-gray-100 bg-gray-50">
                                                                                    <div className="relative">
                                                                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                                                        <input
                                                                                            type="text"
                                                                                            value={targetSearchQuery}
                                                                                            onChange={(e) => setTargetSearchQuery(e.target.value)}
                                                                                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-primary"
                                                                                            placeholder="Search..."
                                                                                            autoFocus
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                                <div className="overflow-y-auto p-1 max-h-48 custom-scrollbar">
                                                                                    {isLoadingTargetGuilds && targetGuilds.length === 0 ? (
                                                                                        <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                                                                                    ) : targetGuildsError ? (
                                                                                        <div className="p-3 text-center text-xs text-red-500 font-medium bg-red-50 rounded-md m-1 border border-red-100">
                                                                                            {targetGuildsError}
                                                                                        </div>
                                                                                    ) : filteredTargetGuilds.length > 0 ? (
                                                                                        filteredTargetGuilds.map(g => (
                                                                                            <button
                                                                                                key={g.id}
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    setTargetGuild(g);
                                                                                                    setIsTargetGuildDropdownOpen(false);
                                                                                                    setTargetChannelId("");
                                                                                                    setTargetChannels([]);
                                                                                                }}
                                                                                                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md transition-colors text-left"
                                                                                            >
                                                                                                {g.icon ? <Image src={g.icon} width={24} height={24} alt="" className="rounded-full" unoptimized /> : <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-bold">{(g.name || "").substring(0, 2)}</div>}
                                                                                                <span className="text-sm text-gray-700 truncate">{g.name}</span>
                                                                                            </button>
                                                                                        ))
                                                                                    ) : (
                                                                                        <div className="p-3 text-center text-xs text-gray-500">No servers found</div>
                                                                                    )}
                                                                                </div>
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>

                                                                {/* Target Channel & Webhook */}
                                                                {targetGuild && (
                                                                    <div className="space-y-1.5 relative">
                                                                        <label className="text-xs font-medium text-gray-500 uppercase">Target Channel</label>
                                                                        <button type="button" onClick={() => setIsTargetChannelDropdownOpen(!isTargetChannelDropdownOpen)} disabled={isLoadingTargetChannels} className="w-full bg-white border border-gray-300 px-3 py-2.5 rounded-lg flex items-center justify-between text-left focus:border-primary disabled:opacity-50">
                                                                            <span className={cn("text-sm", targetChannelId ? "text-gray-900 font-medium" : "text-gray-500")}>
                                                                                {targetChannelId ? `#${selectedTargetChannel?.name || targetChannelId}` : (isLoadingTargetChannels ? "Loading..." : "Select Channel...")}
                                                                            </span>
                                                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                                                        </button>
                                                                        <AnimatePresence>
                                                                            {isTargetChannelDropdownOpen && (
                                                                                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 flex flex-col overflow-hidden">
                                                                                    <div className="p-2 border-b border-gray-100 bg-gray-50">
                                                                                        <input
                                                                                            type="text"
                                                                                            value={targetChannelSearchQuery}
                                                                                            onChange={(e) => setTargetChannelSearchQuery(e.target.value)}
                                                                                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-primary"
                                                                                            placeholder="Search channels..."
                                                                                            autoFocus
                                                                                        />
                                                                                    </div>
                                                                                    <div className="overflow-y-auto p-1 max-h-48 custom-scrollbar">
                                                                                        {isLoadingTargetChannels ? (
                                                                                            <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                                                                                        ) : targetChannelsError ? (
                                                                                            <div className="p-3 text-center text-xs text-red-500 font-medium bg-red-50 rounded-md m-1 border border-red-100">{targetChannelsError}</div>
                                                                                        ) : filteredTargetChannels.length > 0 ? filteredTargetChannels.map(c => (
                                                                                            <button key={c.id} type="button" onClick={() => { setTargetChannelId(c.id); setIsTargetChannelDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md truncate">#{c.name}</button>
                                                                                        )) : (
                                                                                            <div className="p-2 text-xs text-gray-400 text-center">No channels found</div>
                                                                                        )}
                                                                                    </div>

                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>

                                                                    </div>
                                                                )}

                                                                {/* Webhooks */}
                                                                {targetChannelId && (
                                                                    <div className="space-y-2 pt-2">
                                                                        <label className="text-xs font-medium text-gray-500 uppercase">Webhook Configuration</label>
                                                                        {isLoadingWebhooks ? (
                                                                            <div className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading webhooks...</div>
                                                                        ) : webhookError ? (
                                                                            <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg flex items-center gap-2 border border-red-100">
                                                                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                                                                {webhookError}
                                                                            </div>
                                                                        ) : webhooks.length > 0 ? (
                                                                            <div className="grid gap-2 mb-3">
                                                                                {webhooks.map((wh: any) => (
                                                                                    <button key={wh.id} type="button" onClick={() => handleSelectWebhook(wh)} className={cn("w-full flex items-center gap-2 px-3 py-2 border rounded-lg transition-all", wh.url === webhookUrl ? "bg-blue-50 border-primary shadow-sm" : "bg-white border-gray-200 hover:bg-gray-50")}>
                                                                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                                                        <span className="text-sm font-medium text-gray-700 flex-1 text-left truncate">{wh.name}</span>
                                                                                        {wh.url === webhookUrl && <CheckCircle2 className="w-4 h-4 text-primary" />}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="text-center py-4 mb-3 bg-white rounded-lg border border-dashed border-gray-300">
                                                                                <p className="text-xs text-gray-500">No webhooks found in this channel.</p>
                                                                            </div>
                                                                        )}

                                                                        {!isLoadingWebhooks && !webhookError && webhooks.length === 0 && (
                                                                            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 mt-2">
                                                                                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Create New Webhook</label>
                                                                                <div className="flex items-center gap-2">
                                                                                    <input
                                                                                        type="text"
                                                                                        placeholder="Webhook Name (e.g. Disbot Mirror)"
                                                                                        value={newWebhookName}
                                                                                        onChange={e => setNewWebhookName(e.target.value)}
                                                                                        className="flex-1 text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-md outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                                                                    />
                                                                                    <button type="button" onClick={handleCreateWebhook} disabled={isCreatingWebhook || !newWebhookName.trim()} className="px-4 py-2 bg-gray-900 border border-black hover:bg-gray-800 text-white text-xs font-bold rounded-md disabled:opacity-50 transition-all flex items-center justify-center min-w-[100px] shadow-sm">
                                                                                        {isCreatingWebhook ? (
                                                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                                        ) : (
                                                                                            "Create"
                                                                                        )}
                                                                                    </button>
                                                                                </div>
                                                                                <p className="text-[10px] text-gray-400">Give your webhook a name, then click create.</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* BLUR ZONES (ELITE ONLY) */}
                                                    <div className="pt-6 border-t border-gray-200">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                                                <ScanEye className="w-4 h-4 text-gray-400" />
                                                                Visual Blur Selector
                                                                <span className="text-[10px] bg-black text-[#00FFFF] px-1.5 py-0.5 font-bold uppercase tracking-wider">Elite</span>
                                                            </h3>
                                                        </div>

                                                        {userPlan === 'ELITE' ? (
                                                            <BlurAreaSelector
                                                                value={blurRegions}
                                                                onChange={setBlurRegions}
                                                                maxRegions={3}
                                                            />
                                                        ) : (
                                                            <div className="bg-gray-50 border border-gray-200 p-6 flex flex-col items-center justify-center text-center gap-3 relative overflow-hidden group">
                                                                <div className="absolute inset-0 bg-gray-100/50 backdrop-blur-[1px] z-0" />
                                                                <div className="z-10 flex flex-col items-center gap-3">
                                                                    <div className="w-12 h-12 bg-gray-900 text-[#00FFFF] rounded-none flex items-center justify-center mb-1 shadow-sm">
                                                                        <Lock className="w-5 h-5" />
                                                                    </div>
                                                                    <h4 className="font-bold text-gray-900">Elite Feature Locked</h4>
                                                                    <p className="text-sm text-gray-500 max-w-xs mx-auto">
                                                                        Smart privacy blur and region masking is exclusive to the Elite plan.
                                                                    </p>
                                                                    {/* Mock Upgrade Button - In real app would link to billing */}
                                                                    <Link
                                                                        href="/dashboard/settings"
                                                                        className="text-xs font-bold text-gray-900 border border-gray-300 bg-white px-4 py-2 mt-1 hover:bg-gray-50 transition-colors shadow-sm block text-center"
                                                                    >
                                                                        Upgrade to Elite
                                                                    </Link>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* ELITE ANTI-SPAM */}
                                                    {userPlan === 'ELITE' && (
                                                        <div className="pt-6 border-t border-gray-200">
                                                            <div className="flex items-center justify-between mb-4">
                                                                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                                                    <ScanEye className="w-4 h-4 text-gray-400" />
                                                                    Anti-Spam Shield
                                                                    <span className="text-[10px] bg-black text-[#00FFFF] px-1.5 py-0.5 font-bold uppercase tracking-wider">Elite</span>
                                                                </h3>
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <span className="text-xs text-gray-500 font-medium uppercase">Active</span>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="sr-only peer"
                                                                        checked={antiSpamEnabled}
                                                                        onChange={(e) => setAntiSpamEnabled(e.target.checked)}
                                                                    />
                                                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500 relative"></div>
                                                                </label>
                                                            </div>

                                                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
                                                                <p className="text-xs text-gray-500">
                                                                    Automatically locks out senders who flood the channel (5 messages in 10s) and allows manual whitelisting/blacklisting.
                                                                </p>

                                                                <div className="space-y-2">
                                                                    <label className="text-xs font-semibold text-gray-700 uppercase">Blacklisted Sender IDs</label>
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            type="text"
                                                                            value={newBlacklistId}
                                                                            onChange={(e) => setNewBlacklistId(e.target.value)}
                                                                            placeholder="Enter Discord or Telegram User ID"
                                                                            className="flex-1 px-3 py-2 border rounded-md text-sm outline-none focus:border-primary font-mono"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (newBlacklistId.trim() && !blacklistedUsers.includes(newBlacklistId.trim())) {
                                                                                    setBlacklistedUsers([...blacklistedUsers, newBlacklistId.trim()]);
                                                                                    setNewBlacklistId("");
                                                                                }
                                                                            }}
                                                                            className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-md hover:bg-gray-800 transition"
                                                                        >
                                                                            Add
                                                                        </button>
                                                                    </div>

                                                                    {blacklistedUsers.length > 0 && (
                                                                        <div className="mt-2 bg-white border rounded-md divide-y custom-scrollbar max-h-40 overflow-y-auto">
                                                                            {blacklistedUsers.map((id) => (
                                                                                <div key={id} className="flex justify-between items-center px-3 py-2 text-sm font-mono text-gray-700">
                                                                                    <span>{id}</span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setBlacklistedUsers(blacklistedUsers.filter(u => u !== id))}
                                                                                        className="text-red-500 hover:text-red-700 text-xs font-bold"
                                                                                    >
                                                                                        Remove
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* BRANDING CONFIGURATION */}
                                                    <div className="pt-6 border-t border-gray-200">
                                                        <BrandingCustomizer
                                                            userPlan={userPlan}
                                                            config={{
                                                                watermarkType,
                                                                customWatermark,
                                                                watermarkImageUrl,
                                                                watermarkPosition,
                                                                watermarkOpacity,
                                                                brandColor
                                                            }}
                                                            onChange={(updates) => {
                                                                if (updates.watermarkType !== undefined) setWatermarkType(updates.watermarkType);
                                                                if (updates.customWatermark !== undefined) setCustomWatermark(updates.customWatermark);
                                                                if (updates.watermarkImageUrl !== undefined) setWatermarkImageUrl(updates.watermarkImageUrl);
                                                                if (updates.watermarkPosition !== undefined) setWatermarkPosition(updates.watermarkPosition);
                                                                if (updates.watermarkOpacity !== undefined) setWatermarkOpacity(updates.watermarkOpacity);
                                                                if (updates.brandColor !== undefined) setBrandColor(updates.brandColor);
                                                            }}
                                                        />
                                                    </div>


                                                    {error && (
                                                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 border border-red-100">
                                                            <AlertTriangle className="w-4 h-4 shrink-0" />
                                                            {error}
                                                        </div>
                                                    )}

                                                </form>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Footer */}
                                <div className="p-6 border-t border-gray-100 flex justify-between gap-3 bg-gray-50 rounded-b-xl">
                                    {step === 1 ? (
                                        <>
                                            <button
                                                onClick={onClose}
                                                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors text-sm font-semibold"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={nextStep}
                                                className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-2"
                                            >
                                                Next Step <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={prevStep}
                                                className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200/50 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                                            >
                                                <ChevronLeft className="w-4 h-4" /> Back
                                            </button>

                                            <button
                                                onClick={handleSubmit}
                                                disabled={isSubmitting}
                                                className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ml-auto"
                                            >
                                                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                                {isEdit ? "Update Mirror" : "Create Mirror"}
                                            </button>
                                        </>
                                    )}
                                </div>

                            </motion.div>
                        </div>
                    </>
                )
                }
            </AnimatePresence>
            <UpgradeModal
                isOpen={upgradeModalOpen}
                onClose={() => setUpgradeModalOpen(false)}
                reason={upgradeReason}
            />
        </>
    );
}
