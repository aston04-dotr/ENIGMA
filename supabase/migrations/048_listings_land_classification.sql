-- Классификация земельных участков и статус прав.

alter table public.listings add column if not exists land_type text;

alter table public.listings add column if not exists land_ownership_status text;

comment on column public.listings.land_type is 'Вид разрешённого использования участка (ИЖС, ЛПХ, СНТ/ДНП и т.д.).';
comment on column public.listings.land_ownership_status is 'Статус: собственность / аренда / субаренда.';
