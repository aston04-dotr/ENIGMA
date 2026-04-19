import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /** Монорепо: не поднимать lockfile с родительской папки Desktop как корень трейсинга. */
  outputFileTracingRoot: path.join(process.cwd()),
  reactStrictMode: true,
  images: {
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
};

export default nextConfig;
