-- Поля для недвижимости: коммерческий подтип, коммуникации (флаги), тип сделки.
-- Детали коммуникаций остаются в listings.params (communications, JSON).

alter table public.listings
  add column if not exists commercial_type text,
  add column if not exists has_gas boolean not null default false,
  add column if not exists has_water boolean not null default false,
  add column if not exists has_electricity boolean not null default false,
  add column if not exists has_sewage boolean not null default false,
  add column if not exists deal_type text not null default 'sale';

comment on column public.listings.commercial_type is 'Подтип коммерческой недвижимости (офис, склад и т.д.).';
comment on column public.listings.has_gas is 'Пользователь указал газ (центральный или автономный в params.communications).';
comment on column public.listings.has_water is 'Пользователь указал водоснабжение.';
comment on column public.listings.has_electricity is 'Пользователь указал мощность электроснабжения (кВт).';
comment on column public.listings.has_sewage is 'Пользователь указал канализацию.';
comment on column public.listings.deal_type is 'sale — продажа / долгосрочное размещение; rent — аренда (форма «Снять»).';

alter table public.listings
  drop constraint if exists listings_deal_type_check;

alter table public.listings
  add constraint listings_deal_type_check check (deal_type in ('sale', 'rent'));
