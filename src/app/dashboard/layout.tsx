import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect("/");
    }

    // Fetch user details including plan and mirror count
    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
            _count: {
                select: { configs: true }
            }
        }
    });

    const typedUser = dbUser as any;

    // Define Limits
    const PLAN_LIMITS: Record<string, number> = {
        STARTER: 2,
        PRO: 15,
        ELITE: 9999 // Infinity can be tricky to serialize sometimes, using high number
    };

    const userPlan = typedUser?.plan || "STARTER";
    const usageCount = typedUser?._count.configs || 0;
    const limit = PLAN_LIMITS[userPlan] || 2;

    return (
        <div className="min-h-screen bg-[#0B0F1A] text-white flex overflow-hidden">
            {/* Sidebar */}
            <Sidebar
                usageCount={usageCount}
                usageLimit={limit}
                planName={userPlan}
            />

            {/* Main Content */}
            <main className="flex-1 md:ml-72 p-8 overflow-y-auto h-screen custom-scrollbar">
                {children}
            </main>
        </div>
    );
}
