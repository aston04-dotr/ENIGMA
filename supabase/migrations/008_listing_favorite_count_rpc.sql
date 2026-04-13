-- Агрегаты избранного для UI (RLS на favorites не даёт честный count через embed).

create or replace function public.listing_favorites_count(listing uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer from public.favorites where listing_id = listing;
$$;

grant execute on function public.listing_favorites_count(uuid) to anon, authenticated;

create or replace function public.listing_favorites_counts(p_ids uuid[])
returns table (listing_id uuid, favorite_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select f.listing_id, count(*)::bigint
  from public.favorites f
  where f.listing_id = any(p_ids)
  group by f.listing_id;
$$;

grant execute on function public.listing_favorites_counts(uuid[]) to anon, authenticated;
