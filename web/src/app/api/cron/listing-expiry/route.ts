import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Периодический запуск истечения объявлений и рассылки listing_owner_notices.
 * Защита: заголовок Authorization: Bearer <LISTING_EXPIRY_CRON_SECRET>.
 * На VPS: systemd timer/crontab или внешний scheduler — GET с секретом, плюс
 * SUPABASE_SERVICE_ROLE_KEY и LISTING_EXPIRY_CRON_SECRET в env процесса (pm2).
 */
export async function GET(req: Request) {
  const secret = process.env.LISTING_EXPIRY_CRON_SECRET?.trim();
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 500 });
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.rpc("run_listing_expiry_jobs");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data ?? null });
}
