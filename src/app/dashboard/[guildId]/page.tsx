export default async function ServerDashboard({
    params,
}: {
    params: Promise<{ guildId: string }>;
}) {
    const { guildId } = await params;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">
                Server Node Configuration
            </h1>
            <p className="text-gray-500 mb-8 text-sm max-w-2xl">
                System parameters for target guild <code className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-primary font-mono font-semibold">{guildId}</code>
            </p>

            <div className="p-16 bg-white border border-gray-200 rounded-xl shadow-sm text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                </div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">System Status</div>
                <p className="text-xl font-bold text-gray-900 mb-2">Module Unavailable</p>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Advanced server-specific controls are currently being implemented. Check back soon for updates.
                </p>
                <button className="mt-8 px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors shadow-sm">
                    Return to Dashboard
                </button>
            </div>
        </div>
    );
}
