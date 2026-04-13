-- Партнёрские (рекламные) объявления — пометка для ленты и аналитики.

alter table public.listings add column if not exists is_partner_ad boolean not null default false;

comment on column public.listings.is_partner_ad is 'Размещение партнёра ENIGMA; показывается метка «Партнёр» в приложении.';

create index if not exists idx_listings_partner_city on public.listings (city) where is_partner_ad = true;
