import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function redirectToRoot(request: NextRequest) {
  const u = request.nextUrl.clone();
  u.pathname = "/";
  u.search = "";
  return NextResponse.redirect(u, 307);
}

export function GET(request: NextRequest) {
  return redirectToRoot(request);
}

export function HEAD(request: NextRequest) {
  return redirectToRoot(request);
}
