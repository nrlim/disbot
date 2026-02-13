"use client";

import { useState } from "react";
import { Plus, Trash2, PauseCircle, PlayCircle, Calendar, Settings, ShieldAlert, MoreHorizontal, Activity, Power, Edit3 } from "lucide-react";
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
}

interface WebhookListProps {
    initialConfigs: MirrorConfig[];
    usageCount: number;
    isLimitReached: boolean;
}

export default function WebhookList({ initialConfigs, usageCount, isLimitReached }: WebhookListProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<MirrorConfig | undefined>(undefined);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
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

    return (
        <div className="space-y-6">

            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
                <div>
                    <h2 className="text-xl font-mono font-bold text-white uppercase tracking-tight">Active Processes</h2>
                    <p className="text-xs text-zinc-500 mt-1 font-mono">Manage automated replication threads.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="FILTER_ID..."
                            className="bg-zinc-950 border border-zinc-800 px-4 py-2 text-xs text-zinc-300 w-64 focus:border-primary outline-none transition-all font-mono placeholder:text-zinc-700"
                        />
                    </div>

                    <button
                        onClick={() => { setEditingConfig(undefined); setIsModalOpen(true); }}
                        disabled={isLimitReached}
                        className={cn(
                            "group flex items-center gap-2 px-4 py-2 text-xs font-bold font-mono uppercase transition-all border",
                            isLimitReached
                                ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
                                : "bg-primary/10 border-primary/50 text-primary hover:bg-primary hover:text-black"
                        )}
                    >
                        <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90" />
                        Init New Mirror
                    </button>
                </div>
            </div>

            {isLimitReached && (
                <div className="p-3 border-l-2 border-amber-500 bg-amber-500/5 flex items-center justify-between">
                    <div className="px-2">
                        <h4 className="text-amber-500 font-mono font-bold text-xs uppercase tracking-wider">Plan Capacity Reached</h4>
                        <p className="text-amber-500/60 text-[10px] uppercase mt-0.5">Upgrade required for additional slots.</p>
                    </div>
                </div>
            )}

            {/* Data Grid */}
            {initialConfigs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 border border-dashed border-zinc-800 bg-zinc-900/20">
                    <div className="w-16 h-16 bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-4">
                        <Activity className="w-6 h-6 text-zinc-600" />
                    </div>
                    <h3 className="text-zinc-300 font-mono font-bold text-sm mb-1 uppercase">No Active Mirrors</h3>
                    <p className="text-zinc-600 font-mono text-xs max-w-sm text-center mb-6">
                        System idle. Initialize a new configuration to begin.
                    </p>
                    <button
                        onClick={() => { setEditingConfig(undefined); setIsModalOpen(true); }}
                        className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono uppercase font-bold transition-colors"
                    >
                        Create Configuration
                    </button>
                </div>
            ) : (
                <div className="overflow-hidden border border-zinc-800 bg-zinc-950">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-900 border-b border-zinc-800">
                            <tr>
                                <th className="px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Status</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Source</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Target</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Created</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono text-right">Controls</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            <AnimatePresence>
                                {initialConfigs.map((config) => (
                                    <motion.tr
                                        key={config.id}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="group hover:bg-zinc-900 transition-colors"
                                    >
                                        {/* Status */}
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => handleToggle(config.id, config.active)}
                                                    disabled={togglingId === config.id}
                                                    className="relative flex items-center justify-center group/status"
                                                    title={config.active ? "Pause" : "Resume"}
                                                >
                                                    {togglingId === config.id ? (
                                                        <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <div className={cn(
                                                                "w-2.5 h-2.5 transition-all duration-300",
                                                                config.active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-600"
                                                            )} />
                                                        </>
                                                    )}
                                                </button>
                                                <span className={cn(
                                                    "text-xs font-mono font-bold uppercase",
                                                    config.active ? "text-emerald-500" : "text-zinc-500"
                                                )}>
                                                    {config.active ? "RUNNING" : "HALTED"}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Source */}
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    {config.sourcePlatform === 'TELEGRAM' ? (
                                                        <span className="text-[10px] bg-sky-900/50 text-sky-200 px-1 rounded font-mono">TG</span>
                                                    ) : (
                                                        <span className="text-[10px] bg-indigo-900/50 text-indigo-200 px-1 rounded font-mono">DS</span>
                                                    )}
                                                    <span className="text-zinc-200 font-medium text-sm truncate max-w-[150px] font-sans tracking-tight">
                                                        {config.sourceGuildName || "Unknown Source"}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-zinc-500 font-mono mt-0.5 ml-8" title={config.sourcePlatform === 'TELEGRAM' ? (config.telegramChatId || "") : (config.sourceChannelId || "")}>
                                                    ID: {config.sourcePlatform === 'TELEGRAM' ? config.telegramChatId : config.sourceChannelId}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Target */}
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 group-hover:text-zinc-300 transition-colors">
                                                <div className="w-1.5 h-1.5 bg-indigo-500" />
                                                {maskWebhook(config.targetWebhookUrl || "")}
                                            </div>
                                        </td>

                                        {/* Created */}
                                        <td className="px-6 py-4 text-xs font-mono text-zinc-500">
                                            {format(new Date(config.createdAt), "yyyy-MM-dd")}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => { setEditingConfig(config); setIsModalOpen(true); }}
                                                    className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                                                    title="Configure"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>

                                                <button
                                                    onClick={() => handleDelete(config.id)}
                                                    disabled={deletingId === config.id}
                                                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                                                    title="Terminate"
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
            )}

            <EditMirrorModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                    router.refresh();
                }}
                config={editingConfig}
            />
        </div>
    );
}
