
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["zlib-sync", "utf-8-validate", "bufferutil", "discord.js"],
  // We explicitly disable turbopack warning if we end up needing webpack specific stuff, 
  // but for now let's try to let Next.js handle it via serverExternalPackages
};

export default nextConfig;
