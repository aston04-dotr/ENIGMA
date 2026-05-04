-- Разделение предложений (offer) и запросов (seeking): лента vs «Поиск жилья/авто».

alter table public.listings
  add column if not exists listing_kind text;

update public.listings set listing_kind = 'offer' where listing_kind is null;

alter table public.listings
  alter column listing_kind set default 'offer';

alter table public.listings
  alter column listing_kind set not null;

alter table public.listings drop constraint if exists listings_listing_kind_check;

alter table public.listings
  add constraint listings_listing_kind_check check (listing_kind in ('offer', 'seeking'));

comment on column public.listings.listing_kind is 'offer — предложение (продам/сдам); seeking — запрос (куплю/сниму).';

create index if not exists listings_kind_city_created_idx
  on public.listings (listing_kind, city, created_at desc);
