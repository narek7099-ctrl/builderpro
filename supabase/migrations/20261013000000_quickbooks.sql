-- QuickBooks Online: one connection per business, and a log of what was sent.
--
-- qb_connections holds the Intuit tokens. RLS is on with no policies, so only
-- the edge functions (service role) ever read it; the browser gets status
-- through qb_status(). qb_sync_log is readable by owner/office (not crew or
-- subs) and doubles as the link table: an ok row for (kind, ref) says that
-- BuilderPro item already exists in QuickBooks as qb_id, so nothing is sent twice.

create table if not exists public.qb_connections (
  owner              uuid primary key,
  env                text not null default 'sandbox',
  realm_id           text,
  company_name       text,
  access_token       text,
  refresh_token      text,
  access_expires_at  timestamptz,
  refresh_expires_at timestamptz,
  account_map        jsonb not null default '{}'::jsonb,
  oauth_state        text,
  oauth_state_at     timestamptz,
  connected_at       timestamptz,
  last_sync_at       timestamptz,
  updated_at         timestamptz not null default now()
);
alter table public.qb_connections enable row level security;
create unique index if not exists qb_connections_state on public.qb_connections(oauth_state) where oauth_state is not null;

create table if not exists public.qb_sync_log (
  id      uuid primary key default gen_random_uuid(),
  owner   uuid not null,
  kind    text not null,          -- customer | job | vendor | expense | payment | item
  ref     text not null,          -- the BuilderPro id it came from
  label   text,
  amount  numeric,
  qb_id   text,
  ok      boolean not null,
  error   text,
  at      timestamptz not null default now()
);
alter table public.qb_sync_log enable row level security;
create index if not exists qb_sync_log_owner_at on public.qb_sync_log(owner, at desc);
create unique index if not exists qb_sync_log_done on public.qb_sync_log(owner, kind, ref) where ok;

create policy qb_sync_log_read on public.qb_sync_log for select to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew' and not public.bp_is_sub());

-- who may run QuickBooks: the owner or office, answered for the edge function
create or replace function public.qb_whoami() returns uuid
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and public.bp_team_role() <> 'crew' and not public.bp_is_sub()
              then public.bp_owner() end;
$$;
revoke all on function public.qb_whoami() from public, anon;
grant execute on function public.qb_whoami() to authenticated;
