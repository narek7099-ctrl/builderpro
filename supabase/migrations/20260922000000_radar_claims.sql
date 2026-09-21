-- Lead Radar, rebuilt for self-serve.
--
-- The old model sold one contractor per trade per zip, assigned by hand through
-- the command centre. That cannot survive an app anyone can sign up for: the
-- ceiling is lowest exactly where demand is highest, a dormant subscriber
-- blocks a live one, and every signup needs a human to check the map first.
--
-- What a contractor actually wants is narrower than owning an area: that the
-- door they are about to knock is not also being knocked by three other people
-- using the same tool. So exclusivity moves from the territory to the door.
--
--   radar_seats      who is subscribed, what trade, and where they work.
--                    Self-serve — no agency step.
--   radar_claims     one lock per door per trade. Yours while you are working
--                    it; back in the pool when you are not.
--   radar_supply_log what the feeds actually produced each day, so the size of
--                    everyone's daily hand is derived from real supply instead
--                    of a number someone guessed.

-- ---------------------------------------------------------------- seats -----
-- A seat is a subscription to a trade in an area. Centre plus radius rather
-- than a list of zips: zips run from about 400 homes to about 40,000, so one
-- contractor per zip is absurd in a city and meaningless in the country.
create table if not exists public.radar_seats (
  email      text not null,
  trade      text not null,
  lat        double precision not null,
  lng        double precision not null,
  radius_mi  numeric not null default 25 check (radius_mi > 0 and radius_mi <= 120),
  active     boolean not null default true,
  -- how many doors a day this seat wants; null means "size it from supply"
  per_day    int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (email, trade)
);
alter table public.radar_seats enable row level security;

drop policy if exists radar_seats_own on public.radar_seats;
create policy radar_seats_own on public.radar_seats
  for all using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
        with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ------------------------------------------------------------ door keys -----
-- The key is computed in JavaScript, in portal/radar-key.js, and the scheduled
-- job carries a checked copy of it. Deliberately NOT a SQL function too: a
-- third implementation is a third chance for two spellings of one house to
-- disagree, and a claim that can be taken twice is worse than no claim at all.
-- Doors arrive here already keyed.

-- ---------------------------------------------------------------- claims ----
-- One row per door per trade. A roofer and a landscaper may both claim the
-- same house; two roofers may not.
create table if not exists public.radar_claims (
  door       text not null,
  trade      text not null,
  owner      text not null,
  address    text not null default '',
  state      text not null default 'claimed'
             check (state in ('claimed', 'contacted', 'booked', 'won', 'dead')),
  claimed_at timestamptz not null default now(),
  -- the last time real work happened on it: contacted, booked, moved along.
  -- Opening the lead does not count, or a claim could be kept alive by looking
  -- at it.
  touched_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  primary key (door, trade)
);
alter table public.radar_claims enable row level security;
create index if not exists radar_claims_owner on public.radar_claims (lower(owner), trade);
create index if not exists radar_claims_expiry on public.radar_claims (expires_at) where state not in ('won', 'dead');

-- Your own claims, in full.
drop policy if exists radar_claims_own on public.radar_claims;
create policy radar_claims_own on public.radar_claims
  for all using (lower(owner) = lower(coalesce(auth.jwt() ->> 'email', '')))
        with check (lower(owner) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Everyone else needs to know a door is taken so it can be kept off their map
-- — and nothing more than that. Not who has it, not what they have done with
-- it. A view, because row-level security cannot hide a column.
create or replace view public.radar_taken
with (security_invoker = false) as
  select door, trade, expires_at
  from public.radar_claims
  where state <> 'dead' and expires_at > now();
grant select on public.radar_taken to authenticated;

-- Sweeping expired claims. Anything not worked inside its window goes back in
-- the pool; anything won or marked dead stays where it is. At any real scale
-- this returns more doors than the permit feeds deliver, so it is a supply
-- mechanism as much as it is a rule against hoarding.
create or replace function public.radar_sweep_claims()
returns int language sql security definer set search_path = public as $$
  with gone as (
    delete from public.radar_claims
    where expires_at <= now() and state in ('claimed', 'contacted')
    returning 1
  ) select count(*)::int from gone;
$$;
-- Postgres grants EXECUTE to PUBLIC by default, and this one deletes rows.
-- It is the scheduled job's, nobody else's.
revoke all on function public.radar_sweep_claims() from public;

-- Real work on a lead pushes its expiry out. Called by the portal when a
-- contact is actually made, not when the card is opened.
create or replace function public.radar_touch_claim(p_door text, p_trade text, p_state text default null)
returns void language sql security definer set search_path = public as $$
  update public.radar_claims
     set touched_at = now(),
         state      = coalesce(p_state, state),
         expires_at = case when coalesce(p_state, state) in ('won', 'dead')
                           then expires_at else now() + interval '14 days' end
   where door = p_door and trade = p_trade
     and lower(owner) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;
-- Safe for a signed-in client: it can only ever touch a row it owns, because
-- the WHERE clause checks the claim's owner against their own token.
revoke all on function public.radar_touch_claim(text, text, text) from public;
grant execute on function public.radar_touch_claim(text, text, text) to authenticated;

-- ------------------------------------------------------------- dealing ------
-- Two contractors in one town must not open the map and see the same doors.
-- Before anyone has claimed anything there is nothing to tell them apart, so
-- the backlog is split by arithmetic: each seat is given a slot, and a door
-- belongs to whoever's slot its key hashes to. Stable, so a door does not move
-- between people from one day to the next, and even, so nobody gets the thin
-- end of the town.
--
-- Returns the caller's slot and how many seats share their patch. Security
-- definer because working that out means counting other people's seats, which
-- is not something a client may read — it gets two integers, not a roster.
create or replace function public.radar_deal_slot(p_trade text)
returns table (slot int, total int)
language sql security definer set search_path = public as $$
  with me as (
    select * from public.radar_seats
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and trade = p_trade and active
     limit 1
  ),
  /* seats whose circles overlap mine, me included, oldest first so the
     ordering does not shuffle when somebody new signs up */
  near as (
    select s.email,
           row_number() over (order by s.created_at, s.email) - 1 as idx
      from public.radar_seats s, me
     where s.trade = p_trade and s.active
       and 3959 * acos(least(1, greatest(-1,
             cos(radians(me.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(me.lng))
           + sin(radians(me.lat)) * sin(radians(s.lat))))) <= (me.radius_mi + s.radius_mi)
  )
  select coalesce((select idx from near where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))::int, 0),
         greatest((select count(*) from near)::int, 1);
$$;
revoke all on function public.radar_deal_slot(text) from public;
grant execute on function public.radar_deal_slot(text) to authenticated;

-- ----------------------------------------------------------- supply log -----
-- What the feeds actually produced, per area per trade per day. Two weeks of
-- this and the daily hand can be sized from the real inflow in the real
-- cities, rather than from an assumption. Written by the scheduled job only.
create table if not exists public.radar_supply_log (
  day        date not null default current_date,
  area       text not null,
  trade      text not null,
  fetched    int  not null default 0,   -- rows the permit feeds returned
  scored     int  not null default 0,   -- rows that cleared the scoring rules
  fresh      int  not null default 0,   -- of those, first seen today
  recycled   int  not null default 0,   -- doors handed back by expired claims
  seats      int  not null default 0,   -- subscribers sharing that supply
  primary key (day, area, trade)
);
alter table public.radar_supply_log enable row level security;
-- (no policies: service-role only — this is ours to read, not the client's)

-- ------------------------------------------------- the old exclusives -------
-- Clients who were sold an exclusive territory were sold one, so they keep it.
-- The flag stays as an override: inside these zips they are dealt everything
-- and nobody else can take a seat. Honour the existing ones; stop selling new.
comment on table public.radar_territories is
  'Legacy exclusive territories, hand-assigned. Grandfathered: an active row
   still gives that email sole rights in those zips. Superseded by radar_seats
   for every new subscriber.';
