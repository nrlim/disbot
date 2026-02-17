"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ArrowRight, Loader2, Share2, MessageCircle, FileVideo, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const plans = [
    {
        name: "DisBot Starter",
        label: "Best Entry",
        price: "Rp 75.000",
        normalPrice: "Rp 99.000",
        period: "/ bln",
        highlight: false,
        color: "slate",
        features: {
            path: { label: "Mirror Path", value: "6 Paths", sub: "Hanya Rp 12.500/path", highlightSub: true },
            source: { label: "Mirror Routes", value: "Discord Internal", sub: "D2D Mode Only" },
            media: { label: "Forward Media", value: "Gambar & Audio", sub: "Snapshot Mode" },
            branding: { label: "Branding", value: "Via DisBot", sub: "Default Brand" },
            tech: { label: "Teknologi", value: "Non-Blocking Engine v2" },
        },
        cta: "Mulai Sekarang",
    },
    {
        name: "DisBot Pro",
        label: "Most Popular",
        flashSale: "FLASH SALE - 20% OFF",
        price: "Rp 199.000",
        normalPrice: "Rp 249.000",
        period: "/ bln",
        highlight: true,
        color: "emerald",
        features: {
            path: { label: "Mirror Path", value: "20 Paths" },
            source: { label: "Mirror Routes", value: "Multi-Source Input", sub: "D2D · T2D" },
            media: { label: "Forward Media", value: "Audio, Video & Dokumen" },
            branding: { label: "Branding", value: "Custom Watermark", sub: "White-label & Colors" },
            tech: { label: "Teknologi", value: "Hybrid Snapshot & Streaming" },
        },
        cta: "Ambil Promo Sekarang",
    },
    {
        name: "DisBot Elite",
        label: "Ultimate Solution",
        flashSale: "FLASH SALE - 33% OFF",
        price: "Rp 499.000",
        normalPrice: "Rp 749.000",
        period: "/ bln",
        highlight: true,
        color: "purple",
        isPremium: true, // For Glassmorphism
        features: {
            path: { label: "Mirror Path", value: "50 Paths", sub: "Soft Limit" }, // Updated to 50 Paths
            source: { label: "Mirror Routes", value: "All Directions", sub: "D2D · T2D · D2T · T2T" },
            media: { label: "Forward Media", value: "Semua Tipe File", sub: "Dedicated Stream Processing" },
            branding: { label: "Branding & Privacy", value: "Watermark + Blur", sub: "Custom Brand & Smart Masking" },
            tech: { label: "Teknologi", value: "Dedicated Instance & Priority Support" },
        },
        cta: "Upgrade ke Elite",
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
                        Pilih kapasitas mirroring yang sesuai.
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
                                "flex flex-col relative h-full transition-all duration-300",
                                "rounded-none", // Strict 0px border radius as requested
                                // Base Styles
                                "border",
                                // Conditional Styling
                                (plan as any).isPremium
                                    ? "bg-slate-900/60 backdrop-blur-xl border-purple-500/50 shadow-[0_0_50px_-10px_rgba(168,85,247,0.3)] z-20 scale-105" // Glassmorphism
                                    : plan.highlight
                                        ? "bg-slate-900/80 border-emerald-500/50 shadow-2xl shadow-emerald-900/10 z-10"
                                        : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                            )}
                        >
                            {/* Flash Sale Badge (Pulsing) */}
                            {(plan as any).flashSale && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-full flex justify-center z-30">
                                    <div className={cn(
                                        "px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white shadow-lg flex items-center gap-2",
                                        "animate-pulse", // Visual Urgency
                                        plan.color === "purple" ? "bg-purple-600 shadow-purple-900/50" : "bg-orange-500 shadow-orange-900/50"
                                    )}>
                                        <Zap className="w-3 h-3 fill-white" />
                                        {(plan as any).flashSale}
                                    </div>
                                </div>
                            )}

                            {/* Label (Best Entry / Most Popular / Ultimate) */}
                            {plan.label && !(plan as any).flashSale && (
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                                    <div className={cn(
                                        "px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-900",
                                        "bg-slate-200"
                                    )}>
                                        {plan.label}
                                    </div>
                                </div>
                            )}

                            {/* Header */}
                            <div className={cn(
                                "p-8 border-b text-center min-h-[180px] flex flex-col justify-center relative overflow-hidden",
                                (plan as any).isPremium ? "bg-purple-500/5 border-purple-500/20" : "bg-slate-900/50 border-slate-800"
                            )}>
                                {/* Label for Pro/Elite inside header if Flash Sale badge is top */}
                                {(plan as any).flashSale && plan.label && (
                                    <div className="mb-4">
                                        <span className={cn(
                                            "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded",
                                            plan.color === "purple" ? "text-purple-300 bg-purple-500/10" : "text-emerald-300 bg-emerald-500/10"
                                        )}>
                                            {plan.label}
                                        </span>
                                    </div>
                                )}

                                <h3 className={cn(
                                    "text-xl font-bold uppercase tracking-wider mb-2",
                                    plan.color === "purple" ? "text-purple-400" : (plan.color === "emerald" ? "text-emerald-400" : "text-slate-300")
                                )}>
                                    {plan.name}
                                </h3>

                                <div className="flex flex-col items-center justify-center">
                                    {(plan as any).normalPrice && (
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-slate-500 text-sm line-through decoration-slate-500 decoration-1">
                                                {(plan as any).normalPrice}
                                            </span>
                                            {/* SAVE Badges */}
                                            {plan.color === "purple" && (
                                                <span className="text-[10px] font-bold text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30">
                                                    SAVE 33%
                                                </span>
                                            )}
                                            {plan.color === "emerald" && (
                                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                                    SAVE 20%
                                                </span>
                                            )}
                                            {plan.color === "slate" && (
                                                <span className="text-[10px] font-bold text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded border border-slate-600">
                                                    SAVE 25%
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex items-baseline justify-center gap-1">
                                        <span className={cn(
                                            "font-bold text-white tracking-tighter",
                                            (plan as any).isPremium || plan.highlight ? "text-5xl" : "text-4xl"
                                        )}>
                                            {plan.price}
                                        </span>
                                        <span className="text-slate-500 text-sm font-medium">{plan.period}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Features */}
                            <div className="flex-1 p-6 space-y-6 bg-transparent">
                                <FeatureItem
                                    icon={<Share2 className="w-5 h-5" />}
                                    label="Mirror Path"
                                    value={plan.features.path.value}
                                    sub={plan.features.path.sub}
                                    highlightSub={plan.features.path.highlightSub}
                                    color={plan.color}
                                />
                                <FeatureItem
                                    icon={<MessageCircle className="w-5 h-5" />}
                                    label="Source Platform"
                                    value={plan.features.source.value}
                                    sub={plan.features.source.sub}
                                    color={plan.color}
                                />
                                <FeatureItem
                                    icon={<FileVideo className="w-5 h-5" />}
                                    label="Forward Media"
                                    value={plan.features.media.value}
                                    sub={plan.features.media.sub}
                                    color={plan.color}
                                />
                                {plan.features.branding && (
                                    <FeatureItem
                                        icon={<ShieldCheck className="w-5 h-5" />}
                                        label={plan.features.branding.label}
                                        value={plan.features.branding.value}
                                        sub={plan.features.branding.sub}
                                        color={plan.color}
                                    />
                                )}
                                <FeatureItem
                                    icon={<Zap className="w-5 h-5" />}
                                    label="Teknologi"
                                    value={plan.features.tech.value}
                                    color={plan.color}
                                />
                            </div>

                            {/* CTA */}
                            <div className={cn(
                                "p-8 border-t bg-transparent",
                                (plan as any).isPremium ? "border-purple-500/20" : "border-slate-800"
                            )}>
                                <button
                                    onClick={() => handleOrder(i)}
                                    disabled={isLoading !== null}
                                    className={cn(
                                        "w-full py-4 text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-3",
                                        "rounded-none", // Strict 0px border radius
                                        (plan as any).isPremium
                                            ? "bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_20px_-5px_rgba(168,85,247,0.5)] border border-purple-400/20"
                                            : plan.color === "emerald"
                                                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
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
                                            {(plan as any).cta}
                                            <ArrowRight className={cn("w-4 h-4", (plan as any).isPremium && "animate-pulse")} />
                                        </>
                                    )}
                                </button>
                                <div className="text-center mt-3">
                                    <p className="text-[10px] text-slate-500">
                                        {(plan as any).isPremium ? "Priority Setup Included" : "Instant Activation"}
                                    </p>
                                </div>
                            </div>

                        </motion.div>
                    ))}
                </div>
            </div>
        </section >
    );
}

function FeatureItem({ icon, label, value, sub, highlightSub, color }: any) {
    return (
        <div className="flex items-start gap-4 group">
            <div className={cn(
                "p-2.5 rounded-xl shrink-0 transition-all group-hover:scale-110 duration-300",
                color === "purple"
                    ? "bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 group-hover:shadow-[0_0_15px_-5px_rgba(168,85,247,0.5)]"
                    : color === "emerald"
                        ? "bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 group-hover:shadow-[0_0_15px_-5px_rgba(16,185,129,0.5)]"
                        : "bg-slate-800 text-slate-400"
            )}>
                {icon}
            </div>
            <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
                <div className="text-[15px] font-medium text-slate-200 leading-snug">{value}</div>
                {sub && (
                    <p className={cn("text-xs mt-1 font-medium", highlightSub ? (color === "purple" ? "text-purple-300" : "text-emerald-400") : "text-slate-500")}>
                        {sub}
                    </p>
                )}
            </div>
        </div>
    )
}
