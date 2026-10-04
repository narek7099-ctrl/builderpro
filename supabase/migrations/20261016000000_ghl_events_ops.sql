-- Operations events (Enterprise unless noted) and the crew lead's schedule notice.
--
--   kind                 tag                     when
--   crew_no_show         bp-crew-no-show         (OS) booked today, nobody clocked in an hour after the start
--   materials_not_ready  bp-materials-not-ready  work tomorrow, the order list is still a draft
--   job_stalled          bp-job-stalled          sold with no contract (24h), signed with no start date (3d),
--                                                started with no phase done (5d), done and unpaid (2d)
--   weather_risk         bp-weather-risk         rain or wind forecast for tomorrow's booked job (added by ghl-events)
-- Crew leads also get an in-app notice when their job's start moves (domino reschedule or any move).

-- the user id of the crew lead on a job, if the job's crew has one
create or replace function public.bp_crew_lead_uid(p_owner uuid, j jsonb) returns uuid
language sql stable security definer set search_path = public as $$
  select public.bp_employee_uid(p_owner, c->>'lead')
    from public.client_settings cs, jsonb_array_elements(coalesce(cs.data->'crews', '[]'::jsonb)) c
   where cs.user_id = p_owner and jsonb_typeof(j->'crew') = 'string' and c->>'id' = j->>'crew' and coalesce(c->>'lead', '') <> ''
   limit 1;
$$;
revoke all on function public.bp_crew_lead_uid(uuid, jsonb) from public, anon, authenticated;

create or replace function public.bp_ghl_jobs(p_owner uuid, p_old jsonb, p_new jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare om jsonb; nj jsonb; oj jsonb; jid text; f_new text; f_old text; today text; ph jsonb; nxt text; p jsonb; i jsonb; c_new numeric; c_old numeric; b numeric; lead uuid;
begin
  if p_new is null or jsonb_typeof(p_new) <> 'array' or p_old is not distinct from p_new then return; end if;
  today := to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM-DD');
  select coalesce(jsonb_object_agg(e->>'id', e), '{}'::jsonb) into om
    from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]'::jsonb end) e where e->>'id' is not null;
  for nj in select e from jsonb_array_elements(p_new) e where e->>'id' is not null loop
    jid := nj->>'id'; oj := coalesce(om->jid, '{}'::jsonb);
    continue when oj = nj;

    -- finished
    if nj->>'status' = 'done' and coalesce(oj->>'status', '') <> 'done' and oj <> '{}'::jsonb then
      perform public.bp_ghl_event(p_owner, 'job_completed', nj, 'done:' || jid || ':' || coalesce(nj->>'doneAt', ''));
    end if;

    if coalesce(nj->>'status', 'active') = 'active' then
      -- booked, or the start moved
      select min(x) into f_new from jsonb_array_elements_text(public.bp_jarr(nj->'sched'->'dates')) x where x ~ '^\d{4}-\d{2}-\d{2}$';
      select min(x) into f_old from jsonb_array_elements_text(public.bp_jarr(oj->'sched'->'dates')) x where x ~ '^\d{4}-\d{2}-\d{2}$';
      if f_new is not null and f_new is distinct from f_old and f_new >= today then
        if f_old is not null and f_new > f_old then
          perform public.bp_ghl_event(p_owner, 'schedule_moved', nj, 'moved:' || jid || ':' || f_old || ':' || f_new, jsonb_build_object('date', f_new, 'old', f_old));
          lead := public.bp_crew_lead_uid(p_owner, nj);
          if lead is not null then
            perform public.bp_notify(p_owner, 'schedule_moved', 'Schedule change: ' || public.bp_job_label(nj),
              'Now starts ' || to_char(f_new::date, 'Dy Mon FMDD') || ' (was ' || to_char(f_old::date, 'Dy Mon FMDD') || ').', 'crewprojects', jid, 'high',
              'movedlead:' || jid || ':' || f_new, 'user:' || lead);
          end if;
        else
          perform public.bp_ghl_event(p_owner, 'job_scheduled', nj, 'sched:' || jid || ':' || f_new, jsonb_build_object('date', f_new));
        end if;
      end if;

      -- a phase checked off
      for ph in select x from jsonb_array_elements(public.bp_jarr(nj->'plan'->'phases')) x where coalesce(x->>'doneAt', '') <> '' loop
        continue when exists (select 1 from jsonb_array_elements(public.bp_jarr(oj->'plan'->'phases')) o
                               where o->>'key' = ph->>'key' and coalesce(o->>'doneAt', '') <> '');
        select x->>'name' into nxt from jsonb_array_elements(public.bp_jarr(nj->'plan'->'phases')) with ordinality t(x, n)
         where coalesce(x->>'doneAt', '') = '' order by n limit 1;
        perform public.bp_ghl_event(p_owner, 'phase_done', nj, 'phase:' || jid || ':' || coalesce(ph->>'key', ph->>'name', ''),
          jsonb_build_object('phase', ph->>'name', 'next', coalesce(nxt, '')));
      end loop;

      -- an inspection got a date
      for p in select x from jsonb_array_elements(public.bp_jarr(nj->'permits')) x loop
        for i in select x from jsonb_array_elements(public.bp_jarr(p->'inspections')) x where x->>'date' ~ '^\d{4}-\d{2}-\d{2}' and left(x->>'date', 10) >= today loop
          continue when exists (select 1 from jsonb_array_elements(public.bp_jarr(oj->'permits')) op, jsonb_array_elements(public.bp_jarr(op->'inspections')) oi
                                 where coalesce(op->>'id', op->>'number', '') = coalesce(p->>'id', p->>'number', '')
                                   and coalesce(oi->>'kind', '') = coalesce(i->>'kind', '') and left(oi->>'date', 10) = left(i->>'date', 10));
          perform public.bp_ghl_event(p_owner, 'inspection_scheduled', nj,
            'insp:' || jid || ':' || coalesce(p->>'id', p->>'number', '') || ':' || coalesce(i->>'kind', '') || ':' || left(i->>'date', 10),
            jsonb_build_object('date', left(i->>'date', 10), 'inspection', coalesce(nullif(i->>'kind', ''), 'Inspection'), 'permit', coalesce(p->>'type', '')));
        end loop;
      end loop;
    end if;

    -- money in
    if oj <> '{}'::jsonb then
      c_new := public.bp_num(nj->>'collected'); c_old := public.bp_num(oj->>'collected');
      if c_new > c_old + 0.5 then
        perform public.bp_ghl_event(p_owner, 'payment_received', nj, 'paid:' || jid || ':' || c_new, jsonb_build_object('amount', c_new - c_old));
      end if;
    end if;

    -- costs passed the budget
    b := public.bp_job_budget(nj);
    if b > 0 and public.bp_job_spent(nj) > b and public.bp_job_spent(oj) <= b then
      perform public.bp_ghl_event(p_owner, 'over_budget', nj, 'budget:' || jid || ':' || b, jsonb_build_object('budget', b, 'spent', public.bp_job_spent(nj)));
    end if;
  end loop;
end $$;
revoke all on function public.bp_ghl_jobs(uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.bp_ghl_scan(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d0 date := (now() at time zone 'America/Los_Angeles')::date;
  j jsonb; jid text; dn date; owed numeric; days int; t int; r record; st text; t0 timestamptz; lead uuid; ts timestamptz;
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
          if days >= t and days < (case t when 3 then 7 when 7 then 14 else 21 end) then   -- one reminder per window, never two at once
            perform public.bp_ghl_event(p_owner, 'payment_overdue', j, 'pay:' || jid || ':' || t, jsonb_build_object('days', t, 'owed', owed));
          end if;
        end loop;
      end if;
      if days between 7 and 13 then
        perform public.bp_ghl_event(p_owner, 'warranty_followup', j, 'warranty:' || jid);
      end if;
      if days >= 365 and to_char(dn, 'MM-DD') = to_char(d0, 'MM-DD') then
        perform public.bp_ghl_event(p_owner, 'job_anniversary', j, 'anniv:' || jid || ':' || to_char(d0, 'YYYY'), jsonb_build_object('years', days / 365));
      end if;
    end if;
  end loop;

  -- change orders the customer hasn't signed: 2 days, then 5
  for r in select id, job_id, title, amount, created_at from public.customer_change_orders
            where owner = p_owner and status = 'pending' and created_at < now() - interval '2 days' and created_at > now() - interval '30 days' loop
    foreach t in array array[2, 5] loop
      if r.created_at < now() - make_interval(days => t) and r.created_at >= now() - make_interval(days => (case t when 2 then 5 else 30 end)) then
        perform public.bp_ghl_event2(p_owner, 'change_order_waiting', r.job_id, 'co:' || r.id || ':' || t,
          jsonb_build_object('days', t, 'change_order', coalesce(r.title, 'Change order'), 'amount', r.amount));
      end if;
    end loop;
  end loop;

  -- the customer wrote in the portal and nobody answered for 4 hours
  for r in select distinct on (m.job_id) m.id, m.job_id, m.body, m.created_at, m.from_customer
             from public.customer_messages m where m.owner = p_owner and m.created_at > now() - interval '3 days'
            order by m.job_id, m.created_at desc loop
    if r.from_customer and r.created_at < now() - interval '4 hours' then
      perform public.bp_ghl_event2(p_owner, 'message_unanswered', r.job_id, 'msg:' || r.id,
        jsonb_build_object('note', left(coalesce(r.body, ''), 200)));
    end if;
  end loop;

  -- a sub's insurance or licence runs out within 14 days
  for r in select d.id, d.kind, d.expires, s.id as sub_id, s.company, s.contact_name, s.phone, s.email
             from public.sub_documents d join public.subcontractors s on s.id = d.sub_id
            where d.owner = p_owner and s.active and d.kind in ('coi', 'license') and d.expires between d0 and d0 + 14 loop
    perform public.bp_ghl_event2(p_owner, 'sub_insurance_expiring', null, 'subins:' || r.id || ':' || r.expires,
      jsonb_build_object('sub', jsonb_build_object('id', r.sub_id, 'company', r.company, 'name', r.contact_name, 'phone', r.phone, 'email', r.email),
        'doc', case when r.kind = 'coi' then 'insurance certificate' else 'licence' end, 'date', to_char(r.expires, 'YYYY-MM-DD')));
  end loop;

  -- the crew didn't show: booked today, nobody clocked in an hour after the start
  for j in select e from public.portal_finance pf, jsonb_array_elements(case when jsonb_typeof(pf.jobs) = 'array' then pf.jobs else '[]'::jsonb end) e
            where pf.owner = p_owner and coalesce(e->>'status', 'active') = 'active' and not coalesce((e->>'sample')::boolean, false)
              and exists (select 1 from jsonb_array_elements_text(public.bp_jarr(e->'sched'->'dates')) x where x = to_char(d0, 'YYYY-MM-DD')) loop
    jid := j->>'id';
    st := coalesce(nullif(j->'sched'->'slots'->to_char(d0, 'YYYY-MM-DD')->>'t', ''), nullif(j->'sched'->>'time', ''), '08:00');
    begin
      t0 := (d0::text || ' ' || st)::timestamp at time zone 'America/Los_Angeles';
    exception when others then t0 := (d0::text || ' 08:00')::timestamp at time zone 'America/Los_Angeles';
    end;
    if now() > t0 + interval '1 hour' and now() < (d0::text || ' 18:00')::timestamp at time zone 'America/Los_Angeles'
       and not exists (select 1 from public.time_clock tc where tc.owner = p_owner and tc.job_id = jid and tc.kind = 'in'
                        and (tc.at at time zone 'America/Los_Angeles')::date = d0) then
      perform public.bp_ghl_event(p_owner, 'crew_no_show', j, 'noshow:' || jid || ':' || d0, jsonb_build_object('date', to_char(d0, 'YYYY-MM-DD'), 'start', st));
      perform public.bp_notify(p_owner, 'crew_no_show', 'Nobody has clocked in: ' || public.bp_job_label(j),
        'Booked for ' || st || ' today.', 'activejobs:' || jid, jid, 'high', 'noshow:' || jid || ':' || d0, 'office');
      lead := public.bp_crew_lead_uid(p_owner, j);
      if lead is not null then
        perform public.bp_notify(p_owner, 'crew_no_show', 'You''re booked on ' || coalesce(nullif(j->>'title', ''), 'a job') || ' today',
          'Nobody has clocked in yet (start ' || st || '). Clock the crew in, or tell the office.', 'crewclock', jid, 'high', 'noshowlead:' || jid || ':' || d0, 'user:' || lead);
      end if;
    end if;
  end loop;

  -- materials not ready: work tomorrow, the order list is still a draft
  for j in select e from public.portal_finance pf, jsonb_array_elements(case when jsonb_typeof(pf.jobs) = 'array' then pf.jobs else '[]'::jsonb end) e
            where pf.owner = p_owner and coalesce(e->>'status', 'active') = 'active' and not coalesce((e->>'sample')::boolean, false)
              and exists (select 1 from jsonb_array_elements_text(public.bp_jarr(e->'sched'->'dates')) x where x = to_char(d0 + 1, 'YYYY-MM-DD'))
              and jsonb_array_length(public.bp_jarr(e->'materials'->'items')) > 0
              and coalesce(e->'materials'->>'status', 'draft') not in ('sent', 'received') loop
    perform public.bp_ghl_event(p_owner, 'materials_not_ready', j, 'mat:' || (j->>'id') || ':' || (d0 + 1),
      jsonb_build_object('date', to_char(d0 + 1, 'YYYY-MM-DD'), 'items', jsonb_array_length(public.bp_jarr(j->'materials'->'items'))));
  end loop;

  -- the stuck-job watchdog: one alert per stall
  for j in select e from public.portal_finance pf, jsonb_array_elements(case when jsonb_typeof(pf.jobs) = 'array' then pf.jobs else '[]'::jsonb end) e
            where pf.owner = p_owner and not coalesce((e->>'sample')::boolean, false) loop
    jid := j->>'id'; continue when jid is null;
    if coalesce(j->>'status', 'active') = 'active' then
      ts := public.bp_ms_ts(j->>'wonAt');
      -- sold, but no contract a day later (only recent sales, not the back catalogue)
      if ts is not null and ts < now() - interval '24 hours' and ts > now() - interval '14 days'
         and not exists (select 1 from public.contracts c where c.owner = p_owner and c.job_id = jid) then
        perform public.bp_ghl_event(p_owner, 'job_stalled', j, 'stall:contract:' || jid,
          jsonb_build_object('stage', 'contract', 'note', 'Sold more than a day ago and no contract has been sent. Next: send the contract.'));
      end if;
      -- signed, but no start date 3 days later
      if jsonb_array_length(public.bp_jarr(j->'sched'->'dates')) = 0
         and exists (select 1 from public.contracts c where c.owner = p_owner and c.job_id = jid and c.signed_at < now() - interval '3 days') then
        perform public.bp_ghl_event(p_owner, 'job_stalled', j, 'stall:schedule:' || jid,
          jsonb_build_object('stage', 'schedule', 'note', 'Contract signed 3+ days ago and the job has no start date. Next: book the crew.'));
      end if;
      -- started, but nothing checked off in 5 days
      if jsonb_array_length(public.bp_jarr(j->'plan'->'phases')) > 0
         and exists (select 1 from jsonb_array_elements(public.bp_jarr(j->'plan'->'phases')) x where coalesce(x->>'doneAt', '') = '')
         and (select min(x) from jsonb_array_elements_text(public.bp_jarr(j->'sched'->'dates')) x where x ~ '^\d{4}-\d{2}-\d{2}$') <= to_char(d0 - 5, 'YYYY-MM-DD')
         and coalesce((select max(left(x->>'doneAt', 10)) from jsonb_array_elements(public.bp_jarr(j->'plan'->'phases')) x where coalesce(x->>'doneAt', '') <> ''), '0000') < to_char(d0 - 5, 'YYYY-MM-DD') then
        perform public.bp_ghl_event(p_owner, 'job_stalled', j, 'stall:progress:' || jid || ':' || to_char(d0, 'IYYY-IW'),
          jsonb_build_object('stage', 'progress', 'note', 'Work started but no phase has been checked off in 5 days. Next: check in with the crew.'));
      end if;
    elsif j->>'status' = 'done' and coalesce(j->>'doneAt', '') ~ '^\d+$'
          and public.bp_num(j->>'collected') < public.bp_num(j->>'estimate') - 0.5 then
      dn := (public.bp_ms_ts(j->>'doneAt') at time zone 'America/Los_Angeles')::date;
      if d0 - dn between 2 and 14 then
        perform public.bp_ghl_event(p_owner, 'job_stalled', j, 'stall:payment:' || jid,
          jsonb_build_object('stage', 'payment', 'note', 'Finished 2+ days ago with ' || public.bp_money(public.bp_num(j->>'estimate') - public.bp_num(j->>'collected')) || ' still unpaid. Next: send the final invoice.'));
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.bp_ghl_scan(uuid) from public, anon, authenticated;
