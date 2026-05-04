import { removeListingImagesFromStorage } from "@/lib/storageUploadWeb";
import { supabase } from "@/lib/supabase";

export async function ownerArchiveListing(
  listingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(listingId ?? "").trim();
  if (!id) return { ok: false, error: "Некорректное объявление" };
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { ok: false, error: "Войдите в аккаунт" };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("listings")
    .update({ status: "expired", expires_at: now, updated_at: now } as never)
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { ok: false, error: error.message || "Не удалось архивировать" };
  return { ok: true };
}

export async function ownerDeleteListing(
  listingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(listingId ?? "").trim();
  if (!id) return { ok: false, error: "Некорректное объявление" };
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { ok: false, error: "Войдите в аккаунт" };

  const { data: listingImages, error: listingImagesError } = await supabase
    .from("images")
    .select("url")
    .eq("listing_id", id);
  if (listingImagesError) {
    console.warn("LISTING IMAGES LOAD ERROR", listingImagesError);
  }
  const imageUrls = Array.isArray(listingImages)
    ? listingImages
        .map((row) => String((row as { url?: unknown })?.url ?? "").trim())
        .filter(Boolean)
    : [];

  const { error } = await supabase.from("listings").delete().eq("id", id).eq("user_id", uid);
  if (error) return { ok: false, error: error.message || "Не удалось удалить" };

  try {
    await removeListingImagesFromStorage(imageUrls);
  } catch (storageError) {
    console.warn("LISTING STORAGE DELETE ERROR", storageError);
  }
  return { ok: true };
}
