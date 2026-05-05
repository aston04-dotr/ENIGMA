"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./supabase.types";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey, configured } = getSupabasePublicConfig();

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const key = `${encodeURIComponent(name)}=`;
  const chunks = document.cookie ? document.cookie.split("; ") : [];
  for (const row of chunks) {
    if (!row.startsWith(key)) continue;
    return decodeURIComponent(row.slice(key.length));
  }
  return undefined;
}

function cookieDomainForHost(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname.trim().toLowerCase();
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return undefined;
  }
  if (host === "enigma-app.online" || host.endsWith(".enigma-app.online")) {
    return "enigma-app.online";
  }
  return host;
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  const encodedName = encodeURIComponent(name);
  const encodedValue = encodeURIComponent(value);
  const domain = cookieDomainForHost();
  const parts = [
    `${encodedName}=${encodedValue}`,
    "path=/",
    `max-age=${maxAge}`,
    "SameSite=Lax",
  ];
  if (domain) parts.push(`domain=${domain}`);
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
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
    get(name) {
      return readCookie(name);
    },
    set(name, value, options) {
      void options;
      writeCookie(name, value, 31536000);
    },
    remove(name, options) {
      void options;
      writeCookie(name, "", 0);
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
