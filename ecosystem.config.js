module.exports = {
    apps: [
        {
            name: 'disbot-web',
            script: 'npm',
            args: 'start',
            env: {
                NODE_ENV: 'production',
            },
            cwd: './',
        },
        {
            name: 'disbot-v2',
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