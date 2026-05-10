import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ENIGMA_SUPABASE_AUTH_STORAGE_KEY } from "./enigmaSupabaseStorageKey";
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

/**
 * Next.js Route Handler / SSR Supabase via cookies().
 * Must use getAll + setAll @supabase/ssr: without setAll the library stubs writes,
 * so token refresh cannot persist cookies and APIs may see getUser=null while SPA still appears signed in.
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    auth: {
      storageKey: ENIGMA_SUPABASE_AUTH_STORAGE_KEY,
      persistSession: true,
      detectSessionInUrl: false,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            if (!value) {
              cookieStore.set(name, "", {
                ...normalizeServerCookieOptions(options),
                maxAge: 0,
              });
            } else {
              cookieStore.set(name, value, normalizeServerCookieOptions(options));
            }
          }
        } catch {
          /* cookie mutation недоступен в части SSR-контекстов Next */
        }
      },
    },
  });
}
