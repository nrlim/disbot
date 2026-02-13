module.exports = {
    apps: [
        {
            name: 'disbot-worker',
            script: './worker/dist/engine.js', // Jalankan file JS hasil build secara langsung
            node_args: '--max-old-space-size=512', // Ini cara yang benar memberikan RAM ke Node
            env: {
                NODE_ENV: 'production',
            },
            cwd: './' // Pastikan CWD mengarah ke root project Anda
        },
    ],
};