"use client";

import { useAuth } from "@/context/auth-context";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function PushNotificationsBootstrap() {
  const { session } = useAuth();

  usePushNotifications({
    enabled: Boolean(session?.user?.id),
    userId: session?.user?.id ?? null,
  });

  return null;
}

export default PushNotificationsBootstrap;
