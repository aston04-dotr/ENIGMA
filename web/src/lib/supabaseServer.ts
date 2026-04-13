import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey } = getSupabasePublicConfig();

export async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const cookieAdapter = {
    getAll() {
      return cookieStore.getAll();
    },
    set(name: string, value: string, options?: Parameters<typeof cookieStore.set>[2]) {
      cookieStore.set(name, value, options);
    },
    remove(name: string, options?: Parameters<typeof cookieStore.set>[2]) {
      cookieStore.set(name, "", { ...options, maxAge: 0 });
    },
  } as unknown as {
    getAll: () => ReturnType<typeof cookieStore.getAll>;
    set: (name: string, value: string, options?: Parameters<typeof cookieStore.set>[2]) => void;
    remove: (name: string, options?: Parameters<typeof cookieStore.set>[2]) => void;
  };

  return createServerClient(url, anonKey, {
    cookies: cookieAdapter,
  });
}
