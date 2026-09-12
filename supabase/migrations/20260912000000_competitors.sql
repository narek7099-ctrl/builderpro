-- Competitor tracking for the Marketing → Competitors page.
-- One row per rival Yelp listing a client chooses to watch. The edge function
-- (marketing-oauth) refreshes `snapshot` daily and appends to `history`, so the
-- portal can show review velocity, not just a total.
-- Run in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.competitors (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  yelp_id    text not null,
  name       text,
  snapshot   jsonb not null default '{}'::jsonb,   -- latest rating / reviews / categories / photos / claimed
  history    jsonb not null default '[]'::jsonb,   -- [{at, rating, reviews}] — most recent 60 refreshes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, yelp_id)
);
create index if not exists competitors_owner_idx on public.competitors(owner, created_at);
alter table public.competitors enable row level security;
-- the browser only reads; every write goes through the edge function with the service role
drop policy if exists competitors_read on public.competitors;
create policy competitors_read on public.competitors for select using (owner = auth.uid());
