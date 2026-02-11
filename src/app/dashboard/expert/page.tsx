import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WebhookList from "@/components/WebhookList";
import crypto from "crypto";
import { Terminal, Shield, Cpu } from "lucide-react";

export default async function ExpertDashboard() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect("/");
    }

    const allConfigs = await prisma.mirrorConfig.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" }
    });

    // Decrypt tokens for the UI (Autofill feature)
    const configs = allConfigs.map(cfg => {
        let userToken = cfg.userToken;
        if (userToken && userToken.includes(':')) {
            try {
                const parts = userToken.split(':');
                if (parts.length === 3) {
                    const [ivHex, tagHex, encryptedHex] = parts;
                    const iv = Buffer.from(ivHex, 'hex');
                    const tag = Buffer.from(tagHex, 'hex');
                    const encrypted = Buffer.from(encryptedHex, 'hex');

                    const masterKey = process.env.ENCRYPTION_KEY || "";
                    let keyBuffer: Buffer;
                    if (masterKey.length === 64) {
                        keyBuffer = Buffer.from(masterKey, 'hex');
                    } else {
                        keyBuffer = Buffer.from(masterKey, 'utf8');
                    }

                    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
                    decipher.setAuthTag(tag);

                    let decrypted = decipher.update(encrypted);
                    decrypted = Buffer.concat([decrypted, decipher.final()]);
                    userToken = decrypted.toString('utf8');
                }
            } catch (e) {
                console.error("Failed to decrypt token for config:", cfg.id);
            }
        }
        return { ...cfg, userToken };
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
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b border-zinc-800">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                        <Terminal className="w-5 h-5" />
                        <span className="text-xs font-mono font-bold uppercase tracking-widest">System Mode: Expert</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight uppercase font-mono">
                        Advanced Mirroring
                    </h1>
                    <p className="text-zinc-500 font-mono text-sm max-w-2xl">
                        Direct user-token based replication. Bypasses standard bot limitations.
                        <span className="text-amber-500 ml-2">Use with caution.</span>
                    </p>
                </div>

                {/* Stats Widget */}
                <div className="bg-zinc-950 border border-zinc-800 p-4 min-w-[200px] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Cpu className="w-12 h-12" />
                    </div>
                    <div className="relative z-10">
                        <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Active Threads</div>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-2xl font-mono font-bold ${isLimitReached ? "text-amber-500" : "text-primary"}`}>
                                {String(usageCount).padStart(2, '0')}
                            </span>
                            <span className="text-zinc-600 font-mono text-sm">/ {limit === 9999 ? "INF" : String(limit).padStart(2, '0')}</span>
                        </div>
                        <div className="w-full h-1 bg-zinc-900 mt-3 relative overflow-hidden">
                            <div
                                className={`absolute top-0 left-0 h-full transition-all duration-500 ${isLimitReached ? "bg-amber-500" : "bg-primary"}`}
                                style={{ width: `${Math.min((usageCount / limit) * 100, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-zinc-950 border border-zinc-800 p-1">
                <WebhookList
                    initialConfigs={configs}
                    usageCount={usageCount}
                    isLimitReached={isLimitReached}
                />
            </div>
        </div>
    );
}
