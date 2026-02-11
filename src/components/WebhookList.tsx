"use client";

import { useState } from "react";
import { Plus, Trash2, PauseCircle, PlayCircle, Calendar, Settings, ShieldAlert, MoreHorizontal, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import EditMirrorModal, { type MirrorConfig as ModalCurrentConfig } from "./EditMirrorModal"; // Renamed import
import { deleteMirrorConfig, toggleMirrorConfig } from "@/actions/mirror";
import { useRouter } from "next/navigation";

// --- Types ---

interface MirrorConfig {
    id: string;
    sourceGuildName: string | null;
    sourceChannelId: string;
    targetWebhookUrl: string;
    active: boolean;
    createdAt: Date;
    userToken?: string | null;
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
            return `.../${id}/••••`;
        } catch (e) {
            return "Invalid URL";
        }
    };

    return (
        <div className="space-y-8">

            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                        Active Mirrors
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Manage your automated message replication paths.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="Search..."
                            className="bg-[#161B2B]/50 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-300 w-64 focus:border-[#00D1FF]/50 focus:w-80 outline-none transition-all duration-300 backdrop-blur-sm"
                        />
                    </div>

                    <button
                        onClick={() => { setEditingConfig(undefined); setIsModalOpen(true); }}
                        disabled={isLimitReached}
                        className={cn(
                            "group flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-300 shadow-lg",
                            isLimitReached
                                ? "bg-gray-700/50 cursor-not-allowed opacity-50"
                                : "bg-[#5865F2] hover:bg-[#4752C4] hover:shadow-[#5865F2]/25 hover:scale-105"
                        )}
                    >
                        <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
                        New Mirror
                    </button>
                </div>
            </div>

            {isLimitReached && (
                <div className="obsidian-card p-4 rounded-xl flex items-center justify-between border-l-4 border-amber-500 bg-amber-500/5">
                    <div className="px-2">
                        <h4 className="text-amber-400 font-bold text-sm tracking-wide">PLAN LIMIT REACHED</h4>
                        <p className="text-amber-200/60 text-xs mt-0.5">Upgrade for unlimited bandwidth.</p>
                    </div>
                </div>
            )}

            {/* List */}
            {initialConfigs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 obsidian-card rounded-3xl border-dashed border-white/10">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-b from-[#161B2B] to-[#0B0F1A] border border-white/5 flex items-center justify-center mb-6 shadow-2xl">
                        <Activity className="w-8 h-8 text-gray-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-300 mb-2">No Active Mirrors</h3>
                    <p className="text-gray-500 max-w-sm text-center mb-8 font-light">
                        Initialize your first mirroring configuration to start replicating messages.
                    </p>
                    <button
                        onClick={() => { setEditingConfig(undefined); setIsModalOpen(true); }}
                        className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-medium transition-all hover:scale-105"
                    >
                        Create First Mirror
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <AnimatePresence>
                        {initialConfigs.map((config) => (
                            <motion.div
                                key={config.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                className="obsidian-card rounded-2xl p-4 flex items-center gap-6 group transition-all duration-300 hover:border-[#00D1FF]/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
                            >
                                {/* Status Indicator */}
                                <div className="pl-2">
                                    <div className="relative flex items-center justify-center w-3 h-3">
                                        {config.active && (
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                        )}
                                        <span className={cn(
                                            "relative inline-flex rounded-full h-2 w-2",
                                            config.active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-gray-600"
                                        )}></span>
                                    </div>
                                </div>

                                {/* Main Info */}
                                <div className="flex-1 grid grid-cols-12 gap-8 items-center">
                                    {/* Source */}
                                    <div className="col-span-4">
                                        <h4 className="font-bold text-white text-base truncate tracking-tight">{config.sourceGuildName || "Unknown Server"}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Source Channel</span>
                                            <span className="text-xs text-gray-400 font-mono bg-black/30 px-1.5 py-0.5 rounded border border-white/5">{config.sourceChannelId}</span>
                                        </div>
                                    </div>

                                    {/* Destination */}
                                    <div className="col-span-4 hidden md:block">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Destination</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-300">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" />
                                            <span className="font-mono opacity-80">{maskWebhook(config.targetWebhookUrl)}</span>
                                        </div>
                                    </div>

                                    {/* Meta */}
                                    <div className="col-span-3 hidden md:flex items-center gap-2 text-xs text-gray-500">
                                        <Calendar className="w-3.5 h-3.5 opacity-50" />
                                        <span>{format(new Date(config.createdAt), "MMM d, yyyy")}</span>
                                    </div>
                                </div>

                                {/* Actions (Hover Reveal) */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 translate-x-2 group-hover:translate-x-0">
                                    <button
                                        onClick={() => handleToggle(config.id, config.active)}
                                        disabled={togglingId === config.id}
                                        className={cn(
                                            "p-2.5 rounded-xl transition-all hover:scale-110",
                                            config.active
                                                ? "text-gray-400 hover:text-amber-400 hover:bg-amber-400/10"
                                                : "text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/10"
                                        )}
                                        title={config.active ? "Pause" : "Resume"}
                                    >
                                        {togglingId === config.id ? (
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : config.active ? (
                                            <PauseCircle className="w-5 h-5" />
                                        ) : (
                                            <PlayCircle className="w-5 h-5" />
                                        )}
                                    </button>

                                    <button
                                        onClick={() => { setEditingConfig(config); setIsModalOpen(true); }}
                                        className="p-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all hover:scale-110"
                                        title="Settings"
                                    >
                                        <Settings className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={() => handleDelete(config.id)}
                                        disabled={deletingId === config.id}
                                        className="p-2.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all hover:scale-110"
                                        title="Delete"
                                    >
                                        {deletingId === config.id ? (
                                            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Trash2 className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                                <div className="opacity-100 group-hover:opacity-0 transition-opacity absolute right-6 text-gray-600">
                                    <MoreHorizontal className="w-5 h-5" />
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
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
