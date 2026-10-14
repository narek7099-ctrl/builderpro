-- Lunches and breaks on the crew time clock.
--
-- A break belongs to the shift it is taken in (the open 'in' punch). Two kinds:
--   lunch  a meal break, unpaid: its minutes come off the shift's hours
--   break  a short rest break, paid: logged, but the time still counts
-- (California: 30-minute meal periods are unpaid when the worker is relieved
-- of all duty; 10-minute rest breaks are paid.)
--
-- Clocking out closes a break that is still running, and the hours written to
-- time_clock and time_entries are net of lunch. crew_clock_for() (a crew lead
-- clocking the crew out) goes through the same bp_clock_punch(), so it does too.

set lock_timeout = '5s';

create table if not exists public.time_breaks (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null,
  employee_id uuid,
  user_id     uuid,
  clock_in_id uuid not null references public.time_clock(id) on delete cascade,
  kind        text not null check (kind in ('lunch','break')),
  paid        boolean not null default false,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists time_breaks_shift on public.time_breaks(clock_in_id, started_at);
create index if not exists time_breaks_owner on public.time_breaks(owner, started_at desc);
alter table public.time_breaks enable row level security;
create policy time_breaks_read on public.time_breaks for select to authenticated
  using (owner = public.bp_owner() and (public.bp_team_role() <> 'crew' or user_id = auth.uid()));
revoke all on public.time_breaks from anon;
grant select on public.time_breaks to authenticated;   -- writes go through crew_break()

-- the breaks of one shift: the running one, the list, and the totals so far
create or replace function public.bp_break_state(p_clock_in uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select jsonb_build_object('id', b.id, 'kind', b.kind, 'at', b.started_at) from public.time_breaks b
              where b.clock_in_id = p_clock_in and b.ended_at is null order by b.started_at desc limit 1),
    'breaks', coalesce((select jsonb_agg(jsonb_build_object('kind', b.kind, 'at', b.started_at, 'end', b.ended_at) order by b.started_at)
              from public.time_breaks b where b.clock_in_id = p_clock_in), '[]'::jsonb),
    'lunch_sec', coalesce((select round(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at)))) from public.time_breaks b
              where b.clock_in_id = p_clock_in and b.kind = 'lunch'), 0),
    'break_sec', coalesce((select round(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at)))) from public.time_breaks b
              where b.clock_in_id = p_clock_in and b.kind = 'break'), 0));
$$;
revoke all on function public.bp_break_state(uuid) from public, anon, authenticated;

-- crew_break('state' | 'start' | 'end', 'lunch' | 'break')
create or replace function public.crew_break(p_action text, p_kind text default 'break')
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.employees; o uuid := public.bp_owner(); last public.time_clock; b public.time_breaks;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signed out'); end if;
  if public.bp_is_sub() then return jsonb_build_object('ok', false, 'error', 'subcontractors do not clock in'); end if;
  if p_action not in ('state', 'start', 'end') then return jsonb_build_object('ok', false, 'error', 'bad action'); end if;
  e := public.bp_my_employee();
  if p_action <> 'state' then
    perform pg_advisory_xact_lock(hashtext('bp_clock:' || coalesce(e.id::text, auth.uid()::text, '')));
  end if;
  last := public.bp_clock_last(o, e.id, auth.uid());
  if last.id is null or last.kind <> 'in' then
    if p_action = 'state' then return jsonb_build_object('ok', true, 'on', false); end if;
    return jsonb_build_object('ok', false, 'error', 'not clocked in');
  end if;
  select * into b from public.time_breaks where clock_in_id = last.id and ended_at is null order by started_at desc limit 1;
  if p_action = 'start' then
    if p_kind not in ('lunch', 'break') then return jsonb_build_object('ok', false, 'error', 'bad kind'); end if;
    if b.id is not null then return jsonb_build_object('ok', false, 'error', 'already on a break'); end if;
    insert into public.time_breaks(owner, employee_id, user_id, clock_in_id, kind, paid)
    values (o, e.id, auth.uid(), last.id, p_kind, p_kind = 'break');
  elsif p_action = 'end' then
    if b.id is null then return jsonb_build_object('ok', false, 'error', 'not on a break'); end if;
    update public.time_breaks set ended_at = now() where id = b.id;
  end if;
  return public.bp_break_state(last.id) || jsonb_build_object('ok', true, 'on', true);
end $$;
revoke all on function public.crew_break(text, text) from public, anon;
grant execute on function public.crew_break(text, text) to authenticated;

-- the punch itself: as before, but clocking out ends a running break and the
-- hours are net of lunch
create or replace function public.bp_clock_punch(p_owner uuid, p_emp employees, p_uid uuid, p_kind text, p_job text, p_job_name text,
  p_lat double precision, p_lng double precision, p_acc double precision, p_dist double precision, p_on_site boolean, p_by uuid, p_by_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare last public.time_clock; h numeric; rate numeric; row public.time_clock; te uuid; unpaid numeric := 0; lunch text := '';
begin
  if p_kind not in ('in','out') then raise exception 'bad kind'; end if;
  perform pg_advisory_xact_lock(hashtext('bp_clock:' || coalesce(p_emp.id::text, p_uid::text, '')));
  last := public.bp_clock_last(p_owner, p_emp.id, p_uid);
  if p_kind = 'in' and last.kind = 'in' then return jsonb_build_object('ok', false, 'error', 'already clocked in', 'since', last.at); end if;
  if p_kind = 'out' and (last.id is null or last.kind <> 'in') then return jsonb_build_object('ok', false, 'error', 'not clocked in'); end if;
  if p_kind = 'out' then
    update public.time_breaks set ended_at = now() where clock_in_id = last.id and ended_at is null;
    select coalesce(sum(extract(epoch from (ended_at - started_at))), 0) into unpaid
      from public.time_breaks where clock_in_id = last.id and kind = 'lunch';
    h := round(greatest(0, extract(epoch from (now() - last.at)) - unpaid) / 3600.0, 2);
    if unpaid >= 60 then lunch := ' · lunch ' || round(unpaid / 60) || ' min'; end if;
  end if;
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
              || lunch
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
                            'job_id', row.job_id, 'job_name', row.job_name, 'lunch_min', round(unpaid / 60));
end $$;
