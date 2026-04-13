-- ENIGMA: срок действия BOOST (до какой даты объявление считается «поднятым»)
alter table public.listings add column if not exists boosted_until timestamptz;

comment on column public.listings.boosted_until is 'Дата окончания поднятия; активно пока boosted_until > now()';
