import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { publicRequestUrl } from "@/lib/publicRequestUrl";

export const dynamic = "force-dynamic";

function redirectToRoot(request: NextRequest) {
  return NextResponse.redirect(publicRequestUrl(request, "/"), 307);
}

export function GET(request: NextRequest) {
  return redirectToRoot(request);
}

export function HEAD(request: NextRequest) {
  return redirectToRoot(request);
}
