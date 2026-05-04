import { supabase } from "@/lib/supabase";

export async function renewListingPublication(
  listingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(listingId ?? "").trim();
  if (!id) return { ok: false, error: "Некорректное объявление" };

  const { error } = await supabase.rpc("renew_listing", { p_listing_id: id });
  if (error) {
    return { ok: false, error: error.message || "Не удалось продлить" };
  }
  return { ok: true };
}
