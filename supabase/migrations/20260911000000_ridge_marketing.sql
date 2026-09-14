-- Ridge (AI receptionist) publish path + Marketing integrations + in-app requests.
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------- Ridge: the AI receptionist was renamed from Atlas ----------
update public.ai_brain set assistant_name = 'Ridge' where assistant_name = 'Atlas';
alter table public.ai_brain add column if not exists published_at  timestamptz;
alter table public.ai_brain add column if not exists ghl_synced_at timestamptz;

-- ---------- support_requests: cancel / billing / help requests filed from the portal ----------
create table if not exists public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  email      text,
  kind       text not null default 'help',   -- help | billing | cancel | brain
  subject    text,
  body       text,
  status     text not null default 'open',   -- open | done
  created_at timestamptz not null default now()
);
create index if not exists support_requests_owner_idx on public.support_requests(owner, created_at desc);
alter table public.support_requests enable row level security;
drop policy if exists support_requests_own on public.support_requests;
create policy support_requests_own on public.support_requests
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- ---------- integrations: Meta Ads / Google Ads / Google Business Profile / Yelp ----------
create table if not exists public.integrations (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade,
  provider      text not null,                 -- meta | google_ads | gbp | yelp
  status        text not null default 'connected',
  account_id    text,
  account_name  text,
  access_token  text,                          -- never exposed to the browser (column grants below)
  refresh_token text,
  expires_at    timestamptz,
  meta          jsonb not null default '{}'::jsonb,   -- cached stats / display info
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner, provider)
);
alter table public.integrations enable row level security;
drop policy if exists integrations_read on public.integrations;
create policy integrations_read on public.integrations for select using (owner = auth.uid());
drop policy if exists integrations_delete on public.integrations;
create policy integrations_delete on public.integrations for delete using (owner = auth.uid());
-- browsers may read the row, but never the tokens
revoke select on public.integrations from anon, authenticated;
grant select (id, owner, provider, status, account_id, account_name, meta, connected_at, updated_at)
  on public.integrations to authenticated;
grant delete on public.integrations to authenticated;

-- ---------- campaign_requests: "launch a campaign" briefs filed from Marketing ----------
create table if not exists public.campaign_requests (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  email      text,
  provider   text not null,                    -- meta | google_ads | yelp | gbp
  goal       text,
  budget     text,
  area       text,
  offer      text,
  notes      text,
  status     text not null default 'requested', -- requested | building | live | paused
  created_at timestamptz not null default now()
);
create index if not exists campaign_requests_owner_idx on public.campaign_requests(owner, created_at desc);
alter table public.campaign_requests enable row level security;
drop policy if exists campaign_requests_own on public.campaign_requests;
create policy campaign_requests_own on public.campaign_requests
  for all using (owner = auth.uid()) with check (owner = auth.uid());
