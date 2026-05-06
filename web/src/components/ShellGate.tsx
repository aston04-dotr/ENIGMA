"use client";

import { LandingScreen } from "@/components/LandingScreen";
import { useAuth } from "@/context/auth-context";

export function ShellGate({ children }: { children: React.ReactNode }) {
  const { session, loading, authResolved, profileLoading } = useAuth();

  const isResolving =
    loading || !authResolved || (Boolean(session?.user) && profileLoading);

  if (isResolving) {
    return (
      <div className="min-h-[100svh] bg-main">
        <LandingScreen minimal />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-[100svh] bg-main">
        <LandingScreen />
      </div>
    );
  }

  return <>{children}</>;
}
