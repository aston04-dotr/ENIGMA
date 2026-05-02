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
        muted: "rgb(var(--muted))",
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
          "0%": { opacity: "0.85", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        messageAppear: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        receiptPop: "receiptPop 0.2s ease-out both",
        messageAppear: "messageAppear 0.15s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
