# ghl-schedule setup

1. **Table** — run in the Supabase SQL editor:

```sql
create table if not exists public.scheduled_msgs (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null default 'SMS',
  subject     text not null default '',
  message     text not null,
  contact_ids text[] not null default '{}',
  send_at     timestamptz not null,
  label       text not null default 'Message',
  status      text not null default 'pending', -- pending | sending | sent | failed | canceled
  sent_count  int not null default 0,
  fail_count  int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.scheduled_msgs enable row level security;
-- no policies: service-role (the edge function) only
```

2. **Function** — create edge function `ghl-schedule` with index.ts, **Verify JWT OFF**.
   Uses existing secrets: GHL_TOKEN (or GHL_API_KEY), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

3. **Worker schedule** — the cron that actually sends due messages (every 5 minutes):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('ghl-schedule-run','*/5 * * * *', $$
  select net.http_post(
    url:='https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/ghl-schedule',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{"action":"run"}'::jsonb);
$$);
```

4. Test: schedule a text to yourself 2 minutes out via Broadcast → Schedule, then wait for the next 5-minute tick.
