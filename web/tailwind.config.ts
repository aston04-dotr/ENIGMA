import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        main: "var(--color-main)",
        elevated: "var(--color-elevated)",
        "elev-2": "var(--color-elev-2)",
        fg: "var(--color-fg)",
        muted: "var(--color-muted)",
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
        },
        line: "var(--color-line)",
        danger: "var(--color-danger)",
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        soft: "var(--shadow-card)",
        nav: "0 -4px 24px rgba(0,0,0,0.25)",
      },
      transitionDuration: {
        ui: "200ms",
      },
      keyframes: {
        receiptPop: {
          "0%": { opacity: "0.65", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        receiptPop: "receiptPop 0.18s ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
