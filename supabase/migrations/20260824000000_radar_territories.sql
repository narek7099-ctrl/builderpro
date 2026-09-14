-- Lead Radar territories: one exclusive trade+zips slot per client (sold as a
-- paid add-on). Keyed by the client's login email; only the agency (service
-- role, via the command center) writes rows — clients can read their own.

create table if not exists public.radar_territories (
  email      text primary key,
  trade      text not null default 'roofing',
  zips       text[] not null default '{}',
  city       text not null default 'austin',
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.radar_territories enable row level security;

drop policy if exists radar_terr_sel on public.radar_territories;
create policy radar_terr_sel on public.radar_territories
  for select using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
-- (no insert/update/delete policies: service-role only)

-- link portal contacts to their GHL twin so "Made contact" can tag them there
alter table public.contacts add column if not exists ghl_id text default '';
