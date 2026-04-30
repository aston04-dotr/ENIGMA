-- Fix: RPC get_or_create_direct_chat ошибся именами колонок (например user1_id).
-- В проекте public.chats использует user1/user2 и buyer_id/seller_id — см. web/src/lib/supabase.types.ts
--
-- Выполните один раз в Supabase SQL Editor (Production).

drop function if exists public.get_or_create_direct_chat(uuid, uuid);

create or replace function public.get_or_create_direct_chat(
  p_listing_id uuid,
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid()::uuid;
  v_min uuid;
  v_max uuid;
  v_chat_id uuid;
  v_listing_owner uuid;
  v_lock_key bigint;
  v_nil uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_other_user_id is null then
    raise exception 'other user required';
  end if;

  if p_other_user_id = v_uid then
    raise exception 'cannot create chat with self';
  end if;

  if p_listing_id is not null then
    select l.user_id
    into v_listing_owner
    from public.listings l
    where l.id = p_listing_id;

    if v_listing_owner is null then
      raise exception 'listing not found';
    end if;

    if v_listing_owner <> p_other_user_id then
      raise exception 'listing owner mismatch';
    end if;
  end if;

  v_min := least(v_uid, p_other_user_id);
  v_max := greatest(v_uid, p_other_user_id);

  v_lock_key := hashtextextended(
    'direct-chat:'
      || v_min::text
      || ':'
      || v_max::text
      || ':'
      || coalesce(p_listing_id::text, 'null'),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select c.id
  into v_chat_id
  from public.chats c
  where coalesce(c.is_group, false) = false
    and least(coalesce(c.user1, c.buyer_id), coalesce(c.user2, c.seller_id)) = v_min
    and greatest(coalesce(c.user1, c.buyer_id), coalesce(c.user2, c.seller_id)) = v_max
    and coalesce(c.listing_id, v_nil) = coalesce(p_listing_id, v_nil)
  order by c.created_at asc nulls first, c.id asc
  limit 1;

  if v_chat_id is null then
    insert into public.chats (
      user1,
      user2,
      buyer_id,
      seller_id,
      listing_id,
      is_group,
      created_at,
      last_message_at
    )
    values (
      v_min,
      v_max,
      v_min,
      v_max,
      p_listing_id,
      false,
      now(),
      now()
    )
    returning id into v_chat_id;
  end if;

  return v_chat_id;
end;
$$;

grant execute on function public.get_or_create_direct_chat(uuid, uuid) to anon;
grant execute on function public.get_or_create_direct_chat(uuid, uuid) to authenticated;
