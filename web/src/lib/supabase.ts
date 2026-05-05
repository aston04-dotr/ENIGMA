"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./supabase.types";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey, configured } = getSupabasePublicConfig();

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

function writeCookie(
  name: string,
  value: string,
  options: BrowserCookieOptions = {},
) {
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

  const sameSite = String(options.sameSite ?? "Lax");
  parts.push(`SameSite=${sameSite}`);

  const shouldUseSecure =
    options.secure ??
    (typeof window !== "undefined" && window.location.protocol === "https:");
  if (shouldUseSecure) {
    parts.push("Secure");
  }
  document.cookie = parts.join("; ");
}

/**
 * Единый browser-клиент: сессия, magic link, Realtime, auth listeners.
 * Cookie-based storage через @supabase/ssr (без localStorage/sessionStorage для auth).
 */
export const supabase = createBrowserClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
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
          maxAge:
            typeof options?.maxAge === "number"
              ? options.maxAge
              : undefined,
          expires: options?.expires as string | Date | undefined,
          sameSite:
            (options?.sameSite as string | undefined) ?? "lax",
          secure:
            typeof options?.secure === "boolean"
              ? options.secure
              : undefined,
        });
      });
    },
  },
});

export const isSupabaseConfigured = configured;

let supabaseRestSingleton: SupabaseClient<Database> | null = null;

/**
 * Один `createClient` **без** отдельного GoTrue: опция `accessToken` взята из
 * основного `supabase.auth.getSession()`. PostgREST/RPC/Storage/Functions
 * получают `Authorization: Bearer <user_jwt>`, а не `sb_publishable_…`.
 * Не вызывайте `supabaseRest.auth.*` (namespace disabled при `accessToken`).
 */
export function getSupabaseRestWithSession(): SupabaseClient<Database> | null {
  if (!url || !anonKey) return null;
  if (!supabaseRestSingleton) {
    supabaseRestSingleton = createClient<Database>(url, anonKey, {
      /** Один shared GoTrue — `supabase`; здесь только чтение токена для PostgREST. */
      accessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      },
    });
  }
  return supabaseRestSingleton;
}

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  void supabase.auth.getSession().then(({ data }) => {
    console.log("CURRENT SESSION:", data.session);
  });
}
