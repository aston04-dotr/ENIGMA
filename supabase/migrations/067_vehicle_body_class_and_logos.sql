-- Классы / тип кузова (автопоток) + logo_key для марок + связь модели с классом.
-- Таблицы остаются с префиксом car_catalog_* — совместимость с уже применёнными 064–065.

create table if not exists public.car_catalog_body_classes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ru text not null,
  name_en text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.car_catalog_brands
  add column if not exists logo_key text;

alter table public.car_catalog_models
  add column if not exists body_class_id uuid references public.car_catalog_body_classes (id) on delete set null;

create index if not exists car_catalog_models_body_class_idx on public.car_catalog_models (body_class_id);

alter table public.car_catalog_body_classes enable row level security;

drop policy if exists "car_catalog_body_classes_select" on public.car_catalog_body_classes;
create policy "car_catalog_body_classes_select"
on public.car_catalog_body_classes
for select
using (true);

insert into public.car_catalog_body_classes (slug, name_en, name_ru, sort_order) values
('sedan', 'Passenger / sedan', 'Легковые', 10),
('suv', 'SUV / off-road', 'Внедорожники / SUV', 20),
('coupe', 'Coupé', 'Купе', 30),
('convertible', 'Convertible', 'Кабриолеты', 40),
('pickup', 'Pickup', 'Пикапы', 50),
('van', 'Van / MPV', 'Минивэны', 60),
('commercial', 'Commercial', 'Коммерческие', 70),
('ev', 'Electric', 'Электромобили', 80),
('sportscar', 'Sports car', 'Спорткары', 90)
on conflict (slug) do update set
  name_en = excluded.name_en,
  name_ru = excluded.name_ru,
  sort_order = excluded.sort_order;

update public.car_catalog_brands b set logo_key = b.slug where b.logo_key is null or trim(b.logo_key) = '';

comment on table public.car_catalog_body_classes is 'Сегмент авто до выбора страны и марки.';
comment on column public.car_catalog_brands.logo_key is 'Ключ глифа бренда в клиенте (обычно = slug марки).';
comment on column public.car_catalog_models.body_class_id is 'Фильтр моделей по классу кузова; null = показываем для любого выбранного класса.';
