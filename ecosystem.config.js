module.exports = {
    apps: [
        {
            name: 'disbot-worker',
            script: './worker/dist/engine.js',
            interpreter: 'node',
            node_args: '--max-old-space-size=2048',
            env: {
                NODE_ENV: 'production',
            },
            cwd: './'
        }
    ],
};