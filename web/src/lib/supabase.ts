"use client";

/**
 * Browser Supabase clients — transport map (web):
 * • `supabase` → `createBrowserClient` (@supabase/ssr): GoTrue + cookies + **shared Realtime** socket.
 * • `getSupabaseRestWithSession()` → **one** `createClient` PostgREST singleton with:
 *   – `global.fetch` → `createInstrumentedSupabaseFetch` (`[REST_OUTGOING]`, 401 → `[REST_AUTH_ACCESS_TOKEN]` storm)
 *   – `accessToken` → `createCachedRestAccessTokenProvider` **only** reads `restAccessToken` (sync), no auth/refresh/realtime calls.
 * Auth session sources: `supabase.auth.*` only in `AuthProvider` + routes; `subscribeEnigmaAuthSingleton`; middleware `getSession` (server).
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

type CookieItem = { name: string; value: string };
type BrowserCookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: string | Date;
  sameSite?: "lax" | "strict" | "none" | string;
  secure?: boolean;
};

function getAllCookies(): CookieItem[] {
  if (typeof document === "undefined") return [];
  const raw = document.cookie ? document.cookie.split("; ") : [];
  const out: CookieItem[] = [];
  for (const row of raw) {
    const idx = row.indexOf("=");
    if (idx <= 0) continue;
    const n = row.slice(0, idx);
    const v = row.slice(idx + 1);
    try {
      out.push({
        name: decodeURIComponent(n),
        value: decodeURIComponent(v),
      });
    } catch {
      out.push({ name: n, value: v });
    }
  }
  return out;
}

function writeCookie(name: string, value: string, options: BrowserCookieOptions = {}) {
  if (typeof document === "undefined") return;
  const encodedName = encodeURIComponent(name);
  const encodedValue = encodeURIComponent(value);
  const parts: string[] = [
    `${encodedName}=${encodedValue}`,
    `path=${options.path ?? "/"}`,
  ];
  if (typeof options.maxAge === "number" && Number.isFinite(options.maxAge)) {
    parts.push(`max-age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.expires) {
    const exp =
      options.expires instanceof Date
        ? options.expires.toUTCString()
        : String(options.expires);
    parts.push(`expires=${exp}`);
  }
  if (options.domain) {
    parts.push(`domain=${options.domain}`);
  }
  parts.push(`SameSite=${String(options.sameSite ?? "Lax")}`);
  const shouldUseSecure =
    options.secure ??
    (typeof window !== "undefined" && window.location.protocol === "https:");
  if (shouldUseSecure) parts.push("Secure");
  document.cookie = parts.join("; ");
}

export const supabase = createBrowserClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    /** PKCE / magic-link fragments on /auth/*; safe on other routes (Supabase only parses when present). */
    detectSessionInUrl: true,
    storageKey: ENIGMA_SUPABASE_AUTH_STORAGE_KEY,
    /** Синхронизация записи refresh/access между вкладками (BroadcastChannel) — снижает гонки ротации токенов. */
    multiTab: true,
  },
  cookies: {
    getAll() {
      return getAllCookies();
    },
    setAll(
      cookiesToSet: Array<{
        name: string;
        value: string;
        options?: BrowserCookieOptions & Record<string, unknown>;
      }>,
    ) {
      cookiesToSet.forEach(({ name, value, options }) => {
        writeCookie(name, value, {
          path: (options?.path as string | undefined) ?? "/",
          domain: options?.domain as string | undefined,
          maxAge: typeof options?.maxAge === "number" ? options.maxAge : undefined,
          expires: options?.expires as string | Date | undefined,
          sameSite: (options?.sameSite as string | undefined) ?? "lax",
          secure: typeof options?.secure === "boolean" ? options.secure : undefined,
        });
      });
    },
  },
});

console.log("[SUPABASE_CLIENT_INIT]", {
  storageKey: ENIGMA_SUPABASE_AUTH_STORAGE_KEY,
  persistSession: true,
  detectSessionInUrl: true,
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
