-- Если PostgREST ругается PGRST204 на колонку city — в таблице её нет (часто оставляют только location).
-- Выполните ОДИН из вариантов.

-- Вариант A (рекомендуется, как в schema.sql): добавить city
alter table public.listings add column if not exists city text not null default '';

-- Если раньше использовали location и нужно перенести данные:
-- update public.listings set city = coalesce(nullif(trim(city), ''), location, '') where city = '' and location is not null;

-- Вариант B: переименовать location → city (если колонка называется location и city нет)
-- alter table public.listings rename column location to city;
