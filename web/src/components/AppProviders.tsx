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
import { PushNotificationsBootstrap } from "@/components/PushNotificationsBootstrap";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <UnregisterServiceWorkers />
      <DevCacheClear />
      <AuthDebugTracker />
      <ServiceWorkerRegister />
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
