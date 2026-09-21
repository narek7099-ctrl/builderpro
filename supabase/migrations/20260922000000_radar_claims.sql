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
  -- The daily allowance, from the plan: 3 on the middle one, 5 on the top.
  -- Null means "no seat row decided this yet" and the claim function falls
  -- back to 3, so an existing client is never locked out by a table they
  -- have never heard of.
  per_day    int,
  -- minutes east of UTC, so "3 a day" resets at midnight where they live
  -- rather than at six in the evening. The portal sends it on sign-in.
  tz_offset_min int not null default 0,
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
-- It is the scheduled job's, nobody else's — but revoking from PUBLIC takes
-- it away from the job too unless the job's role is named explicitly. Whether
-- service_role already holds it depends on default privileges having been set
-- up, and this must not depend on that: the sweep's only caller swallows its
-- own errors, so a silent permission denial would mean claims never expire
-- and nobody would find out until a contractor asked why the map was empty.
revoke all on function public.radar_sweep_claims() from public;
grant execute on function public.radar_sweep_claims() to service_role;

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

-- -------------------------------------------------------- daily limit ------
-- Claiming is capped per day, and the cap is the scarcity in this model: the
-- map is open to everyone, so what stops one contractor taking a whole
-- neighbourhood on Sunday night is the allowance, not a territory.
--
-- Enforced here rather than in the browser. A cap that only exists in the UI
-- is a suggestion — anyone can call the table directly with the same token.
create or replace function public.radar_claim_door(
  p_door text, p_trade text, p_address text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_allow int;
  v_off   int;
  v_since timestamptz;
  v_used  int;
begin
  if v_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'signed_out');
  end if;

  select coalesce(per_day, 3), coalesce(tz_offset_min, 0)
    into v_allow, v_off
    from public.radar_seats
   where lower(email) = v_email and trade = p_trade and active
   limit 1;
  -- no seat yet: the middle plan's allowance, so an existing client is not
  -- locked out by a table they have never heard of
  v_allow := coalesce(v_allow, 3);
  v_off   := coalesce(v_off, 0);

  -- midnight where they are, not midnight in UTC
  v_since := date_trunc('day', now() + make_interval(mins => v_off)) - make_interval(mins => v_off);

  select count(*) into v_used
    from public.radar_claims
   where lower(owner) = v_email and trade = p_trade and claimed_at >= v_since;

  if v_used >= v_allow then
    return jsonb_build_object('ok', false, 'reason', 'limit',
      'allowance', v_allow, 'used', v_used, 'resets_at', v_since + interval '1 day');
  end if;

  begin
    insert into public.radar_claims (door, trade, owner, address)
    values (p_door, p_trade, v_email, coalesce(p_address, ''));
  exception when unique_violation then
    -- somebody got there first; say so rather than quietly doing nothing
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;

  return jsonb_build_object('ok', true, 'allowance', v_allow, 'used', v_used + 1,
    'left', v_allow - v_used - 1, 'resets_at', v_since + interval '1 day');
end;
$$;
revoke all on function public.radar_claim_door(text, text, text) from public;
grant execute on function public.radar_claim_door(text, text, text) to authenticated;

-- What is left today, for the button and the counter. Same day boundary as
-- the claim itself, or the two would disagree at midnight.
create or replace function public.radar_allowance(p_trade text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_allow int; v_off int; v_since timestamptz; v_used int;
begin
  select coalesce(per_day, 3), coalesce(tz_offset_min, 0) into v_allow, v_off
    from public.radar_seats
   where lower(email) = v_email and trade = p_trade and active limit 1;
  v_allow := coalesce(v_allow, 3); v_off := coalesce(v_off, 0);
  v_since := date_trunc('day', now() + make_interval(mins => v_off)) - make_interval(mins => v_off);
  select count(*) into v_used from public.radar_claims
   where lower(owner) = v_email and trade = p_trade and claimed_at >= v_since;
  return jsonb_build_object('allowance', v_allow, 'used', v_used,
    'left', greatest(0, v_allow - v_used), 'resets_at', v_since + interval '1 day');
end;
$$;
revoke all on function public.radar_allowance(text) from public;
grant execute on function public.radar_allowance(text) to authenticated;

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
