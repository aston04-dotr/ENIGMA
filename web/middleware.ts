import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/runtimeConfig";

const { url, anonKey } = getSupabasePublicConfig();

function applyNoCacheHeaders(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("x-middleware-cache", "no-cache");
  return res;
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/auth/phone") || request.nextUrl.pathname.startsWith("/auth/profile-setup")) {
    return applyNoCacheHeaders(NextResponse.redirect(new URL("/", request.url)));
  }

  const response = NextResponse.next();
  applyNoCacheHeaders(response);
  const pathname = request.nextUrl.pathname;

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPath = pathname === "/login" || pathname.startsWith("/auth");

  const hasSbCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));

  if (user && pathname === "/login") {
    return applyNoCacheHeaders(NextResponse.redirect(new URL("/", request.url)));
  }

  if (!user && !isAuthPath && !hasSbCookie) {
    return applyNoCacheHeaders(NextResponse.redirect(new URL("/login", request.url)));
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
