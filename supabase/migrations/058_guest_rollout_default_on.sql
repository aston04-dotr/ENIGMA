-- Enable guest chat rollout by default for guest-first product mode.
-- Runtime flags remain fully controllable after this migration.

update public.guest_runtime_flags
set value = 'true'::jsonb, updated_at = now()
where flag = 'guest_chat_enabled';

update public.guest_runtime_flags
set value = '100'::jsonb, updated_at = now()
where flag = 'guest_chat_rollout_percent';

update public.guest_runtime_flags
set value = 'true'::jsonb, updated_at = now()
where flag = 'guest_presence_enabled';
