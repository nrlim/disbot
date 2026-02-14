"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Trash2, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { addDiscordAccount, deleteDiscordAccount } from "@/actions/discord-account";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

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
                <h3 className="text-sm font-mono font-bold text-zinc-400 uppercase tracking-widest">Linked Accounts</h3>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-primary hover:text-white transition-colors"
                >
                    <Plus className="w-3 h-3" />
                    Add Account
                </button>
            </div>

            {/* Suggestion for Current Login */}
            {currentUser && !isAdding && accounts.length < 3 && !accounts.some(a => a.username === currentUser.name) && (
                <div className="p-3 border border-dashed border-zinc-700 bg-zinc-900/20 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {currentUser.image ? (
                            <Image src={currentUser.image} width={32} height={32} alt="" className="rounded-full grayscale opacity-70" unoptimized />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 font-bold">
                                {currentUser.name?.substring(0, 2).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="text-[10px] text-zinc-400 font-mono uppercase font-bold">Current Login: {currentUser.name}</p>
                            <p className="text-[9px] text-zinc-600 font-mono">Link this account?</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsAdding(true)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold uppercase tracking-wider rounded-md border border-zinc-700 transition-all"
                    >
                        Connect
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 gap-3">
                {accounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                {acc.avatar ? (
                                    <Image
                                        src={`https://cdn.discordapp.com/avatars/${acc.discordId}/${acc.avatar}.png`}
                                        width={32}
                                        height={32}
                                        alt={acc.username}
                                        className="rounded-full ring-2 ring-zinc-800"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 font-bold">
                                        {acc.username.substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <div className="absolute -bottom-0.5 -right-0.5 bg-zinc-950 rounded-full p-0.5">
                                    {acc.valid ? (
                                        <ShieldCheck className="w-3 h-3 text-emerald-500 fill-emerald-500/20" />
                                    ) : (
                                        <ShieldAlert className="w-3 h-3 text-red-500 fill-red-500/20" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-mono font-bold text-zinc-200">{acc.username}</p>
                                <p className="text-[10px] text-zinc-500 font-mono">ID: {acc.discordId}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleDelete(acc.id)}
                            disabled={isDeleting === acc.id}
                            className="p-2 text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        >
                            {isDeleting === acc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                    </div>
                ))}

                {accounts.length === 0 && !isAdding && (
                    <p className="text-center py-6 text-[10px] font-mono text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                        No accounts linked.
                    </p>
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
                        <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-lg space-y-3 mt-3">
                            <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wide">Connect New Account</h4>
                            <div className="space-y-1">
                                <input
                                    type="password"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="Paste Discord Token here..."
                                    className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 px-3 py-2 text-xs font-mono text-zinc-200 outline-none transition-all placeholder:text-zinc-700 focus:border-primary rounded-md"
                                />
                                <p className="text-[9px] text-zinc-500 font-mono">
                                    Token is encrypted and stored securely. Max 3 accounts.
                                </p>
                            </div>
                            <div className="p-2 bg-blue-900/20 border border-blue-900/50 rounded flex gap-2">
                                <ShieldAlert className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                                <p className="text-[9px] text-blue-300 font-mono leading-relaxed">
                                    <strong>Why manual?</strong> The &quot;Login&quot; button uses a safe OAuth token. Mirroring requires your full <strong>User Token</strong> (Self-Bot), which Discord never shares automatically.
                                </p>
                            </div>

                            {error && <p className="text-[10px] text-red-500 font-mono">{error}</p>}
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAdd}
                                    disabled={isLoading || !token}
                                    className="px-3 py-1.5 bg-primary/10 border border-primary/50 hover:bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-2"
                                >
                                    {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                    Verify & Add
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
}
