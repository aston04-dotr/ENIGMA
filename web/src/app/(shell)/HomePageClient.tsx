"use client";

import { LandingScreen } from "@/components/LandingScreen";
import { useAuth } from "@/context/auth-context";
import { FeedPage } from "./FeedScreen";

export default function HomePageClient() {
  const { session, loading } = useAuth();

  if (loading && !session?.user) {
    return <LandingScreen />;
  }

  if (!session?.user) {
    return <LandingScreen />;
  }

  return (
    <div className="min-h-screen bg-main">
      <FeedPage session={session} />
    </div>
  );
}
