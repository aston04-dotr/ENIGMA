import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Версия деплоя для soft-reload: клиент сравнивает с сохранённой в sessionStorage.
 * Не создаёт кэш: после нового deploy значение меняется.
 */
export function GET() {
  const v =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    "0";

  return NextResponse.json(
    { v: String(v) },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}
