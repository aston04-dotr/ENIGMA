import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey } = getSupabasePublicConfig();

function normalizeServerCookieOptions(
  options?: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2],
): Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2] {
  const secure =
    process.env.NODE_ENV === "production" &&
    !String(process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "")
      .trim()
      .toLowerCase()
      .startsWith("http://");

  return {
    ...(options ?? {}),
    path: "/",
    sameSite: "lax",
    secure,
  };
}

/** Создаёт SSR-клиент. У @supabase/ssr autoRefreshToken: false, но getSession/getUser при просроченном access всё ещё могут вызывать refresh по refresh_token из cookie; при битом refresh см. middleware и authRefreshErrors. */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const cookieAdapter = {
    getAll() {
      return cookieStore.getAll();
    },
    set(name: string, value: string, options?: Parameters<typeof cookieStore.set>[2]) {
      cookieStore.set(name, value, normalizeServerCookieOptions(options));
    },
    remove(name: string, options?: Parameters<typeof cookieStore.set>[2]) {
      cookieStore.set(name, "", {
        ...normalizeServerCookieOptions(options),
        maxAge: 0,
      });
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
