-- Equipment records and Good / Better / Best estimates.
--
-- assets: one row per piece of equipment at a customer's property (an AC
--   condenser, a water heater, a roof). Made from a photo of the nameplate,
--   which asset-scan reads into make, model, serial and the year it was made.
--   Age, warranty and a predicted replacement date come from these dates and
--   the expected life. Crew can add and service equipment on site; subs can't
--   see it.
-- asset_services: every visit to a piece of equipment (maintenance, repair,
--   inspection) with what was done, readings, photos and its condition.
-- estimate_options: three priced options for one estimate sheet, sent as a
--   link (#est=<token>). The customer picks one and signs on that page, and
--   estimate-options turns the pick into the accepted estimate in the
--   contractor's HighLevel, so the deposit and the rest follow as before.

set lock_timeout = '5s';

create table if not exists public.assets (
  id                   uuid primary key default gen_random_uuid(),
  owner                uuid not null default public.bp_owner(),
  contact_id           text not null default '',
  customer             text not null default '',
  addr                 text not null default '',
  job_id               text not null default '',
  name                 text not null default '',
  category             text not null default '',
  make                 text not null default '',
  model                text not null default '',
  serial               text not null default '',
  capacity             text not null default '',
  fuel                 text not null default '',
  refrigerant          text not null default '',
  voltage              text not null default '',
  location             text not null default '',
  installed_on         date,
  mfg_date             date,
  life_years           numeric,
  warranty_until       date,
  labor_warranty_until date,
  service_months       int not null default 0,
  last_service         date,
  tags                 text[] not null default '{}',
  status               text not null default 'active',   -- active | replaced | removed
  photo                text not null default '',
  nameplate            text not null default '',
  docs                 jsonb not null default '[]'::jsonb,
  notes                text not null default '',
  scan                 jsonb not null default '{}'::jsonb,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists assets_owner on public.assets(owner, updated_at desc);
create index if not exists assets_contact on public.assets(owner, contact_id);
alter table public.assets enable row level security;
create policy assets_read on public.assets for select to authenticated
  using (owner = public.bp_owner() and public.bp_role() <> 'sub');
create policy assets_add on public.assets for insert to authenticated
  with check (owner = public.bp_owner() and public.bp_role() <> 'sub');
create policy assets_edit on public.assets for update to authenticated
  using (owner = public.bp_owner() and public.bp_role() <> 'sub')
  with check (owner = public.bp_owner() and public.bp_role() <> 'sub');
create policy assets_remove on public.assets for delete to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
revoke all on public.assets from anon;
grant select, insert, update, delete on public.assets to authenticated;

create table if not exists public.asset_services (
  id         uuid primary key default gen_random_uuid(),
  asset_id   uuid not null references public.assets(id) on delete cascade,
  owner      uuid not null default public.bp_owner(),
  at         date not null default current_date,
  kind       text not null default 'maintenance',   -- maintenance | repair | inspection | install
  summary    text not null default '',
  checklist  jsonb not null default '[]'::jsonb,     -- [{t, ok}]
  readings   jsonb not null default '{}'::jsonb,
  photos     jsonb not null default '[]'::jsonb,     -- ["sb:path", ...]
  condition  text not null default '',               -- good | fair | poor
  by_name    text not null default '',
  by_uid     uuid default auth.uid(),
  job_id     text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists asset_services_asset on public.asset_services(asset_id, at desc);
alter table public.asset_services enable row level security;
create policy asset_services_read on public.asset_services for select to authenticated
  using (owner = public.bp_owner() and public.bp_role() <> 'sub');
create policy asset_services_add on public.asset_services for insert to authenticated
  with check (owner = public.bp_owner() and public.bp_role() <> 'sub');
create policy asset_services_edit on public.asset_services for update to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew')
  with check (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
create policy asset_services_remove on public.asset_services for delete to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
revoke all on public.asset_services from anon;
grant select, insert, update, delete on public.asset_services to authenticated;

-- a service visit moves the equipment's last service date forward
create or replace function public.bp_asset_serviced() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.assets
     set last_service = greatest(coalesce(last_service, new.at), new.at), updated_at = now()
   where id = new.asset_id and owner = new.owner;
  return new;
end $$;
create trigger asset_services_bump after insert on public.asset_services
  for each row execute function public.bp_asset_serviced();

create table if not exists public.estimate_options (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null,
  token       text not null unique default encode(gen_random_bytes(18), 'hex'),
  job_id      text not null default '',
  contact_id  text not null default '',
  ghl_contact text not null default '',
  customer    text not null default '',
  phone       text not null default '',
  email       text not null default '',
  title       text not null default '',
  scope       text not null default '',
  addr        text not null default '',
  tiers       jsonb not null default '[]'::jsonb,   -- [{key,name,title,summary,bullets[],warranty,lines[],tax,disc,total}]
  recommended text not null default 'better',
  show        text not null default 'items',       -- items | sections | total: how much of each price the customer sees
  status      text not null default 'sent',         -- sent | chosen | declined | void
  chosen      text not null default '',
  signer_name text not null default '',
  signature   text not null default '',
  note        text not null default '',
  est_id      text not null default '',
  deposit     jsonb not null default '{}'::jsonb,
  audit       jsonb not null default '[]'::jsonb,
  expires_at  timestamptz,
  viewed_at   timestamptz,
  chosen_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists estimate_options_owner on public.estimate_options(owner, created_at desc);
create index if not exists estimate_options_job on public.estimate_options(owner, job_id);
alter table public.estimate_options enable row level security;
create policy estimate_options_read on public.estimate_options for select to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
revoke all on public.estimate_options from anon;
grant select on public.estimate_options to authenticated;   -- written by estimate-options with the service key
