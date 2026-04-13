"use client";

import { useEffect } from "react";

const ENABLE_SW = process.env.NEXT_PUBLIC_ENABLE_SW === "true";

/** SW только в production и при NEXT_PUBLIC_ENABLE_SW=true */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !ENABLE_SW) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      console.log("SW UPDATED → RELOAD");
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.error("SW REGISTER ERROR", e);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
    }

    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
