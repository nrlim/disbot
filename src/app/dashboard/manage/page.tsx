"use client";

import { useState, useEffect } from "react";
import { Loader2, Settings, Bot, Shield, User, Play, Square, Eye, EyeOff, RefreshCcw, Save, Trash2, ShieldBan, ShieldCheck, Activity } from "lucide-react";
import { toast } from "react-hot-toast";
import { Combobox } from "@/components/Combobox";

export default function ManagementDashboard() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [discordData, setDiscordData] = useState<{ roles: any[], members: any[] }>({ roles: [], members: [] });
    const [lastSynced, setLastSynced] = useState<Date | null>(null);
    const [showToken, setShowToken] = useState(false);

    // Forms state
    const [settings, setSettings] = useState({
        id: "", botToken: "", clientId: "", guildId: "", adminRoleId: "", trialRoleId: "", globalAntiSpam: true
    });

    const [grantForm, setGrantForm] = useState({ discordId: "", durationDays: "30", roleId: "" });
    const [blockForm, setBlockForm] = useState({ telegramId: "" });

    const fetchData = async () => {
        try {
            const res = await fetch("/api/admin/bot-manager");
            const result = await res.json();

            if (result.error) throw new Error(result.error);

            setData(result);
            if (result.botSettings) {
                setSettings({ ...result.botSettings });
            }
        } catch (e: any) {
            toast.error(e.message || "Failed to fetch data");
        } finally {
            setLoading(false);
            setLastSynced(new Date());
        }
    };

    const fetchDiscordData = async () => {
        try {
            const res = await fetch("/api/discord/roles");
            const result = await res.json();
            if (!result.error && result.roles) {
                setDiscordData({ roles: result.roles || [], members: result.members || [] });
            }
        } catch (e: any) {
            // Silently ignore if not configured yet
        }
    };

    useEffect(() => {
        fetchData();
        fetchDiscordData();
        const interval = setInterval(() => {
            fetchData();
        }, 15000);

        const discordInterval = setInterval(() => {
            fetchDiscordData();
        }, 60000);

        return () => {
            clearInterval(interval);
            clearInterval(discordInterval);
        };
    }, []);

    const handleSaveSettings = async () => {
        const id = toast.loading("Saving settings and restarting manager...");
        try {
            const res = await fetch("/api/admin/bot-manager", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "SAVE_SETTINGS", payload: settings })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            toast.success("Settings saved & manager restarted", { id });
            fetchData();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    const handlePM2Restart = async (target: string) => {
        const id = toast.loading(`Restarting ${target}...`);
        try {
            const res = await fetch("/api/admin/bot-manager", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "RESTART_PROCESS", payload: { target } })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            toast.success(`${target} restarted.`, { id });
            fetchData();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    const handleGrantRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!grantForm.discordId || !grantForm.roleId) return toast.error("Please select both User and Role.");

        const id = toast.loading("Granting role manually...");
        try {
            const res = await fetch("/api/admin/bot-manager", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "GRANT_ROLE",
                    payload: { ...grantForm, guildId: settings.guildId }
                })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            toast.success("Role granted & active!", { id });
            setGrantForm({ ...grantForm, discordId: "" });
            fetchData();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    const handleBlockTelegram = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!blockForm.telegramId) return;

        const id = toast.loading("Blocking Telegram ID...");
        try {
            const res = await fetch("/api/admin/bot-manager", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "BLOCK_TELEGRAM", payload: blockForm })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            toast.success("Telegram ID blocklisted", { id });
            setBlockForm({ telegramId: "" });
            fetchData();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    const handleUnlockTelegram = async (telegramId: string) => {
        const id = toast.loading("Unlocking ID...");
        try {
            const res = await fetch("/api/admin/bot-manager", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "UNLOCK_TELEGRAM", payload: { telegramId } })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            toast.success("Telegram ID unlocked", { id });
            fetchData();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center flex-col items-center h-[50vh] gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-gray-500 font-medium animate-pulse">Initializing Management Interface...</p>
            </div>
        );
    }

    const roleOptions = discordData.roles.map(r => ({ value: r.id, label: r.name }));
    const memberOptions = discordData.members.map((m: any) => ({
        value: m.id,
        label: `${m.username} ${m.global_name ? `(${m.global_name})` : ''}`.trim()
    }));

    const isConnected = discordData.roles.length > 0;
    const isManagerOnline = data?.pm2?.manager?.status === 'online';

    // We only lock the Quick Grant form (right side), NOT the settings config.
    const configLocked = !isConnected || !isManagerOnline;

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-12">

            {/* Header / Active Flag */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3 mb-2">
                        <ShieldCheck className="w-8 h-8 text-primary" /> Management Hub
                    </h1>
                    <p className="text-gray-500">Manage disbot environments, roles, spammers and configs.</p>
                </div>

                <div className="flex items-center gap-4 py-2 px-4 bg-white border border-gray-100 rounded-full shadow-sm shadow-black/5 shrink-0 transition-all">
                    <div className="flex items-center gap-2">
                        <div className={`relative flex h-3 w-3`}>
                            {isConnected && isManagerOnline ? (
                                <>
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                </>
                            ) : (
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            )}
                        </div>
                        <span className={`text-sm font-bold tracking-wide uppercase ${isConnected && isManagerOnline ? 'text-green-700' : 'text-red-700'}`}>
                            {isConnected && isManagerOnline ? 'Bot Online' : 'Offline / Unconfigured'}
                        </span>
                    </div>
                    {lastSynced && (
                        <div className="text-xs text-gray-400 border-l pl-4 font-medium flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5" />
                            Sync: {lastSynced.toLocaleTimeString()}
                        </div>
                    )}
                </div>
            </div>

            {/* PM2 System Health */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                <Bot className="w-5 h-5 text-indigo-500" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Mirror Worker</h3>
                                <p className="text-xs text-gray-500 font-medium">Core message scraping engine</p>
                            </div>
                        </div>
                        <span className={`px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase rounded-full ${data?.pm2?.worker?.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {data?.pm2?.worker?.status || 'Offline'}
                        </span>
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-gray-50 pt-4">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Memory Usage</span>
                            <span className="text-sm font-semibold text-gray-700">{Math.round((data?.pm2?.worker?.memory || 0) / 1024 / 1024)} MB <span className="text-gray-400 font-medium">/ 2048 MB limit</span></span>
                        </div>
                        <button onClick={() => handlePM2Restart('disbot-worker')} className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                            <RefreshCcw className="w-4 h-4" /> Restart
                        </button>
                    </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                                <User className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Role Manager</h3>
                                <p className="text-xs text-gray-500 font-medium">Auto-role expiration & check cron</p>
                            </div>
                        </div>
                        <span className={`px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase rounded-full ${data?.pm2?.manager?.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {data?.pm2?.manager?.status || 'Offline'}
                        </span>
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-gray-50 pt-4">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Memory Usage</span>
                            <span className="text-sm font-semibold text-gray-700">{Math.round((data?.pm2?.manager?.memory || 0) / 1024 / 1024)} MB <span className="text-gray-400 font-medium">/ 512 MB limit</span></span>
                        </div>
                        <button onClick={() => handlePM2Restart('disbot-manager')} className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                            <RefreshCcw className="w-4 h-4" /> Restart
                        </button>
                    </div>
                </div>
            </div>

            {/* Main 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* 1. Bot Configuration (Left Base) */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col h-full lg:col-span-1">
                    <div className="p-5 border-b border-gray-50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 border flex items-center justify-center">
                            <Settings className="w-4 h-4 text-gray-600" />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900">Configuration</h3>
                    </div>
                    <div className="p-5 space-y-4 flex-1">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Bot Token</label>
                            <div className="relative">
                                <input
                                    type={showToken ? "text" : "password"}
                                    value={settings.botToken || ''}
                                    onChange={(e) => setSettings({ ...settings, botToken: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary pr-10 transition-shadow"
                                    placeholder="Enter raw bot token..."
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken(!showToken)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-700 z-10 cursor-pointer"
                                >
                                    {showToken ? <EyeOff className="w-5 h-5 bg-transparent" /> : <Eye className="w-5 h-5 bg-transparent" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Client ID</label>
                            <input type="text" value={settings.clientId || ''} onChange={(e) => setSettings({ ...settings, clientId: e.target.value })} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary transition-shadow" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Guild ID</label>
                            <input type="text" value={settings.guildId || ''} onChange={(e) => setSettings({ ...settings, guildId: e.target.value })} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary transition-shadow" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Admin Role</label>
                            <Combobox
                                options={roleOptions}
                                value={settings.adminRoleId}
                                onChange={(val) => setSettings({ ...settings, adminRoleId: val })}
                                placeholder="Select Admin Role..."
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Trial Revert Role</label>
                            <Combobox
                                options={roleOptions}
                                value={settings.trialRoleId}
                                onChange={(val) => setSettings({ ...settings, trialRoleId: val })}
                                placeholder="Select Trial Role..."
                            />
                        </div>
                    </div>
                    <div className="p-5 border-t border-gray-50 bg-gray-50/30">
                        <button onClick={handleSaveSettings} className="w-full py-2.5 bg-gray-900 text-white font-medium rounded-xl flex justify-center items-center gap-2 hover:bg-gray-800 hover:shadow-md hover:shadow-gray-900/10 transition-all">
                            <Save className="w-4 h-4" /> Save & Restart
                        </button>
                    </div>
                </div>

                {/* 2. Security & Anti-Spam (Middle Base) */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col h-full lg:col-span-1">
                    <div className="p-5 border-b border-gray-50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-red-500" />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900">Security Center</h3>
                    </div>

                    <div className="p-5 flex-1 flex flex-col pt-6">
                        <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-xl mb-6">
                            <div>
                                <h4 className="font-bold text-sm text-gray-900">Global Anti-Spam</h4>
                                <p className="text-xs text-gray-500 font-medium">Auto-block 5msg/10s</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={settings.globalAntiSpam}
                                    onChange={(e) => {
                                        setSettings({ ...settings, globalAntiSpam: e.target.checked });
                                    }}
                                />
                                <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                            </label>
                        </div>

                        <form onSubmit={handleBlockTelegram} className="flex gap-2 mb-4">
                            <input
                                required type="text" placeholder="Telegram ID to Block..."
                                value={blockForm.telegramId} onChange={e => setBlockForm({ telegramId: e.target.value })}
                                className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-shadow"
                            />
                            <button type="submit" className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 hover:shadow-md hover:shadow-red-500/20 transition-all flex items-center gap-2">
                                <ShieldBan className="w-4 h-4" /> Block
                            </button>
                        </form>

                        <div className="border border-gray-100 rounded-xl overflow-hidden flex-1 flex flex-col">
                            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex justify-between">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Blocked ID</span>
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Action</span>
                            </div>
                            <ul className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[220px]">
                                {data?.spammers?.length === 0 ? (
                                    <li className="px-4 py-6 text-center text-sm text-gray-400 font-medium">Blacklist is empty</li>
                                ) : (
                                    data?.spammers?.map((s: any) => (
                                        <li key={s.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{s.telegramId}</p>
                                                <p className="text-[10px] text-gray-400 font-medium uppercase">{s.reason}</p>
                                            </div>
                                            <button onClick={() => handleUnlockTelegram(s.telegramId)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 flex items-center justify-center group transition-colors">
                                                <Trash2 className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* 3. Quick Grant Toolkit (Right Base) */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col h-full lg:col-span-1 border-t-4 border-t-primary">
                    <div className="p-5 border-b border-gray-50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
                            <Play className="w-4 h-4 text-primary fill-primary/20" />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900">Quick Grant</h3>
                    </div>

                    <div className="p-6 flex-1 flex flex-col justify-center">
                        <form onSubmit={handleGrantRole} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex justify-between">
                                    <span>Target User</span>
                                    <span className="text-gray-400 font-medium lowercase">({discordData.members.length} found)</span>
                                </label>
                                <Combobox
                                    options={memberOptions}
                                    value={grantForm.discordId}
                                    onChange={(val) => setGrantForm({ ...grantForm, discordId: val })}
                                    placeholder="Search user name or ID..."
                                    disabled={configLocked}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex justify-between">
                                    <span>Premium Role</span>
                                    <span className="text-gray-400 font-medium lowercase">({discordData.roles.length} roles)</span>
                                </label>
                                <Combobox
                                    options={roleOptions}
                                    value={grantForm.roleId}
                                    onChange={(val) => setGrantForm({ ...grantForm, roleId: val })}
                                    placeholder="Select a discord role..."
                                    disabled={configLocked}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Duration</label>
                                <select
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary shadow-sm disabled:opacity-50"
                                    value={grantForm.durationDays}
                                    onChange={e => setGrantForm({ ...grantForm, durationDays: e.target.value })}
                                    disabled={configLocked}
                                >
                                    <option value="7">Trial Expansion (7 Days)</option>
                                    <option value="30">Monthly Sub (30 Days)</option>
                                    <option value="90">Quarterly Sub (90 Days)</option>
                                    <option value="365">Annual Sub (365 Days)</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                disabled={configLocked}
                                className="w-full py-3 bg-primary text-white font-bold rounded-xl flex justify-center items-center gap-2 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:hover:shadow-none transition-all mt-6"
                            >
                                Grant Role Access
                            </button>

                            {configLocked && (
                                <p className="text-xs text-center text-red-500 font-medium mt-3 bg-red-50 py-2 rounded-lg border border-red-100">
                                    Action Locked. Verify Bot Status and Configuration first.
                                </p>
                            )}
                        </form>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Subscribers & Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Active Subscribers Table (Span 2) */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm lg:col-span-2 flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center">
                                <User className="w-4 h-4 text-green-600" />
                            </div>
                            <h3 className="font-bold text-lg text-gray-900">Active Subscribers Overview</h3>
                        </div>
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full">
                            {data?.discordUsers?.filter((u: any) => u.status === 'ACTIVE').length || 0} Total
                        </span>
                    </div>

                    <div className="overflow-x-auto flex-1">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-gray-50/50">
                                <tr>
                                    <th className="px-6 py-3.5 font-bold text-xs text-gray-500 uppercase tracking-wider border-y border-gray-100">User / ID</th>
                                    <th className="px-6 py-3.5 font-bold text-xs text-gray-500 uppercase tracking-wider border-y border-gray-100">Granted Role</th>
                                    <th className="px-6 py-3.5 font-bold text-xs text-gray-500 uppercase tracking-wider border-y border-gray-100">Expires</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data?.discordUsers?.filter((u: any) => u.status === 'ACTIVE').length === 0 ? (
                                    <tr><td colSpan={3} className="text-center py-12 text-gray-400 font-medium text-sm">No active subscribers found in database.</td></tr>
                                ) : data?.discordUsers?.filter((u: any) => u.status === 'ACTIVE').map((user: any) => {

                                    // Try matching name
                                    const matchedUser = discordData.members.find((m: any) => m.id === user.discordId);
                                    const displayedName = matchedUser ? matchedUser.username : user.discordId;

                                    return (
                                        <tr key={user.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-gray-900">{displayedName}</p>
                                                {matchedUser && <p className="text-[10px] text-gray-400 font-mono mt-0.5">{user.discordId}</p>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 shadow-sm shadow-blue-100/50">
                                                    {discordData.roles.find(r => r.id === user.currentRole)?.name || user.currentRole}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-gray-900 font-medium">{new Date(user.expiryDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                    <span className="text-[10px] uppercase font-bold tracking-wider text-green-600 flex items-center gap-1">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Active
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Cleaner Logs View (Span 1) */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm lg:col-span-1 flex flex-col overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-400 to-orange-400 opacity-50"></div>
                    <div className="p-5 border-b border-gray-50 flex flex-col gap-1">
                        <h3 className="font-bold text-lg text-gray-900">Cleaner Operations</h3>
                        <p className="text-xs text-gray-500 font-medium">Recent trial revert history</p>
                    </div>

                    <div className="flex-1 overflow-y-auto w-full p-2">
                        <ul className="space-y-2">
                            {data?.autoReverted?.length === 0 ? (
                                <li className="px-4 py-8 text-center text-gray-400 font-medium text-sm">No cleanups recorded yet.</li>
                            ) : data?.autoReverted?.map((u: any) => (
                                <li key={u.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest bg-red-100 px-2 py-0.5 rounded shadow-sm shadow-red-100/50 flex flex-row items-center gap-1">
                                            <ShieldBan className="w-3 h-3" /> {u.status}
                                        </span>
                                        <span className="text-[10px] text-gray-400 font-medium">{new Date(u.updatedAt).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-sm text-gray-700 leading-snug">
                                        User <span className="font-bold text-gray-900">{discordData.members.find((m: any) => m.id === u.discordId)?.username || u.discordId}</span> lost premium access to <span className="font-bold text-gray-900">{discordData.roles.find(r => r.id === u.currentRole)?.name || 'Role'}</span>.
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

            </div>
        </div>
    );
}
