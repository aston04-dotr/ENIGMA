"use client";

/**
 * Browser Supabase clients — transport map (web):
 * • `supabase` → `createBrowserClient` (@supabase/ssr): GoTrue + cookies + **shared Realtime** socket.
 * • `getSupabaseRestWithSession()` → **one** `createClient` PostgREST singleton with:
 *   – `global.fetch` → `createInstrumentedSupabaseFetch` (`[REST_OUTGOING]`, 401 → `[REST_AUTH_ACCESS_TOKEN]` storm)
 *   – `accessToken` → `createCachedRestAccessTokenProvider` **only** reads `restAccessToken` (sync), no auth/refresh/realtime calls.
 * Auth session: cookie storage via `@supabase/ssr` defaults (`cookie` parse/serialize).
 * Sources: `AuthProvider`, routes, `subscribeEnigmaAuthSingleton`, middleware `getSession` (server).
 */

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { isAuthCircuitOpen } from "@/lib/authCircuitState";
import { ENIGMA_SUPABASE_AUTH_STORAGE_KEY } from "@/lib/enigmaSupabaseStorageKey";
import {
  createCachedRestAccessTokenProvider,
  createInstrumentedSupabaseFetch,
  setTransportTokenProbe,
} from "@/lib/supabaseTransportInstrument";
import type { Database } from "./supabase.types";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey, configured } = getSupabasePublicConfig();
export { ENIGMA_SUPABASE_AUTH_STORAGE_KEY };

/**
 * Browser auth storage: do **not** pass custom `cookies.getAll` / `setAll` here.
 * `@supabase/ssr` then uses `cookie.parse` / `cookie.serialize` on `document.cookie`,
 * matching what `createServerClient` expects (base64url chunks, same encoding as server).
 * A hand-rolled adapter that URL-encodes cookie values corrupts the session payload.
 */
export const supabase = createBrowserClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    /** PKCE / magic-link fragments on /auth/*; safe on other routes (Supabase only parses when present). */
    detectSessionInUrl: true,
    storageKey: ENIGMA_SUPABASE_AUTH_STORAGE_KEY,
  },
});

export const isSupabaseConfigured = configured;

let restAccessToken: string | null = null;
let supabaseRestSingleton: SupabaseClient<Database> | null = null;
let restClientCreatedLogged = false;

setTransportTokenProbe(() => ({
  hasRestToken: Boolean(restAccessToken?.trim()),
  hasSessionToken: false,
}));

export function setRestAccessToken(session: Session | null): void {
  if (typeof window !== "undefined" && isAuthCircuitOpen()) {
    restAccessToken = null;
    return;
  }
  restAccessToken = session?.access_token ?? null;
}

/** Cached JWT for the REST singleton; kept in sync by AuthProvider (avoid RPC before this is set). */
export function getRestAccessToken(): string | null {
  if (typeof window !== "undefined" && isAuthCircuitOpen()) return null;
  return restAccessToken;
}

export function getSupabaseRestWithSession(): SupabaseClient<Database> | null {
  if (typeof window !== "undefined" && isAuthCircuitOpen()) return null;
  if (!url || !anonKey) return null;
  if (!supabaseRestSingleton) {
    if (!restClientCreatedLogged) {
      restClientCreatedLogged = true;
      console.warn("[REST_CLIENT_CREATED]");
    }
    supabaseRestSingleton = createClient<Database>(url, anonKey, {
      auth: {
        storageKey: ENIGMA_SUPABASE_AUTH_STORAGE_KEY,
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: createInstrumentedSupabaseFetch(fetch),
      },
      accessToken: createCachedRestAccessTokenProvider(() => {
        if (typeof window !== "undefined" && isAuthCircuitOpen()) return null;
        return restAccessToken;
      }),
    });
  }
  return supabaseRestSingleton;
}
