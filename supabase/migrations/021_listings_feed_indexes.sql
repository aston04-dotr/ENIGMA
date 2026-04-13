-- Feed performance (fetchListings): city filter + prefix ILIKE on title.
-- Индексы по created_at DESC и category уже есть в schema.sql (idx_listings_created, idx_listings_category).

CREATE INDEX IF NOT EXISTS idx_listings_city ON public.listings (city);

-- Prefix search: title ILIKE 'x%' — btree + varchar_pattern_ops на lower(title).
CREATE INDEX IF NOT EXISTS idx_listings_title_lower_pattern ON public.listings (lower(title::text) varchar_pattern_ops);
