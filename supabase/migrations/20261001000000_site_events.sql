-- Website traffic for the contractor's OWN site.
--
-- embed/track.js (pasted into the owner's <head>) batches page views, time on
-- page and conversions (calculator / health / damage tool opened, completed,
-- lead; tel: and mailto: clicks; form submits) to the site-track edge
-- function, which is the only writer (service role). No cookies, no IPs, no
-- personal data: a per-tab session id from sessionStorage, the path, the
-- referring host, UTM tags, a device class and a country guessed from the
-- browser's time zone.
--
-- The portal's Marketing -> Website tab reads it back under RLS: an owner
-- sees their own rows and nothing else.

create table if not exists public.site_events (
  id           bigint generated always as identity primary key,
  owner        uuid not null references auth.users(id) on delete cascade,
  ts           timestamptz not null default now(),
  session      text not null,
  type         text not null check (type in ('pageview','time','tool_open','tool_done','lead','call_click','email_click','form_submit','verify','custom')),
  path         text,
  title        text,
  referrer     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  device       text check (device in ('desktop','mobile','tablet')),
  country      text,
  value        jsonb not null default '{}'::jsonb
);

create index if not exists site_events_owner_ts on public.site_events (owner, ts desc);
create index if not exists site_events_owner_type_ts on public.site_events (owner, type, ts desc);

alter table public.site_events enable row level security;

drop policy if exists site_events_owner_select on public.site_events;
create policy site_events_owner_select on public.site_events
  for select using (owner = auth.uid());

-- no insert/update/delete policies: writes come only from the site-track
-- function with the service role, which bypasses RLS
revoke insert, update, delete on public.site_events from anon, authenticated;
grant select on public.site_events to authenticated;
