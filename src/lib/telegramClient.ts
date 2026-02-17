
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';

// ──────────────────────────────────────────────────────────────
//  Authentication Helpers (Frontend/Next.js Context)
// ──────────────────────────────────────────────────────────────

export async function sendAuthCode(phoneNumber: string): Promise<{ phoneCodeHash: string; tempSession: string }> {
    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
    const apiHash = process.env.TELEGRAM_API_HASH || '';

    if (!apiId || !apiHash) throw new Error('Missing TELEGRAM_API_ID/HASH in env');

    // Initialize with empty session for auth flow
    const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
        connectionRetries: 5,
        useWSS: false
    });

    await client.connect();

    try {
        const result: any = await client.invoke(new Api.auth.SendCode({
            phoneNumber,
            apiId,
            apiHash,
            settings: new Api.CodeSettings({}),
        }));

        const phoneCodeHash = result.phoneCodeHash;
        const tempSession = client.session.save() as unknown as string;

        return { phoneCodeHash, tempSession };
    } finally {
        await client.disconnect();
        // Do NOT destroy if we plan to reuse via session string, but here we saved it so it's fine.
        // Actually, destroying is clean.
        await client.destroy();
    }
}

export async function completeAuth(params: {
    phoneNumber: string;
    phoneCodeHash: string;
    phoneCode: string;
    tempSession?: string;
    password?: string;
}): Promise<string> {
    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
    const apiHash = process.env.TELEGRAM_API_HASH || '';

    // Use tempSession if provided to maintain auth context
    const sessionToUse = params.tempSession ? params.tempSession : '';
    const client = new TelegramClient(new StringSession(sessionToUse), apiId, apiHash, {
        connectionRetries: 5,
        useWSS: false
    });

    await client.connect();

    try {
        await client.invoke(new Api.auth.SignIn({
            phoneNumber: params.phoneNumber,
            phoneCodeHash: params.phoneCodeHash,
            phoneCode: params.phoneCode,
        }));
    } catch (e: any) {
        if (e.errorMessage === 'SESSION_PASSWORD_NEEDED') {
            if (!params.password) {
                await client.disconnect();
                throw new Error('2FA Password Required');
            }
            // 2FA - Submit Password
            try {
                const { computeCheck } = await import("telegram/Password");
                const passwordSrp = await client.invoke(new Api.account.GetPassword());
                const request = await computeCheck(passwordSrp, params.password);
                await client.invoke(new Api.auth.CheckPassword({ password: request }));
            } catch (passwordError: any) {
                await client.disconnect();
                throw new Error(`2FA Password Failed: ${passwordError.message || passwordError}`);
            }
        } else {
            throw e;
        }
    }

    const sessionString = client.session.save() as unknown as string;
    await client.disconnect();
    await client.destroy();

    return sessionString;
}

export async function getTelegramChats(sessionString: string): Promise<any[]> {
    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
    const apiHash = process.env.TELEGRAM_API_HASH || '';

    if (!sessionString) return [];

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
        connectionRetries: 1, // Fail fast for UI feedback
        useWSS: true, // Match Worker to reduce protocol-switch conflicts
        deviceModel: 'DisBot Dashboard', // Distinct device ID
        appVersion: '2.1.0',
        timeout: 10000, // 10s timeout for individual requests
    });

    try {
        // Wrap connect and fetch in a global timeout to prevent server action hang
        const result = await Promise.race([
            (async () => {
                await client.connect();
                const dialogs = await client.getDialogs({ limit: 40 }); // Only fetch recent 40 dialogs
                return dialogs.map(d => ({
                    id: d.id?.toString() || '',
                    title: d.title || 'Untitled',
                    isChannel: d.isChannel,
                    isGroup: d.isGroup,
                    unreadCount: d.unreadCount
                }));
            })(),
            new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error("Telegram Connection Timeout")), 15000))
        ]);
        return result;
    } catch (e) {
        console.error("Get Telegram Dialogs Error:", e);
        return [];
    } finally {
        try {
            await client.disconnect();
            await client.destroy();
        } catch (e) { /* ignore */ }
    }
}

export async function getTelegramTopics(sessionString: string, chatId: string): Promise<any[]> {
    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
    const apiHash = process.env.TELEGRAM_API_HASH || '';

    if (!sessionString || !chatId) return [];

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
        connectionRetries: 1,
        useWSS: true, // Match Worker to reduce protocol-switch conflicts
        deviceModel: 'DisBot Dashboard', // Distinct device ID
        appVersion: '2.1.0',
    });

    try {
        await client.connect();

        // Resolve entity (handle -100 prefix if present in string, though getEntity usually handles it if int)
        // If chatId is string "-10012345", gramjs might need BigInt or just the string.
        const entity = await client.getEntity(chatId);

        const result: any = await client.invoke(new Api.channels.GetForumTopics({
            channel: entity,
            offsetDate: 0,
            offsetId: 0,
            offsetTopic: 0,
            limit: 50,
        }));

        if (result && result.topics) {
            return result.topics.map((t: any) => ({
                id: t.id.toString(),
                title: t.title,
                color: t.iconColor,
                iconEmojiId: t.iconEmojiId?.toString()
            }));
        }
        return [];

    } catch (e: any) {
        console.error("Get Telegram Topics Error:", e?.message || e);
        return [];
    } finally {
        await client.disconnect();
        await client.destroy();
    }
}

export async function getTelegramMe(sessionString: string): Promise<{ id: string; username: string; firstName: string; lastName?: string; phone?: string; photoUrl?: string }> {
    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
    const apiHash = process.env.TELEGRAM_API_HASH || '';

    if (!sessionString) throw new Error("Session required");

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
        connectionRetries: 1,
        useWSS: true,
        deviceModel: 'DisBot Dashboard',
        appVersion: '2.1.0',
    });

    try {
        await client.connect();
        const me: any = await client.getMe();

        // Basic info
        const result = {
            id: me.id.toString(),
            username: me.username || "",
            firstName: me.firstName || "",
            lastName: me.lastName || "",
            phone: me.phone || "",
            // Photo handling is complex (needs download), skip for now or use placeholder logic in UI
        };

        return result;
    } catch (e: any) {
        console.error("Get Telegram Me Error:", e);
        throw e;
    } finally {
        await client.disconnect();
        await client.destroy();
    }
}
