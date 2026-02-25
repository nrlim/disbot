import React from "react";
import { Bot, CheckCircle2, AlertCircle, Cpu, Network, Shield, ShieldBan, Trophy, Monitor } from "lucide-react";

export interface BotInstance {
    id: string;
    name: string;
    clientId: string;
    guildId: string;
    isOnline: boolean;
    features: string[];
    package?: "PRO" | "ELITE";
}

interface BotInstanceCardProps {
    bot: BotInstance;
    memoryUsageMB: number;
    maxMemoryMB: number;
    hasPendingChanges: boolean;
    isSelected: boolean;
    onSelect: () => void;
}

const MODULE_DEF = {
    'BASE': { icon: Network, label: 'Base' },
    'ACCESS': { icon: Shield, label: 'Access' },
    'SUBSCRIPTION': { icon: Monitor, label: 'Sub' },
    'ELITE': { icon: ShieldBan, label: 'Elite' },
    'LOYALTY_SYSTEM': { icon: Trophy, label: 'Loyalty' },
} as const;

export function BotInstanceCard({ bot, memoryUsageMB, maxMemoryMB, hasPendingChanges, isSelected, onSelect }: BotInstanceCardProps) {
    const memoryPercent = Math.min((memoryUsageMB / maxMemoryMB) * 100, 100);

    return (
        <div
            onClick={onSelect}
            className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 cursor-pointer ${isSelected
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                    : "border-gray-200 bg-white hover:border-primary/50 hover:shadow-xl hover:shadow-gray-200/50"
                }`}
        >
            <div className="p-5 flex flex-col gap-4">
                {/* Header: Icon & Status */}
                <div className="flex justify-between items-start">
                    <div className="relative">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isSelected ? "bg-primary text-white" : "bg-gray-100 text-gray-500 group-hover:bg-primary/10 group-hover:text-primary"
                            }`}>
                            <Bot className="w-6 h-6" />
                        </div>
                        {bot.isOnline ? (
                            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-white"></span>
                            </span>
                        ) : (
                            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-red-500 border-2 border-white"></span>
                        )}
                    </div>
                    {hasPendingChanges && (
                        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-600 rounded-full animate-pulse">
                            Pending
                        </span>
                    )}
                </div>

                {/* Bot Details */}
                <div>
                    <h3 className="font-bold text-lg text-gray-900 truncate">{bot.name || "Unnamed Instance"}</h3>
                    <p className="text-xs text-gray-500 font-mono mt-0.5 truncate bg-gray-50 px-2 py-1 rounded inline-block">
                        ID: {bot.clientId}
                    </p>
                </div>

                {/* Active Features */}
                <div className="flex flex-wrap gap-1.5 mt-1">
                    {bot.features.length === 0 && (
                        <span className="text-xs text-gray-400 italic">No features active</span>
                    )}
                    {bot.features.map(f => {
                        const Def = MODULE_DEF[f as keyof typeof MODULE_DEF];
                        if (!Def) return null;
                        const Icon = Def.icon;
                        return (
                            <div key={f} className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 tooltip-trigger group/ft transition-colors hover:border-primary hover:text-primary" title={Def.label}>
                                <Icon className="w-3.5 h-3.5" />
                            </div>
                        )
                    })}
                </div>

                {/* Memory Usage */}
                <div className="mt-2 pt-4 border-t border-gray-50">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                        <span className="text-gray-500 font-bold flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> RAM</span>
                        <span className="text-gray-900 font-mono font-medium">{memoryUsageMB.toFixed(1)} / {maxMemoryMB} MB</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${memoryPercent > 80 ? 'bg-red-500' : memoryPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${memoryPercent}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
