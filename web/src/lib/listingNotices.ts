import { supabase } from "@/lib/supabase";

export type ListingOwnerNoticeRow = {
  id: string;
  user_id?: string;
  listing_id: string | null;
  kind: string;
  body: string;
  created_at: string;
};

export async function fetchListingOwnerNotices(limit = 25): Promise<ListingOwnerNoticeRow[]> {
  const { data, error } = await supabase
    .from("listing_owner_notices")
    .select("id, listing_id, kind, body, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));

  if (error || !Array.isArray(data)) {
    if (error && process.env.NODE_ENV === "development") {
      console.warn("listing_owner_notices load:", error.message);
    }
    return [];
  }
  return data as ListingOwnerNoticeRow[];
}
