-- Enforce city whitelist for listings and city dictionary.
-- Allowed values: Москва, Сочи.

begin;

-- Normalize legacy values: anything outside whitelist becomes NULL
-- (and is hidden in UI/feed by fallback filtering).
update public.listings
set city = null
where city is null
   or btrim(city) = ''
   or city not in ('Москва', 'Сочи');

-- Ensure only allowed city values are accepted going forward.
alter table public.listings
  drop constraint if exists listings_city_moscow_sochi_check;

alter table public.listings
  add constraint listings_city_moscow_sochi_check
  check (city is null or city in ('Москва', 'Сочи'));

-- Keep city dictionary aligned with UI select.
-- Works for both schemas where cities is a reference dictionary table.
delete from public.cities
where name not in ('Москва', 'Сочи');

insert into public.cities (name)
values ('Москва'), ('Сочи')
on conflict (name) do nothing;

commit;
