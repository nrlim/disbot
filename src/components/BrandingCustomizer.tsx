import React, { useState, useEffect } from "react";
import { Check, Monitor, Palette, Layout, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandingCustomizerProps {
    initialWatermark?: string;
    initialBrandColor?: string;
    // Although backend only supports footer, we include position for UI requirement
    initialPosition?: 'top' | 'bottom';
    onChange: (data: { watermark: string; brandColor: string; position: 'top' | 'bottom' }) => void;
    userPlan: string; // 'FREE' | 'STARTER' | 'PRO' | 'ELITE'
}

export function BrandingCustomizer({
    initialWatermark = "",
    initialBrandColor = "#5865F2",
    initialPosition = 'bottom',
    onChange,
    userPlan
}: BrandingCustomizerProps) {
    const [watermark, setWatermark] = useState(initialWatermark);
    const [brandColor, setBrandColor] = useState(initialBrandColor);
    const [position, setPosition] = useState<'top' | 'bottom'>(initialPosition);

    // Plan Logic
    const isPremium = ['PRO', 'ELITE'].includes(userPlan.toUpperCase());
    const isStarter = userPlan.toUpperCase() === 'STARTER';
    const isFree = userPlan.toUpperCase() === 'FREE';

    // Default Fallbacks for Preview
    const previewWatermark = isPremium && watermark ? watermark : "Via DisBot Engine";
    const previewColor = (isPremium && brandColor) ? brandColor : "#5865F2"; // Default Discord Blurple

    // Notify parent of changes
    useEffect(() => {
        onChange({ watermark, brandColor, position });
    }, [watermark, brandColor, position, onChange]);

    return (
        <div className="w-full bg-[#1e1f22] border border-[#2b2d31] p-0 overflow-hidden font-sans rounded-none">
            <div className="flex flex-col lg:flex-row h-full">

                {/* ─── CONTROLS SECTION ─── */}
                <div className="flex-1 p-6 space-y-6 bg-[#2b2d31]/50 border-r border-[#1e1f22]">
                    <div className="flex items-center justify-between">
                        <h3 className="text-gray-100 font-bold text-sm tracking-wide uppercase flex items-center gap-2">
                            <Palette className="w-4 h-4 text-emerald-400" />
                            Branding Customizer
                        </h3>
                        {!isPremium && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium uppercase tracking-wider rounded-none">
                                <Lock className="w-3 h-3" />
                                <span>{userPlan} Plan Locked</span>
                            </div>
                        )}
                    </div>

                    {/* Watermark Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            Watermark Text
                        </label>
                        <div className="relative group">
                            <input
                                type="text"
                                value={watermark}
                                onChange={(e) => setWatermark(e.target.value)}
                                disabled={!isPremium}
                                placeholder="Via DisBot Engine"
                                className={cn(
                                    "w-full bg-[#1e1f22] text-gray-200 text-sm px-4 py-3 outline-none border border-[#1e1f22] focus:border-emerald-500/50 transition-all rounded-none",
                                    !isPremium && "opacity-50 cursor-not-allowed"
                                )}
                            />
                            {!isPremium && <div className="absolute inset-0 bg-transparent z-10 cursor-not-allowed" title="Upgrade to PRO to customize" />}
                        </div>
                        <p className="text-[10px] text-gray-500">
                            {isPremium
                                ? "Appears in the footer of mirrored embeds."
                                : "Upgrade to PRO to customize the footer text."}
                        </p>
                    </div>

                    {/* Accent Color */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            Accent Color
                        </label>
                        <div className="flex items-center gap-3">
                            <div className="relative overflow-hidden w-10 h-10 border border-[#1e1f22] bg-[#1e1f22] rounded-none shrink-0 group">
                                <input
                                    type="color"
                                    value={brandColor}
                                    onChange={(e) => setBrandColor(e.target.value)}
                                    disabled={!isPremium}
                                    className="absolute inset-0 w-[150%] h-[150%] -top-[25%] -left-[25%] cursor-pointer p-0 border-0 opacity-0 z-20"
                                />
                                <div
                                    className="absolute inset-0 z-10 pointer-events-none"
                                    style={{ backgroundColor: isPremium ? brandColor : '#5865F2' }}
                                />
                                {!isPremium && <div className="absolute inset-0 bg-black/50 z-30 flex items-center justify-center"><Lock className="w-3 h-3 text-white/50" /></div>}
                            </div>
                            <input
                                type="text"
                                value={brandColor}
                                onChange={(e) => isPremium && setBrandColor(e.target.value)}
                                disabled={!isPremium}
                                className={cn(
                                    "flex-1 bg-[#1e1f22] text-gray-200 text-sm px-4 py-2.5 outline-none border border-[#1e1f22] focus:border-emerald-500/50 transition-all rounded-none font-mono uppercase",
                                    !isPremium && "opacity-50 cursor-not-allowed"
                                )}
                            />
                        </div>
                    </div>

                    {/* Position Toggle */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center justify-between">
                            <span>Position</span>
                            <span className="text-[10px] text-gray-600 normal-case">(Visual Preview Only)</span>
                        </label>
                        <div className="grid grid-cols-2 gap-px bg-[#1e1f22] border border-[#1e1f22] p-0.5 rounded-none">
                            <button
                                type="button"
                                onClick={() => isPremium && setPosition('top')}
                                disabled={!isPremium}
                                className={cn(
                                    "flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium transition-all rounded-none",
                                    position === 'top'
                                        ? "bg-[#2b2d31] text-emerald-400"
                                        : "hover:bg-[#2b2d31]/50 text-gray-500",
                                    !isPremium && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Layout className="w-3 h-3 rotate-180" />
                                Top
                            </button>
                            <button
                                type="button"
                                onClick={() => isPremium && setPosition('bottom')}
                                disabled={!isPremium}
                                className={cn(
                                    "flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium transition-all rounded-none",
                                    position === 'bottom'
                                        ? "bg-[#2b2d31] text-emerald-400"
                                        : "hover:bg-[#2b2d31]/50 text-gray-500",
                                    !isPremium && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Layout className="w-3 h-3" />
                                Bottom
                            </button>
                        </div>
                    </div>
                </div>

                {/* ─── LIVE PREVIEW SECTION ─── */}
                <div className="flex-1 bg-[#313338] p-8 flex flex-col justify-center relative min-h-[300px]">
                    <div className="absolute top-4 right-4 flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold opacity-50 select-none">
                        <Monitor className="w-3 h-3" />
                        Live Preview
                    </div>

                    {/* Discord Message Mockup */}
                    <div className="flex items-start gap-4 animate-in fade-in duration-500">
                        {/* Avatar */}
                        <div className={cn(
                            "w-10 h-10 rounded-full shrink-0 bg-gray-600 flex items-center justify-center text-white font-bold text-xs select-none",
                            "hover:opacity-90 transition-opacity cursor-pointer"
                        )}>
                            DB
                        </div>

                        {/* Message Content */}
                        <div className="flex-1 min-w-0">
                            {/* Header */}
                            <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                    "font-medium text-white text-[15px] hover:underline cursor-pointer",
                                    "leading-tight"
                                )}>
                                    DisBot
                                </span>
                                <span className="bg-[#5865F2] text-[10px] text-white px-1.5 rounded-[3px] py-px font-medium flex items-center h-4 select-none">
                                    BOT
                                </span>
                                <span className="text-xs text-gray-400 ml-1 select-none">Today at 1:30 PM</span>
                            </div>

                            {/* Embed */}
                            <div className="flex flex-col gap-2 max-w-[432px]">
                                <div
                                    className="relative grid bg-[#2b2d31] rounded-[4px] overflow-hidden"
                                    style={{ borderLeft: `4px solid ${previewColor}` }}
                                >
                                    <div className="p-4 grid gap-2">
                                        {/* Author / Top Branding */}
                                        <div className="flex items-center gap-2">
                                            {position === 'top' && (
                                                <span className="text-xs font-bold text-gray-300">
                                                    {previewWatermark}
                                                </span>
                                            )}
                                            {position !== 'top' && (
                                                <span className="text-xs font-bold text-white">
                                                    New Announcement
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-sm text-[#dbdee1] leading-relaxed">
                                            This is a preview of how your mirrored messages will look in Discord.
                                            The watermark and accent color are applied automatically by the engine.
                                        </p>

                                        {/* Footer / Bottom Branding */}
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="text-[12px] text-[#949BA4] font-medium flex items-center gap-1.5">
                                                {position === 'bottom' ? previewWatermark : 'Sent via Webhook'}
                                                {position === 'bottom' && (
                                                    <span className="w-1 h-1 rounded-full bg-[#949BA4]/50" />
                                                )}
                                                {position === 'bottom' && (
                                                    <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
