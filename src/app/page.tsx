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
  Menu,
  ArrowRight,
  Server,
  Activity,
  Lock
} from "lucide-react";
import PricingSection from "@/components/PricingSection";
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
      className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200"
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Logo />

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-8">
          <Link href="#features" className="text-sm font-medium text-gray-600 hover:text-primary transition-colors">Fitur</Link>
          <Link href="#pricing" className="text-sm font-medium text-gray-600 hover:text-primary transition-colors">Harga</Link>
          <LoginButton />
        </div>

        {/* Mobile Toggle */}
        <button onClick={() => setIsOpen(!isOpen)} className="md:hidden text-gray-600">
          <Menu />
        </button>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-gray-200 p-4 space-y-4 shadow-lg">
          <Link href="#features" className="block text-gray-600 hover:text-primary font-medium">Fitur</Link>
          <Link href="#pricing" className="block text-gray-600 hover:text-primary font-medium">Harga</Link>
          <Link href="#faq" className="block text-gray-600 hover:text-primary font-medium">FAQ</Link>
          <LoginButton className="w-full" />
        </div>
      )}
    </motion.nav>
  );
};

const SectionHeading = ({ children, center = true }: { children: React.ReactNode, center?: boolean }) => (
  <h2 className={cn("text-3xl md:text-5xl font-bold tracking-tight mb-6 text-gray-900", center && "text-center")}>
    {children}
  </h2>
);



export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-900 selection:bg-primary/20 selection:text-primary">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden bg-gradient-to-b from-blue-50/50 via-white to-white">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-blue-200/20 rounded-full blur-[120px] -z-10" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-cyan-200/20 rounded-full blur-[100px] -z-10" />

        <div className="max-w-7xl mx-auto text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight text-gray-900">
              DISBOT: Mirroring Channel <br />
              <span className="text-primary">Real-Time Tanpa Delay!</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-10 leading-relaxed font-medium">
              Duplikasi informasi, sinyal crypto, dan pengumuman antar server secara otomatis.
              Satu sumber, banyak tujuan. Kelola komunitas Anda dengan efisiensi level tinggi.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-lg shadow-xl shadow-primary/25 transition-all active:scale-95 flex items-center justify-center gap-2">
                Mulai Sekarang <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Sync Simulation */}
        <div className="max-w-6xl mx-auto">
          <SyncPreview />
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-gray-50 relative border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4 text-gray-900">Kenapa Memilih DISBOT?</h2>
            <p className="text-gray-500 text-lg">Dibangun untuk kecepatan, keamanan, dan skala besar.</p>
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
                className="p-8 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all group"
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary transition-colors">
                  <feature.icon className="w-7 h-7 text-primary group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <PricingSection />

      {/* Footer */}
      <footer className="py-12 border-t border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <Logo />
          <p className="text-gray-500 text-sm font-medium">
            © {new Date().getFullYear()} DISBOT Engine. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="#" className="text-gray-500 hover:text-primary text-sm font-medium transition-colors">Syarat & Ketentuan</Link>
            <Link href="#" className="text-gray-500 hover:text-primary text-sm font-medium transition-colors">Kebijakan Privasi</Link>
            <Link href="#" className="text-gray-500 hover:text-primary text-sm font-medium transition-colors">Status Server</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
