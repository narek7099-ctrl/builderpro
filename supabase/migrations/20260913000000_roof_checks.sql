-- Roof Age Checker results. Filed by the public roofing estimator embed (anon
-- key) so every homeowner who checks their roof shows up in the contractor's
-- portal under Lead Radar → Roof checks. `owner` is set when the embed knows
-- whose calculator it is; unassigned rows are visible to signed-in clients the
-- same way unowned calculator_pricing rows are.
-- Run in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.roof_checks (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references auth.users(id) on delete cascade,
  calc_id     text not null default 'roofing',
  address     text,
  zip         text,
  lat         double precision,
  lng         double precision,
  score       int,
  band        text,          -- good | mid | warn | bad
  label       text,
  age         int,
  material    text,
  issues      text[] not null default '{}',
  storm       text,
  permit_year int,
  built_year  int,
  name        text,
  phone       text,
  email       text,
  host        text,          -- site the embed ran on
  status      text not null default 'new',   -- new | contacted | booked | won | lost
  created_at  timestamptz not null default now()
);
create index if not exists roof_checks_owner_idx on public.roof_checks(owner, created_at desc);
alter table public.roof_checks enable row level security;

-- the public embed may file a check; nobody outside can read them back
drop policy if exists roof_checks_ins on public.roof_checks;
create policy roof_checks_ins on public.roof_checks for insert to anon, authenticated with check (true);
drop policy if exists roof_checks_sel on public.roof_checks;
create policy roof_checks_sel on public.roof_checks for select to authenticated using (owner is null or owner = auth.uid());
drop policy if exists roof_checks_upd on public.roof_checks;
create policy roof_checks_upd on public.roof_checks for update to authenticated using (owner is null or owner = auth.uid()) with check (owner is null or owner = auth.uid());
grant insert on public.roof_checks to anon, authenticated;
grant select, update on public.roof_checks to authenticated;
