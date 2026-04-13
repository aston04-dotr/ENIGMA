import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("admin.deleteUser", delErr);
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
