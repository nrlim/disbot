# Discord Mirroring Worker

This is the standalone Discord Mirroring Engine for the Disbot monorepo.

## Features

- **High-Concurrency Mirroring**: Handles multiple mirror configurations simultaneously
- **Real-time Sync**: Polls database every 5 minutes for configuration updates
- **Auto-Healing**: Detects and handles token invalidation and rate limiting
- **Secure Token Management**: AES-256-GCM encryption for Discord user tokens
- **Identity Spoofing**: Forwards messages with original author's name and avatar
- **Professional Logging**: Uses Pino logger for detailed operation logs

## Prerequisites

- Node.js 18 or higher
- PostgreSQL database (shared with main app)
- Root `.env` file with `DATABASE_URL` and `MASTER_ENCRYPTION_KEY`

## Installation

```bash
cd worker
npm install
```

## Environment Variables

The worker reads environment variables from the root `.env` file:

- `DATABASE_URL`: PostgreSQL connection string
- `MASTER_ENCRYPTION_KEY`: 32-byte hex string (64 characters) for AES-256-GCM encryption
- `LOG_LEVEL`: (Optional) Logging level, defaults to 'info'

### Generating Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output to your root `.env` file:

```
MASTER_ENCRYPTION_KEY=your_64_character_hex_string_here
```

## Running the Worker

### Development Mode

```bash
npm run dev
```

### Production Mode with PM2

From the root directory:

```bash
pm2 start ecosystem.config.js
```

This will start both:
- `disbot-web`: Next.js application
- `disbot-worker`: Discord mirroring engine

## How It Works

1. **Config Polling**: Every 5 minutes, fetches all active `MirrorConfig` records from the database
2. **Client Management**: Spawns/destroys Discord client instances based on unique user tokens
3. **Message Mirroring**: Listens for messages in configured source channels and forwards them to target webhooks
4. **Error Handling**:
   - Invalid tokens → Marks configs as inactive
   - Invalid webhooks → Marks configs as inactive
   - Rate limiting → Logs warning (TODO: implement backoff)

## Security Notes

- User tokens are encrypted in the database using AES-256-GCM
- The worker decrypts tokens only in memory, never logs them
- Tokens ending in `...XXXX` are used for safe logging

## Troubleshooting

### "Cannot find module 'discord.js-selfbot-v13'"

Run `npm install` in the worker directory.

### "Missing MASTER_ENCRYPTION_KEY"

Generate an encryption key and add it to the root `.env` file (see above).

### Clients not connecting

Check the logs for authentication errors. Ensure user tokens are valid and properly encrypted.

## Architecture

```
worker/
├── src/
│   ├── lib/
│   │   ├── crypto.ts      # AES-256-GCM decryption
│   │   └── prisma.ts      # Shared Prisma client
│   └── engine.ts          # Main mirroring engine
├── package.json
└── tsconfig.json
```

## Performance Considerations

- Each unique token = 1 Discord client connection
- Memory usage scales with number of active clients
- Closed sessions are garbage collected automatically
- Recommended: Monitor with PM2 `pm2 monit`

## License

See root LICENSE file
