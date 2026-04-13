-- Лента: флаг буста для сортировки; не более 5 объявлений на пользователя за календарный день (UTC).

alter table public.listings
  add column if not exists is_boosted boolean not null default false;

create index if not exists idx_listings_feed_sort on public.listings (
  is_boosted desc,
  created_at desc,
  id desc
);

create or replace function public.listings_enforce_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*)::int into cnt
  from public.listings
  where user_id = new.user_id
    and (created_at at time zone 'utc')::date = (timezone('utc', now()))::date;

  if cnt >= 5 then
    raise exception 'LISTING_DAILY_LIMIT'
      using message = 'Maximum 5 listings per calendar day (UTC)',
            errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists listings_daily_limit_bi on public.listings;
create trigger listings_daily_limit_bi
  before insert on public.listings
  for each row
  execute function public.listings_enforce_daily_limit();
