-- Мотоциклы: структурированные поля (вместе с engine_power / engine_volume из миграции 049).

alter table public.listings add column if not exists moto_type text;

alter table public.listings add column if not exists moto_engine text;

alter table public.listings add column if not exists moto_mileage text;

alter table public.listings add column if not exists moto_customs_cleared text;

alter table public.listings add column if not exists moto_owners_pts text;

comment on column public.listings.moto_type is 'Тип мототехники (Спортивный, Чоппер, …).';
comment on column public.listings.moto_engine is 'Тип двигателя (Бензиновый / Электрический).';
comment on column public.listings.moto_mileage is 'Пробег, текст (км).';
comment on column public.listings.moto_customs_cleared is 'Растаможен: Да / Нет.';
comment on column public.listings.moto_owners_pts is 'Владельцев по ПТС: 1, 2, 3+.';
