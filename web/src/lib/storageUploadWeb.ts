import { supabase } from "./supabase";

function parseStorageError(error: unknown): string {
  if (!error) return "Не удалось загрузить фото";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Не удалось загрузить фото";
  if (typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
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

    // Supported forms:
    // /storage/v1/object/public/listing-images/<path>
    // /storage/v1/object/sign/listing-images/<path>
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

export async function removeListingImagesFromStorage(urls: string[]): Promise<void> {
  const uniquePaths = Array.from(
    new Set(
      (Array.isArray(urls) ? urls : [])
        .map(extractListingImageStoragePath)
        .filter((x): x is string => Boolean(x)),
    ),
  );
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

export async function uploadListingPhotoWeb(
  userId: string,
  objectGroupId: string,
  file: File,
  index: number
): Promise<string> {
  const extRaw = file.name.split(".").pop() || "jpg";
  const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const contentType = file.type?.trim() || "image/jpeg";
  const path = `${userId}/${objectGroupId}/${index}-${Date.now()}.${ext}`;

  try {
    const data = await file.arrayBuffer();
    const { error } = await supabase.storage.from("listing-images").upload(path, data, {
      upsert: true,
      contentType,
    });
    if (error) {
      throw new Error(parseStorageError(error));
    }
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
