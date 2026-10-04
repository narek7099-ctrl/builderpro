-- Ten more HighLevel events (see 20261014000000_ghl_events.sql for how they travel).
--
--   kind                     tag                          when
--   contract_signed          bp-contract-signed           the customer e-signs the contract
--   phase_done               bp-phase-done                a plan phase is checked off
--   schedule_moved           bp-schedule-moved            the first booked day moves later
--   payment_received         bp-payment-received          money collected on a job goes up
--   change_order_waiting     bp-change-order-waiting      a change order still unsigned 2, then 5 days on
--   inspection_scheduled     bp-inspection-scheduled      a permit inspection gets a date
--   warranty_followup        bp-warranty                  7 days after a job is done
--   message_unanswered       bp-message-unanswered        a portal message from the customer, no reply in 4 hours
--   over_budget              bp-over-budget               job costs pass the budget
--   sub_insurance_expiring   bp-sub-insurance-expiring    a sub's insurance or licence expires within 14 days
--                                                         (sent to the SUB's contact, not a customer)

-- an event for something that is not a whole job object (a contract, a sub)
create or replace function public.bp_ghl_event2(p_owner uuid, p_kind text, p_job_id text, p_dedupe text, p_extra jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  if p_owner is null then return; end if;
  if p_job_id is not null then
    j := public.bp_job_of(p_owner, p_job_id);
    if j is null or coalesce((j->>'sample')::boolean, false) then return; end if;
  end if;
  insert into public.ghl_events(owner, kind, job_id, dedupe, data)
  values (p_owner, p_kind, p_job_id, p_dedupe, coalesce(p_extra, '{}'::jsonb))
  on conflict (owner, dedupe) do nothing;
end $$;
revoke all on function public.bp_ghl_event2(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- what a job has spent, and what it was meant to
create or replace function public.bp_job_spent(j jsonb) returns numeric language sql immutable as $$
  select coalesce(sum(public.bp_num(e->>'amt')), 0) from jsonb_array_elements(public.bp_jarr(j->'expenses')) e;
$$;
create or replace function public.bp_job_budget(j jsonb) returns numeric language sql immutable as $$
  select case jsonb_typeof(j->'budget')
    when 'number' then (j->>'budget')::numeric
    when 'object' then (select coalesce(sum(public.bp_num(v)), 0) from jsonb_each_text(j->'budget') x(k, v))
    else 0 end;
$$;

-- project changes
create or replace function public.bp_ghl_jobs(p_owner uuid, p_old jsonb, p_new jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare om jsonb; nj jsonb; oj jsonb; jid text; f_new text; f_old text; today text; ph jsonb; nxt text; p jsonb; i jsonb; c_new numeric; c_old numeric; b numeric;
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

-- the customer signed the contract
create or replace function public.bp_ghl_contracts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.signed_at is not null and (tg_op = 'INSERT' or old.signed_at is null) and coalesce(new.job_id, '') <> '' then
      perform public.bp_ghl_event2(new.owner, 'contract_signed', new.job_id, 'contract:' || new.id,
        jsonb_build_object('title', coalesce(new.title, ''), 'amount', new.amount));
    end if;
  exception when others then raise warning 'bp_ghl_contracts: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_ghl_contracts after insert or update of signed_at on public.contracts
  for each row execute function public.bp_ghl_contracts();

-- the hourly look, now with change orders, warranty, unanswered messages and sub paperwork
create or replace function public.bp_ghl_scan(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d0 date := (now() at time zone 'America/Los_Angeles')::date;
  j jsonb; jid text; dn date; owed numeric; days int; t int; r record;
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
end $$;
revoke all on function public.bp_ghl_scan(uuid) from public, anon, authenticated;

create or replace function public.bp_ghl_scan_all() returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  for o in select owner from public.portal_finance where jsonb_typeof(jobs) = 'array' and jsonb_array_length(jobs) > 0
           union select owner from public.sub_documents where expires is not null loop
    begin perform public.bp_ghl_scan(o); exception when others then raise warning 'bp_ghl_scan(%): %', o, sqlerrm; end;
  end loop;
end $$;
revoke all on function public.bp_ghl_scan_all() from public, anon, authenticated;
grant execute on function public.bp_ghl_scan_all() to service_role;
