"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./supabase.types";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey, configured } = getSupabasePublicConfig();

/**
 * Сессия в localStorage, PKCE из URL (маглинк) обрабатывается на клиенте
 * (detectSessionInUrl: true), чтобы JWT доходил до PostgREST / RPC.
 */
export const supabase = createBrowserClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const isSupabaseConfigured = configured;

/**
 * ПостgREST (fetchWithAuth) подставляет `access_token` из `auth.getSession()`.
 * Если в момент запроса в памяти/куках нет access_token, в `Authorization` улетает
 * anon key — `auth.uid()` в RLS = null. Отдельный клиент с явным
 * `Authorization: Bearer <user_jwt>` гарантирует JWT в RPC / `.from()`.
 */
export async function getAuthedSupabaseClient(): Promise<SupabaseClient<Database> | null> {
  if (!url || !anonKey) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("[supabase] getAuthedSupabaseClient getSession", error);
  }
  const token = data.session?.access_token;
  if (!token) return null;
  return createClient<Database>(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  void supabase.auth.getSession().then(({ data }) => {
    console.log("CURRENT SESSION:", data.session);
  });
}
