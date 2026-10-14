-- lead_log: every lead from a calculator or checker, as BuilderPro received it.
-- The lead-in function writes one row per lead and records where it went
-- (the contractor's Contacts, their own HighLevel), so a lead that didn't
-- reach HighLevel is visible and can be sent again instead of being lost.

set lock_timeout = '5s';

create table if not exists public.lead_log (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null,
  source      text not null default '',
  page        text not null default '',
  name        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  lead        jsonb not null default '{}'::jsonb,
  contact_id  uuid,
  ghl_status  text not null default 'pending',  -- pending | sent | house | none | failed
  ghl_contact text not null default '',
  ghl_error   text not null default '',
  tries       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists lead_log_owner on public.lead_log(owner, created_at desc);
create index if not exists lead_log_retry on public.lead_log(ghl_status, created_at) where ghl_status in ('pending', 'failed');
alter table public.lead_log enable row level security;
create policy lead_log_read on public.lead_log for select to authenticated using (owner = public.bp_owner());
revoke all on public.lead_log from anon;
grant select on public.lead_log to authenticated;   -- written by lead-in with the service key
