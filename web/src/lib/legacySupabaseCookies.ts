import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

/**
 * Safari: `cookies.delete()` может не снять cookie; принудительно истекаем через Set-Cookie с нулевым сроком.
 * Domain выровнен под production; на localhost без этого domain очистка идёт по path-only (см. secure ниже).
 */
export const COOKIE_OPTIONS = {
  path: "/",
  domain: ".enigma-app.online",
  expires: new Date(0),
  maxAge: 0,
  secure: true,
  sameSite: "lax" as const,
};

export const LEGACY_SUPABASE_AUTH_COOKIE_NAMES = [
  "enigma.supabase.auth.v1",
  "sb-jggpvjfvdvqmwaaqetqu-auth-token",
  "sb-jggpvjfvdvqmwaaqetqu-auth-token.0",
] as const;

function expireCookie(res: NextResponse, name: string): void {
  res.cookies.set(name, "", COOKIE_OPTIONS);
}

/**
 * Middleware: в ответе — принудительное expire для Safari; в запросе проверяем наличие для лога.
 */
export function stripLegacySupabaseAuthCookiesMiddleware(
  req: NextRequest,
  res: NextResponse,
): NextResponse {
  let hadAnyInRequest = false;
  for (const name of LEGACY_SUPABASE_AUTH_COOKIE_NAMES) {
    if (req.cookies.get(name)?.value) {
      hadAnyInRequest = true;
    }
    expireCookie(res, name);
  }
  if (hadAnyInRequest) {
    console.log("[AUTH_CLEANUP] removed legacy supabase cookies");
  }
  return res;
}

/**
 * Route Handler / Server: после serverSignOut и т.п.
 * Лог только если хотя бы одна cookie реально была в store до перезаписи.
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
      store.set(name, "", COOKIE_OPTIONS);
    }
    if (hadAny) {
      console.log("[AUTH_CLEANUP] removed legacy supabase cookies");
    }
  } catch {
    /* Edge / нет async cookies() */
  }
}
