-- AI CEO routing: rank CREWS next to employees and subs.
--
-- Redefines public.bp_ceo_route(owner, job) (first defined in
-- 20261009000000_ai_ceo.sql; the employee and sub sections are copied
-- unchanged) and adds a third pass over client_settings.data.crews:
--
--   kind 'crew', id = crew id, name, color, members [{id,name,trade}]
--   trade        best member trade match (the crew's own trade is the most
--                common member trade, shown as "Roofing crew")
--   rating       review-weighted average of the members' worker_reviews
--   experience   average years in the trade + jobs the crew finished
--                (jobs with job.crew = crew id and status done)
--   availability free unless another active job on the same dates has this
--                crew (job.crew) or any of its members assigned
--   size         bigger crews get a bonus on bigger-than-usual jobs
--
-- A crew already on the job (job.crew = crew id) goes to on_job. The result
-- keeps the top 5 candidates and, when some crew matches the trade at all,
-- also returns it as best_crew and appends it to candidates if it missed the
-- top 5. Access is unchanged (bp_ceo_allowed).

create or replace function public.bp_ceo_route(p_owner uuid, p_job text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d0 date := (now() at time zone 'utc')::date;
  j jsonb; jt text; est numeric; med numeric; w numeric; v_dates date[]; jobs jsonb;
  r record; cands jsonb := '[]'::jsonb; flagged jsonb := '[]'::jsonb; on_job jsonb := '[]'::jsonb;
  t_s numeric; r_s numeric; x_s numeric; a_s numeric; score numeric; wt text; yrs int; v_done int; nrev int; ravg numeric;
  conf jsonb; v_load int; flags jsonb; reasons jsonb; skilltxt text; coi date; mine boolean;
  cr jsonb; mem uuid[]; mem_t text[]; n int; ctrade text; ayrs numeric; members jsonb; sz numeric; datetxt text;
  best_crew jsonb; top jsonb;
begin
  if not public.bp_ceo_allowed(p_owner) then raise exception 'not allowed' using errcode = '42501'; end if;
  select case when jsonb_typeof(pf.jobs) = 'array' then pf.jobs else '[]'::jsonb end into jobs from public.portal_finance pf where pf.owner = p_owner;
  jobs := coalesce(jobs, '[]'::jsonb);
  select e into j from jsonb_array_elements(jobs) e where e->>'id' = p_job limit 1;
  if j is null then return jsonb_build_object('ok', false, 'error', 'job not found'); end if;

  jt := coalesce(public.bp_ceo_trade(j->>'trade'), public.bp_ceo_trade(j->>'type'), public.bp_ceo_trade(j->>'title'),
                 public.bp_ceo_trade(j->>'notes'), 'general');
  est := public.bp_num(j->>'estimate');
  select percentile_cont(0.5) within group (order by public.bp_num(e->>'estimate')) into med
    from jsonb_array_elements(jobs) e where public.bp_num(e->>'estimate') > 0;
  w := case when coalesce(med, 0) > 0 and est > 0 then least(2, greatest(0.5, est / med)) else 1 end;
  select array_agg(distinct public.bp_ceo_date(x)) into v_dates
    from jsonb_array_elements_text(public.bp_jarr(j->'sched'->'dates')) x where public.bp_ceo_date(x) is not null;
  if v_dates is null and public.bp_ceo_date(j->>'startDate') is not null then
    select array_agg(g::date) into v_dates from generate_series(public.bp_ceo_date(j->>'startDate'),
      coalesce(public.bp_ceo_date(j->>'endDate'), public.bp_ceo_date(j->>'startDate')), interval '1 day') g;
  end if;

  -- other jobs come from bp_ceo_others(): dates and who is on each

  -- employees
  for r in select e.* from public.employees e where e.owner = p_owner and e.active order by e.name loop
    mine := (jsonb_typeof(j->'assignees') = 'array' and j->'assignees' @> jsonb_build_array(jsonb_build_object('employeeId', r.id::text)))
         or (jsonb_typeof(j->'crew') = 'array' and (j->'crew') ? r.id::text)
         or (jsonb_typeof(j->'crew') = 'string' and exists (select 1 from public.client_settings cs, jsonb_array_elements(public.bp_jarr(cs.data->'crews')) c
                                                              where cs.user_id = p_owner and c->>'id' = j->>'crew' and (c->'members') ? r.id::text));
    if mine then on_job := on_job || jsonb_build_array(jsonb_build_object('kind', 'employee', 'id', r.id, 'name', r.name)); continue; end if;
    wt := public.bp_ceo_trade(r.trade);
    skilltxt := coalesce(array_to_string(r.skills, ' '), '') || ' ' || coalesce(r.certifications, '');
    reasons := '[]'::jsonb; flags := '[]'::jsonb;
    t_s := case when jt = 'general' then case when wt = 'general' then 1 else 0.5 end
                when wt = jt then 1
                when public.bp_ceo_trade(skilltxt) = jt or lower(skilltxt) ~ jt or (jt = 'roofing' and lower(skilltxt) ~ 'roof') then 0.7
                when wt = 'general' or lower(r.trade) ~ '(foreman|lead|super)' then 0.35 else 0 end;
    select count(*), avg(rating) into nrev, ravg from public.worker_reviews where owner = p_owner and employee_id = r.id;
    r_s := case when nrev = 0 then 0.5 else least(1, greatest(0, ((ravg * nrev + 4.0) / (nrev + 1) - 3) / 2)) end;
    yrs := case when r.started_trade_year between 1950 and extract(year from d0)::int then extract(year from d0)::int - r.started_trade_year
                when r.hired_on is not null then greatest(0, (d0 - r.hired_on) / 365) else 0 end;
    select count(*) filter (where done), count(*) filter (where not done) into v_done, v_load from public.bp_ceo_others(p_owner, jobs, p_job) where r.id::text = any(emps);
    x_s := least(1, yrs / 10.0) * 0.7 + least(1, v_done / 10.0) * 0.3;
    select coalesce(jsonb_agg(jsonb_build_object('job', id, 'label', lbl, 'days', (select count(*) from unnest(o.dates) d where d = any(v_dates)))), '[]'::jsonb)
      into conf from public.bp_ceo_others(p_owner, jobs, p_job) o where not o.done and r.id::text = any(o.emps) and v_dates is not null and o.dates && v_dates;
    a_s := case when jsonb_array_length(conf) > 0 then 0 when v_dates is null then greatest(0.4, 0.8 - 0.1 * v_load) else greatest(0.7, 1 - 0.05 * v_load) end;
    score := round((0.40 * t_s + 0.25 * a_s + w * (0.20 * r_s + 0.15 * x_s)) / (0.65 + 0.35 * w) * 100);

    if t_s >= 1 then reasons := reasons || to_jsonb(initcap(coalesce(nullif(r.trade, ''), jt)) || ' - matches this ' || jt || ' job');
    elsif t_s >= 0.7 then reasons := reasons || to_jsonb(text 'Has ' || jt || ' in their skills');
    elsif t_s > 0 then reasons := reasons || to_jsonb(text 'General hand, not a ' || jt || ' specialist');
    else reasons := reasons || to_jsonb(text 'Different trade (' || coalesce(nullif(r.trade, ''), 'none set') || ')'); flags := flags || '"trade_mismatch"'::jsonb; end if;
    reasons := reasons || to_jsonb(case when nrev = 0 then 'No customer reviews yet' else round(ravg, 1) || '★ from ' || nrev || ' review' || case when nrev > 1 then 's' else '' end end);
    if yrs > 0 or v_done > 0 then reasons := reasons || to_jsonb(concat_ws(', ', case when yrs > 0 then yrs || ' yr' || case when yrs > 1 then 's' else '' end || ' in the trade' end,
                                                                  case when v_done > 0 then v_done || ' finished job' || case when v_done > 1 then 's' else '' end end)); end if;
    if jsonb_array_length(conf) > 0 then reasons := reasons || to_jsonb(text 'Busy those days on ' || (conf->0->>'label')); flags := flags || '"busy"'::jsonb;
    elsif v_dates is not null then reasons := reasons || to_jsonb(text 'Free on the job''s dates');
    else reasons := reasons || to_jsonb(case when v_load > 0 then 'On ' || v_load || ' other active job' || case when v_load > 1 then 's' else '' end else 'No other active jobs' end); end if;

    cands := cands || jsonb_build_array(jsonb_build_object('kind', 'employee', 'id', r.id, 'team_id', r.team_id, 'name', r.name, 'trade', r.trade,
      'score', score, 'breakdown', jsonb_build_object('trade', round(t_s, 2), 'rating', round(r_s, 2), 'experience', round(x_s, 2), 'availability', round(a_s, 2)),
      'rating', case when nrev > 0 then round(ravg, 2) end, 'reviews', nrev, 'years', yrs, 'jobs_done', v_done, 'active_jobs', v_load,
      'free', jsonb_array_length(conf) = 0, 'conflicts', conf, 'flags', flags, 'reasons', reasons));
  end loop;

  -- subcontractors
  for r in select s.* from public.subcontractors s where s.owner = p_owner and s.active order by s.company loop
    if jsonb_typeof(j->'subs') = 'array' and exists (select 1 from jsonb_array_elements(j->'subs') x where x->>'subId' = r.id::text) then
      on_job := on_job || jsonb_build_array(jsonb_build_object('kind', 'sub', 'id', r.id, 'name', r.company)); continue;
    end if;
    wt := public.bp_ceo_trade(r.trade); reasons := '[]'::jsonb; flags := '[]'::jsonb;
    t_s := case when jt = 'general' then case when wt = 'general' then 1 else 0.5 end when wt = jt then 1 when wt = 'general' then 0.35 else 0 end;
    select count(*), avg(rating) into nrev, ravg from public.worker_reviews where owner = p_owner and sub_id = r.id;
    r_s := case when nrev = 0 then 0.5 else least(1, greatest(0, ((ravg * nrev + 4.0) / (nrev + 1) - 3) / 2)) end;
    select count(*) filter (where done), count(*) filter (where not done) into v_done, v_load from public.bp_ceo_others(p_owner, jobs, p_job) where r.id::text = any(subs);
    yrs := 0; x_s := least(1, v_done / 10.0) * 0.6 + 0.2;
    select coalesce(jsonb_agg(jsonb_build_object('job', id, 'label', lbl)), '[]'::jsonb) into conf
      from public.bp_ceo_others(p_owner, jobs, p_job) o where not o.done and r.id::text = any(o.subs) and v_dates is not null and o.dates && v_dates;
    a_s := case when jsonb_array_length(conf) > 0 then 0.3 when v_dates is null then greatest(0.4, 0.8 - 0.1 * v_load) else greatest(0.7, 1 - 0.05 * v_load) end;
    select max(expires) into coi from public.sub_documents where owner = p_owner and sub_id = r.id and kind = 'coi';
    score := round((0.40 * t_s + 0.25 * a_s + w * (0.20 * r_s + 0.15 * x_s)) / (0.65 + 0.35 * w) * 100);
    if t_s >= 1 then reasons := reasons || to_jsonb(initcap(coalesce(nullif(r.trade, ''), jt)) || ' sub - matches this ' || jt || ' job');
    elsif t_s > 0 then reasons := reasons || to_jsonb(text 'General sub');
    else reasons := reasons || to_jsonb(text 'Different trade (' || coalesce(nullif(r.trade, ''), 'none set') || ')'); flags := flags || '"trade_mismatch"'::jsonb; end if;
    reasons := reasons || to_jsonb(case when nrev = 0 then 'No reviews yet' else round(ravg, 1) || '★ from ' || nrev || ' review' || case when nrev > 1 then 's' else '' end end);
    if v_done > 0 then reasons := reasons || to_jsonb(v_done || ' finished job' || case when v_done > 1 then 's' else '' end || ' with you'); end if;
    if jsonb_array_length(conf) > 0 then reasons := reasons || to_jsonb(text 'Booked those days on ' || (conf->0->>'label')); flags := flags || '"busy"'::jsonb; end if;
    if coi is null then
      flags := flags || '"coi_missing"'::jsonb; reasons := reasons || '"No insurance certificate on file"'::jsonb; score := round(score * 0.5);
    elsif coi < d0 then
      flags := flags || '"coi_expired"'::jsonb; reasons := reasons || to_jsonb(text 'Insurance expired ' || to_char(coi, 'Mon FMDD')); score := round(score * 0.5);
    elsif coi <= d0 + 30 then
      flags := flags || '"coi_expiring"'::jsonb; reasons := reasons || to_jsonb(text 'Insurance expires ' || to_char(coi, 'Mon FMDD'));
    else reasons := reasons || '"Insurance current"'::jsonb; end if;
    cands := cands || jsonb_build_array(jsonb_build_object('kind', 'sub', 'id', r.id, 'name', r.company, 'trade', r.trade,
      'score', score, 'breakdown', jsonb_build_object('trade', round(t_s, 2), 'rating', round(r_s, 2), 'experience', round(x_s, 2), 'availability', round(a_s, 2)),
      'rating', case when nrev > 0 then round(ravg, 2) end, 'reviews', nrev, 'jobs_done', v_done, 'active_jobs', v_load, 'coi_expires', coi,
      'free', jsonb_array_length(conf) = 0, 'conflicts', conf, 'flags', flags, 'reasons', reasons));
    if flags ?| array['coi_expired', 'coi_missing'] and t_s > 0 then
      flagged := flagged || jsonb_build_array(jsonb_build_object('id', r.id, 'name', r.company, 'flags', flags));
    end if;
  end loop;

  -- crews (client_settings.data.crews: {id, name, color, members:[employee id]})
  if v_dates is not null then
    datetxt := case when date_trunc('month', (select min(x) from unnest(v_dates) x)) = date_trunc('month', (select max(x) from unnest(v_dates) x))
                    then to_char((select min(x) from unnest(v_dates) x), 'Mon FMDD') || case when array_length(v_dates, 1) > 1 then '–' || to_char((select max(x) from unnest(v_dates) x), 'FMDD') else '' end
                    else to_char((select min(x) from unnest(v_dates) x), 'Mon FMDD') || '–' || to_char((select max(x) from unnest(v_dates) x), 'Mon FMDD') end;
  end if;
  for cr in select c from public.client_settings cs, jsonb_array_elements(public.bp_jarr(cs.data->'crews')) c
             where cs.user_id = p_owner and coalesce(c->>'id', '') <> '' loop
    select array_agg(e.id order by e.name), coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'trade', e.trade) order by e.name), '[]'::jsonb)
      into mem, members
      from public.employees e where e.owner = p_owner and e.active
       and e.id::text in (select jsonb_array_elements_text(public.bp_jarr(cr->'members')));
    n := coalesce(array_length(mem, 1), 0);
    if jsonb_typeof(j->'crew') = 'string' and j->>'crew' = cr->>'id' then
      on_job := on_job || jsonb_build_array(jsonb_build_object('kind', 'crew', 'id', cr->>'id', 'name', coalesce(nullif(cr->>'name', ''), 'Crew'),
                                                               'color', cr->>'color', 'members', members));
      continue;
    end if;
    if n = 0 then continue; end if;
    mem_t := array(select m::text from unnest(mem) m);
    reasons := '[]'::jsonb; flags := '[]'::jsonb;
    -- trade: the best member's match; the crew's own trade is the most common one
    select max(case when jt = 'general' then case when coalesce(public.bp_ceo_trade(e.trade), 'general') = 'general' then 1 else 0.5 end
                    when public.bp_ceo_trade(e.trade) = jt then 1
                    when public.bp_ceo_trade(coalesce(array_to_string(e.skills, ' '), '') || ' ' || coalesce(e.certifications, '')) = jt
                      or lower(coalesce(array_to_string(e.skills, ' '), '') || ' ' || coalesce(e.certifications, '')) ~ jt then 0.7
                    when coalesce(public.bp_ceo_trade(e.trade), 'general') = 'general' or lower(coalesce(e.trade, '')) ~ '(foreman|lead|super)' then 0.35 else 0 end),
           avg(case when e.started_trade_year between 1950 and extract(year from d0)::int then extract(year from d0)::int - e.started_trade_year
                    when e.hired_on is not null then greatest(0, (d0 - e.hired_on) / 365) else 0 end)
      into t_s, ayrs from public.employees e where e.id = any(mem);
    select t into ctrade from (select coalesce(public.bp_ceo_trade(e.trade), 'general') t, count(*) k from public.employees e where e.id = any(mem)
                                group by 1 order by count(*) desc, (coalesce(public.bp_ceo_trade(e.trade), 'general') = jt) desc, 1 limit 1) z;
    -- a crew whose members mostly do this trade counts as a full match
    if ctrade = jt and t_s < 1 then t_s := 1; end if;
    select count(*), avg(rating) into nrev, ravg from public.worker_reviews where owner = p_owner and employee_id = any(mem);
    r_s := case when nrev = 0 then 0.5 else least(1, greatest(0, ((ravg * nrev + 4.0) / (nrev + 1) - 3) / 2)) end;
    select count(*) into v_done from jsonb_array_elements(jobs) e
     where e->>'id' <> p_job and coalesce(e->>'status', '') = 'done' and jsonb_typeof(e->'crew') = 'string' and e->>'crew' = cr->>'id';
    x_s := least(1, coalesce(ayrs, 0) / 10.0) * 0.7 + least(1, v_done / 10.0) * 0.3;
    -- booked: another active job has this crew or any member on it (bp_ceo_others expands job.crew to its members)
    select count(*) into v_load from public.bp_ceo_others(p_owner, jobs, p_job) o where not o.done and o.emps && mem_t;
    select coalesce(jsonb_agg(jsonb_build_object('job', id, 'label', lbl, 'days', (select count(*) from unnest(o.dates) d where d = any(v_dates)))), '[]'::jsonb)
      into conf from public.bp_ceo_others(p_owner, jobs, p_job) o where not o.done and o.emps && mem_t and v_dates is not null and o.dates && v_dates;
    a_s := case when jsonb_array_length(conf) > 0 then 0 when v_dates is null then greatest(0.4, 0.8 - 0.1 * v_load) else greatest(0.7, 1 - 0.05 * v_load) end;
    -- size: more hands help on bigger-than-usual jobs (up to +10 for a 3+ crew on a 2x job)
    sz := case when w > 1 then (w - 1) * 10 * least(1, (n - 1) / 2.0) else 0 end;
    score := least(100, round((0.40 * t_s + 0.25 * a_s + w * (0.20 * r_s + 0.15 * x_s)) / (0.65 + 0.35 * w) * 100 + sz));

    reasons := reasons || to_jsonb(initcap(ctrade) || ' crew of ' || n
      || case when nrev > 0 then ' · avg ' || round(ravg, 1) || '★' else ' · no reviews yet' end
      || case when jsonb_array_length(conf) > 0 then ' · booked ' || coalesce(datetxt, 'those days')
              when datetxt is not null then ' · free ' || datetxt else '' end);
    if t_s >= 1 then reasons := reasons || to_jsonb(text 'Matches this ' || jt || ' job');
    elsif t_s >= 0.7 then reasons := reasons || to_jsonb(text 'Someone on it has ' || jt || ' in their skills');
    elsif t_s > 0 then reasons := reasons || to_jsonb(text 'General crew, not ' || jt || ' specialists');
    else reasons := reasons || to_jsonb(text 'Different trade (' || ctrade || ')'); flags := flags || '"trade_mismatch"'::jsonb; end if;
    if nrev > 0 then reasons := reasons || to_jsonb(round(ravg, 1) || '★ from ' || nrev || ' review' || case when nrev > 1 then 's' else '' end || ' across the crew'); end if;
    if coalesce(ayrs, 0) > 0 or v_done > 0 then reasons := reasons || to_jsonb(concat_ws(', ', case when ayrs >= 1 then round(ayrs) || ' yrs average in the trade' end,
                                                                  case when v_done > 0 then v_done || ' finished job' || case when v_done > 1 then 's' else '' end || ' as a crew' end)); end if;
    if jsonb_array_length(conf) > 0 then reasons := reasons || to_jsonb(text 'Busy those days on ' || (conf->0->>'label')); flags := flags || '"busy"'::jsonb;
    elsif v_dates is null then reasons := reasons || to_jsonb(case when v_load > 0 then 'On ' || v_load || ' other active job' || case when v_load > 1 then 's' else '' end else 'No other active jobs' end); end if;
    if sz >= 3 then reasons := reasons || to_jsonb(text 'Bigger job than usual - ' || n || ' people help'); end if;

    cands := cands || jsonb_build_array(jsonb_build_object('kind', 'crew', 'id', cr->>'id', 'name', coalesce(nullif(cr->>'name', ''), 'Crew'), 'color', cr->>'color',
      'trade', ctrade, 'size', n, 'members', members,
      'score', score, 'breakdown', jsonb_build_object('trade', round(t_s, 2), 'rating', round(r_s, 2), 'experience', round(x_s, 2), 'availability', round(a_s, 2), 'size', round(sz)),
      'rating', case when nrev > 0 then round(ravg, 2) end, 'reviews', nrev, 'years', round(coalesce(ayrs, 0)), 'jobs_done', v_done, 'active_jobs', v_load,
      'free', jsonb_array_length(conf) = 0, 'conflicts', conf, 'flags', flags, 'reasons', reasons, '_t', t_s));
  end loop;

  select c - '_t' into best_crew from jsonb_array_elements(cands) c
   where c->>'kind' = 'crew' and (c->>'_t')::numeric > 0 order by (c->>'score')::numeric desc, c->>'name' limit 1;
  cands := coalesce((select jsonb_agg(c - '_t') from jsonb_array_elements(cands) c), '[]'::jsonb);
  top := coalesce((select jsonb_agg(c order by (c->>'score')::numeric desc, c->>'name') from (
        select c from jsonb_array_elements(cands) c order by (c->>'score')::numeric desc, c->>'name' limit 5) z), '[]'::jsonb);
  if best_crew is not null and not top @> jsonb_build_array(jsonb_build_object('kind', 'crew', 'id', best_crew->>'id')) then
    top := top || jsonb_build_array(best_crew);
  end if;

  return jsonb_build_object('ok', true,
    'job', jsonb_build_object('id', p_job, 'label', public.bp_job_label(j), 'trade', jt, 'estimate', est, 'median_estimate', round(coalesce(med, 0)),
                              'weight', round(w, 2), 'dates', coalesce(to_jsonb(v_dates), '[]'::jsonb)),
    'candidates', top, 'best_crew', best_crew,
    'considered', jsonb_array_length(cands), 'flagged', flagged, 'on_job', on_job);
end $$;
revoke all on function public.bp_ceo_route(uuid, text) from public, anon;
grant execute on function public.bp_ceo_route(uuid, text) to authenticated, service_role;
