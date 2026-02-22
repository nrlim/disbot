"use client";

import { useState } from "react";
import {
    Plus,
    Trash2,
    ShieldCheck,
    ShieldAlert,
    Loader2,
    AlertCircle,
    Phone,
    KeyRound,
    Lock,
    CheckCircle2,
    Send
} from "lucide-react";
import {
    sendTelegramCode,
    loginTelegram,
    deleteTelegramAccount,
    saveTelegramAccount
} from "@/actions/telegramAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

interface TelegramAccount {
    id: string;
    username: string | null;
    phone: string;
    createdAt: Date;
    valid: boolean;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
}

interface Props {
    accounts: TelegramAccount[];
}

type AuthStep = "idle" | "phone" | "code" | "2fa" | "saving";

export default function TelegramAccountManager({ accounts }: Props) {
    const router = useRouter();
    const [isAdding, setIsAdding] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    // Auth flow state
    const [authStep, setAuthStep] = useState<AuthStep>("idle");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [phoneCodeHash, setPhoneCodeHash] = useState("");
    const [tempSession, setTempSession] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const resetForm = () => {
        setPhone("");
        setCode("");
        setPassword("");
        setPhoneCodeHash("");
        setTempSession("");
        setAuthStep("idle");
        setError("");
        setIsLoading(false);
    };

    const handleStartAdd = () => {
        setIsAdding(true);
        setAuthStep("phone");
        setError("");
    };

    const handleCancel = () => {
        setIsAdding(false);
        resetForm();
    };

    // Step 1: Send verification code
    const handleSendCode = async () => {
        if (!phone || phone.length < 5) {
            setError("Please enter a valid phone number with country code");
            return;
        }
        setIsLoading(true);
        setError("");

        try {
            const res = await sendTelegramCode(phone);
            if (res.error) {
                setError(res.error);
            } else if (res.success) {
                setPhoneCodeHash(res.phoneCodeHash!);
                setTempSession(res.tempSession!);
                setAuthStep("code");
            }
        } catch (e) {
            setError("Failed to send verification code");
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2: Verify code (and optionally handle 2FA)
    const handleVerifyCode = async () => {
        if (!code || code.length < 3) {
            setError("Please enter the verification code");
            return;
        }
        setIsLoading(true);
        setError("");

        try {
            const res = await loginTelegram({
                phoneNumber: phone,
                phoneCodeHash,
                phoneCode: code,
                tempSession,
                password: password || undefined
            });

            if (res.error) {
                if (res.error === "2FA Password Required") {
                    setAuthStep("2fa");
                    setError("");
                } else {
                    setError(res.error);
                }
            } else if (res.success && res.sessionString) {
                // Successfully authenticated → Save to DB
                setAuthStep("saving");
                const saveRes: any = await saveTelegramAccount({
                    phone,
                    sessionString: res.sessionString
                });

                if (saveRes.error) {
                    setError(saveRes.error);
                    setAuthStep("code");
                } else {
                    toast.success(saveRes.updated ? "Telegram account updated!" : "Telegram account linked!");
                    handleCancel();
                    router.refresh();
                }
            }
        } catch (e) {
            setError("Verification failed");
        } finally {
            setIsLoading(false);
        }
    };

    // Step 3: Submit 2FA password
    const handleSubmit2FA = async () => {
        if (!password) {
            setError("Please enter your 2FA password");
            return;
        }
        setIsLoading(true);
        setError("");

        try {
            const res = await loginTelegram({
                phoneNumber: phone,
                phoneCodeHash,
                phoneCode: code,
                tempSession,
                password
            });

            if (res.error) {
                setError(res.error);
            } else if (res.success && res.sessionString) {
                setAuthStep("saving");
                const saveRes: any = await saveTelegramAccount({
                    phone,
                    sessionString: res.sessionString
                });

                if (saveRes.error) {
                    setError(saveRes.error);
                    setAuthStep("2fa");
                } else {
                    toast.success(saveRes.updated ? "Telegram account updated!" : "Telegram account linked!");
                    handleCancel();
                    router.refresh();
                }
            }
        } catch (e) {
            setError("2FA verification failed");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Remove this Telegram account? Any active mirrors using this profile will be disconnected and stopped.")) return;
        setIsDeleting(id);
        const res: any = await deleteTelegramAccount(id);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success("Telegram account removed");
            router.refresh();
        }
        setIsDeleting(null);
    };

    const getDisplayName = (acc: TelegramAccount) => {
        if (acc.firstName || acc.lastName) {
            return [acc.firstName, acc.lastName].filter(Boolean).join(" ");
        }
        if (acc.username) return `@${acc.username}`;
        return acc.phone;
    };

    const getInitials = (acc: TelegramAccount) => {
        if (acc.firstName) return acc.firstName.substring(0, 2).toUpperCase();
        if (acc.username) return acc.username.substring(0, 2).toUpperCase();
        return acc.phone.slice(-2);
    };

    const stepLabels: Record<AuthStep, string> = {
        idle: "",
        phone: "Enter Phone Number",
        code: "Enter Verification Code",
        "2fa": "Two-Factor Authentication",
        saving: "Saving Account..."
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-sky-500" />
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Telegram Accounts</h3>
                </div>
                <button
                    onClick={() => isAdding ? handleCancel() : handleStartAdd()}
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-600 hover:text-sky-500 transition-colors"
                >
                    <Plus className={`w-3.5 h-3.5 transition-transform ${isAdding ? "rotate-45" : ""}`} />
                    {isAdding ? "Cancel" : "Add Account"}
                </button>
            </div>

            {/* Account List */}
            <div className="space-y-3">
                {accounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg group hover:border-sky-200 hover:shadow-sm transition-all">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                {acc.photoUrl ? (
                                    <img
                                        src={acc.photoUrl}
                                        alt={getDisplayName(acc)}
                                        className="w-10 h-10 rounded-full ring-2 ring-gray-100 object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
                                        {getInitials(acc)}
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
                                <p className="text-sm font-bold text-gray-900">{getDisplayName(acc)}</p>
                                <p className="text-[10px] text-gray-400 font-mono">
                                    {acc.username ? `@${acc.username} · ` : ""}{acc.phone}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleDelete(acc.id)}
                            disabled={!!isDeleting}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                        >
                            {isDeleting === acc.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                            ) : (
                                <Trash2 className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                ))}

                {accounts.length === 0 && !isAdding && (
                    <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                        <Send className="w-5 h-5 text-gray-300 mx-auto mb-2" />
                        <p className="text-xs text-gray-500">No Telegram accounts linked yet.</p>
                    </div>
                )}
            </div>

            {/* Add Account Flow */}
            <AnimatePresence>
                {isAdding && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 bg-gradient-to-b from-sky-50/50 to-gray-50 border border-sky-200/60 rounded-lg space-y-4 mt-2">
                            {/* Step indicator */}
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                                    {stepLabels[authStep]}
                                </h4>
                                <div className="flex items-center gap-1.5">
                                    {(["phone", "code", "2fa"] as AuthStep[]).map((step, i) => {
                                        const stepIndex = ["phone", "code", "2fa"].indexOf(authStep);
                                        const isActive = step === authStep;
                                        const isDone = i < stepIndex;
                                        // Only show 2fa step indicator if we're in 2fa mode
                                        if (step === "2fa" && authStep !== "2fa" && stepIndex < 2) return null;
                                        return (
                                            <div
                                                key={step}
                                                className={`w-2 h-2 rounded-full transition-colors ${isActive ? "bg-sky-500" : isDone ? "bg-emerald-400" : "bg-gray-300"
                                                    }`}
                                            />
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Step: Phone */}
                            {authStep === "phone" && (
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                                            <Phone className="w-3 h-3" />
                                            Phone Number
                                        </label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="+62812345678"
                                            className="w-full bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 transition-all placeholder:text-gray-400"
                                            onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                                        />
                                        <p className="text-[10px] text-gray-500 mt-1">
                                            Include country code (e.g., +62 for Indonesia, +1 for US)
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Step: Code */}
                            {authStep === "code" && (
                                <div className="space-y-3">
                                    <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                        <p className="text-xs text-emerald-700">
                                            Code sent to <span className="font-bold">{phone}</span>
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                                            <KeyRound className="w-3 h-3" />
                                            Verification Code
                                        </label>
                                        <input
                                            type="text"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            placeholder="12345"
                                            maxLength={6}
                                            className="w-full bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 transition-all placeholder:text-gray-400 text-center tracking-[0.3em] font-mono text-lg"
                                            onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Step: 2FA */}
                            {authStep === "2fa" && (
                                <div className="space-y-3">
                                    <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2">
                                        <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                                        <p className="text-xs text-amber-700">
                                            This account has Two-Factor Authentication enabled.
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                                            <Lock className="w-3 h-3" />
                                            2FA Password
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your 2FA password"
                                            className="w-full bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 transition-all placeholder:text-gray-400"
                                            onKeyDown={(e) => e.key === "Enter" && handleSubmit2FA()}
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Step: Saving */}
                            {authStep === "saving" && (
                                <div className="flex flex-col items-center py-4 gap-2">
                                    <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
                                    <p className="text-xs text-gray-500">Linking your Telegram account...</p>
                                </div>
                            )}

                            {/* Info Box */}
                            {authStep === "phone" && (
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3 items-start">
                                    <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold text-blue-900">How does this work?</p>
                                        <p className="text-[11px] text-blue-800/80 leading-relaxed">
                                            We use Telegram&apos;s MTProto to authenticate your account. Your session is encrypted and stored securely. This is the same method used by official Telegram apps.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="p-2 bg-red-50 border border-red-100 text-red-600 text-xs rounded-lg flex items-center gap-2">
                                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* Action buttons */}
                            {authStep !== "saving" && (
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={handleCancel}
                                        className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                                    >
                                        Cancel
                                    </button>

                                    {authStep === "phone" && (
                                        <button
                                            onClick={handleSendCode}
                                            disabled={isLoading || !phone}
                                            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            Send Code
                                        </button>
                                    )}

                                    {authStep === "code" && (
                                        <button
                                            onClick={handleVerifyCode}
                                            disabled={isLoading || !code}
                                            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            Verify & Link
                                        </button>
                                    )}

                                    {authStep === "2fa" && (
                                        <button
                                            onClick={handleSubmit2FA}
                                            disabled={isLoading || !password}
                                            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            Verify & Link
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
