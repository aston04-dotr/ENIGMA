import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/runtimeConfig";

const { url, anonKey } = getSupabasePublicConfig();

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

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

  const isAuthPath =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth");

  const hasSbCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));

  if (!user && !isAuthPath && !hasSbCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
