"use client";

import { createClient } from "./supabaseClient";
import { getSupabasePublicConfig } from "./runtimeConfig";

const supabaseConfig = getSupabasePublicConfig();
const rawUrl = supabaseConfig.url;
export const isSupabaseConfigured = supabaseConfig.configured;

if (!isSupabaseConfigured) {
  console.error(
    "[Supabase] Missing env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
      "(or EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY). App runs in offline-safe mode."
  );
}

if (isSupabaseConfigured && !rawUrl.startsWith("https://")) {
  console.error("[Supabase] Invalid URL (must start with https://):", rawUrl.slice(0, 24) + "…");
}

if (process.env.NODE_ENV === "development") {
  console.log("[Supabase] URL configured:", isSupabaseConfigured ? "yes" : "dev-fallback");
}

export const supabase = createClient();
