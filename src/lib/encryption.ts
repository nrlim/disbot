import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

// Convert hex key to 32-byte buffer for AES-256
// If ENCRYPTION_KEY is hex-encoded (64 chars), convert it. Otherwise use raw string.
const getEncryptionKey = (): Buffer => {
    const keyString = process.env.ENCRYPTION_KEY || "01234567890123456789012345678901";
    // If it looks like a hex string (64 chars, all hex), convert from hex
    if (keyString.length === 64 && /^[0-9a-fA-F]+$/.test(keyString)) {
        return Buffer.from(keyString, 'hex');
    }
    // Otherwise treat as raw 32-byte string
    return Buffer.from(keyString.slice(0, 32));
};

const ENCRYPTION_KEY_BUFFER = getEncryptionKey();

export function encrypt(text: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY_BUFFER, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    // Format: IV:AuthTag:EncryptedData
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
    const parts = text.split(":");
    if (parts.length !== 3) {
        // If not in our format, return explicitly or throw.
        // For migration/backward compability, check if it's plain text (optional logic)
        // But for new system, assume failure.
        throw new Error("Invalid encryption format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encryptedText = parts[2];

    const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY_BUFFER, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}
