"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Trash2, ShieldCheck, ShieldAlert, Loader2, AlertCircle } from "lucide-react";
import { addDiscordAccount, deleteDiscordAccount } from "@/actions/discord-account";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Account {
    id: string;
    username: string;
    discriminator: string | null;
    avatar: string | null;
    discordId: string | null;
    createdAt: Date;
    valid: boolean;
}

interface Props {
    accounts: Account[];
    currentUser?: {
        name?: string | null;
        image?: string | null;
    };
}

export default function DiscordAccountManager({ accounts, currentUser }: Props) {
    const router = useRouter();
    const [isAdding, setIsAdding] = useState(false);
    const [token, setToken] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const handleAdd = async () => {
        if (!token) return;
        setIsLoading(true);
        setError("");

        try {
            const res: any = await addDiscordAccount(token);
            if (res.error) {
                setError(res.error);
            } else {
                setIsAdding(false);
                setToken("");
                router.refresh();
            }
        } catch (e) {
            setError("Something went wrong");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Remove this account? This may break active mirrors using it.")) return;
        setIsDeleting(id);
        await deleteDiscordAccount(id);
        router.refresh();
        setIsDeleting(null);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Linked Accounts</h3>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Add Account
                </button>
            </div>

            {/* Account List */}
            <div className="space-y-3">
                {accounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg group hover:border-gray-300 hover:shadow-sm transition-all">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                {acc.avatar ? (
                                    <Image
                                        src={`https://cdn.discordapp.com/avatars/${acc.discordId}/${acc.avatar}.png`}
                                        width={40}
                                        height={40}
                                        alt={acc.username}
                                        className="rounded-full ring-2 ring-gray-100"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">
                                        {acc.username.substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 ring-1 ring-gray-100">
                                    {acc.valid ? (
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                        <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">{acc.username}</p>
                                <p className="text-[10px] text-gray-400 font-mono">ID: {acc.discordId}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleDelete(acc.id)}
                            disabled={!!isDeleting}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        >
                            {isDeleting === acc.id ? <Loader2 className="w-4 h-4 animate-spin text-red-500" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                    </div>
                ))}

                {accounts.length === 0 && !isAdding && (
                    <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                        <p className="text-xs text-gray-500">No accounts linked yet.</p>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4 mt-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Connect New Account</h4>
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <span className="sr-only">Close</span>
                                    <Plus className="w-4 h-4 rotate-45" />
                                </button>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-500">User Token</label>
                                <input
                                    type="password"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="Paste your Discord User Token"
                                    className="w-full bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-400"
                                />
                                <p className="text-[10px] text-gray-500 mt-1">
                                    Your token is encrypted and stored securely. We only use it to mirror messages.
                                </p>
                            </div>

                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3 items-start">
                                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-blue-900">Why do I need to provide a token?</p>
                                    <p className="text-[11px] text-blue-800/80 leading-relaxed">
                                        Standard bots can't read messages from other servers/channels you don't own. Mirroring as a user requires your personal token.
                                    </p>
                                </div>
                            </div>

                            {error && (
                                <div className="p-2 bg-red-50 border border-red-100 text-red-600 text-xs rounded-lg flex items-center gap-2">
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    {error}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAdd}
                                    disabled={isLoading || !token}
                                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    Verify & Add
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
