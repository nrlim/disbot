"use client";

import Link from "next/link";
import { useState } from "react";
import ComingSoonModal from "@/components/ComingSoonModal";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, Settings, ShieldAlert, Bot, Zap, Menu } from "lucide-react";
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
            title: "Overview",
            href: "/dashboard",
            icon: LayoutDashboard,
        },
        {
            title: "Mirrors",
            href: "/dashboard/expert",
            icon: ShieldAlert,
        },
        {
            title: "Bot Manager",
            href: "/dashboard/official",
            icon: Bot,
            comingSoon: true
        }
    ];

    return (
        <>
            <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-50">
                {/* Header */}
                <div className="h-16 flex items-center px-6 border-b border-gray-100">
                    <Logo showText />
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto">

                    {/* Main Menu */}
                    <div className="space-y-1">
                        <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            Platform
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
                                        "group flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200",
                                        isActive
                                            ? "bg-blue-50 text-primary font-medium"
                                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                    )}
                                >
                                    <item.icon className={cn(
                                        "w-5 h-5 transition-colors",
                                        isActive ? "text-primary" : "text-gray-400 group-hover:text-gray-600"
                                    )} />

                                    <span className="text-sm">
                                        {item.title}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>

                    {/* System Menu */}
                    <div className="space-y-1">
                        <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            Configuration
                        </h3>
                        <Link
                            href="/dashboard/settings"
                            className={cn(
                                "group flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200",
                                pathname === "/dashboard/settings"
                                    ? "bg-blue-50 text-primary font-medium"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            <Settings className={cn(
                                "w-5 h-5 transition-colors",
                                pathname === "/dashboard/settings" ? "text-primary" : "text-gray-400 group-hover:text-gray-600"
                            )} />
                            <span className="text-sm">Settings</span>
                        </Link>
                    </div>
                </nav>

                {/* Footer / Quota */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    {/* Quota Widget */}
                    <div className="mb-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-amber-500 fill-current" />
                                {planName} Plan
                            </span>
                            <span className="text-xs font-medium text-gray-500">
                                {usageCount} / {usageLimit === Infinity ? "∞" : usageLimit}
                            </span>
                        </div>

                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${percentage}%` }}
                                className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    percentage > 90 ? "bg-red-500" : "bg-primary"
                                )}
                            />
                        </div>
                    </div>

                    {/* User Profile */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 flex items-center justify-center overflow-hidden border border-gray-200 bg-white rounded-full shadow-sm shrink-0">
                            {session?.user?.image ? (
                                <img src={session.user.image} alt="User" className="w-full h-full object-cover" />
                            ) : (
                                <span className="font-semibold text-sm text-primary">{session?.user?.name?.[0]}</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{session?.user?.name}</p>
                            <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Sign Out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </aside>
            <ComingSoonModal isOpen={isComingSoonOpen} onClose={() => setIsComingSoonOpen(false)} featureName="Managed Bot" />
        </>
    );
}
