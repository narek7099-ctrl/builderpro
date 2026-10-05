-- Storm alerts: after a hail or wind storm hits near past customers, the
-- owner is asked once ("Hail hit near 14 past customers. Send the storm
-- check text?"). One tap sends workflow 36 (bp-storm-followup) to them.
--
-- The ghl-events function finds the storms (NOAA SPC storm reports), picks
-- the past customers whose job is a storm trade within the owner's radius,
-- and writes one row here per owner per storm day. Nothing goes to a
-- customer until the owner says yes, unless they turned on
-- "send it if I don't answer within 48 hours" (client_settings
-- data.automation.stormAutoSend). Unanswered alerts lapse after 3 days.

create table if not exists public.storm_alerts (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null,
  day          date not null,                       -- the storm day (SPC report day)
  reports      jsonb not null default '[]'::jsonb,  -- [{kind:'hail'|'wind', size, speed, place, state, lat, lon}]
  jobs         jsonb not null default '[]'::jsonb,  -- [{id, name, addr, miles, why}]
  summary      text not null default '',            -- "1.75 in hail near Lorena, TX"
  status       text not null default 'pending' check (status in ('pending', 'sent', 'dismissed', 'expired')),
  sent_count   int not null default 0,
  reminded_at  timestamptz,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (owner, day)
);
alter table public.storm_alerts enable row level security;
drop policy if exists storm_alerts_read on public.storm_alerts;
create policy storm_alerts_read on public.storm_alerts for select to authenticated using (owner = public.qb_whoami());

-- send the storm follow-up for an alert (all its customers, or the ones picked)
create or replace function public.bp_storm_send(p_owner uuid, p_id uuid, p_jobs text[], p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare a public.storm_alerts; x jsonb; j jsonb; n int := 0; note text;
begin
  select * into a from public.storm_alerts where id = p_id and owner = p_owner for update;
  if a.id is null or a.status <> 'pending' then return -1; end if;
  note := left(coalesce(nullif(trim(p_note), ''), a.summary), 300);
  for x in select e from jsonb_array_elements(a.jobs) e loop
    continue when p_jobs is not null and not ((x->>'id') = any(p_jobs));
    j := public.bp_job_of(p_owner, x->>'id');
    continue when j is null or coalesce((j->>'autoPause')::boolean, false);
    perform public.bp_ghl_event(p_owner, 'storm_followup', j, 'storm:' || a.id || ':' || (x->>'id'), jsonb_build_object('note', note));
    n := n + 1;
  end loop;
  update public.storm_alerts set status = 'sent', sent_count = n, decided_at = now() where id = a.id;
  return n;
end $$;
revoke all on function public.bp_storm_send(uuid, uuid, text[], text) from public, anon, authenticated;
grant execute on function public.bp_storm_send(uuid, uuid, text[], text) to service_role;

-- the owner's buttons
create or replace function public.storm_alert_send(p_id uuid, p_jobs text[] default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid := public.qb_whoami(); n int;
begin
  if o is null then return jsonb_build_object('ok', false, 'error', 'not allowed'); end if;
  n := public.bp_storm_send(o, p_id, p_jobs, p_note);
  if n < 0 then return jsonb_build_object('ok', false, 'error', 'This storm alert was already handled.'); end if;
  return jsonb_build_object('ok', true, 'queued', n);
end $$;
revoke all on function public.storm_alert_send(uuid, text[], text) from public, anon;
grant execute on function public.storm_alert_send(uuid, text[], text) to authenticated;

create or replace function public.storm_alert_dismiss(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid := public.qb_whoami();
begin
  if o is null then return jsonb_build_object('ok', false, 'error', 'not allowed'); end if;
  update public.storm_alerts set status = 'dismissed', decided_at = now() where id = p_id and owner = o and status = 'pending';
  return jsonb_build_object('ok', found);
end $$;
revoke all on function public.storm_alert_dismiss(uuid) from public, anon;
grant execute on function public.storm_alert_dismiss(uuid) to authenticated;
