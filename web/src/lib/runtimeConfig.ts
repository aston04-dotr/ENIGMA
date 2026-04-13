const PROD_WEB_ORIGIN = "https://enigma-app.online";
const PROD_API_ORIGIN = "https://api.enigma-app.online";
const DEV_WEB_ORIGIN = "http://localhost:3000";

const DEV_SUPABASE_URL = "https://placeholder.supabase.co";
const DEV_SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJlbmlnbWEtbG9jYWwiLCJyb2xlIjoiYW5vbiJ9.dummy";

function stripTrailingSlash(input: string): string {
  return input.replace(/\/+$/, "");
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);
  return isProductionRuntime() ? PROD_WEB_ORIGIN : DEV_WEB_ORIGIN;
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

export function getSupabasePublicConfig(): { url: string; anonKey: string; configured: boolean } {
  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const rawAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";

  if (rawUrl && rawAnonKey) {
    return { url: rawUrl, anonKey: rawAnonKey, configured: true };
  }

  if (isProductionRuntime()) {
    throw new Error(
      "Missing Supabase env in production: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return { url: DEV_SUPABASE_URL, anonKey: DEV_SUPABASE_ANON, configured: false };
}
