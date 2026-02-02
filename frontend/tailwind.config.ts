import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fulcrum-inspired palette (light theme)
        primary: {
          DEFAULT: "#1a1a1b",
          light: "#3a3a3b",
          50: "#f8f7f5",
          100: "#f0efed",
          200: "#e0dfdd",
          300: "#c0bfbd",
          400: "#8a8a86",
          500: "#4a4a48",
          600: "#3a3a3b",
          700: "#2a2a2b",
          800: "#1a1a1b",
          900: "#0a0a0b",
        },
        accent: {
          DEFAULT: "#7a6a42",
          dim: "#5c4f32",
          light: "#9a8550",
          50: "#f8f6f1",
          100: "#f0ebe0",
          200: "#e0d6c2",
          300: "#c4b494",
          400: "#9a8550",
          500: "#7a6a42",
          600: "#5c4f32",
          700: "#453b25",
          800: "#2e2819",
          900: "#1a170e",
        },
        // Surface colors (light theme)
        surface: {
          white: "#ffffff",
          "off-white": "#fafaf9",
          50: "#f8f7f5",
          100: "#f0efed",
          200: "#e0dfdd",
          300: "#c0bfbd",
          400: "#8a8a86",
          500: "#6b6b66",
          600: "#4a4a48",
          700: "#2a2a2b",
          800: "#1a1a1b",
          900: "#0a0a0b",
          black: "#0a0a0b",
        },
      },
      fontFamily: {
        display: ["Newsreader", "Georgia", "serif"],
        body: ["Newsreader", "Georgia", "serif"],
        mono: ["JetBrains Mono", "SF Mono", "monospace"],
      },
      letterSpacing: {
        "widest-plus": "0.3em",
      },
    },
  },
  plugins: [],
};
export default config;
