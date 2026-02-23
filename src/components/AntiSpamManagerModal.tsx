"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, X, ScanEye, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { updateAntiSpamConfig } from "@/actions/mirror";

interface AntiSpamManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    configId: string;
    configName: string;
    initialEnabled: boolean;
    initialBlacklistedUsers: string[];
}

export default function AntiSpamManagerModal({
    isOpen,
    onClose,
    configId,
    configName,
    initialEnabled,
    initialBlacklistedUsers
}: AntiSpamManagerModalProps) {
    const [isEnabled, setIsEnabled] = useState(initialEnabled);
    const [blacklistedUsers, setBlacklistedUsers] = useState<string[]>([]);
    const [newUserId, setNewUserId] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsEnabled(initialEnabled);
            setBlacklistedUsers([...initialBlacklistedUsers]);
            setNewUserId("");
        }
    }, [isOpen, initialEnabled, initialBlacklistedUsers]);

    const handleAddUser = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newUserId.trim();
        if (!trimmed) return;

        if (blacklistedUsers.includes(trimmed)) {
            toast.error("User ID already blacklisted.");
            return;
        }

        setBlacklistedUsers(prev => [trimmed, ...prev]);
        setNewUserId("");
    };

    const handleRemoveUser = (userId: string) => {
        setBlacklistedUsers(prev => prev.filter(id => id !== userId));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await updateAntiSpamConfig(configId, isEnabled, blacklistedUsers);
            if (res.error) {
                toast.error(res.error);
            } else {
                toast.success("Anti-Spam settings saved.");
                onClose();
            }
        } catch (e: any) {
            toast.error("Failed to save Anti-Spam settings.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-all"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 py-8 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: "spring", duration: 0.5 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-full pointer-events-auto border border-gray-100"
                        >
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                                        <Shield className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                                            Anti-Spam Shield
                                            <span className="text-[10px] bg-black text-[#00FFFF] px-1.5 py-0.5 font-bold uppercase tracking-wider rounded">Elite</span>
                                        </h2>
                                        <p className="text-sm font-medium text-gray-500">
                                            {configName}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                                {/* Toggle Control */}
                                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                    <div className="space-y-1 pr-4">
                                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                            <ScanEye className="w-4 h-4 text-gray-400" />
                                            Shield Activation
                                        </h3>
                                        <p className="text-xs text-gray-500">
                                            Automatically lock out senders who flood the channel and block users on the blacklist.
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={isEnabled}
                                            onChange={(e) => setIsEnabled(e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>

                                {/* Blacklist Manager */}
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                            Blacklisted Senders
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Add User IDs explicitly to block them from being mirrored.
                                        </p>
                                    </div>

                                    <form onSubmit={handleAddUser} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newUserId}
                                            onChange={(e) => setNewUserId(e.target.value)}
                                            placeholder="Enter Discord or Telegram User ID"
                                            className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-gray-50 font-mono transition-all"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!newUserId.trim()}
                                            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold shadow-md hover:bg-gray-800 disabled:opacity-50 transition-all flex items-center gap-1"
                                        >
                                            <Plus className="w-4 h-4" /> Add
                                        </button>
                                    </form>

                                    {/* Blacklist Items */}
                                    {blacklistedUsers.length === 0 ? (
                                        <div className="px-4 py-8 bg-gray-50 border border-gray-100 rounded-xl text-center flex flex-col items-center">
                                            <CheckCircle2 className="w-8 h-8 text-gray-300 mb-2" />
                                            <p className="text-sm font-semibold text-gray-500">No users blacklisted.</p>
                                            <span className="text-xs text-gray-400">All senders pass through.</span>
                                        </div>
                                    ) : (
                                        <div className="bg-white border flex flex-col rounded-xl divide-y max-h-60 overflow-y-auto custom-scrollbar shadow-inner">
                                            {blacklistedUsers.map((id) => (
                                                <div key={id} className="flex items-center flex-shrink-0 justify-between px-4 py-3 hover:bg-red-50/10 transition-colors">
                                                    <span className="text-sm font-mono text-gray-700 font-medium">
                                                        {id}
                                                    </span>
                                                    <button
                                                        onClick={() => handleRemoveUser(id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                                        title="Remove from blacklist"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3 shrink-0">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2.5 text-gray-700 font-semibold hover:bg-gray-200 rounded-xl transition-all text-sm"
                                    disabled={isSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center min-w-[120px]"
                                >
                                    {isSaving ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        "Save Shield"
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
