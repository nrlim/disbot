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
            name: 'disbot-worker',
            script: 'npm',
            args: 'start',
            env: {
                NODE_ENV: 'production',
            },
            cwd: './worker',
        },
    ],
};
