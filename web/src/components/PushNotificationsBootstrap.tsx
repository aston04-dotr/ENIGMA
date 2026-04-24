"use client";

import { useAuth } from "@/context/auth-context";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function PushNotificationsBootstrap() {
  const { user } = useAuth();

  usePushNotifications({
    enabled: Boolean(user?.id),
    userId: user?.id ?? null,
  });

  return null;
}

export default PushNotificationsBootstrap;
