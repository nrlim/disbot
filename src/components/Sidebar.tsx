"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, Settings, ShieldAlert, Bot, Zap, Disc } from "lucide-react";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import { signOut, useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarProps {
    usageCount?: number;
    usageLimit?: number;
    planName?: string;
}

export default function Sidebar({
    usageCount = 0,
    usageLimit = 2,
    planName = "Starter"
}: SidebarProps) {
    const pathname = usePathname();
    const { data: session } = useSession();

    const percentage = Math.min((usageCount / usageLimit) * 100, 100);

    const menuItems = [
        {
            title: "Expert Mode",
            href: "/dashboard/expert",
            icon: ShieldAlert,
            description: "User Token Mirroring"
        },
        {
            title: "Official Bot",
            href: "/dashboard/official",
            icon: Bot,
            description: "Admin Bot Mirroring"
        }
    ];

    return (
        <aside className="hidden md:flex flex-col fixed inset-y-4 left-4 w-72 rounded-3xl bg-[#161B2B]/40 backdrop-blur-xl border border-white/5 z-50 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="h-24 flex items-center justify-center border-b border-white/5">
                <Logo showText />
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-8 space-y-8 overflow-y-auto custom-scrollbar">

                {/* Main Menu */}
                <div className="space-y-2">
                    <h3 className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">
                        Mirroring Console
                    </h3>
                    {menuItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "relative group flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300",
                                    isActive
                                        ? "bg-white/[0.03] text-white"
                                        : "text-gray-400 hover:text-white"
                                )}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="active-glow"
                                        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#00D1FF]/10 to-transparent opacity-50"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    />
                                )}
                                {isActive && (
                                    <motion.div
                                        layoutId="active-bar"
                                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#00D1FF] rounded-r-full shadow-[0_0_12px_#00D1FF]"
                                    />
                                )}

                                <item.icon className={cn(
                                    "w-5 h-5 transition-transform duration-300",
                                    isActive ? "text-[#00D1FF] scale-110" : "text-gray-500 group-hover:text-gray-300"
                                )} />

                                <div className="z-10">
                                    <span className={cn(
                                        "font-medium block tracking-wide",
                                        isActive ? "text-white" : "text-gray-400 group-hover:text-gray-200"
                                    )}>
                                        {item.title}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* System Menu */}
                <div className="space-y-2">
                    <h3 className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">
                        System
                    </h3>
                    <Link
                        href="/dashboard/settings"
                        className={cn(
                            "group flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300",
                            pathname === "/dashboard/settings"
                                ? "bg-white/[0.03] text-white"
                                : "text-gray-400 hover:text-white"
                        )}
                    >
                        <Settings className={cn(
                            "w-5 h-5 transition-colors",
                            pathname === "/dashboard/settings" ? "text-[#00D1FF]" : "text-gray-500 group-hover:text-gray-300"
                        )} />
                        <span className="font-medium tracking-wide">Settings</span>
                    </Link>
                </div>
            </nav>

            {/* Footer / Quota */}
            <div className="p-4 mt-auto border-t border-white/5 bg-[#0B0F1A]/30">
                {/* Quota Widget */}
                <div className="mb-6 p-5 rounded-2xl bg-black/20 border border-white/5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#00D1FF]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="flex items-center justify-between mb-3 relative z-10">
                        <span className="text-[10px] font-bold text-[#00D1FF] uppercase tracking-wider flex items-center gap-1.5">
                            <Zap className="w-3 h-3 fill-current" />
                            {planName}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400">
                            {usageCount}/{usageLimit === Infinity ? "∞" : usageLimit}
                        </span>
                    </div>

                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative z-10">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            className={cn(
                                "h-full rounded-full shadow-[0_0_10px_currentColor]",
                                percentage > 90 ? "bg-red-500 text-red-500" : "bg-[#00D1FF] text-[#00D1FF]"
                            )}
                        />
                    </div>
                </div>

                {/* User Profile */}
                <div className="flex items-center gap-4 px-2 pt-2">
                    <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border border-white/10 shadow-lg",
                        "bg-gradient-to-br from-[#161B2B] to-[#0B0F1A]"
                    )}>
                        {session?.user?.image ? (
                            <img src={session.user.image} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <span className="font-bold text-sm text-[#00D1FF]">{session?.user?.name?.[0]}</span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate leading-tight">{session?.user?.name}</p>
                        <p className="text-[10px] text-gray-500 truncate font-medium">Verified User</p>
                    </div>
                    <button
                        onClick={() => signOut()}
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors opacity-70 hover:opacity-100"
                        title="Sign Out"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
