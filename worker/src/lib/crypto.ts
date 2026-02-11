import crypto from 'crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';

/**
 * Validates that the MASTER_ENCRYPTION_KEY is present and correct length.
 * Must be called after dotenv is configured.
 */
export function validateEncryptionConfig(): void {
    const key = process.env.MASTER_ENCRYPTION_KEY;
    if (!key) {
        logger.fatal('CRITICAL: MASTER_ENCRYPTION_KEY is missing from environment variables.');
        process.exit(1);
    }
    // Check if key is 32 bytes (UTF-8) or 64 hex characters (which map to 32 bytes)
    // 32 chars = 32 bytes
    // 64 hex chars = 32 bytes
    if (key.length !== 32 && key.length !== 64) {
        logger.fatal(`CRITICAL: MASTER_ENCRYPTION_KEY has invalid length (${key.length}). Must be 32 chars (utf8) or 64 chars (hex).`);
        process.exit(1);
    }
}

/**
 * Utility to mask tokens for logging (e.g., "MTA3...Xy9z")
 */
export function maskToken(token: string | undefined | null): string {
    if (!token || token.length < 8) return '******';
    return `...${token.slice(-4)}`;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 */
export function encrypt(text: string, masterKey: string): string {
    if (!masterKey) throw new Error('Missing MASTER_ENCRYPTION_KEY');

    try {
        const iv = crypto.randomBytes(12);
        const keyBuffer = getKeyBuffer(masterKey);

        const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
        let encrypted = cipher.update(text, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const tag = cipher.getAuthTag();

        return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (error) {
        logger.error({ err: error }, 'Encryption failed');
        throw new Error('Encryption operation failed');
    }
}

/**
 * Decrypts a string using AES-256-GCM.
 * Returns null if decryption fails (invalid key/corrupted data).
 */
export function decrypt(encryptedText: string, masterKey: string): string | null {
    if (!masterKey) throw new Error('Missing MASTER_ENCRYPTION_KEY');

    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) {
            // Not throwing here to avoid crash loops on bad data, just returning null
            logger.warn('Decryption failed: Invalid format');
            return null;
        }

        const [ivHex, tagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        const keyBuffer = getKeyBuffer(masterKey);

        const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString('utf8');
    } catch (error: any) {
        // Log generic error, do not expose payload
        logger.warn({ errorMessage: error.message }, 'Decryption failed (Key mismatch or corrupted data)');
        return null;
    }
}

function getKeyBuffer(key: string): Buffer {
    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    }
    return Buffer.from(key, 'utf8'); // Assumes 32 chars
}
