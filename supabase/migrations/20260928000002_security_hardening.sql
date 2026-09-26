-- Security hardening, from the Supabase security advisor.

-- 1. radar_taken: every contractor must see which doors are claimed (door, trade, expiry only),
--    so it reads past RLS; but as a plain view it was also writable, and anon could update or
--    delete other contractors' claims through it. Now: a read-only definer function behind an
--    invoker view, selectable by signed-in users only.
create or replace function public.radar_taken_rows()
returns table (door text, trade text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select door, trade, expires_at from public.radar_claims
   where state <> 'dead' and expires_at > now();
$$;
revoke all on function public.radar_taken_rows() from public, anon;
grant execute on function public.radar_taken_rows() to authenticated, service_role;

drop view if exists public.radar_taken;
create view public.radar_taken with (security_invoker = true) as
  select door, trade, expires_at from public.radar_taken_rows();
revoke all on public.radar_taken from public, anon, authenticated;
grant select on public.radar_taken to authenticated, service_role;

-- 2. team-scoped tables: the rules applied to every role; signed-in users only
alter policy employees_own on public.employees to authenticated;
alter policy time_entries_own on public.time_entries to authenticated;

-- 3. account functions: callable by signed-in users (and the server), not by anyone anonymous
do $$
declare f text;
begin
  foreach f in array array['public.bp_owner()','public.bp_role()','public.bp_team_claim()',
    'public.payroll_period(date,date)','public.radar_allowance(text)','public.radar_claim_door(text,text,text)',
    'public.radar_sweep_claims()','public.radar_touch_claim(text,text,text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
-- only radar-daily (service role) sweeps expired claims
revoke execute on function public.radar_sweep_claims() from authenticated;

-- 4. fixed search_path on the trigger helpers and the slug generator
do $$
declare f text;
begin
  foreach f in array array['public.ai_brain_touch()','public.portal_finance_touch()','public.contracts_freeze_signed()',
    'public.farm_touch()','public.roof_prospects_touch()','public.supply_touch()','public.stripe_touch()','public.lead_inbox_slug()'] loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;
