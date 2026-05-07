-- Notifications + unread hardening:
-- restore server-authoritative list_my_chats payload and unread counters.

begin;

alter table public.chats
  add column if not exists last_message_at timestamptz;

alter table public.chats
  add column if not exists buyer_last_read_at timestamptz;

alter table public.chats
  add column if not exists seller_last_read_at timestamptz;

update public.chats c
set last_message_at = coalesce(
  (
    select max(m.created_at)
    from public.messages m
    where m.chat_id = c.id
  ),
  c.created_at,
  now()
)
where c.last_message_at is null;

create index if not exists idx_chats_buyer_last_message
  on public.chats (buyer_id, last_message_at desc, id desc)
  where buyer_id is not null;

create index if not exists idx_chats_seller_last_message
  on public.chats (seller_id, last_message_at desc, id desc)
  where seller_id is not null;

create index if not exists idx_messages_chat_created_desc
  on public.messages (chat_id, created_at desc, id desc);

drop function if exists public.list_my_chats(integer);
drop function if exists public.list_my_chats(int);
drop function if exists public.list_my_chats(integer, timestamptz);
drop function if exists public.list_my_chats(int, timestamptz);

create or replace function public.list_my_chats(
  p_limit int default 100,
  p_before timestamptz default null
)
returns table (
  chat_id uuid,
  buyer_id uuid,
  seller_id uuid,
  created_at timestamptz,
  other_user_id uuid,
  other_name text,
  last_message_id uuid,
  last_message_text text,
  last_message_created_at timestamptz,
  last_message_sender_id uuid,
  last_message_deleted boolean,
  last_message_image_url text,
  last_message_voice_url text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select auth.uid()::uuid as uid
  ),
  base as (
    select
      c.id as chat_id,
      c.buyer_id,
      c.seller_id,
      c.created_at,
      c.last_message_at,
      case
        when (select uid from me) = c.buyer_id then c.seller_id
        else c.buyer_id
      end as other_user_id,
      case
        when (select uid from me) = c.buyer_id then c.buyer_last_read_at
        else c.seller_last_read_at
      end as my_last_read_at
    from public.chats c
    where c.buyer_id = (select uid from me)
       or c.seller_id = (select uid from me)
  ),
  with_last as (
    select
      b.*,
      lm.id as last_message_id,
      lm.text as last_message_text,
      lm.created_at as last_message_created_at,
      lm.sender_id as last_message_sender_id,
      coalesce(lm.deleted, false) as last_message_deleted,
      lm.image_url as last_message_image_url,
      lm.voice_url as last_message_voice_url
    from base b
    left join lateral (
      select
        m.id,
        m.text,
        m.created_at,
        m.sender_id,
        m.deleted,
        m.image_url,
        m.voice_url
      from public.messages m
      where m.chat_id = b.chat_id
      order by m.created_at desc, m.id desc
      limit 1
    ) lm on true
    where p_before is null
       or coalesce(b.last_message_at, b.created_at) < p_before
  )
  select
    wl.chat_id,
    wl.buyer_id,
    wl.seller_id,
    wl.created_at,
    wl.other_user_id,
    coalesce(nullif(trim(p.name), ''), 'Пользователь') as other_name,
    wl.last_message_id,
    wl.last_message_text,
    wl.last_message_created_at,
    wl.last_message_sender_id,
    wl.last_message_deleted,
    wl.last_message_image_url,
    wl.last_message_voice_url,
    coalesce(wl.last_message_at, wl.last_message_created_at, wl.created_at) as last_message_at,
    (
      select count(*)::bigint
      from public.messages m
      where m.chat_id = wl.chat_id
        and m.sender_id <> (select uid from me)
        and m.created_at > coalesce(wl.my_last_read_at, '-infinity'::timestamptz)
        and not coalesce(m.deleted, false)
    ) as unread_count
  from with_last wl
  left join public.profiles p on p.id = wl.other_user_id
  order by coalesce(wl.last_message_at, wl.last_message_created_at, wl.created_at) desc, wl.chat_id desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

grant execute on function public.list_my_chats(int, timestamptz) to authenticated;

commit;
