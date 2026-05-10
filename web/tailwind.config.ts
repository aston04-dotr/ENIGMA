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
          "0%": { opacity: "0.88", transform: "translateY(3px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        chatBadgePulseOnce: {
          "0%, 100%": { transform: "scale(1)" },
          "45%": { transform: "scale(1.065)" },
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
        promoVipGlow: {
          "0%, 100%": {
            boxShadow:
              "0 0 14px rgba(255,200,112,0.52), inset 0 1px 0 rgba(255,235,205,0.12)",
          },
          "50%": {
            boxShadow:
              "0 0 28px rgba(255,218,155,0.78), inset 0 1px 0 rgba(255,245,215,0.18)",
          },
        },
        promoBoostMotion: {
          "0%, 100%": {
            boxShadow: "0 0 12px rgba(56,189,248,0.44)",
          },
          "50%": {
            boxShadow: "0 0 25px rgba(125,211,252,0.62)",
          },
        },
      },
      animation: {
        receiptPop: "receiptPop 0.2s ease-out both",
        messageAppear: "messageAppear 0.22s cubic-bezier(0.22, 1, 0.36, 1) both",
        chatBadgePulseOnce:
          "chatBadgePulseOnce 0.44s cubic-bezier(0.22, 1, 0.36, 1) 1 both",
        chatSheetUp: "chatSheetUp 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        listingSheetUp: "listingSheetUp 0.36s cubic-bezier(0.22,1,0.36,1) both",
        listingBackdropIn: "listingBackdropIn 0.28s ease-out both",
        promoVipGlow: "promoVipGlow 2.85s ease-in-out infinite",
        promoBoostMotion: "promoBoostMotion 1.55s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
