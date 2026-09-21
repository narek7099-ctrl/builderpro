-- Lead Sources — the leads a contractor already pays for, arriving here.
--
-- Lead Radar finds doors nobody has knocked. This is the other half: Angi,
-- Thumbtack, Networx, a local ping-post seller, the form on their own site.
-- They are already buying those leads. What they are not doing is answering
-- them in thirty seconds, and on a shared lead that is most of what decides
-- who gets the job — the vendor sold the same homeowner to three other
-- contractors within the same minute.
--
-- So the job here is narrow and worth doing: catch the lead the instant the
-- vendor posts it, put it in front of the AI receptionist that already
-- exists, and keep an honest record of what each vendor costs per booked
-- job. That last part is why lead_events stores the raw payload — a
-- contractor arguing with a vendor about lead quality needs the receipt.

-- ---------------------------------------------------------------- sources ---
-- One row per vendor per contractor. The id IS the webhook path, so it has to
-- be unguessable on its own; the secret is a second factor for vendors that
-- can send a header or a query parameter, and many cannot.
create table if not exists public.lead_sources (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email         text not null default '',
  -- which parser to use. 'generic' reads the common field names and is what
  -- most ping-post sellers and website forms need.
  vendor        text not null default 'generic'
                check (vendor in ('angi','thumbtack','networx','homeadvisor','modernize','website','generic')),
  label         text not null default '',
  secret        text not null default encode(gen_random_bytes(18), 'hex'),
  -- what they pay for a lead from this vendor. Nullable because plenty of
  -- them genuinely do not know on day one, and a made-up number is worse
  -- than an empty column when the point is to compare vendors honestly.
  cost_per_lead numeric,
  trade         text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  -- denormalised counters, so the page can show volume without reading
  -- every event row back. Corrected by the view below if they ever drift.
  total_leads   int not null default 0,
  last_lead_at  timestamptz
);
alter table public.lead_sources enable row level security;
create index if not exists lead_sources_owner on public.lead_sources (owner, created_at desc);

drop policy if exists lead_sources_own on public.lead_sources;
create policy lead_sources_own on public.lead_sources
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- ----------------------------------------------------------------- events ---
-- Every inbound post, including the ones that were rejected or turned out to
-- be duplicates. Especially those: "you charged me twice for the same
-- homeowner" is only an argument you can win with the timestamps in hand.
create table if not exists public.lead_events (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references public.lead_sources(id) on delete cascade,
  owner       uuid not null,
  received_at timestamptz not null default now(),
  name        text not null default '',
  phone       text not null default '',
  -- "(512) 555-0134" and "512.555.0134" are the same homeowner and two
  -- vendors will spell them differently. The duplicate check compares this,
  -- never the raw phone; the raw one is kept because a contractor reading
  -- the list wants to see a phone number, not a digit string.
  phone_key   text generated always as
              (regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^1(\d{10})$', '\1')) stored,
  email       text not null default '',
  address     text not null default '',
  job         text not null default '',
  -- accepted | duplicate | rejected. Duplicates are kept, not dropped.
  status      text not null default 'accepted'
              check (status in ('accepted','duplicate','rejected')),
  reason      text not null default '',
  contact_id  uuid,
  ghl_id      text not null default '',
  cost        numeric,
  -- exactly what the vendor sent. The receipt.
  raw         jsonb not null default '{}'::jsonb
);
alter table public.lead_events enable row level security;
create index if not exists lead_events_owner on public.lead_events (owner, received_at desc);
create index if not exists lead_events_source on public.lead_events (source_id, received_at desc);
-- the duplicate check reads this on every inbound post, so it wants an index
create index if not exists lead_events_dedupe on public.lead_events (owner, phone_key, received_at desc)
  where phone_key <> '';
create index if not exists lead_events_dedupe_email on public.lead_events (owner, lower(email), received_at desc)
  where email <> '';

drop policy if exists lead_events_own on public.lead_events;
create policy lead_events_own on public.lead_events
  for select using (owner = auth.uid());
-- no insert policy on purpose: these are written by the intake function with
-- the service role. A client that could write its own lead events could also
-- write itself a cheaper cost-per-lead than it paid.

-- ------------------------------------------------------------- what it cost --
-- Per source: volume, what came in, and what it cost. Deliberately a view and
-- not a stored total — the counters above are for speed, this is for truth.
create or replace view public.lead_source_stats
with (security_invoker = true) as
  select s.id,
         s.label,
         s.vendor,
         s.cost_per_lead,
         count(e.id) filter (where e.status = 'accepted')                        as leads,
         count(e.id) filter (where e.status = 'duplicate')                       as duplicates,
         count(e.id) filter (where e.received_at > now() - interval '30 days'
                               and e.status = 'accepted')                        as leads_30d,
         coalesce(sum(e.cost) filter (where e.status = 'accepted'), 0)           as spend,
         max(e.received_at)                                                      as last_lead_at
    from public.lead_sources s
    left join public.lead_events e on e.source_id = s.id
   group by s.id, s.label, s.vendor, s.cost_per_lead;

-- security_invoker so row-level security on the underlying tables still
-- applies: without it this view would hand every contractor everyone else's
-- numbers, which is the one thing a competitor would most like to read.

-- ------------------------------------------------------------ intake helper --
-- Resolving a webhook to its source, for the intake function alone. A plain
-- select would do, but it is worth having the active check and the secret
-- comparison in exactly one place rather than spelled out at the call site.
create or replace function public.lead_source_for_hook(p_id uuid, p_secret text)
returns table (id uuid, owner uuid, email text, vendor text, label text,
               cost_per_lead numeric, trade text)
language sql security definer set search_path = public as $$
  select s.id, s.owner, s.email, s.vendor, s.label, s.cost_per_lead, s.trade
    from public.lead_sources s
   where s.id = p_id and s.active
     and (s.secret = p_secret or p_secret = '')
   limit 1;
$$;
-- The empty-secret branch is not laxity, it is the vendors: several of the
-- ping-post sellers post to a bare URL and cannot add a header or a query
-- parameter at all. For those the unguessable id is the credential, which is
-- the same security model as a Slack or Stripe webhook URL. Sources that CAN
-- send the secret should, and the portal shows the URL with it attached.
revoke all on function public.lead_source_for_hook(uuid, text) from public;
grant execute on function public.lead_source_for_hook(uuid, text) to service_role;

-- Counting an arriving lead. In SQL rather than a read-then-write from the
-- function, because two vendors posting in the same second would each read
-- the same total and each write it back plus one — and the count would drift
-- down exactly when the source is busiest, which is when anyone is looking.
create or replace function public.lead_source_bump(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.lead_sources
     set total_leads = total_leads + 1, last_lead_at = now()
   where id = p_id;
$$;
revoke all on function public.lead_source_bump(uuid) from public;
grant execute on function public.lead_source_bump(uuid) to service_role;
