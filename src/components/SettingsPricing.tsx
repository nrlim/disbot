"use client";

import { CheckCircle2, CreditCard, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_DETAILS, DISCORD_ADMIN_LINK } from "@/lib/constants";
import Link from "next/link";

interface SettingsPricingProps {
    userPlan: string;
    paymentHistory: any[];
}

export default function SettingsPricing({
    userPlan,
    paymentHistory
}: SettingsPricingProps) {
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
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="text-sm text-gray-500 font-semibold uppercase tracking-wide">
                                            {plan.name}
                                        </div>
                                        {(plan as any).label && (
                                            <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full animate-pulse">
                                                {(plan as any).label}
                                            </span>
                                        )}
                                    </div>

                                    {(plan as any).normalPriceLabel && (
                                        <div className="text-sm text-gray-400 line-through decoration-gray-400/50 decoration-2 mb-0.5">
                                            {(plan as any).normalPriceLabel}
                                        </div>
                                    )}

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
                                    ) : (
                                        <Link
                                            href={DISCORD_ADMIN_LINK}
                                            target="_blank"
                                            className={cn(
                                                "flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold transition-colors rounded-none",
                                                isDowngrade 
                                                    ? "bg-gray-100 text-gray-600 hover:bg-gray-200" 
                                                    : "bg-gray-900 text-white hover:bg-gray-800 shadow-sm hover:shadow-md"
                                            )}
                                        >
                                            <CreditCard className="w-4 h-4" />
                                            {isDowngrade ? "Downgrade (Contact Admin)" : "Upgrade (Contact Admin)"}
                                        </Link>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Payment History Table - Keep for legacy view */}
            {paymentHistory.length > 0 && (
                <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-gray-200 pb-4">
                        <History className="w-5 h-5 text-gray-500" />
                        <h2 className="text-xl font-bold text-gray-900">Payment History</h2>
                    </div>

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
                </div>
            )}
        </div>
    );
}
