-- Who goes where, version 3 (2026-11-28): the job's difficulty decides how much
-- experience it needs, and where people already are counts for the routes.
--
-- bp_job_difficulty(job, size weight): 1 Easy · 2 Standard · 3 Skilled · 4 Hard · 5 Expert.
--   The contractor can set it on the project (job.difficulty 1-5). Otherwise it
--   is read from the job's words (tear-off, steep, commercial, gas line... /
--   tune-up, filter, inspection...), one step up when the job is well over the
--   usual size. Each level needs some experience: 0, 1, 2, 4, 7 years.
--
-- bp_ceo_route(owner, job), per employee, sub and crew:
--   profession   trade match (as before)
--   expertise    one of their listed skills is named in the job, or a cert that
--                fits the trade (EPA 608, journeyman, GAF...)
--   experience   years in the trade + finished jobs (+2 for a license or
--                master/journeyman cert on hard jobs), against what the level
--                needs. Short of it drops fast; well short on a hard job is
--                flagged under_experienced and the score cut. A senior hand on
--                an easy job is held back a little (overqualified).
--   rating, availability  (as before)
--   distance     how far the job is from their other active jobs or their last
--                clock-in (14 days). Unknown counts as neutral.
--   weights      easy jobs lean on availability and distance; hard jobs on
--                experience and expertise.
-- Output keeps every field it had, plus job.difficulty, breakdown.expertise and
-- breakdown.distance, miles, need_years and the new flags.

create or replace function public.bp_km(a1 float8, o1 float8, a2 float8, o2 float8) returns float8
language sql immutable set search_path = public as $$
  select case when a1 is null or o1 is null or a2 is null or o2 is null then null else
    12742 * asin(least(1, sqrt(power(sin(radians(a2 - a1) / 2), 2) + cos(radians(a1)) * cos(radians(a2)) * power(sin(radians(o2 - o1) / 2), 2)))) end;
$$;

create or replace function public.bp_jgeo(e jsonb, k text) returns float8
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(e->'geo'->k) = 'number' then (e->'geo'->>k)::float8 end;
$$;

create or replace function public.bp_job_difficulty(j jsonb, w numeric) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  x text := lower(concat_ws(' ', j->>'title', j->>'type', j->>'trade', j->>'notes', j->>'scope'));
  s text := btrim(coalesce(j->>'difficulty', ''));
  p5 text := '(commercial|structural|load.?bearing|gas line|gas pipe|service upgrade|main panel|400 ?amp|three.?phase|3.?phase|slate|clay tile|mansard|geothermal|boiler (install|replace)|sewer line|rooftop unit|whole.?house repipe|foundation repair)';
  p4 text := '(tear.?off|re.?roof|roof replacement|full replace|steep|standing seam|metal roof|flat roof|\mtpo\M|\mepdm\M|new system|system install|ductwork|heat pump install|mini.?split install|panel upgrade|rewire|tankless|repipe|skylight|addition|remodel|replacement)';
  p1 text := '(tune.?up|maintenance|filter|inspection|inspect\M|cleaning|clean.?out|gutter clean|touch.?up|service call|diagnos|walk.?through|punch list|minor)';
  p3 text := '(install|replace|leak|flashing|valley|chimney|drain line|circuit|ev charger|retrofit|repair)';
  lv int; why text; m text;
begin
  if s ~ '^[1-5]$' then
    lv := s::int; why := 'Set on the project';
  else
    if x ~ p5 then lv := 5; m := (regexp_match(x, p5))[1];
    elsif x ~ p4 then lv := 4; m := (regexp_match(x, p4))[1];
    elsif x ~ p1 then lv := 1; m := (regexp_match(x, p1))[1];
    elsif x ~ p3 then lv := 3; m := (regexp_match(x, p3))[1];
    else lv := 2; end if;
    why := case when m is not null then 'Mentions "' || m || '"' else 'A standard job' end;
    if coalesce(w, 1) >= 1.6 and lv < 4 then lv := lv + 1; why := why || ', and it is bigger than your usual job'; end if;
  end if;
  return jsonb_build_object('level', lv, 'label', (array['Easy', 'Standard', 'Skilled', 'Hard', 'Expert'])[lv],
    'need_years', (array[0, 1, 2, 4, 7])[lv], 'why', why, 'auto', not (s ~ '^[1-5]$'));
end $$;

-- how well someone's experience covers what the job needs (0-1)
create or replace function public.bp_exp_fit(eff numeric, need int) returns numeric
language sql immutable set search_path = public as $$
  select case when need <= 0 then least(1, 0.75 + greatest(0, eff) / 20.0)
              when eff >= need then least(1, 0.85 + (eff - need) / 40.0)
              else 0.85 * power(greatest(0, eff) / need, 1.5) end;
$$;

create or replace function public.bp_ceo_route(p_owner uuid, p_job text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d0 date := (now() at time zone 'utc')::date;
  j jsonb; jt text; est numeric; med numeric; w numeric; v_dates date[]; jobs jsonb;
  r record; cands jsonb := '[]'::jsonb; flagged jsonb := '[]'::jsonb; on_job jsonb := '[]'::jsonb;
  t_s numeric; r_s numeric; x_s numeric; a_s numeric; k_s numeric; d_s numeric; score numeric; wt text; yrs int; v_done int; nrev int; ravg numeric;
  conf jsonb; v_load int; flags jsonb; reasons jsonb; skilltxt text; coi date; mine boolean;
  cr jsonb; mem uuid[]; mem_t text[]; n int; ctrade text; ayrs numeric; members jsonb; sz numeric; datetxt text;
  best_crew jsonb; top jsonb;
  -- v3
  dif jsonb; lv int; nd int; tt numeric; jx text; jlat float8; jlng float8; km float8; km2 float8; eff numeric; eff_lead numeric; hit text; cert boolean;
  w_t numeric; w_k numeric; w_x numeric; w_r numeric; w_a numeric; w_d numeric; mult numeric;
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

  -- how hard, what it needs, and how the score leans
  dif := public.bp_job_difficulty(j, w);
  lv := (dif->>'level')::int; nd := (dif->>'need_years')::int; tt := (lv - 1) / 4.0;
  w_t := 0.30 - 0.05 * tt; w_k := 0.05 + 0.10 * tt; w_x := 0.08 + 0.24 * tt; w_r := 0.12 + 0.01 * tt; w_a := 0.25 - 0.15 * tt; w_d := 0.20 - 0.15 * tt;
  jx := lower(concat_ws(' ', j->>'title', j->>'type', j->>'trade', j->>'notes', j->>'scope'));
  jlat := public.bp_jgeo(j, 'lat'); jlng := public.bp_jgeo(j, 'lng');

  -- employees
  for r in select e.* from public.employees e where e.owner = p_owner and e.active order by e.name loop
    mine := (jsonb_typeof(j->'assignees') = 'array' and j->'assignees' @> jsonb_build_array(jsonb_build_object('employeeId', r.id::text)))
         or (jsonb_typeof(j->'crew') = 'array' and (j->'crew') ? r.id::text)
         or (jsonb_typeof(j->'crew') = 'string' and exists (select 1 from public.client_settings cs, jsonb_array_elements(public.bp_jarr(cs.data->'crews')) c
                                                              where cs.user_id = p_owner and c->>'id' = j->>'crew' and (c->'members') ? r.id::text));
    if mine then on_job := on_job || jsonb_build_array(jsonb_build_object('kind', 'employee', 'id', r.id, 'name', r.name)); continue; end if;
    wt := public.bp_ceo_trade(r.trade);
    skilltxt := lower(coalesce(array_to_string(r.skills, ' '), '') || ' ' || coalesce(r.certifications, ''));
    reasons := '[]'::jsonb; flags := '[]'::jsonb; mult := 1;
    t_s := case when jt = 'general' then case when wt = 'general' then 1 else 0.5 end
                when wt = jt then 1
                when public.bp_ceo_trade(skilltxt) = jt or skilltxt ~ jt or (jt = 'roofing' and skilltxt ~ 'roof') then 0.7
                when wt = 'general' or lower(r.trade) ~ '(foreman|lead|super)' then 0.35 else 0 end;
    select count(*), avg(rating) into nrev, ravg from public.worker_reviews where owner = p_owner and employee_id = r.id;
    r_s := case when nrev = 0 then 0.5 else least(1, greatest(0, ((ravg * nrev + 4.0) / (nrev + 1) - 3) / 2)) end;
    yrs := case when r.started_trade_year between 1950 and extract(year from d0)::int then extract(year from d0)::int - r.started_trade_year
                when r.hired_on is not null then greatest(0, (d0 - r.hired_on) / 365) else 0 end;
    select count(*) filter (where done), count(*) filter (where not done) into v_done, v_load from public.bp_ceo_others(p_owner, jobs, p_job) where r.id::text = any(emps);
    -- expertise: a skill they list is named in the job, or a cert that fits the trade
    select s into hit from unnest(coalesce(r.skills, '{}'::text[])) s where length(btrim(s)) >= 3 and position(lower(btrim(s)) in jx) > 0 limit 1;
    cert := (jt = 'hvac' and skilltxt ~ '(608|nate)') or (jt in ('electrical', 'plumbing') and skilltxt ~ '(journeyman|master|licen[sc]|backflow)')
         or (jt = 'roofing' and skilltxt ~ '(gaf|owens|certainteed|haag|master elite|preferred contractor)');
    k_s := case when hit is not null then 1 when cert then 0.9 when t_s >= 1 then 0.6 else 0.4 end;
    -- experience against what this job needs
    eff := yrs + least(v_done, 24) / 8.0 + case when lv >= 4 and skilltxt ~ '(master|journeyman|licen[sc]|certified|epa ?608|nate|osha ?30)' then 2 else 0 end;
    x_s := public.bp_exp_fit(eff, nd);
    if lv <= 1 and yrs >= 10 then mult := mult * 0.88; flags := flags || '"overqualified"'::jsonb; end if;
    if nd > 0 and eff < nd * 0.75 then
      flags := flags || '"under_experienced"'::jsonb; mult := mult * case when lv >= 4 then 0.6 when lv = 3 then 0.85 else 1 end;
    end if;
    -- where they are: their other active jobs, or their last clock-in
    km := null;
    if jlat is not null then
      select min(public.bp_km(jlat, jlng, public.bp_jgeo(e, 'lat'), public.bp_jgeo(e, 'lng'))) into km
        from jsonb_array_elements(jobs) e join public.bp_ceo_others(p_owner, jobs, p_job) o on o.id = e->>'id'
       where not o.done and r.id::text = any(o.emps);
      select public.bp_km(jlat, jlng, t.lat, t.lng) into km2 from public.time_clock t
       where t.owner = p_owner and t.employee_id = r.id and t.lat is not null and t.at > now() - interval '14 days' order by t.at desc limit 1;
      km := least(km, km2);
    end if;
    d_s := case when km is null then 0.5 when km <= 8 then 1 when km >= 80 then 0.2 else 1 - (km - 8) / 72.0 * 0.8 end;
    select coalesce(jsonb_agg(jsonb_build_object('job', id, 'label', lbl, 'days', (select count(*) from unnest(o.dates) d where d = any(v_dates)))), '[]'::jsonb)
      into conf from public.bp_ceo_others(p_owner, jobs, p_job) o where not o.done and r.id::text = any(o.emps) and v_dates is not null and o.dates && v_dates;
    a_s := case when jsonb_array_length(conf) > 0 then 0 when v_dates is null then greatest(0.4, 0.8 - 0.1 * v_load) else greatest(0.7, 1 - 0.05 * v_load) end;
    if t_s = 0 and jt <> 'general' then mult := mult * 0.7; end if;
    score := round(100 * (w_t * t_s + w_k * k_s + w_x * x_s + w_r * r_s + w_a * a_s + w_d * d_s) * mult);

    if t_s >= 1 then reasons := reasons || to_jsonb(initcap(coalesce(nullif(r.trade, ''), jt)) || ' - matches this ' || jt || ' job');
    elsif t_s >= 0.7 then reasons := reasons || to_jsonb(text 'Has ' || jt || ' in their skills');
    elsif t_s > 0 then reasons := reasons || to_jsonb(text 'General hand, not a ' || jt || ' specialist');
    else reasons := reasons || to_jsonb(text 'Different trade (' || coalesce(nullif(r.trade, ''), 'none set') || ')'); flags := flags || '"trade_mismatch"'::jsonb; end if;
    if hit is not null then reasons := reasons || to_jsonb(text 'Lists "' || btrim(hit) || '" in their skills');
    elsif cert then reasons := reasons || to_jsonb(text 'Has a ' || jt || ' certification'); end if;
    if flags ? 'under_experienced' then
      reasons := reasons || to_jsonb(text 'This ' || lower(dif->>'label') || ' job needs about ' || nd || '+ yrs; they have ' || yrs);
    elsif flags ? 'overqualified' then
      reasons := reasons || to_jsonb(text 'Senior hand on an easy job - better kept for harder work');
    elsif nd > 0 and yrs >= nd then
      reasons := reasons || to_jsonb(text 'Enough experience for a ' || lower(dif->>'label') || ' job');
    end if;
    reasons := reasons || to_jsonb(case when nrev = 0 then 'No customer reviews yet' else round(ravg, 1) || '★ from ' || nrev || ' review' || case when nrev > 1 then 's' else '' end end);
    if yrs > 0 or v_done > 0 then reasons := reasons || to_jsonb(concat_ws(', ', case when yrs > 0 then yrs || ' yr' || case when yrs > 1 then 's' else '' end || ' in the trade' end,
                                                                  case when v_done > 0 then v_done || ' finished job' || case when v_done > 1 then 's' else '' end end)); end if;
    if km is not null then reasons := reasons || to_jsonb(case when km <= 8 then 'Close by - ' else '' end || round(km * 0.621) || ' mi from where they work now'); end if;
    if jsonb_array_length(conf) > 0 then reasons := reasons || to_jsonb(text 'Busy those days on ' || (conf->0->>'label')); flags := flags || '"busy"'::jsonb;
    elsif v_dates is not null then reasons := reasons || to_jsonb(text 'Free on the job''s dates');
    else reasons := reasons || to_jsonb(case when v_load > 0 then 'On ' || v_load || ' other active job' || case when v_load > 1 then 's' else '' end else 'No other active jobs' end); end if;

    cands := cands || jsonb_build_array(jsonb_build_object('kind', 'employee', 'id', r.id, 'team_id', r.team_id, 'name', r.name, 'trade', r.trade,
      'score', score, 'breakdown', jsonb_build_object('trade', round(t_s, 2), 'expertise', round(k_s, 2), 'experience', round(x_s, 2), 'rating', round(r_s, 2),
                                                       'availability', round(a_s, 2), 'distance', round(d_s, 2)),
      'rating', case when nrev > 0 then round(ravg, 2) end, 'reviews', nrev, 'years', yrs, 'jobs_done', v_done, 'active_jobs', v_load,
      'miles', case when km is not null then round(km * 0.621) end, 'need_years', nd,
      'free', jsonb_array_length(conf) = 0, 'conflicts', conf, 'flags', flags, 'reasons', reasons));
  end loop;

  -- subcontractors (a licensed business: experience from the work they've done with you)
  for r in select s.* from public.subcontractors s where s.owner = p_owner and s.active order by s.company loop
    if jsonb_typeof(j->'subs') = 'array' and exists (select 1 from jsonb_array_elements(j->'subs') x where x->>'subId' = r.id::text) then
      on_job := on_job || jsonb_build_array(jsonb_build_object('kind', 'sub', 'id', r.id, 'name', r.company)); continue;
    end if;
    wt := public.bp_ceo_trade(r.trade); reasons := '[]'::jsonb; flags := '[]'::jsonb; mult := 1;
    t_s := case when jt = 'general' then case when wt = 'general' then 1 else 0.5 end when wt = jt then 1 when wt = 'general' then 0.35 else 0 end;
    select count(*), avg(rating) into nrev, ravg from public.worker_reviews where owner = p_owner and sub_id = r.id;
    r_s := case when nrev = 0 then 0.5 else least(1, greatest(0, ((ravg * nrev + 4.0) / (nrev + 1) - 3) / 2)) end;
    select count(*) filter (where done), count(*) filter (where not done) into v_done, v_load from public.bp_ceo_others(p_owner, jobs, p_job) where r.id::text = any(subs);
    yrs := 0; x_s := least(1, 0.6 + 0.1 * v_done); k_s := case when t_s >= 1 then 0.8 else 0.4 end; d_s := 0.5;
    select coalesce(jsonb_agg(jsonb_build_object('job', id, 'label', lbl)), '[]'::jsonb) into conf
      from public.bp_ceo_others(p_owner, jobs, p_job) o where not o.done and r.id::text = any(o.subs) and v_dates is not null and o.dates && v_dates;
    a_s := case when jsonb_array_length(conf) > 0 then 0.3 when v_dates is null then greatest(0.4, 0.8 - 0.1 * v_load) else greatest(0.7, 1 - 0.05 * v_load) end;
    select max(expires) into coi from public.sub_documents where owner = p_owner and sub_id = r.id and kind = 'coi';
    if t_s = 0 and jt <> 'general' then mult := mult * 0.7; end if;
    score := round(100 * (w_t * t_s + w_k * k_s + w_x * x_s + w_r * r_s + w_a * a_s + w_d * d_s) * mult);
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
      'score', score, 'breakdown', jsonb_build_object('trade', round(t_s, 2), 'expertise', round(k_s, 2), 'experience', round(x_s, 2), 'rating', round(r_s, 2),
                                                       'availability', round(a_s, 2), 'distance', round(d_s, 2)),
      'rating', case when nrev > 0 then round(ravg, 2) end, 'reviews', nrev, 'jobs_done', v_done, 'active_jobs', v_load, 'coi_expires', coi, 'need_years', nd,
      'free', jsonb_array_length(conf) = 0, 'conflicts', conf, 'flags', flags, 'reasons', reasons));
    if flags ?| array['coi_expired', 'coi_missing'] and t_s > 0 then
      flagged := flagged || jsonb_build_array(jsonb_build_object('id', r.id, 'name', r.company, 'flags', flags));
    end if;
  end loop;

  -- crews (client_settings.data.crews: {id, name, color, members:[employee id], lead})
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
    reasons := '[]'::jsonb; flags := '[]'::jsonb; mult := 1;
    select max(case when jt = 'general' then case when coalesce(public.bp_ceo_trade(e.trade), 'general') = 'general' then 1 else 0.5 end
                    when public.bp_ceo_trade(e.trade) = jt then 1
                    when public.bp_ceo_trade(coalesce(array_to_string(e.skills, ' '), '') || ' ' || coalesce(e.certifications, '')) = jt
                      or lower(coalesce(array_to_string(e.skills, ' '), '') || ' ' || coalesce(e.certifications, '')) ~ jt then 0.7
                    when coalesce(public.bp_ceo_trade(e.trade), 'general') = 'general' or lower(coalesce(e.trade, '')) ~ '(foreman|lead|super)' then 0.35 else 0 end),
           avg(case when e.started_trade_year between 1950 and extract(year from d0)::int then extract(year from d0)::int - e.started_trade_year
                    when e.hired_on is not null then greatest(0, (d0 - e.hired_on) / 365) else 0 end),
           max(case when e.started_trade_year between 1950 and extract(year from d0)::int then extract(year from d0)::int - e.started_trade_year
                    when e.hired_on is not null then greatest(0, (d0 - e.hired_on) / 365) else 0 end
               + case when lv >= 4 and lower(coalesce(array_to_string(e.skills, ' '), '') || ' ' || coalesce(e.certifications, '')) ~ '(master|journeyman|licen[sc]|certified|epa ?608|nate|osha ?30)' then 2 else 0 end)
      into t_s, ayrs, eff_lead from public.employees e where e.id = any(mem);
    select t into ctrade from (select coalesce(public.bp_ceo_trade(e.trade), 'general') t, count(*) k from public.employees e where e.id = any(mem)
                                group by 1 order by count(*) desc, (coalesce(public.bp_ceo_trade(e.trade), 'general') = jt) desc, 1 limit 1) z;
    if ctrade = jt and t_s < 1 then t_s := 1; end if;
    select count(*), avg(rating) into nrev, ravg from public.worker_reviews where owner = p_owner and employee_id = any(mem);
    r_s := case when nrev = 0 then 0.5 else least(1, greatest(0, ((ravg * nrev + 4.0) / (nrev + 1) - 3) / 2)) end;
    select count(*) into v_done from jsonb_array_elements(jobs) e
     where e->>'id' <> p_job and coalesce(e->>'status', '') = 'done' and jsonb_typeof(e->'crew') = 'string' and e->>'crew' = cr->>'id';
    -- a crew is as experienced as the person leading it, with the rest pulling the average
    eff := coalesce(eff_lead, 0) + least(v_done, 24) / 8.0;
    x_s := 0.7 * public.bp_exp_fit(eff, nd) + 0.3 * public.bp_exp_fit(coalesce(ayrs, 0) + least(v_done, 24) / 8.0, nd);
    if nd > 0 and eff < nd * 0.75 then
      flags := flags || '"under_experienced"'::jsonb; mult := mult * case when lv >= 4 then 0.6 when lv = 3 then 0.85 else 1 end;
    end if;
    select s into hit from public.employees e, unnest(coalesce(e.skills, '{}'::text[])) s
     where e.id = any(mem) and length(btrim(s)) >= 3 and position(lower(btrim(s)) in jx) > 0 limit 1;
    k_s := case when hit is not null then 1 when t_s >= 1 then 0.6 else 0.4 end;
    select count(*) into v_load from public.bp_ceo_others(p_owner, jobs, p_job) o where not o.done and o.emps && mem_t;
    select coalesce(jsonb_agg(jsonb_build_object('job', id, 'label', lbl, 'days', (select count(*) from unnest(o.dates) d where d = any(v_dates)))), '[]'::jsonb)
      into conf from public.bp_ceo_others(p_owner, jobs, p_job) o where not o.done and o.emps && mem_t and v_dates is not null and o.dates && v_dates;
    a_s := case when jsonb_array_length(conf) > 0 then 0 when v_dates is null then greatest(0.4, 0.8 - 0.1 * v_load) else greatest(0.7, 1 - 0.05 * v_load) end;
    km := null;
    if jlat is not null then
      select min(public.bp_km(jlat, jlng, public.bp_jgeo(e, 'lat'), public.bp_jgeo(e, 'lng'))) into km
        from jsonb_array_elements(jobs) e join public.bp_ceo_others(p_owner, jobs, p_job) o on o.id = e->>'id'
       where not o.done and o.emps && mem_t;
      select min(public.bp_km(jlat, jlng, t.lat, t.lng)) into km2 from public.time_clock t
       where t.owner = p_owner and t.employee_id = any(mem) and t.lat is not null and t.at > now() - interval '14 days';
      km := least(km, km2);
    end if;
    d_s := case when km is null then 0.5 when km <= 8 then 1 when km >= 80 then 0.2 else 1 - (km - 8) / 72.0 * 0.8 end;
    sz := case when w > 1 then (w - 1) * 10 * least(1, (n - 1) / 2.0) else 0 end;
    if t_s = 0 and jt <> 'general' then mult := mult * 0.7; end if;
    score := least(100, round(100 * (w_t * t_s + w_k * k_s + w_x * x_s + w_r * r_s + w_a * a_s + w_d * d_s) * mult + sz));

    reasons := reasons || to_jsonb(initcap(ctrade) || ' crew of ' || n
      || case when nrev > 0 then ' · avg ' || round(ravg, 1) || '★' else ' · no reviews yet' end
      || case when jsonb_array_length(conf) > 0 then ' · booked ' || coalesce(datetxt, 'those days')
              when datetxt is not null then ' · free ' || datetxt else '' end);
    if t_s >= 1 then reasons := reasons || to_jsonb(text 'Matches this ' || jt || ' job');
    elsif t_s >= 0.7 then reasons := reasons || to_jsonb(text 'Someone on it has ' || jt || ' in their skills');
    elsif t_s > 0 then reasons := reasons || to_jsonb(text 'General crew, not ' || jt || ' specialists');
    else reasons := reasons || to_jsonb(text 'Different trade (' || ctrade || ')'); flags := flags || '"trade_mismatch"'::jsonb; end if;
    if hit is not null then reasons := reasons || to_jsonb(text 'Someone on it lists "' || btrim(hit) || '"'); end if;
    if flags ? 'under_experienced' then
      reasons := reasons || to_jsonb(text 'This ' || lower(dif->>'label') || ' job needs a lead with about ' || nd || '+ yrs');
    elsif nd > 0 then reasons := reasons || to_jsonb(text 'Lead has the experience for a ' || lower(dif->>'label') || ' job'); end if;
    if nrev > 0 then reasons := reasons || to_jsonb(round(ravg, 1) || '★ from ' || nrev || ' review' || case when nrev > 1 then 's' else '' end || ' across the crew'); end if;
    if coalesce(ayrs, 0) > 0 or v_done > 0 then reasons := reasons || to_jsonb(concat_ws(', ', case when ayrs >= 1 then round(ayrs) || ' yrs average in the trade' end,
                                                                  case when v_done > 0 then v_done || ' finished job' || case when v_done > 1 then 's' else '' end || ' as a crew' end)); end if;
    if km is not null then reasons := reasons || to_jsonb(case when km <= 8 then 'Close by - ' else '' end || round(km * 0.621) || ' mi from where they work now'); end if;
    if jsonb_array_length(conf) > 0 then reasons := reasons || to_jsonb(text 'Busy those days on ' || (conf->0->>'label')); flags := flags || '"busy"'::jsonb;
    elsif v_dates is null then reasons := reasons || to_jsonb(case when v_load > 0 then 'On ' || v_load || ' other active job' || case when v_load > 1 then 's' else '' end else 'No other active jobs' end); end if;
    if sz >= 3 then reasons := reasons || to_jsonb(text 'Bigger job than usual - ' || n || ' people help'); end if;

    cands := cands || jsonb_build_array(jsonb_build_object('kind', 'crew', 'id', cr->>'id', 'name', coalesce(nullif(cr->>'name', ''), 'Crew'), 'color', cr->>'color',
      'trade', ctrade, 'size', n, 'members', members,
      'score', score, 'breakdown', jsonb_build_object('trade', round(t_s, 2), 'expertise', round(k_s, 2), 'experience', round(x_s, 2), 'rating', round(r_s, 2),
                                                       'availability', round(a_s, 2), 'distance', round(d_s, 2), 'size', round(sz)),
      'rating', case when nrev > 0 then round(ravg, 2) end, 'reviews', nrev, 'years', round(coalesce(ayrs, 0)), 'jobs_done', v_done, 'active_jobs', v_load,
      'miles', case when km is not null then round(km * 0.621) end, 'need_years', nd,
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
                              'weight', round(w, 2), 'dates', coalesce(to_jsonb(v_dates), '[]'::jsonb), 'difficulty', dif,
                              'located', jlat is not null),
    'candidates', top, 'best_crew', best_crew,
    'considered', jsonb_array_length(cands), 'flagged', flagged, 'on_job', on_job);
end $$;
revoke all on function public.bp_ceo_route(uuid, text) from public, anon;
grant execute on function public.bp_ceo_route(uuid, text) to authenticated, service_role;
