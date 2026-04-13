"use client";

import { useEffect } from "react";

/** Только dev: сброс Cache Storage, чтобы не залипал сломанный SW/статик. */
export function DevCacheClear() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined" || !("caches" in window)) return;

    void caches.keys().then((names) => {
      names.forEach((name) => {
        void caches.delete(name);
      });
    });
  }, []);

  return null;
}
