import type { NextConfig } from "next";
import path from "path";

const isLocalCapBundle = process.env.CAP_LOCAL_BUNDLE === "1";

const nextConfig: NextConfig = {
  /** Монорепо: не поднимать lockfile с родительской папки Desktop как корень трейсинга. */
  outputFileTracingRoot: path.join(process.cwd()),
  /** Для сравнения с /api/app-version (авто-обновление после деплоя). */
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.NEXT_PUBLIC_APP_VERSION ||
      "dev",
  },
  reactStrictMode: true,
  ...(isLocalCapBundle
    ? {
        output: "export" as const,
        trailingSlash: true,
        // Ignore .ts route handlers/middleware in local static bundle build.
        pageExtensions: ["tsx", "jsx"],
      }
    : {}),
  images: {
    ...(isLocalCapBundle ? { unoptimized: true } : {}),
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
