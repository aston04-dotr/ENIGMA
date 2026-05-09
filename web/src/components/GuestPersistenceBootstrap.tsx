"use client";

import { getOrCreateGuestIdentity } from "@/lib/guestIdentity";
import { getGuestRuntimeFlags } from "@/lib/guestRuntimeFlags";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const LAST_ROUTE_KEY = "enigma:pwa:last-route";
const LAST_ROUTE_AT_KEY = "enigma:pwa:last-route-at";
const LAST_ROUTE_TTL_MS = 24 * 60 * 60 * 1000;
const GUEST_BROWSE_ONLY_KEY = "enigma:guest:browse-only";

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function GuestPersistenceBootstrap() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const identity = getOrCreateGuestIdentity();
    void (async () => {
      const flags = await getGuestRuntimeFlags({ guestUuid: identity.guest_uuid });
      try {
        window.localStorage.setItem(
          GUEST_BROWSE_ONLY_KEY,
          flags.guest_kill_switch || !flags.guest_chat_enabled ? "1" : "0",
        );
      } catch {
        // ignore
      }
      if (!flags.guest_presence_enabled) return;
      // supabase.rpc() returns a PostgrestBuilder (thenable), not a Promise — нельзя .catch().
      try {
        const { error } = await supabase.rpc(
          // генотип Database.Functions ещё не содержит guest RPC после миграций
          "register_guest_presence" as never,
          {
            p_guest_uuid: identity.guest_uuid,
            p_fingerprint: identity.fingerprint,
          },
        );
        if (error && process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.warn("register_guest_presence", error.message);
        }
      } catch {
        // RPC недоступен или сеть
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saveRoute = () => {
      const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (!route.startsWith("/")) return;
      try {
        window.localStorage.setItem(LAST_ROUTE_KEY, route);
        window.localStorage.setItem(LAST_ROUTE_AT_KEY, String(Date.now()));
      } catch {
        // ignore
      }
    };
    saveRoute();
    window.addEventListener("pagehide", saveRoute);
    window.addEventListener("beforeunload", saveRoute);
    document.addEventListener("visibilitychange", saveRoute);
    return () => {
      window.removeEventListener("pagehide", saveRoute);
      window.removeEventListener("beforeunload", saveRoute);
      document.removeEventListener("visibilitychange", saveRoute);
    };
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isStandaloneMode()) return;
    if (window.location.pathname !== "/") return;
    try {
      const lastRoute = String(window.localStorage.getItem(LAST_ROUTE_KEY) ?? "").trim();
      const lastRouteAt = Number(window.localStorage.getItem(LAST_ROUTE_AT_KEY) ?? "0");
      if (!lastRoute.startsWith("/") || lastRoute === "/") return;
      if (!Number.isFinite(lastRouteAt) || Date.now() - lastRouteAt > LAST_ROUTE_TTL_MS) return;
      router.replace(lastRoute);
    } catch {
      // ignore
    }
  }, [router]);

  return null;
}
