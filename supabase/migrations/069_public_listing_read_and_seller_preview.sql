-- Public growth flow: shared /listing/[id] must load for anon (Telegram in-app browser, incognito).
-- Ensures marketplace SELECT cannot regress to trust-only visibility (migration 019) on production.
--
-- Rules:
-- * Anyone may read ACTIVE listings by id/url.
-- * Owners still read own rows (including expired/archived).
--
-- RPC uses only `listings` + `profiles` (no `public.users`). Optional profile columns read via
-- to_jsonb(p) so missing columns (e.g. avatar) do not break the function.

begin;

alter table public.listings enable row level security;

drop policy if exists "listings_select" on public.listings;

create policy "listings_select"
on public.listings
for select
using (
  coalesce(status, 'active'::text) = 'active'::text
  or (auth.uid() is not null and auth.uid() = user_id)
);

create or replace function public.public_profile_for_active_listing(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id::text,
    'name', to_jsonb(p) ->> 'name',
    'avatar', to_jsonb(p) ->> 'avatar',
    'public_id', coalesce(
      nullif(trim(both from coalesce(to_jsonb(p) ->> 'public_id', '')), ''),
      '—'
    ),
    'trust_score', coalesce(
      case
        when (to_jsonb(p) ->> 'trust_score') ~ '^-?[0-9]+$'
          then (to_jsonb(p) ->> 'trust_score')::int
        else null
      end,
      100
    ),
    'created_at', coalesce(to_jsonb(p) ->> 'created_at', '')
  )
  from public.listings l
  inner join public.profiles p on p.id = l.user_id
  where l.id = p_listing_id
    and (
      coalesce(l.status::text, 'active') = 'active'
      or (auth.uid() is not null and auth.uid() = l.user_id)
    )
  limit 1;
$$;

revoke all on function public.public_profile_for_active_listing(uuid) from public;
grant execute on function public.public_profile_for_active_listing(uuid) to anon, authenticated;

commit;
