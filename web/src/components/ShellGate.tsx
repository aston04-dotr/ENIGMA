"use client";

import { useAuth } from "@/context/auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

function isAuthRoute(path: string): boolean {
  return path === "/login" || path === "/offline" || path.startsWith("/auth");
}

export function ShellGate({ children }: { children: React.ReactNode }) {
  const { session, loading, authResolved, needsPhone, needsName } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!authResolved) return;
    if (loading) return;
    if (!session) return;
    if (isAuthRoute(path)) return;
    if (needsPhone) {
      router.replace("/auth/phone");
      return;
    }
    if (needsName) {
      router.replace("/auth/profile-setup");
    }
  }, [session, loading, authResolved, needsPhone, needsName, path, router]);

  return <>{children}</>;
}
