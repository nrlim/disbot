
import { logger } from './logger';

export interface TrackedTask {
    promise: Promise<void>;
    messageId: string;
    startedAt: number;
    abortController: AbortController;
}

export class BackgroundTaskManager {
    private static instance: BackgroundTaskManager;
    private tasks: Map<string, TrackedTask> = new Map();

    /** Max time a snapshot forwarding task may run before it's force-aborted.
     *  Set to 300s (5m) for Elite Tier heavy media tasks & retry buffers. */
    private static readonly TASK_TIMEOUT_MS = 300_000;

    /** Cleanup interval — sweep every 10 seconds */
    private static readonly CLEANUP_INTERVAL_MS = 10_000;

    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    private constructor() {
        this.cleanupTimer = setInterval(() => this.sweep(), BackgroundTaskManager.CLEANUP_INTERVAL_MS);
        // Ensure the interval doesn't prevent process exit
        if (this.cleanupTimer.unref) this.cleanupTimer.unref();
    }

    public static getInstance(): BackgroundTaskManager {
        if (!BackgroundTaskManager.instance) {
            BackgroundTaskManager.instance = new BackgroundTaskManager();
        }
        return BackgroundTaskManager.instance;
    }

    /**
     * Track a background snapshot task with an automatic timeout.
     * Returns the AbortController so the caller can wire up timeout logic.
     */
    public track(taskId: string, messageId: string, taskFn: (signal: AbortSignal) => Promise<void>): void {
        const ac = new AbortController();

        // Auto-abort after TASK_TIMEOUT_MS
        const timer = setTimeout(() => {
            ac.abort();
            logger.warn({ taskId, messageId, timeoutMs: BackgroundTaskManager.TASK_TIMEOUT_MS }, '[Async] Snapshot task timed out — aborted after 5m');
        }, BackgroundTaskManager.TASK_TIMEOUT_MS);

        const wrappedPromise = taskFn(ac.signal)
            .catch((err: any) => {
                // Swallow AbortError — it's expected on timeout
                if (err?.name === 'AbortError' || ac.signal.aborted) return;
                logger.error({ taskId, messageId, error: err.message || String(err) },
                    '[Async] Background snapshot task failed');
            })
            .finally(() => {
                clearTimeout(timer);
                this.tasks.delete(taskId);
            });

        this.tasks.set(taskId, {
            promise: wrappedPromise,
            messageId,
            startedAt: Date.now(),
            abortController: ac,
        });
    }

    /** Sweep stale entries (defensive — tasks self-cleanup in .finally) */
    private sweep(): void {
        const now = Date.now();
        for (const [id, task] of this.tasks) {
            if (now - task.startedAt > BackgroundTaskManager.TASK_TIMEOUT_MS * 2) {
                task.abortController.abort();
                this.tasks.delete(id);
                logger.warn({ taskId: id, messageId: task.messageId },
                    '[Async] Swept stale background task');
            }
        }
    }

    /** Current number of in-flight background tasks */
    public get activeCount(): number {
        return this.tasks.size;
    }

    /** Graceful shutdown — abort all pending tasks */
    public async shutdown(): Promise<void> {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        for (const [id, task] of this.tasks) {
            task.abortController.abort();
        }
        // Wait for all tasks to settle (they'll resolve/reject quickly after abort)
        await Promise.allSettled(Array.from(this.tasks.values()).map(t => t.promise));
        this.tasks.clear();
    }
}

export const backgroundTasks = BackgroundTaskManager.getInstance();
