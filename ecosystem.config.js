module.exports = {
    apps: [
        {
            name: 'disbot-v2',
            script: './worker/dist/engine.js',
            node_args: '--max-old-space-size=512',
            env: {
                NODE_ENV: 'production',
            },
            cwd: './'
        }
    ],
};