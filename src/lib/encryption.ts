import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Adjusted to match worker/standard GCM IV length

// Convert hex key to 32-byte buffer for AES-256
// Defaults to a safe fallback if env var is missing or invalid
const getEncryptionKey = (): Buffer => {
    const keyString = process.env.ENCRYPTION_KEY || "01234567890123456789012345678901";

    // 1. If exact 64-char hex string, use it
    if (keyString.length === 64 && /^[0-9a-fA-F]+$/.test(keyString)) {
        return Buffer.from(keyString, 'hex');
    }

    // 2. Otherwise convert to buffer (utf8) and ensure 32 bytes
    const buffer = Buffer.from(keyString, 'utf8');

    if (buffer.length === 32) {
        return buffer;
    }

    if (buffer.length > 32) {
        // Truncate to 32 bytes
        return buffer.subarray(0, 32);
    }

    // Pad with zeros if too short
    const padded = Buffer.alloc(32);
    buffer.copy(padded);
    return padded;
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
