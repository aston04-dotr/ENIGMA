-- Площадь участка (текст: м², сотки, гектары и т.д.) для домов и земельных участков.

alter table public.listings add column if not exists plot_area text;

comment on column public.listings.plot_area is 'Площадь участка (произвольная строка: сотки, га, м²).';
