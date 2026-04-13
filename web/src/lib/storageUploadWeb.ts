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

export async function uploadListingPhotoWeb(
  userId: string,
  listingId: string,
  file: File,
  index: number
): Promise<string> {
  const extRaw = file.name.split(".").pop() || "jpg";
  const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const contentType = file.type?.trim() || "image/jpeg";
  const path = `${userId}/${listingId}/${index}-${Date.now()}.${ext}`;

  try {
    const data = await file.arrayBuffer();
    const { error } = await supabase.storage.from("listing-images").upload(path, data, {
      upsert: true,
      contentType,
    });
    if (error) throw error;
  } catch (error) {
    throw new Error(parseStorageError(error));
  }

  const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
  return data.publicUrl;
}
