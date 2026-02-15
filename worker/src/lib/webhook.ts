
import { WebhookClient, BufferResolvable } from 'discord.js';
import { logger } from './logger';
import https from 'https';
import { Stream } from 'stream';

const keepAliveAgent = new https.Agent({ keepAlive: true });

export interface WebhookFile {
    attachment: BufferResolvable | Stream | string;
    name: string;
}

export interface WebhookPayload {
    username: string;
    avatarURL?: string;
    content: string;
    files?: WebhookFile[];
    embeds?: any[];
}

const MAX_WEBHOOK_RETRIES = 2;
const WEBHOOK_RETRY_BASE_DELAY_MS = 500;
const WEBHOOK_SEND_TIMEOUT_MS = 15_000;

export class WebhookExecutor {
    /**
     * Sends a payload to a Discord webhook with retry logic and connection pooling.
     * Supports Streams, Buffers, and URLs (for Discord-to-Discord chaining).
     */
    public static async send(
        webhookUrl: string,
        payload: WebhookPayload,
        configId: string = 'unknown'
    ): Promise<void> {
        let lastError: any = null;

        for (let attempt = 1; attempt <= MAX_WEBHOOK_RETRIES; attempt++) {
            try {
                // Initialize client with keep-alive agent
                const webhookClient = new WebhookClient({
                    url: webhookUrl,
                    agent: keepAliveAgent
                } as any);

                // Construct options safely
                const sendOptions: any = {
                    username: payload.username,
                    avatarURL: payload.avatarURL,
                    content: payload.content,
                    allowedMentions: { parse: [] },
                    embeds: payload.embeds,
                };

                // Add files if present
                if (payload.files && payload.files.length > 0) {
                    sendOptions.files = payload.files;
                }

                // Race against timeout
                await Promise.race([
                    webhookClient.send(sendOptions),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error('Webhook send timed out')),
                            WEBHOOK_SEND_TIMEOUT_MS
                        )
                    )
                ]);

                // ── Explicit Memory Cleanup ──
                // Help GC by clearing references immediately
                if (payload.files) {
                    payload.files.forEach(f => {
                        // If it's a buffer, try to detach it (though JS GC is automatic, nullifying helps)
                        if (Buffer.isBuffer(f.attachment)) {
                            (f.attachment as any) = null;
                        }
                    });
                    payload.files = [];
                }

                // Success
                return;

            } catch (err: any) {
                lastError = err;

                // 1. Permanent failures (404, 10015)
                if (err.code === 10015 || err.code === 404) {
                    logger.error({ configId, code: err.code }, 'Discord webhook found not/deleted - dropping');
                    throw err;
                }

                // 2. Payload too large (413) - Retry WITHOUT files
                if (err.status === 413 || err.code === 40005) {
                    logger.warn({ configId }, 'Webhook payload too large — retrying without files');
                    // Remove files and retry immediately
                    payload.files = [];
                    payload.content += '\n-# ⚠️ Media was too large to forward';
                    continue;
                }

                // 3. Rate Limits (429)
                if (err.status === 429) {
                    const retryAfter = (err.retry_after * 1000) || 2000;
                    logger.warn({ configId, retryAfter }, 'Webhook rate limited — waiting');
                    await new Promise(r => setTimeout(r, retryAfter));
                    continue;
                }

                // 4. Transform stream errors or connection resets
                if (attempt < MAX_WEBHOOK_RETRIES) {
                    const delay = WEBHOOK_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw lastError || new Error('Webhook delivery failed');
    }
}
