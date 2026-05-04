"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import { applyFavoriteCountFromServer } from "@/lib/listings";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * Подписка на UPDATE listings по id: синхронизация favorite_count между клиентами
 * (триггер на insert/delete в таблице избранного обновляет listings.favorite_count).
 */
export function useListingFavoriteRealtime(
  listingId: string | null | undefined,
  setFavoriteCount: Dispatch<SetStateAction<number>>,
): void {
  useEffect(() => {
    const id = String(listingId ?? "").trim();
    if (!id || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`listing-fav-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "listings",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const raw = (payload.new as Record<string, unknown> | null)?.favorite_count;
          if (raw == null || raw === "") return;
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) return;
          applyFavoriteCountFromServer(id, n);
          setFavoriteCount(n);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [listingId, setFavoriteCount]);
}
