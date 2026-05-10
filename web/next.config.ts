import type { NextConfig } from "next";
import path from "path";

/**
 * Версия для клиента (/api/app-version, PWA). Задаётся при сборке: NEXT_PUBLIC_APP_VERSION
 * или любой из стандартных SHA CI (GIT_COMMIT_SHA, CI_COMMIT_SHA, GITHUB_SHA).
 * Диагностика клиента — только если в env сборки: NEXT_PUBLIC_ENIGMA_DIAG=1 (ничего не инжектим здесь).
 */
function resolvePublicAppVersion(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  if (explicit) return explicit;
  const sha =
    process.env.GIT_COMMIT_SHA?.trim() ||
    process.env.CI_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    "";
  if (sha) return sha;
  return process.env.NODE_ENV === "production" ? "production" : "dev";
}

const nextConfig: NextConfig = {
  /** Монорепо: не поднимать lockfile с родительской папки Desktop как корень трейсинга. */
  outputFileTracingRoot: path.join(process.cwd()),
  serverExternalPackages: ["sharp"],
  /** Для сравнения с /api/app-version (авто-обновление после деплоя). */
  env: {
    NEXT_PUBLIC_APP_VERSION: resolvePublicAppVersion(),
  },
  /** Dev double-invokes subtrees/effects — watch `[STRICT_MODE_DUPLICATE_EFFECT]` in ChatUnread realtime setup. */
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    /** Дольше держим оптимизированные remote-изображения в кэше Image — меньше повторных качаний при смене ленты. */
    minimumCacheTTL: 60 * 60 * 24 * 30,
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
