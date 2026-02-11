import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WebhookList from "@/components/WebhookList";
import { Plus } from "lucide-react";

export default async function ExpertDashboard() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect("/");
    }

    const configs = await prisma.mirrorConfig.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" }
    });

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { _count: { select: { configs: true } } }
    });

    const PLAN_LIMITS: Record<string, number> = {
        STARTER: 2,
        PRO: 15,
        ELITE: 9999
    };

    const userPlan = user?.plan || "STARTER";
    const usageCount = user?._count.configs || 0;
    const limit = PLAN_LIMITS[userPlan] || 2;
    const isLimitReached = usageCount >= limit;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Expert Mirroring</h1>
                    <p className="text-gray-400">Manage your user-token based mirroring configurations.</p>
                </div>

                {/* Header Stats */}
                <div className="flex items-center gap-4 bg-[#0f172a] px-4 py-2 rounded-xl border border-white/5">
                    <div className="text-right">
                        <div className="text-xs text-gray-500 font-bold uppercase">Active Mirrors</div>
                        <div className={`text-xl font-bold ${isLimitReached ? "text-amber-500" : "text-[#5865F2]"}`}>
                            {usageCount} <span className="text-gray-600 text-sm">/ {limit}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main List */}
            <WebhookList
                initialConfigs={configs}
                usageCount={usageCount}
                isLimitReached={isLimitReached}
            />
        </div>
    );
}
