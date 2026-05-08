"use client";

import { useChatUnread } from "@/context/chat-unread-context";
import { useEffect, useRef } from "react";

const DEV_BADGE_DEBUG = process.env.NODE_ENV === "development";

function badgeDebugLog(event: string, payload?: Record<string, unknown>) {
  if (!DEV_BADGE_DEBUG) return;
  if (payload) {
    console.debug(`[badge-sync][web] ${event}`, payload);
    return;
  }
  console.debug(`[badge-sync][web] ${event}`);
}

async function setWebAppBadgeCount(count: number): Promise<void> {
  if (typeof navigator === "undefined") return;
  const normalized = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);
  try {
    if ("clearAppBadge" in navigator && normalized <= 0) {
      await navigator.clearAppBadge();
      badgeDebugLog("clearAppBadge", {});
      return;
    }
    if ("setAppBadge" in navigator && normalized > 0) {
      await navigator.setAppBadge(normalized);
      badgeDebugLog("setAppBadge", { count: normalized });
    }
  } catch {
    /* Badging API optional; ignore */
  }
}

export function PushNotificationsBootstrap() {
  const { totalUnread } = useChatUnread();
  const totalUnreadRef = useRef(totalUnread);

  useEffect(() => {
    totalUnreadRef.current = totalUnread;
  }, [totalUnread]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("setAppBadge" in navigator) && !("clearAppBadge" in navigator)) return;

    const syncVisible = () => {
      void setWebAppBadgeCount(totalUnreadRef.current);
    };

    syncVisible();

    const onVisibility = () => {
      if (document.visibilityState === "visible") syncVisible();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", syncVisible);
    window.addEventListener("pageshow", syncVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", syncVisible);
      window.removeEventListener("pageshow", syncVisible);
    };
  }, []);

  useEffect(() => {
    void setWebAppBadgeCount(totalUnread);
  }, [totalUnread]);

  return null;
}

export default PushNotificationsBootstrap;
