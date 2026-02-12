
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
