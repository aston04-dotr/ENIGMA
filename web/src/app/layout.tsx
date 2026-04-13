import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";

const inter = Inter({ subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  title: "Enigma",
  description: "Объявления без лишнего шума",
  manifest: "/manifest.json",
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
  return (
    <html lang="ru" className={inter.className} data-theme="dark" suppressHydrationWarning>
      <body className="antialiased text-fg bg-main">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
