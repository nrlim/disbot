import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export function encrypt(text: string, masterKey: string): string {
    if (!masterKey) {
        throw new Error('Missing MASTER_ENCRYPTION_KEY');
    }

    // Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(12);

    // Convert key from hex to buffer
    let keyBuffer: Buffer;
    if (masterKey.length === 64) {
        keyBuffer = Buffer.from(masterKey, 'hex');
    } else if (masterKey.length === 32) {
        keyBuffer = Buffer.from(masterKey, 'utf8');
    } else {
        keyBuffer = Buffer.from(masterKey, 'hex');
    }

    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const tag = cipher.getAuthTag();

    // Return format: IV:TAG:ENCRYPTED (all in hex)
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encryptedText: string, masterKey: string): string {
    if (!masterKey) {
        throw new Error('Missing MASTER_ENCRYPTION_KEY');
    }

    // Expect input format: IV:TAG:ENCRYPTED
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted format. Expected IV:TAG:ENCRYPTED');
    }

    const [ivHex, tagHex, encryptedHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    let keyBuffer: Buffer;
    if (masterKey.length === 64) {
        keyBuffer = Buffer.from(masterKey, 'hex');
    } else if (masterKey.length === 32) {
        keyBuffer = Buffer.from(masterKey, 'utf8');
    } else {
        keyBuffer = Buffer.from(masterKey, 'hex');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
}
