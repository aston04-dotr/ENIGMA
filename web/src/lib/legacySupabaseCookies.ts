import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

/**
 * Устаревшие chunked auth-token (старый project ref / миграция Supabase).
 * Удаляем явно, т.к. signOut + setAll может не снять чужие имена.
 */
export const LEGACY_SUPABASE_AUTH_COOKIE_NAMES = [
  "sb-jggpvjfvdvqmwaaqetqu-auth-token",
  "sb-jggpvjfvdvqmwaaqetqu-auth-token.0",
  "sb-jggpvjfvdvqmwaaqetqu-auth-token.1",
] as const;

/**
 * Middleware: ответ + мутируемый request cookie jar (если есть).
 */
export function stripLegacySupabaseAuthCookiesMiddleware(
  req: NextRequest,
  res: NextResponse,
): NextResponse {
  let hadAny = false;
  for (const name of LEGACY_SUPABASE_AUTH_COOKIE_NAMES) {
    if (req.cookies.get(name)?.value) {
      hadAny = true;
    }
    res.cookies.delete(name);
    try {
      req.cookies.delete(name);
    } catch {
      /* immutable request cookies in some contexts */
    }
  }
  if (hadAny) {
    console.log("[AUTH_CLEANUP] removed legacy supabase cookies");
  }
  return res;
}

/**
 * Route Handler / Server: next/headers cookies().
 */
export async function stripLegacySupabaseAuthCookiesNextHeaders(): Promise<void> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    let hadAny = false;
    for (const name of LEGACY_SUPABASE_AUTH_COOKIE_NAMES) {
      if (store.get(name)?.value) {
        hadAny = true;
      }
      store.delete(name);
    }
    if (hadAny) {
      console.log("[AUTH_CLEANUP] removed legacy supabase cookies");
    }
  } catch {
    /* Edge middleware / нет доступа к async cookies() */
  }
}
