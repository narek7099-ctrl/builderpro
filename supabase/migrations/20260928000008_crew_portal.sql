-- Crew portal: what a crew login may see and do, enforced here rather than
-- only in the page. A crew member reads their crew's active projects with
-- the money taken out, adds photos/documents/blueprints to them, clocks in
-- and out with their location, and sees their own ID. Nothing else.

create or replace function public.bp_team_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select case when role = 'office' then 'office' else 'crew' end
                     from public.team_members where member = auth.uid() and accepted_at is not null limit 1), 'owner');
$$;
grant execute on function public.bp_team_role() to authenticated;

-- crew loses direct access to the money tables (projects JSON holds estimates and payments)
drop policy if exists portal_finance_team on public.portal_finance;
create policy portal_finance_team on public.portal_finance for all to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew')
  with check (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
drop policy if exists employees_own on public.employees;
create policy employees_own on public.employees for all to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew')
  with check (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
drop policy if exists time_entries_own on public.time_entries;
create policy time_entries_own on public.time_entries for all to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew')
  with check (owner = public.bp_owner() and public.bp_team_role() <> 'crew');

-- business settings: the whole team reads them, crew can't change them
drop policy if exists client_settings_team on public.client_settings;
drop policy if exists client_settings_read on public.client_settings;
drop policy if exists client_settings_write on public.client_settings;
create policy client_settings_read on public.client_settings for select to authenticated
  using (user_id = public.bp_owner());
create policy client_settings_write on public.client_settings for all to authenticated
  using (user_id = public.bp_owner() and public.bp_team_role() <> 'crew')
  with check (user_id = public.bp_owner() and public.bp_team_role() <> 'crew');

-- the clock
create table if not exists public.time_clock (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default public.bp_owner(),
  user_id     uuid not null default auth.uid(),
  employee_id uuid,
  job_id      text not null default '',
  job_name    text not null default '',
  kind        text not null check (kind in ('in','out')),
  at          timestamptz not null default now(),
  lat         double precision,
  lng         double precision,
  accuracy_m  double precision,
  distance_m  double precision,
  on_site     boolean,
  hours       numeric,
  created_at  timestamptz not null default now()
);
create index if not exists time_clock_owner_at on public.time_clock(owner, at desc);
alter table public.time_clock enable row level security;
drop policy if exists time_clock_read on public.time_clock;
create policy time_clock_read on public.time_clock for select to authenticated
  using (owner = public.bp_owner() and (public.bp_team_role() <> 'crew' or user_id = auth.uid()));
revoke all on public.time_clock from anon;
grant select on public.time_clock to authenticated;   -- writes go through crew_clock()

-- which employee record is this login? linked by email
create or replace function public.bp_my_employee() returns public.employees
language sql stable security definer set search_path = public as $$
  select e.* from public.employees e
   where e.owner = public.bp_owner()
     and lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   order by e.active desc limit 1;
$$;
revoke all on function public.bp_my_employee() from public, anon;

-- the crew the employee is in (crews live in client_settings.data.crews)
create or replace function public.bp_my_crew() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.employees; c jsonb;
begin
  e := public.bp_my_employee();
  if e.id is null then return null; end if;
  select x into c from public.client_settings cs, jsonb_array_elements(coalesce(cs.data->'crews','[]'::jsonb)) x
   where cs.user_id = public.bp_owner() and x->'members' ? e.id::text limit 1;
  return c;
end $$;
revoke all on function public.bp_my_crew() from public, anon;

-- the crew member's whole world in one call
create or replace function public.crew_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.employees; c jsonb; mates jsonb; biz jsonb; openc jsonb; jobs jsonb;
begin
  e := public.bp_my_employee();
  c := public.bp_my_crew();
  if c is not null then
    select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'trade', m.trade, 'phone', m.phone) order by m.name), '[]')
      into mates from public.employees m
     where m.owner = public.bp_owner() and m.active and (c->'members') ? m.id::text;
  end if;
  select jsonb_build_object('name', cs.data->'company'->>'name', 'logo', cs.data->'company'->>'logoUrl', 'phone', cs.data->'company'->>'phone')
    into biz from public.client_settings cs where cs.user_id = public.bp_owner();
  select to_jsonb(t) into openc from (select id, job_id, job_name, at, on_site from public.time_clock
     where user_id = auth.uid() order by at desc limit 1) t;
  if openc is not null and (select kind from public.time_clock where id = (openc->>'id')::uuid) <> 'in' then openc := null; end if;
  -- projects: this crew's active ones, with the money left out
  if c is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', j->>'id', 'name', j->>'name', 'title', j->>'title', 'addr', j->>'addr', 'phone', j->>'phone',
        'geo', j->'geo', 'sched', jsonb_build_object('dates', j->'sched'->'dates', 'slots', j->'sched'->'slots', 'time', j->'sched'->>'time', 'dur', j->'sched'->>'dur', 'notes', j->'sched'->>'notes'),
        'phases', j->'phases', 'photos', coalesce(j->'photos','[]'), 'docs', coalesce(j->'docs','[]'), 'blueprints', coalesce(j->'blueprints','[]'),
        'notes', j->>'notes')), '[]')
      into jobs from public.portal_finance pf, jsonb_array_elements(coalesce(pf.jobs,'[]')) j
     where pf.owner = public.bp_owner() and j->>'status' = 'active' and j->>'crew' = c->>'id';
  end if;
  return jsonb_build_object(
    'role', public.bp_team_role(),
    'employee', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'trade', e.trade, 'phone', e.phone, 'email', e.email, 'kind', e.kind, 'since', e.created_at) end,
    'crew', case when c is null then null else jsonb_build_object('id', c->>'id', 'name', c->>'name', 'color', c->>'color', 'members', coalesce(mates,'[]')) end,
    'business', biz, 'open', openc, 'projects', coalesce(jobs,'[]'));
end $$;
revoke all on function public.crew_me() from public, anon;
grant execute on function public.crew_me() to authenticated;

-- add a photo / document / blueprint to one of the crew's projects
create or replace function public.crew_add_file(p_job text, p_kind text, p_item jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare c jsonb; n int;
begin
  if p_kind not in ('photos','docs','blueprints') then return false; end if;
  c := public.bp_my_crew();
  if c is null then return false; end if;
  update public.portal_finance pf set jobs = (
    select jsonb_agg(case when j->>'id' = p_job and j->>'crew' = c->>'id'
                          then jsonb_set(j, array[p_kind], coalesce(j->p_kind,'[]') || jsonb_build_array(p_item))
                          else j end order by o)
      from jsonb_array_elements(pf.jobs) with ordinality x(j,o))
   where pf.owner = public.bp_owner()
     and exists (select 1 from jsonb_array_elements(pf.jobs) j where j->>'id' = p_job and j->>'crew' = c->>'id');
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.crew_add_file(text,text,jsonb) from public, anon;
grant execute on function public.crew_add_file(text,text,jsonb) to authenticated;

-- clock in / out. Clocking out also logs the hours on the Employees page.
create or replace function public.crew_clock(p_kind text, p_job text, p_job_name text, p_lat double precision, p_lng double precision, p_acc double precision, p_dist double precision, p_on_site boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.employees; last public.time_clock; h numeric; rate numeric; row public.time_clock;
begin
  if p_kind not in ('in','out') then raise exception 'bad kind'; end if;
  e := public.bp_my_employee();
  select * into last from public.time_clock where user_id = auth.uid() order by at desc limit 1;
  if p_kind = 'in' and last.kind = 'in' then return jsonb_build_object('ok', false, 'error', 'already clocked in'); end if;
  if p_kind = 'out' and (last.id is null or last.kind <> 'in') then return jsonb_build_object('ok', false, 'error', 'not clocked in'); end if;
  if p_kind = 'out' then h := round(extract(epoch from (now() - last.at)) / 3600.0, 2); end if;
  insert into public.time_clock(owner, user_id, employee_id, job_id, job_name, kind, lat, lng, accuracy_m, distance_m, on_site, hours)
  values (public.bp_owner(), auth.uid(), e.id, coalesce(case when p_kind='out' then last.job_id else p_job end,''),
          coalesce(case when p_kind='out' then last.job_name else p_job_name end,''), p_kind, p_lat, p_lng, p_acc, p_dist, p_on_site, h)
  returning * into row;
  if p_kind = 'out' and e.id is not null and h > 0 then
    rate := case e.pay_type when 'hourly' then coalesce(e.rate,0) when 'day' then coalesce(e.rate,0)/8 when 'salary' then coalesce(e.rate,0)/2080 else 0 end
            * (1 + coalesce(e.burden_pct,0)/100);
    insert into public.time_entries(owner, employee_id, job_id, job_name, worked_on, hours, ot_hours, note, cost)
    values (public.bp_owner(), e.id, row.job_id, row.job_name, (last.at at time zone 'America/Los_Angeles')::date, least(h,8), greatest(h-8,0),
            'Clock-in ' || to_char(last.at at time zone 'America/Los_Angeles','HH12:MI AM') || ' to ' || to_char(now() at time zone 'America/Los_Angeles','HH12:MI AM')
              || case when coalesce(last.on_site,false) then ' · on site' else ' · off site' end,
            round(rate * least(h,8) + rate * 1.5 * greatest(h-8,0), 2));
  end if;
  return jsonb_build_object('ok', true, 'id', row.id, 'at', row.at, 'hours', h);
end $$;
revoke all on function public.crew_clock(text,text,text,double precision,double precision,double precision,double precision,boolean) from public, anon;
grant execute on function public.crew_clock(text,text,text,double precision,double precision,double precision,double precision,boolean) to authenticated;
