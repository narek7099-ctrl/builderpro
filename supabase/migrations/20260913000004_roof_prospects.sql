-- Big Roofs: the commercial buildings a contractor has picked off the map and
-- is working by phone.
--
-- One row per building per contractor. osm_id is the OpenStreetMap way id, so
-- the same building can be worked independently by two different contractors —
-- the unique index is on (owner, osm_id), never on osm_id alone.
--
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists "pgcrypto";

create table if not exists public.roof_prospects (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,

  osm_id     text not null,                 -- OpenStreetMap way id, e.g. w123456
  name       text,
  kind       text,                          -- retail | warehouse | church | school | …
  area_sqft  integer,                       -- building footprint = the flat roof
  lat        double precision,
  lng        double precision,
  addr       text,
  phone      text,
  website    text,

  -- new | called | talked | walked | bid | won | lost
  stage      text not null default 'new',
  note       text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one row per building per contractor; two contractors may work the same roof
create unique index if not exists roof_prospects_owner_osm_idx on public.roof_prospects(owner, osm_id);
create index if not exists roof_prospects_owner_idx on public.roof_prospects(owner, area_sqft desc);

alter table public.roof_prospects enable row level security;

drop policy if exists rp_sel on public.roof_prospects;
create policy rp_sel on public.roof_prospects for select to authenticated using (owner = auth.uid());
drop policy if exists rp_ins on public.roof_prospects;
create policy rp_ins on public.roof_prospects for insert to authenticated with check (owner = auth.uid());
drop policy if exists rp_upd on public.roof_prospects;
create policy rp_upd on public.roof_prospects for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists rp_del on public.roof_prospects;
create policy rp_del on public.roof_prospects for delete to authenticated using (owner = auth.uid());

grant select, insert, update, delete on public.roof_prospects to authenticated;

create or replace function public.roof_prospects_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists roof_prospects_touch_trg on public.roof_prospects;
create trigger roof_prospects_touch_trg before update on public.roof_prospects
  for each row execute function public.roof_prospects_touch();
