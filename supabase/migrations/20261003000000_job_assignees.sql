-- Jobs can be assigned to individual people, not only to a crew.
--
-- A job (an element of portal_finance.jobs) now carries
--   crew      : one crew id (string, from client_settings.data.crews)  -- unchanged
--   assignees : [{"employeeId": uuid, "teamId": uuid|null, "name": text}]
-- Older jobs may hold a bare array of employee ids in "crew"; still honoured.
--
-- A crew login sees an active job when it is assigned to them directly, or
-- to ANY crew whose members include them (bp_my_crew() only returned one).
-- crew_me() and crew_add_file() share that rule through bp_crew_sees_job().
-- No table or RLS change: crew still cannot read portal_finance directly.

create or replace function public.bp_crew_sees_job(j jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare e public.employees; tm uuid;
begin
  e := public.bp_my_employee();
  select id into tm from public.team_members where member = auth.uid() and owner = public.bp_owner() limit 1;
  if e.id is null and tm is null then return false; end if;
  return
    -- directly assigned
    (e.id is not null and coalesce(j->'assignees','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('employeeId', e.id::text)))
    or (tm is not null and coalesce(j->'assignees','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('teamId', tm::text)))
    -- legacy: crew held an array of employee ids
    or (e.id is not null and jsonb_typeof(j->'crew') = 'array' and (j->'crew') ? e.id::text)
    -- through any crew they are a member of
    or (e.id is not null and jsonb_typeof(j->'crew') = 'string' and exists (
          select 1 from public.client_settings cs, jsonb_array_elements(coalesce(cs.data->'crews','[]'::jsonb)) c
           where cs.user_id = public.bp_owner() and c->>'id' = j->>'crew' and (c->'members') ? e.id::text));
end $$;
revoke all on function public.bp_crew_sees_job(jsonb) from public, anon;

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
  -- projects: active ones assigned to me or one of my crews, money left out
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', j->>'id', 'name', j->>'name', 'title', j->>'title', 'addr', j->>'addr', 'phone', j->>'phone',
      'geo', j->'geo', 'sched', jsonb_build_object('dates', j->'sched'->'dates', 'slots', j->'sched'->'slots', 'time', j->'sched'->>'time', 'dur', j->'sched'->>'dur', 'notes', j->'sched'->>'notes'),
      'phases', j->'phases', 'photos', coalesce(j->'photos','[]'), 'docs', coalesce(j->'docs','[]'), 'blueprints', coalesce(j->'blueprints','[]'),
      'notes', j->>'notes')), '[]')
    into jobs from public.portal_finance pf, jsonb_array_elements(coalesce(pf.jobs,'[]')) j
   where pf.owner = public.bp_owner() and j->>'status' = 'active' and public.bp_crew_sees_job(j);
  return jsonb_build_object(
    'role', public.bp_team_role(),
    'employee', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'trade', e.trade, 'phone', e.phone, 'email', e.email, 'kind', e.kind, 'since', e.created_at) end,
    'crew', case when c is null then null else jsonb_build_object('id', c->>'id', 'name', c->>'name', 'color', c->>'color', 'members', coalesce(mates,'[]')) end,
    'business', biz, 'open', openc, 'projects', coalesce(jobs,'[]'));
end $$;
revoke all on function public.crew_me() from public, anon;
grant execute on function public.crew_me() to authenticated;

create or replace function public.crew_add_file(p_job text, p_kind text, p_item jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_kind not in ('photos','docs','blueprints') then return false; end if;
  update public.portal_finance pf set jobs = (
    select jsonb_agg(case when j->>'id' = p_job and public.bp_crew_sees_job(j)
                          then jsonb_set(j, array[p_kind], coalesce(j->p_kind,'[]') || jsonb_build_array(p_item))
                          else j end order by o)
      from jsonb_array_elements(pf.jobs) with ordinality x(j,o))
   where pf.owner = public.bp_owner()
     and exists (select 1 from jsonb_array_elements(pf.jobs) j where j->>'id' = p_job and public.bp_crew_sees_job(j));
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.crew_add_file(text,text,jsonb) from public, anon;
grant execute on function public.crew_add_file(text,text,jsonb) to authenticated;
