import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/runtimeConfig";
import { publicRequestUrl } from "@/lib/publicRequestUrl";

function applyNoCacheHeaders(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("x-middleware-cache", "no-cache");
  return res;
}

export async function middleware(request: NextRequest) {
  const { url, anonKey } = getSupabasePublicConfig();

  const response = NextResponse.next();
  applyNoCacheHeaders(response);
  const pathname = request.nextUrl.pathname;
  const isApiPath = pathname.startsWith("/api/");

  // API-роуты не должны получать редирект на /login из middleware.
  // Иначе публичные POST (например, /api/auth/magic-link) ломаются у гостей.
  if (isApiPath) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Parameters<typeof response.cookies.set>[2];
        }>
      ) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() ходит в сеть Supabase на каждый запрос — ощутимо тормозит после magic link.
  // Для гейта достаточно JWT из cookie (getSession); клиент при необходимости обновит сессию.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const isAuthPath = pathname === "/login" || pathname.startsWith("/auth");
  const isPublicPath =
    pathname.startsWith("/legal") ||
    pathname === "/offline";

  // Не вмешиваемся в auth flow (включая /auth/verify и callback-пути).
  if (pathname.startsWith("/auth")) {
    return response;
  }

  if (user && pathname === "/login") {
    return applyNoCacheHeaders(NextResponse.redirect(publicRequestUrl(request, "/")));
  }

  if (!user && !isAuthPath && !isPublicPath) {
    return applyNoCacheHeaders(NextResponse.redirect(publicRequestUrl(request, "/login")));
  }

  return response;
}

export const config = {
  matcher: [
    "/auth/phone",
    "/auth/phone/:path*",
    "/auth/profile-setup",
    "/auth/profile-setup/:path*",
    "/((?!_next|favicon.ico).*)",
  ],
};
