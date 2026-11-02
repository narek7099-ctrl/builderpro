-- Google Calendar, two ways (functions/v1/gcal).
--   gcal_links   one per contractor: their Google sign-in (encrypted with the
--                mail-connect token key from Vault), time zone and sync state.
--                No client access: the app asks the function for status.
--   gcal_events  what's on their Google Calendar in the next 60 days, and what
--                BuilderPro decided about it:
--                  busy       blocks the time (BuilderPro, and HighLevel when on)
--                  ask        a new event in work hours: "customer appointment?"
--                  appt       they said yes and picked the customer: a real
--                             appointment in HighLevel (workflows, pipeline)
--                  dismissed  they said no: stays busy, never asked again
--                The owner (and office) can read theirs; changes go through the function.
--   gcal_pushed  BuilderPro items written to their Google Calendar (project
--                work days, HighLevel appointments), so each is written once
--                and updated or removed when it changes. Function only.
create table if not exists public.gcal_links (
  owner uuid primary key,
  email text not null default '',
  token_enc text not null default '',
  tz text not null default 'America/Los_Angeles',
  status text not null default 'connected',
  error text not null default '',
  last_sync timestamptz,
  connected_at timestamptz not null default now()
);
alter table public.gcal_links enable row level security;

create table if not exists public.gcal_events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  google_id text not null,
  title text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  kind text not null default 'busy' check (kind in ('busy','ask','appt','dismissed')),
  contact_id uuid,
  contact_name text not null default '',
  ghl_block_id text not null default '',
  ghl_appt_id text not null default '',
  ghl_state text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (owner, google_id)
);
create index if not exists gcal_events_owner_start on public.gcal_events (owner, starts_at);
alter table public.gcal_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'gcal_events' and policyname = 'gcal_events_read') then
    create policy gcal_events_read on public.gcal_events for select to authenticated using (owner = bp_owner());
  end if;
end $$;

create table if not exists public.gcal_pushed (
  owner uuid not null,
  ref text not null,
  google_id text not null,
  sig text not null default '',
  updated_at timestamptz not null default now(),
  primary key (owner, ref)
);
alter table public.gcal_pushed enable row level security;

-- every five minutes, with the same scheduler secret mail-connect uses
select cron.unschedule('gcal-sync') where exists (select 1 from cron.job where jobname = 'gcal-sync');
select cron.schedule('gcal-sync', '*/5 * * * *', $c$
  select net.http_post(
    url := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/gcal',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'mail_cron_secret')),
    body := '{"op":"sync"}'::jsonb)
$c$);
