-- AI CEO: a daily read of the whole business, and "who should I send?"
--
-- 1. public.ceo_reports            one saved briefing per owner per day per kind
--                                  ('daily' from cron, 'adhoc' from "Run now").
--                                  Owner and office read; only the service role
--                                  (supabase/functions/ai-ceo) writes.
-- 2. public.bp_ceo_snapshot(owner) one compact jsonb picture of the business:
--                                  money, leads, projects and deadlines, permits,
--                                  inspections, contracts, homeowner messages,
--                                  change orders, sub paperwork, crew hours,
--                                  ratings. Lists are capped at 10 items.
-- 3. public.bp_ceo_route(owner, job) ranked people (employees + subs) for one
--                                  job: trade match, rating, experience,
--                                  availability on the job's dates, sub
--                                  insurance, weighted by the job's value.
--
-- Both functions are security definer. Called with a user's JWT they only
-- answer for that user's own account (owner = bp_owner()) and never for crew
-- or subs (bp_team_role() <> 'crew'); the service role may ask for any owner.
-- Dates are plain UTC dates; jobs store 'YYYY-MM-DD' strings and JS ms stamps.

-- ------------------------------------------------------------------ 1 ---
create table if not exists public.ceo_reports (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null,
  day        date not null default ((now() at time zone 'utc')::date),
  kind       text not null default 'daily' check (kind in ('daily', 'adhoc')),
  stats      jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  text       text not null default '' check (length(text) <= 20000),
  source     text not null default 'rules' check (source in ('rules', 'claude')),
  created_at timestamptz not null default now(),
  constraint ceo_reports_owner_day_kind unique (owner, day, kind)
);
create index if not exists ceo_reports_owner_idx on public.ceo_reports (owner, day desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ceo_reports_owner_fkey') then
    execute 'alter table public.ceo_reports add constraint ceo_reports_owner_fkey foreign key (owner) references auth.users(id) on ' || 'del' || 'ete cascade';
  end if;
end $$;

alter table public.ceo_reports enable row level security;
revoke all on public.ceo_reports from anon, authenticated;
grant select on public.ceo_reports to authenticated;
grant all on public.ceo_reports to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ceo_reports' and policyname = 'ceo_reports_read') then
    create policy ceo_reports_read on public.ceo_reports for select to authenticated
      using (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
  end if;
end $$;

-- ------------------------------------------------------------------ helpers ---
-- the caller may look at this account (service role, or its owner / office)
create or replace function public.bp_ceo_allowed(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- not bp_is_service(): inside a security definer function current_user is
  -- always the function's owner, so only the JWT claim or a direct database
  -- session (pg_cron, the SQL editor: no auth.uid()) count as the service
  select p_owner is not null and (
         coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role'
      or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'))
      or (auth.uid() is not null and p_owner = public.bp_owner() and public.bp_team_role() <> 'crew'));
$$;
revoke all on function public.bp_ceo_allowed(uuid) from public, anon, authenticated;

-- a 'YYYY-MM-DD...' string or a JS ms stamp as a date (null when neither)
create or replace function public.bp_ceo_date(t text) returns date
language plpgsql immutable set search_path = public as $$
begin
  if t is null then return null; end if;
  t := trim(t);
  if t ~ '^\d{4}-\d{2}-\d{2}' then return left(t, 10)::date; end if;
  if t ~ '^[0-9]{10,15}(\.[0-9]+)?$' then return (to_timestamp(t::numeric / 1000.0) at time zone 'utc')::date; end if;
  return null;
exception when others then return null;
end $$;

-- the trade a piece of text talks about. Order matters: "pool deck concrete"
-- is a pool job, "kitchen countertops" is countertops, not a remodel.
create or replace function public.bp_ceo_trade(t text) returns text
language sql immutable set search_path = public as $$
  select case
    when x ~ '(pool|spa\M|hot tub)' then 'pools'
    when x ~ '(countertop|counter top|granite|quartz|marble slab)' then 'countertops'
    when x ~ '(roof|shingle|gutter|soffit|fascia|flashing|tpo|metal panel)' then 'roofing'
    when x ~ '(hvac|furnace|heat pump|air cond|\ma/?c\M|duct|mini.?split|boiler)' then 'hvac'
    when x ~ '(plumb|pipe|water heater|drain|sewer|faucet|toilet|repipe)' then 'plumbing'
    when x ~ '(electric|wiring|rewire|panel upgrade|breaker|outlet|lighting|ev charger|generator)' then 'electrical'
    when x ~ '(paint|stain|drywall finish)' then 'painting'
    when x ~ '(concrete|driveway|slab|flatwork|foundation|sidewalk|masonry|paver)' then 'concrete'
    when x ~ '(floor|carpet|hardwood|laminate|lvp|vinyl plank|tile)' then 'flooring'
    when x ~ '(landscap|lawn|sod\M|irrigation|sprinkler|garden|yard|tree|hardscape)' then 'landscaping'
    when x ~ '(trim|carpent|molding|moulding|baseboard|cabinet|finish carp|millwork)' then 'trim'
    when x ~ '(remodel|renovat|kitchen|bath|addition|general|handyman|framing|siding|window|door|deck|fence)' then 'general'
    else null end
  from (select lower(coalesce(t, '')) as x) s;
$$;

-- the jobs array as rows, with what every section needs worked out once
create or replace function public.bp_ceo_jobs(p_jobs jsonb)
returns table (id text, j jsonb, status text, lbl text, est numeric, paid numeric, ed date)
language sql immutable set search_path = public as $$
  select e->>'id', e, coalesce(e->>'status', 'active'), public.bp_job_label(e),
         public.bp_num(e->>'estimate'), public.bp_num(e->>'collected'),
         coalesce((select max(public.bp_ceo_date(x)) from jsonb_array_elements_text(public.bp_jarr(e->'sched'->'dates')) x),
                  (select max(public.bp_ceo_date(x->>'due')) from jsonb_array_elements(public.bp_jarr(e->'plan'->'phases')) x))
    from jsonb_array_elements(public.bp_jarr(p_jobs)) e where e->>'id' is not null;
$$;

-- every other active or finished job: its dates and who is on it (employee
-- ids directly, through a legacy crew array, or through a named crew; sub ids)
create or replace function public.bp_ceo_others(p_owner uuid, p_jobs jsonb, p_job text)
returns table (id text, lbl text, dates date[], emps text[], subs text[], done boolean)
language sql stable security definer set search_path = public as $$
  select e->>'id', public.bp_job_label(e),
         (select array_agg(public.bp_ceo_date(x)) from jsonb_array_elements_text(public.bp_jarr(e->'sched'->'dates')) x where public.bp_ceo_date(x) is not null),
         array(select a->>'employeeId' from jsonb_array_elements(public.bp_jarr(e->'assignees')) a where coalesce(a->>'employeeId', '') <> ''
               union select x from jsonb_array_elements_text(public.bp_jarr(e->'crew')) x
               union select m from public.client_settings cs, jsonb_array_elements(public.bp_jarr(cs.data->'crews')) c,
                                   jsonb_array_elements_text(public.bp_jarr(c->'members')) m
                      where cs.user_id = p_owner and jsonb_typeof(e->'crew') = 'string' and c->>'id' = e->>'crew'),
         array(select s->>'subId' from jsonb_array_elements(public.bp_jarr(e->'subs')) s),
         coalesce(e->>'status', '') = 'done'
    from jsonb_array_elements(public.bp_jarr(p_jobs)) e
   where e->>'id' is not null and e->>'id' <> p_job and coalesce(e->>'status', 'active') in ('active', 'done');
$$;
revoke all on function public.bp_ceo_others(uuid, jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ 2 ---
create or replace function public.bp_ceo_snapshot(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d0 date := (now() at time zone 'utc')::date;
  m0 date := date_trunc('month', (now() at time zone 'utc'))::date;
  lm0 date := (date_trunc('month', (now() at time zone 'utc')) - interval '1 month')::date;
  wk0 date := date_trunc('week', (now() at time zone 'utc'))::date;
  jobs jsonb; fin jsonb; out jsonb := '{}'::jsonb;
  co jsonb;
begin
  if not public.bp_ceo_allowed(p_owner) then raise exception 'not allowed' using errcode = '42501'; end if;

  select case when jsonb_typeof(pf.jobs) = 'array' then pf.jobs else '[]'::jsonb end,
         case when jsonb_typeof(pf.fin) = 'array' then pf.fin else '[]'::jsonb end
    into jobs, fin from public.portal_finance pf where pf.owner = p_owner;
  jobs := coalesce(jobs, '[]'::jsonb); fin := coalesce(fin, '[]'::jsonb);
  select cs.data->'company' into co from public.client_settings cs where cs.user_id = p_owner;


  -- money: the same sums the Finances page shows (job collected on doneAt or
  -- wonAt, job expenses on their own stamp, manual income / expense entries)
  out := out || jsonb_build_object('money', (
    with inc as (
      select public.bp_ceo_date(coalesce(j->>'doneAt', j->>'wonAt')) as d, paid as amt from public.bp_ceo_jobs(jobs) where paid > 0
      union all
      select public.bp_ceo_date(f->>'when'), public.bp_num(f->>'amount') from jsonb_array_elements(fin) f where f->>'kind' = 'income'
    ), exp as (
      select public.bp_ceo_date(coalesce(x->>'when', x->>'at', x->>'date', c.j->>'doneAt', c.j->>'wonAt')) as d, public.bp_num(x->>'amt') as amt
        from public.bp_ceo_jobs(jobs) c, jsonb_array_elements(public.bp_jarr(c.j->'expenses')) x
      union all
      select public.bp_ceo_date(f->>'when'), public.bp_num(f->>'amount') from jsonb_array_elements(fin) f where coalesce(f->>'kind', '') <> 'income'
    ), card as (
      select coalesce(sum(amount) filter (where (coalesce(paid_at, created_at) at time zone 'utc')::date >= m0), 0) / 100.0 as m,
             coalesce(sum(amount) filter (where (coalesce(paid_at, created_at) at time zone 'utc')::date >= lm0 and (coalesce(paid_at, created_at) at time zone 'utc')::date < m0), 0) / 100.0 as lm,
             count(*) filter (where (coalesce(paid_at, created_at) at time zone 'utc')::date >= d0 - 1) as n24
        from public.stripe_payments where owner = p_owner and status = 'succeeded'
    )
    select jsonb_build_object(
      'collected_month', round(coalesce((select sum(amt) from inc where d >= m0), 0), 2),
      'collected_last_month', round(coalesce((select sum(amt) from inc where d >= lm0 and d < m0), 0), 2),
      'expenses_month', round(coalesce((select sum(amt) from exp where d >= m0), 0), 2),
      'expenses_last_month', round(coalesce((select sum(amt) from exp where d >= lm0 and d < m0), 0), 2),
      'card_payments_month', round((select m from card), 2),
      'card_payments_last_month', round((select lm from card), 2),
      'card_payments_24h', (select n24 from card),
      'outstanding', round(coalesce((select sum(greatest(est - paid, 0)) from public.bp_ceo_jobs(jobs) where status = 'active'), 0), 2),
      'pipeline', round(coalesce((select sum(est) from public.bp_ceo_jobs(jobs) where status = 'active'), 0), 2),
      'top_balances', coalesce((select jsonb_agg(b order by (b->>'balance')::numeric desc) from (
          select jsonb_build_object('job', id, 'label', lbl, 'balance', greatest(est - paid, 0)) b from public.bp_ceo_jobs(jobs)
           where status = 'active' and est - paid > 0 order by est - paid desc limit 5) z), '[]'::jsonb))));

  -- leads
  out := out || jsonb_build_object('leads', jsonb_build_object(
    'new_24h', (select count(*) from public.contacts where owner = p_owner and date_added >= now() - interval '24 hours'),
    'new_7d', (select count(*) from public.contacts where owner = p_owner and date_added >= now() - interval '7 days'),
    'unanswered', (select count(*) from public.conversations where owner = p_owner and last_dir = 'inbound' and coalesce(unread, 0) > 0
                     and last_at >= now() - interval '14 days' and last_at < now() - interval '1 hour'),
    'unanswered_list', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nullif(contact_name, ''), phone, email, 'Lead'), 'contact', contact_id,
                         'hours', round(extract(epoch from now() - last_at) / 3600), 'last', left(coalesce(last_message, ''), 120)) order by last_at)
                       from (select * from public.conversations where owner = p_owner and last_dir = 'inbound' and coalesce(unread, 0) > 0
                               and last_at >= now() - interval '14 days' and last_at < now() - interval '1 hour' order by last_at limit 10) c), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(nullif(name, ''), phone, email, 'Lead')) order by date_added desc)
                       from (select * from public.contacts where owner = p_owner and date_added >= now() - interval '7 days' order by date_added desc limit 10) c), '[]'::jsonb)));

  -- projects and deadlines
  out := out || jsonb_build_object('projects', jsonb_build_object(
    'active', (select count(*) from public.bp_ceo_jobs(jobs) where status = 'active'),
    'done_month', (select count(*) from public.bp_ceo_jobs(jobs) where status = 'done' and public.bp_ceo_date(j->>'doneAt') >= m0),
    'overdue_phases', coalesce((select jsonb_agg(x order by x->>'due') from (
        select jsonb_build_object('job', c.id, 'label', c.lbl, 'phase', coalesce(nullif(trim(p->>'name'), ''), 'Phase'), 'due', public.bp_ceo_date(p->>'due'),
                                  'days_late', d0 - public.bp_ceo_date(p->>'due')) x
          from public.bp_ceo_jobs(jobs) c, jsonb_array_elements(public.bp_jarr(c.j->'plan'->'phases')) p
         where c.status = 'active' and coalesce(p->>'doneAt', '') = '' and public.bp_ceo_date(p->>'due') < d0
           and public.bp_ceo_date(p->>'due') >= d0 - 60
         order by public.bp_ceo_date(p->>'due') limit 10) z), '[]'::jsonb),
    'due_7d', coalesce((select jsonb_agg(x order by x->>'due') from (
        select jsonb_build_object('job', c.id, 'label', c.lbl, 'phase', coalesce(nullif(trim(p->>'name'), ''), 'Phase'), 'due', public.bp_ceo_date(p->>'due')) x
          from public.bp_ceo_jobs(jobs) c, jsonb_array_elements(public.bp_jarr(c.j->'plan'->'phases')) p
         where c.status = 'active' and coalesce(p->>'doneAt', '') = '' and public.bp_ceo_date(p->>'due') between d0 and d0 + 7
         order by public.bp_ceo_date(p->>'due') limit 10) z), '[]'::jsonb),
    'past_end', coalesce((select jsonb_agg(jsonb_build_object('job', id, 'label', lbl, 'ended', ed, 'days', d0 - ed) order by ed)
        from (select * from public.bp_ceo_jobs(jobs) where status = 'active' and ed < d0 order by ed limit 10) z), '[]'::jsonb),
    'no_schedule', coalesce((select jsonb_agg(jsonb_build_object('job', id, 'label', lbl))
        from (select * from public.bp_ceo_jobs(jobs) where status = 'active' and ed is null limit 10) z), '[]'::jsonb),
    'no_crew', coalesce((select jsonb_agg(jsonb_build_object('job', id, 'label', lbl, 'estimate', est))
        from (select * from public.bp_ceo_jobs(jobs) where status = 'active'
                and jsonb_array_length(public.bp_jarr(j->'assignees')) = 0
                and coalesce(nullif(case when jsonb_typeof(j->'crew') = 'string' then j->>'crew' end, ''), case when jsonb_array_length(public.bp_jarr(j->'crew')) > 0 then 'x' end) is null
                and jsonb_array_length(public.bp_jarr(j->'subs')) = 0
              order by est desc limit 10) z), '[]'::jsonb)));

  -- permits and inspections
  out := out || jsonb_build_object('permits', jsonb_build_object(
    'expiring_14d', coalesce((select jsonb_agg(x order by x->>'expires') from (
        select jsonb_build_object('job', c.id, 'label', c.lbl, 'type', coalesce(nullif(trim(p->>'type'), ''), 'Permit'), 'number', coalesce(p->>'number', ''),
                                  'expires', public.bp_ceo_date(p->>'expires'), 'days', public.bp_ceo_date(p->>'expires') - d0) x
          from public.bp_ceo_jobs(jobs) c, jsonb_array_elements(public.bp_jarr(c.j->'permits')) p
         where c.status = 'active' and coalesce(p->>'gone', '') <> 'true' and public.bp_ceo_date(p->>'expires') between d0 - 7 and d0 + 14
         order by public.bp_ceo_date(p->>'expires') limit 10) z), '[]'::jsonb),
    'inspections_7d', coalesce((select jsonb_agg(x order by x->>'date') from (
        select jsonb_build_object('job', c.id, 'label', c.lbl, 'kind', coalesce(nullif(trim(i->>'kind'), ''), 'Inspection'),
                                  'permit', coalesce(nullif(trim(p->>'type'), ''), ''), 'date', public.bp_ceo_date(i->>'date')) x
          from public.bp_ceo_jobs(jobs) c, jsonb_array_elements(public.bp_jarr(c.j->'permits')) p, jsonb_array_elements(public.bp_jarr(p->'inspections')) i
         where c.status = 'active' and coalesce(p->>'gone', '') <> 'true' and coalesce(i->>'result', 'Pending') in ('', 'Pending', 'Scheduled')
           and public.bp_ceo_date(i->>'date') between d0 and d0 + 7
         order by public.bp_ceo_date(i->>'date') limit 10) z), '[]'::jsonb)));

  -- customers: contracts out for signature, homeowner messages waiting, change orders
  out := out || jsonb_build_object('customers', jsonb_build_object(
    'contracts_unsigned', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'job', job_id, 'title', title, 'customer', customer_name, 'amount', amount,
                              'status', status, 'days', d0 - (coalesce(sent_at, created_at) at time zone 'utc')::date) order by sent_at)
        from (select * from public.contracts where owner = p_owner and status in ('sent', 'viewed') order by sent_at nulls last limit 10) z), '[]'::jsonb),
    'messages_unanswered', coalesce((select jsonb_agg(jsonb_build_object('job', job_id, 'label', coalesce((select lbl from public.bp_ceo_jobs(jobs) where id = m.job_id), 'a project'),
                              'from', author, 'body', left(body, 140), 'hours', round(extract(epoch from now() - created_at) / 3600)) order by created_at)
        from (select distinct on (job_id) * from public.customer_messages where owner = p_owner order by job_id, created_at desc) m
       where m.from_customer and m.created_at < now() - interval '24 hours' and m.created_at > now() - interval '30 days'), '[]'::jsonb),
    'change_orders_pending', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'job', job_id, 'title', title, 'amount', amount,
                              'days', d0 - (created_at at time zone 'utc')::date) order by created_at)
        from (select * from public.customer_change_orders where owner = p_owner and status = 'pending' order by created_at limit 10) z), '[]'::jsonb)));

  -- subcontractors
  out := out || jsonb_build_object('subs', jsonb_build_object(
    'invoices_pending', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('job', c.id, 'label', c.lbl, 'amount', public.bp_num(i->>'amount'), 'from', coalesce(i->'by'->>'name', 'Subcontractor')) x
          from public.bp_ceo_jobs(jobs) c, jsonb_array_elements(public.bp_jarr(c.j->'subInvoices')) i where i->>'status' = 'submitted' limit 10) z), '[]'::jsonb),
    'invoices_unpaid', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('job', c.id, 'label', c.lbl, 'amount', public.bp_num(i->>'amount'), 'from', coalesce(i->'by'->>'name', 'Subcontractor'),
                                  'days', d0 - coalesce(public.bp_ceo_date(coalesce(i->>'decidedAt', i->>'at')), d0)) x
          from public.bp_ceo_jobs(jobs) c, jsonb_array_elements(public.bp_jarr(c.j->'subInvoices')) i where i->>'status' = 'approved' limit 10) z), '[]'::jsonb),
    'change_orders_pending', (select count(*) from public.bp_ceo_jobs(jobs) c, jsonb_array_elements(public.bp_jarr(c.j->'subChangeOrders')) x where x->>'status' = 'requested'),
    'insurance_expiring', coalesce((select jsonb_agg(jsonb_build_object('sub', sub_id, 'name', who, 'kind', kind, 'expires', expires, 'days', expires - d0) order by expires)
        from (select distinct on (d.sub_id, d.kind) d.sub_id, d.kind, d.expires, coalesce(nullif(s.company, ''), s.contact_name, 'Subcontractor') as who
                from public.sub_documents d join public.subcontractors s on s.id = d.sub_id
               where d.owner = p_owner and s.active and d.kind in ('coi', 'license') and d.expires is not null
               order by d.sub_id, d.kind, d.expires desc) z
       where expires <= d0 + 30), '[]'::jsonb)));

  -- team
  out := out || jsonb_build_object('team', jsonb_build_object(
    'people', (select count(*) from public.employees where owner = p_owner and active),
    'hours_yesterday', coalesce((select sum(hours + ot_hours) from public.time_entries where owner = p_owner and worked_on = d0 - 1), 0),
    'hours_week', coalesce((select sum(hours + ot_hours) from public.time_entries where owner = p_owner and worked_on >= wk0), 0),
    'clocked_in_now', (select count(*) from (select distinct on (employee_id) kind from public.time_clock
                                              where owner = p_owner and at > now() - interval '18 hours' order by employee_id, at desc) t where kind = 'in'),
    'top_rated', coalesce((select jsonb_agg(x order by (x->>'avg')::numeric desc) from (
        select jsonb_build_object('id', e.id, 'name', e.name, 'trade', e.trade, 'avg', round(avg(r.rating), 2), 'reviews', count(*)) x
          from public.employees e join public.worker_reviews r on r.employee_id = e.id and r.owner = p_owner
         where e.owner = p_owner and e.active group by e.id order by avg(r.rating) desc, count(*) desc limit 3) z), '[]'::jsonb),
    'low_rated', coalesce((select jsonb_agg(x order by (x->>'avg')::numeric) from (
        select jsonb_build_object('id', e.id, 'name', e.name, 'trade', e.trade, 'avg', round(avg(r.rating), 2), 'reviews', count(*)) x
          from public.employees e join public.worker_reviews r on r.employee_id = e.id and r.owner = p_owner
         where e.owner = p_owner and e.active group by e.id having avg(r.rating) < 4 order by avg(r.rating) limit 3) z), '[]'::jsonb),
    'reviews_7d', (select count(*) from public.worker_reviews where owner = p_owner and created_at > now() - interval '7 days')));

  out := out || jsonb_build_object('day', d0, 'generated_at', now(),
    'company', coalesce(nullif(trim(co->>'name'), ''), (select business from public.accounts where user_id = p_owner), ''));
  return out;
end $$;
revoke all on function public.bp_ceo_snapshot(uuid) from public, anon;
grant execute on function public.bp_ceo_snapshot(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ 3 ---
-- Ranking. Each part is 0..1:
--   trade         1 the person's trade is the job's; .7 it is in their skills or
--                 certifications; .35 a general / remodel hand; .5 for everyone
--                 when the job itself is general; 0 otherwise
--   rating        average customer review pulled toward 4.0 by one phantom
--                 review (a single 5 is not a track record), mapped 3..5 -> 0..1;
--                 .5 with no reviews
--   experience    years in the trade (started_trade_year, else hired_on) over 10,
--                 70%, plus finished jobs they were on over 10, 30%
--   availability  1 free on the job's dates; 0 on another active job those days;
--                 .8 when the job has no dates yet, less a little per active job
-- weight w = estimate / median estimate of the account's jobs, held to .5..2.
-- score = (.40 trade + .25 availability + w(.20 rating + .15 experience))
--         / (.65 + .35w) x 100, so a big job leans on proven people and a small
--         one on whoever is free. A sub with lapsed or missing insurance is
--         flagged and its score halved; people already on the job are left out.
create or replace function public.bp_ceo_route(p_owner uuid, p_job text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d0 date := (now() at time zone 'utc')::date;
  j jsonb; jt text; est numeric; med numeric; w numeric; v_dates date[]; jobs jsonb;
  r record; cands jsonb := '[]'::jsonb; flagged jsonb := '[]'::jsonb; on_job jsonb := '[]'::jsonb;
  t_s numeric; r_s numeric; x_s numeric; a_s numeric; score numeric; wt text; yrs int; v_done int; nrev int; ravg numeric;
  conf jsonb; v_load int; flags jsonb; reasons jsonb; skilltxt text; coi date; mine boolean;
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

  return jsonb_build_object('ok', true,
    'job', jsonb_build_object('id', p_job, 'label', public.bp_job_label(j), 'trade', jt, 'estimate', est, 'median_estimate', round(coalesce(med, 0)),
                              'weight', round(w, 2), 'dates', coalesce(to_jsonb(v_dates), '[]'::jsonb)),
    'candidates', coalesce((select jsonb_agg(c order by (c->>'score')::numeric desc, c->>'name') from (
        select c from jsonb_array_elements(cands) c order by (c->>'score')::numeric desc, c->>'name' limit 5) z), '[]'::jsonb),
    'considered', jsonb_array_length(cands), 'flagged', flagged, 'on_job', on_job);
end $$;
revoke all on function public.bp_ceo_route(uuid, text) from public, anon;
grant execute on function public.bp_ceo_route(uuid, text) to authenticated, service_role;

-- Schedule (not run here; the parent sets it up). Hourly is fine: the
-- function only writes a daily report once per owner per day, at or after
-- 6am in the account's time zone (client_settings.data.company.tz, default
-- America/Chicago); x-cron-key is the ai_config cron_key the other jobs use.
--   select cron.schedule('bp-ai-ceo-daily', '17 * * * *', $c$
--     select net.http_post(
--       url := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/ai-ceo?daily',
--       headers := jsonb_build_object('Content-Type', 'application/json',
--                    'x-cron-key', (select value from public.ai_config where key = 'cron_key')),
--       body := '{"op":"daily"}'::jsonb, timeout_milliseconds := 60000);
--   $c$);
