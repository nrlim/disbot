"use client";

import Link from "next/link";
import { useState } from "react";
import ComingSoonModal from "@/components/ComingSoonModal";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, Settings, ShieldAlert, Bot, Zap, Disc } from "lucide-react";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import { signOut, useSession } from "next-auth/react";
import { motion } from "framer-motion";

interface SidebarProps {
    usageCount?: number;
    usageLimit?: number;
    planName?: string;
}

export default function Sidebar({
    usageCount = 0,
    usageLimit = 1,
    planName = "FREE"
}: SidebarProps) {
    const pathname = usePathname();
    const { data: session } = useSession();

    const percentage = usageLimit > 0 ? Math.min((usageCount / usageLimit) * 100, 100) : 0;
    const [isComingSoonOpen, setIsComingSoonOpen] = useState(false);

    const menuItems = [
        {
            title: "Dashboard",
            href: "/dashboard",
            icon: LayoutDashboard,
            description: "Overview"
        },
        {
            title: "Custom Hook",
            href: "/dashboard/expert",
            icon: ShieldAlert,
            description: "User Token Mirroring"
        },
        {
            title: "Managed Bot",
            href: "/dashboard/official",
            icon: Bot,
            description: "Admin Bot Mirroring",
            comingSoon: true
        }
    ];

    return (
        <>
            <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-zinc-950 border-r border-zinc-800 z-50 rounded-none">
                {/* Header */}
                <div className="h-16 flex items-center px-6 border-b border-zinc-800 bg-zinc-950">
                    <Logo showText />
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-0 py-6 space-y-8 overflow-y-auto">

                    {/* Main Menu */}
                    <div className="space-y-1">
                        <h3 className="px-6 text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3 select-none">
                            Console
                        </h3>
                        {menuItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={(e) => {
                                        // @ts-ignore
                                        if (item.comingSoon) {
                                            e.preventDefault();
                                            setIsComingSoonOpen(true);
                                        }
                                    }}
                                    className={cn(
                                        "group flex items-center gap-3 px-6 py-2.5 transition-all duration-200 border-l-2",
                                        isActive
                                            ? "bg-zinc-900/50 border-primary text-primary"
                                            : "border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/30 hover:border-zinc-700"
                                    )}
                                >
                                    <item.icon className={cn(
                                        "w-4 h-4 transition-colors",
                                        isActive ? "text-primary" : "text-zinc-500 group-hover:text-zinc-300"
                                    )} />

                                    <span className={cn(
                                        "text-xs font-bold tracking-wide font-mono uppercase",
                                        isActive ? "text-primary shadow-primary/20" : "text-zinc-400 group-hover:text-zinc-200"
                                    )}>
                                        {item.title}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>

                    {/* System Menu */}
                    <div className="space-y-1">
                        <h3 className="px-6 text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3 select-none">
                            System
                        </h3>
                        <Link
                            href="/dashboard/settings"
                            className={cn(
                                "group flex items-center gap-3 px-6 py-2.5 transition-all duration-200 border-l-2",
                                pathname === "/dashboard/settings"
                                    ? "bg-zinc-900/50 border-primary text-primary"
                                    : "border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/30 hover:border-zinc-700"
                            )}
                        >
                            <Settings className={cn(
                                "w-4 h-4 transition-colors",
                                pathname === "/dashboard/settings" ? "text-primary" : "text-zinc-500 group-hover:text-zinc-300"
                            )} />
                            <span className="text-xs font-bold tracking-wide font-mono uppercase">Settings</span>
                        </Link>
                    </div>
                </nav>

                {/* Footer / Quota */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-950">
                    {/* Quota Widget */}
                    <div className="mb-4 p-4 border border-zinc-800 bg-zinc-900/30 rounded-none relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-primary/5 to-transparent -z-10 group-hover:from-primary/10 transition-colors" />

                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono text-primary uppercase tracking-widest flex items-center gap-1.5 font-bold">
                                <Zap className="w-3 h-3 fill-current" />
                                {planName}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500">
                                {usageCount}/{usageLimit === Infinity ? "∞" : usageLimit}
                            </span>
                        </div>

                        <div className="h-0.5 w-full bg-zinc-800 overflow-hidden rounded-none">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${percentage}%` }}
                                className={cn(
                                    "h-full bg-primary",
                                    percentage > 90 ? "bg-red-500" : "bg-primary"
                                )}
                            />
                        </div>
                    </div>

                    {/* User Profile */}
                    <div className="flex items-center gap-3 pt-2">
                        <div className="w-8 h-8 flex items-center justify-center overflow-hidden border border-zinc-700 bg-zinc-800 rounded-none shrink-0">
                            {session?.user?.image ? (
                                <img src={session.user.image} alt="User" className="w-full h-full object-cover rounded-none" />
                            ) : (
                                <span className="font-mono text-xs text-primary font-bold">{session?.user?.name?.[0]}</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-zinc-200 truncate font-bold uppercase">{session?.user?.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="w-1 h-1 bg-emerald-500 rounded-none animate-pulse" />
                                <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-mono">System Active</p>
                            </div>
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="p-2 text-zinc-500 hover:text-red-400 transition-colors border border-transparent hover:border-red-900/30 hover:bg-red-900/10 rounded-none"
                            title="Sign Out"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </aside>
            <ComingSoonModal isOpen={isComingSoonOpen} onClose={() => setIsComingSoonOpen(false)} featureName="Managed Bot" />
        </>
    );
}
