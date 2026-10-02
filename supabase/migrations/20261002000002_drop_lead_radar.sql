-- Lead Radar is gone from the product: the portal page, the radar-sync /
-- radar-daily / skip-trace functions and GHL workflows 17 and 18 were all
-- removed. This drops what it left in the database.
--
-- Created by 20260824000000_radar_territories.sql, 20260922000000_radar_claims.sql
-- and 20260928000002_security_hardening.sql (section 1). Everything here is
-- radar-only. Deliberately NOT touched:
--   * public.contacts.ghl_id — added in the radar_territories migration, but
--     Lead Sources (lead-intake) reads and writes it. It stays.
--   * public.roof_checks, public.lead_sources and the rest of Lead Sources.
--
-- Safe to re-run: every statement is IF EXISTS / guarded.

-- ---------------------------------------------------------------- cron ------
-- radar-daily was scheduled by hand in the SQL editor (no migration created
-- it), so the job name is matched loosely and pg_cron may not be installed.
do $$
declare j record;
begin
  if to_regclass('cron.job') is not null then
    for j in
      select jobid from cron.job
       where jobname ilike '%radar%'
          or command ilike '%/functions/v1/radar-daily%'
          or command ilike '%/functions/v1/radar-sync%'
          or command ilike '%/functions/v1/skip-trace%'
          or command ilike '%radar_sweep_claims%'
    loop
      perform cron.unschedule(j.jobid);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------- view ------
-- Before the function it selects from.
drop view if exists public.radar_taken;

-- ----------------------------------------------------------- functions ------
drop function if exists public.radar_taken_rows();
drop function if exists public.radar_claim_door(text, text, text);
drop function if exists public.radar_allowance(text);
drop function if exists public.radar_touch_claim(text, text, text);
drop function if exists public.radar_sweep_claims();

-- -------------------------------------------------------------- tables ------
-- Dropping a table takes its policies (radar_terr_sel, radar_seats_own,
-- radar_claims_own) and indexes (radar_claims_owner, radar_claims_expiry)
-- with it. The policies are dropped by name first only so this reads as a
-- complete list; the guard keeps it from failing once the table is gone.
do $$
begin
  if to_regclass('public.radar_claims') is not null then
    drop policy if exists radar_claims_own on public.radar_claims;
  end if;
  if to_regclass('public.radar_seats') is not null then
    drop policy if exists radar_seats_own on public.radar_seats;
  end if;
  if to_regclass('public.radar_territories') is not null then
    drop policy if exists radar_terr_sel on public.radar_territories;
  end if;
end $$;

drop table if exists public.radar_claims;
drop table if exists public.radar_supply_log;
drop table if exists public.radar_seats;
drop table if exists public.radar_territories;
