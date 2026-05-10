"use client";

import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider } from "@/context/theme-context";
import { ViewModeProvider } from "@/context/view-mode-context";
import { ChatUnreadProvider } from "@/context/chat-unread-context";
import { ViewModeLayout } from "@/components/ViewModeLayout";
import { AuthDebugTracker } from "@/components/AuthDebugTracker";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AppVersionCheck } from "@/components/AppVersionCheck";
import { DevCacheClear } from "@/components/DevCacheClear";
import { VisualViewportBridge } from "@/components/VisualViewportBridge";
import { EnigmaStandaloneRootAttrs } from "@/components/EnigmaStandaloneRootAttrs";
import { InstallPrompt } from "@/components/InstallPrompt";
import { StandaloneInstalledToast } from "@/components/StandaloneInstalledToast";
import { SaveEnigmaPrompt } from "@/components/SaveEnigmaPrompt";
import { OfflineGate } from "@/components/OfflineGate";
import { GlobalErrorHandlers } from "@/components/GlobalErrorHandlers";
import { PushNotificationsBootstrap } from "@/components/PushNotificationsBootstrap";
import { GuestPersistenceBootstrap } from "@/components/GuestPersistenceBootstrap";
import { useEffect } from "react";

const HYDRATION_RECOVERY_FLAG = "enigma:hydration-recovery-required";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      const needsRecovery =
        window.localStorage.getItem(HYDRATION_RECOVERY_FLAG) === "1";
      if (!needsRecovery) return;
      window.localStorage.removeItem(HYDRATION_RECOVERY_FLAG);
    } catch {
      // noop
    }
  }, []);

  return (
    <div className="min-h-screen bg-main">
      <ServiceWorkerRegister />
      <AppVersionCheck />
      <DevCacheClear />
      <GuestPersistenceBootstrap />
      <VisualViewportBridge />
      <EnigmaStandaloneRootAttrs />
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
                <StandaloneInstalledToast />
                <SaveEnigmaPrompt />
              </OfflineGate>
            </ChatUnreadProvider>
          </ViewModeProvider>
        </AuthProvider>
      </ThemeProvider>
    </div>
  );
}
