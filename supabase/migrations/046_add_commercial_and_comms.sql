-- 046: коммерческий подтип и поля коммуникаций (без удаления существующих колонок).
--
-- FK listings.user_id: в текущей схеме объявления ссылаются на public.users(id), что совпадает
-- с UUID из auth.users. Таблица public.profiles(id) также привязана к auth.users.
-- Перевод FK на profiles без проверки полноты строк — отдельная задача; здесь не меняем FK.

alter table public.listings
  add column if not exists commercial_type text,
  add column if not exists comms_gas boolean not null default false,
  add column if not exists comms_water boolean not null default false,
  add column if not exists comms_electricity text,
  add column if not exists comms_sewage boolean not null default false;

comment on column public.listings.commercial_type is 'Подтип коммерческой недвижимости (офис, склад и т.д.).';
comment on column public.listings.comms_gas is 'Коммуникация: газ.';
comment on column public.listings.comms_water is 'Коммуникация: вода.';
comment on column public.listings.comms_electricity is 'Электричество (текст, напр. «15 кВт»).';
comment on column public.listings.comms_sewage is 'Коммуникация: канализация.';
