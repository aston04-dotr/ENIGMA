"use client";

import { useAuth } from "@/context/auth-context";
import { useOnline } from "@/hooks/useOnline";
import { OfflineUi } from "@/components/OfflineUi";
import { useEffect, useState } from "react";

export function OfflineGate({ children }: { children: React.ReactNode }) {
  const { retryBootstrap } = useAuth();
  const online = useOnline(() => {
    retryBootstrap({ fromOnline: true });
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // children показываем ВСЕГДА, OfflineUi только если !online после hydrated
  return (
    <div className="min-h-screen">
      {children}

      {hydrated && !online && (
        <div className="fixed inset-0 z-50">
          <OfflineUi />
        </div>
      )}
    </div>
  );
}
