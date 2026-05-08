"use client";

import { useChatUnread } from "@/context/chat-unread-context";
import { Capacitor } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const DEV_BADGE_DEBUG = process.env.NODE_ENV === "development";

function badgeDebugLog(event: string, payload?: Record<string, unknown>) {
  if (!DEV_BADGE_DEBUG) return;
  if (payload) {
    console.debug(`[badge-sync][dev] ${event}`, payload);
    return;
  }
  console.debug(`[badge-sync][dev] ${event}`);
}

export function PushNotificationsBootstrap() {
  const router = useRouter();
  const { totalUnread } = useChatUnread();
  const totalUnreadRef = useRef(totalUnread);

  useEffect(() => {
    totalUnreadRef.current = totalUnread;
  }, [totalUnread]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    const cleanup: Array<() => Promise<void> | void> = [];
    let setNativeBadgeCount: ((count: number) => Promise<void>) | null = null;

    const toAppPath = (rawUrl: string): string | null => {
      try {
        const parsed = new URL(rawUrl);
        // Support custom scheme deeplinks, e.g. enigma://auth/confirm -> /auth/confirm
        const customSchemeHostPrefix =
          parsed.protocol === "enigma:" && parsed.host
            ? `/${parsed.host}`
            : "";
        const path =
          `${customSchemeHostPrefix}${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
        return path;
      } catch {
        return null;
      }
    };

    void (async () => {
      try {
        const [{ App }, { PushNotifications }, { Badge }] = await Promise.all([
          import("@capacitor/app"),
          import("@capacitor/push-notifications"),
          import("@capawesome/capacitor-badge"),
        ]);
        if (disposed) return;

        setNativeBadgeCount = async (count: number) => {
          const normalized = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);
          try {
            if (normalized <= 0) {
              badgeDebugLog("Badge.clear()", { fromCount: count });
              await Badge.clear();
            } else {
              badgeDebugLog("Badge.set()", { count: normalized });
              await Badge.set({ count: normalized });
            }
          } catch {
            // noop
          }
        };

        const appUrlOpenHandle = await App.addListener("appUrlOpen", ({ url }) => {
          const path = toAppPath(url);
          if (!path) return;
          router.replace(path);
          router.refresh();
        });
        cleanup.push(() => appUrlOpenHandle.remove());

        const appStateHandle = await App.addListener("appStateChange", ({ isActive }) => {
          badgeDebugLog("appStateChange", { isActive, unread: totalUnreadRef.current });
          document.documentElement.setAttribute(
            "data-native-app-state",
            isActive ? "active" : "background",
          );
          if (!isActive) return;
          if (!setNativeBadgeCount) return;
          void setNativeBadgeCount(totalUnreadRef.current);
        });
        cleanup.push(() => appStateHandle.remove());

        const pushReceiveHandle = await PushNotifications.addListener(
          "pushNotificationReceived",
          async () => {
            badgeDebugLog("pushNotificationReceived", { unread: totalUnreadRef.current });
            // Badge is driven by server-authoritative totalUnread from chat context.
            if (!setNativeBadgeCount) return;
            await setNativeBadgeCount(totalUnreadRef.current);
          },
        );
        cleanup.push(() => pushReceiveHandle.remove());

        const pushActionHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          async (event) => {
            badgeDebugLog("pushNotificationActionPerformed", {
              unread: totalUnreadRef.current,
            });
            if (setNativeBadgeCount) {
              await setNativeBadgeCount(totalUnreadRef.current);
            }
            const maybeUrl = String(event.notification.data?.url ?? "").trim();
            if (!maybeUrl) return;
            const path = toAppPath(maybeUrl);
            if (!path) return;
            router.replace(path);
            router.refresh();
          },
        );
        cleanup.push(() => pushActionHandle.remove());

        try {
          const perm = await PushNotifications.requestPermissions();
          if (perm.receive === "granted") {
            await PushNotifications.register();
          }
        } catch (error) {
          console.error("[push-bootstrap] request/register failed", error);
        }

        try {
          const badgePerm = await Badge.checkPermissions();
          if (badgePerm.display !== "granted") {
            await Badge.requestPermissions();
          }
        } catch (error) {
          console.error("[push-bootstrap] badge permissions failed", error);
        }

        if (setNativeBadgeCount) {
          try {
            await setNativeBadgeCount(totalUnreadRef.current);
          } catch (error) {
            console.error("[push-bootstrap] initial badge sync failed", error);
          }
        }
      } catch (error) {
        console.error("[push-bootstrap] native bootstrap failed", error);
      }
    })();

    return () => {
      disposed = true;
      for (const stop of cleanup) {
        try {
          void stop();
        } catch {
          // noop
        }
      }
    };
  }, [router]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    badgeDebugLog("totalUnread:changed", { totalUnread });
    let cancelled = false;
    void (async () => {
      try {
        const { Badge } = await import("@capawesome/capacitor-badge");
        if (cancelled) return;
        const normalized = Math.max(
          0,
          Number.isFinite(totalUnread) ? Math.floor(totalUnread) : 0,
        );
        if (normalized <= 0) {
          await Badge.clear();
        } else {
          await Badge.set({ count: normalized });
        }
      } catch {
        // noop
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [totalUnread]);

  return null;
}

export default PushNotificationsBootstrap;
