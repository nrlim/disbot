import dotenv from 'dotenv';
import path from 'path';
import { encrypt, validateEncryptionConfig } from './lib/crypto';
import { logger } from './lib/logger';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Validate env vars
try {
    validateEncryptionConfig();
} catch (error) {
    // logger.fatal handles the exit process
}

const token = process.argv[2];

if (!token) {
    console.error('Usage: ts-node src/encrypt-token.ts <DISCORD_TOKEN>');
    console.error('Example: ts-node src/encrypt-token.ts "MTk4NjIyNDgzND..."');
    process.exit(1);
}

try {
    const masterKey = process.env.MASTER_ENCRYPTION_KEY!;
    const encryptedToken = encrypt(token, masterKey);
    console.log('\n✅ Token encrypted successfully!\n');
    console.log('Encrypted token (save this in the database):');
    console.log(encryptedToken);
    console.log('\nYou can now use this encrypted value in your MirrorConfig.userToken field.');
} catch (error) {
    logger.error({ err: error }, 'Error encrypting token');
    process.exit(1);
}
