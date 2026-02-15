import React, { useState, useEffect, useCallback } from "react";
import {
    Check, Monitor, Palette, Layout, Lock,
    Type, Image as ImageIcon, Upload, Grid3X3,
    MousePointer2, Sliders
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface BrandingConfig {
    watermarkType: 'TEXT' | 'VISUAL';
    customWatermark: string;
    watermarkImageUrl: string;
    watermarkPosition: string;
    watermarkOpacity: number;
    brandColor: string;
}

interface BrandingCustomizerProps {
    config: BrandingConfig;
    onChange: (updates: Partial<BrandingConfig>) => void;
    userPlan: string; // 'FREE' | 'STARTER' | 'PRO' | 'ELITE'
}

type Gravity =
    | 'northwest' | 'north' | 'northeast'
    | 'west' | 'center' | 'east'
    | 'southwest' | 'south' | 'southeast';

export function BrandingCustomizer({
    config,
    onChange,
    userPlan
}: BrandingCustomizerProps) {
    // Local state
    const [activeTab, setActiveTab] = useState<'TEXT' | 'VISUAL'>(config.watermarkType || 'TEXT');
    const [logoStatus, setLogoStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');

    // Reset logo status whenever watermarkImageUrl changes
    useEffect(() => {
        if (config.watermarkImageUrl && config.watermarkImageUrl.trim()) {
            setLogoStatus('loading');
        } else {
            setLogoStatus('idle');
        }
    }, [config.watermarkImageUrl]);

    // Plan Logic
    const isElite = userPlan.toUpperCase() === 'ELITE';
    const isPro = ['PRO', 'ELITE'].includes(userPlan.toUpperCase());
    const isStarter = userPlan.toUpperCase() === 'STARTER';
    const isFree = userPlan.toUpperCase() === 'FREE';

    // Sync active tab with config type if controlled externally or initially
    useEffect(() => {
        if (config.watermarkType) setActiveTab(config.watermarkType);
    }, [config.watermarkType]);

    const handleTypeChange = (type: 'TEXT' | 'VISUAL', e?: React.MouseEvent) => {
        e?.stopPropagation();
        e?.preventDefault();
        setActiveTab(type);
        onChange({ watermarkType: type });
    };

    // Helper to calculate position styles for preview
    const getPositionStyles = (pos: string) => {
        // Default southeast
        const styles: React.CSSProperties = { position: 'absolute', margin: '16px' };
        const p = pos.toLowerCase();

        if (p.includes('north')) styles.top = 0;
        else if (p.includes('south')) styles.bottom = 0;
        else styles.top = '50%', styles.transform = 'translateY(-50%)';

        if (p.includes('west')) styles.left = 0;
        else if (p.includes('east')) styles.right = 0;
        else {
            styles.left = '50%';
            if (styles.transform) styles.transform = 'translate(-50%, -50%)';
            else styles.transform = 'translateX(-50%)';
        }

        return styles;
    };

    return (
        <div className="w-full bg-slate-950 border border-slate-800 p-0 overflow-hidden font-sans rounded-none flex flex-col lg:flex-row min-h-[500px]">

            {/* ─── CONTROLS SECTION ─── */}
            <div className="flex-1 flex flex-col border-r border-slate-800 bg-slate-925">

                {/* Header Toggle */}
                <div className="flex border-b border-slate-800">
                    <button
                        type="button"
                        onClick={(e) => handleTypeChange('TEXT', e)}
                        className={cn(
                            "flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors hover:bg-slate-900",
                            activeTab === 'TEXT'
                                ? "bg-slate-900 text-emerald-400 border-b-2 border-emerald-400"
                                : "text-slate-500 bg-slate-950"
                        )}
                    >
                        <Type className="w-4 h-4" />
                        Text Watermark
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { if (isElite) handleTypeChange('VISUAL', e); }}
                        disabled={!isElite}
                        className={cn(
                            "flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors relative hover:bg-slate-900",
                            activeTab === 'VISUAL'
                                ? "bg-slate-900 text-blue-400 border-b-2 border-blue-400"
                                : "text-slate-500 bg-slate-950",
                            !isElite && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <ImageIcon className="w-4 h-4" />
                        Visual Watermark
                        {!isElite && <Lock className="w-3 h-3 absolute top-2 right-2 text-amber-500" />}
                    </button>
                </div>

                <div className="p-6 space-y-8 flex-1 overflow-y-auto">

                    {/* TEXT MODE CONTROLS */}
                    {activeTab === 'TEXT' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-6"
                        >
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                                    Branding Text
                                </label>
                                <input
                                    type="text"
                                    value={config.customWatermark || ""}
                                    onChange={(e) => onChange({ customWatermark: e.target.value })}
                                    disabled={!isPro}
                                    placeholder="Via DisBot Engine"
                                    className={cn(
                                        "w-full bg-slate-900 text-slate-200 text-sm px-4 py-3 outline-none border border-slate-800 focus:border-emerald-500/50 transition-all rounded-none placeholder:text-slate-600",
                                        !isPro && "opacity-50 cursor-not-allowed"
                                    )}
                                />
                                {!isPro && <p className="text-[10px] text-amber-500/80 mt-1">Upgrade to PRO to customize branding text</p>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                                    Accent Color
                                </label>
                                <div className="flex gap-3">
                                    <div className="w-10 h-10 border border-slate-800 relative z-0">
                                        <input
                                            type="color"
                                            value={config.brandColor || "#5865F2"}
                                            onChange={(e) => isPro && onChange({ brandColor: e.target.value })}
                                            disabled={!isPro}
                                            className="absolute -top-2 -left-2 w-16 h-16 opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="w-full h-full" style={{ backgroundColor: config.brandColor || "#5865F2" }} />
                                    </div>
                                    <input
                                        type="text"
                                        value={config.brandColor || "#5865F2"}
                                        readOnly
                                        className="flex-1 bg-slate-900 border border-slate-800 text-slate-400 px-3 text-xs font-mono py-2 uppercase outline-none"
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-emerald-950/10 border border-emerald-900/20 text-emerald-400 text-xs">
                                Text branding appears in the <strong>footer</strong> of all mirrored embeds.
                            </div>
                        </motion.div>
                    )}

                    {/* VISUAL MODE CONTROLS */}
                    {activeTab === 'VISUAL' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-8"
                        >
                            {/* Logo URL Input */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex justify-between">
                                    <span>Logo Source URL</span>
                                    <span className="text-[10px] text-slate-600">png, jpg, webp</span>
                                </label>
                                <div className="flex gap-0">
                                    <div className="bg-slate-800 px-3 flex items-center justify-center border border-slate-700 border-r-0">
                                        <Upload className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <input
                                        type="text"
                                        value={config.watermarkImageUrl || ""}
                                        onChange={(e) => onChange({ watermarkImageUrl: e.target.value })}
                                        placeholder="https://assets-global.website-files.com/6257adef93867e56f84d3092/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png"
                                        className="flex-1 bg-slate-900 text-slate-200 text-sm px-4 py-3 outline-none border border-slate-800 focus:border-blue-500/50 transition-all rounded-none placeholder:text-slate-600 font-mono"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-500">Provide a direct link to your logo image. Transparent PNG recommended.</p>
                            </div>

                            {/* Position Grid */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                                    <Grid3X3 className="w-3 h-3" /> Position
                                </label>
                                <div className="grid grid-cols-3 gap-1 w-full max-w-[180px] bg-slate-900 p-1 border border-slate-800">
                                    {['northwest', 'north', 'northeast', 'west', 'center', 'east', 'southwest', 'south', 'southeast'].map((pos) => (
                                        <button
                                            type="button"
                                            key={pos}
                                            onClick={(e) => { e.stopPropagation(); onChange({ watermarkPosition: pos }); }}
                                            className={cn(
                                                "aspect-square flex items-center justify-center transition-all rounded-none border border-transparent",
                                                (config.watermarkPosition || 'southeast') === pos
                                                    ? "bg-blue-600 text-white border-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                                                    : "bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-slate-300"
                                            )}
                                            title={pos}
                                        >
                                            <div className={cn(
                                                "w-1.5 h-1.5 rounded-full",
                                                (config.watermarkPosition || 'southeast') === pos ? "bg-white" : "bg-slate-600"
                                            )} />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Opacity Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                                        <MousePointer2 className="w-3 h-3" /> Opacity
                                    </label>
                                    <span className="text-xs font-mono text-blue-400 bg-blue-950/30 px-2 py-0.5 border border-blue-900/30">
                                        {config.watermarkOpacity ?? 100}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="5"
                                    value={config.watermarkOpacity ?? 100}
                                    onChange={(e) => onChange({ watermarkOpacity: parseInt(e.target.value) })}
                                    className="w-full h-1 bg-slate-800 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-none hover:[&::-webkit-slider-thumb]:bg-blue-400"
                                />
                            </div>

                        </motion.div>
                    )}
                </div>
            </div>

            {/* ─── LIVE PREVIEW ─── */}
            <div className="flex-1 bg-[#313338] relative flex flex-col">
                <div className="absolute top-4 right-4 z-20 flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest font-bold opacity-50 select-none">
                    <Monitor className="w-3 h-3" />
                    Live Preview
                </div>

                <div className="flex-1 p-8 flex items-center justify-center overflow-auto">
                    {/* Mock Discord Message */}
                    <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-indigo-500 shrink-0 text-white flex items-center justify-center font-bold text-xs">
                                BOT
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-white font-medium text-[15px]">DisBot</span>
                                    <span className="bg-[#5865F2] text-[10px] text-white px-1.5 py-px rounded-[3px]">BOT</span>
                                    <span className="text-xs text-slate-400">Today at 4:20 PM</span>
                                </div>

                                {/* Content Logic based on Type */}
                                {activeTab === 'VISUAL' ? (
                                    /* Image Attachment Style */
                                    <div className="relative rounded bg-slate-900 border border-slate-800 overflow-hidden inline-block max-w-full">
                                        {/* Mock Source Image */}
                                        <img
                                            src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80"
                                            alt="Source content"
                                            className="block max-w-full h-auto object-cover opacity-80"
                                            style={{ maxHeight: 300 }}
                                        />

                                        {/* Visual Watermark Overlay */}
                                        {config.watermarkImageUrl && config.watermarkImageUrl.trim() && (
                                            <div
                                                style={{
                                                    ...getPositionStyles(config.watermarkPosition || 'southeast'),
                                                    opacity: (config.watermarkOpacity ?? 100) / 100
                                                }}
                                                className="z-10 transition-all duration-300 pointer-events-none"
                                            >
                                                {/* Shimmer placeholder while loading */}
                                                {logoStatus === 'loading' && (
                                                    <div className="w-[60px] h-[60px] bg-slate-700/60 animate-pulse flex items-center justify-center">
                                                        <ImageIcon className="w-4 h-4 text-slate-500" />
                                                    </div>
                                                )}

                                                {/* Error fallback */}
                                                {logoStatus === 'error' && (
                                                    <div className="w-[60px] h-[60px] bg-red-950/40 border border-red-800/50 flex items-center justify-center">
                                                        <span className="text-[8px] text-red-400 text-center leading-tight">Failed<br />to load</span>
                                                    </div>
                                                )}

                                                {/* Actual logo image — always in DOM so it can fire onLoad/onError */}
                                                <img
                                                    key={config.watermarkImageUrl}
                                                    src={config.watermarkImageUrl}
                                                    alt="Watermark"
                                                    crossOrigin="anonymous"
                                                    referrerPolicy="no-referrer"
                                                    className={cn(
                                                        "max-w-[80px] max-h-[80px] object-contain drop-shadow-lg",
                                                        logoStatus !== 'loaded' && "hidden"
                                                    )}
                                                    onLoad={() => setLogoStatus('loaded')}
                                                    onError={() => setLogoStatus('error')}
                                                />
                                            </div>
                                        )}

                                        {/* Overlay Grid Guide (Optional visual feedback) */}
                                        <div className="absolute inset-0 pointer-events-none border border-white/5 opacity-0 hover:opacity-100 transition-opacity">
                                            {/* Just subtle grid lines if needed */}
                                        </div>
                                    </div>
                                ) : (
                                    /* Standard Embed Style */
                                    <div className="bg-[#2b2d31] border-l-4 rounded-[3px] p-4 grid gap-2" style={{ borderLeftColor: config.brandColor || '#5865F2' }}>
                                        <h3 className="font-bold text-white text-sm">New Announcement</h3>
                                        <p className="text-sm text-slate-300">
                                            This is how your text branding looks. It appears inconspicuously in the footer.
                                        </p>

                                        {/* Footer */}
                                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                                            <div className="w-4 h-4 rounded-full bg-slate-600" />
                                            <span className="text-xs text-slate-400 font-medium">
                                                {config.customWatermark || 'Via DisBot Engine'}
                                            </span>
                                            <span className="text-[10px] text-slate-600">• Today at 4:20 PM</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
