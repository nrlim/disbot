import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Image from "next/image";
import { Shield, Zap, Settings as SettingsIcon } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/constants";
import SettingsPricing from "@/components/SettingsPricing";

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

    const paymentHistory = await prisma.paymentHistory.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' }
    });

    return (
        <div className="max-w-5xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6 border-b border-gray-200 pb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">Settings</h1>
                    <p className="text-gray-500 text-sm">Manage your profile and subscription.</p>
                </div>
                <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                    <SettingsIcon className="w-6 h-6" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Profile Card */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white border text-center md:text-left border-gray-200 rounded-xl shadow-sm p-6 relative overflow-hidden">
                        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                            <div className="relative shrink-0">
                                {session.user.image ? (
                                    <Image
                                        src={session.user.image}
                                        alt={session.user.name || "User"}
                                        width={80}
                                        height={80}
                                        className="rounded-full border-4 border-gray-50 shadow-sm"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-3xl font-bold text-gray-400 border-4 border-gray-50">
                                        {session.user.name?.[0] || "?"}
                                    </div>
                                )}
                                <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 border-4 border-white rounded-full" />
                            </div>

                            <div className="flex-1 space-y-2">
                                <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
                                    <h3 className="text-xl font-bold text-gray-900">{session.user.name}</h3>
                                    <span className="px-2.5 py-0.5 bg-green-50 text-green-700 border border-green-200 text-xs font-semibold rounded-full uppercase tracking-wide">
                                        Active
                                    </span>
                                </div>
                                <p className="text-gray-500 text-sm">{session.user.email}</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-left">
                                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">User ID</label>
                                        <div className="text-gray-700 text-xs font-mono truncate">
                                            {session.user.id || "N/A"}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-left">
                                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Role</label>
                                        <div className="text-gray-700 text-xs font-semibold flex items-center gap-2">
                                            <Shield className="w-3.5 h-3.5 text-primary" />
                                            OPERATOR
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub Card (Plan) */}
                <div className="md:col-span-1">
                    <div className="h-full bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col relative overflow-hidden group hover:shadow-md transition-all">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Zap className="w-20 h-20 text-primary" />
                        </div>

                        <div className="mb-6 relative z-10">
                            <h2 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                                Current Plan
                            </h2>
                            <div className="text-3xl font-bold text-gray-900 mb-2">
                                {userPlan}
                            </div>
                            <div className="inline-flex text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-md">
                                {limit === 9999 ? "Unlimited" : limit} Mirror Paths
                            </div>
                        </div>

                        <div className="space-y-4 flex-1 relative z-10">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-medium text-gray-500">
                                    <span>Usage Quota</span>
                                    <span className="text-gray-900">{usageCount} / {limit === 9999 ? "∞" : limit}</span>
                                </div>
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary rounded-full transition-all duration-500"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Upgrade Options */}
            <Suspense fallback={<div>Loading pricing...</div>}>
                <SettingsPricing
                    userPlan={userPlan}
                    paymentHistory={paymentHistory}
                />
            </Suspense>
        </div>
    );
}
