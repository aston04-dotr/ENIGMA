-- Денормализованный счётчик избранного на listings для Realtime:
-- владелец не видит чужие строки listing_favorites/favorites (RLS), но видит UPDATE своего объявления.

alter table public.listings add column if not exists favorite_count integer not null default 0;

-- Пересчёт из фактической таблицы избранного (web-клиент: listing_favorites; legacy: favorites).
do $$
begin
  if exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = 'listing_favorites'
  ) then
    update public.listings l
    set favorite_count = coalesce(
      (select count(*)::integer from public.listing_favorites f where f.listing_id = l.id),
      0
    );
  elsif exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = 'favorites'
  ) then
    update public.listings l
    set favorite_count = coalesce(
      (select count(*)::integer from public.favorites f where f.listing_id = l.id),
      0
    );
  end if;
end $$;

create or replace function public.listings_adjust_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.listing_id is null then
      return new;
    end if;
    update public.listings
    set favorite_count = coalesce(favorite_count, 0) + 1
    where id = new.listing_id;
    return new;
  elsif tg_op = 'DELETE' then
    if old.listing_id is null then
      return old;
    end if;
    update public.listings
    set favorite_count = greatest(0, coalesce(favorite_count, 0) - 1)
    where id = old.listing_id;
    return old;
  end if;
  return null;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = 'listing_favorites'
  ) then
    execute 'drop trigger if exists tr_listings_favorite_count_io on public.listing_favorites';
    execute $tr$
      create trigger tr_listings_favorite_count_io
        after insert or delete on public.listing_favorites
        for each row
        execute function public.listings_adjust_favorite_count()
    $tr$;
  end if;

  if exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = 'favorites'
  ) then
    execute 'drop trigger if exists tr_listings_favorite_count_io on public.favorites';
    execute $tr$
      create trigger tr_listings_favorite_count_io
        after insert or delete on public.favorites
        for each row
        execute function public.listings_adjust_favorite_count()
    $tr$;
  end if;
end $$;

-- Публикация Realtime (повторный add без падения миграции).
do $$
begin
  alter publication supabase_realtime add table public.listings;
exception when others then
  raise notice 'supabase_realtime add listings: %', sqlerrm;
end $$;
