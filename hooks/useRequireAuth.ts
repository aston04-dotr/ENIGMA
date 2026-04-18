import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../context/auth-context";

/**
 * Защищённые маршруты: без сессии — только email; не показываем phone/profile без session.
 */
export function useRequireAuth() {
  const { session, loading, authResolved } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authResolved || loading) return;
    console.log("SESSION", session);
    if (!session) {
      console.log("REDIRECT → EMAIL / PHONE / PROFILE / TABS", "EMAIL");
      router.replace("/(auth)/email");
      return;
    }
  }, [session, loading, authResolved, router]);

  return {
    session,
    loading: loading || !authResolved,
    ready: Boolean(session && authResolved && !loading),
  };
}
