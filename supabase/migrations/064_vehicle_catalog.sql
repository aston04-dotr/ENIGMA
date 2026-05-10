-- Справочник авто для каталогового выбора (страна → марка → модель).
-- Публичное чтение; правки данных — через сервис-роль / админ-панель позже.

create table if not exists public.car_catalog_countries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ru text not null,
  name_en text not null default '',
  flag_emoji text,
  iso_code character varying(2),
  aliases jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint car_catalog_countries_aliases_is_array check (jsonb_typeof(aliases) = 'array')
);

create table if not exists public.car_catalog_brands (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.car_catalog_countries (id) on delete cascade,
  slug text not null,
  name_ru text not null,
  name_en text not null default '',
  aliases jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (country_id, slug),
  constraint car_catalog_brands_aliases_is_array check (jsonb_typeof(aliases) = 'array')
);

create table if not exists public.car_catalog_models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.car_catalog_brands (id) on delete cascade,
  slug text not null,
  name_ru text not null,
  name_en text not null default '',
  aliases jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, slug),
  constraint car_catalog_models_aliases_is_array check (jsonb_typeof(aliases) = 'array')
);

create index if not exists car_catalog_brands_country_idx on public.car_catalog_brands (country_id);
create index if not exists car_catalog_models_brand_idx on public.car_catalog_models (brand_id);
create index if not exists car_catalog_brands_name_ru_idx on public.car_catalog_brands (name_ru);
create index if not exists car_catalog_models_name_ru_idx on public.car_catalog_models (name_ru);

alter table public.car_catalog_countries enable row level security;
alter table public.car_catalog_brands enable row level security;
alter table public.car_catalog_models enable row level security;

drop policy if exists "car_catalog_countries_select" on public.car_catalog_countries;
create policy "car_catalog_countries_select"
on public.car_catalog_countries
for select
using (true);

drop policy if exists "car_catalog_brands_select" on public.car_catalog_brands;
create policy "car_catalog_brands_select"
on public.car_catalog_brands
for select
using (true);

drop policy if exists "car_catalog_models_select" on public.car_catalog_models;
create policy "car_catalog_models_select"
on public.car_catalog_models
for select
using (true);

comment on table public.car_catalog_countries is 'Страна происхождения бренда (не страна регистрации авто).';
comment on table public.car_catalog_brands is 'Марки авто, привязка к стране бренда.';
comment on table public.car_catalog_models is 'Модели авто, привязка к марке.';
