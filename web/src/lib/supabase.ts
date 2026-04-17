"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey, configured } = getSupabasePublicConfig();

let browserClient: SupabaseClient | null = null;

function getBrowserSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}

export const supabase = getBrowserSupabaseClient();

export const isSupabaseConfigured = configured;
