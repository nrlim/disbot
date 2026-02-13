module.exports = {
    apps: [
        {
            name: 'disbot-worker',
            script: 'npm',
            args: 'run start -- --max-old-space-size=512',
            env: {
                NODE_ENV: 'production',
            },
            cwd: './worker',
            // Alternatif yang lebih kuat jika npm start tidak meneruskan argumen:
            // script: './worker/dist/engine.js',
            // node_args: '--max-old-space-size=512',
        },
    ],
};