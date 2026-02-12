import { logger } from './logger';

// ──────────────────────────────────────────────────────────────
//  Plan Path Limits (Hard Limits)
//  Each plan tier has a strict upper bound.
//  ELITE is soft-limited at 100 (guaranteed capacity).
// ──────────────────────────────────────────────────────────────

export const PLAN_PATH_LIMITS: Record<string, number> = {
    FREE: 1,
    STARTER: 6,
    PRO: 20,
    ELITE: 100, // Hard limit — 100 guaranteed paths
};

// ──────────────────────────────────────────────────────────────
//  Path Limit Enforcement
// ──────────────────────────────────────────────────────────────

export interface PathLimitResult {
    /** Configs that are within the user's plan limit */
    allowed: any[];
    /** Configs that exceed the limit (will not be started) */
    overLimit: any[];
    /** The capped total number of allowed paths */
    limit: number;
    /** The user's plan */
    plan: string;
}

/**
 * Enforces path limits on a user's configs.
 * 
 * Given ALL active configs belonging to a single userId,
 * returns which ones are allowed to run and which exceed the plan limit.
 * Over-limit configs are sorted by `createdAt` descending so the
 * newest configs are the ones that get deactivated (FIFO priority).
 * 
 * @param userConfigs - All active configs for the user (must have `user.plan` included)
 * @param userId      - The user ID (for logging)
 */
export function enforcePathLimits(userConfigs: any[], userId: string): PathLimitResult {
    if (userConfigs.length === 0) {
        return { allowed: [], overLimit: [], limit: 0, plan: 'FREE' };
    }

    const plan = userConfigs[0]?.user?.plan || 'FREE';
    const limit = PLAN_PATH_LIMITS[plan] ?? PLAN_PATH_LIMITS.FREE;

    if (userConfigs.length <= limit) {
        return { allowed: userConfigs, overLimit: [], limit, plan };
    }

    // Sort by createdAt ASC — oldest configs get priority
    const sorted = [...userConfigs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const allowed = sorted.slice(0, limit);
    const overLimit = sorted.slice(limit);

    // ── Required log format for monitoring/alerting ──
    logger.warn({
        userId,
        plan,
        limit,
        total: userConfigs.length,
        blocked: overLimit.length,
        blockedIds: overLimit.map((c: any) => c.id),
    }, `[Limit Reached] User ${userId} has reached their ${plan} limit. (${userConfigs.length}/${limit} paths — ${overLimit.length} blocked)`);

    return { allowed, overLimit, limit, plan };
}

// ──────────────────────────────────────────────────────────────
//  Performance Tiering — Priority Queue
//  Elite users get immediate processing.
//  Starter/Pro use a shared async queue with micro-batching.
// ──────────────────────────────────────────────────────────────

type QueuedTask = {
    fn: () => Promise<void>;
    plan: string;
    configId: string;
};

/**
 * A two-tier message processing queue.
 * 
 * - **Elite**: Tasks are executed immediately (zero-delay, `setImmediate`).
 * - **Starter/Pro**: Tasks are buffered and drained in FIFO order
 *   with a small inter-task delay to prevent resource contention
 *   when many non-Elite users are active simultaneously.
 */
export class PriorityMessageQueue {
    private static instance: PriorityMessageQueue;
    private standardQueue: QueuedTask[] = [];
    private processing = false;

    /** Inter-message delay for Starter/Pro (ms) — keeps the event loop healthy */
    private static readonly STANDARD_DELAY_MS = 50;

    private constructor() { }

    public static getInstance(): PriorityMessageQueue {
        if (!PriorityMessageQueue.instance) {
            PriorityMessageQueue.instance = new PriorityMessageQueue();
        }
        return PriorityMessageQueue.instance;
    }

    /**
     * Enqueue a message-forwarding task.
     * - ELITE: Fires immediately (setImmediate).
     * - Others: Queued and drained sequentially.
     */
    public enqueue(task: QueuedTask): void {
        if (task.plan === 'ELITE') {
            // ── Elite: zero-delay via setImmediate ──
            setImmediate(async () => {
                try {
                    await task.fn();
                } catch (error: any) {
                    logger.error({
                        configId: task.configId,
                        error: error.message || String(error),
                    }, 'Elite priority task failed');
                }
            });
            return;
        }

        // ── Starter/Pro: shared FIFO queue ──
        this.standardQueue.push(task);
        this.drain();
    }

    /**
     * Drains the standard queue one task at a time.
     * Only one drain loop runs at any given moment.
     */
    private async drain(): Promise<void> {
        if (this.processing) return; // Already draining
        this.processing = true;

        while (this.standardQueue.length > 0) {
            const task = this.standardQueue.shift()!;

            // Execute task asynchronously (fire-and-forget from the queue's perspective)
            // This ensures large uploads don't block subsequent messages
            task.fn().catch((error: any) => {
                logger.error({
                    configId: task.configId,
                    plan: task.plan,
                    error: error.message || String(error),
                }, 'Standard queue task failed');
            });

            // Brief yield between DISPATCHING tasks to avoid starving the event loop
            if (this.standardQueue.length > 0) {
                await new Promise(r => setTimeout(r, PriorityMessageQueue.STANDARD_DELAY_MS));
            }
        }

        this.processing = false;
    }

    /** Returns the current standard queue depth (for monitoring) */
    public get queueDepth(): number {
        return this.standardQueue.length;
    }
}
