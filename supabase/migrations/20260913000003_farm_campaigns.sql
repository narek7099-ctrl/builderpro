-- Neighbor Farming: each finished job becomes a farming campaign over the real
-- homes around it.
--
-- One row per campaign. The doors live in `targets` as jsonb rather than their
-- own table because they are only ever read and written as a whole list, by the
-- one contractor who owns them — a second table would buy nothing but joins.
--
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists "pgcrypto";

create table if not exists public.farm_campaigns (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- the job the neighbours can see from the sidewalk
  job_id      text,
  job_name    text,
  anchor_addr text,
  anchor_lat  double precision,
  anchor_lng  double precision,
  radius_m    integer not null default 450,

  -- [{addr, street, lat, lng, km, same, stage, note}]
  -- stage: new | hanger | texted | replied | booked | won
  targets     jsonb not null default '[]'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists farm_campaigns_owner_idx on public.farm_campaigns(owner, created_at desc);

alter table public.farm_campaigns enable row level security;

-- strictly the contractor's own campaigns; nothing here is public
drop policy if exists farm_sel on public.farm_campaigns;
create policy farm_sel on public.farm_campaigns for select to authenticated using (owner = auth.uid());
drop policy if exists farm_ins on public.farm_campaigns;
create policy farm_ins on public.farm_campaigns for insert to authenticated with check (owner = auth.uid());
drop policy if exists farm_upd on public.farm_campaigns;
create policy farm_upd on public.farm_campaigns for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists farm_del on public.farm_campaigns;
create policy farm_del on public.farm_campaigns for delete to authenticated using (owner = auth.uid());

grant select, insert, update, delete on public.farm_campaigns to authenticated;

create or replace function public.farm_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists farm_touch_trg on public.farm_campaigns;
create trigger farm_touch_trg before update on public.farm_campaigns
  for each row execute function public.farm_touch();
