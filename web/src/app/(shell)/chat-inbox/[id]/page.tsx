"use client";

import { AuthGuestInboxChatRoom } from "@/components/guest/AuthGuestInboxChatRoom";
import { useAuth } from "@/context/auth-context";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function ChatInboxPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loading, authResolved } = useAuth();
  const chatId = typeof id === "string" ? id.trim() : "";

  useEffect(() => {
    if (!authResolved || loading) return;
    if (!session?.user) {
      router.replace("/chat");
      return;
    }
    if (!isUuid(chatId)) {
      router.replace("/chat");
    }
  }, [authResolved, chatId, loading, router, session?.user]);

  if (loading || !authResolved) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-5 text-sm text-muted">
        Подключение...
      </main>
    );
  }

  if (!session?.user || !isUuid(chatId)) {
    return null;
  }

  return <AuthGuestInboxChatRoom chatId={chatId} />;
}
