import { useEffect } from "react";
import { useAuth } from "../context/auth-context";

/** Lite mode: legacy phone redirect disabled. */
export function useRedirectIfNeedsPhone() {
  const { loading, authResolved } = useAuth();

  useEffect(() => {
    void authResolved;
    void loading;
  }, [authResolved, loading]);
}
