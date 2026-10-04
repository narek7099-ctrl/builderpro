-- HighLevel event feed.
--
-- BuilderPro knows things HighLevel can't see (projects, crews, clock-ins,
-- money). When one of them happens, a row goes into ghl_events; the
-- ghl-events edge function (every 2 minutes) finds the customer's HighLevel
-- contact, writes the job details into "BP ..." custom fields, then re-adds a
-- tag like "bp-job-completed". A HighLevel workflow listening for that tag
-- (Contact Tag Added) does the texting and emailing.
--
--   kind              tag                    when
--   job_scheduled     bp-job-scheduled       a project gets its first day, or its start moves
--   visit_tomorrow    bp-visit-tomorrow      the hourly scan: a booked day is tomorrow
--   crew_arrived      bp-crew-arrived        first clock-in on a job that day
--   job_completed     bp-job-completed       status turns done
--   payment_overdue   bp-payment-overdue     done with a balance, 3 / 7 / 14 days on
--   job_anniversary   bp-job-anniversary     a year (and each year) after done
--   storm_followup    bp-storm-followup      sent by the owner for an area
--
-- dedupe makes every event happen once. Only accounts with a HighLevel
-- location send anything; the rest are written as 'skipped' by the function.

create table if not exists public.ghl_events (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null,
  kind       text not null,
  job_id     text,
  dedupe     text not null,
  data       jsonb not null default '{}'::jsonb,
  status     text not null default 'pending',   -- pending | sent | failed | skipped
  attempts   int not null default 0,
  error      text,
  contact_id text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
alter table public.ghl_events enable row level security;
create unique index if not exists ghl_events_dedupe on public.ghl_events(owner, dedupe);
create index if not exists ghl_events_pending on public.ghl_events(created_at) where status = 'pending';
create index if not exists ghl_events_owner_at on public.ghl_events(owner, created_at desc);
create policy ghl_events_read on public.ghl_events for select to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew' and not public.bp_is_sub());

create or replace function public.bp_ghl_event(p_owner uuid, p_kind text, p_job jsonb, p_dedupe text, p_extra jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_owner is null or p_job is null or coalesce((p_job->>'sample')::boolean, false) then return; end if;
  insert into public.ghl_events(owner, kind, job_id, dedupe, data)
  values (p_owner, p_kind, p_job->>'id', p_dedupe, coalesce(p_extra, '{}'::jsonb))
  on conflict (owner, dedupe) do nothing;
end $$;
revoke all on function public.bp_ghl_event(uuid, text, jsonb, text, jsonb) from public, anon, authenticated;

-- project changes: scheduled, completed
create or replace function public.bp_ghl_jobs(p_owner uuid, p_old jsonb, p_new jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare om jsonb; nj jsonb; oj jsonb; jid text; f_new text; f_old text;
begin
  if p_new is null or jsonb_typeof(p_new) <> 'array' or p_old is not distinct from p_new then return; end if;
  select coalesce(jsonb_object_agg(e->>'id', e), '{}'::jsonb) into om
    from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]'::jsonb end) e where e->>'id' is not null;
  for nj in select e from jsonb_array_elements(p_new) e where e->>'id' is not null loop
    jid := nj->>'id'; oj := coalesce(om->jid, '{}'::jsonb);
    continue when oj = nj;
    if nj->>'status' = 'done' and coalesce(oj->>'status', '') <> 'done' and oj <> '{}'::jsonb then
      perform public.bp_ghl_event(p_owner, 'job_completed', nj, 'done:' || jid || ':' || coalesce(nj->>'doneAt', ''));
    end if;
    if coalesce(nj->>'status', 'active') = 'active' then
      select min(x) into f_new from jsonb_array_elements_text(public.bp_jarr(nj->'sched'->'dates')) x where x ~ '^\d{4}-\d{2}-\d{2}$';
      select min(x) into f_old from jsonb_array_elements_text(public.bp_jarr(oj->'sched'->'dates')) x where x ~ '^\d{4}-\d{2}-\d{2}$';
      if f_new is not null and f_new is distinct from f_old and f_new >= to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM-DD') then
        perform public.bp_ghl_event(p_owner, 'job_scheduled', nj, 'sched:' || jid || ':' || f_new, jsonb_build_object('date', f_new));
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.bp_ghl_jobs(uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.bp_ghl_portal_finance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then perform public.bp_ghl_jobs(new.owner, '[]'::jsonb, new.jobs);
    elsif new.jobs is distinct from old.jobs then perform public.bp_ghl_jobs(new.owner, old.jobs, new.jobs);
    end if;
  exception when others then raise warning 'bp_ghl_portal_finance: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_ghl_portal_finance after insert or update of jobs on public.portal_finance
  for each row execute function public.bp_ghl_portal_finance();

-- the crew got there: first clock-in on a job each day
create or replace function public.bp_ghl_time_clock() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; d text;
begin
  begin
    if new.kind = 'in' and coalesce(new.job_id, '') <> '' then
      j := public.bp_job_of(new.owner, new.job_id);
      d := to_char(new.at at time zone 'America/Los_Angeles', 'YYYY-MM-DD');
      if j is not null then
        perform public.bp_ghl_event(new.owner, 'crew_arrived', j, 'arrive:' || new.job_id || ':' || d,
          jsonb_build_object('at', new.at, 'by', coalesce(new.clocked_by_name, ''), 'employee_id', new.employee_id, 'on_site', new.on_site));
      end if;
    end if;
  exception when others then raise warning 'bp_ghl_time_clock: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_ghl_time_clock after insert on public.time_clock
  for each row execute function public.bp_ghl_time_clock();

-- the hourly look at the calendar and the books
create or replace function public.bp_ghl_scan(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d0 date := (now() at time zone 'America/Los_Angeles')::date;
  j jsonb; jid text; dn date; owed numeric; days int; t int;
begin
  for j in select e from public.portal_finance pf, jsonb_array_elements(case when jsonb_typeof(pf.jobs) = 'array' then pf.jobs else '[]'::jsonb end) e
            where pf.owner = p_owner loop
    jid := j->>'id'; continue when jid is null or coalesce((j->>'sample')::boolean, false);
    if coalesce(j->>'status', 'active') = 'active'
       and exists (select 1 from jsonb_array_elements_text(public.bp_jarr(j->'sched'->'dates')) x where x = to_char(d0 + 1, 'YYYY-MM-DD')) then
      perform public.bp_ghl_event(p_owner, 'visit_tomorrow', j, 'tomorrow:' || jid || ':' || (d0 + 1), jsonb_build_object('date', to_char(d0 + 1, 'YYYY-MM-DD')));
    end if;
    if j->>'status' = 'done' and coalesce(j->>'doneAt', '') ~ '^\d+$' then
      dn := (public.bp_ms_ts(j->>'doneAt') at time zone 'America/Los_Angeles')::date;
      owed := public.bp_num(j->>'estimate') - public.bp_num(j->>'collected');
      days := d0 - dn;
      if owed > 0.5 then
        foreach t in array array[3, 7, 14] loop
          if days >= t and days < t + 7 then
            perform public.bp_ghl_event(p_owner, 'payment_overdue', j, 'pay:' || jid || ':' || t, jsonb_build_object('days', t, 'owed', owed));
          end if;
        end loop;
      end if;
      if days >= 365 and to_char(dn, 'MM-DD') = to_char(d0, 'MM-DD') then
        perform public.bp_ghl_event(p_owner, 'job_anniversary', j, 'anniv:' || jid || ':' || to_char(d0, 'YYYY'), jsonb_build_object('years', days / 365));
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.bp_ghl_scan(uuid) from public, anon, authenticated;

create or replace function public.bp_ghl_scan_all() returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  for o in select owner from public.portal_finance where jsonb_typeof(jobs) = 'array' and jsonb_array_length(jobs) > 0 loop
    begin perform public.bp_ghl_scan(o); exception when others then raise warning 'bp_ghl_scan(%): %', o, sqlerrm; end;
  end loop;
end $$;
revoke all on function public.bp_ghl_scan_all() from public, anon, authenticated;
grant execute on function public.bp_ghl_scan_all() to service_role;

-- the owner sends a storm follow-up to past customers in an area (ZIP codes or city words)
create or replace function public.ghl_storm_followup(p_areas text[], p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid := public.qb_whoami(); j jsonb; n int := 0; tag text := to_char(now(), 'YYYYMMDDHH24MI'); a text; hit boolean;
begin
  if o is null then return jsonb_build_object('ok', false, 'error', 'not allowed'); end if;
  if coalesce(array_length(p_areas, 1), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'no area'); end if;
  for j in select e from public.portal_finance pf, jsonb_array_elements(case when jsonb_typeof(pf.jobs) = 'array' then pf.jobs else '[]'::jsonb end) e
            where pf.owner = o and e->>'status' = 'done' and not coalesce((e->>'sample')::boolean, false) loop
    hit := false;
    foreach a in array p_areas loop
      if length(trim(a)) >= 3 and position(lower(trim(a)) in lower(coalesce(j->>'addr', ''))) > 0 then hit := true; end if;
    end loop;
    if hit then
      perform public.bp_ghl_event(o, 'storm_followup', j, 'storm:' || (j->>'id') || ':' || tag, jsonb_build_object('note', left(coalesce(p_note, ''), 300)));
      n := n + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'queued', n);
end $$;
revoke all on function public.ghl_storm_followup(text[], text) from public, anon;
grant execute on function public.ghl_storm_followup(text[], text) to authenticated;

-- Schedule (run once, live):
--   select cron.schedule('bp-ghl-events', '*/2 * * * *', $c$
--     select net.http_post(url := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/ghl-events',
--       headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select value from public.ai_config where key='cron_key')),
--       body := '{"op":"run"}'::jsonb, timeout_milliseconds := 60000); $c$);
-- and ai_config 'ghl_events_owner' = the account whose events go to the default location.
