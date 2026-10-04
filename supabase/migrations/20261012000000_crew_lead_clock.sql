-- Crew leader clock-in.
--
-- The owner marks one member of a crew as its lead (client_settings.data
-- .crews[i].lead = employee id). From the crew app the lead can clock in /
-- out any of the people in that crew who are actually there. Every punch a
-- lead makes for someone else has exactly the effect of that person
-- clocking themselves (same "already in" / "not in" rules, hours and pay at
-- THEIR rate, a time_entries row on clock-out), and is stamped with who made
-- it. The person is told ("Marcus clocked you in ... Not you? Report it")
-- and can flag the punch; a flag shows on the owner's hours and pay period.
--
-- 1. time_clock: user_id becomes nullable (a person with no login can be
--    clocked in by their lead; employee_id identifies them), plus
--    clocked_by / clocked_by_name / disputed_at / dispute_note / dispute_by.
-- 2. time_entries: clock_in_id / clock_out_id link a shift to its punches,
--    and the lead + dispute facts are carried on it, because time_entries is
--    what Hours, Pay period and job labour read.
-- 3. bp_clock_punch(): the one place a punch is written. crew_clock() (self)
--    and crew_clock_for() (lead) both go through it. "Open" punches are found
--    by employee_id OR the login, so either way of clocking sees the other.
-- 4. crew_me(): its open punch is found the same way and says who made it.
-- 5. crew_lead_roster(), crew_clock_for(), crew_clock_dispute(),
--    crew_clock_dispute_clear().

-- ---------------------------------------------------------------- 1, 2 ---
do $$ begin
  execute 'alter table public.time_clock alter column user_id d' || 'rop not null';
end $$;
alter table public.time_clock add column if not exists clocked_by      uuid;
alter table public.time_clock add column if not exists clocked_by_name text;
alter table public.time_clock add column if not exists disputed_at     timestamptz;
alter table public.time_clock add column if not exists dispute_note    text;
alter table public.time_clock add column if not exists dispute_by      uuid;
create index if not exists time_clock_emp_at on public.time_clock(employee_id, at desc) where employee_id is not null;
create index if not exists time_clock_user_at on public.time_clock(user_id, at desc) where user_id is not null;

alter table public.time_entries add column if not exists clock_in_id     uuid;
alter table public.time_entries add column if not exists clock_out_id    uuid;
alter table public.time_entries add column if not exists clocked_by      uuid;
alter table public.time_entries add column if not exists clocked_by_name text;
alter table public.time_entries add column if not exists clocked_lat     double precision;
alter table public.time_entries add column if not exists clocked_lng     double precision;
alter table public.time_entries add column if not exists disputed_at     timestamptz;
alter table public.time_entries add column if not exists dispute_note    text;

-- the login of an employee record: the linked team seat, else an accepted
-- seat with the same email
create or replace function public.bp_employee_uid(p_emp public.employees) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select tm.member from public.team_members tm
      where tm.id = p_emp.team_id and tm.owner = p_emp.owner and tm.accepted_at is not null and tm.role <> 'sub' limit 1),
    (select tm.member from public.team_members tm
      where tm.owner = p_emp.owner and coalesce(p_emp.email, '') <> '' and lower(tm.email) = lower(p_emp.email)
        and tm.accepted_at is not null and tm.member is not null and tm.role <> 'sub' limit 1));
$$;
revoke all on function public.bp_employee_uid(public.employees) from public, anon, authenticated;

-- the latest punch of a person, by employee record or by login
create or replace function public.bp_clock_last(p_owner uuid, p_emp uuid, p_uid uuid) returns public.time_clock
language sql stable security definer set search_path = public as $$
  select * from public.time_clock
   where owner = p_owner and ((p_emp is not null and employee_id = p_emp) or (p_uid is not null and user_id = p_uid))
   order by at desc limit 1;
$$;
revoke all on function public.bp_clock_last(uuid, uuid, uuid) from public, anon, authenticated;

-- metres between two points
create or replace function public.bp_metres(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2)
         + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)));
$$;

-- ------------------------------------------------------------------- 3 ---
-- One punch for one person. p_by / p_by_name are set when someone else (a
-- crew lead) makes it. Not callable from the API.
create or replace function public.bp_clock_punch(p_owner uuid, p_emp public.employees, p_uid uuid, p_kind text,
    p_job text, p_job_name text, p_lat double precision, p_lng double precision, p_acc double precision,
    p_dist double precision, p_on_site boolean, p_by uuid, p_by_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare last public.time_clock; h numeric; rate numeric; row public.time_clock; te uuid;
begin
  if p_kind not in ('in','out') then raise exception 'bad kind'; end if;
  perform pg_advisory_xact_lock(hashtext('bp_clock:' || coalesce(p_emp.id::text, p_uid::text, '')));
  last := public.bp_clock_last(p_owner, p_emp.id, p_uid);
  if p_kind = 'in' and last.kind = 'in' then return jsonb_build_object('ok', false, 'error', 'already clocked in', 'since', last.at); end if;
  if p_kind = 'out' and (last.id is null or last.kind <> 'in') then return jsonb_build_object('ok', false, 'error', 'not clocked in'); end if;
  if p_kind = 'out' then h := round(extract(epoch from (now() - last.at)) / 3600.0, 2); end if;
  insert into public.time_clock(owner, user_id, employee_id, job_id, job_name, kind, lat, lng, accuracy_m, distance_m, on_site, hours,
                                clocked_by, clocked_by_name)
  values (p_owner, p_uid, p_emp.id, coalesce(case when p_kind='out' then last.job_id else p_job end,''),
          coalesce(case when p_kind='out' then last.job_name else p_job_name end,''), p_kind, p_lat, p_lng, p_acc, p_dist, p_on_site, h,
          p_by, nullif(trim(coalesce(p_by_name, '')), ''))
  returning * into row;
  if p_kind = 'out' and p_emp.id is not null and h > 0 then
    rate := case p_emp.pay_type when 'hourly' then coalesce(p_emp.rate,0) when 'day' then coalesce(p_emp.rate,0)/8 when 'salary' then coalesce(p_emp.rate,0)/2080 else 0 end
            * (1 + coalesce(p_emp.burden_pct,0)/100);
    insert into public.time_entries(owner, employee_id, job_id, job_name, worked_on, hours, ot_hours, note, cost,
                                    clock_in_id, clock_out_id, clocked_by, clocked_by_name, clocked_lat, clocked_lng, disputed_at, dispute_note)
    values (p_owner, p_emp.id, row.job_id, row.job_name, (last.at at time zone 'America/Los_Angeles')::date, least(h,8), greatest(h-8,0),
            'Clock-in ' || to_char(last.at at time zone 'America/Los_Angeles','HH12:MI AM') || ' to ' || to_char(now() at time zone 'America/Los_Angeles','HH12:MI AM')
              || case when coalesce(last.on_site,false) then ' · on site' else ' · off site' end,
            round(rate * least(h,8) + rate * 1.5 * greatest(h-8,0), 2),
            last.id, row.id,
            coalesce(last.clocked_by, row.clocked_by), coalesce(last.clocked_by_name, row.clocked_by_name),
            case when last.clocked_by is not null then last.lat else row.lat end,
            case when last.clocked_by is not null then last.lng else row.lng end,
            last.disputed_at, last.dispute_note)
    returning id into te;
  end if;
  return jsonb_build_object('ok', true, 'id', row.id, 'at', row.at, 'hours', h, 'entry', te,
                            'job_id', row.job_id, 'job_name', row.job_name);
end $$;
revoke all on function public.bp_clock_punch(uuid, public.employees, uuid, text, text, text, double precision, double precision, double precision, double precision, boolean, uuid, text) from public, anon, authenticated;

-- a person clocking themselves: same as before, through bp_clock_punch
create or replace function public.crew_clock(p_kind text, p_job text, p_job_name text, p_lat double precision, p_lng double precision, p_acc double precision, p_dist double precision, p_on_site boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.employees;
begin
  if public.bp_is_sub() then return jsonb_build_object('ok', false, 'error', 'subcontractors do not clock in'); end if;
  if p_kind not in ('in','out') then raise exception 'bad kind'; end if;
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signed out'); end if;
  e := public.bp_my_employee();
  return public.bp_clock_punch(public.bp_owner(), e, auth.uid(), p_kind, p_job, p_job_name, p_lat, p_lng, p_acc, p_dist, p_on_site, null, null);
end $$;
revoke all on function public.crew_clock(text,text,text,double precision,double precision,double precision,double precision,boolean) from public, anon;
grant execute on function public.crew_clock(text,text,text,double precision,double precision,double precision,double precision,boolean) to authenticated;

-- ------------------------------------------------------------------- 4 ---
-- crew_me's open punch: by login or by employee record, and who made it.
-- Patched in place (crew_me is long and owned by earlier migrations).
do $$ declare d text; o text; n text; begin
  d := pg_get_functiondef('public.crew_me()'::regprocedure);
  o := E'select id, job_id, job_name, at, on_site from public.time_clock\n     where user_id = auth.uid() order by at desc limit 1) t;';
  n := E'select id, job_id, job_name, at, on_site, clocked_by_name, (clocked_by is not null and clocked_by is distinct from auth.uid()) as by_other, disputed_at, dispute_note from public.time_clock\n     where owner = public.bp_owner() and (user_id = auth.uid() or (e.id is not null and employee_id = e.id)) order by at desc limit 1) t;';
  if position(o in d) = 0 then o := replace(o, E'\n    ', ''); end if;  -- live copy has it on one line
  if position(o in d) > 0 then
    execute replace(d, o, n);
  elsif position('by_other' in d) = 0 then
    raise exception 'crew_me: open-punch query not found, patch by hand';
  end if;
end $$;

-- ------------------------------------------------------------------- 5 ---
-- the caller as a crew lead: their employee record, or null
create or replace function public.bp_my_lead_employee() returns public.employees
language plpgsql stable security definer set search_path = public as $$
declare e public.employees;
begin
  if auth.uid() is null or public.bp_is_sub() then return null; end if;
  if not exists (select 1 from public.team_members where member = auth.uid() and accepted_at is not null and role in ('crew','office')) then return null; end if;
  e := public.bp_my_employee();
  return e;
end $$;
revoke all on function public.bp_my_lead_employee() from public, anon, authenticated;

-- crews I lead, every member with whether they are on the clock right now
create or replace function public.crew_lead_roster() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me public.employees; o uuid := public.bp_owner(); crews_out jsonb;
begin
  me := public.bp_my_lead_employee();
  if me.id is null then return jsonb_build_object('crews', '[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c->>'id', 'name', c->>'name', 'color', c->>'color',
           'members', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'trade', m.trade, 'photo', m.photo_url,
                          'me', m.id = me.id,
                          'open', (select case when l.kind = 'in' then jsonb_build_object('id', l.id, 'at', l.at, 'job_id', l.job_id, 'job_name', l.job_name,
                                          'by', l.clocked_by_name) end
                                     from (select (public.bp_clock_last(o, m.id, public.bp_employee_uid(m))).*) l))
                        order by (m.id <> me.id), m.name), '[]')
                         from public.employees m
                        where m.owner = o and m.active and (c->'members') ? m.id::text))), '[]')
    into crews_out
    from public.client_settings cs, jsonb_array_elements(coalesce(cs.data->'crews','[]'::jsonb)) c
   where cs.user_id = o and c->>'lead' = me.id::text;
  return jsonb_build_object('crews', crews_out, 'lead', jsonb_build_object('id', me.id, 'name', me.name));
end $$;
revoke all on function public.crew_lead_roster() from public, anon;
grant execute on function public.crew_lead_roster() to authenticated;

-- a lead clocks in / out people in their crew
create or replace function public.crew_clock_for(p_kind text, p_job text, p_employees uuid[],
    p_lat double precision, p_lng double precision, p_acc double precision, p_share boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.employees; o uuid := public.bp_owner(); ids uuid[]; c jsonb; j jsonb; jn text; jlbl text;
  m public.employees; uid uuid; r jsonb; res jsonb := '[]'::jsonb; lat double precision; lng double precision; acc double precision;
  dist double precision; onsite boolean; g jsonb; last public.time_clock; who text; k int := 0;
begin
  if public.bp_is_sub() then return jsonb_build_object('ok', false, 'error', 'subcontractors do not clock in'); end if;
  if p_kind not in ('in','out') then return jsonb_build_object('ok', false, 'error', 'bad kind'); end if;
  me := public.bp_my_lead_employee();
  if me.id is null then return jsonb_build_object('ok', false, 'error', 'not a lead'); end if;
  select array_agg(distinct x) into ids from unnest(coalesce(p_employees, '{}')) x where x is not null;
  if coalesce(array_length(ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'nobody picked'); end if;
  if array_length(ids, 1) > 30 then return jsonb_build_object('ok', false, 'error', 'too many'); end if;
  if not exists (select 1 from public.client_settings cs, jsonb_array_elements(coalesce(cs.data->'crews','[]'::jsonb)) x
                  where cs.user_id = o and x->>'lead' = me.id::text) then
    return jsonb_build_object('ok', false, 'error', 'not a lead');
  end if;
  -- one crew I lead has to hold every person on the list
  select x into c from public.client_settings cs, jsonb_array_elements(coalesce(cs.data->'crews','[]'::jsonb)) x
   where cs.user_id = o and x->>'lead' = me.id::text
     and jsonb_typeof(x->'members') = 'array'
     and (x->'members') @> (select jsonb_agg(i::text) from unnest(ids) i)
   limit 1;
  if c is null then return jsonb_build_object('ok', false, 'error', 'not in your crew'); end if;
  if p_kind = 'in' and coalesce(p_job, '') <> '' then
    j := public.bp_job_of(o, p_job);
    if j is null or coalesce(j->>'status', '') <> 'active' or not public.bp_crew_sees_job(j) then
      return jsonb_build_object('ok', false, 'error', 'not your job');
    end if;
    jn := coalesce(nullif(j->>'name', ''), 'Project') || coalesce(' — ' || nullif(j->>'title', ''), '');
  end if;
  if coalesce(p_share, false) and p_lat is not null and p_lng is not null then lat := p_lat; lng := p_lng; acc := p_acc; end if;

  for m in select * from public.employees e where e.owner = o and e.id = any(ids) order by e.name loop
    k := k + 1;
    if not m.active then
      res := res || jsonb_build_array(jsonb_build_object('employee_id', m.id, 'name', m.name, 'ok', false, 'error', 'inactive'));
      continue;
    end if;
    uid := public.bp_employee_uid(m);
    -- where the job is: the picked one on the way in, the open shift's on the way out
    dist := null; onsite := null; g := null;
    if p_kind = 'in' then g := j->'geo';
    else last := public.bp_clock_last(o, m.id, uid);
         if last.kind = 'in' and last.job_id <> '' then g := public.bp_job_of(o, last.job_id)->'geo'; end if;
    end if;
    if lat is not null and g is not null and jsonb_typeof(g->'lat') = 'number' and jsonb_typeof(g->'lng') = 'number' then
      dist := round(public.bp_metres(lat, lng, (g->>'lat')::double precision, (g->>'lng')::double precision));
      onsite := dist <= greatest(250, coalesce(acc, 0));
    end if;
    r := public.bp_clock_punch(o, m, uid, p_kind, coalesce(p_job, ''), coalesce(jn, ''), lat, lng, acc, dist, onsite,
                               case when uid is distinct from auth.uid() then auth.uid() end,
                               case when uid is distinct from auth.uid() then me.name end);
    r := r || jsonb_build_object('employee_id', m.id, 'name', m.name);
    res := res || jsonb_build_array(r);
    -- tell them, unless it was the lead clocking themselves
    if (r->>'ok')::boolean and uid is not null and uid is distinct from auth.uid() then
      jlbl := coalesce(nullif(concat_ws(' ', nullif(trim(public.bp_job_of(o, r->>'job_id')->>'name'), ''),
                                             lower(nullif(trim(public.bp_job_of(o, r->>'job_id')->>'title'), ''))), ''),
                       nullif(r->>'job_name', ''));
      who := split_part(trim(coalesce(me.name, 'Your crew lead')), ' ', 1);
      perform public.bp_notify(o, 'clocked_by_lead',
        who || ' clocked you ' || p_kind || coalesce(' on ' || jlbl, '') || ' at '
          || trim(to_char((r->>'at')::timestamptz at time zone 'America/Los_Angeles', 'FMHH12:MI AM')),
        'Not you? Tap to report it.', 'crewclock', nullif(r->>'job_id', ''), 'high', 'clk:' || (r->>'id'), 'user:' || uid::text);
    end if;
  end loop;
  if k < array_length(ids, 1) then
    res := res || (select coalesce(jsonb_agg(jsonb_build_object('employee_id', i, 'ok', false, 'error', 'not found')), '[]')
                     from unnest(ids) i where not exists (select 1 from public.employees e where e.owner = o and e.id = i));
  end if;
  return jsonb_build_object('ok', true, 'crew', c->>'id', 'results', res,
    'done', (select count(*) from jsonb_array_elements(res) x where (x->>'ok')::boolean));
end $$;
revoke all on function public.crew_clock_for(text, text, uuid[], double precision, double precision, double precision, boolean) from public, anon;
grant execute on function public.crew_clock_for(text, text, uuid[], double precision, double precision, double precision, boolean) to authenticated;

-- "that wasn't me": the person a punch was made for flags it
create or replace function public.crew_clock_dispute(p_clock_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.employees; t public.time_clock; nm text;
begin
  if auth.uid() is null or public.bp_is_sub() then return jsonb_build_object('ok', false, 'error', 'not yours'); end if;
  if length(coalesce(p_note, '')) > 500 then return jsonb_build_object('ok', false, 'error', 'too long'); end if;
  e := public.bp_my_employee();
  select * into t from public.time_clock where id = p_clock_id and owner = public.bp_owner();
  if t.id is null or not (t.user_id = auth.uid() or (e.id is not null and t.employee_id = e.id)) then
    return jsonb_build_object('ok', false, 'error', 'not yours');
  end if;
  if t.clocked_by is null or t.clocked_by = auth.uid() then return jsonb_build_object('ok', false, 'error', 'you made this punch'); end if;
  update public.time_clock set disputed_at = coalesce(disputed_at, now()), dispute_note = nullif(trim(coalesce(p_note, '')), ''), dispute_by = auth.uid()
   where id = t.id;
  update public.time_entries set disputed_at = coalesce(disputed_at, now()), dispute_note = nullif(trim(coalesce(p_note, '')), '')
   where owner = t.owner and (clock_in_id = t.id or clock_out_id = t.id);
  nm := coalesce(nullif(e.name, ''), 'A crew member');
  perform public.bp_notify(t.owner, 'clock_disputed',
    nm || ' says they didn''t clock ' || t.kind || ' at ' || trim(to_char(t.at at time zone 'America/Los_Angeles', 'FMHH12:MI AM Mon FMDD')),
    coalesce(t.clocked_by_name, 'Their crew lead') || ' made the punch' || coalesce(' on ' || nullif(t.job_name, ''), '') || '.'
      || coalesce(' "' || nullif(trim(coalesce(p_note, '')), '') || '"', '') || ' Review it before paying.',
    'employees:pay', nullif(t.job_id, ''), 'high', 'dispute:' || t.id::text, 'office');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.crew_clock_dispute(uuid, text) from public, anon;
grant execute on function public.crew_clock_dispute(uuid, text) to authenticated;

-- owner / office: clear a flag (p_id is a punch or a time entry)
create or replace function public.crew_clock_dispute_clear(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid := public.bp_owner(); te public.time_entries;
begin
  if auth.uid() is null or public.bp_is_sub() or public.bp_team_role() = 'crew' then return jsonb_build_object('ok', false, 'error', 'not allowed'); end if;
  select * into te from public.time_entries where id = p_id and owner = o;
  update public.time_clock set disputed_at = null
   where owner = o and (id = p_id or id = te.clock_in_id or id = te.clock_out_id);
  update public.time_entries set disputed_at = null
   where owner = o and (id = p_id or clock_in_id = p_id or clock_out_id = p_id);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.crew_clock_dispute_clear(uuid) from public, anon;
grant execute on function public.crew_clock_dispute_clear(uuid) to authenticated;
