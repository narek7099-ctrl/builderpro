-- Crew project view + crew profile photo.
--
-- 1. employees.photo_url: a profile picture. Holds a storage reference
--    "sb:<owner>/employees/<employeeId>/avatar.jpg#<version>" in the private
--    project-files bucket (the page signs it), or a plain https URL.
-- 2. crew_set_photo(url): a crew login sets (or clears, with null/'') the
--    photo on its OWN employee row only. Crew has no direct write on
--    employees (RLS), so this is the only way in. The owner/office keep
--    editing employees directly.
-- 3. crew_me(): a superset of 20261003000000_job_assignees.sql. Adds, per
--    project, everything a crew member needs to see the job read-only, with
--    money left out (no estimate, collected, expenses, budget, price, cost,
--    fee, feePaid, contract):
--      customer email, status, plan (phases with due / done), the crew on the
--      job with its members, the people assigned directly, materials items
--      (name, qty, unit, note, supplier), permits (type, number, office,
--      status, dates, inspections, notes).
--    Also adds photo to employee and to crew members.

alter table public.employees add column if not exists photo_url text;

create or replace function public.crew_set_photo(p_url text) returns boolean
language plpgsql security definer set search_path = public as $$
declare e public.employees; v text := nullif(trim(coalesce(p_url, '')), '');
begin
  e := public.bp_my_employee();
  if e.id is null then return false; end if;
  -- only a reference into this owner's own employee folder, or an https URL
  if v is not null and not (
       v like 'sb:' || public.bp_owner()::text || '/employees/' || e.id::text || '/%'
    or v like 'https://%') then
    return false;
  end if;
  if v is not null and length(v) > 2000 then return false; end if;
  update public.employees set photo_url = v where id = e.id and owner = public.bp_owner();
  return found;
end $$;
revoke all on function public.crew_set_photo(text) from public, anon;
grant execute on function public.crew_set_photo(text) to authenticated;

create or replace function public.crew_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.employees; c jsonb; mates jsonb; biz jsonb; openc jsonb; jobs jsonb; crews jsonb;
begin
  e := public.bp_my_employee();
  c := public.bp_my_crew();
  if c is not null then
    select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'trade', m.trade, 'phone', m.phone, 'photo', m.photo_url) order by m.name), '[]')
      into mates from public.employees m
     where m.owner = public.bp_owner() and m.active and (c->'members') ? m.id::text;
  end if;
  select jsonb_build_object('name', cs.data->'company'->>'name', 'logo', cs.data->'company'->>'logoUrl', 'phone', cs.data->'company'->>'phone'),
         coalesce(cs.data->'crews', '[]'::jsonb)
    into biz, crews from public.client_settings cs where cs.user_id = public.bp_owner();
  select to_jsonb(t) into openc from (select id, job_id, job_name, at, on_site from public.time_clock
     where user_id = auth.uid() order by at desc limit 1) t;
  if openc is not null and (select kind from public.time_clock where id = (openc->>'id')::uuid) <> 'in' then openc := null; end if;
  -- projects: active ones assigned to me or one of my crews, money left out
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', j->>'id', 'name', j->>'name', 'title', j->>'title', 'addr', j->>'addr', 'phone', j->>'phone',
      'email', j->>'email', 'status', j->>'status',
      'geo', j->'geo', 'sched', jsonb_build_object('dates', j->'sched'->'dates', 'slots', j->'sched'->'slots', 'time', j->'sched'->>'time',
                                                   'end', j->'sched'->>'end', 'dur', j->'sched'->>'dur', 'notes', j->'sched'->>'notes'),
      'phases', j->'phases',
      'plan', case when jsonb_typeof(j->'plan'->'phases') = 'array' then jsonb_build_object(
          'start', j->'plan'->>'start',
          'phases', (select coalesce(jsonb_agg(jsonb_build_object('name', ph->>'name', 'days', ph->'days', 'due', ph->>'due', 'doneAt', ph->>'doneAt') order by o), '[]')
                       from jsonb_array_elements(j->'plan'->'phases') with ordinality y(ph, o))) end,
      'photos', coalesce(j->'photos','[]'), 'docs', coalesce(j->'docs','[]'), 'blueprints', coalesce(j->'blueprints','[]'),
      'notes', j->>'notes',
      -- the crew on this job, with its members
      'crew', (select jsonb_build_object('id', cr->>'id', 'name', cr->>'name', 'color', cr->>'color',
                 'members', (select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'trade', m.trade, 'phone', m.phone, 'photo', m.photo_url) order by m.name), '[]')
                               from public.employees m where m.owner = public.bp_owner() and m.active and (cr->'members') ? m.id::text))
                 from jsonb_array_elements(crews) cr
                where jsonb_typeof(j->'crew') = 'string' and cr->>'id' = j->>'crew' limit 1),
      -- people put on the job directly
      'assignees', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(m.name, a->>'name'), 'trade', m.trade, 'phone', m.phone, 'photo', m.photo_url)), '[]')
                      from jsonb_array_elements(case when jsonb_typeof(j->'assignees') = 'array' then j->'assignees' else '[]'::jsonb end) a
                      left join public.employees m on m.owner = public.bp_owner() and m.id::text = a->>'employeeId'),
      -- materials: what and how many, never what it costs
      'materials', (select coalesce(jsonb_agg(jsonb_build_object('name', it->>'name', 'qty', it->'qty', 'unit', it->>'unit', 'note', it->>'note', 'supplier', it->>'supplier') order by o), '[]')
                      from jsonb_array_elements(case when jsonb_typeof(j->'materials'->'items') = 'array' then j->'materials'->'items' else '[]'::jsonb end) with ordinality y(it, o)),
      'materialsStatus', j->'materials'->>'status',
      -- permits: no fee
      'permits', (select coalesce(jsonb_agg(jsonb_build_object('type', p->>'type', 'number', p->>'number', 'office', p->>'office', 'status', p->>'status',
                     'applied', p->>'applied', 'approved', p->>'approved', 'expires', p->>'expires', 'notes', p->>'notes',
                     'inspections', coalesce(p->'inspections', '[]'::jsonb)) order by o), '[]')
                    from jsonb_array_elements(case when jsonb_typeof(j->'permits') = 'array' then j->'permits' else '[]'::jsonb end) with ordinality y(p, o)
                   where coalesce(p->>'gone', '') <> 'true')
      )), '[]')
    into jobs from public.portal_finance pf, jsonb_array_elements(coalesce(pf.jobs,'[]')) j
   where pf.owner = public.bp_owner() and j->>'status' = 'active' and public.bp_crew_sees_job(j);
  return jsonb_build_object(
    'role', public.bp_team_role(),
    'employee', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'trade', e.trade, 'phone', e.phone, 'email', e.email,
                     'kind', e.kind, 'since', e.created_at, 'photo', e.photo_url, 'owner', e.owner) end,
    'crew', case when c is null then null else jsonb_build_object('id', c->>'id', 'name', c->>'name', 'color', c->>'color', 'members', coalesce(mates,'[]')) end,
    'business', biz, 'open', openc, 'projects', coalesce(jobs,'[]'));
end $$;
revoke all on function public.crew_me() from public, anon;
grant execute on function public.crew_me() to authenticated;
