import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../context/auth-context";

/**
 * Защищённые маршруты: без сессии — только email; не показываем phone/profile без session.
 */
export function useRequireAuth() {
  const { session, loading, authResolved, needsPhone, needsName } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authResolved || loading) return;
    console.log("SESSION", session);
    if (!session) {
      console.log("REDIRECT → EMAIL / PHONE / PROFILE / TABS", "EMAIL");
      router.replace("/(auth)/email");
      return;
    }
    if (needsPhone) {
      console.log("REDIRECT → EMAIL / PHONE / PROFILE / TABS", "PHONE");
      router.replace("/(auth)/phone");
      return;
    }
    if (needsName) {
      console.log("REDIRECT → EMAIL / PHONE / PROFILE / TABS", "PROFILE");
      router.replace("/(auth)/profile-setup");
      return;
    }
  }, [session, loading, authResolved, needsPhone, needsName, router]);

  return {
    session,
    loading: loading || !authResolved,
    ready: Boolean(session && !needsPhone && !needsName && authResolved && !loading),
  };
}
