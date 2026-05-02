import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";

const inter = Inter({ subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  title: "Enigma",
  applicationName: "Enigma",
  description: "Объявления без лишнего шума",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192" },
    ],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Enigma" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0E1114",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const aggressiveSwClear = process.env.NEXT_PUBLIC_AGGRESSIVE_SW_CLEAR === "true";

  return (
    <html lang="ru" className={inter.className} data-theme="dark" suppressHydrationWarning>
      <body className="antialiased text-fg bg-main">
        {aggressiveSwClear ? (
          <Script
            id="unregister-service-workers"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(){try{if(typeof navigator!=="undefined"&&"serviceWorker"in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister();});});}if(typeof caches!=="undefined"){caches.keys().then(function(k){k.forEach(function(n){caches.delete(n);});});}}catch(e){}})();`,
            }}
          />
        ) : null}
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
