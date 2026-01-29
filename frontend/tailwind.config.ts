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
        // Litmus pH-inspired palette
        litmus: {
          'acid-red': '#E63946',
          'acid-orange': '#F4A261',
          'neutral-yellow': '#E9C46A',
          'neutral-green': '#8AB17D',
          'base-teal': '#2A9D8F',
          'base-blue': '#264653',
        },
        // Core colors
        primary: {
          DEFAULT: '#264653',
          light: '#2A9D8F',
          50: '#E8F4F3',
          100: '#D1E9E7',
          200: '#A3D3CF',
          300: '#75BDB7',
          400: '#47A79F',
          500: '#2A9D8F',
          600: '#237E73',
          700: '#1B5F57',
          800: '#264653',
          900: '#1A302A',
        },
        accent: {
          DEFAULT: '#E63946',
          soft: '#F4A261',
          50: '#FEF2F2',
          100: '#FDE8E9',
          200: '#FABCC0',
          300: '#F59097',
          400: '#ED646E',
          500: '#E63946',
          600: '#CF1D2A',
          700: '#A81621',
          800: '#811018',
          900: '#5A0B10',
        },
        // Neutral scale
        surface: {
          white: '#FDFCFB',
          'off-white': '#F7F5F3',
          100: '#EDEAE7',
          200: '#D4CFC9',
          300: '#9A9590',
          400: '#6B6560',
          500: '#3D3835',
          black: '#1A1614',
        },
      },
      fontFamily: {
        display: ['Instrument Serif', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'SF Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
