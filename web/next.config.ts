import type { NextConfig } from "next";
import path from "path";

/**
 * TEMP (mobile PWA / chat wake): на Vercel Production по умолчанию `1`.
 * Выключить без правки кода: `NEXT_PUBLIC_ENIGMA_DIAG=0` в env хостинга + redeploy.
 */
function resolveNextPublicEnigmaDiag(): string {
  const raw = process.env.NEXT_PUBLIC_ENIGMA_DIAG?.trim();
  if (raw === "0" || raw === "false") return "0";
  if (raw === "1" || raw === "true") return "1";
  if (process.env.VERCEL_ENV === "production") return "1";
  // Не-Vercel production: выставите NEXT_PUBLIC_ENIGMA_DIAG=1 в env сборки при необходимости.
  return raw ?? "";
}

const nextConfig: NextConfig = {
  /** Монорепо: не поднимать lockfile с родительской папки Desktop как корень трейсинга. */
  outputFileTracingRoot: path.join(process.cwd()),
  serverExternalPackages: ["sharp"],
  /** Для сравнения с /api/app-version (авто-обновление после деплоя). */
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.NEXT_PUBLIC_APP_VERSION ||
      "dev",
    NEXT_PUBLIC_ENIGMA_DIAG: resolveNextPublicEnigmaDiag(),
  },
  /** Dev double-invokes subtrees/effects — watch `[STRICT_MODE_DUPLICATE_EFFECT]` in ChatUnread realtime setup. */
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**", pathname: "/**" },
      { protocol: "http", hostname: "**", pathname: "/**" },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
