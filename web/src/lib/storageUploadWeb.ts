import { normalizeListingPickForUpload } from "./listingPhotoClient";
import { supabase } from "./supabase";

function parseStorageError(error: unknown): string {
  if (!error) return "Не удалось загрузить фото";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Не удалось загрузить фото";
  if (typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
    try {
      const asJson = JSON.stringify(error);
      if (asJson && asJson !== "{}") return asJson;
    } catch {
      return "Не удалось загрузить фото";
    }
  }
  return "Не удалось загрузить фото";
}

function decodePathPart(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isGracefulStorageRemoveError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { statusCode?: string | number; message?: string; code?: string };
  const status = String(e.statusCode ?? "");
  const msg = String(e.message ?? "").toLowerCase();
  const code = String(e.code ?? "").toLowerCase();
  return (
    status === "403" ||
    status === "404" ||
    msg.includes("not found") ||
    msg.includes("permission denied") ||
    code.includes("not_found") ||
    code.includes("permission")
  );
}

export function extractListingImageStoragePath(url: string): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").map((x) => x.trim()).filter(Boolean);
    const objectIdx = parts.indexOf("object");
    if (objectIdx === -1) return null;

    const visibility = parts[objectIdx + 1];
    const bucket = parts[objectIdx + 2];
    if (!visibility || !bucket || bucket !== "listing-images") return null;

    const pathParts = parts.slice(objectIdx + 3).map(decodePathPart);
    const path = pathParts.join("/").trim();
    return path || null;
  } catch {
    return null;
  }
}

/** Рядом с основным `.webp` лежат `.avif` и `_thumb.webp` (pipeline Sharp). */
function expandListingDerivativePaths(primaryPath: string): string[] {
  const trimmed = primaryPath.trim();
  if (!trimmed) return [];
  if (!trimmed.toLowerCase().endsWith(".webp")) return [trimmed];
  const stem = trimmed.replace(/\.webp$/i, "");
  const out = [trimmed, `${stem}.avif`, `${stem}_thumb.webp`];
  return Array.from(new Set(out));
}

export function collectListingRemovePaths(primaryPublicUrls: string[]): string[] {
  const acc = new Set<string>();
  for (const raw of primaryPublicUrls) {
    const main = extractListingImageStoragePath(String(raw ?? ""));
    if (!main) continue;
    for (const p of expandListingDerivativePaths(main)) {
      acc.add(p);
    }
  }
  return Array.from(acc);
}

export async function removeListingImagesFromStorage(urls: string[]): Promise<void> {
  const uniquePaths = collectListingRemovePaths(Array.isArray(urls) ? urls : []);
  if (uniquePaths.length === 0) return;

  for (const path of uniquePaths) {
    const { error } = await supabase.storage.from("listing-images").remove([path]);
    if (!error) continue;
    if (isGracefulStorageRemoveError(error)) {
      console.warn("listing-images remove skipped", { path, error });
      continue;
    }
    throw new Error(parseStorageError(error));
  }
}

export type ListingPhotoUploadCallbacks = {
  onUploadProgress?: (percent: number) => void;
};

function uploadListingPhotoSharpPipelineXHR(
  objectGroupId: string,
  file: File,
  index: number,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("file", file);
    form.set("objectGroupId", objectGroupId);
    form.set("index", String(index));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/listing-photo");
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.upload.onprogress = (ev) => {
      if (!onProgress) return;
      if (ev.lengthComputable && ev.total > 0) {
        onProgress(Math.min(100, Math.round((100 * ev.loaded) / ev.total)));
      } else {
        onProgress(0);
      }
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.onload = () => {
      let data: { ok?: boolean; url?: string; error?: string };
      try {
        data = JSON.parse(xhr.responseText || "{}") as {
          ok?: boolean;
          url?: string;
          error?: string;
        };
      } catch {
        reject(new Error("bad_response"));
        return;
      }
      const ok = xhr.status >= 200 && xhr.status < 300 && data?.ok !== false && Boolean(data?.url?.trim());
      if (!ok) {
        reject(new Error(data?.error || `listing_pipeline_${xhr.status}`));
        return;
      }
      resolve(String(data.url).trim());
    };
    xhr.send(form);
  });
}

export async function uploadListingPhotoWeb(
  userId: string,
  objectGroupId: string,
  file: File,
  index: number,
  callbacks?: ListingPhotoUploadCallbacks,
): Promise<string> {
  const prepared = await normalizeListingPickForUpload(file);
  const onProgress = callbacks?.onUploadProgress;
  try {
    return await uploadListingPhotoSharpPipelineXHR(
      objectGroupId,
      prepared,
      index,
      onProgress,
    );
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[uploadListingPhotoWeb] sharp pipeline failed, legacy upload", e);
    }
  }

  const extRaw = prepared.name.split(".").pop() || "jpg";
  const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const contentType = prepared.type?.trim() || "image/jpeg";
  const path = `${userId}/${objectGroupId}/${index}-${Date.now()}.${ext}`;

  try {
    if (onProgress) onProgress(0);
    const data = await prepared.arrayBuffer();
    if (onProgress) onProgress(85);
    const { error } = await supabase.storage.from("listing-images").upload(path, data, {
      upsert: true,
      contentType,
    });
    if (error) {
      throw new Error(parseStorageError(error));
    }
    if (onProgress) onProgress(100);
  } catch (error) {
    throw new Error(parseStorageError(error));
  }

  const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
  const publicUrl = data?.publicUrl?.trim();
  if (!publicUrl) {
    throw new Error("Не удалось получить ссылку на фото");
  }
  return publicUrl;
}
