"use client";

import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider } from "@/context/theme-context";
import { DevCacheClear } from "@/components/DevCacheClear";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OfflineGate } from "@/components/OfflineGate";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DevCacheClear />
      <ServiceWorkerRegister />
      <ThemeProvider>
        <AuthProvider>
          <OfflineGate>
            {children}
            <InstallPrompt />
          </OfflineGate>
        </AuthProvider>
      </ThemeProvider>
    </>
  );
}
