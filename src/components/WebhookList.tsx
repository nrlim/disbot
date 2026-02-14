"use client";

import { useState } from "react";
import { Plus, Trash2, Edit3, Search, Activity, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import EditMirrorModal, { type MirrorConfig as ModalCurrentConfig } from "./EditMirrorModal";
import { deleteMirrorConfig, toggleMirrorConfig } from "@/actions/mirror";
import { useRouter } from "next/navigation";

// --- Types ---

interface MirrorConfig {
    id: string;
    sourcePlatform?: 'DISCORD' | 'TELEGRAM';
    sourceGuildName: string | null;
    sourceChannelId: string | null; // Empty for Telegram
    targetWebhookUrl: string | null;
    active: boolean;
    createdAt: Date;
    userToken?: string | null;
    telegramSession?: string | null;
    telegramChatId?: string | null;
    telegramTopicId?: string | null;
    discordAccountId?: string | null;
}

interface WebhookListProps {
    initialConfigs: MirrorConfig[];
    usageCount: number;
    isLimitReached: boolean;
    accounts: any[];
}

export default function WebhookList({ initialConfigs, usageCount, isLimitReached, accounts }: WebhookListProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<MirrorConfig | undefined>(undefined);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this configuration?")) return;
        setDeletingId(id);
        await deleteMirrorConfig(id);
        setDeletingId(null);
        router.refresh();
    };

    const handleToggle = async (id: string, currentStatus: boolean) => {
        setTogglingId(id);
        await toggleMirrorConfig(id, !currentStatus);
        setTogglingId(null);
        router.refresh();
    };

    const maskWebhook = (url: string) => {
        try {
            const parts = url.split("/");
            const id = parts[5] || "...";
            return `.../${id.substring(0, 8)}/••••`;
        } catch (e) {
            return "Invalid URL";
        }
    };

    const filteredConfigs = initialConfigs.filter(config =>
        (config.sourceGuildName?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
        (config.sourceChannelId || "").includes(searchQuery)
    );

    return (
        <div className="space-y-6">

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-gray-200">
                <div className="w-full sm:w-auto">
                    <h2 className="text-lg font-bold text-gray-900">Active Mirrors</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Manage your replication tasks.</p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search mirrors..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 w-full sm:w-64 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-gray-400"
                        />
                    </div>

                    <button
                        onClick={() => { setEditingConfig(undefined); setIsModalOpen(true); }}
                        disabled={isLimitReached}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all shadow-sm whitespace-nowrap",
                            isLimitReached
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                                : "bg-primary text-white hover:bg-primary/90 border border-primary"
                        )}
                    >
                        <Plus className="w-4 h-4" />
                        New Mirror
                    </button>
                </div>
            </div>

            {isLimitReached && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                        <h4 className="text-amber-800 font-bold text-sm">Plan Limit Reached</h4>
                        <p className="text-amber-700/80 text-xs mt-0.5">Upgrade your plan to create more mirror tasks.</p>
                    </div>
                </div>
            )}

            {/* Data Grid */}
            {initialConfigs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white border border-dashed border-gray-300 rounded-xl">
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-400">
                        <Activity className="w-6 h-6" />
                    </div>
                    <h3 className="text-gray-900 font-semibold text-sm mb-1">No Active Mirrors</h3>
                    <p className="text-gray-500 text-sm max-w-sm text-center mb-6">
                        You haven't created any mirror configurations yet.
                    </p>
                    <button
                        onClick={() => { setEditingConfig(undefined); setIsModalOpen(true); }}
                        className="px-5 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900 text-sm font-semibold rounded-lg transition-colors shadow-sm"
                    >
                        Create Your First Mirror
                    </button>
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Status</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Destination</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Created</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                <AnimatePresence>
                                    {filteredConfigs.map((config) => (
                                        <motion.tr
                                            key={config.id}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="group hover:bg-gray-50/50 transition-colors"
                                        >
                                            {/* Status */}
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => handleToggle(config.id, config.active)}
                                                    disabled={togglingId === config.id}
                                                    className={cn(
                                                        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                                                        config.active
                                                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                    )}
                                                >
                                                    {togglingId === config.id ? (
                                                        <div className="w-2 h-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <div className={cn("w-1.5 h-1.5 rounded-full", config.active ? "bg-green-500" : "bg-gray-400")} />
                                                    )}
                                                    {config.active ? "Active" : "Paused"}
                                                </button>
                                            </td>

                                            {/* Source */}
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        {config.sourcePlatform === 'TELEGRAM' ? (
                                                            <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-bold">TG</span>
                                                        ) : (
                                                            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">DS</span>
                                                        )}
                                                        <span className="text-gray-900 font-medium text-sm truncate max-w-[180px]">
                                                            {config.sourceGuildName || "Unknown Source"}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-gray-500 mt-0.5 flex gap-1 items-center">
                                                        <span className="opacity-50">#</span>
                                                        {config.telegramChatId || config.sourceChannelId || "N/A"}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Target */}
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                                    {maskWebhook(config.targetWebhookUrl || "")}
                                                </div>
                                            </td>

                                            {/* Created */}
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {format(new Date(config.createdAt), "MMM d, yyyy")}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => { setEditingConfig(config); setIsModalOpen(true); }}
                                                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded-lg transition-colors"
                                                        title="Configure"
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>

                                                    <button
                                                        onClick={() => handleDelete(config.id)}
                                                        disabled={deletingId === config.id}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete"
                                                    >
                                                        {deletingId === config.id ? (
                                                            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                    {filteredConfigs.length === 0 && searchQuery && (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            No mirrors found matching "{searchQuery}"
                        </div>
                    )}
                </div>
            )}

            <EditMirrorModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                    router.refresh();
                }}
                config={editingConfig}
                accounts={accounts}
            />
        </div>
    );
}
