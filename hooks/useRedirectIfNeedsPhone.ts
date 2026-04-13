import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../context/auth-context";

/** Залогинен без телефона → только экран телефона (гости не трогаем). */
export function useRedirectIfNeedsPhone() {
  const router = useRouter();
  const { session, loading, authResolved, needsPhone } = useAuth();

  useEffect(() => {
    if (!authResolved || loading) return;
    if (session && needsPhone) {
      router.replace("/(auth)/phone");
    }
  }, [session, loading, authResolved, needsPhone, router]);
}
