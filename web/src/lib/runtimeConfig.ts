const PROD_WEB_ORIGIN = "https://enigma-app.online";
const PROD_API_ORIGIN = "https://api.enigma-app.online";
const DEV_WEB_ORIGIN = "http://localhost:3000";

const PROD_LISTINGS_PAGE_SIZE = 40;
const DEV_LISTINGS_PAGE_SIZE = 20;
const PROD_MAX_LISTING_PHOTOS = 12;
const DEV_MAX_LISTING_PHOTOS = 8;

function stripTrailingSlash(input: string): string {
  return input.replace(/\/+$/, "");
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readPositiveIntEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);
  return isProductionRuntime() ? PROD_WEB_ORIGIN : DEV_WEB_ORIGIN;
}

function hostnameIsLoopback(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h.startsWith("127.");
}

/** Для редиректов: в production не доверяем NEXT_PUBLIC_SITE_URL на loopback (частая ошибка в .env на сервере). */
export function getRedirectSiteOrigin(): string {
  const candidate = getSiteOrigin();
  if (!isProductionRuntime()) {
    return candidate;
  }
  try {
    const { hostname } = new URL(candidate);
    if (hostnameIsLoopback(hostname)) {
      return PROD_WEB_ORIGIN;
    }
    return candidate;
  } catch {
    return PROD_WEB_ORIGIN;
  }
}

export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);
  return isProductionRuntime() ? PROD_API_ORIGIN : "";
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function getListingsPageSize(): number {
  const fallback = isProductionRuntime() ? PROD_LISTINGS_PAGE_SIZE : DEV_LISTINGS_PAGE_SIZE;
  const fromEnv = readPositiveIntEnv("NEXT_PUBLIC_LISTINGS_PAGE_SIZE");
  return clampInt(fromEnv ?? fallback, 10, 200);
}

export function getMaxListingPhotos(): number {
  const fallback = isProductionRuntime() ? PROD_MAX_LISTING_PHOTOS : DEV_MAX_LISTING_PHOTOS;
  const fromEnv = readPositiveIntEnv("NEXT_PUBLIC_MAX_LISTING_PHOTOS");
  return clampInt(fromEnv ?? fallback, 1, 30);
}

export function getSupabasePublicConfig(): { url: string; anonKey: string; configured: boolean } {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

  if (rawUrl && rawAnonKey) {
    return { url: rawUrl, anonKey: rawAnonKey, configured: true };
  }

  return { url: "", anonKey: "", configured: false };
}
