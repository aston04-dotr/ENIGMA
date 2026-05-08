"use client";

import { ENIGMA_SUPABASE_AUTH_STORAGE_KEY } from "@/lib/enigmaSupabaseStorageKey";

const LEGACY_SB_KEYS = ["sb-access-token", "sb-refresh-token"] as const;

/** Remove Supabase browser auth keys (local + session storage). No supabase client import. */
export function purgeSupabaseAuthBrowserStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of LEGACY_SB_KEYS) {
      try {
        window.localStorage.removeItem(k);
      } catch {
        /* noop */
      }
      try {
        window.sessionStorage.removeItem(k);
      } catch {
        /* noop */
      }
    }
    try {
      window.localStorage.removeItem(ENIGMA_SUPABASE_AUTH_STORAGE_KEY);
    } catch {
      /* noop */
    }
  } catch {
    /* noop */
  }
}
