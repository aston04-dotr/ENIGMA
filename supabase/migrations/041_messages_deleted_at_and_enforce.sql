-- Chat delete improvements:
-- - soft-delete timestamp for "delete for all"
-- - keep sender-only control for deleted/deleted_at

alter table public.messages
  add column if not exists deleted_at timestamptz;

comment on column public.messages.deleted_at is
  'Timestamp when sender soft-deleted message for all participants';

create or replace function public.messages_enforce_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id is distinct from old.sender_id then
    raise exception 'sender_id immutable';
  end if;
  if new.chat_id is distinct from old.chat_id then
    raise exception 'chat_id immutable';
  end if;
  if new.id is distinct from old.id then
    raise exception 'id immutable';
  end if;

  if old.sender_id is distinct from auth.uid()::uuid then
    if new.text is distinct from old.text
       or new.image_url is distinct from old.image_url
       or new.voice_url is distinct from old.voice_url
       or new.reply_to is distinct from old.reply_to
       or new.edited_at is distinct from old.edited_at
       or new.deleted is distinct from old.deleted
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'only sender can change content';
    end if;
  end if;

  return new;
end;
$$;
