import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "online.enigma.app",
  appName: "Enigma",
  webDir: "capacitor-www",
  server: {
    // Production model: native shell + hosted Next.js app.
    url: process.env.CAP_SERVER_URL || "https://enigma-app.online",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: ["enigma-app.online", "*.supabase.co", "*.supabase.in"],
  },
  ios: {
    scheme: "enigma",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0b0f14",
      showSpinner: false,
      androidSpinnerStyle: "small",
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#0b0f14",
    },
  },
};

export default config;
