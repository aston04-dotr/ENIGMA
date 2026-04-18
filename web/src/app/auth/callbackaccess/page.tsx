"use client";

import { useEffect } from "react";

export default function CallbackAccessRedirectPage() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const target = `/auth/callback${url.search}${url.hash}`;
    window.location.replace(target);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-main text-sm opacity-60">
      Перенаправление на страницу входа...
    </div>
  );
}
