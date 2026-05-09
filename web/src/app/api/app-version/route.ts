import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Версия деплоя для soft-reload: клиент сравнивает с сохранённой в sessionStorage.
 * Не создаёт кэш: после нового deploy значение меняется.
 * На VPS задайте при сборке NEXT_PUBLIC_APP_VERSION или GIT_COMMIT_SHA / CI_COMMIT_SHA / GITHUB_SHA.
 */
export function GET() {
  const explicit = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  const sha =
    process.env.GIT_COMMIT_SHA?.trim() ||
    process.env.CI_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    "";
  const v =
    explicit ||
    sha ||
    (process.env.NODE_ENV === "production" ? "production" : "dev");

  return NextResponse.json(
    { v: String(v) },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}
