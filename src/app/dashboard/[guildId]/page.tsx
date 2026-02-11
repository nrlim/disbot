
export default async function ServerDashboard({
    params,
}: {
    params: Promise<{ guildId: string }>;
}) {
    const { guildId } = await params;

    return (
        <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-6">
                Server Configuration
            </h1>
            <p className="text-gray-400 mb-8">
                Configuration panel for Server ID: <code className="bg-white/10 px-2 py-1 rounded text-white">{guildId}</code>
            </p>

            <div className="p-8 rounded-2xl bg-white/5 border border-white/10 text-center">
                <p className="text-xl text-gray-300">Configuration features coming soon...</p>
            </div>
        </div>
    );
}
