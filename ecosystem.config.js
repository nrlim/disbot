module.exports = {
    apps: [
        // ──────────────────────────────────────────────────────
        //  Service 1: Mirroring Engine (Discord/Telegram)
        //  Memory: 2GB | Entry: worker/dist/engine.js
        // ──────────────────────────────────────────────────────
        {
            name: 'disbot-worker',
            script: './worker/dist/engine.js',
            interpreter: 'node',
            node_args: '--max-old-space-size=2048',
            env: {
                NODE_ENV: 'production',
            },
            cwd: './',
            // Restart policy
            max_restarts: 10,
            min_uptime: '10s',
            restart_delay: 5000,
            // Logging
            error_file: './logs/worker-error.log',
            out_file: './logs/worker-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        },

        // ──────────────────────────────────────────────────────
        //  Service 2: Role Manager Bot (Auto-Role Expiry)
        //  Memory: 512MB | Entry: worker/dist/disbot-manager.js
        // ──────────────────────────────────────────────────────
        {
            name: 'disbot-manager',
            script: './worker/dist/disbot-manager.js',
            interpreter: 'node',
            node_args: '--max-old-space-size=512',
            env: {
                NODE_ENV: 'production',
            },
            cwd: './',
            // Restart policy
            max_restarts: 10,
            min_uptime: '10s',
            restart_delay: 5000,
            // Logging
            error_file: './logs/manager-error.log',
            out_file: './logs/manager-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        },
    ],
};