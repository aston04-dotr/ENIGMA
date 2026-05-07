"use client";

import { LandingScreen } from "@/components/LandingScreen";
import { useAuth } from "@/context/auth-context";
import { usePathname } from "next/navigation";

function isPublicGuestRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/wanted") return true;
  if (pathname.startsWith("/listing/")) return true;
  return false;
}

function isProtectedRoute(pathname: string): boolean {
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return true;
  if (pathname === "/create" || pathname.startsWith("/create/")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  if (pathname === "/payment" || pathname.startsWith("/payment/")) return true;
  if (pathname.startsWith("/listing/edit/")) return true;
  return false;
}

export function ShellGate({ children }: { children: React.ReactNode }) {
  const { session, loading, authResolved, profileLoading } = useAuth();
  const pathname = usePathname();

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
    if (isPublicGuestRoute(pathname)) {
      return <>{children}</>;
    }
    if (isProtectedRoute(pathname)) {
      return (
        <div className="min-h-[100svh] bg-main">
          <LandingScreen />
        </div>
      );
    }
    return (
      <div className="min-h-[100svh] bg-main">
        <LandingScreen />
      </div>
    );
  }

  return <>{children}</>;
}
