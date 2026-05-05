import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSupabasePublicConfig } from "@/lib/runtimeConfig";

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
  if (
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname.includes("logout") ||
    pathname === "/login" ||
    req.nextUrl.searchParams.has("signed_out") ||
    req.cookies.get("enigma_signed_out")?.value === "1"
  ) {
    return NextResponse.next();
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
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      // Never redirect here: authenticated requests must keep streaming without blink.
      return res;
    }
  } catch {
    return res;
  }

  return res
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
