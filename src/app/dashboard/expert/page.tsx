import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WebhookList from "@/components/WebhookList";
import { decrypt } from "@/lib/encryption";
import { Terminal, Shield, Cpu, Activity } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/constants";
import { getDiscordAccounts } from "@/actions/discord-account";
import { getMirrorConfigs, getMirrorGroups } from "@/actions/mirror";
import { getTelegramAccounts } from "@/actions/telegramAuth";

export default async function ExpertDashboard() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect("/");
    }

    const [allConfigs, groups, accounts, telegramAccounts] = await Promise.all([
        getMirrorConfigs(),
        getMirrorGroups(),
        getDiscordAccounts(),
        getTelegramAccounts()
    ]);

    // Decrypt tokens for the UI (Autofill feature)
    const configs = allConfigs.map(cfg => {
        let userToken = "";

        try {
            if (cfg.discordAccount?.token) {
                userToken = decrypt(cfg.discordAccount.token);
            } else if (cfg.telegramAccount?.sessionString) {
                userToken = decrypt(cfg.telegramAccount.sessionString);
            }
        } catch (e) {
            console.error("Failed to decrypt token for config:", cfg.id);
        }

        return { ...cfg, userToken, telegramPhone: cfg.telegramAccount?.phone };
    });

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { _count: { select: { configs: true } } }
    });

    const userPlan = user?.plan || "FREE";
    const totalThreads = user?._count.configs || 0;
    const activeCount = allConfigs.filter(c => c.active).length;
    const limit = PLAN_LIMITS[userPlan] || PLAN_LIMITS.FREE;
    const isLimitReached = totalThreads >= limit;
    const percentage = limit > 0 ? Math.min((activeCount / limit) * 100, 100) : (activeCount > 0 ? 100 : 0);

    return (
        <div className="max-w-7xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b border-gray-200">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary font-bold">
                        <Terminal className="w-5 h-5" />
                        <span className="text-xs font-mono font-bold uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded">Expert Mode</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                        Custom Hook Mirroring
                    </h1>
                    <p className="text-gray-500 text-sm max-w-2xl">
                        Direct user-token based replication. Bypasses standard bot limitations.
                        <span className="text-amber-600 font-semibold ml-2">Use with caution.</span>
                    </p>
                </div>

                {/* Stats Widget */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 min-w-[240px] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Activity className="w-16 h-16 text-primary" />
                    </div>
                    <div className="relative z-10">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Active Threads</div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className={`text-3xl font-bold ${activeCount >= limit ? "text-amber-600" : "text-gray-900"}`}>
                                {activeCount}
                            </span>
                            <span className="text-gray-400 text-sm font-medium">/ {limit === 9999 ? "∞" : limit}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">Total Threads: {totalThreads}</div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${activeCount >= limit ? "bg-amber-500" : "bg-primary"}`}
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 overflow-hidden">
                <WebhookList
                    initialConfigs={configs}
                    groups={groups}
                    accounts={accounts}
                    telegramAccounts={telegramAccounts}
                    usageCount={activeCount}
                    isLimitReached={isLimitReached}
                    userPlan={userPlan}
                />
            </div>
        </div>
    );
}
