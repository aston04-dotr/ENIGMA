"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./supabase.types";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey, configured } = getSupabasePublicConfig();

/**
 * Единый browser-клиент: сессия, magic link, Realtime, auth listeners.
 * Не плодим второй `createClient` с тем же storage key — это даёт
 * "Multiple GoTrueClient instances detected".
 */
export const supabase = createBrowserClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
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
