-- City districts for real estate (sale + rent), without frontend hardcode.

begin;

create extension if not exists pgcrypto;

create table if not exists public.city_districts (
  id uuid primary key default gen_random_uuid(),
  region_id text not null,
  city_id text not null,
  name text not null,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city_id, name)
);

create index if not exists idx_city_districts_city_active_sort
  on public.city_districts (city_id, is_active, sort_order, name);

create index if not exists idx_city_districts_region_city
  on public.city_districts (region_id, city_id);

alter table public.listings
  add column if not exists city_id text;

alter table public.listings
  add column if not exists district text;

alter table public.listings
  add column if not exists district_id uuid;

create index if not exists idx_listings_city_district
  on public.listings (city, district, created_at desc, id desc)
  where status = 'active';

update public.listings l
set city_id = c.id::text
from public.cities c
where l.city_id is null
  and lower(trim(coalesce(l.city, ''))) = lower(trim(coalesce(c.name, '')));

-- Seed core production districts. The join by names keeps it environment-safe.
with seed(region_name, city_name, district_name, sort_order) as (
  values
    -- Краснодарский край / Сочи
    ('Краснодарский край', 'Сочи', 'Адлерский район', 10),
    ('Краснодарский край', 'Сочи', 'Хостинский район', 20),
    ('Краснодарский край', 'Сочи', 'Центральный район', 30),
    ('Краснодарский край', 'Сочи', 'Лазаревский район', 40),
    ('Краснодарский край', 'Сочи', 'Красная Поляна', 50),

    -- Москва / МО
    ('Москва и Московская область', 'Москва', 'ЦАО', 10),
    ('Москва и Московская область', 'Москва', 'САО', 20),
    ('Москва и Московская область', 'Москва', 'СВАО', 30),
    ('Москва и Московская область', 'Москва', 'ВАО', 40),
    ('Москва и Московская область', 'Москва', 'ЮВАО', 50),
    ('Москва и Московская область', 'Москва', 'ЮАО', 60),
    ('Москва и Московская область', 'Москва', 'ЮЗАО', 70),
    ('Москва и Московская область', 'Москва', 'ЗАО', 80),
    ('Москва и Московская область', 'Москва', 'СЗАО', 90),
    ('Москва и Московская область', 'Москва', 'Зеленоград', 100),
    ('Москва и Московская область', 'Москва', 'ТиНАО', 110),
    ('Москва и Московская область', 'Балашиха', 'Центральный', 10),
    ('Москва и Московская область', 'Балашиха', 'Железнодорожный', 20),
    ('Москва и Московская область', 'Мытищи', 'Центральный', 10),
    ('Москва и Московская область', 'Химки', 'Старые Химки', 10),
    ('Москва и Московская область', 'Химки', 'Новые Химки', 20),

    -- СПб / ЛО
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Адмиралтейский', 10),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Василеостровский', 20),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Выборгский', 30),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Калининский', 40),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Кировский', 50),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Красногвардейский', 60),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Красносельский', 70),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Московский', 80),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Невский', 90),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Петроградский', 100),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Приморский', 110),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Фрунзенский', 120),
    ('Санкт-Петербург и Ленинградская область', 'Санкт-Петербург', 'Центральный', 130),

    -- Краснодарский край / Краснодар
    ('Краснодарский край', 'Краснодар', 'Западный округ', 10),
    ('Краснодарский край', 'Краснодар', 'Карасунский округ', 20),
    ('Краснодарский край', 'Краснодар', 'Прикубанский округ', 30),
    ('Краснодарский край', 'Краснодар', 'Центральный округ', 40),

    -- Ростовская область
    ('Ростовская область', 'Ростов-на-Дону', 'Ворошиловский', 10),
    ('Ростовская область', 'Ростов-на-Дону', 'Железнодорожный', 20),
    ('Ростовская область', 'Ростов-на-Дону', 'Кировский', 30),
    ('Ростовская область', 'Ростов-на-Дону', 'Ленинский', 40),
    ('Ростовская область', 'Ростов-на-Дону', 'Октябрьский', 50),
    ('Ростовская область', 'Ростов-на-Дону', 'Первомайский', 60),
    ('Ростовская область', 'Ростов-на-Дону', 'Пролетарский', 70),
    ('Ростовская область', 'Ростов-на-Дону', 'Советский', 80),

    -- Ставропольский край
    ('Ставропольский край', 'Ставрополь', 'Ленинский', 10),
    ('Ставропольский край', 'Ставрополь', 'Октябрьский', 20),
    ('Ставропольский край', 'Ставрополь', 'Промышленный', 30)
),
matched as (
  select
    r.id::text as region_id,
    c.id::text as city_id,
    s.district_name,
    s.sort_order
  from seed s
  join public.regions r
    on lower(trim(r.name)) = lower(trim(s.region_name))
  join public.cities c
    on lower(trim(c.name)) = lower(trim(s.city_name))
   and c.region_id::text = r.id::text
)
insert into public.city_districts (region_id, city_id, name, sort_order, is_active)
select
  m.region_id,
  m.city_id,
  m.district_name,
  m.sort_order,
  true
from matched m
on conflict (city_id, name)
do update set
  region_id = excluded.region_id,
  sort_order = excluded.sort_order,
  is_active = true;

commit;
