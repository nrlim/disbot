"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, CreditCard, Loader2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_DETAILS, DISCORD_ADMIN_LINK } from "@/lib/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface SettingsPricingProps {
    userPlan: string;
    midtransClientKey: string;
    isProduction: boolean;
    paymentHistory: any[];
}

declare global {
    interface Window {
        snap: any;
    }
}

import { useSearchParams } from "next/navigation";
import { useRef } from "react";

export default function SettingsPricing({
    userPlan,
    midtransClientKey,
    isProduction,
    paymentHistory
}: SettingsPricingProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState<string | null>(null);
    const autoTriggered = useRef(false);

    // Load Midtrans Snap Script & Auto Trigger
    useEffect(() => {
        const snapScriptUrl = isProduction
            ? "https://app.midtrans.com/snap/snap.js"
            : "https://app.sandbox.midtrans.com/snap/snap.js";

        const scriptId = "midtrans-script";
        let script = document.getElementById(scriptId) as HTMLScriptElement;

        const triggerPayment = () => {
            const planParam = searchParams.get("plan");
            if (planParam && !autoTriggered.current && window.snap) {
                // Ensure the plan is valid and not a downgrade (though handlePurchase logic might need to check, 
                // but strictly speaking, if user clicked it, they probably want it. 
                // We will just try to trigger it. 

                // Optional: Check if already on this plan?
                // For now, trust the user intent from landing page.

                autoTriggered.current = true;
                handlePurchase(planParam);

                // Clear the query param so it doesn't re-trigger on refresh
                router.replace("/dashboard/settings", { scroll: false });
            }
        };

        if (!script) {
            script = document.createElement("script");
            script.src = snapScriptUrl;
            script.id = scriptId;
            script.setAttribute("data-client-key", midtransClientKey);
            script.onload = () => {
                triggerPayment();
            };
            document.body.appendChild(script);
        } else {
            // Script already loaded, check if we need to trigger
            if (window.snap) {
                triggerPayment();
            } else {
                // Fallback if script exists but snap not ready? (unlikely but possible)
                script.onload = () => triggerPayment();
            }
        }

        return () => {
            // cleanup
        };
    }, [midtransClientKey, isProduction, searchParams, router]);

    const handlePurchase = async (planType: string) => {
        try {
            setLoading(planType);

            // 1. Create Transaction
            const response = await fetch("/api/payment/create-transaction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planType }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to create transaction");
            }

            const { token } = data;

            // 2. Trigger Snap Popup
            if (window.snap) {
                window.snap.pay(token, {
                    onSuccess: function (result: any) {
                        toast.success("Pembayaran Berhasil! Paket Anda akan aktif dalam beberapa saat.");
                        router.refresh(); // Refresh to update user plan if handled by webhook quickly or backend
                    },
                    onPending: function (result: any) {
                        toast("Menunggu pembayaran...", { icon: "⏳" });
                        router.refresh();
                    },
                    onError: function (result: any) {
                        toast.error("Pembayaran Gagal.");
                        router.refresh();
                    },
                    onClose: function () {
                        toast("Pembayaran dibatalkan", { icon: "❌" });
                        setLoading(null);
                        router.refresh();
                    },
                });
            } else {
                toast.error("Sistem pembayaran belum siap. Silakan refresh halaman.");
            }
        } catch (error) {
            console.error("Payment Error:", error);
            toast.error("Terjadi kesalahan saat memproses pembayaran.");
        } finally {
            // Don't clear loading immediately inside onSuccess/onPending as user might still be interacting
            // But for button state, we can clear it if the popup opens? 
            // Actually, snap.pay is non-blocking in terms of JS execution but blocks UI with overlay.
            setLoading(null);
        }
    };

    // Determine current plan weight
    const currentDetails = PLAN_DETAILS.find(p => p.name === userPlan);
    const currentWeight = currentDetails?.weight || 0;

    return (
        <div className="space-y-12 pt-6">
            {/* Plans Grid */}
            <div className="space-y-6">
                <h2 className="text-lg font-bold text-gray-900">Available Plans</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {PLAN_DETAILS.map((plan) => {
                        const isCurrent = userPlan === plan.name;
                        const isDowngrade = plan.weight < currentWeight;
                        const isLoading = loading === plan.name;

                        return (
                            <div
                                key={plan.name}
                                className={cn(
                                    "bg-white p-6 border flex flex-col relative overflow-hidden transition-all hover:shadow-lg",
                                    "rounded-none",
                                    isCurrent ? "border-green-500 ring-1 ring-green-500 bg-green-50/10" : "border-gray-200 hover:border-primary/50"
                                )}
                            >
                                {isCurrent && (
                                    <div className="absolute top-4 right-4 text-green-500">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                )}

                                <div className="mb-6">
                                    <div className="text-sm text-gray-500 font-semibold uppercase tracking-wide mb-1">
                                        {plan.name}
                                    </div>
                                    <div className="text-2xl font-bold text-gray-900">
                                        {plan.priceLabel}
                                        <span className="text-sm font-normal text-gray-500">/mo</span>
                                    </div>

                                    {/* Feature List */}
                                    <ul className="mt-4 space-y-2">
                                        {plan.features?.map((feature, idx) => (
                                            <li key={idx} className="text-sm text-gray-600 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                                {feature}
                                            </li>
                                        ))}
                                        <li className="text-sm text-gray-400 pt-1">
                                            {plan.limit === 9999 ? "Unlimited" : plan.limit} Mirror Paths
                                        </li>
                                    </ul>
                                </div>

                                <div className="mt-auto pt-6 border-t border-dashed border-gray-100">
                                    {isCurrent ? (
                                        <button disabled className="w-full py-2.5 bg-green-100 text-green-700 text-sm font-bold cursor-default flex items-center justify-center gap-2 rounded-none">
                                            <CheckCircle2 className="w-4 h-4" /> Current Plan
                                        </button>
                                    ) : isDowngrade ? (
                                        <Link
                                            href={DISCORD_ADMIN_LINK}
                                            target="_blank"
                                            className="flex items-center justify-center gap-2 w-full py-2.5 bg-gray-100 text-gray-600 text-sm font-semibold transition-colors hover:bg-gray-200 rounded-none"
                                        >
                                            <CreditCard className="w-4 h-4" />
                                            Downgrade (Contact Admin)
                                        </Link>
                                    ) : (
                                        <button
                                            onClick={() => handlePurchase(plan.name)}
                                            disabled={isLoading}
                                            className="flex items-center justify-center gap-2 w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white shadow-sm hover:shadow-md text-sm font-semibold transition-colors rounded-none"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Processing...
                                                </>
                                            ) : (
                                                <>
                                                    <CreditCard className="w-4 h-4" />
                                                    Upgrade
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Payment History Table */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-200 pb-4">
                    <History className="w-5 h-5 text-gray-500" />
                    <h2 className="text-xl font-bold text-gray-900">Payment History</h2>
                </div>

                {paymentHistory.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-lg">
                        <p className="text-gray-500 text-sm">No payment history found.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm bg-white">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-xs">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Order ID</th>
                                    <th className="px-6 py-4">Plan</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paymentHistory.map((payment) => (
                                    <tr key={payment.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 text-gray-600">
                                            {new Date(payment.createdAt).toLocaleDateString("id-ID", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit"
                                            })}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-gray-500">
                                            {payment.orderId.split('-').slice(2).join('') || payment.orderId}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            {payment.plan}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            Rp {payment.amount.toLocaleString("id-ID")}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn(
                                                "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border",
                                                payment.status === "success" && "bg-green-50 text-green-700 border-green-200",
                                                payment.status === "pending" && "bg-yellow-50 text-yellow-700 border-yellow-200",
                                                (payment.status === "failed" || payment.status === "cancel" || payment.status === "deny") && "bg-red-50 text-red-700 border-red-200",
                                                payment.status === "challenge" && "bg-orange-50 text-orange-700 border-orange-200"
                                            )}>
                                                {payment.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
