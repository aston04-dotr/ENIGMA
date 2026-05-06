# Guest-First Rollout Runbook

This runbook defines a reversible rollout path for guest chat architecture.

## Runtime flags (no deploy required)

Set values in `public.guest_runtime_flags`:

- `guest_chat_enabled` (`true|false`)
- `guest_chat_rollout_percent` (`0..100`)
- `guest_merge_enabled` (`true|false`)
- `guest_presence_enabled` (`true|false`)
- `guest_kill_switch` (`true|false`)

### Emergency kill-switch

```sql
update public.guest_runtime_flags
set value = 'true'::jsonb, updated_at = now()
where flag = 'guest_kill_switch';
```

Result:
- guest sending path disabled server-side
- guest merge disabled
- browsing and non-guest platform surfaces remain online

## Gradual rollout phases

1. Internal
2. 5%
3. 10%
4. 25%
5. 50%
6. 100%

At each phase, validate:
- DB load and lock wait p95
- websocket/reconnect pressure
- merge success/failure
- unread correctness
- spam/rate-limit dynamics

## Observability

Primary SQL view:

```sql
select * from public.guest_ops_dashboard_v1;
```

Tracks:
- merges/min
- merge failures/min
- rate-limit blocks/min
- alias dedup total
- guest sends/min
- RPC avg/p95 latency
- advisory lock wait p95

## Operational checks

1. Offline/reconnect replay: verify no duplicate message insert with `client_nonce`.
2. Merge contention: verify lock wait p95 remains stable during ramp.
3. Unread drift: compare chat unread snapshots before/after merge.
4. Realtime pressure: monitor subscription count and reconnect loops.
