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
        accent: {
          DEFAULT: "#0F6E56",
          dim:     "#00695C",
          dark:    "#00695C",
          light:   "#9FE1CB",
          wash:    "#E1F5EE",
          deepest: "#04342C",
        },
        surface: {
          50:  "#FAFAFA",
          100: "#F5F5F5",
          200: "#E8E8E8",
          300: "#D0D0D0",
          400: "#909090",
          500: "#777777",
          600: "#555555",
          700: "#3A3A3A",
          800: "#2A2A2A",
          900: "#1A1A1A",
        },
        warning: {
          fill: "#FCEBEB",
          text: "#A32D2D",
        },
      },
      fontFamily: {
        display: ["Georgia", "Times New Roman", "serif"],
        body:    ["Calibri", "var(--font-lato)", "Arial", "sans-serif"],
        mono:    ["var(--font-jetbrains-mono)", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        none:    "0",
        sm:      "4px",
        DEFAULT: "4px",
        md:      "6px",
        lg:      "6px",
        xl:      "8px",
        "2xl":   "10px",
        full:    "9999px",
        pill:    "20px",
      },
      letterSpacing: {
        "widest-plus": "0.15em",
        brand:         "0.1em",
      },
      fontSize: {
        "2xs": ["9px", { lineHeight: "1.4" }],
      },
    },
  },
  plugins: [],
};
export default config;
