"use client";

import { FeedPage } from "@/app/(shell)/FeedScreen";
import { useAuth } from "@/context/auth-context";

export default function WantedFeedPage() {
  const { session } = useAuth();

  return (
    <div className="min-h-screen bg-main">
      <FeedPage session={session} feedVariant="seeking" />
    </div>
  );
}
