"use client";

import { LandingScreen } from "@/components/LandingScreen";
import { useAuth } from "@/context/auth-context";
import { FeedPage } from "./FeedScreen";
import { useEffect, useState } from "react";

export default function HomePageClient() {
  const { session, loading, authResolved } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading || !authResolved) {
    return <LandingScreen />;
  }

  return (
    <div className="min-h-[100svh] bg-main">
      <FeedPage session={session} />
    </div>
  );
}
