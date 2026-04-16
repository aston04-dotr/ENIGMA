import type { NextRequest } from "next/server";
import { getRedirectSiteOrigin } from "@/lib/runtimeConfig";

/** Заголовки вроде `X-Forwarded-Host: a, b` ломают `new URL(..., "https://a, b")`. */
function firstHeaderValue(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  return raw.split(",")[0]?.trim() ?? null;
}

function isInternalHost(host: string | null | undefined): boolean {
  if (!host?.trim()) return true;
  const h = host.toLowerCase();
  return h.includes("localhost") || h.startsWith("127.");
}

/**
 * Собирает URL как его видит браузер. За nginx без X-Forwarded-* часто приходит
 * Host: localhost:3000 — тогда берём {@link getRedirectSiteOrigin}.
 */
export function publicRequestUrl(request: NextRequest, pathname: string): URL {
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const proto =
    forwardedProto ??
    (host?.includes("localhost") || host?.startsWith("127.") ? "http" : "https");

  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (isInternalHost(host)) {
    return new URL(path, getRedirectSiteOrigin());
  }

  try {
    return new URL(path, `${proto}://${host}`);
  } catch {
    return new URL(path, getRedirectSiteOrigin());
  }
}
