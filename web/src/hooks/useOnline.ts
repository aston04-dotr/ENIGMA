"use client";

import { useEffect, useRef, useState } from "react";

export function useOnline(onOnline?: () => void) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const onOnlineRef = useRef(onOnline);
  onOnlineRef.current = onOnline;

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      onOnlineRef.current?.();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
