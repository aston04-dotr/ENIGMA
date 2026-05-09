/**
 * Лёгкий клиентский downscale до Sharp-пайплайна: меньше RAM в Safari/Android,
 * быстрее upload; сервер всё равно перекодирует в WebP/AVIF без EXIF.
 */
import { MEDIA_UPLOAD_RAW_MAX_BYTES } from "@/lib/imagePipelineConfig";

/** Выше этого ребра — Canvas JPEG перед отправкой на /api/media/listing-photo. */
const CLIENT_LISTING_MAX_EDGE_PX = 3072;

const JPEG_QUALITY = 0.9;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = src;
  });
}

function sniffSvgAtStart(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const slice = file.slice(0, 256);
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result ?? "").trimStart();
      resolve(s.includes("<svg"));
    };
    fr.onerror = () => resolve(false);
    fr.readAsText(slice);
  });
}

/**
 * Сжимает крупные растры в JPEG (без EXIF в выходе).
 * HEIC/неподдерживаемый декодер → возвращает исходный File.
 */
export async function normalizeListingPickForUpload(file: File): Promise<File> {
  if (file.size > MEDIA_UPLOAD_RAW_MAX_BYTES) {
    throw new Error("file_too_large");
  }
  if (await sniffSvgAtStart(file)) {
    throw new Error("svg_rejected");
  }

  const u = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(u);
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error("bad_dims");

    const maxEdge = Math.max(w0, h0);
    const scale = maxEdge > CLIENT_LISTING_MAX_EDGE_PX ? CLIENT_LISTING_MAX_EDGE_PX / maxEdge : 1;
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    if (scale >= 0.999 && file.size <= 2 * 1024 * 1024 && /^image\/jpe?g$/i.test(file.type)) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_ctx");
    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size < 32) throw new Error("encode_fail");

    const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${stem}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(u);
  }
}

export function mapListingPhotoUploadUiError(raw: unknown): string {
  const s =
    typeof raw === "string"
      ? raw
      : raw instanceof Error && raw.message
        ? raw.message
        : "Не удалось загрузить фото";
  const t = s.toLowerCase();
  if (t.includes("file_too_large")) return "Файл слишком большой (лимит 15 МБ)";
  if (t.includes("svg_rejected")) return "Формат SVG не поддерживается";
  if (t.includes("unauthorized")) return "Сессия истекла — вернитесь в аккаунт";
  if (t.includes("network") || t.includes("failed to fetch")) return "Нет сети. Проверьте соединение и попробуйте снова";
  if (t.includes("storage_upload_failed")) return "Хранилище недоступно, попробуйте позже";
  if (t.includes("pipeline_failed") || t.includes("decode") || t.includes("422")) {
    return "Не удалось обработать фото. Выберите другой файл (JPEG, PNG, WebP)";
  }
  return s || "Не удалось загрузить фото";
}

export function preferListingPhotoChooserSheet(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const coarse =
      typeof window.matchMedia !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches;
    const noHover =
      typeof window.matchMedia !== "undefined" &&
      window.matchMedia("(hover: none)").matches;
    return Boolean(coarse || noHover);
  } catch {
    return false;
  }
}
