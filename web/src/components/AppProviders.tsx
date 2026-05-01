"use client";

import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider } from "@/context/theme-context";
import { ViewModeProvider } from "@/context/view-mode-context";
import { ChatUnreadProvider } from "@/context/chat-unread-context";
import { ViewModeLayout } from "@/components/ViewModeLayout";
import { AuthDebugTracker } from "@/components/AuthDebugTracker";
import { UnregisterServiceWorkers } from "@/components/UnregisterServiceWorkers";
import { DevCacheClear } from "@/components/DevCacheClear";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OfflineGate } from "@/components/OfflineGate";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AppVersionCheck } from "@/components/AppVersionCheck";
import { GlobalErrorHandlers } from "@/components/GlobalErrorHandlers";
import { PushNotificationsBootstrap } from "@/components/PushNotificationsBootstrap";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useEffect } from "react";

const HYDRATION_RECOVERY_FLAG = "enigma:hydration-recovery-required";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const hasMounted = useHasMounted();

  useEffect(() => {
    if (!hasMounted) return;
    try {
      const needsRecovery =
        window.localStorage.getItem(HYDRATION_RECOVERY_FLAG) === "1";
      if (!needsRecovery) return;
      const keys = Object.keys(window.localStorage);
      for (const key of keys) {
        if (key.startsWith("sb-") || key.includes("supabase.auth")) {
          window.localStorage.removeItem(key);
        }
      }
      window.localStorage.removeItem(HYDRATION_RECOVERY_FLAG);
    } catch {
      // noop
    }
  }, [hasMounted]);

  if (!hasMounted) return null;

  return (
    <>
      <UnregisterServiceWorkers />
      <DevCacheClear />
      <AuthDebugTracker />
      <ServiceWorkerRegister />
      <AppVersionCheck />
      <GlobalErrorHandlers />
      <ThemeProvider>
        <AuthProvider>
          <ViewModeProvider>
            <ChatUnreadProvider>
              <PushNotificationsBootstrap />
              <OfflineGate>
                <ViewModeLayout>{children}</ViewModeLayout>
                <InstallPrompt />
              </OfflineGate>
            </ChatUnreadProvider>
          </ViewModeProvider>
        </AuthProvider>
      </ThemeProvider>
    </>
  );
}
