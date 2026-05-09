/** Серверная диагностика auth для Route Handlers (без утечки значений cookie). */

export function routeHandlerAuthDiagEnabled(): boolean {
  return (
    process.env.ENIGMA_ROUTE_AUTH_DIAG?.trim() === "1" ||
    process.env.NEXT_PUBLIC_ENIGMA_DIAG?.trim() === "1"
  );
}

export function summarizeCookieHeader(cookieHeader: string | null): {
  hasHeader: boolean;
  approxLength: number;
  sbTokenLikeNames: boolean;
} {
  const h = cookieHeader ?? "";
  return {
    hasHeader: h.length > 0,
    approxLength: h.length,
    sbTokenLikeNames: /\bsb-[^=\s;,]+-/i.test(h),
  };
}
