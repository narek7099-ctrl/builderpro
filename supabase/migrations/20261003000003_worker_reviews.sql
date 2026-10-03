-- Worker record: experience, jobs completed, and client reviews of the crew.
--
-- 1. employees gains the profile an owner (and the worker) cares about:
--      started_trade_year  the year they started in the trade (years of experience = now - this)
--      hired_on            when they started with this business (backfilled from created_at)
--      skills              short tags ("Shingle", "Flat roof", "Forklift")
--      certifications      free text ("OSHA 30, GAF Master Elite installer")
--      bio                 a line or two about them
--    The owner/office edit these directly (existing employees RLS). A crew
--    login edits only its own bio and skills through crew_set_profile().
--
-- 2. Jobs completed per worker are read from portal_finance.jobs: status
--    'done' and the worker was on it. When a job is marked done the portal
--    snapshots who worked it onto job.workers = [{employeeId, name}], so a
--    later crew change does not rewrite history. Jobs finished before this
--    change have no snapshot and fall back to assignees + the crew's members.
--    bp_job_worker_ids(owner, job) is that rule; bp_worker_stats() counts.
--
-- 3. review_requests: one per completed job. The token is the whole secret
--    of the public rating page (embed/rate.html?t=<token>); it is used once.
--    worker_reviews: one row per worker rated on that request (1-5 + an
--    optional comment). Both are written by the owner portal (requests) and
--    the worker-review edge function with the service role (reviews and
--    marking a request used). Anonymous users have no table access at all.
--
-- 4. crew_me(): a strict superset of 20261003000002_crew_view.sql. Adds to
--    employee: startedTradeYear, hiredOn, skills, certifications, bio; and at
--    the top level:
--      stats   {jobsDone, lastDone, rating, reviews, dist:[n5,n4,n3,n2,n1]}
--              (no job value: money stays with the owner)
--      reviews the 10 newest reviews about the caller: rating, comment,
--              customer (first name only), at.

-- ---------------------------------------------------------------- 1 ---
alter table public.employees add column if not exists started_trade_year int;
alter table public.employees add column if not exists hired_on date;
alter table public.employees add column if not exists skills text[] not null default '{}';
alter table public.employees add column if not exists certifications text;
alter table public.employees add column if not exists bio text;
alter table public.employees alter column hired_on set default current_date;
update public.employees set hired_on = created_at::date where hired_on is null;
do $$ begin
  alter table public.employees add constraint employees_started_trade_year_chk
    check (started_trade_year is null or started_trade_year between 1940 and 2100);
exception when duplicate_object then null; end $$;

create or replace function public.crew_set_profile(p_bio text, p_skills text[]) returns boolean
language plpgsql security definer set search_path = public as $$
declare e public.employees; sk text[];
begin
  e := public.bp_my_employee();
  if e.id is null then return false; end if;
  select coalesce(array_agg(distinct left(trim(s), 40)), '{}') into sk
    from unnest(coalesce(p_skills, '{}')) s where trim(s) <> '';
  if array_length(sk, 1) > 20 then sk := sk[1:20]; end if;
  update public.employees
     set bio = nullif(left(trim(coalesce(p_bio, '')), 600), ''), skills = sk
   where id = e.id and owner = public.bp_owner();
  return found;
end $$;
revoke all on function public.crew_set_profile(text, text[]) from public, anon;
grant execute on function public.crew_set_profile(text, text[]) to authenticated;

-- ---------------------------------------------------------------- 2 ---
-- who worked a job: the snapshot taken when it was marked done, else who is
-- on it now (assigned directly, or a member of its crew)
create or replace function public.bp_job_worker_ids(p_owner uuid, j jsonb) returns setof text
language sql stable security definer set search_path = public as $$
  select distinct id from (
    select w->>'employeeId' as id
      from jsonb_array_elements(case when jsonb_typeof(j->'workers') = 'array' then j->'workers' else '[]'::jsonb end) w
    union all
    select a->>'employeeId'
      from jsonb_array_elements(case when jsonb_typeof(j->'assignees') = 'array' then j->'assignees' else '[]'::jsonb end) a
     where not (jsonb_typeof(j->'workers') = 'array' and jsonb_array_length(j->'workers') > 0)
    union all
    select x from jsonb_array_elements_text(case when jsonb_typeof(j->'crew') = 'array' then j->'crew' else '[]'::jsonb end) x
     where not (jsonb_typeof(j->'workers') = 'array' and jsonb_array_length(j->'workers') > 0)
    union all
    select m from public.client_settings cs,
           jsonb_array_elements(coalesce(cs.data->'crews', '[]'::jsonb)) c,
           jsonb_array_elements_text(case when jsonb_typeof(c->'members') = 'array' then c->'members' else '[]'::jsonb end) m
     where cs.user_id = p_owner and jsonb_typeof(j->'crew') = 'string' and c->>'id' = j->>'crew'
       and not (jsonb_typeof(j->'workers') = 'array' and jsonb_array_length(j->'workers') > 0)
  ) t where id is not null and id <> '';
$$;
revoke all on function public.bp_job_worker_ids(uuid, jsonb) from public, anon, authenticated;

-- {jobsDone, lastDone (ms epoch, as the portal stores doneAt), value, rating, reviews, dist}
create or replace function public.bp_worker_stats(p_owner uuid, p_emp uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n int; v_last bigint; val numeric; v_avg numeric; cnt int; d jsonb;
begin
  select count(*), max(case when (j->>'doneAt') ~ '^\d+$' then (j->>'doneAt')::bigint end),
         coalesce(sum(case when (j->>'collected') ~ '^-?\d+(\.\d+)?$' then (j->>'collected')::numeric
                           when (j->>'estimate') ~ '^-?\d+(\.\d+)?$' then (j->>'estimate')::numeric else 0 end), 0)
    into n, v_last, val
    from public.portal_finance pf, jsonb_array_elements(coalesce(pf.jobs, '[]')) j
   where pf.owner = p_owner and j->>'status' = 'done'
     and p_emp::text in (select public.bp_job_worker_ids(p_owner, j));
  select round(avg(rating)::numeric, 2), count(*),
         jsonb_build_array(count(*) filter (where rating = 5), count(*) filter (where rating = 4), count(*) filter (where rating = 3),
                           count(*) filter (where rating = 2), count(*) filter (where rating = 1))
    into v_avg, cnt, d
    from public.worker_reviews where owner = p_owner and employee_id = p_emp;
  return jsonb_build_object('jobsDone', coalesce(n, 0), 'lastDone', v_last, 'value', val,
                            'rating', v_avg, 'reviews', coalesce(cnt, 0), 'dist', d);
end $$;

-- ---------------------------------------------------------------- 3 ---
create table if not exists public.review_requests (
  token          uuid primary key default gen_random_uuid(),
  owner          uuid not null default public.bp_owner() references auth.users(id) on delete cascade,
  job_id         text not null,
  job_title      text,
  workers        jsonb not null default '[]'::jsonb,   -- [{employeeId, name}]
  customer_name  text,
  created_at     timestamptz not null default now(),
  used_at        timestamptz,
  overall        smallint check (overall between 1 and 5),
  overall_comment text
);
create index if not exists review_requests_owner_job_idx on public.review_requests (owner, job_id);

create table if not exists public.worker_reviews (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default public.bp_owner() references auth.users(id) on delete cascade,
  job_id         text,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  rating         smallint not null check (rating between 1 and 5),
  comment        text check (comment is null or length(comment) <= 1000),
  customer_name  text,
  source         text not null default 'link',   -- 'link' (rate page) | 'manual' (owner typed it in)
  request_token  uuid references public.review_requests(token) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists worker_reviews_owner_emp_idx on public.worker_reviews (owner, employee_id, created_at desc);
create unique index if not exists worker_reviews_once_idx on public.worker_reviews (request_token, employee_id) where request_token is not null;

alter table public.review_requests enable row level security;
alter table public.worker_reviews enable row level security;
-- owner and office: their own rows. Crew: none (they read about themselves through crew_me()).
drop policy if exists review_requests_own on public.review_requests;
create policy review_requests_own on public.review_requests for all to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew')
  with check (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
drop policy if exists worker_reviews_own on public.worker_reviews;
create policy worker_reviews_own on public.worker_reviews for all to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew')
  with check (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
revoke all on public.review_requests from anon;
revoke all on public.worker_reviews from anon;

-- stats are only for the owner's own people (and inside crew_me for the caller)
revoke all on function public.bp_worker_stats(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4 ---
create or replace function public.crew_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.employees; c jsonb; mates jsonb; biz jsonb; openc jsonb; jobs jsonb; crews jsonb; stats jsonb; revs jsonb;
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
  -- my record: jobs completed and what customers said about me (no money)
  if e.id is not null then
    stats := public.bp_worker_stats(e.owner, e.id) - 'value';
    select coalesce(jsonb_agg(jsonb_build_object('rating', r.rating, 'comment', r.comment,
             'customer', nullif(split_part(trim(coalesce(r.customer_name, '')), ' ', 1), ''), 'at', r.created_at) order by r.created_at desc), '[]')
      into revs from (select * from public.worker_reviews where owner = e.owner and employee_id = e.id order by created_at desc limit 10) r;
  end if;
  return jsonb_build_object(
    'role', public.bp_team_role(),
    'employee', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'trade', e.trade, 'phone', e.phone, 'email', e.email,
                     'kind', e.kind, 'since', e.created_at, 'photo', e.photo_url, 'owner', e.owner,
                     'startedTradeYear', e.started_trade_year, 'hiredOn', coalesce(e.hired_on, e.created_at::date),
                     'skills', coalesce(to_jsonb(e.skills), '[]'::jsonb), 'certifications', e.certifications, 'bio', e.bio) end,
    'crew', case when c is null then null else jsonb_build_object('id', c->>'id', 'name', c->>'name', 'color', c->>'color', 'members', coalesce(mates,'[]')) end,
    'business', biz, 'open', openc, 'projects', coalesce(jobs,'[]'),
    'stats', stats, 'reviews', coalesce(revs, '[]'::jsonb));
end $$;
revoke all on function public.crew_me() from public, anon;
grant execute on function public.crew_me() to authenticated;
