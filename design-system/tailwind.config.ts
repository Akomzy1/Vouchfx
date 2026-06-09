import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:               "#0B0F14",
        surface:          "#151B23",
        "surface-elevated": "#1B232D",
        border:           "#222B36",
        primary:          "#14B8A6",
        "text-primary":   "#E6EDF3",
        "text-secondary": "#8B98A5",
        "text-muted":     "#5B6772",
        profit:           "#22C55E",
        loss:             "#EF4444",
        warning:          "#F59E0B",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["ui-monospace", "Cascadia Code", "Fira Code", "Consolas", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.75rem",
        sm:   "0.375rem",
        lg:   "1rem",
        full: "9999px",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
