import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1A56DB", // Deep Blue
        secondary: "#4B5563", // Soft Slate
        background: "#F9FAFB", // Light Grey
        surface: "#FFFFFF", // Pure White
        foreground: "#111827", // Dark Grey
        muted: "#6B7280", // Medium Grey
        border: "#E5E7EB", // Light Border
      },
      fontFamily: {
        inter: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
