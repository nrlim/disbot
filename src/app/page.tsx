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

const PricingCard = ({ tier, price, features, recommended = false }: { tier: string, price: string, features: string[], recommended?: boolean }) => (
  <motion.div
    whileHover={{ y: -10 }}
    className={cn(
      "relative p-8 rounded-2xl border flex flex-col h-full bg-[#1e293b]/50 backdrop-blur-sm",
      recommended ? "border-[#5865F2] shadow-2xl shadow-[#5865F2]/10" : "border-white/10"
    )}
  >
    {recommended && (
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#5865F2] to-[#00D1FF] text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
        Paling Populer
      </div>
    )}
    <h3 className="text-xl font-medium text-gray-300 mb-2">{tier}</h3>
    <div className="mb-6">
      <span className="text-3xl font-bold text-white">{price}</span>
      <span className="text-gray-500 text-sm ml-1">/bln</span>
    </div>

    <ul className="space-y-4 mb-8 flex-1">
      {features.map((feat, i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
          <Check className="w-5 h-5 text-[#00D1FF] shrink-0" />
          <span>{feat}</span>
        </li>
      ))}
    </ul>

    <button className={cn(
      "w-full py-3 rounded-lg font-medium transition-all",
      recommended ? "bg-[#5865F2] hover:bg-[#4752c4] text-white shadow-lg" : "bg-white/5 hover:bg-white/10 text-white border border-white/5"
    )}>
      Pilih Paket
    </button>
  </motion.div>
);

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
      <section id="pricing" className="py-24 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[600px] bg-[#5865F2]/5 rounded-full blur-[100px] -z-10" />

        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <SectionHeading center>Paket Langganan</SectionHeading>
            <p className="text-gray-400">Investasi terbaik untuk komunitas crypto Anda.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard
              tier="DISBOT Starter"
              price="Rp 149.000"
              features={[
                "2 Mirror Paths",
                "Instant Real-Time Sync",
                "Basic Keyword Filter",
                "Media & Embeds Support",
                "Standard Discord Support",
                "99.9% Uptime SLA"
              ]}
            />
            <PricingCard
              tier="DISBOT Pro"
              price="Rp 449.000"
              recommended
              features={[
                "15 Mirror Paths",
                "Instant Real-Time Sync",
                "Advanced Regex Filters",
                "Auto-Translation",
                "Priority Email Support",
                "Keamanan Akun & No-Ban"
              ]}
            />
            <PricingCard
              tier="DISBOT Elite"
              price="Rp 999.000"
              features={[
                "Unlimited Mirror Paths",
                "Instant Real-Time Sync",
                "Custom Branding / Whitelabel",
                "Dedicated Engine Instance",
                "Priority 24/7 Live Chat",
                "Akses Full API"
              ]}
            />
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
