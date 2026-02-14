"use client";

import { useState } from "react";
import { Plus, Trash2, Edit3, Search, Activity, AlertCircle, CheckCircle2, AlertTriangle, X, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import EditMirrorModal, { type MirrorConfig as ModalCurrentConfig } from "./EditMirrorModal";
import { toast } from "react-hot-toast";
import { deleteMirrorConfig, toggleMirrorConfig, deleteMirrorGroup } from "@/actions/mirror";
import { useRouter } from "next/navigation";

// --- Types ---

interface MirrorConfig {
    id: string;
    sourcePlatform?: 'DISCORD' | 'TELEGRAM';
    sourceGuildName: string | null;
    sourceGuildId?: string | null;
    sourceChannelId: string | null; // Empty for Telegram
    targetWebhookUrl: string | null;
    active: boolean;
    createdAt: Date;
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
    targetWebhookName?: string | null;
    sourceChannelName?: string | null;
    targetGuildName?: string | null;
}

interface WebhookListProps {
    initialConfigs: MirrorConfig[];
    groups: any[];
    usageCount: number;
    isLimitReached: boolean;
    accounts: any[];
}

export default function WebhookList({ initialConfigs, groups, usageCount, isLimitReached, accounts }: WebhookListProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<MirrorConfig | undefined>(undefined);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedFilterGroup, setSelectedFilterGroup] = useState<string>("all");
    const [directedGroupId, setDirectedGroupId] = useState<string | null>(null);
    const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [groupPages, setGroupPages] = useState<Record<string, number>>({});
    const ITEMS_PER_PAGE = 5;

    const router = useRouter();

    const toggleGroup = (groupId: string) => {
        const next = new Set(expandedGroups);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        setExpandedGroups(next);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this configuration?")) return;
        setDeletingId(id);
        const res = await deleteMirrorConfig(id);
        if (res.error) toast.error(res.error);
        else toast.success("Mirror deleted");
        setDeletingId(null);
        router.refresh();
    };

    const handleToggle = async (id: string, currentStatus: boolean) => {
        setTogglingId(id);
        const res = await toggleMirrorConfig(id, !currentStatus);
        if (res.error) toast.error(res.error);
        setTogglingId(null);
        router.refresh();
    };

    const handleDeleteGroup = async (groupId: string, name: string) => {
        if (!confirm(`Are you sure you want to delete the group "${name}" and ALL its mirrors?`)) return;
        setDeletingGroupId(groupId);
        const res = await deleteMirrorGroup(groupId);
        if (res.error) toast.error(res.error);
        else toast.success("Project and all mirrors deleted");
        setDeletingGroupId(null);
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

    // Grouping Logic
    const groupedData = groups.map(group => {
        const configs = initialConfigs.filter(c => c.groupId === group.id);
        const matchesSearch = configs.filter(config =>
            (config.sourceGuildName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            (config.telegramChatId || config.sourceChannelId || "").toLowerCase().includes(searchQuery.toLowerCase())
        );

        return {
            ...group,
            configs: matchesSearch,
            totalConfigs: configs.length,
            activeCount: configs.filter(c => c.active).length
        };
    }).filter(g => {
        if (selectedFilterGroup !== "all" && g.id !== selectedFilterGroup) return false;
        if (searchQuery && g.configs.length === 0 && !g.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    // Handle ungrouped configs if any
    const ungroupedConfigs = initialConfigs.filter(c => !c.groupId).filter(config =>
        (config.sourceGuildName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (config.telegramChatId || config.sourceChannelId || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (ungroupedConfigs.length > 0 && (selectedFilterGroup === "all" || selectedFilterGroup === "none")) {
        groupedData.push({
            id: "none",
            name: "Unorganized",
            configs: ungroupedConfigs,
            activeCount: ungroupedConfigs.filter(c => c.active).length,
            totalConfigs: ungroupedConfigs.length,
            type: "MIXED"
        } as any);
    }

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-4 flex-1">
                    <div className="relative flex-1 max-w-md group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search projects or sources..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                    </div>
                    <div className="relative">
                        <select
                            value={selectedFilterGroup}
                            onChange={(e) => setSelectedFilterGroup(e.target.value)}
                            className="pl-3 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all appearance-none font-medium text-gray-600"
                        >
                            <option value="all">All Projects</option>
                            {groups.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                            {ungroupedConfigs.length > 0 && <option value="none">Unorganized</option>}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                <button
                    onClick={() => {
                        setEditingConfig(undefined);
                        setDirectedGroupId(null);
                        setIsModalOpen(true);
                    }}
                    disabled={isLimitReached}
                    className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95"
                >
                    <Plus className="w-4 h-4" /> Create New Mirror
                </button>
            </div>

            {isLimitReached && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 animate-pulse">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                        <h4 className="text-amber-800 font-bold text-sm">Plan Limit Reached</h4>
                        <p className="text-amber-700/80 text-xs">Upgrade to Pro to unlock unlimited mirror threads.</p>
                    </div>
                </div>
            )}

            {/* Expandable Group List */}
            <div className="space-y-4">
                {groupedData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white border border-dashed border-gray-300 rounded-2xl">
                        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 text-gray-300 rotate-12 group-hover:rotate-0 transition-transform">
                            <Activity className="w-8 h-8" />
                        </div>
                        <h3 className="text-gray-900 font-bold text-lg mb-1">No Projects Found</h3>
                        <p className="text-gray-500 text-sm max-w-sm text-center mb-8">
                            Ready to start replicating? Create your first mirror group to get started.
                        </p>
                        <button
                            onClick={() => { setEditingConfig(undefined); setIsModalOpen(true); }}
                            className="px-8 py-3 bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white text-sm font-bold rounded-xl transition-all shadow-sm"
                        >
                            Get Started
                        </button>
                    </div>
                ) : (
                    groupedData.map((group) => {
                        const isExpanded = expandedGroups.has(group.id);
                        const currentPage = groupPages[group.id] || 0;
                        const paginatedConfigs = group.configs.slice(
                            currentPage * ITEMS_PER_PAGE,
                            (currentPage + 1) * ITEMS_PER_PAGE
                        );
                        const totalPages = Math.ceil(group.configs.length / ITEMS_PER_PAGE);

                        return (
                            <div key={group.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden transition-all hover:border-primary/30">
                                {/* Group Header */}
                                <div
                                    className={cn(
                                        "p-4 flex items-center justify-between cursor-pointer select-none transition-colors",
                                        isExpanded ? "bg-gray-50/80 border-b border-gray-100" : "hover:bg-gray-50/50"
                                    )}
                                    onClick={() => toggleGroup(group.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                            isExpanded ? "bg-primary text-white" : "bg-gray-100 text-gray-400 group-hover:bg-primary/10 group-hover:text-primary"
                                        )}>
                                            <ChevronDown className={cn("w-5 h-5 transition-transform duration-300", isExpanded ? "rotate-180" : "-rotate-90")} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-bold text-gray-900">{group.name}</h3>
                                                {group.type === "TELEGRAM_TO_DISCORD" ? (
                                                    <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-bold">TELEGRAM</span>
                                                ) : group.type === "DISCORD_TO_DISCORD" ? (
                                                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">DISCORD</span>
                                                ) : null}
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                                                    <Activity className="w-3 h-3" />
                                                    {group.activeCount} Active
                                                </span>
                                                <span className="text-xs text-gray-400 font-medium">|</span>
                                                <span className="text-xs text-gray-500 font-medium">
                                                    {group.totalConfigs} Total Mirror{group.totalConfigs !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingConfig(undefined);
                                                setDirectedGroupId(group.id);
                                                setIsModalOpen(true);
                                            }}
                                            className="p-2 bg-gray-100 text-gray-600 hover:bg-primary hover:text-white rounded-lg transition-all"
                                            title="Add mirror to this group"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>

                                        {group.id !== "none" && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteGroup(group.id, group.name);
                                                }}
                                                disabled={deletingGroupId === group.id}
                                                className="p-2 bg-gray-100 text-gray-500 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                                                title="Delete entire project"
                                            >
                                                {deletingGroupId === group.id ? (
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded Content */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                        >
                                            <div className="p-0 overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead className="bg-gray-50/50 border-b border-gray-100">
                                                        <tr>
                                                            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                                                            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Source Channel</th>
                                                            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Target Webhook</th>
                                                            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {paginatedConfigs.map((config: MirrorConfig) => (
                                                            <tr key={config.id} className="group hover:bg-blue-50/30 transition-colors">
                                                                <td className="px-6 py-4">
                                                                    <button
                                                                        onClick={() => handleToggle(config.id, config.active)}
                                                                        disabled={togglingId === config.id}
                                                                        className={cn(
                                                                            "relative flex items-center gap-2 pr-3 pl-1.5 py-1 rounded-full text-[10px] font-bold border transition-all",
                                                                            config.active
                                                                                ? "bg-green-50 text-green-700 border-green-200"
                                                                                : "bg-gray-50 text-gray-500 border-gray-200"
                                                                        )}
                                                                    >
                                                                        {togglingId === config.id ? (
                                                                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                                        ) : (
                                                                            <div className={cn("w-2 h-2 rounded-full", config.active ? "bg-green-500 animate-pulse" : "bg-gray-300")} />
                                                                        )}
                                                                        {config.active ? "RUNNING" : "STOPPED"}
                                                                    </button>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-gray-400 font-mono text-xs">#</span>
                                                                        <span className="text-sm font-semibold text-gray-700 font-mono">
                                                                            {config.sourceChannelName || config.telegramChatId || config.sourceChannelId || "Unknown"}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-2 font-mono text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 max-w-[200px]">
                                                                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                                                                        <span className="truncate" title={config.targetWebhookUrl || ""}>
                                                                            {config.targetWebhookName || maskWebhook(config.targetWebhookUrl || "")}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <button
                                                                            onClick={() => { setEditingConfig(config); setIsModalOpen(true); }}
                                                                            className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                                        >
                                                                            <Edit3 className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDelete(config.id)}
                                                                            disabled={deletingId === config.id}
                                                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                        >
                                                                            {deletingId === config.id ? (
                                                                                <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                                                            ) : (
                                                                                <Trash2 className="w-4 h-4" />
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                {/* In-Group Pagination */}
                                                {totalPages > 1 && (
                                                    <div className="px-6 py-3 bg-gray-50/50 flex items-center justify-between border-t border-gray-100">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                            Page {currentPage + 1} / {totalPages}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => setGroupPages(prev => ({ ...prev, [group.id]: Math.max(0, currentPage - 1) }))}
                                                                disabled={currentPage === 0}
                                                                className="px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-bold disabled:opacity-30"
                                                            >
                                                                Prev
                                                            </button>
                                                            <button
                                                                onClick={() => setGroupPages(prev => ({ ...prev, [group.id]: Math.min(totalPages - 1, currentPage + 1) }))}
                                                                disabled={currentPage === totalPages - 1}
                                                                className="px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-bold disabled:opacity-30"
                                                            >
                                                                Next
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })
                )}
            </div>

            <EditMirrorModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                    setIsModalOpen(false);
                    router.refresh();
                }}
                config={editingConfig ? {
                    ...editingConfig,
                    sourcePlatform: (editingConfig.sourcePlatform as any) || 'DISCORD'
                } : undefined}
                accounts={accounts}
                groups={groups}
                initialTitle={directedGroupId ? groups.find(g => g.id === directedGroupId)?.name : (selectedFilterGroup !== "all" ? groups.find(g => g.id === selectedFilterGroup)?.name : "")}
                initialStep={directedGroupId || (selectedFilterGroup !== "all") ? 2 : 1}
            />
        </div>
    );
}
