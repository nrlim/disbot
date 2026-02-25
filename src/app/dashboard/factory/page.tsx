"use client";

import { useState, useEffect } from "react";
import {
    Loader2, Plus, Bot, Shield, Play,
    Activity, Save, ShieldBan, Monitor,
    Network, CheckCircle2, AlertCircle, ChevronRight, Trash2, Trophy, Settings
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Combobox } from "@/components/Combobox";
import { MultiSelect } from "@/components/MultiSelect";

const MODULE_DEFINITIONS = [
    { id: 'BASE', title: 'Base Mirroring', description: 'Auto-forwarding core logic', icon: Network },
    { id: 'ACCESS', title: 'Access Manager', description: 'Commands [/grant, /revoke]', icon: Shield },
    { id: 'SUBSCRIPTION', title: 'Subscription Checker', description: 'Commands [/check, /extend]', icon: Monitor },
    { id: 'ELITE', title: 'Elite Protection', description: 'Anti-spam & Global Blacklist', icon: ShieldBan },
    { id: 'LOYALTY_SYSTEM', title: 'Loyalty Points', description: 'Commands [/points, /redeem, /top]', icon: Trophy },
];

// Mapping feature IDs to discord commands for the UI summary
const COMMAND_MAPPING: Record<string, string[]> = {
    'ACCESS': ['/grant', '/revoke'],
    'SUBSCRIPTION': ['/check', '/extend'],
    'LOYALTY_SYSTEM': ['/points', '/redeem', '/top'],
    'ELITE': [],
    'BASE': [],
};

const DUMMY_MEMORY = [32.4, 38.1, 41.2, 29.8, 45.0, 35.5]; // mock memory values per bot instance

export default function BotFactoryPage() {
    const [loading, setLoading] = useState(true);
    const [bots, setBots] = useState<any[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
    const [lastSynced, setLastSynced] = useState<Date | null>(null);

    // Modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newBotForm, setNewBotForm] = useState({ name: "", botToken: "", clientId: "", guildId: "", adminRoleId: "", trialRoleId: "" });
    const [availableRoles, setAvailableRoles] = useState<any[]>([]);
    const [isFetchingRoles, setIsFetchingRoles] = useState(false);

    // Pending Feature Toggles state
    const [pendingFeatures, setPendingFeatures] = useState<Record<string, string[]>>({});

    const fetchBots = async () => {
        try {
            const res = await fetch("/api/admin/bot-factory");
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            setBots(result.bots || []);
            setLastSynced(new Date());

            // If no bot selected but there are bots, select first
            if (!selectedBotId && result.bots.length > 0) {
                setSelectedBotId(result.bots[0].id);
            }
        } catch (e: any) {
            toast.error(e.message || "Failed to fetch bot factory data");
        } finally {
            setLoading(false);
        }
    };

    // Use polling for SSE-like live status per requirements
    useEffect(() => {
        fetchBots();
        const interval = setInterval(() => {
            fetchBots();
        }, 15000); // 15s to check heartbeat pulse
        return () => clearInterval(interval);
    }, [selectedBotId]);

    const handleCreateBot = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBotForm.name || !newBotForm.botToken || !newBotForm.clientId || !newBotForm.guildId) {
            return toast.error("Please fill in all bot fields.");
        }

        const id = toast.loading("Spawning new bot instance...");
        try {
            const res = await fetch("/api/admin/bot-factory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "CREATE_BOT", payload: newBotForm })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);

            toast.success("New bot instance successfully spun up!", { id });
            setNewBotForm({ name: "", botToken: "", clientId: "", guildId: "", adminRoleId: "", trialRoleId: "" });
            setAvailableRoles([]);
            setIsAddModalOpen(false);
            fetchBots();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    const handleFetchRoles = async () => {
        if (!newBotForm.botToken || !newBotForm.guildId) {
            return toast.error("Bot Token and Guild ID are required to fetch roles.");
        }
        setIsFetchingRoles(true);
        try {
            const res = await fetch("/api/discord/fetch-roles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ botToken: newBotForm.botToken, guildId: newBotForm.guildId })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            setAvailableRoles(result.roles || []);
            toast.success("Roles fetched successfully!");
        } catch (e: any) {
            toast.error(e.message || "Failed to fetch roles.");
        } finally {
            setIsFetchingRoles(false);
        }
    };

    const handleToggleFeature = (featureId: string) => {
        if (!selectedBotId) return;

        const originalBot = bots.find(b => b.id === selectedBotId);
        if (!originalBot) return;

        const currentPends = pendingFeatures[selectedBotId];
        let newFeatures = currentPends ? [...currentPends] : [...originalBot.features];

        // Access commands map to internal command names logically, but UI groups them. 
        // We will store 'GRANT', 'REVOKE', etc individually. 
        // Wait, the new logic explicitly maps ACCESS -> GRANT, REVOKE
        // So let's store module IDs in DB instead, and register commands based on them.

        if (newFeatures.includes(featureId)) {
            newFeatures = newFeatures.filter(f => f !== featureId);
            // Dependency: If ELITE requires BASE, and we remove BASE, we must remove ELITE too
            if (featureId === 'BASE') {
                newFeatures = newFeatures.filter(f => f !== 'ELITE');
            }
        } else {
            newFeatures.push(featureId);
            // Dependency: If adding ELITE, we must add BASE
            if (featureId === 'ELITE' && !newFeatures.includes('BASE')) {
                newFeatures.push('BASE');
                toast('Elite Protection requires Base Mirroring. Added automatically.', { icon: '🛡️' });
            }
        }

        setPendingFeatures({
            ...pendingFeatures,
            [selectedBotId]: newFeatures
        });
    };

    const handleApplyChanges = async () => {
        if (!selectedBotId) return;
        const currentPends = pendingFeatures[selectedBotId];
        if (!currentPends) return; // No changes

        // Map abstract modules to concrete commands for the manager
        // DB config.features array will hold module names like 'BASE', 'ACCESS'. 
        // We could also map ACCESS to 'GRANT', 'REVOKE' before saving,
        // but for simplicity, let's just save the module names and rely on the UI/Manager mapping.
        // Actually, earlier we coded the manager to check features.includes('GRANT'). 
        // Let's ensure the saved array explodes modules into command names for the manager!
        const backendFeatures: string[] = [...currentPends];
        if (currentPends.includes('ACCESS')) {
            backendFeatures.push('GRANT', 'REVOKE');
        }
        if (currentPends.includes('SUBSCRIPTION')) {
            backendFeatures.push('CHECK', 'EXTEND');
        }

        const id = toast.loading("Applying changes & hot-reloading bot...");
        try {
            const res = await fetch("/api/admin/bot-factory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "UPDATE_FEATURES",
                    payload: { botId: selectedBotId, features: backendFeatures }
                })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);

            toast.success("Bot dynamically reconfigured & commands synced!", { id });

            // clear pending
            const newPending = { ...pendingFeatures };
            delete newPending[selectedBotId];
            setPendingFeatures(newPending);

            fetchBots();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    const handleDeleteBot = async () => {
        if (!selectedBotId) return;
        const confirmDelete = window.confirm("Are you sure you want to permanently delete this bot instance? This cannot be undone.");
        if (!confirmDelete) return;

        const id = toast.loading("Deleting bot instance...");
        try {
            const res = await fetch("/api/admin/bot-factory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "DELETE_BOT", payload: { botId: selectedBotId } })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);

            toast.success("Bot instance dynamically deleted.", { id });
            setSelectedBotId(null);
            fetchBots();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center flex-col items-center h-[50vh] gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-gray-500 font-medium animate-pulse">Initializing Bot Factory...</p>
            </div>
        );
    }

    const selectedBot = bots.find(b => b.id === selectedBotId);
    const currentFeatures = selectedBot ? (pendingFeatures[selectedBot.id] || selectedBot.features) : [];
    const hasPendingChanges = selectedBot && pendingFeatures[selectedBot.id] !== undefined;

    // Explode features back to modules if the DB has them as 'GRANT' etc.
    // For UI consistency, we map back what we exploded:
    const normalizedFeatures = currentFeatures.map((f: string) => f) || [];
    if (normalizedFeatures.includes('GRANT') || normalizedFeatures.includes('REVOKE')) normalizedFeatures.push('ACCESS');
    if (normalizedFeatures.includes('CHECK') || normalizedFeatures.includes('EXTEND')) normalizedFeatures.push('SUBSCRIPTION');

    // Calculate Active Commands
    const activeCommands = normalizedFeatures.flatMap((f: string) => COMMAND_MAPPING[f] || []).filter(Boolean);

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-12">

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3 mb-2">
                        <Monitor className="w-8 h-8 text-primary" /> Bot Factory
                    </h1>
                    <p className="text-gray-500">Multi-tenant orchestrator and dynamic capability assignment.</p>
                </div>

                <div className="flex items-center gap-4 py-2 px-4 bg-white border border-gray-100 rounded-full shadow-sm shadow-black/5 shrink-0 transition-all">
                    <div className="text-sm font-bold tracking-wide uppercase text-gray-700 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-500" /> Array Sync
                    </div>
                    {lastSynced && (
                        <div className="text-xs text-gray-400 border-l pl-4 font-medium flex items-center gap-1.5">
                            Last pulse: {lastSynced.toLocaleTimeString()}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">

                {/* Left Sidebar: Instance List */}
                <div className="w-full lg:w-80 flex flex-col gap-4">
                    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 h-[600px] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-900 uppercase tracking-widest text-xs">Instances ({bots.length})</h3>
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                            {bots.length === 0 ? (
                                <div className="text-center py-12 text-sm text-gray-400 font-medium border-2 border-dashed border-gray-100 rounded-xl">
                                    No bots spawned.
                                </div>
                            ) : bots.map((bot, i) => (
                                <button
                                    key={bot.id}
                                    onClick={() => setSelectedBotId(bot.id)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${selectedBotId === bot.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <div className="relative flex shrink-0">
                                        <div className="w-10 h-10 rounded-lg bg-white border border-gray-100 flex items-center justify-center">
                                            <Bot className={`w-5 h-5 ${bot.isOnline ? 'text-green-500' : 'text-gray-400'}`} />
                                        </div>
                                        {bot.isOnline ? (
                                            <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-white"></span>
                                            </span>
                                        ) : (
                                            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-red-500 border-2 border-white"></span>
                                        )}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-sm font-bold text-gray-900 truncate">{bot.name || `Bot ${i + 1}`}</p>
                                        <p className="text-[10px] bg-gray-100 text-gray-500 inline-block px-1.5 py-0.5 rounded font-mono truncate mt-1">
                                            ID: {bot.clientId.substring(0, 8)}...
                                        </p>
                                    </div>
                                    {pendingFeatures[bot.id] && (
                                        <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Side: Features & Dashboard */}
                <div className="flex-1 w-full space-y-6">

                    {!selectedBot ? (
                        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
                            <h2 className="text-xl font-bold text-gray-900">Select an instance</h2>
                            <p className="text-gray-500 mt-2">Choose a bot from the factory to configure its features.</p>
                        </div>
                    ) : (
                        <>
                            {/* Instance Dashboard Header */}
                            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row gap-6 justify-between items-center relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>

                                <div className="flex items-center gap-5 z-10 w-full lg:w-auto">
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 border-white shadow-lg ${selectedBot.isOnline ? 'bg-gradient-to-br from-green-400 to-green-500' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
                                        <Bot className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">{selectedBot.name || 'Client'} • {selectedBot.clientId}</h2>
                                        <div className="flex gap-3 text-sm mt-1 items-center">
                                            <span className="text-gray-500 font-medium">Guild: <span className="text-gray-700">{selectedBot.guildId}</span></span>
                                            <span className="text-gray-300">•</span>
                                            {selectedBot.isOnline ? (
                                                <span className="text-green-600 font-bold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Active Heartbeat</span>
                                            ) : (
                                                <span className="text-red-500 font-bold flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> No Heartbeat</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 z-10 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 pt-4 lg:pt-0 border-gray-100">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Heap Memory</span>
                                        <span className="text-lg font-bold text-gray-800 flex items-baseline gap-1">
                                            {selectedBot.isOnline ? DUMMY_MEMORY[bots.indexOf(selectedBot) % DUMMY_MEMORY.length].toFixed(1) : "0.0"} <span className="text-xs text-gray-400">MB</span>
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Status</span>
                                        <span className={`px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-full ${selectedBot.isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {selectedBot.isOnline ? 'ONLINE' : 'STOPPED'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col border-l pl-6 border-gray-100">
                                        <button
                                            onClick={handleDeleteBot}
                                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                                            title="Delete Bot Instance"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Applied Commands Preview UI */}
                            {activeCommands.length > 0 && (
                                <div className="flex gap-2 items-center text-sm font-medium">
                                    <span className="text-gray-500 uppercase text-xs font-bold tracking-widest mr-2">Registered Slash Commands:</span>
                                    {activeCommands.map(cmd => (
                                        <span key={cmd} className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg font-mono text-xs">{cmd}</span>
                                    ))}
                                </div>
                            )}

                            {/* Feature Marketplace */}
                            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                                <div className="p-5 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                            <Network className="w-5 h-5 text-indigo-500" /> Module Assignment
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Toggle dynamic systems for this bot instance.</p>
                                    </div>
                                    <button
                                        onClick={handleApplyChanges}
                                        disabled={!hasPendingChanges}
                                        className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${hasPendingChanges ? 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg shadow-black/10' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                                    >
                                        <Save className="w-4 h-4" />
                                        Apply Toggles
                                        {hasPendingChanges && <span className="absolute -top-1 -right-1 h-3 w-3 bg-orange-500 rounded-full animate-pulse border-2 border-white"></span>}
                                    </button>
                                </div>
                                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {MODULE_DEFINITIONS.map(mod => {
                                        const isActive = normalizedFeatures.includes(mod.id);
                                        const isMissingDependency = (mod.id === 'BASE' && normalizedFeatures.includes('ELITE')); // Cannot turn off BASE if ELITE is on

                                        return (
                                            <div
                                                key={mod.id}
                                                className={`relative border rounded-xl p-4 transition-all duration-300 flex items-start gap-4 ${isActive ? 'border-primary/50 bg-primary/5 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                            >
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isActive ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-gray-100 text-gray-400'}`}>
                                                    <mod.icon className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1 pr-12">
                                                    <h4 className={`font-bold text-sm ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>{mod.title}</h4>
                                                    <p className="text-xs text-gray-500 mt-1">{mod.description}</p>
                                                </div>

                                                <label className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={isActive}
                                                        onChange={() => handleToggleFeature(mod.id)}
                                                        disabled={isMissingDependency && isActive}
                                                    />
                                                    <div className={`w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isActive ? 'peer-checked:bg-primary' : ''} ${isMissingDependency ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                                                </label>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Loyalty Config UI (Dynamic) */}
                            {normalizedFeatures.includes('LOYALTY_SYSTEM') && (
                                <LoyaltySettingsCard
                                    botId={selectedBot.id}
                                    botToken={selectedBot.botToken}
                                    guildId={selectedBot.guildId}
                                    initialConfig={{ ...selectedBot.pointConfig, botConfig: selectedBot }}
                                    initialRedeemItems={selectedBot.redeemItems || []}
                                    onUpdate={fetchBots}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Modal for creating a new bot config */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Plus className="w-5 h-5 text-primary" /> Spawn Instance
                            </h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold px-2 py-1 bg-gray-100 rounded-md">✕</button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Instance Name</label>
                                <input required type="text" value={newBotForm.name} onChange={e => setNewBotForm({ ...newBotForm, name: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-inner" placeholder="E.g., Production Utility Bot" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Bot Token</label>
                                <input required type="password" value={newBotForm.botToken} onChange={e => setNewBotForm({ ...newBotForm, botToken: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-inner" placeholder="Pasted raw token..." />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Application Client ID</label>
                                <input required type="text" value={newBotForm.clientId} onChange={e => setNewBotForm({ ...newBotForm, clientId: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-inner" placeholder="10492839281923" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Target Guild ID</label>
                                <input required type="text" value={newBotForm.guildId} onChange={e => setNewBotForm({ ...newBotForm, guildId: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-inner" placeholder="1923812839129" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Admin Role ID</label>
                                    {availableRoles.length > 0 ? (
                                        <select
                                            value={newBotForm.adminRoleId}
                                            onChange={e => setNewBotForm({ ...newBotForm, adminRoleId: e.target.value })}
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-inner"
                                        >
                                            <option value="">Select an Admin Role...</option>
                                            {availableRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                        </select>
                                    ) : (
                                        <input type="text" value={newBotForm.adminRoleId} onChange={e => setNewBotForm({ ...newBotForm, adminRoleId: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-inner cursor-not-allowed opacity-50" placeholder="Load roles first..." disabled />
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Trial Revert Role</label>
                                    {availableRoles.length > 0 ? (
                                        <select
                                            value={newBotForm.trialRoleId}
                                            onChange={e => setNewBotForm({ ...newBotForm, trialRoleId: e.target.value })}
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-inner"
                                        >
                                            <option value="">Select a Trial Role...</option>
                                            {availableRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                        </select>
                                    ) : (
                                        <input type="text" value={newBotForm.trialRoleId} onChange={e => setNewBotForm({ ...newBotForm, trialRoleId: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-inner cursor-not-allowed opacity-50" placeholder="Load roles first..." disabled />
                                    )}
                                </div>
                            </div>

                            {availableRoles.length === 0 && (
                                <button type="button" onClick={handleFetchRoles} disabled={isFetchingRoles} className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-bold text-gray-500 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-colors flex justify-center items-center gap-2">
                                    {isFetchingRoles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
                                    Fetch Server Roles Array
                                </button>
                            )}
                        </div>
                        <div className="p-6 bg-gray-50 border-t border-gray-100">
                            <button onClick={handleCreateBot} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                                <Play className="w-4 h-4" /> Initialize Discord Client
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
// Loyalty Settings Card Component
// ─────────────────────────────────────────────────────────────────

function LoyaltySettingsCard({ botId, botToken, guildId, initialConfig, initialRedeemItems, onUpdate }: { botId: string, botToken: string | null, guildId: string | null, initialConfig: any, initialRedeemItems: any[], onUpdate: () => void }) {
    const [config, setConfig] = useState({
        pointsPerMessage: initialConfig?.pointsPerMessage || 1,
        cooldownSeconds: initialConfig?.cooldownSeconds || 60
    });
    const [saving, setSaving] = useState(false);

    // For new rules
    const [newRule, setNewRule] = useState({ cost: 100, roleId: '', durationDays: 30 });

    const [availableRoles, setAvailableRoles] = useState<any[]>([]);
    const [isFetchingRoles, setIsFetchingRoles] = useState(false);

    const [availableChannels, setAvailableChannels] = useState<any[]>([]);
    const [isFetchingChannels, setIsFetchingChannels] = useState(false);
    const [earningChannels, setEarningChannels] = useState<string[]>(initialConfig?.botConfig?.earningChannels || []);

    const handleFetchRoles = async () => {
        if (!botId || !guildId) return toast.error("Missing Bot ID or Guild ID for this bot.");
        setIsFetchingRoles(true);
        try {
            const res = await fetch("/api/discord/fetch-roles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ botId, guildId })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            setAvailableRoles(result.roles || []);
            toast.success("Roles fetched successfully for Loyalty Shop!");
        } catch (e: any) {
            toast.error(e.message || "Failed to fetch roles.");
        } finally {
            setIsFetchingRoles(false);
        }
    };

    const handleFetchChannels = async () => {
        if (!botId || !guildId) return toast.error("Missing Bot ID or Guild ID.");
        setIsFetchingChannels(true);
        try {
            const res = await fetch("/api/discord/fetch-channels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ botId, guildId })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            setAvailableChannels(result.channels || []);
            toast.success("Channels fetched successfully!");
        } catch (e: any) {
            toast.error(e.message || "Failed to fetch channels.");
        } finally {
            setIsFetchingChannels(false);
        }
    };

    const addRule = async () => {
        if (!newRule.roleId || newRule.cost <= 0 || newRule.durationDays <= 0) return toast.error('Valid Role ID, Cost, and Duration must be specified.');

        const role = availableRoles.find(r => r.id === newRule.roleId);
        const roleName = role ? role.name : newRule.roleId;

        const id = toast.loading("Adding item to shop...");
        try {
            const res = await fetch("/api/admin/bot-factory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "ADD_REDEEM_ITEM",
                    payload: { botId, roleId: newRule.roleId, roleName, pointCost: newRule.cost, durationDays: newRule.durationDays }
                })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            toast.success("Item added successfully!", { id });
            setNewRule({ cost: 100, roleId: '', durationDays: 30 });
            onUpdate();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    const removeRule = async (itemId: string) => {
        const id = toast.loading("Removing item from shop...");
        try {
            const res = await fetch("/api/admin/bot-factory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "DELETE_REDEEM_ITEM",
                    payload: { botId, itemId }
                })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            toast.success("Item removed successfully!", { id });
            onUpdate();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    const toggleRuleActive = async (itemId: string, active: boolean) => {
        const id = toast.loading("Updating item status...");
        try {
            const res = await fetch("/api/admin/bot-factory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "TOGGLE_REDEEM_ITEM",
                    payload: { botId, itemId, active }
                })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            toast.success("Item status updated!", { id });
            onUpdate();
        } catch (e: any) {
            toast.error(e.message, { id });
        }
    };

    const handleSave = async () => {
        setSaving(true);
        const id = toast.loading("Saving Loyalty configuration...");
        try {
            const res = await fetch("/api/admin/bot-factory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "UPDATE_POINT_CONFIG",
                    payload: { botId, ...config, earningChannels }
                })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            toast.success("Loyalty Settings applied & bot hot-reloading!", { id });
        } catch (e: any) {
            toast.error(e.message, { id });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-visible flex flex-col mt-6">
            <div className="p-5 border-b border-gray-50 bg-[#FFFBEA]/50 rounded-t-2xl flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-lg text-yellow-600 flex items-center gap-2">
                        <Trophy className="w-5 h-5" /> Loyalty & Rewards Engine
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">Control how point scaling, channels, and reward store roles operate.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${saving ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-yellow-500 text-white hover:bg-yellow-600 hover:shadow-lg shadow-yellow-500/20'}`}
                >
                    <Save className="w-4 h-4" />
                    Save Loyalty Rules
                </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 border-b border-gray-100">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Points Per Message</label>
                    <input
                        type="number"
                        value={config.pointsPerMessage}
                        onChange={e => setConfig(c => ({ ...c, pointsPerMessage: parseInt(e.target.value) || 0 }))}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Message Cooldown (Seconds)</label>
                    <input
                        type="number"
                        value={config.cooldownSeconds}
                        onChange={e => setConfig(c => ({ ...c, cooldownSeconds: parseInt(e.target.value) || 0 }))}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-sm"
                        placeholder="Prevent spam"
                    />
                </div>
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Earning Channels (Whitelist)</label>
                        {availableChannels.length === 0 && (
                            <button onClick={handleFetchChannels} disabled={isFetchingChannels} className="text-[10px] text-primary hover:underline font-bold">
                                {isFetchingChannels ? 'Fetching...' : 'Fetch Channels'}
                            </button>
                        )}
                    </div>
                    {availableChannels.length > 0 ? (
                        <div className="relative z-30">
                            <MultiSelect
                                options={availableChannels.map(c => ({ value: c.id, label: c.name }))}
                                values={earningChannels}
                                onChange={setEarningChannels}
                                placeholder="Select channels..."
                            />
                        </div>
                    ) : (
                        <div className="text-sm text-gray-400 p-2.5 bg-gray-50 border border-gray-200 rounded-lg border-dashed text-center">
                            Fetch channels to select
                        </div>
                    )}
                    {earningChannels.length === 0 && availableChannels.length > 0 && (
                        <p className="text-[10px] text-yellow-600 font-medium mt-1">⚠️ Points will not be awarded anywhere if empty.</p>
                    )}
                </div>
            </div>

            <div className="p-5">
                <div className="flex justify-between items-end mb-4">
                    <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2"><Settings className="w-4 h-4" /> Redeemable Shop Rules</h4>
                    {availableRoles.length === 0 && (
                        <button onClick={handleFetchRoles} disabled={isFetchingRoles} className="text-xs text-yellow-600 bg-yellow-50 hover:bg-yellow-100 px-3 py-1.5 rounded-lg font-bold transition-colors">
                            {isFetchingRoles ? 'Fetching...' : 'Fetch Discord Roles'}
                        </button>
                    )}
                </div>

                <div className="space-y-3">
                    {initialRedeemItems.map((item: any) => (
                        <div key={item.id} className={`flex flex-col sm:flex-row gap-3 items-center p-3 rounded-lg border ${item.isActive ? 'bg-gray-50 border-gray-100' : 'bg-red-50/50 border-red-100 opacity-60'}`}>
                            <div className="flex-1 flex flex-col items-center sm:items-start gap-1">
                                <span className={`text-sm font-bold ${item.isActive ? 'text-gray-800' : 'text-gray-500 line-through'}`}>{item.roleName} <span className="text-xs text-gray-400 font-mono ml-1">({item.roleId})</span></span>
                            </div>
                            <div className="flex-1 text-sm font-medium">💰 Cost: <span className="text-yellow-600 font-bold">{item.pointCost} pts</span></div>
                            <div className="flex-1 text-sm font-medium">⏳ Duration: <span className="text-blue-500 font-bold">{item.durationDays} days</span></div>
                            <div className="flex items-center gap-2">
                                <label className="inline-flex items-center cursor-pointer" title="Toggle active status">
                                    <input type="checkbox" className="sr-only peer" checked={item.isActive} onChange={(e) => toggleRuleActive(item.id, e.target.checked)} />
                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500 relative"></div>
                                </label>
                                <button onClick={() => removeRule(item.id)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                    ))}
                    {initialRedeemItems.length === 0 && (
                        <div className="text-sm text-center text-gray-400 py-6 border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                            No shop rewards configured yet.
                        </div>
                    )}
                </div>

                <div className="mt-6 flex flex-col md:flex-row gap-3 items-end p-4 bg-gray-50 rounded-xl border border-gray-200 shadow-inner overflow-visible">
                    <div className="flex-1 w-full relative z-20">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Target Role</label>
                        {availableRoles.length > 0 ? (
                            <Combobox
                                options={availableRoles.map(r => ({ value: r.id, label: r.name }))}
                                value={newRule.roleId}
                                onChange={(val) => setNewRule(r => ({ ...r, roleId: val }))}
                                placeholder="Search Role..."
                            />
                        ) : (
                            <input type="text" placeholder="Type Role ID..." value={newRule.roleId} onChange={e => setNewRule(r => ({ ...r, roleId: e.target.value }))} className="w-full p-2 text-sm border rounded-lg focus:ring-primary focus:border-primary border-gray-200 outline-none transition-all" />
                        )}
                    </div>
                    <div className="w-full md:w-32 relative z-10">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Cost (Pts)</label>
                        <input type="number" min="1" value={newRule.cost} onChange={e => setNewRule(r => ({ ...r, cost: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-sm border rounded-lg focus:ring-primary focus:border-primary border-gray-200 outline-none transition-all" />
                    </div>
                    <div className="w-full md:w-32 relative z-10">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Time (Days)</label>
                        <input type="number" min="1" value={newRule.durationDays} onChange={e => setNewRule(r => ({ ...r, durationDays: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-sm border rounded-lg focus:ring-primary focus:border-primary border-gray-200 outline-none transition-all" />
                    </div>
                    <button onClick={addRule} className="h-[38px] px-4 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-black w-full md:w-auto shrink-0 flex items-center gap-2 justify-center transition-colors relative z-10">
                        <Plus className="w-4 h-4" /> Add Reward
                    </button>
                </div>
            </div>
        </div>
    );
}
