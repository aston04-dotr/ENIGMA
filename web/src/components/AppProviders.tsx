"use client";

import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider } from "@/context/theme-context";
import { ViewModeProvider } from "@/context/view-mode-context";
import { ChatUnreadProvider } from "@/context/chat-unread-context";
import { ViewModeLayout } from "@/components/ViewModeLayout";
import { LandingScreen } from "@/components/LandingScreen";
import { AuthDebugTracker } from "@/components/AuthDebugTracker";
import { UnregisterServiceWorkers } from "@/components/UnregisterServiceWorkers";
import { DevCacheClear } from "@/components/DevCacheClear";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OfflineGate } from "@/components/OfflineGate";
import { GlobalErrorHandlers } from "@/components/GlobalErrorHandlers";
import { PushNotificationsBootstrap } from "@/components/PushNotificationsBootstrap";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useEffect } from "react";

const HYDRATION_RECOVERY_FLAG = "enigma:hydration-recovery-required";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const hasMounted = useHasMounted();

  useEffect(() => {
    const t = window.setTimeout(() => {
      console.log("FORCE SAFE RENDER");
    }, 2000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    try {
      const needsRecovery =
        window.localStorage.getItem(HYDRATION_RECOVERY_FLAG) === "1";
      if (!needsRecovery) return;
      // Не трогаем auth-хранилище Supabase: иначе mobile/PWA теряет сессию после reload/update.
      window.localStorage.removeItem(HYDRATION_RECOVERY_FLAG);
    } catch {
      // noop
    }
  }, [hasMounted]);

  if (!hasMounted) {
    return (
      <div className="min-h-screen bg-main">
        <LandingScreen minimal />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-main">
      <UnregisterServiceWorkers />
      <DevCacheClear />
      <AuthDebugTracker />
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
    </div>
  );
}
