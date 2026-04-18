-- Hotfix: ensure phone persistence works for authenticated users on profiles.

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;

drop policy if exists "Enable update for users based on user_id" on public.profiles;
create policy "Enable update for users based on user_id"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
