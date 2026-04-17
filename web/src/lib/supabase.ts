"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./runtimeConfig";
import type { Database } from "./supabase.types";

const { url, anonKey, configured } = getSupabasePublicConfig();

let browserClient: SupabaseClient<Database> | null = null;

function getBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(url, anonKey);
  }
  return browserClient;
}

export const supabase = getBrowserSupabaseClient();

export const isSupabaseConfigured = configured;
