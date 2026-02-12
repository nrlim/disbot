import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";
import { CreditCard, Shield, User, Zap, CheckCircle2, Terminal, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_LIMITS, DISCORD_ADMIN_LINK } from "@/lib/constants";

export default async function SettingsPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect("/");
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { _count: { select: { configs: true } } }
    });

    if (!user) return null;

    const userPlan = (user as any).plan || "FREE";
    const usageCount = (user as any)._count.configs || 0;
    const limit = PLAN_LIMITS[userPlan] || PLAN_LIMITS.FREE;
    const percentage = limit > 0 ? Math.min((usageCount / limit) * 100, 100) : (usageCount > 0 ? 100 : 0);

    const plans = [
        {
            name: "STARTER",
            price: "Rp 149.000",
            limit: PLAN_LIMITS.STARTER,
            message: "Halo admin DISBOT, saya tertarik berlangganan Paket Starter (Bolo Kenalan) seharga Rp 149.000/bulan."
        },
        {
            name: "PRO",
            price: "Rp 449.000",
            limit: PLAN_LIMITS.PRO,
            message: "Halo admin DISBOT, saya ingin upgrade ke Paket Pro (Bolo Kepercayaan) seharga Rp 449.000/bulan untuk 20 mirror paths."
        },
        {
            name: "ELITE",
            price: "Rp 999.000",
            limit: PLAN_LIMITS.ELITE,
            message: "Halo admin DISBOT, saya ingin berlangganan Paket Elite (Bolo Andalan) seharga Rp 999.000/bulan. Saya butuh Dedicated Instance."
        }
    ];

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-10">
            <div className="mb-8 border-b border-zinc-800 pb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2 font-mono uppercase tracking-tight">System Configuration</h1>
                    <p className="text-zinc-500 font-mono text-sm">Manage user credentials and subscription vectors.</p>
                </div>
                <div className="p-2 border border-primary/20 bg-primary/10 text-primary">
                    <Terminal className="w-5 h-5" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Profile Card */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-zinc-950 border border-zinc-800 p-8 relative overflow-hidden group h-full">

                        <div className="flex flex-col md:flex-row items-start gap-8 mb-8">
                            <div className="relative shrink-0">
                                {session.user.image ? (
                                    <Image
                                        src={session.user.image}
                                        alt={session.user.name || "User"}
                                        width={100}
                                        height={100}
                                        className="border border-zinc-700 shadow-lg grayscale group-hover:grayscale-0 transition-all duration-500"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="w-24 h-24 bg-zinc-900 flex items-center justify-center text-4xl font-bold text-primary border border-zinc-800 font-mono">
                                        {session.user.name?.[0] || "?"}
                                    </div>
                                )}
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-zinc-950" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className="text-2xl font-bold text-white font-mono uppercase tracking-tight">{session.user.name}</h3>
                                    <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 text-[10px] font-mono uppercase tracking-wider font-bold">
                                        Active
                                    </span>
                                </div>
                                <p className="text-zinc-400 font-mono text-sm mb-4">{session.user.email}</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="p-3 bg-zinc-900 border border-zinc-800">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block font-mono">User ID</label>
                                        <div className="text-zinc-300 font-mono text-xs truncate">
                                            {session.user.id || "N/A"}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-zinc-900 border border-zinc-800">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block font-mono">Role</label>
                                        <div className="text-zinc-300 font-mono text-xs flex items-center gap-2">
                                            <Shield className="w-3 h-3 text-primary" />
                                            OPERATOR
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub Card */}
                <div className="md:col-span-1">
                    <div className="h-full bg-zinc-950 border border-zinc-800 p-6 flex flex-col relative overflow-hidden group hover:border-primary/30 transition-colors">
                        <div className="absolute top-0 right-0 p-4 opacity-50">
                            <Zap className="w-12 h-12 text-zinc-800 group-hover:text-primary/20 transition-colors" />
                        </div>

                        <div className="mb-8 relative z-10">
                            <h2 className="text-xs font-bold text-zinc-500 mb-2 font-mono uppercase tracking-widest">
                                Current Plan
                            </h2>
                            <div className="text-4xl font-black text-white font-mono tracking-tighter mb-1">
                                {userPlan}
                            </div>
                            <div className="text-xs text-primary font-mono bg-primary/10 border border-primary/20 px-2 py-0.5 w-fit uppercase">
                                Limit: {limit === 9999 ? "Unlimited" : limit} Paths
                            </div>
                        </div>

                        <div className="space-y-6 mb-8 flex-1 relative z-10">
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] text-zinc-400 font-mono uppercase">
                                    <span>Usage Quota</span>
                                    <span className="text-white font-bold">{usageCount} / {limit === 9999 ? "∞" : limit}</span>
                                </div>
                                <div className="w-full h-1 bg-zinc-900">
                                    <div
                                        className="h-full bg-primary"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Upgrade Options */}
            <div className="space-y-4 pt-8 border-t border-zinc-800">
                <h2 className="text-xl font-bold text-white font-mono uppercase tracking-tight">Available Upgrades</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                        <div key={plan.name} className={cn(
                            "bg-zinc-950 p-6 border flex flex-col relative overflow-hidden transition-all hover:-translate-y-1",
                            userPlan === plan.name ? "border-emerald-500/50 opacity-50" : "border-zinc-800 hover:border-primary/50"
                        )}>
                            {userPlan === plan.name && (
                                <div className="absolute top-2 right-2 text-emerald-500">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                            )}
                            <div className="mb-4">
                                <div className="text-sm text-zinc-500 font-mono font-bold uppercase">{plan.name}</div>
                                <div className="text-2xl font-bold text-white mt-1">{plan.price}</div>
                                <div className="text-xs text-zinc-400 mt-1 font-mono">{plan.limit === 9999 ? "Unlimited" : plan.limit} Mirror Paths</div>
                            </div>

                            <div className="mt-auto">
                                {userPlan === plan.name ? (
                                    <button disabled className="w-full py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-mono text-xs font-bold uppercase cursor-default">
                                        Active Plan
                                    </button>
                                ) : (
                                    <Link
                                        href={DISCORD_ADMIN_LINK}
                                        target="_blank"
                                        // Simple clipboard copy won't work easily here without client component interaction. 
                                        // For now, simple redirect.
                                        className="flex items-center justify-center gap-2 w-full py-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 text-white font-mono text-xs font-bold uppercase transition-all"
                                    >
                                        <CreditCard className="w-3 h-3" />
                                        Upgrade
                                    </Link>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
