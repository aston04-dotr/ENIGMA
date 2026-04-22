"use client";

import type { Session } from "@supabase/supabase-js";
import { EmptyState } from "@/components/EmptyState";
import {
  ErrorUi,
  FETCH_ERROR_MESSAGE,
  LISTINGS_FEED_ERROR_MESSAGE,
} from "@/components/ErrorUi";
import { LandingScreen } from "@/components/LandingScreen";
import { ListingCard } from "@/components/ListingCard";
import { useAuth } from "@/context/auth-context";
import { ALLOWED_LISTING_CITIES } from "@/lib/russianCities";
import { listingIsRussiaForFeed } from "@/lib/feedGeo";
import {
  fetchListings,
  getCitiesFromDb,
  type FeedListingsCursor,
} from "@/lib/listings";
import { subscribeListingPromotionApplied } from "@/lib/listingPromotionEvents";
import { interleavePartnerFeedMain } from "@/lib/monetization";
import type { ListingRow } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";

const CACHE_KEY = "cached_listings";

type FeedCache = { items: ListingRow[]; nextCursor: FeedListingsCursor | null };

function parseStoredCursor(raw: unknown): FeedListingsCursor | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as { created_at?: unknown; id?: unknown };
  const created_at = String(o.created_at ?? "").trim();
  const id = String(o.id ?? "").trim();
  if (!created_at || !id) return null;
  return { created_at, id };
}

function readFeedCache(): FeedCache {
  if (typeof window === "undefined") return { items: [], nextCursor: null };
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { items: [], nextCursor: null };
    const j = JSON.parse(raw) as
      | FeedCache
      | ListingRow[]
      | { items?: unknown; nextCursor?: unknown };
    if (Array.isArray(j)) return { items: j, nextCursor: null };
    const items = Array.isArray(j.items) ? (j.items as ListingRow[]) : [];
    const nc = parseStoredCursor(j.nextCursor);
    return { items, nextCursor: nc };
  } catch {
    return { items: [], nextCursor: null };
  }
}

function persistFeed(
  items: ListingRow[],
  nextCursor: FeedListingsCursor | null,
) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, nextCursor }));
  } catch {
    /* quota / private mode */
  }
}

function sortByCreatedDesc(rows: ListingRow[]) {
  return [...rows].sort((a, b) => {
    const tb = new Date(b.created_at).getTime();
    const ta = new Date(a.created_at).getTime();
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

function mixFeed(rows: ListingRow[], userId?: string) {
  const sorted = sortByCreatedDesc(rows);
  try {
    const interleaved = interleavePartnerFeedMain(sorted, { userId });
    return Array.isArray(interleaved) ? interleaved : sorted;
  } catch (e) {
    console.error("LISTINGS FEED MIX ERROR", e);
    return sorted;
  }
}

export default function HomePage() {
  const { session, loading } = useAuth();

  if (loading && !session?.user) {
    return <LandingScreen />;
  }

  if (!session?.user) {
    return <LandingScreen />;
  }

  return (
    <div className="min-h-screen bg-main">
      <FeedPage session={session} />
    </div>
  );
}

function FeedPage({ session }: { session: Session }) {
  const feedSeed = useMemo(() => readFeedCache(), []);
  const [items, setItems] = useState<ListingRow[]>(() => feedSeed.items);
  const [nextCursor, setNextCursor] = useState<FeedListingsCursor | null>(
    () => feedSeed.nextCursor,
  );
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedNotice, setFeedNotice] = useState<string | null>(null);
  const [city, setCity] = useState<string>(ALLOWED_LISTING_CITIES[0]);
  const [cities, setCities] = useState<string[]>([...ALLOWED_LISTING_CITIES]);
  const [feedNonce, setFeedNonce] = useState(0);

  useEffect(() => {
    void (async () => {
      const dbCities = await getCitiesFromDb();
      console.log("[CITIES-FEED] Loaded:", dbCities.length, "cities");
      setCities(dbCities);
    })();
  }, []);

  const [showScrollTop, setShowScrollTop] = useState(false);

  const prefetchedRef = useRef<FeedCache | null>(null);
  const prefetchKeyRef = useRef<string | null>(null);
  const prefetchingRef = useRef(false);
  const loadMoreLockRef = useRef(false);
  const lastPrefetchAtRef = useRef(0);
  const lastLoadMoreAtRef = useRef(0);
  const feedFilters = useMemo(() => {
    const f: Parameters<typeof fetchListings>[0] = { city: city.trim() };
    return f;
  }, [city]);

  const filtered = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.filter((x) => {
      if (!listingIsRussiaForFeed(x)) return false;
      return x.city?.toLowerCase().trim() === city.toLowerCase().trim();
    });
  }, [items, city]);

  const applyRes = useCallback(
    (
      res: Awaited<ReturnType<typeof fetchListings>>,
      mode: "replace" | "append",
    ) => {
      const raw = Array.isArray(res.listings) ? res.listings : [];
      setFeedNotice(res.notice ?? null);
      if (res.error) {
        console.error("LISTINGS FETCH ERROR", res.error);
        setFeedError(res.error || LISTINGS_FEED_ERROR_MESSAGE);
        if (mode === "replace") {
          setItems(raw);
          setNextCursor(res.nextCursor ?? null);
          persistFeed(raw, res.nextCursor ?? null);
        }
        return;
      }
      prefetchedRef.current = null;
      prefetchKeyRef.current = null;
      setFeedError(null);
      const mix = mixFeed(raw, session?.user?.id);
      const serverNext = res.nextCursor ?? null;
      if (mode === "replace") {
        setItems(mix);
        setNextCursor(serverNext);
        persistFeed(mix, serverNext);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const add = mix.filter((x) => !seen.has(x.id));
          const merged = [...prev, ...add];
          persistFeed(merged, serverNext);
          return merged;
        });
        setNextCursor(serverNext);
      }
    },
    [session?.user?.id],
  );

  useEffect(() => {
    let cancelled = false;
    prefetchedRef.current = null;
    prefetchKeyRef.current = null;
    (async () => {
      try {
        const res = await fetchListings(feedFilters);
        if (cancelled) return;
        const raw = Array.isArray(res.listings) ? res.listings : [];
        setFeedNotice(res.notice ?? null);
        if (res.error) {
          console.error("LISTINGS FETCH ERROR", res.error);
          setFeedError(res.error || LISTINGS_FEED_ERROR_MESSAGE);
          setItems(raw);
          setNextCursor(res.nextCursor ?? null);
          persistFeed(raw, res.nextCursor ?? null);
          return;
        }
        prefetchedRef.current = null;
        prefetchKeyRef.current = null;
        setFeedError(null);
        const mix = mixFeed(raw, session?.user?.id);
        const serverNext = res.nextCursor ?? null;
        setItems(mix);
        setNextCursor(serverNext);
        persistFeed(mix, serverNext);
      } catch (e) {
        if (cancelled) return;
        console.error("LISTINGS INITIAL FETCH ERROR", e);
        setFeedError(FETCH_ERROR_MESSAGE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feedFilters, session?.user?.id, feedNonce]);

  useEffect(() => {
    return subscribeListingPromotionApplied(() => {
      setFeedNonce((n) => n + 1);
    });
  }, []);

  const runPrefetch = useCallback(async () => {
    if (!nextCursor || prefetchingRef.current) return;
    const key = `${nextCursor.created_at}\0${nextCursor.id}\0${city}`;
    if (prefetchedRef.current && prefetchKeyRef.current === key) return;
    prefetchingRef.current = true;
    try {
      const res = await fetchListings({ ...feedFilters, cursor: nextCursor });
      const raw = Array.isArray(res.listings) ? res.listings : [];
      const mix = mixFeed(raw, session?.user?.id);
      const c = res.nextCursor ?? null;
      prefetchedRef.current = { items: mix, nextCursor: c };
      prefetchKeyRef.current = key;
      console.log("LISTINGS PREFETCH STORED", {
        count: mix.length,
        nextCursor: c,
      });
    } catch (e) {
      console.error("LISTINGS PREFETCH ERROR", e);
    } finally {
      prefetchingRef.current = false;
    }
  }, [nextCursor, feedFilters, city, session?.user?.id]);

  useEffect(() => {
    if (!nextCursor) return;
    const t = window.setTimeout(() => void runPrefetch(), 0);
    return () => window.clearTimeout(t);
  }, [nextCursor, runPrefetch]);

  const flushPrefetch = useCallback(() => {
    const p = prefetchedRef.current;
    if (!p) return false;
    prefetchedRef.current = null;
    prefetchKeyRef.current = null;
    setItems((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      const add = p.items.filter((x) => !seen.has(x.id));
      const merged = [...prev, ...add];
      persistFeed(merged, p.nextCursor);
      return merged;
    });
    setNextCursor(p.nextCursor);
    return true;
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadMoreLockRef.current) return;
    if (flushPrefetch()) return;
    loadMoreLockRef.current = true;
    try {
      const res = await fetchListings({ ...feedFilters, cursor: nextCursor });
      applyRes(res, "append");
    } catch (e) {
      console.error("FETCH ERROR", e);
      setFeedError(FETCH_ERROR_MESSAGE);
    } finally {
      loadMoreLockRef.current = false;
    }
  }, [nextCursor, feedFilters, applyRes, flushPrefetch]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      setShowScrollTop(y > 300);

      const el = document.documentElement;
      const denom = el.scrollHeight - el.clientHeight;
      const ratio = denom > 0 ? el.scrollTop / denom : 0;
      const now = Date.now();
      if (ratio > 0.7 && nextCursor && now - lastPrefetchAtRef.current > 500) {
        lastPrefetchAtRef.current = now;
        void runPrefetch();
      }
      if (ratio > 0.92 && nextCursor && now - lastLoadMoreAtRef.current > 450) {
        lastLoadMoreAtRef.current = now;
        void loadMore();
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [nextCursor, runPrefetch, loadMore]);

  console.log("[CITIES DEBUG] state:", cities?.length, cities);

  const cityOptions = cities.map((c) => ({ value: c, label: c }));

  console.log("[CITIES DEBUG] options:", cityOptions?.length, cityOptions);

  return (
    <main className="safe-pt min-h-screen bg-main">
      <header className="border-b border-line bg-main px-5 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="relative -top-0.5 pb-0.5 bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] bg-clip-text text-[28px] font-bold leading-none tracking-tight text-transparent">
              Enigma
            </h1>
          </div>
        </div>
        <div className="mt-6">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
            Город
          </label>
          <div className="mt-2">
            <Select
              value={cityOptions.find((option) => option.value === city)}
              onChange={(selectedOption) =>
                setCity(selectedOption?.value || ALLOWED_LISTING_CITIES[0])
              }
              options={cityOptions}
              placeholder="Выберите город"
              isSearchable={false}
              className="react-select-container"
              classNamePrefix="react-select"
            />
          </div>
        </div>
      </header>

      {feedNotice ? (
        <div className="border-b border-line bg-elev-2/80 px-5 py-3">
          <p className="text-xs font-medium text-muted">{feedNotice}</p>
        </div>
      ) : null}
      {feedError ? (
        <div className="px-5 pt-4">
          <ErrorUi text={feedError} />
        </div>
      ) : null}

      <div className="px-5 pb-6 pt-2">
        {filtered.map((item) => (
          <ListingCard key={item.id} item={item} />
        ))}
        {filtered.length === 0 ? (
          <EmptyState title="Пока нет объявлений. Будь первым 🔥" />
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Наверх"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-[calc(64px+env(safe-area-inset-bottom)+16px)] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-elevated text-lg font-bold text-fg shadow-soft transition-all duration-[250ms] ease-out ${
          showScrollTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        ↑
      </button>
    </main>
  );
}
