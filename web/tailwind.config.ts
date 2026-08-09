import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: "#1c1c1e",
          elevated: "#1f1f1f",
          surface: "#232324",
          muted: "#444444",
        },
        text: {
          primary: "#ededed",
        },
        accent: {
          DEFAULT: "#57a6f4",
          light: "#75b9fd",
        },
        error: {
          DEFAULT: "#f76979",
          bright: "#ff453a",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Helvetica Neue",
          "sans-serif",
        ],
        display: [
          "var(--font-figtree)",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      animation: {
        "fade-down": "fadeDown 0.5s ease-out forwards",
        "card-rise": "cardRise 0.6s ease-out forwards",
        "fade-slide-down": "fadeSlideDown 0.45s ease-out forwards",
        "fade-slide-up": "fadeSlideUp 0.45s ease-out forwards",
      },
      keyframes: {
        fadeDown: {
          "0%": { opacity: "0", transform: "translateY(-12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        cardRise: {
          "0%": { opacity: "0", transform: "translateY(24px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        fadeSlideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeSlideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
