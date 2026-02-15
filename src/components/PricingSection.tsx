"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const plans = [
    {
        name: "DisBot Starter",
        price: "Rp 75.000",
        period: "/ bln",
        highlight: false,
        color: "slate",
        features: {
            path: { label: "Mirror Path", value: "6 Paths", sub: "Hanya Rp 12.500/path", highlightSub: true },
            source: { label: "Source Platform", value: "Discord Only" },
            media: { label: "Forward Media", value: "Gambar & Audio", sub: "Snapshot Mode" },
            branding: { label: "Branding", value: "Via DisBot", sub: "Default Brand" },
            tech: { label: "Teknologi", value: "Non-Blocking Engine v2" },
        },
    },
    {
        name: "DisBot Pro",
        label: "BEST VALUE",
        price: "Rp 199.000",
        period: "/ bln",
        highlight: true,
        color: "emerald",
        features: {
            path: { label: "Mirror Path", value: "20 Paths" },
            source: { label: "Source Platform", value: "Discord & Telegram", sub: "Standard Mode" },
            media: { label: "Forward Media", value: "Audio, Video & Dokumen" },
            branding: { label: "Branding", value: "Custom Watermark", sub: "White-label & Colors" },
            tech: { label: "Teknologi", value: "Hybrid Snapshot & Streaming" },
        },
    },
    {
        name: "DisBot Elite",
        label: "PREMIUM FEATURE",
        price: "Rp 749.000",
        period: "/ bln",
        highlight: true,
        color: "purple",
        features: {
            path: { label: "Mirror Path", value: "50 Paths", sub: "Soft Limit" },
            source: { label: "Source Platform", value: "All Platform", sub: "Inc. Ghost Mirroring (MTProto)" },
            media: { label: "Forward Media", value: "Semua Tipe File", sub: "Dedicated Stream Processing" },
            branding: { label: "Branding & Privacy", value: "Watermark + Blur", sub: "Custom Brand & Smart Masking" },
            tech: { label: "Teknologi", value: "Dedicated Instance & Priority Support" },
        },
    },
];

export default function PricingSection() {
    const { data: session } = useSession();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState<number | null>(null);

    const handleOrder = async (index: number) => {
        setIsLoading(index);

        // Map index to Plan Enum or use a property
        const planEnum = ["STARTER", "PRO", "ELITE"][index];

        if (session) {
            router.push(`/dashboard/settings?plan=${planEnum}`);
        } else {
            await signIn("discord", { callbackUrl: `/dashboard/settings?plan=${planEnum}` });
        }
    };

    return (
        <section id="pricing" className="py-24 bg-slate-950 text-white font-sans selection:bg-emerald-500/30">
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <div className="text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-white uppercase">
                        Paket Langganan
                    </h2>
                    <p className="text-slate-400 text-lg max-w-2xl mx-auto font-light">
                        Pilih kapasitas mirroring yang sesuai. Upgrade kapan saja.
                        <br />
                        <span className="text-emerald-400 font-medium">Tanpa kontrak terikat.</span>
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {plans.map((plan, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className={cn(
                                "flex flex-col relative bg-slate-900/50 border h-full backdrop-blur-sm",
                                "rounded-none", // Strict 0px border radius
                                plan.highlight
                                    ? plan.color === "purple"
                                        ? "border-purple-500 ring-1 ring-purple-500/50 z-10 shadow-2xl shadow-purple-900/20"
                                        : "border-emerald-500 ring-1 ring-emerald-500/50 z-10 shadow-2xl shadow-emerald-900/20"
                                    : "border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-colors"
                            )}
                        >
                            {plan.label && (
                                <div className={cn(
                                    "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xs font-bold px-4 py-1 uppercase tracking-widest shadow-lg",
                                    plan.color === "purple" ? "bg-purple-600" : "bg-emerald-600"
                                )}>
                                    {plan.label}
                                </div>
                            )}

                            {/* Header */}
                            <div className="p-8 border-b border-slate-800 text-center bg-slate-900 min-h-[160px] flex flex-col justify-center">
                                <h3 className={cn(
                                    "text-lg font-bold uppercase tracking-wider mb-4",
                                    plan.color === "purple" ? "text-purple-400" : (plan.highlight ? "text-emerald-400" : "text-slate-300")
                                )}>
                                    {plan.name}
                                </h3>
                                <div className="flex items-center justify-center gap-1">
                                    <span className="text-4xl font-bold text-white tracking-tight">{plan.price}</span>
                                    <span className="text-slate-500 text-sm font-medium">{plan.period}</span>
                                </div>
                            </div>

                            {/* Pillars / Features Table Layout */}
                            <div className="flex-1 flex flex-col divide-y divide-slate-800/50">

                                {/* Mirror Path */}
                                <div className="p-6 min-h-[140px] flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-2">Mirror Path</span>
                                    <span className="text-xl font-bold text-white">{plan.features.path.value}</span>
                                    {plan.features.path.sub && (
                                        <span className={cn("text-sm mt-1", plan.features.path.highlightSub ? "text-emerald-400 font-medium" : "text-slate-400")}>
                                            {plan.features.path.sub}
                                        </span>
                                    )}
                                </div>

                                {/* Source Platform */}
                                <div className="p-6 min-h-[140px] flex flex-col items-center justify-center text-center bg-slate-900/30">
                                    <span className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-2">Source Platform</span>
                                    <span className="text-base font-semibold text-slate-200">{plan.features.source.value}</span>
                                    {plan.features.source.sub && <span className="text-xs text-slate-500 mt-1">{plan.features.source.sub}</span>}
                                </div>

                                {/* Forward Media */}
                                <div className="p-6 min-h-[140px] flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-2">Forward Media</span>
                                    <span className="text-base font-semibold text-slate-200">{plan.features.media.value}</span>
                                    {plan.features.media.sub && <span className="text-xs text-slate-500 mt-1">{plan.features.media.sub}</span>}
                                </div>

                                {/* Custom Watermark (New Feature) */}
                                {plan.features.branding && (
                                    <div className="p-6 min-h-[140px] flex flex-col items-center justify-center text-center bg-slate-900/30">
                                        <span className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-2">{plan.features.branding.label}</span>
                                        <span className={cn("text-base font-semibold", plan.color === "purple" ? "text-purple-200" : "text-emerald-200")}>{plan.features.branding.value}</span>
                                        {plan.features.branding.sub && <span className="text-xs text-slate-500 mt-1">{plan.features.branding.sub}</span>}
                                    </div>
                                )}

                                {/* Teknologi */}
                                <div className="p-6 min-h-[140px] flex flex-col items-center justify-center text-center bg-slate-900/30">
                                    <span className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-2">Teknologi</span>
                                    <span className="text-base font-semibold text-emerald-100">{plan.features.tech.value}</span>
                                </div>

                            </div>

                            {/* CTA */}
                            <div className="p-8 border-t border-slate-800 bg-slate-900">
                                <button
                                    onClick={() => handleOrder(i)}
                                    disabled={isLoading !== null}
                                    className={cn(
                                        "w-full py-4 text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-3",
                                        "rounded-none", // Strict 0px border radius
                                        plan.highlight
                                            ? plan.color === "purple"
                                                ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30"
                                                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
                                            : "bg-slate-800 hover:bg-slate-700 text-white hover:text-emerald-400",
                                        isLoading !== null && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {isLoading === i ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            Subscribe Now
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                                <div className="text-center mt-3 h-4">
                                    {/* Placeholder to keep layout stable if needed, or remove */}
                                </div>
                            </div>

                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
