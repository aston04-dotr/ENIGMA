import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/runtimeConfig";
import { hardenedServerGetSession } from "@/lib/serverSupabaseAuth";

function normalizeCookieOptions(
  req: NextRequest,
  options: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const secure = req.nextUrl.protocol === "https:";
  return {
    ...(options ?? {}),
    path: "/",
    sameSite: "lax",
    secure,
  };
}

async function updateSession(req: NextRequest) {
  const pathname = req.nextUrl.pathname.toLowerCase();
  /** Keep cookie jar in sync everywhere (incl. /chat long sessions). Only skip paths that must not touch auth cookies. */
  if (
    pathname.includes("logout") ||
    pathname === "/login" ||
    req.nextUrl.searchParams.has("signed_out") ||
    req.cookies.get("enigma_signed_out")?.value === "1"
  ) {
    return NextResponse.next();
  }

  /** Route Handlers сами обновляют сессию (createServerSupabase + getSession). Пропуск уменьшает гонку с middleware на одном XHR-запросе. */
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({
      request: {
        headers: req.headers,
      },
    });
  }

  const { url, anonKey, configured } = getSupabasePublicConfig();
  if (!configured || !url || !anonKey) {
    return NextResponse.next();
  }

  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
        });
        res = NextResponse.next({
          request: {
            headers: req.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, normalizeCookieOptions(req, options));
        });
      },
    },
  });

  try {
    const outcome = await hardenedServerGetSession(
      supabase,
      `middleware:getSession:${pathname}`,
    );
    if (outcome.fatalRefreshCleared) {
      return res;
    }
    if (outcome.session?.user) {
      return res;
    }
  } catch {
    return res;
  }

  return res;
}

export default async function middleware(req: NextRequest) {
  const res = await updateSession(req);
  const location = res.headers.get("location");
  if (location) {
    try {
      const target = new URL(location, req.url);
      if (target.pathname === req.nextUrl.pathname) {
        return NextResponse.next({
          request: {
            headers: req.headers,
          },
        });
      }
    } catch {
      return res;
    }
  }
  return res;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|icon-192\\.png|icon-512\\.png|offline|icons).*)',
  ],
};
