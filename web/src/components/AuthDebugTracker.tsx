"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { subscribeEnigmaAuthSingleton } from "@/lib/supabaseAuthSingleton";

/** В проде отключено: monkey-patch history + poll 400ms дают лаги после входа. */
export function AuthDebugTracker() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const pathname = usePathname();
  const lastHrefRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const logLocation = (reason: string) => {
      console.log("[debug][location]", reason, window.location.href);
    };

    logLocation("mount");

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = function (...args) {
      console.trace("[debug][history.pushState]", window.location.href, args);
      return originalPushState(...args);
    };

    window.history.replaceState = function (...args) {
      console.trace("[debug][history.replaceState]", window.location.href, args);
      return originalReplaceState(...args);
    };

    const onPopState = () => {
      console.trace("[debug][popstate]", window.location.href);
    };

    const onHashChange = () => {
      logLocation("hashchange");
    };

    const onBeforeUnload = () => {
      console.log("[debug][beforeunload]", window.location.href);
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    const poll = window.setInterval(() => {
      const href = window.location.href;
      if (href !== lastHrefRef.current) {
        lastHrefRef.current = href;
        logLocation("poll(href-changed)");
      }
    }, 400);

    return () => {
      window.clearInterval(poll);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  useEffect(() => {
    console.log("[debug][next-pathname]", pathname, "window=", typeof window !== "undefined" ? window.location.href : "");
  }, [pathname]);

  useEffect(() => {
    return subscribeEnigmaAuthSingleton((event, session) => {
      console.log("[debug][auth event]", event, typeof window !== "undefined" ? window.location.href : "", {
        userId: session?.user?.id ?? null,
        email: session?.user?.email ?? null,
        hasSession: Boolean(session),
      });
    });
  }, []);

  return null;
}
