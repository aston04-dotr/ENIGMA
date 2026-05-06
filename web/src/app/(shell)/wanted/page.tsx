"use client";

import { LandingScreen } from "@/components/LandingScreen";
import { FeedPage } from "@/app/(shell)/FeedScreen";
import { useAuth } from "@/context/auth-context";

export default function WantedFeedPage() {
  const { session, loading } = useAuth();

  if (loading) {
    return <LandingScreen />;
  }

  return (
    <div className="min-h-screen bg-main">
      <FeedPage session={session} />
    </div>
  );
}
