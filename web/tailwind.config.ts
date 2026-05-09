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
        listingSheetUp: {
          "0%": { opacity: "0", transform: "translate3d(0,100%,0)" },
          "100%": { opacity: "1", transform: "translate3d(0,0,0)" },
        },
        listingBackdropIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        chatSheetUp: {
          "0%": { opacity: "0", transform: "translate3d(0,18px,0)" },
          "100%": { opacity: "1", transform: "translate3d(0,0,0)" },
        },
      },
      animation: {
        receiptPop: "receiptPop 0.2s ease-out both",
        messageAppear: "messageAppear 0.15s ease-out both",
        chatSheetUp: "chatSheetUp 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        listingSheetUp: "listingSheetUp 0.36s cubic-bezier(0.22,1,0.36,1) both",
        listingBackdropIn: "listingBackdropIn 0.28s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
