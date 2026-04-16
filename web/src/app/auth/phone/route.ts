import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { publicRequestUrl } from "@/lib/publicRequestUrl";

/** Явный HTTP 307 — `redirect()` в page.tsx иногда отдаёт 200 + RSC; curl/боты видят настоящий редирект. */
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
