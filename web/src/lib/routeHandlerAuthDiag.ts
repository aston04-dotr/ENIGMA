/** Серверная диагностика auth для Route Handlers (без значений cookie). */

import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabaseServer";

export function routeHandlerAuthDiagEnabled(): boolean {
  return (
    process.env.ENIGMA_ROUTE_AUTH_DIAG?.trim() === "1" ||
    process.env.NEXT_PUBLIC_ENIGMA_DIAG?.trim() === "1"
  );
}

/**
 * Полный снимок: имена cookie (длина), затем getSession → getUser в том же порядке, что и resolveRouteHandlerSupabaseUser.
 */
export async function logRouteHandlerAuthProbe(trace: string): Promise<void> {
  const cookieStore = await cookies();
  const cookieSnapshot = cookieStore.getAll().map((c) => ({
    name: c.name,
    valueLen: c.value.length,
  }));
  const supabase = await createServerSupabase();
  const { data: sessWrap, error: sessErr } = await supabase.auth.getSession();
  const { data: userWrap, error: userErr } = await supabase.auth.getUser();

  console.warn(`[route-auth-probe:${trace}]`, {
    cookies: cookieSnapshot,
    getSession: {
      error: sessErr?.message ?? null,
      hasSession: Boolean(sessWrap.session),
      userId: sessWrap.session?.user?.id ?? null,
    },
    getUser: {
      error: userErr?.message ?? null,
      hasUser: Boolean(userWrap.user),
      userId: userWrap.user?.id ?? null,
    },
  });
}
