import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DISBOT - Premium Discord Mirroring & Sync Engine",
  description: "Professional Discord mirroring for crypto communities. Zero latency, 100% account safety, and instant sync. The trusted choice for elite traders.",
  openGraph: {
    title: "DISBOT - Premium Discord Mirroring Engine",
    description: "Automate your Discord server with the #1 professional mirroring tool. Safe, fast, and reliable.",
    type: "website",
  },
};

import { Providers } from "@/components/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.variable} antialiased bg-dark text-white font-inter`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
