-- Идемпотентные добавления моделей (trim/AMG/M/RS/версии).
begin;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-m2', 'M2', 'M2', 52, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-m3', 'M3', 'M3', 53, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-m4', 'M4', 'M4', 54, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-m5', 'M5', 'M5', 55, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-m6', 'M6', 'M6', 56, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-m8', 'M8', 'M8', 57, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x3-m', 'X3 M', 'X3 M', 58, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x4-m', 'X4 M', 'X4 M', 59, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x5-m', 'X5 M', 'X5 M', 60, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-x6-m', 'X6 M', 'X6 M', 61, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-330i', '330i', '330i', 70, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-330e', '330e', '330e', 71, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-m340i', 'M340i', 'M340i', 72, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-530i', '530i', '530i', 73, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-530e', '530e', '530e', 74, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-m550i', 'M550i', 'M550i', 75, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-540i', '540i', '540i', 76, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-740i', '740i', '740i', 77, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-740li', '740Li', '740Li', 78, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-760i', '760i', '760i', 79, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-alpina-xb7', 'Alpina XB7', 'Alpina XB7', 82, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'bmw-alpina-b8', 'Alpina B8', 'Alpina B8', 83, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'bmw'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-c43-amg', 'C43 AMG', 'C43 AMG', 62, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-c63-amg', 'C63 AMG', 'C63 AMG', 63, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-c63-s', 'C63 S', 'C63 S', 64, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-e53-amg', 'E53 AMG', 'E53 AMG', 65, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-e63-amg', 'E63 AMG', 'E63 AMG', 66, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-e63-s', 'E63 S', 'E63 S', 67, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-s63-amg', 'S63 AMG', 'S63 AMG', 68, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-s65-amg', 'S65 AMG', 'S65 AMG', 69, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-cls53', 'CLS53', 'CLS53', 71, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-cls63-amg', 'CLS63 AMG', 'CLS63 AMG', 72, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-g63-amg', 'G63 AMG', 'G63 AMG', 80, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-g500', 'G500', 'G500', 81, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-g550', 'G550', 'G550', 82, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-gle53', 'GLE53', 'GLE53', 85, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-gle63', 'GLE63', 'GLE63', 86, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-gls63', 'GLS63', 'GLS63', 87, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-amg-gt', 'AMG GT', 'AMG GT', 90, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-amg-gt-black-series', 'AMG GT Black Series', 'AMG GT Black Series', 91, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-sl63-amg', 'SL63 AMG', 'SL63 AMG', 93, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'mercedes-benz-sl55', 'SL55', 'SL55', 94, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'mercedes-benz'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-rs3', 'RS3', 'RS3', 130, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-rs4', 'RS4', 'RS4', 131, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-rs5', 'RS5', 'RS5', 132, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-rs6', 'RS6', 'RS6', 133, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-rs7', 'RS7', 'RS7', 134, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-rsq8', 'RSQ8', 'RSQ8', 135, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-r8-performance', 'R8 Performance', 'R8 Performance', 136, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-tt-rs', 'TT RS', 'TT RS', 137, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-s4', 'S4', 'S4', 140, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-s5', 'S5', 'S5', 141, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-s6', 'S6', 'S6', 142, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-s7', 'S7', 'S7', 143, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'audi-s8', 'S8', 'S8', 144, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'audi'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-718-cayman', '718 Cayman', '718 Cayman', 210, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-718-boxster', '718 Boxster', '718 Boxster', 211, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-911-carrera', '911 Carrera', '911 Carrera', 220, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-911-turbo-s', '911 Turbo S', '911 Turbo S', 221, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-911-gt3', '911 GT3', '911 GT3', 223, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-911-gt3-rs', '911 GT3 RS', '911 GT3 RS', 224, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-gt2-rs', 'GT2 RS', 'GT2 RS', 226, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-cayenne-coupe', 'Cayenne Coupé', 'Cayenne Coupé', 231, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'porsche-918-spyder', '918 Spyder', '918 Spyder', 238, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'germany' and b.slug = 'porsche'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'cadillac-escalade', 'Escalade', 'Escalade', 301, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'cadillac'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'cadillac-escalade-v', 'Escalade-V', 'Escalade-V', 302, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'cadillac'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'cadillac-cts-v', 'CTS-V', 'CTS-V', 305, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'cadillac'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'cadillac-ct5-v', 'CT5-V', 'CT5-V', 306, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'cadillac'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'cadillac-ct5-v-blackwing', 'CT5-V Blackwing', 'CT5-V Blackwing', 307, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'cadillac'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'cadillac-xt5', 'XT5', 'XT5', 310, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'cadillac'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'cadillac-xt6', 'XT6', 'XT6', 312, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'cadillac'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'cadillac-xt4', 'XT4', 'XT4', 309, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'cadillac'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'cadillac-lyriq', 'Lyriq', 'Lyriq', 315, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'usa' and b.slug = 'cadillac'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-gr-supra', 'GR Supra', 'GR Supra', 95, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-gr86', 'GR86', 'GR86', 96, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-land-cruiser-300', 'Land Cruiser 300', 'Land Cruiser 300', 97, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'toyota-corolla-gr', 'Corolla GR', 'Corolla GR', 98, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'toyota'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-gt-r-nismo', 'GT-R Nismo', 'GT-R Nismo', 410, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'nissan-z', 'Z', 'Z', 411, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'japan' and b.slug = 'nissan'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-ioniq-6', 'IONIQ 6', 'IONIQ 6', 420, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'hyundai-ioniq-7', 'IONIQ 7', 'IONIQ 7', 421, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'hyundai'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-ev9', 'EV9', 'EV9', 430, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

insert into public.car_catalog_models (brand_id, slug, name_ru, name_en, sort_order, aliases)
select b.id, 'kia-stinger', 'Stinger', 'Stinger', 431, '[]'::jsonb
from public.car_catalog_brands b
join public.car_catalog_countries c on c.id = b.country_id
where c.slug = 'south-korea' and b.slug = 'kia'
on conflict (brand_id, slug) do update set
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

commit;

