"use client";

import { LandingScreen } from "@/components/LandingScreen";
import { FeedPage } from "@/app/(shell)/FeedScreen";
import { useAuth } from "@/context/auth-context";

export default function WantedFeedPage() {
  const { session, loading } = useAuth();

  if (loading && !session?.user) {
    return <LandingScreen />;
  }

  if (!session?.user) {
    return <LandingScreen />;
  }

  return (
    <div className="min-h-screen bg-main">
      <FeedPage session={session} feedVariant="seeking" />
    </div>
  );
}
