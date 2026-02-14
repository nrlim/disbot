import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";
import { PLAN_LIMITS } from "@/lib/constants";

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

    const userPlan = typedUser?.plan || "FREE";
    const usageCount = typedUser?._count.configs || 0;
    const limit = PLAN_LIMITS[userPlan] || PLAN_LIMITS.FREE;

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 flex overflow-hidden font-sans">
            {/* Sidebar */}
            <Sidebar
                usageCount={usageCount}
                usageLimit={limit}
                planName={userPlan}
            />

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-8 overflow-y-auto h-screen">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
