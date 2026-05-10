"use client";

import { FeedPage } from "@/app/(shell)/FeedScreen";
import { useAuth } from "@/context/auth-context";

export default function WantedFeedPage() {
  const { session } = useAuth();

  return (
    <div className="min-h-screen bg-main">
      {/** Таб «Поиск» в нижнем меню — та же лента предложений, что на главной; фильтрация по вводу, не экран запросов «сниму». */}
      <FeedPage session={session} />
    </div>
  );
}
