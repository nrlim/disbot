"use client";

import { useState, useEffect } from "react";
import { Cpu, CheckCircle2 } from "lucide-react";

const DUMMY_MEMORY = [48.2, 51.4, 49.8, 55.1, 46.5, 47.9];

export default function WorkerStatsWidget() {
    const [memoryIndex, setMemoryIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setMemoryIndex(prev => (prev + 1) % DUMMY_MEMORY.length);
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    const memory = DUMMY_MEMORY[memoryIndex];

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 min-w-[200px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <Cpu className="w-16 h-16 text-green-500" />
            </div>
            <div className="relative z-10 flex flex-col justify-between h-full gap-4">
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Worker Core Heap</span>
                    <span className="text-3xl font-bold text-gray-900 flex items-baseline gap-1">
                        {memory.toFixed(1)} <span className="text-sm text-gray-400">MB</span>
                    </span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Status</span>
                    <span className="px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-full bg-green-100 text-green-700 w-fit flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> ONLINE
                    </span>
                </div>
            </div>
        </div>
    );
}
