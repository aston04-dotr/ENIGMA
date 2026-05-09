import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/runtimeConfig";
import { resolveRouteHandlerSupabaseUser } from "@/lib/serverSupabaseAuth";
import {
  pipelineChatPhoto,
  sniffIsSvgMagic,
} from "@/lib/server/imageSharpPipeline";
import { MEDIA_UPLOAD_RAW_MAX_BYTES } from "@/lib/imagePipelineConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(request: Request) {
  const { configured } = getSupabasePublicConfig();
  if (!configured) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { supabase, user, fatalRefreshCleared } = await resolveRouteHandlerSupabaseUser(
    "api:media:chat-photo",
  );

  if (fatalRefreshCleared || !user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }

  const file = form.get("file");
  const chatIdRaw =
    typeof form.get("chatId") === "string" ? form.get("chatId")!.trim().toLowerCase() : "";
  if (!(file instanceof File) || !isUuid(chatIdRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_args" }, { status: 400 });
  }

  if (file.size > MEDIA_UPLOAD_RAW_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  if (sniffIsSvgMagic(buf)) {
    return NextResponse.json({ ok: false, error: "svg_rejected" }, { status: 415 });
  }

  let out: Awaited<ReturnType<typeof pipelineChatPhoto>>;
  try {
    out = await pipelineChatPhoto(buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pipeline_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }

  const fid = crypto.randomUUID().replace(/-/g, "");
  const stem = `${chatIdRaw}/${fid}`;
  const pathWebp = `${stem}.webp`;
  const pathAvif = `${stem}.avif`;
  const pathThumb = `${stem}_thumb.webp`;

  const bucket = supabase.storage.from("chat-media");
  for (const u of [
    { path: pathWebp, body: out.webp, contentType: "image/webp" },
    { path: pathAvif, body: out.avif, contentType: "image/avif" },
    { path: pathThumb, body: out.thumbWebp, contentType: "image/webp" },
  ]) {
    const { error } = await bucket.upload(u.path, u.body, {
      upsert: false,
      contentType: u.contentType,
    });
    if (error) {
      console.error("[chat-photo] upload_failed", u.path, error.message);
      return NextResponse.json({ ok: false, error: "storage_upload_failed" }, { status: 502 });
    }
  }

  const url = bucket.getPublicUrl(pathWebp).data.publicUrl?.trim() ?? "";
  const avifUrl = bucket.getPublicUrl(pathAvif).data.publicUrl?.trim() ?? "";
  const thumbUrl = bucket.getPublicUrl(pathThumb).data.publicUrl?.trim() ?? "";
  if (!url) {
    return NextResponse.json({ ok: false, error: "public_url_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url, avifUrl, thumbUrl });
}
