"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    ShoppingBag, BarChart2, Users, Plus, Pencil, Trash2,
    PackageCheck, TrendingUp, Wallet, RefreshCw, Search,
    CheckCircle2, XCircle, Clock, X, ChevronUp, ChevronDown,
    ShoppingCart, Settings as SettingsIcon, Save, Key, MessageSquare, Image as ImageIcon
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import toast, { Toaster } from "react-hot-toast";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Product = {
    id: string; name: string; price: number; stock: number;
    description?: string; image?: string; category: string; totalSold: number;
    _count?: { transactions: number };
};
type TeleUser = { id: string; telegramId: string; username?: string; balance: number; totalOrders: number };
type RecentOrder = { id: string; product: string; price: number; amount: number; status: string; userTag: string; createdAt: string };
type StoreStats = { topProducts: Array<{ name: string; totalSold: number; price: number; stock: number; category: string }>; totalRevenue: number; totalOrders: number; totalUsers: number; recentOrders: RecentOrder[] };

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

const statusBadge = (s: string) => {
    if (s === "SUCCESS") return <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Success</span>;
    if (s === "CANCELLED") return <span className="flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Cancelled</span>;
    return <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> Pending</span>;
};

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#c084fc", "#e879f9"];

// ─────────────────────────────────────────────
// Product Form Modal
// ─────────────────────────────────────────────
function ProductModal({ product, onClose, onSaved }: { product?: Product | null; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState({
        name: product?.name ?? "",
        price: product?.price ?? "",
        stock: product?.stock ?? "",
        description: product?.description ?? "",
        image: product?.image ?? "",
        category: product?.category ?? "General",
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const url = product ? `/api/store/products/${product.id}` : "/api/store/products";
            const method = product ? "PATCH" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            if (!res.ok) throw new Error("Failed to save product");
            toast.success(product ? "Product updated!" : "Product created!");
            onSaved();
            onClose();
        } catch {
            toast.error("Failed to save product.");
        } finally {
            setSaving(false);
        }
    };

    const field = (label: string, key: keyof typeof form, type = "text", placeholder = "") => (
        <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
            {key === "description" ? (
                <textarea
                    value={form[key] as string}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
            ) : (
                <input
                    type={type}
                    value={form[key] as any}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
            )}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-900">{product ? "Edit Product" : "Add New Product"}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {field("Product Name *", "name", "text", "e.g. Discord Nitro 1 Month")}
                    <div className="grid grid-cols-2 gap-3">
                        {field("Price (Rp) *", "price", "number", "50000")}
                        {field("Stock *", "stock", "number", "10")}
                    </div>
                    {field("Category", "category", "text", "General")}
                    {field("Description", "description", "text", "Short product description...")}
                    {field("Image URL", "image", "url", "https://...")}
                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                    >
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                        {saving ? "Saving..." : product ? "Save Changes" : "Create Product"}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// Top-up Modal
// ─────────────────────────────────────────────
function TopupModal({ users, onClose, onDone }: { users: TeleUser[]; onClose: () => void; onDone: () => void }) {
    const [telegramId, setTelegramId] = useState("");
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

    const filtered = users.filter(u =>
        u.telegramId.includes(search) || (u.username && u.username.toLowerCase().includes(search.toLowerCase()))
    );

    const handleTopup = async () => {
        if (!telegramId || !amount) return toast.error("Fill in all fields.");
        setLoading(true);
        try {
            const res = await fetch("/api/store/topup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ telegramId, amount: parseFloat(amount) }),
            });
            if (!res.ok) throw new Error();
            toast.success(`Topped up ${fmt(parseFloat(amount))} for TG#${telegramId.slice(-4)} ✅`);
            onDone();
            onClose();
        } catch {
            toast.error("Top-up failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Wallet className="w-5 h-5 text-indigo-600" /> Manual Balance Top-up</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
                </div>

                <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Search & Select User</label>
                    <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Username or Telegram ID"
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                        {filtered.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-3">No users found</p>
                        ) : filtered.map(u => (
                            <button
                                key={u.id}
                                onClick={() => setTelegramId(u.telegramId)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-indigo-50 transition-colors ${telegramId === u.telegramId ? "bg-indigo-50" : ""}`}
                            >
                                <span className="text-sm font-medium text-gray-800">{u.username ? `@${u.username}` : "Anonymous"}</span>
                                <span className="text-xs text-gray-400">TG#{u.telegramId.slice(-6)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {telegramId && (
                    <div className="bg-indigo-50 rounded-xl px-4 py-2 mb-4 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                        <span className="text-sm font-semibold text-indigo-700">Selected: TG#{telegramId.slice(-6)}</span>
                    </div>
                )}

                <div className="mb-5">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Top-up Amount (Rp)</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="e.g. 100000"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                </div>
                <button
                    onClick={handleTopup}
                    disabled={loading || !telegramId || !amount}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                    {loading ? "Processing..." : `Top-up ${amount ? fmt(parseFloat(amount)) : ""}`}
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
    return (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────
type Tab = "overview" | "products" | "users" | "config";

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function StorePage() {
    const [tab, setTab] = useState<Tab>("overview");
    const [products, setProducts] = useState<Product[]>([]);
    const [users, setUsers] = useState<TeleUser[]>([]);
    const [stats, setStats] = useState<StoreStats | null>(null);
    const [storeConfig, setStoreConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [savingConfig, setSavingConfig] = useState(false);
    
    const [productModal, setProductModal] = useState<{ open: boolean; product?: Product | null }>({ open: false });
    const [topupModal, setTopupModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortKey, setSortKey] = useState<"name" | "price" | "stock" | "totalSold">("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [pRes, uRes, sRes, cRes] = await Promise.all([
                fetch("/api/store/products"),
                fetch("/api/store/users"),
                fetch("/api/store/stats"),
                fetch("/api/store/config"),
            ]);
            const [p, u, s, c] = await Promise.all([pRes.json(), uRes.json(), sRes.json(), cRes.json()]);
            setProducts(p.products ?? []);
            setUsers(u.users ?? []);
            setStats(s);
            if (c.config) setStoreConfig(c.config);
            else setStoreConfig({ botToken: "", active: false, welcomeMsg: "Selamat datang di AUTO ORDER", welcomeImageUrl: "", cmdMenu: "Menu Utama", cmdBalance: "Saldo Kamu", cmdHistory: "Riwayat Pesanan" });
        } catch {
            toast.error("Failed to load store data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const deleteProduct = async (id: string) => {
        const toastId = toast.loading("Deleting...");
        try {
            const res = await fetch(`/api/store/products/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            toast.success("Product deleted.", { id: toastId });
            setDeleteConfirmId(null);
            fetchAll();
        } catch {
            toast.error("Failed to delete.", { id: toastId });
        }
    };

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingConfig(true);
        try {
            const res = await fetch("/api/store/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(storeConfig),
            });
            if (!res.ok) throw new Error();
            toast.success("Store Bot configuration saved and sent to Engine!");
            fetchAll();
        } catch {
            toast.error("Failed to save bot profile.");
        } finally {
            setSavingConfig(false);
        }
    };

    const toggleSort = (key: typeof sortKey) => {
        if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("asc"); }
    };

    const sortedProducts = [...products]
        .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.category.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            const vA = a[sortKey] as any;
            const vB = b[sortKey] as any;
            return sortDir === "asc" ? (vA > vB ? 1 : -1) : (vA < vB ? 1 : -1);
        });

    const SortIcon = ({ k }: { k: typeof sortKey }) => (
        sortKey === k
            ? sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-500" /> : <ChevronDown className="w-3 h-3 text-indigo-500" />
            : <ChevronUp className="w-3 h-3 text-gray-300" />
    );

    const tabs: { id: Tab; label: string; icon: any }[] = [
        { id: "overview", label: "Overview", icon: BarChart2 },
        { id: "products", label: "Products", icon: ShoppingBag },
        { id: "users", label: "Users", icon: Users },
        { id: "config", label: "Bot Config", icon: SettingsIcon },
    ];

    return (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500 pb-10">
            <Toaster position="top-right" toastOptions={{ className: "text-sm font-medium" }} />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-gray-100">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3 mb-1">
                        <ShoppingCart className="w-8 h-8 text-indigo-600" /> Bot Store
                    </h1>
                    <p className="text-sm text-gray-500">Provide your own bot token to run a custom Auto-Order Store on Telegram.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setTopupModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-xl border border-emerald-200 transition-all text-sm"
                    >
                        <Wallet className="w-4 h-4" /> Top-up Balance
                    </button>
                    <button
                        onClick={() => setProductModal({ open: true, product: null })}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all text-sm"
                    >
                        <Plus className="w-4 h-4" /> Add Product
                    </button>
                    <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-gray-200 transition-colors" title="Refresh">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                        <t.icon className="w-4 h-4" /> {t.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <StoreSkeleton />
            ) : (
                <>
                    {/* ── OVERVIEW TAB ── */}
                    {tab === "overview" && stats && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <StatCard icon={TrendingUp} label="Total Revenue" value={fmt(stats.totalRevenue)} color="bg-indigo-50 text-indigo-600 border border-indigo-100" />
                                <StatCard icon={ShoppingBag} label="Total Orders" value={stats.totalOrders} color="bg-emerald-50 text-emerald-600 border border-emerald-100" />
                                <StatCard icon={Users} label="Store Users" value={stats.totalUsers} color="bg-purple-50 text-purple-600 border border-purple-100" />
                                <StatCard icon={PackageCheck} label="Products Listed" value={products.length} color="bg-amber-50 text-amber-600 border border-amber-100" />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
                                    <div className="flex items-center gap-2 mb-5">
                                        <BarChart2 className="w-5 h-5 text-indigo-600" />
                                        <h3 className="font-bold text-gray-900">Top 5 Selling Products</h3>
                                    </div>
                                    {stats.topProducts.length === 0 ? (
                                        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No sales data yet.</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={240}>
                                            <BarChart data={stats.topProducts} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: "12px", border: "1px solid #f3f4f6", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                                                    formatter={(v: any) => [`${v} sold`, "Units"]}
                                                    cursor={{ fill: "#f5f3ff" }}
                                                />
                                                <Bar dataKey="totalSold" radius={[8, 8, 0, 0]} maxBarSize={48}>
                                                    {stats.topProducts.map((_, i) => (
                                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>

                                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4"><ShoppingBag className="w-4 h-4 text-indigo-600" /> Recent Orders</h3>
                                    <div className="space-y-3">
                                        {stats.recentOrders.length === 0 ? (
                                            <p className="text-sm text-gray-400 text-center py-4">No orders yet.</p>
                                        ) : stats.recentOrders.map(o => (
                                            <div key={o.id} className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-800 truncate max-w-[140px]">{o.product}</p>
                                                    <p className="text-xs text-gray-400">{o.userTag} · {new Date(o.createdAt).toLocaleDateString("id-ID")}</p>
                                                </div>
                                                {statusBadge(o.status)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── PRODUCTS TAB ── */}
                    {tab === "products" && (
                        <div className="space-y-4">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search by name or category..."
                                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>

                            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100">
                                                {[
                                                    { label: "Product", key: "name" as const },
                                                    { label: "Category", key: null },
                                                    { label: "Price", key: "price" as const },
                                                    { label: "Stock", key: "stock" as const },
                                                    { label: "Sold", key: "totalSold" as const },
                                                    { label: "Actions", key: null },
                                                ].map(col => (
                                                    <th
                                                        key={col.label}
                                                        onClick={() => col.key && toggleSort(col.key)}
                                                        className={`px-4 py-3 text-left font-bold text-gray-500 text-xs uppercase tracking-wider ${col.key ? "cursor-pointer hover:text-indigo-600 select-none" : ""}`}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            {col.label}
                                                            {col.key && <SortIcon k={col.key} />}
                                                        </span>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {sortedProducts.length === 0 ? (
                                                <tr><td colSpan={6} className="py-10 text-center text-gray-400">No products found.</td></tr>
                                            ) : sortedProducts.map(p => (
                                                <tr key={p.id} className="hover:bg-gray-50/60 transition-colors group">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-3">
                                                            {p.image ? (
                                                                <img src={p.image} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-gray-100" />
                                                            ) : (
                                                                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center border border-indigo-100">
                                                                    <ShoppingBag className="w-4 h-4 text-indigo-400" />
                                                                </div>
                                                            )}
                                                            <span className="font-semibold text-gray-800">{p.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{p.category}</span>
                                                    </td>
                                                    <td className="px-4 py-3 font-semibold text-gray-800">{fmt(p.price)}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`font-bold ${p.stock === 0 ? "text-red-500" : p.stock < 5 ? "text-amber-500" : "text-emerald-600"}`}>
                                                            {p.stock === 0 ? "Out of stock" : p.stock}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500">{p.totalSold}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => setProductModal({ open: true, product: p })}
                                                                className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors text-gray-400"
                                                                title="Edit"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                            {deleteConfirmId === p.id ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button onClick={() => deleteProduct(p.id)} className="px-2 py-1 bg-red-100 hover:bg-red-500 hover:text-white text-red-600 text-xs font-bold rounded-lg transition-colors">Sure?</button>
                                                                    <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-lg transition-colors">No</button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setDeleteConfirmId(p.id)}
                                                                    className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-gray-400"
                                                                    title="Delete"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── USERS TAB ── */}
                    {tab === "users" && (
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            {["Username", "Telegram ID", "Balance", "Total Orders", "Action"].map(h => (
                                                <th key={h} className="px-4 py-3 text-left font-bold text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {users.length === 0 ? (
                                            <tr><td colSpan={5} className="py-10 text-center text-gray-400">No users yet.</td></tr>
                                        ) : users.map(u => (
                                            <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-gray-800">{u.username ? `@${u.username}` : "—"}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-500">TG#{u.telegramId.slice(-8)}</td>
                                                <td className="px-4 py-3 font-bold text-indigo-700">{fmt(u.balance)}</td>
                                                <td className="px-4 py-3 text-gray-600">{u.totalOrders}</td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => { setUsers(users); setTopupModal(true); }}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 transition-all"
                                                    >
                                                        <Wallet className="w-3 h-3" /> Top-up
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── CONFIGURATION TAB ── */}
                    {tab === "config" && storeConfig !== null && (
                        <div className="max-w-2xl bg-white border border-gray-100 rounded-2xl shadow-sm p-6 lg:p-8">
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-2">
                                <SettingsIcon className="w-5 h-5 text-indigo-600" /> General Settings
                            </h2>
                            <p className="text-sm text-gray-500 mb-8">
                                Connect your Telegram Bot Token. The commands will automatically be mapped and self-activated when you turn on the toggle below. No manual BotFather setup required for commands!
                            </p>
                            
                            <form onSubmit={handleSaveConfig} className="space-y-6">
                                {/* Bot Token */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
                                        <Key className="w-4 h-4 text-gray-400" /> Bot Token
                                    </label>
                                    <input 
                                        type="text"
                                        required
                                        value={storeConfig.botToken || ""}
                                        onChange={e => setStoreConfig({ ...storeConfig, botToken: e.target.value })}
                                        placeholder="e.g. 1234567890:ABCD-EfghIjkLmnOpqRs"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono transition-shadow"
                                    />
                                    <p className="text-xs text-gray-400 mt-2">Create a new bot using @BotFather on Telegram and paste the HTTP API Token here.</p>
                                </div>

                                {/* Welcome Message */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-gray-400" /> Welcome Message (/start)
                                    </label>
                                    <textarea 
                                        rows={2}
                                        value={storeConfig.welcomeMsg || ""}
                                        onChange={e => setStoreConfig({ ...storeConfig, welcomeMsg: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none transition-shadow"
                                    />
                                    <p className="text-xs text-gray-400 mt-2">Supports Markdown styling (*bold*, _italic_, dll).</p>
                                </div>

                                {/* Welcome Image URL */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
                                        <ImageIcon className="w-4 h-4 text-gray-400" /> Welcome Banner Image URL (Optional)
                                    </label>
                                    <input 
                                        type="url"
                                        value={storeConfig.welcomeImageUrl || ""}
                                        onChange={e => setStoreConfig({ ...storeConfig, welcomeImageUrl: e.target.value })}
                                        placeholder="https://example.com/banner.jpg"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-shadow"
                                    />
                                    <p className="text-xs text-gray-400 mt-2">If provided, this image will be attached above the welcome statistics info. E.g. https://i.imgur.com/your-image.jpg</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Menu Button Text</label>
                                        <input 
                                            type="text"
                                            value={storeConfig.cmdMenu || ""}
                                            onChange={e => setStoreConfig({ ...storeConfig, cmdMenu: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Balance Button Text</label>
                                        <input 
                                            type="text"
                                            value={storeConfig.cmdBalance || ""}
                                            onChange={e => setStoreConfig({ ...storeConfig, cmdBalance: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">History Button Text</label>
                                        <input 
                                            type="text"
                                            value={storeConfig.cmdHistory || ""}
                                            onChange={e => setStoreConfig({ ...storeConfig, cmdHistory: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                        />
                                    </div>
                                </div>

                                {/* Toggle Active */}
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 mt-4">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">Activate Bot</p>
                                        <p className="text-xs text-gray-500 mt-0.5">Turn me on to start processing orders on Telegram.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={storeConfig.active || false}
                                            onChange={e => setStoreConfig({ ...storeConfig, active: e.target.checked })} 
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                    </label>
                                </div>

                                <div className="pt-4 border-t border-gray-100 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={savingConfig}
                                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2"
                                    >
                                        {savingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {savingConfig ? "Saving & Syncing..." : "Save Configuration"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </>
            )}

            {/* Modals */}
            {productModal.open && (
                <ProductModal
                    product={productModal.product}
                    onClose={() => setProductModal({ open: false })}
                    onSaved={fetchAll}
                />
            )}
            {topupModal && (
                <TopupModal
                    users={users}
                    onClose={() => setTopupModal(false)}
                    onDone={fetchAll}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────
function StoreSkeleton() {
    return (
        <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl" />)}
            </div>
            <div className="h-64 bg-gray-100 rounded-2xl" />
            <div className="h-64 bg-gray-100 rounded-2xl" />
        </div>
    );
}
