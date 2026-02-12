"use client";

/**
 * ARCHITECTURE NOTE:
 * This frontend interacts with a backend powered by:
 * - Database: PostgreSQL (via Supabase)
 * - ORM: Prisma (Schema manages Tenant, Guild, Channel, and Subscription models)
 * - Realtime: Supabase Realtime / WebSocket for instant mirroring
 * - Authentication: NextAuth.js or Supabase Auth (linked to Discord OAuth2)
 * 
 * Tenant Configuration:
 * Each user is assigned a 'Tenant' ID which scopes their 'MirrorPaths'.
 * Prisma Middleware ensures multi-tenant data isolation.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  ShieldCheck,
  Globe,
  Check,
  Menu,
  ArrowRight,
  Server,
  Activity,
  MessageSquare,
  Lock
} from "lucide-react";
import SyncPreview from "@/components/SyncPreview";
import LoginButton from "@/components/LoginButton";
import Logo from "@/components/Logo";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DISCORD_ADMIN_LINK } from "@/lib/constants";

// Components
const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 glass-nav border-b border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Logo />

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-8">
          <Link href="#features" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Fitur</Link>
          <Link href="#pricing" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Harga</Link>
          <LoginButton />
        </div>

        {/* Mobile Toggle */}
        <button onClick={() => setIsOpen(!isOpen)} className="md:hidden text-gray-300">
          <Menu />
        </button>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-[#0f172a] border-b border-white/5 p-4 space-y-4">
          <Link href="#features" className="block text-gray-300 hover:text-white">Fitur</Link>
          <Link href="#pricing" className="block text-gray-300 hover:text-white">Harga</Link>
          <Link href="#faq" className="block text-gray-300 hover:text-white">FAQ</Link>
          <LoginButton className="w-full" />
        </div>
      )}
    </motion.nav>
  );
};

const SectionHeading = ({ children, center = true }: { children: React.ReactNode, center?: boolean }) => (
  <h2 className={cn("text-3xl md:text-5xl font-bold tracking-tight mb-6 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent", center && "text-center")}>
    {children}
  </h2>
);

const PricingCard = ({
  tier,
  price,
  quota,
  features,
  recommended = false,
  message
}: {
  tier: string,
  price: string,
  quota: string,
  features: { text: string, included: boolean }[],
  recommended?: boolean,
  message: string
}) => {
  const [copied, setCopied] = useState(false);

  const handlePayment = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);

      const toast = document.createElement("div");
      toast.className = "fixed bottom-5 right-5 bg-emerald-500 text-white px-6 py-3 shadow-xl z-50 font-medium animate-in slide-in-from-bottom-5 fade-in duration-300 rounded-none";
      toast.innerText = "Pesan pembelian disalin! Mengalihkan ke Discord...";
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.remove();
        setCopied(false);
      }, 3000);

      setTimeout(() => {
        window.open(DISCORD_ADMIN_LINK, '_blank');
      }, 800);
    });
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      className={cn(
        "relative p-8 border flex flex-col h-full bg-zinc-950/50 backdrop-blur-sm rounded-none transition-colors duration-300",
        recommended ? "border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.1)]" : "border-zinc-800 hover:border-zinc-700"
      )}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-4 py-1 text-xs font-bold uppercase tracking-widest rounded-none shadow-lg">
          Paling Populer
        </div>
      )}

      <div className="mb-8">
        <h3 className={cn("text-lg font-mono font-bold uppercase tracking-wider mb-2", recommended ? "text-emerald-400" : "text-zinc-400")}>
          {tier}
        </h3>
        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-3xl font-bold text-white tracking-tight">{price}</span>
          {price !== "Rp 0" && <span className="text-zinc-500 text-sm">/bln</span>}
        </div>
        <div className="py-2 px-3 bg-white/5 border border-white/5 text-center">
          <span className="text-sm text-zinc-300 font-mono tracking-wide">{quota}</span>
        </div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((feat, i) => (
          <li key={i} className={cn("flex items-start gap-3 text-sm", feat.included ? "text-zinc-300" : "text-zinc-600")}>
            {feat.included ? (
              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <span className="w-4 h-4 shrink-0 mt-0.5 flex items-center justify-center text-zinc-700 font-bold text-xs">✕</span>
            )}
            <span className={cn(feat.included ? "" : "line-through decoration-zinc-700")}>{feat.text}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={handlePayment}
        className={cn(
          "w-full py-4 font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 rounded-none",
          recommended
            ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20"
            : "bg-white/5 hover:bg-white/10 text-white border border-white/5 hover:border-white/20"
        )}
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Copied!
          </>
        ) : (
          <>
            {price === "Rp 0" ? "Mulai Gratis" : "Pilih Paket"}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </motion.div>
  );
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0f172a] text-white selection:bg-[#5865F2] selection:text-white">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-[#5865F2]/20 rounded-full blur-[120px] -z-10" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-[#00D1FF]/10 rounded-full blur-[100px] -z-10" />

        <div className="max-w-7xl mx-auto text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
              DISBOT: Mirroring Channel <br />
              <span className="text-gradient">Real-Time Tanpa Delay!</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
              Duplikasi informasi, sinyal crypto, dan pengumuman antar server secara otomatis.
              Satu sumber, banyak tujuan. Kelola komunitas Anda dengan efisiensi level tinggi.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button className="w-full sm:w-auto px-8 py-4 bg-[#5865F2] hover:bg-[#4752c4] text-white rounded-xl font-bold text-lg shadow-xl shadow-[#5865F2]/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                Mulai Sekarang <ArrowRight className="w-5 h-5" />
              </button>
              <button className="w-full sm:w-auto px-8 py-4 bg-[#1e293b]/50 hover:bg-[#1e293b] text-white border border-white/10 rounded-xl font-medium text-lg backdrop-blur-sm transition-all">
                Lihat Demo
              </button>
            </div>
          </motion.div>
        </div>

        {/* Sync Simulation */}
        <div className="max-w-6xl mx-auto">
          <SyncPreview />
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-[#0b1121] relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Kenapa Memilih DISBOT?</h2>
            <p className="text-gray-400">Dibangun untuk kecepatan, keamanan, dan skala besar.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: "Zero Latency", desc: "Instance WebSocket pribadi menjamin pesan terkirim dalam milidetik." },
              { icon: ShieldCheck, title: "Keamanan Akun", desc: "Enkripsi tingkat militer dan isolasi data tenant. Privasi terjamin." },
              { icon: Lock, title: "No-Ban Guarantee", desc: "Algoritma mimicking perilaku manusia mencegah deteksi bot dan banned." },
              { icon: Globe, title: "Multi-Server Support", desc: "Hubungkan unlimited source & target server dengan permission granular." },
              { icon: Activity, title: "Advanced Filters", desc: "Filter pesan berdasarkan keyword, regex, atau role user sebelum mirror." },
              { icon: Server, title: "Media & Embeds", desc: "Support penuh untuk gambar, video, file, dan rich embeds Discord." }
            ].map((feature, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -5 }}
                className="p-6 rounded-2xl bg-[#1e293b]/40 border border-white/5 hover:border-[#5865F2]/30 transition-colors group"
              >
                <div className="w-12 h-12 rounded-lg bg-[#5865F2]/10 flex items-center justify-center mb-4 group-hover:bg-[#5865F2] transition-colors">
                  <feature.icon className="w-6 h-6 text-[#5865F2] group-hover:text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2 group-hover:text-[#5865F2] transition-colors">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 relative overflow-hidden bg-zinc-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
              Paket Langganan
            </h2>
            <p className="text-zinc-400 font-light">Pilih kapasitas mirroring yang sesuai dengan kebutuhan komunitas Anda.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {/* FREE TIER */}
            <PricingCard
              tier="DisBot Trial"
              price="Rp 0"
              quota="1 Mirror Path"
              message="Halo admin DISBOT, saya ingin mencoba Free Trial DisBot."
              features={[
                { text: "1 Mirror Path", included: true },
                { text: "Teruskan Gambar Saja", included: true },
                { text: "Filter Dasar", included: true },
                { text: "Support Managed Bot", included: false },
                { text: "Video & Dokumen", included: false },
                { text: "Prioritas Support", included: false },
              ]}
            />

            {/* STARTER TIER */}
            <PricingCard
              tier="DisBot Starter"
              price="Rp 149.000"
              quota="6 Mirror Paths"
              message="Halo admin DISBOT, saya tertarik berlangganan Paket Starter (Rp 149.000/bln) dengan 6 Mirror Paths."
              features={[
                { text: "6 Mirror Paths", included: true },
                { text: "Teruskan Gambar & Audio", included: true },
                { text: "Support Managed Bot", included: true },
                { text: "Video & Dokumen", included: false },
                { text: "Multi-Akun Support", included: false },
                { text: "Akses API", included: false },
              ]}
            />

            {/* PRO TIER */}
            <PricingCard
              tier="DisBot Pro"
              price="Rp 449.000"
              quota="20 Mirror Paths"
              recommended
              message="Halo admin DISBOT, saya ingin upgrade ke Paket Pro (Rp 449.000/bln) untuk 20 paths dan full media support."
              features={[
                { text: "20 Mirror Paths", included: true },
                { text: "Audio, Video & Dokumen", included: true },
                { text: "Advanced Regex Filters", included: true },
                { text: "3 Akun Discord", included: true },
                { text: "Prioritas Fast Sync", included: true },
                { text: "Dedicated Engine", included: false },
              ]}
            />

            {/* ELITE TIER */}
            <PricingCard
              tier="DisBot Elite"
              price="Rp 999.000"
              quota="100 Mirror Paths*"
              message="Halo admin DISBOT, saya ingin berlangganan Paket Elite (Rp 999.000/bln) untuk 100 Paths dan Dedicated Instance."
              features={[
                { text: "100 Paths (Soft Limit)", included: true },
                { text: "Semua Tipe File", included: true },
                { text: "Dedicated Engine Instance", included: true },
                { text: "Akses Full API", included: true },
                { text: "Prioritas Support 24/7", included: true },
                { text: "Whitelabel Branding", included: true },
              ]}
            />
          </div>

          <div className="text-center mt-12">
            <p className="text-zinc-500 text-xs text-center max-w-2xl mx-auto font-mono">
              *Soft Limit: Kapasitas 100 mirror paths dijamin. Lebih dari itu, kami akan alokasikan resource tambahan sesuai kebutuhan tanpa biaya ekstra (Fair Usage Policy).
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 bg-[#0b1121]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <Logo />
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} DISBOT Engine. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="#" className="text-gray-400 hover:text-white text-sm">Syarat & Ketentuan</Link>
            <Link href="#" className="text-gray-400 hover:text-white text-sm">Kebijakan Privasi</Link>
            <Link href="#" className="text-gray-400 hover:text-white text-sm">Status Server</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
