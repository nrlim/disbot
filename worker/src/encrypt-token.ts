import dotenv from 'dotenv';
import path from 'path';
import { encrypt } from './lib/crypto';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const token = process.argv[2];

if (!token) {
    console.error('Usage: ts-node src/encrypt-token.ts <DISCORD_TOKEN>');
    console.error('Example: ts-node src/encrypt-token.ts "MTk4NjIyNDgzND..."');
    process.exit(1);
}

const masterKey = process.env.MASTER_ENCRYPTION_KEY;

if (!masterKey) {
    console.error('Error: MASTER_ENCRYPTION_KEY not found in .env file');
    console.error('Generate one with:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}

try {
    const encryptedToken = encrypt(token, masterKey);
    console.log('\n✅ Token encrypted successfully!\n');
    console.log('Encrypted token (save this in the database):');
    console.log(encryptedToken);
    console.log('\nYou can now use this encrypted value in your MirrorConfig.userToken field.');
} catch (error) {
    console.error('Error encrypting token:', error);
    process.exit(1);
}
