import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
// Ensure key is 32 bytes (256 bits). In production, this should be an env var.
// For dev, we'll use a hardcoded fallback or derive from a secret.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "01234567890123456789012345678901"; // 32 chars
const IV_LENGTH = 16;

export function encrypt(text: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
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

    const decipher = createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}
