import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DashboardOverview from "@/components/DashboardOverview";

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect("/");
    }

    // 1. Fetch User Data (Plan & Config Count)
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
            _count: {
                select: { configs: true }
            }
        }
    });

    if (!user) redirect("/");

    // 2. Fetch Recent Configs
    const recentConfigs = await prisma.mirrorConfig.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 5
    });

    const typedUser = user as any;
    const typedConfigs = recentConfigs as any;

    // 3. Calculate Stats
    const PLAN_LIMITS: Record<string, number> = {
        STARTER: 2,
        PRO: 15,
        ELITE: 9999
    };

    const userPlan = typedUser.plan || "STARTER";
    const activeCount = typedUser._count.configs || 0;
    const usageLimit = PLAN_LIMITS[userPlan] || 2;
    const percentage = Math.min((activeCount / usageLimit) * 100, 100);

    const stats = {
        activeCount,
        planName: userPlan,
        usageLimit,
        percentage
    };

    return (
        <DashboardOverview
            stats={stats}
            recentConfigs={typedConfigs}
        />
    );
}
