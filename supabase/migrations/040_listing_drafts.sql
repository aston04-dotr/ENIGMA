-- Черновики объявлений: один ряд на пользователя (upsert по user_id).

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  description text,
  price numeric,
  city text,
  category text,
  updated_at timestamptz not null default now(),
  constraint drafts_user_id_key unique (user_id)
);

create index if not exists drafts_user_id_idx on public.drafts (user_id);

alter table public.drafts enable row level security;

drop policy if exists "users can manage own drafts" on public.drafts;

create policy "users can manage own drafts"
  on public.drafts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.drafts to authenticated;
