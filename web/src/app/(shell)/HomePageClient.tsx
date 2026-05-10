"use client";

import { FeedPage } from "./FeedScreen";
import { useAuth } from "@/context/auth-context";

export default function HomePageClient() {
  const { session } = useAuth();

  return (
    <div className="min-h-[100svh] bg-main">
      <FeedPage session={session} />
    </div>
  );
}
