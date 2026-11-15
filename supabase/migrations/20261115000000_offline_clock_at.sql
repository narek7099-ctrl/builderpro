-- Offline mode (2026-11-15): a crew member who taps Clock in, Clock out, Lunch or
-- Break with no signal has the tap saved on the phone and sent when the signal
-- returns. These record the moment of the tap instead of the moment it arrived.
--
-- New functions only, next to the originals (crew_clock, crew_break,
-- bp_clock_punch are unchanged). The tap time is kept honest on the server:
-- never in the future, never more than 3 days back, never before the punch
-- it follows.

create or replace function public.bp_clock_punch_at(p_owner uuid, p_emp employees, p_uid uuid, p_kind text, p_job text, p_job_name text,
  p_lat double precision, p_lng double precision, p_acc double precision, p_dist double precision, p_on_site boolean, p_by uuid, p_by_name text,
  p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare last public.time_clock; h numeric; rate numeric; row public.time_clock; te uuid; unpaid numeric := 0; lunch text := ''; v_at timestamptz;
begin
  if p_kind not in ('in','out') then raise exception 'bad kind'; end if;
  perform pg_advisory_xact_lock(hashtext('bp_clock:' || coalesce(p_emp.id::text, p_uid::text, '')));
  last := public.bp_clock_last(p_owner, p_emp.id, p_uid);
  v_at := least(now(), greatest(coalesce(p_at, now()), now() - interval '3 days', coalesce(last.at + interval '1 second', '-infinity'::timestamptz)));
  if p_kind = 'in' and last.kind = 'in' then return jsonb_build_object('ok', false, 'error', 'already clocked in', 'since', last.at); end if;
  if p_kind = 'out' and (last.id is null or last.kind <> 'in') then return jsonb_build_object('ok', false, 'error', 'not clocked in'); end if;
  if p_kind = 'out' then
    update public.time_breaks set ended_at = greatest(started_at, v_at) where clock_in_id = last.id and ended_at is null;
    select coalesce(sum(extract(epoch from (ended_at - started_at))), 0) into unpaid
      from public.time_breaks where clock_in_id = last.id and kind = 'lunch';
    h := round(greatest(0, extract(epoch from (v_at - last.at)) - unpaid) / 3600.0, 2);
    if unpaid >= 60 then lunch := ' · lunch ' || round(unpaid / 60) || ' min'; end if;
  end if;
  insert into public.time_clock(owner, user_id, employee_id, job_id, job_name, kind, at, lat, lng, accuracy_m, distance_m, on_site, hours,
                                clocked_by, clocked_by_name)
  values (p_owner, p_uid, p_emp.id, coalesce(case when p_kind='out' then last.job_id else p_job end,''),
          coalesce(case when p_kind='out' then last.job_name else p_job_name end,''), p_kind, v_at, p_lat, p_lng, p_acc, p_dist, p_on_site, h,
          p_by, nullif(trim(coalesce(p_by_name, '')), ''))
  returning * into row;
  if p_kind = 'out' and p_emp.id is not null and h > 0 then
    rate := case p_emp.pay_type when 'hourly' then coalesce(p_emp.rate,0) when 'day' then coalesce(p_emp.rate,0)/8 when 'salary' then coalesce(p_emp.rate,0)/2080 else 0 end
            * (1 + coalesce(p_emp.burden_pct,0)/100);
    insert into public.time_entries(owner, employee_id, job_id, job_name, worked_on, hours, ot_hours, note, cost,
                                    clock_in_id, clock_out_id, clocked_by, clocked_by_name, clocked_lat, clocked_lng, disputed_at, dispute_note)
    values (p_owner, p_emp.id, row.job_id, row.job_name, (last.at at time zone 'America/Los_Angeles')::date, least(h,8), greatest(h-8,0),
            'Clock-in ' || to_char(last.at at time zone 'America/Los_Angeles','HH12:MI AM') || ' to ' || to_char(v_at at time zone 'America/Los_Angeles','HH12:MI AM')
              || lunch
              || case when coalesce(last.on_site,false) then ' · on site' else ' · off site' end
              || case when p_at is not null and now() - v_at > interval '2 minutes' then ' · sent after no signal' else '' end,
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
revoke all on function public.bp_clock_punch_at(uuid, public.employees, uuid, text, text, text, double precision, double precision, double precision, double precision, boolean, uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.crew_clock_at(p_kind text, p_job text, p_job_name text, p_lat double precision, p_lng double precision,
  p_acc double precision, p_dist double precision, p_on_site boolean, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.employees;
begin
  if public.bp_is_sub() then return jsonb_build_object('ok', false, 'error', 'subcontractors do not clock in'); end if;
  if p_kind not in ('in','out') then raise exception 'bad kind'; end if;
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signed out'); end if;
  e := public.bp_my_employee();
  return public.bp_clock_punch_at(public.bp_owner(), e, auth.uid(), p_kind, p_job, p_job_name, p_lat, p_lng, p_acc, p_dist, p_on_site, null, null, p_at);
end $$;
revoke all on function public.crew_clock_at(text,text,text,double precision,double precision,double precision,double precision,boolean,timestamptz) from public, anon;
grant execute on function public.crew_clock_at(text,text,text,double precision,double precision,double precision,double precision,boolean,timestamptz) to authenticated;

create or replace function public.crew_break_at(p_action text, p_kind text, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.employees; o uuid := public.bp_owner(); last public.time_clock; b public.time_breaks; v_at timestamptz;
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
  v_at := least(now(), greatest(coalesce(p_at, now()), now() - interval '3 days', last.at, coalesce(b.started_at, '-infinity'::timestamptz)));
  if p_action = 'start' then
    if coalesce(p_kind, 'break') not in ('lunch', 'break') then return jsonb_build_object('ok', false, 'error', 'bad kind'); end if;
    if b.id is not null then return jsonb_build_object('ok', false, 'error', 'already on a break'); end if;
    insert into public.time_breaks(owner, employee_id, user_id, clock_in_id, kind, paid, started_at)
    values (o, e.id, auth.uid(), last.id, coalesce(p_kind, 'break'), coalesce(p_kind, 'break') = 'break', v_at);
  elsif p_action = 'end' then
    if b.id is null then return jsonb_build_object('ok', false, 'error', 'not on a break'); end if;
    update public.time_breaks set ended_at = v_at where id = b.id;
  end if;
  return public.bp_break_state(last.id) || jsonb_build_object('ok', true, 'on', true);
end $$;
revoke all on function public.crew_break_at(text, text, timestamptz) from public, anon;
grant execute on function public.crew_break_at(text, text, timestamptz) to authenticated;
