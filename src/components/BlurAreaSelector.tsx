"use client";

import React, { useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import { Trash2, Plus, Upload, Maximize2, Image as ImageIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Region {
    id: string;
    x: number; // percentage 0-100
    y: number; // percentage 0-100
    width: number; // percentage 0-100
    height: number; // percentage 0-100
}

interface BlurAreaSelectorProps {
    value?: Region[];
    onChange: (regions: Region[]) => void;
    maxRegions?: number;
}

export function BlurAreaSelector({ value = [], onChange, maxRegions = 3 }: BlurAreaSelectorProps) {
    const [regions, setRegions] = useState<Region[]>(value);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    // Sync external value
    useEffect(() => {
        // Deep compare to avoid loops or only update if length changes for simplicity
        if (JSON.stringify(value) !== JSON.stringify(regions)) {
            setRegions(value);
        }
    }, [value]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    setImageSrc(ev.target.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const addRegion = () => {
        if (regions.length >= maxRegions) return;

        // Initial centered box if possible
        const newRegion: Region = {
            id: Math.random().toString(36).substring(2, 9),
            x: 50 - 15, // Center-ish
            y: 50 - 15,
            width: 30, // 30% width
            height: 30, // 30% height
        };
        const updated = [...regions, newRegion];
        setRegions(updated);
        onChange(updated);
    };

    const removeRegion = (id: string) => {
        const updated = regions.filter((r) => r.id !== id);
        setRegions(updated);
        onChange(updated);
    };

    const updateRegion = (id: string, updates: Partial<Region>) => {
        const updated = regions.map((r) => (r.id === id ? { ...r, ...updates } : r));
        setRegions(updated);
        onChange(updated);
    };

    // Resize Observer for responsive container
    useEffect(() => {
        if (!containerRef.current) return;

        const updateSize = () => {
            if (containerRef.current) {
                setContainerSize({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight
                });
            }
        };

        updateSize();
        window.addEventListener('resize', updateSize);

        // Also use ResizeObserver for more robust tracking
        const observer = new ResizeObserver(updateSize);
        observer.observe(containerRef.current);

        return () => {
            window.removeEventListener('resize', updateSize);
            observer.disconnect();
        };
    }, [imageSrc]); // Re-check when image changes

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium text-gray-900">Visual Blur Selector</h3>
                    <p className="text-xs text-gray-500">Draw areas to blur on images/videos.</p>
                </div>
                <div className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {regions.length} / {maxRegions} Areas
                </div>
            </div>

            {/* Canvas Area */}
            <div
                className="relative w-full aspect-video bg-gray-900/5 overflow-hidden border border-gray-200 group/canvas select-none"
                ref={containerRef}
            >
                {imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={imageSrc}
                        alt="Reference"
                        className="w-full h-full object-contain pointer-events-none"
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                        <ImageIcon className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-sm font-medium">Upload a sample image</p>
                        <p className="text-xs opacity-70">to start selecting blur regions</p>
                        <label className="cursor-pointer bg-white border border-gray-300 hover:border-blue-400 hover:text-blue-500 px-4 py-2 transition-colors text-xs font-medium shadow-sm flex items-center gap-2">
                            <Upload className="w-3 h-3" />
                            Browse Image
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                    </div>
                )}

                {/* Overlay Regions */}
                {containerSize.width > 0 && regions.map((region, index) => {
                    // Convert percentages to pixels for rendering
                    const xPx = (region.x / 100) * containerSize.width;
                    const yPx = (region.y / 100) * containerSize.height;
                    const wPx = (region.width / 100) * containerSize.width;
                    const hPx = (region.height / 100) * containerSize.height;

                    return (
                        <Rnd
                            key={region.id}
                            size={{ width: wPx, height: hPx }}
                            position={{ x: xPx, y: yPx }}
                            onDragStop={(e, d) => {
                                // Convert pixels back to percentages
                                const newX = (d.x / containerSize.width) * 100;
                                const newY = (d.y / containerSize.height) * 100;
                                // Clamping
                                updateRegion(region.id, {
                                    x: Math.max(0, Math.min(100, newX)),
                                    y: Math.max(0, Math.min(100, newY))
                                });
                            }}
                            onResizeStop={(e, direction, ref, delta, position) => {
                                const newW = (parseFloat(ref.style.width) / containerSize.width) * 100;
                                const newH = (parseFloat(ref.style.height) / containerSize.height) * 100;
                                const newX = (position.x / containerSize.width) * 100;
                                const newY = (position.y / containerSize.height) * 100;

                                updateRegion(region.id, {
                                    width: Math.max(0, Math.min(100, newW)),
                                    height: Math.max(0, Math.min(100, newH)),
                                    x: Math.max(0, Math.min(100, newX)),
                                    y: Math.max(0, Math.min(100, newY))
                                });
                            }}
                            bounds="parent"
                            minWidth={20}
                            minHeight={20}
                            className="z-10"
                        >
                            <div className="w-full h-full border-2 border-[#00FFFF] bg-[#00FFFF]/10 relative group hover:bg-[#00FFFF]/20 transition-all backdrop-blur-[1px] shadow-[0_0_10px_rgba(0,255,255,0.3)]">
                                {/* Label */}
                                <div className="absolute top-0 left-0 bg-[#00FFFF] text-black text-[10px] font-bold px-1.5 py-0.5">
                                    Region {index + 1}
                                </div>

                                {/* Coordinates Floating Label (visible on hover) */}
                                <div className="absolute -bottom-6 left-0 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
                                    {Math.round(region.x)}%, {Math.round(region.y)}%
                                </div>

                                {/* Delete Button */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeRegion(region.id); }} // Touch/pointer events might need onPointerDown or similar if dragging conflicts, but onClick usually ok if handled
                                    onMouseDown={(e) => e.stopPropagation()} // Stop drag start
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-none w-5 h-5 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                    title="Remove Region"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        </Rnd>
                    );
                })}

                {regions.length === 0 && imageSrc && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-black/50 text-white px-3 py-1.5 rounded-full text-xs backdrop-blur-sm">
                            Click &quot;Add Region&quot; to start
                        </div>
                    </div>
                )}
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-gray-50 p-4 border border-gray-100">
                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        type="button"
                        onClick={addRegion}
                        disabled={regions.length >= maxRegions || !imageSrc}
                        className={cn(
                            "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
                            regions.length >= maxRegions && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <Plus className="w-4 h-4" />
                        Add Region
                    </button>

                    {imageSrc && (
                        <label className="cursor-pointer px-4 py-2 border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2">
                            <Upload className="w-3.5 h-3.5" />
                            Change Image
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                    )}
                </div>

                {/* Coordinate Display (Mini Table) */}
                {regions.length > 0 && (
                    <div className="w-full sm:w-auto overflow-x-auto">
                        <div className="flex gap-4 text-xs font-mono">
                            {regions.map((r, i) => (
                                <div key={r.id} className="flex flex-col border-l-2 border-[#00FFFF] pl-2">
                                    <span className="text-gray-500 font-bold mb-0.5">AREA {i + 1}</span>
                                    <span className="text-gray-900">
                                        X:{r.x.toFixed(0)}% Y:{r.y.toFixed(0)}%
                                    </span>
                                    <span className="text-gray-700 opacity-70">
                                        W:{r.width.toFixed(0)}% H:{r.height.toFixed(0)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {!imageSrc && regions.length === 0 && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 text-xs">
                    <AlertCircle className="w-4 h-4" />
                    Please upload a sample image first to enable the visual editor.
                </div>
            )}
        </div>
    );
}
