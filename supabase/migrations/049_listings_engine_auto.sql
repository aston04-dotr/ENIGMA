-- Авто: мощность и объём двигателя (текст — пресеты или произвольный ввод).

alter table public.listings add column if not exists engine_power text;

alter table public.listings add column if not exists engine_volume text;

comment on column public.listings.engine_power is 'Мощность двигателя, л.с. (строка с UI).';
comment on column public.listings.engine_volume is 'Рабочий объём двигателя, л (строка с UI).';
