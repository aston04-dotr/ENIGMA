import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "online.enigma.app",
  appName: "Enigma",
  // Local bundled UI from Next static export (`out/`).
  webDir: "out",
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
