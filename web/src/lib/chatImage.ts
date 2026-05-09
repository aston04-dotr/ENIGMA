import { supabase } from "./supabase";

const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_COMPRESS_W = 1600;
const JPEG_Q = 0.8;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load"));
    img.src = src;
  });
}

/**
 * Сжатие в JPEG перед upload: max width ~1600, quality 0.8.
 * Ошибка (HEIC/декодер) → оригинал File, если size ок.
 */
export async function compressImageForChat(file: File): Promise<Blob> {
  const u = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(u);
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error("bad dims");
    const scale = w0 > MAX_COMPRESS_W ? MAX_COMPRESS_W / w0 : 1;
    const cw = Math.max(1, Math.round(w0 * scale));
    const ch = Math.max(1, Math.round(h0 * scale));
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, ch);
    const b = await new Promise<Blob | null>((res) =>
      c.toBlob((x) => res(x), "image/jpeg", JPEG_Q),
    );
    if (!b || b.size < 1) throw new Error("toBlob");
    if (b.size > MAX_CHAT_IMAGE_BYTES) throw new Error("file_too_large");
    return b;
  } catch {
    if (file.size > MAX_CHAT_IMAGE_BYTES) {
      throw new Error("file_too_large");
    }
    return file;
  } finally {
    URL.revokeObjectURL(u);
  }
}

/**
 * @returns null = ok, иначе сообщение об ошибке
 */
export function validateChatImageFile(file: File): string | null {
  if (file.size > MAX_CHAT_IMAGE_BYTES) {
    return "Максимум 5 МБ на фото.";
  }
  const t = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (t === "image/svg+xml" || name.endsWith(".svg") || name.endsWith(".svgz")) {
    return "SVG не разрешён.";
  }
  if (t && !t.startsWith("image/")) {
    return "Нужен файл изображения.";
  }
  if (!t) {
    const n = (file.name || "").toLowerCase();
    if (!/\.(jpe?g|png|gif|webp|heic|heif|bmp)$/.test(n)) {
      return "Нужен файл изображения.";
    }
  }
  return null;
}

const MIME_FOR_KIND: Record<"jpeg" | "png" | "gif" | "webp", string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

type DetectedKind = "jpeg" | "png" | "gif" | "webp" | "heic" | "unknown";

function detectKindFromBytes(buf: Uint8Array): DetectedKind {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "png";
  }
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return "gif";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }
  if (buf.length >= 8) {
    const box = new TextDecoder("ascii", { fatal: false }).decode(
      buf.subarray(4, 8),
    );
    if (box === "ftyp") {
      return "heic";
    }
  }
  return "unknown";
}

/**
 * Сверка сигнатуры, заявленного mime и расширения (анти-спуф).
 */
export async function verifyImageFileIntegrity(
  file: File,
): Promise<string | null> {
  const buf = new Uint8Array(await file.slice(0, 20).arrayBuffer());
  if (buf.length < 2) {
    return "Файл повреждён.";
  }

  const t = (file.type || "").toLowerCase();
  if (t === "image/svg+xml") {
    return "SVG не разрешён.";
  }

  const m = (file.name || "")
    .toLowerCase()
    .match(/(\.[a-z0-9]+)$/) as RegExpMatchArray | null;
  const ext = m?.[1] ?? "";
  if (t === "image/heic" || t === "image/heif" || ext === ".heic" || ext === ".heif") {
    if (t && t !== "image/heic" && t !== "image/heif" && t !== "application/octet-stream") {
      if (!t.startsWith("image/")) {
        return "Нужен файл изображения.";
      }
    }
    return null;
  }

  const kind = detectKindFromBytes(buf);

  if (kind === "unknown") {
    if (t.startsWith("image/") && t !== "application/octet-stream") {
      return "Файл не похож на изображение.";
    }
    return "Не удалось проверить изображение.";
  }

  if (t && t !== "application/octet-stream") {
    const expected = MIME_FOR_KIND[kind as keyof typeof MIME_FOR_KIND];
    if (expected) {
      if (t === "image/pjpeg" && kind === "jpeg") {
        return null;
      }
      if (t !== expected) {
        return "Тип файла не совпадает с содержимым.";
      }
    }
  }

  if (ext) {
    const ok =
      (kind === "jpeg" && [".jpg", ".jpeg", ".jpe"].includes(ext)) ||
      (kind === "png" && ext === ".png") ||
      (kind === "gif" && ext === ".gif") ||
      (kind === "webp" && ext === ".webp") ||
      (kind === "heic" && (ext === ".heic" || ext === ".heif"));
    if (!ok) {
      return "Расширение не соответствует содержимому.";
    }
  }
  return null;
}

/**
 * Синхронные проверки + чтение байт (вызвать из UI перед сжатием).
 */
export async function validateChatImageFileDeep(
  file: File,
): Promise<string | null> {
  const fast = validateChatImageFile(file);
  if (fast) {
    return fast;
  }
  return verifyImageFileIntegrity(file);
}

/**
 * w/h (ширина/высота) для aspect-ratio.
 */
export function getAspectFromObjectUrl(objectUrl: string): Promise<number> {
  if (typeof window === "undefined") {
    return Promise.resolve(4 / 3);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const w = img.naturalWidth;
      const h = Math.max(1, img.naturalHeight);
      const r = w / h;
      resolve(Number.isFinite(r) && r > 0 ? r : 4 / 3);
    };
    img.onerror = () => resolve(4 / 3);
    img.src = objectUrl;
  });
}

/**
 * Обертка прогресса 0…100 при upload+insert.
 */
export async function withUploadProgress<T>(
  work: () => Promise<T>,
  onProgress: (n: number) => void,
): Promise<T> {
  let t: ReturnType<typeof setInterval> | null = null;
  let v = 2;
  onProgress(2);
  t = setInterval(() => {
    v = Math.min(90, v + 4 + Math.random() * 2);
    onProgress(Math.min(90, Math.round(v)));
  }, 110);
  try {
    const r = await work();
    onProgress(100);
    return r;
  } finally {
    if (t) {
      clearInterval(t);
    }
  }
}

function extFromMime(m: string): string {
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "image/heic" || m === "image/heif") return "heic";
  if (m === "image/jpeg" || m === "image/pjpeg") return "jpg";
  return "jpg";
}

/**
 * Путь в bucket: {chatId}/{uuid}.{ext}, lowercase, ext fallback jpg.
 */
export function makeChatImageStoragePath(
  chatId: string,
  uploadBlob: Blob,
  sourceFile: File,
): string {
  const id = crypto.randomUUID();
  const ext = (
    uploadBlob.type === "image/jpeg" ? "jpg" : extFromMime(uploadBlob.type || sourceFile.type)
  )
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "jpg";
  return `${chatId.toLowerCase()}/${id.toLowerCase()}.${ext}`.toLowerCase();
}

/** Сервер Sharp: WebP + AVIF + thumb в `chat-media` (cookie session). */
export async function uploadChatPhotoViaSharpPipeline(
  file: File,
  chatId: string,
): Promise<string> {
  const form = new FormData();
  form.set("file", file);
  form.set("chatId", chatId.trim().toLowerCase());
  const res = await fetch("/api/media/chat-photo", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    error?: string;
  };
  if (!res.ok || !data?.url?.trim()) {
    throw new Error(data?.error || `chat_pipeline_${res.status}`);
  }
  return data.url.trim();
}

/**
 * Сначала пайплайн Sharp; при ошибке сети/Vercel — локальное JPEG-сжатие + прямой upload.
 */
export async function uploadChatImagePublicUrlPreferPipeline(
  file: File,
  chatId: string,
): Promise<string> {
  try {
    return await uploadChatPhotoViaSharpPipeline(file, chatId);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[chatImage] sharp upload fallback", e);
    }
    const blob = await compressImageForChat(file);
    const path = makeChatImageStoragePath(chatId, blob, file);
    const { error: upErr } = await supabase.storage.from("chat-media").upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      upsert: false,
    });
    if (upErr) {
      throw new Error(upErr.message || "chat_upload_failed");
    }
    const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
    const u = pub.publicUrl?.trim();
    if (!u) throw new Error("no_public_url");
    return u;
  }
}
