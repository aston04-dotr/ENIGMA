alter table public.support_tickets
  add column if not exists type text;

alter table public.support_tickets
  add column if not exists status text default 'open';

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  type text,
  target_id uuid,
  status text default 'pending',
  created_at timestamp with time zone default now()
);
