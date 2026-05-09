import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getSupabasePublicConfig } from "@/lib/runtimeConfig";
import {
  pipelineListingPhoto,
  sniffIsSvgMagic,
} from "@/lib/server/imageSharpPipeline";
import { MEDIA_UPLOAD_RAW_MAX_BYTES } from "@/lib/imagePipelineConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeObjectGroupId(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s.length > 96) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

function safeIndex(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? ""));
  if (!Number.isFinite(n) || n < 0 || n > 64) return null;
  return Math.floor(n);
}

export async function POST(request: Request) {
  const { configured } = getSupabasePublicConfig();
  if (!configured) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }

  const file = form.get("file");
  const objectGroupId = safeObjectGroupId(form.get("objectGroupId"));
  const index = safeIndex(form.get("index"));
  if (!(file instanceof File) || !objectGroupId || index == null) {
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

  let out: Awaited<ReturnType<typeof pipelineListingPhoto>>;
  try {
    out = await pipelineListingPhoto(buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pipeline_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }

  const stem = `${user.id}/${objectGroupId}/${index}-${Date.now()}`;
  const pathWebp = `${stem}.webp`;
  const pathAvif = `${stem}.avif`;
  const pathThumb = `${stem}_thumb.webp`;

  const uploads: { path: string; body: Buffer; contentType: string }[] = [
    { path: pathWebp, body: out.webp, contentType: "image/webp" },
    { path: pathAvif, body: out.avif, contentType: "image/avif" },
    { path: pathThumb, body: out.thumbWebp, contentType: "image/webp" },
  ];

  for (const u of uploads) {
    const { error } = await supabase.storage.from("listing-images").upload(u.path, u.body, {
      upsert: true,
      contentType: u.contentType,
    });
    if (error) {
      console.error("[listing-photo] upload_failed", u.path, error.message);
      return NextResponse.json({ ok: false, error: "storage_upload_failed" }, { status: 502 });
    }
  }

  const bucket = supabase.storage.from("listing-images");
  const pub = (p: string) => bucket.getPublicUrl(p).data.publicUrl?.trim() ?? "";

  const url = pub(pathWebp);
  const avifUrl = pub(pathAvif);
  const thumbUrl = pub(pathThumb);
  if (!url || !avifUrl || !thumbUrl) {
    return NextResponse.json({ ok: false, error: "public_url_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url, avifUrl, thumbUrl });
}
