-- Сид данных справочника авто (идемпотентный upsert).
begin;

insert into public.car_catalog_countries (slug, name_en, name_ru, flag_emoji, aliases, sort_order)
values
  ('germany', 'Germany', 'Германия', '🇩🇪', '["Германия", "Deutschland"]'::jsonb, 12),
  ('czech-republic', 'Czech Republic', 'Чехия', '🇨🇿', '["Чехия", "Česko"]'::jsonb, 14),
  ('japan', 'Japan', 'Япония', '🇯🇵', '["Япония", "Japan"]'::jsonb, 20),
  ('south-korea', 'South Korea', 'Корея (Южная)', '🇰🇷', '["Южная Корея"]'::jsonb, 22),
  ('usa', 'United States', 'США', '🇺🇸', '["USA"]'::jsonb, 26),
  ('uk', 'United Kingdom', 'Великобритания', '🇬🇧', '["Britain"]'::jsonb, 28),
  ('italy', 'Italy', 'Италия', '🇮🇹', '[]'::jsonb, 32),
  ('france', 'France', 'Франция', '🇫🇷', '[]'::jsonb, 34),
  ('china', 'China', 'Китай', '🇨🇳', '[]'::jsonb, 38),
  ('sweden', 'Sweden', 'Швеция', '🇸🇪', '[]'::jsonb, 42),
  ('spain', 'Spain', 'Испания', '🇪🇸', '[]'::jsonb, 46),
  ('netherlands', 'Netherlands', 'Нидерланды', '🇳🇱', '[]'::jsonb, 48),
  ('russia', 'Russia', 'Россия', '🇷🇺', '[]'::jsonb, 52)
on conflict (slug) do update set
  name_en = excluded.name_en,
  name_ru = excluded.name_ru,
  flag_emoji = excluded.flag_emoji,
  aliases = excluded.aliases,
  sort_order = excluded.sort_order;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'bmw', 'BMW', 'BMW', 10, '["БМВ"]'::jsonb
from public.car_catalog_countries c where c.slug = 'germany'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'mercedes-benz', 'Mercedes-Benz', 'Mercedes-Benz', 15, '["Мерседес"]'::jsonb
from public.car_catalog_countries c where c.slug = 'germany'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'audi', 'Audi', 'Audi', 20, '["Ауди"]'::jsonb
from public.car_catalog_countries c where c.slug = 'germany'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'volkswagen', 'Volkswagen', 'Volkswagen', 25, '["VW"]'::jsonb
from public.car_catalog_countries c where c.slug = 'germany'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'porsche', 'Porsche', 'Porsche', 35, '["Порше"]'::jsonb
from public.car_catalog_countries c where c.slug = 'germany'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'opel', 'Opel', 'Opel', 45, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'germany'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'skoda', 'Škoda', 'Škoda', 10, '["Шкода"]'::jsonb
from public.car_catalog_countries c where c.slug = 'czech-republic'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'toyota', 'Toyota', 'Toyota', 10, '["Тойота"]'::jsonb
from public.car_catalog_countries c where c.slug = 'japan'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'honda', 'Honda', 'Honda', 20, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'japan'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'nissan', 'Nissan', 'Nissan', 25, '["Ниссан"]'::jsonb
from public.car_catalog_countries c where c.slug = 'japan'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'mazda', 'Mazda', 'Mazda', 30, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'japan'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'lexus', 'Lexus', 'Lexus', 40, '["Лексус"]'::jsonb
from public.car_catalog_countries c where c.slug = 'japan'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'subaru', 'Subaru', 'Subaru', 45, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'japan'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'mitsubishi', 'Mitsubishi', 'Mitsubishi', 50, '["Мицубиси"]'::jsonb
from public.car_catalog_countries c where c.slug = 'japan'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'hyundai', 'Hyundai', 'Hyundai', 10, '["Хёндай"]'::jsonb
from public.car_catalog_countries c where c.slug = 'south-korea'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'kia', 'Kia', 'Kia', 20, '["Киа"]'::jsonb
from public.car_catalog_countries c where c.slug = 'south-korea'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'genesis', 'Genesis', 'Genesis', 30, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'south-korea'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'ford', 'Ford', 'Ford', 10, '["Форд"]'::jsonb
from public.car_catalog_countries c where c.slug = 'usa'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'chevrolet', 'Chevrolet', 'Chevrolet', 20, '["Шевроле"]'::jsonb
from public.car_catalog_countries c where c.slug = 'usa'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'jeep', 'Jeep', 'Jeep', 40, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'usa'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'tesla', 'Tesla', 'Tesla', 50, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'usa'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'cadillac', 'Cadillac', 'Cadillac', 60, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'usa'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'land-rover', 'Land Rover', 'Land Rover', 10, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'uk'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'mini', 'MINI', 'MINI', 30, '["Мини"]'::jsonb
from public.car_catalog_countries c where c.slug = 'uk'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'jaguar', 'Jaguar', 'Jaguar', 20, '["Ягуар"]'::jsonb
from public.car_catalog_countries c where c.slug = 'uk'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'alfa-romeo', 'Alfa Romeo', 'Alfa Romeo', 40, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'italy'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'fiat', 'Fiat', 'Fiat', 50, '["Фиат"]'::jsonb
from public.car_catalog_countries c where c.slug = 'italy'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'ferrari', 'Ferrari', 'Ferrari', 10, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'italy'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'maserati', 'Maserati', 'Maserati', 20, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'italy'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'renault', 'Renault', 'Renault', 10, '["Рено"]'::jsonb
from public.car_catalog_countries c where c.slug = 'france'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'peugeot', 'Peugeot', 'Peugeot', 20, '["Пежо"]'::jsonb
from public.car_catalog_countries c where c.slug = 'france'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'citroen', 'Citroën', 'Citroën', 30, '["Ситроен"]'::jsonb
from public.car_catalog_countries c where c.slug = 'france'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'geely', 'Geely', 'Geely', 10, '["Джили"]'::jsonb
from public.car_catalog_countries c where c.slug = 'china'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'chery', 'Chery', 'Chery', 20, '["Чери"]'::jsonb
from public.car_catalog_countries c where c.slug = 'china'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'great-wall', 'Great Wall', 'Great Wall', 30, '["GWM"]'::jsonb
from public.car_catalog_countries c where c.slug = 'china'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'byd', 'BYD', 'BYD', 40, '[]'::jsonb
from public.car_catalog_countries c where c.slug = 'china'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'volvo', 'Volvo', 'Volvo', 10, '["Вольво"]'::jsonb
from public.car_catalog_countries c where c.slug = 'sweden'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'polestar', 'Polestar', 'Polestar', 20, '["Полестар"]'::jsonb
from public.car_catalog_countries c where c.slug = 'sweden'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'lada', 'LADA (ВАЗ)', 'LADA', 10, '["Лада"]'::jsonb
from public.car_catalog_countries c where c.slug = 'russia'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'uaz', 'UAZ', 'UAZ', 20, '["УАЗ"]'::jsonb
from public.car_catalog_countries c where c.slug = 'russia'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_brands (country_id, slug, name_ru, name_en, sort_order, aliases)
select c.id, 'gaz', 'GAZ', 'GAZ', 30, '["ГАЗ"]'::jsonb
from public.car_catalog_countries c where c.slug = 'russia'
on conflict (country_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-1-series', '1 Series', '1 Series', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-2-series', '2 Series', '2 Series', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-3-series', '3 Series', '3 Series', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-4-series', '4 Series', '4 Series', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-5-series', '5 Series', '5 Series', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-6-series', '6 Series', '6 Series', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-7-series', '7 Series', '7 Series', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-8-series', '8 Series', '8 Series', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x1', 'X1', 'X1', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x2', 'X2', 'X2', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x3', 'X3', 'X3', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x4', 'X4', 'X4', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x5', 'X5', 'X5', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x6', 'X6', 'X6', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x7', 'X7', 'X7', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-xm', 'XM', 'XM', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-z4', 'Z4', 'Z4', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-i4', 'i4', 'i4', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-i5', 'i5', 'i5', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-i7', 'i7', 'i7', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-ix', 'iX', 'iX', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-a-class', 'Класс A', 'A-Class', 10, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-c-class', 'Класс C', 'C-Class', 18, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-e-class', 'Класс E', 'E-Class', 25, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-s-class', 'Класс S', 'S-Class', 33, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-gla', 'GLA', 'GLA', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-glb', 'GLB', 'GLB', 43, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-glc', 'GLC', 'GLC', 48, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-gle', 'GLE', 'GLE', 53, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-gls', 'GLS', 'GLS', 58, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-g-class', 'G-Class', 'G-Class', 62, '["Гелик"]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-eqs', 'EQS', 'EQS', 72, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'benz-eqe', 'EQE', 'EQE', 75, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-a1', 'A1', 'A1', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-a3', 'A3', 'A3', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-a4', 'A4', 'A4', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-a5', 'A5', 'A5', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-a6', 'A6', 'A6', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-a7', 'A7', 'A7', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-a8', 'A8', 'A8', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-q3', 'Q3', 'Q3', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-q5', 'Q5', 'Q5', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-q7', 'Q7', 'Q7', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-q8', 'Q8', 'Q8', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-e-tron-gt', 'e-tron  GT', 'e-tron GT', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-tt', 'TT', 'TT', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-r8', 'R8', 'R8', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'vw-polo', 'Polo', 'Polo', 11, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'volkswagen'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'vw-golf', 'Golf', 'Golf', 15, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'volkswagen'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'vw-jetta', 'Jetta', 'Jetta', 19, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'volkswagen'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'vw-passat', 'Passat', 'Passat', 23, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'volkswagen'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'vw-arteon', 'Arteon', 'Arteon', 27, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'volkswagen'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'vw-tiguan', 'Tiguan', 'Tiguan', 33, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'volkswagen'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'vw-touareg', 'Touareg', 'Touareg', 41, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'volkswagen'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'vw-multivan', 'Multivan', 'Multivan', 48, '["Мультивен"]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'volkswagen'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-718', '718', '718', 48, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-911', '911', '911', 48, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-taycan', 'Taycan', 'Taycan', 48, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-panamera', 'Panamera', 'Panamera', 48, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-macan', 'Macan', 'Macan', 48, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-cayenne', 'Cayenne', 'Cayenne', 48, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-camry', 'Camry', 'Camry', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-corolla', 'Corolla', 'Corolla', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-rav4', 'RAV4', 'RAV4', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-highlander', 'Highlander', 'Highlander', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-land-cruiser', 'Land Cruiser', 'Land Cruiser', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-prado', 'Prado', 'Prado', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-prius', 'Prius', 'Prius', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-c-hr', 'C-HR', 'C-HR', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-yaris', 'Yaris', 'Yaris', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-avalon', 'Avalon', 'Avalon', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-supra', 'Supra', 'Supra', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-nx', 'NX', 'NX', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-rx', 'RX', 'RX', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-gx', 'GX', 'GX', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-lx', 'LX', 'LX', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-es', 'ES', 'ES', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-gs', 'GS', 'GS', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-ls', 'LS', 'LS', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-is', 'IS', 'IS', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-lc', 'LC', 'LC', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-ux', 'UX', 'UX', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lexus-rz', 'RZ', 'RZ', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'lexus'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-solaris', 'Solaris', 'Solaris', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-accent', 'Accent', 'Accent', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-elantra', 'Elantra', 'Elantra', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-sonata', 'Sonata', 'Sonata', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-tucson', 'Tucson', 'Tucson', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-santa-fe', 'Santa Fe', 'Santa Fe', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-palisade', 'Palisade', 'Palisade', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-kona', 'Kona', 'Kona', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-ioniq', 'IONIQ', 'IONIQ', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-ioniq-5', 'IONIQ 5', 'IONIQ 5', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-ioniq-6', 'IONIQ 6', 'IONIQ 6', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-rio', 'Rio', 'Rio', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-cerato', 'Cerato', 'Cerato', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-k5', 'K5', 'K5', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-k8', 'K8', 'K8', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-soul', 'Soul', 'Soul', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-sportage', 'Sportage', 'Sportage', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-sorento', 'Sorento', 'Sorento', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-carnival', 'Carnival', 'Carnival', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-ev6', 'EV6', 'EV6', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-ev9', 'EV9', 'EV9', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-2', '2', '2', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-3', '3', '3', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-6', '6', '6', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-cx-3', 'CX-3', 'CX-3', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-cx-30', 'CX-30', 'CX-30', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-cx-5', 'CX-5', 'CX-5', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-cx-50', 'CX-50', 'CX-50', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-cx-60', 'CX-60', 'CX-60', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-cx-9', 'CX-9', 'CX-9', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mazda-mx-5', 'MX-5', 'MX-5', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'mazda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'honda-civic', 'Civic', 'Civic', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'honda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'honda-accord', 'Accord', 'Accord', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'honda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'honda-cr-v', 'CR-V', 'CR-V', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'honda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'honda-hr-v', 'HR-V', 'HR-V', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'honda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'honda-pilot', 'Pilot', 'Pilot', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'honda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'honda-fit', 'Fit', 'Fit', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'honda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-almera', 'Almera', 'Almera', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-sentra', 'Sentra', 'Sentra', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-altima', 'Altima', 'Altima', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-juke', 'Juke', 'Juke', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-qashqai', 'Qashqai', 'Qashqai', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-x-trail', 'X-Trail', 'X-Trail', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-patrol', 'Patrol', 'Patrol', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-gt-r', 'GT-R', 'GT-R', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-leaf', 'Leaf', 'Leaf', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-ariya', 'Ariya', 'Ariya', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-focus', 'Focus', 'Focus', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-fiesta', 'Fiesta', 'Fiesta', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-mondeo', 'Mondeo', 'Mondeo', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-fusion', 'Fusion', 'Fusion', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-mustang', 'Mustang', 'Mustang', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-kuga', 'Kuga', 'Kuga', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-explorer', 'Explorer', 'Explorer', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-f150', 'F-150', 'F-150', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-bronco', 'Bronco', 'Bronco', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'ford-maverick', 'Maverick', 'Maverick', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'ford'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'chevy-cruze', 'Cruze', 'Cruze', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'chevrolet'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'chevy-malibu', 'Malibu', 'Malibu', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'chevrolet'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'chevy-camaro', 'Camaro', 'Camaro', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'chevrolet'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'chevy-corvette', 'Corvette', 'Corvette', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'chevrolet'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'chevy-equinox', 'Equinox', 'Equinox', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'chevrolet'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'chevy-traverse', 'Traverse', 'Traverse', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'chevrolet'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'chevy-tahoe', 'Tahoe', 'Tahoe', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'chevrolet'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'chevy-suburban', 'Suburban', 'Suburban', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'chevrolet'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'chevy-silverado', 'Silverado', 'Silverado', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'chevrolet'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'tesla-model-s', 'Model S', 'Model S', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'tesla'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'tesla-model-3', 'Model 3', 'Model 3', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'tesla'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'tesla-model-x', 'Model X', 'Model X', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'tesla'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'tesla-model-y', 'Model Y', 'Model Y', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'tesla'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'tesla-cybertruck', 'Cybertruck', 'Cybertruck', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'tesla'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'skoda-fabia', 'Fabia', 'Fabia', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'czech-republic' and b.slug = 'skoda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'skoda-scala', 'Scala', 'Scala', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'czech-republic' and b.slug = 'skoda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'skoda-octavia', 'Octavia', 'Octavia', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'czech-republic' and b.slug = 'skoda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'skoda-superb', 'Superb', 'Superb', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'czech-republic' and b.slug = 'skoda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'skoda-kamiq', 'Kamiq', 'Kamiq', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'czech-republic' and b.slug = 'skoda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'skoda-karoq', 'Karoq', 'Karoq', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'czech-republic' and b.slug = 'skoda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'skoda-kodiaq', 'Kodiaq', 'Kodiaq', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'czech-republic' and b.slug = 'skoda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'skoda-enyaq', 'Enyaq', 'Enyaq', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'czech-republic' and b.slug = 'skoda'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'volvo-s60', 'S60', 'S60', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'sweden' and b.slug = 'volvo'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'volvo-s90', 'S90', 'S90', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'sweden' and b.slug = 'volvo'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'volvo-v60', 'V60', 'V60', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'sweden' and b.slug = 'volvo'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'volvo-v90', 'V90', 'V90', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'sweden' and b.slug = 'volvo'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'volvo-xc40', 'XC40', 'XC40', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'sweden' and b.slug = 'volvo'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'volvo-xc60', 'XC60', 'XC60', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'sweden' and b.slug = 'volvo'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'volvo-xc90', 'XC90', 'XC90', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'sweden' and b.slug = 'volvo'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'volvo-ex30', 'EX30', 'EX30', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'sweden' and b.slug = 'volvo'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'volvo-ex90', 'EX90', 'EX90', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'sweden' and b.slug = 'volvo'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lada-granta', 'Granta', 'Granta', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'russia' and b.slug = 'lada'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lada-vesta', 'Vesta', 'Vesta', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'russia' and b.slug = 'lada'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lada-largus', 'Largus', 'Largus', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'russia' and b.slug = 'lada'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lada-niva', 'Niva', 'Niva', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'russia' and b.slug = 'lada'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lada-niva-travel', 'Niva Travel', 'Niva Travel', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'russia' and b.slug = 'lada'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lada-xray', 'XRAY', 'XRAY', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'russia' and b.slug = 'lada'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lr-defender', 'Defender', 'Defender', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'uk' and b.slug = 'land-rover'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lr-discovery', 'Discovery', 'Discovery', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'uk' and b.slug = 'land-rover'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lr-discovery-sport', 'Discovery Sport', 'Discovery Sport', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'uk' and b.slug = 'land-rover'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lr-range-rover', 'Range Rover', 'Range Rover', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'uk' and b.slug = 'land-rover'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lr-range-rover-evoque', 'Range Rover Evoque', 'Range Rover Evoque', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'uk' and b.slug = 'land-rover'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lr-range-rover-sport', 'Range Rover Sport', 'Range Rover Sport', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'uk' and b.slug = 'land-rover'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'lr-range-rover-velar', 'Range Rover Velar', 'Range Rover Velar', 40, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'uk' and b.slug = 'land-rover'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

commit;
