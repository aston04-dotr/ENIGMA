"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey } = getSupabasePublicConfig();

let browserClient: SupabaseClient | null = null;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}
