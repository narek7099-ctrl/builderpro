-- Subcontractor portal.
--
-- A subcontractor is a separate business the owner hires for part of a job
-- (gutters, electrical, insulation). They get their own login, like crew,
-- but see far less: only the jobs they are on, the job address and the
-- owner-chosen site contact (never the homeowner's name, phone or email),
-- their agreed scope and price, and their own invoices, change orders and
-- compliance papers. Never the owner's estimate, expenses, other subs or
-- crew pay.
--
-- 1. team_members.role gains 'sub'. bp_team_role() still answers 'crew' for
--    a sub (unchanged), so every existing "bp_team_role() <> 'crew'" rule
--    (portal_finance, employees, time_entries, reviews, settings writes)
--    already shuts subs out. bp_is_sub() is new.
-- 2. public.subcontractors and public.sub_documents (owner/office only).
--    worker_reviews takes employee_id OR sub_id, so the customer review
--    link can rate the subs on a job too.
-- 3. RESTRICTIVE "no sub" policies on every owner-scoped table that the
--    team policies (owner = bp_owner()) open to any accepted team member:
--    contacts, conversations, messages, contracts, client_settings ... A sub
--    reads nothing from those directly; sub_me() hands out what they may see.
--    Restrictive policies AND with the existing ones, so owner/office/crew
--    access is unchanged.
-- 4. Storage (project-files): a restrictive policy keeps a sub to
--      <owner>/subs/<subId>/...                 their own compliance papers
--      <owner>/<job>/subs/<subId>/...           their uploads to a job they are on
--      <owner>/<job>/{photos,docs,blueprints}/  read only, jobs they are on
-- 5. Job JSON (portal_finance.jobs[i]):
--      subs[]            {subId, name, trade, scope, price, startDate, endDate,
--                         siteContact{name, phone}, lienWaiver(bool, optional)}
--      subInvoices[]     {id, subId, amount, note, file, mime, status:
--                         'submitted'|'approved'|'paid'|'rejected', at, paidAt,
--                         by{uid,name,role:'sub'}, lienWaiver{required, file,
--                         signedName, signedAt}}
--      subInvoicesGone[] ids removed (tombstones)
--      subChangeOrders[] {id, subId, desc, amount, status:'requested'|'approved'
--                         |'rejected', at, by}
--      subChangeOrdersGone[]
--      expenses[]        approval of an invoice adds (in the owner page)
--                        {cat:'Subcontractor', amt, note, key:'subinv:<id>', ...}
--    bp_jobs_keep_subs() runs after bp_jobs_keep_crew() in the save trigger:
--    a stale owner save cannot drop a sub's invoice / change order / signed
--    waiver, nor undo a decision already saved. Unchanged data is returned
--    as is.
-- 6. Sub RPCs (security definer, caller must be an accepted 'sub' and the
--    job must list them in job.subs): sub_me, sub_invoice_add/remove,
--    sub_change_order_add/remove, sub_waiver_sign, sub_add_file,
--    sub_doc_add/remove, sub_set_profile.
-- 7. bp_crew_sees_job() says no to a sub, so the crew RPCs give them nothing.

-- ---------------------------------------------------------------- 1 ---
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('office','crew','sub'));

create or replace function public.bp_is_sub() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members
                  where member = auth.uid() and accepted_at is not null and role = 'sub');
$$;
revoke all on function public.bp_is_sub() from public, anon;
grant execute on function public.bp_is_sub() to authenticated, service_role;

-- ---------------------------------------------------------------- 2 ---
create table if not exists public.subcontractors (
  id                   uuid primary key default gen_random_uuid(),
  owner                uuid not null default public.bp_owner() references auth.users(id) on delete cascade,
  company              text not null default '' check (length(company) <= 120),
  contact_name         text not null default '' check (length(contact_name) <= 120),
  email                text not null default '' check (length(email) <= 200),
  phone                text not null default '' check (length(phone) <= 40),
  trade                text not null default '' check (length(trade) <= 60),
  team_id              uuid references public.team_members(id) on delete set null,
  notes                text not null default '' check (length(notes) <= 4000),
  lien_waiver_required boolean not null default false,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);
create index if not exists subcontractors_owner_idx on public.subcontractors (owner, active, company);
create index if not exists subcontractors_team_idx on public.subcontractors (team_id) where team_id is not null;

create table if not exists public.sub_documents (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default public.bp_owner() references auth.users(id) on delete cascade,
  sub_id     uuid not null references public.subcontractors(id) on delete cascade,
  kind       text not null check (kind in ('coi','license','w9','other')),
  number     text not null default '' check (length(number) <= 80),
  expires    date,
  file       text not null default '' check (length(file) <= 400),
  name       text not null default '' check (length(name) <= 160),
  added_by   text not null default 'owner' check (added_by in ('owner','sub')),
  created_at timestamptz not null default now()
);
create index if not exists sub_documents_sub_idx on public.sub_documents (owner, sub_id, kind, expires);

alter table public.subcontractors enable row level security;
alter table public.sub_documents enable row level security;
-- owner and office; crew and subs read nothing here (a sub uses sub_me())
drop policy if exists subcontractors_own on public.subcontractors;
create policy subcontractors_own on public.subcontractors for all to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew')
  with check (owner = public.bp_owner() and public.bp_team_role() <> 'crew');
drop policy if exists sub_documents_own on public.sub_documents;
create policy sub_documents_own on public.sub_documents for all to authenticated
  using (owner = public.bp_owner() and public.bp_team_role() <> 'crew')
  with check (owner = public.bp_owner() and public.bp_team_role() <> 'crew'
              and exists (select 1 from public.subcontractors s where s.id = sub_id and s.owner = public.bp_owner()));
revoke all on public.subcontractors, public.sub_documents from anon;
grant select, insert, update, delete on public.subcontractors, public.sub_documents to authenticated;

-- reviews: one row rates an employee or a sub
alter table public.worker_reviews alter column employee_id drop not null;
alter table public.worker_reviews add column if not exists sub_id uuid references public.subcontractors(id) on delete cascade;
do $$ begin
  alter table public.worker_reviews add constraint worker_reviews_who_chk check (num_nonnulls(employee_id, sub_id) = 1);
exception when duplicate_object then null; end $$;
create index if not exists worker_reviews_owner_sub_idx on public.worker_reviews (owner, sub_id, created_at desc) where sub_id is not null;
create unique index if not exists worker_reviews_once_sub_idx on public.worker_reviews (request_token, sub_id) where request_token is not null and sub_id is not null;

-- ---------------------------------------------------------------- 3 ---
-- every table a team member reaches through owner = bp_owner(): a sub doesn't
do $$
declare t text;
begin
  for t in
    select distinct p.tablename from pg_policies p
     where p.schemaname = 'public'
       and (coalesce(p.qual, '') like '%bp_owner%' or coalesce(p.with_check, '') like '%bp_owner%')
       and p.tablename not in ('team_members','team_threads','team_thread_members','team_messages','subcontractors','sub_documents')
  loop
    execute format('drop policy if exists %I on public.%I', t || '_no_sub', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (not public.bp_is_sub()) with check (not public.bp_is_sub())', t || '_no_sub', t);
  end loop;
end $$;

-- a sub is never crew, whatever the job's assignees say
create or replace function public.bp_crew_sees_job(j jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare e public.employees; tm uuid;
begin
  if public.bp_is_sub() then return false; end if;
  e := public.bp_my_employee();
  select id into tm from public.team_members where member = auth.uid() and owner = public.bp_owner() limit 1;
  if e.id is null and tm is null then return false; end if;
  return
    (e.id is not null and coalesce(j->'assignees','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('employeeId', e.id::text)))
    or (tm is not null and coalesce(j->'assignees','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('teamId', tm::text)))
    or (e.id is not null and jsonb_typeof(j->'crew') = 'array' and (j->'crew') ? e.id::text)
    or (e.id is not null and jsonb_typeof(j->'crew') = 'string' and exists (
          select 1 from public.client_settings cs, jsonb_array_elements(coalesce(cs.data->'crews','[]'::jsonb)) c
           where cs.user_id = public.bp_owner() and c->>'id' = j->>'crew' and (c->'members') ? e.id::text));
end $$;
revoke all on function public.bp_crew_sees_job(jsonb) from public, anon;

-- ---------------------------------------------------------------- helpers ---
-- the subcontractor record behind this login (linked by team row, else by email)
create or replace function public.bp_my_sub() returns public.subcontractors
language sql stable security definer set search_path = public as $$
  select s.* from public.team_members tm
    join public.subcontractors s on s.owner = tm.owner
         and (s.team_id = tm.id or (s.team_id is null and lower(s.email) = lower(tm.email) and s.email <> ''))
   where tm.member = auth.uid() and tm.accepted_at is not null and tm.role = 'sub'
   order by (s.team_id = tm.id) desc nulls last, s.active desc, s.created_at
   limit 1;
$$;
revoke all on function public.bp_my_sub() from public, anon, authenticated;

create or replace function public.bp_num(x text) returns numeric
language sql immutable set search_path = public as $$
  select case when trim(coalesce(x, '')) ~ '^-?[0-9]{1,9}(\.[0-9]+)?$' then trim(x)::numeric else 0 end;
$$;

-- the caller's job p_job, when they are a sub on it (null otherwise)
create or replace function public.bp_sub_job(p_job text) returns jsonb
language sql stable security definer set search_path = public as $$
  select j from public.portal_finance pf, jsonb_array_elements(coalesce(pf.jobs, '[]'::jsonb)) j
   where pf.owner = public.bp_owner() and public.bp_is_sub()
     and j->>'id' = p_job
     and exists (select 1 from jsonb_array_elements(public.bp_jarr(j->'subs')) e
                  where e->>'subId' = (public.bp_my_sub()).id::text)
   limit 1;
$$;
revoke all on function public.bp_sub_job(text) from public, anon, authenticated;

create or replace function public.bp_sub_actor() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('uid', auth.uid()::text,
    'name', coalesce(nullif(trim(s.company), ''), nullif(trim(s.contact_name), ''), 'Subcontractor'),
    'role', 'sub', 'subId', s.id::text)
    from (select (public.bp_my_sub()).*) s;
$$;
revoke all on function public.bp_sub_actor() from public, anon, authenticated;

create or replace function public.bp_now_ms() returns bigint
language sql volatile set search_path = public as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint; $$;

-- may a sub touch this storage path? (p_write: upload / replace / delete)
create or replace function public.bp_sub_path_ok(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f text[]; sid text;
begin
  sid := (public.bp_my_sub()).id::text;
  if sid is null or p_name like '%..%' then return false; end if;
  f := string_to_array(p_name, '/');
  if array_length(f, 1) < 4 or f[1] <> public.bp_owner()::text then return false; end if;
  if f[2] = 'subs' then return f[3] = sid; end if;
  if public.bp_sub_job(f[2]) is null then return false; end if;
  if f[3] = 'subs' then return array_length(f, 1) >= 5 and f[4] = sid; end if;
  return not p_write and f[3] in ('photos','docs','blueprints');
end $$;
revoke all on function public.bp_sub_path_ok(text, boolean) from public, anon;
grant execute on function public.bp_sub_path_ok(text, boolean) to authenticated;

-- compliance of one sub: {status:'valid'|'expiring'|'expired'|'missing', coi, license, w9}
create or replace function public.bp_sub_compliance(p_sub uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (kind) kind, expires, number from public.sub_documents
     where sub_id = p_sub and kind in ('coi','license','w9') order by kind, expires desc nulls last, created_at desc),
  st as (select kind, expires, number,
           case when kind = 'w9' or expires is null then 'valid'
                when expires < current_date then 'expired'
                when expires <= current_date + 30 then 'expiring' else 'valid' end s from latest)
  select jsonb_build_object(
    'status', case when exists (select 1 from st where s = 'expired') then 'expired'
                   when not exists (select 1 from st where kind = 'coi') then 'missing'
                   when exists (select 1 from st where s = 'expiring') then 'expiring' else 'valid' end,
    'coi', (select jsonb_build_object('expires', expires, 'number', number, 'status', s) from st where kind = 'coi'),
    'license', (select jsonb_build_object('expires', expires, 'number', number, 'status', s) from st where kind = 'license'),
    'w9', (select jsonb_build_object('status', s) from st where kind = 'w9'));
$$;
revoke all on function public.bp_sub_compliance(uuid) from public, anon;
grant execute on function public.bp_sub_compliance(uuid) to authenticated;

-- write one job back (the caller already holds the row lock)
create or replace function public.bp_sub_job_put(p_job text, p_new jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.portal_finance pf set jobs = (
    select jsonb_agg(case when j->>'id' = p_job then p_new else j end order by o)
      from jsonb_array_elements(pf.jobs) with ordinality x(j, o))
   where pf.owner = public.bp_owner();
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.bp_sub_job_put(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4 ---
-- storage: subs only inside their own folders, read-only on their jobs' files
drop policy if exists "project files: sub limits read" on storage.objects;
drop policy if exists "project files: sub limits upload" on storage.objects;
drop policy if exists "project files: sub limits update" on storage.objects;
drop policy if exists "project files: sub limits delete" on storage.objects;
create policy "project files: sub limits read" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'project-files' or not public.bp_is_sub() or public.bp_sub_path_ok(name, false));
create policy "project files: sub limits upload" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'project-files' or not public.bp_is_sub() or public.bp_sub_path_ok(name, true));
create policy "project files: sub limits update" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'project-files' or not public.bp_is_sub() or public.bp_sub_path_ok(name, true));
create policy "project files: sub limits delete" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'project-files' or not public.bp_is_sub() or public.bp_sub_path_ok(name, true));

-- ---------------------------------------------------------------- 5 ---
-- merge one array of sub items: put back sub-made items an older copy lacks,
-- keep the further-along status and a signed waiver, honour tombstones
create or replace function public.bp_sub_merge_items(p_new jsonb, p_old jsonb, p_gone jsonb, p_ranks jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(r order by k), '[]'::jsonb) from (
    select case
             when y is null then x
             else (case when coalesce((p_ranks->>(y->>'status'))::int, 0) > coalesce((p_ranks->>(x->>'status'))::int, 0) then y else x end)
                  || case when jsonb_typeof(y->'lienWaiver') = 'object' and coalesce(y->'lienWaiver'->>'signedAt', '') <> ''
                               and coalesce(x->'lienWaiver'->>'signedAt', '') = ''
                          then jsonb_build_object('lienWaiver', (coalesce(x->'lienWaiver', '{}'::jsonb)) || (y->'lienWaiver')) else '{}'::jsonb end
           end r, k
      from jsonb_array_elements(public.bp_jarr(p_new)) with ordinality a(x, k)
      left join lateral (select z y from jsonb_array_elements(public.bp_jarr(p_old)) z
                          where jsonb_typeof(z) = 'object' and jsonb_typeof(x) = 'object' and z->>'id' = x->>'id' limit 1) o on true
     where not (jsonb_typeof(x) = 'object' and x ? 'id' and p_gone ? (x->>'id'))
    union all
    select y, 100000 + k from jsonb_array_elements(public.bp_jarr(p_old)) with ordinality b(y, k)
     where jsonb_typeof(y) = 'object' and y ? 'id' and y->'by'->>'role' = 'sub' and not p_gone ? (y->>'id')
       and not exists (select 1 from jsonb_array_elements(public.bp_jarr(p_new)) x where x->>'id' = y->>'id')) s;
$$;

create or replace function public.bp_jobs_keep_subs(p_old jsonb, p_new jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  nj jsonb; oj jsonb; out jsonb := '[]'::jsonb; changed boolean := false;
  g jsonb; m jsonb; k text; arr text; gk text; rk jsonb;
begin
  if jsonb_typeof(p_new) <> 'array' or jsonb_typeof(p_old) <> 'array' then return p_new; end if;
  for nj in select x from jsonb_array_elements(p_new) x loop
    oj := null;
    if jsonb_typeof(nj) = 'object' and nj ? 'id' then
      select x into oj from jsonb_array_elements(p_old) x where jsonb_typeof(x) = 'object' and x->>'id' = nj->>'id' limit 1;
    end if;
    if oj is not null then
      foreach arr in array array['subInvoices','subChangeOrders'] loop
        if jsonb_typeof(oj->arr) <> 'array' and jsonb_typeof(nj->arr) <> 'array' then continue; end if;
        gk := arr || 'Gone';
        rk := case arr when 'subInvoices' then '{"submitted":0,"approved":1,"rejected":1,"paid":2}'::jsonb
                       else '{"requested":0,"approved":1,"rejected":1}'::jsonb end;
        select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into g
          from (select jsonb_array_elements(public.bp_jarr(nj->gk)) x union select jsonb_array_elements(public.bp_jarr(oj->gk))) s
         where jsonb_typeof(x) = 'string';
        m := public.bp_sub_merge_items(nj->arr, oj->arr, g, rk);
        if m is distinct from coalesce(nj->arr, '[]'::jsonb) then nj := nj || jsonb_build_object(arr, m); changed := true; end if;
        if exists (select 1 from jsonb_array_elements(g) x where not public.bp_jarr(nj->gk) @> jsonb_build_array(x)) then
          nj := nj || jsonb_build_object(gk, g); changed := true;
        end if;
      end loop;
    end if;
    out := out || jsonb_build_array(nj);
  end loop;
  return case when changed then out else p_new end;
end $$;

create or replace function public.portal_finance_keep_crew() returns trigger
language plpgsql set search_path = public as $$
begin
  begin
    new.jobs := public.bp_jobs_keep_crew(old.jobs, new.jobs);
  exception when others then
    raise warning 'bp_jobs_keep_crew skipped: %', sqlerrm;   -- never block a save
  end;
  begin
    new.jobs := public.bp_jobs_keep_subs(old.jobs, new.jobs);
  exception when others then
    raise warning 'bp_jobs_keep_subs skipped: %', sqlerrm;
  end;
  return new;
end $$;

-- ---------------------------------------------------------------- 6 ---
-- the sub's whole world in one call
create or replace function public.sub_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.subcontractors; sid text; biz jsonb; jobs jsonb; docs jsonb; revs jsonb; stats jsonb;
begin
  if not public.bp_is_sub() then return jsonb_build_object('role', 'none'); end if;
  s := public.bp_my_sub();
  select jsonb_build_object('name', cs.data->'company'->>'name', 'logo', cs.data->'company'->>'logoUrl', 'phone', cs.data->'company'->>'phone',
                            'email', cs.data->'company'->>'email')
    into biz from public.client_settings cs where cs.user_id = public.bp_owner();
  if s.id is null then return jsonb_build_object('role', 'sub', 'sub', null, 'business', biz, 'jobs', '[]'::jsonb, 'docs', '[]'::jsonb); end if;
  sid := s.id::text;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'number', d.number, 'expires', d.expires, 'file', d.file, 'name', d.name,
           'addedBy', d.added_by, 'at', d.created_at,
           'status', case when d.kind = 'w9' or d.expires is null then 'valid' when d.expires < current_date then 'expired'
                          when d.expires <= current_date + 30 then 'expiring' else 'valid' end) order by d.kind, d.expires desc nulls last), '[]')
    into docs from public.sub_documents d where d.sub_id = s.id;
  select jsonb_build_object('rating', round(avg(rating)::numeric, 2), 'reviews', count(*)) into stats
    from public.worker_reviews where owner = s.owner and sub_id = s.id;
  select coalesce(jsonb_agg(jsonb_build_object('rating', r.rating, 'comment', r.comment, 'at', r.created_at) order by r.created_at desc), '[]')
    into revs from (select * from public.worker_reviews where owner = s.owner and sub_id = s.id order by created_at desc limit 10) r;

  select coalesce(jsonb_agg(x order by x->>'startDate' nulls last, x->>'title'), '[]') into jobs from (
    select jsonb_build_object(
      'id', j->>'id', 'title', coalesce(nullif(j->>'title', ''), 'Project'), 'addr', j->>'addr', 'geo', j->'geo', 'status', j->>'status',
      'scope', e->>'scope', 'trade', e->>'trade', 'startDate', e->>'startDate', 'endDate', e->>'endDate',
      'siteContact', case when jsonb_typeof(e->'siteContact') = 'object'
                          then jsonb_build_object('name', e->'siteContact'->>'name', 'phone', e->'siteContact'->>'phone') end,
      'lienWaiverRequired', coalesce((e->>'lienWaiver')::boolean, s.lien_waiver_required),
      'price', public.bp_num(e->>'price'),
      'coApproved', (select coalesce(sum(public.bp_num(c->>'amount')), 0) from jsonb_array_elements(public.bp_jarr(j->'subChangeOrders')) c
                      where c->>'subId' = sid and c->>'status' = 'approved'),
      'invoiced', (select coalesce(sum(public.bp_num(i->>'amount')), 0) from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) i
                    where i->>'subId' = sid and i->>'status' in ('submitted','approved','paid')),
      'approved', (select coalesce(sum(public.bp_num(i->>'amount')), 0) from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) i
                    where i->>'subId' = sid and i->>'status' = 'approved'),
      'paid', (select coalesce(sum(public.bp_num(i->>'amount')), 0) from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) i
                where i->>'subId' = sid and i->>'status' = 'paid'),
      'sched', jsonb_build_object('dates', j->'sched'->'dates', 'slots', (select jsonb_object_agg(sk, jsonb_build_object('t', sv->>'t', 'dur', sv->'dur'))
                                     from jsonb_each(case when jsonb_typeof(j->'sched'->'slots') = 'object' then j->'sched'->'slots' else '{}'::jsonb end) z(sk, sv)),
                                  'time', j->'sched'->>'time', 'end', j->'sched'->>'end', 'dur', j->'sched'->>'dur'),
      'plan', case when jsonb_typeof(j->'plan'->'phases') = 'array' then jsonb_build_object(
          'start', j->'plan'->>'start',
          'phases', (select coalesce(jsonb_agg(jsonb_build_object('name', ph->>'name', 'days', ph->'days', 'due', ph->>'due', 'doneAt', ph->>'doneAt') order by o), '[]')
                       from jsonb_array_elements(j->'plan'->'phases') with ordinality y(ph, o))) end,
      -- job files, minus what other subs uploaded to their own folders
      'photos', (select coalesce(jsonb_agg(p order by o), '[]') from jsonb_array_elements(public.bp_jarr(j->'photos')) with ordinality y(p, o)
                  where not (jsonb_typeof(p) = 'string' and p #>> '{}' like '%/subs/%' and p #>> '{}' not like '%/subs/' || sid || '/%')),
      'docs', (select coalesce(jsonb_agg(d order by o), '[]') from jsonb_array_elements(public.bp_jarr(j->'docs')) with ordinality y(d, o)
                where not (coalesce(d->>'d', '') like '%/subs/%' and coalesce(d->>'d', '') not like '%/subs/' || sid || '/%')),
      'blueprints', public.bp_jarr(j->'blueprints'),
      'permits', (select coalesce(jsonb_agg(jsonb_build_object('type', p->>'type', 'number', p->>'number', 'office', p->>'office', 'status', p->>'status',
                     'applied', p->>'applied', 'approved', p->>'approved', 'expires', p->>'expires',
                     'inspections', public.bp_jarr(p->'inspections')) order by o), '[]')
                    from jsonb_array_elements(public.bp_jarr(j->'permits')) with ordinality y(p, o)
                   where coalesce(p->>'gone', '') <> 'true'),
      'invoices', (select coalesce(jsonb_agg(i - 'by' order by o), '[]') from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) with ordinality y(i, o)
                    where i->>'subId' = sid),
      'changeOrders', (select coalesce(jsonb_agg(c - 'by' order by o), '[]') from jsonb_array_elements(public.bp_jarr(j->'subChangeOrders')) with ordinality y(c, o)
                        where c->>'subId' = sid)
    ) x
      from public.portal_finance pf, jsonb_array_elements(coalesce(pf.jobs, '[]'::jsonb)) j,
           lateral (select z e from jsonb_array_elements(public.bp_jarr(j->'subs')) z where z->>'subId' = sid limit 1) se
     where pf.owner = public.bp_owner() and coalesce(j->>'status', '') not in ('lead','archived','deleted')) q;

  return jsonb_build_object(
    'role', 'sub',
    'sub', jsonb_build_object('id', s.id, 'company', s.company, 'contactName', s.contact_name, 'email', s.email, 'phone', s.phone,
                              'trade', s.trade, 'lienWaiverRequired', s.lien_waiver_required, 'since', s.created_at, 'owner', s.owner),
    'business', biz, 'compliance', public.bp_sub_compliance(s.id), 'docs', docs,
    'stats', stats, 'reviews', coalesce(revs, '[]'::jsonb), 'jobs', coalesce(jobs, '[]'::jsonb));
end $$;
revoke all on function public.sub_me() from public, anon;
grant execute on function public.sub_me() to authenticated;

-- a file reference a sub may attach to a job: sb:<owner>/<job>/subs/<subId>/...
create or replace function public.bp_sub_file_ok(p_job text, p_ref text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_ref = '' or (p_ref like 'sb:' || public.bp_owner()::text || '/' || p_job || '/subs/' || (public.bp_my_sub()).id::text || '/%'
                        and length(p_ref) <= 400 and p_ref not like '%..%');
$$;
revoke all on function public.bp_sub_file_ok(text, text) from public, anon, authenticated;

create or replace function public.sub_invoice_add(p_job text, p_inv jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; e jsonb; s public.subcontractors; a text; amt numeric; note text; f text; mime text; r jsonb; req boolean;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;
  j := public.bp_sub_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  s := public.bp_my_sub();
  if jsonb_typeof(p_inv) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad invoice'); end if;
  a := trim(coalesce(p_inv->>'amount', ''));
  if a !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
  amt := a::numeric;
  if amt <= 0 or amt > 5000000 then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
  note := trim(coalesce(p_inv->>'note', ''));
  if length(note) > 500 then return jsonb_build_object('ok', false, 'error', 'note'); end if;
  f := trim(coalesce(p_inv->>'file', ''));
  if not public.bp_sub_file_ok(p_job, f) then return jsonb_build_object('ok', false, 'error', 'file'); end if;
  mime := trim(coalesce(p_inv->>'mime', ''));
  if mime <> '' and mime !~ '^(image/[a-z0-9.+-]{1,30}|application/pdf)$' then mime := ''; end if;
  if (select count(*) from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) x where x->>'subId' = s.id::text and x->>'status' = 'submitted') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'too many');
  end if;
  select z into e from jsonb_array_elements(public.bp_jarr(j->'subs')) z where z->>'subId' = s.id::text limit 1;
  req := coalesce((e->>'lienWaiver')::boolean, s.lien_waiver_required);
  r := jsonb_build_object('id', public.bp_rid('si'), 'subId', s.id::text, 'amount', amt, 'note', note, 'file', f, 'mime', mime,
         'status', 'submitted', 'at', public.bp_now_ms(), 'paidAt', null, 'by', public.bp_sub_actor(),
         'lienWaiver', jsonb_build_object('required', req, 'file', '', 'signedName', '', 'signedAt', null));
  j := j || jsonb_build_object('subInvoices', public.bp_jarr(j->'subInvoices') || jsonb_build_array(r));
  if not public.bp_sub_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true, 'invoice', r - 'by');
end $$;

create or replace function public.sub_invoice_remove(p_job text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; r jsonb;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;
  j := public.bp_sub_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  select x into r from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) x where x->>'id' = p_id limit 1;
  if r is null then return jsonb_build_object('ok', false, 'error', 'not found'); end if;
  if r->>'subId' <> (public.bp_my_sub()).id::text then return jsonb_build_object('ok', false, 'error', 'not yours'); end if;
  if r->>'status' <> 'submitted' then return jsonb_build_object('ok', false, 'error', 'already decided'); end if;
  j := j || jsonb_build_object(
    'subInvoices', (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) with ordinality t(x, o) where x->>'id' is distinct from p_id),
    'subInvoicesGone', public.bp_jarr(j->'subInvoicesGone') || jsonb_build_array(p_id));
  if not public.bp_sub_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true, 'file', r->>'file', 'waiver', r->'lienWaiver'->>'file');
end $$;

create or replace function public.sub_change_order_add(p_job text, p_co jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; s public.subcontractors; a text; amt numeric; d text; r jsonb;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;
  j := public.bp_sub_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  s := public.bp_my_sub();
  if jsonb_typeof(p_co) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad change order'); end if;
  d := trim(coalesce(p_co->>'desc', ''));
  if d = '' or length(d) > 600 then return jsonb_build_object('ok', false, 'error', 'desc'); end if;
  a := trim(coalesce(p_co->>'amount', ''));
  if a !~ '^-?[0-9]{1,7}(\.[0-9]{1,2})?$' then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
  amt := a::numeric;
  if amt = 0 or abs(amt) > 5000000 then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
  if (select count(*) from jsonb_array_elements(public.bp_jarr(j->'subChangeOrders')) x where x->>'subId' = s.id::text and x->>'status' = 'requested') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'too many');
  end if;
  r := jsonb_build_object('id', public.bp_rid('sc'), 'subId', s.id::text, 'desc', d, 'amount', amt, 'status', 'requested',
         'at', public.bp_now_ms(), 'by', public.bp_sub_actor());
  j := j || jsonb_build_object('subChangeOrders', public.bp_jarr(j->'subChangeOrders') || jsonb_build_array(r));
  if not public.bp_sub_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true, 'changeOrder', r - 'by');
end $$;

create or replace function public.sub_change_order_remove(p_job text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; r jsonb;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;
  j := public.bp_sub_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  select x into r from jsonb_array_elements(public.bp_jarr(j->'subChangeOrders')) x where x->>'id' = p_id limit 1;
  if r is null then return jsonb_build_object('ok', false, 'error', 'not found'); end if;
  if r->>'subId' <> (public.bp_my_sub()).id::text then return jsonb_build_object('ok', false, 'error', 'not yours'); end if;
  if r->>'status' <> 'requested' then return jsonb_build_object('ok', false, 'error', 'already decided'); end if;
  j := j || jsonb_build_object(
    'subChangeOrders', (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(public.bp_jarr(j->'subChangeOrders')) with ordinality t(x, o) where x->>'id' is distinct from p_id),
    'subChangeOrdersGone', public.bp_jarr(j->'subChangeOrdersGone') || jsonb_build_array(p_id));
  if not public.bp_sub_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- sign (typed name) and/or upload the lien waiver for one of my invoices
create or replace function public.sub_waiver_sign(p_job text, p_id text, p_waiver jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; r jsonb; f text; nm text; w jsonb;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;
  j := public.bp_sub_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  select x into r from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) x where x->>'id' = p_id limit 1;
  if r is null then return jsonb_build_object('ok', false, 'error', 'not found'); end if;
  if r->>'subId' <> (public.bp_my_sub()).id::text then return jsonb_build_object('ok', false, 'error', 'not yours'); end if;
  if r->>'status' not in ('submitted','approved') then return jsonb_build_object('ok', false, 'error', 'already decided'); end if;
  if jsonb_typeof(p_waiver) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad waiver'); end if;
  f := trim(coalesce(p_waiver->>'file', ''));
  nm := trim(coalesce(p_waiver->>'signedName', ''));
  if not public.bp_sub_file_ok(p_job, f) then return jsonb_build_object('ok', false, 'error', 'file'); end if;
  if length(nm) < 2 or length(nm) > 120 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  w := coalesce(case when jsonb_typeof(r->'lienWaiver') = 'object' then r->'lienWaiver' end, '{}'::jsonb)
       || jsonb_build_object('file', f, 'signedName', nm, 'signedAt', public.bp_now_ms());
  j := j || jsonb_build_object('subInvoices', (select jsonb_agg(case when x->>'id' = p_id then x || jsonb_build_object('lienWaiver', w) else x end order by o)
                                                 from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) with ordinality t(x, o)));
  if not public.bp_sub_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true, 'lienWaiver', w);
end $$;

-- add a photo / document to a job I'm on (file must be in my folder of that job)
create or replace function public.sub_add_file(p_job text, p_kind text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; ref text; it jsonb; s public.subcontractors;
begin
  if p_kind not in ('photos','docs') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;
  j := public.bp_sub_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  s := public.bp_my_sub();
  ref := case when p_kind = 'photos' then p_item #>> '{}' else p_item->>'d' end;
  if ref is null or ref = '' or not public.bp_sub_file_ok(p_job, ref) then return jsonb_build_object('ok', false, 'error', 'file'); end if;
  if jsonb_array_length(public.bp_jarr(j->p_kind)) >= (case when p_kind = 'photos' then 24 else 32 end) then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  it := case when p_kind = 'photos' then to_jsonb(ref)
             else jsonb_build_object('n', left(coalesce(nullif(trim(p_item->>'n'), ''), 'Document'), 120), 'd', ref,
                                     't', to_char(current_date, 'YYYY-MM-DD'), 'by', coalesce(nullif(s.company, ''), 'Subcontractor'), 'sub', true, 'subId', s.id::text) end;
  j := jsonb_set(j, array[p_kind], public.bp_jarr(j->p_kind) || jsonb_build_array(it));
  if not public.bp_sub_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true, 'item', it);
end $$;

-- compliance papers: my own only
create or replace function public.sub_doc_add(p_doc jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.subcontractors; k text; f text; ex date; num text; nm text; row public.sub_documents;
begin
  s := public.bp_my_sub();
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'not a sub'); end if;
  if jsonb_typeof(p_doc) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad doc'); end if;
  k := coalesce(p_doc->>'kind', '');
  if k not in ('coi','license','w9','other') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
  f := trim(coalesce(p_doc->>'file', ''));
  if f = '' or f not like 'sb:' || s.owner::text || '/subs/' || s.id::text || '/%' or length(f) > 400 or f like '%..%' then
    return jsonb_build_object('ok', false, 'error', 'file');
  end if;
  num := trim(coalesce(p_doc->>'number', ''));
  nm := trim(coalesce(p_doc->>'name', ''));
  if length(num) > 80 or length(nm) > 160 then return jsonb_build_object('ok', false, 'error', 'number'); end if;
  if coalesce(p_doc->>'expires', '') <> '' then
    if p_doc->>'expires' !~ '^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('ok', false, 'error', 'expires'); end if;
    ex := (p_doc->>'expires')::date;
  end if;
  if k in ('coi','license') and ex is null then return jsonb_build_object('ok', false, 'error', 'expires'); end if;
  if (select count(*) from public.sub_documents where sub_id = s.id) >= 60 then return jsonb_build_object('ok', false, 'error', 'too many'); end if;
  insert into public.sub_documents(owner, sub_id, kind, number, expires, file, name, added_by)
  values (s.owner, s.id, k, num, ex, f, nm, 'sub') returning * into row;
  return jsonb_build_object('ok', true, 'id', row.id);
end $$;

create or replace function public.sub_doc_remove(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.subcontractors; d public.sub_documents;
begin
  s := public.bp_my_sub();
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'not a sub'); end if;
  select * into d from public.sub_documents where id = p_id and sub_id = s.id;
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'not found'); end if;
  if d.added_by <> 'sub' then return jsonb_build_object('ok', false, 'error', 'not yours'); end if;
  delete from public.sub_documents where id = d.id;
  return jsonb_build_object('ok', true, 'file', d.file);
end $$;

-- my company card: contact name and phone (company, trade and email are the owner's to set)
create or replace function public.sub_set_profile(p_contact text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.subcontractors;
begin
  s := public.bp_my_sub();
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'not a sub'); end if;
  if length(trim(coalesce(p_contact, ''))) > 120 or length(trim(coalesce(p_phone, ''))) > 40 then return jsonb_build_object('ok', false, 'error', 'too long'); end if;
  update public.subcontractors set contact_name = coalesce(nullif(trim(p_contact), ''), contact_name), phone = trim(coalesce(p_phone, ''))
   where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.sub_invoice_add(text,jsonb)','public.sub_invoice_remove(text,text)',
    'public.sub_change_order_add(text,jsonb)','public.sub_change_order_remove(text,text)',
    'public.sub_waiver_sign(text,text,jsonb)','public.sub_add_file(text,text,jsonb)',
    'public.sub_doc_add(jsonb)','public.sub_doc_remove(uuid)','public.sub_set_profile(text,text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.bp_now_ms() from public, anon;

-- ---------------------------------------------------------------- 8 ---
-- a sub never punches the time clock. Applied live by patching crew_clock's
-- body in place (inserting this line right after its "begin"):
--   if public.bp_is_sub() then return jsonb_build_object('ok', false, 'error', 'subcontractors do not clock in'); end if;
do $$ declare d text; begin
  d := pg_get_functiondef('public.crew_clock(text,text,text,double precision,double precision,double precision,double precision,boolean)'::regprocedure);
  if position('bp_is_sub' in d) = 0 then
    d := replace(d, E'begin\n  if p_kind not in (''in'',''out'')', E'begin\n  if public.bp_is_sub() then return jsonb_build_object(''ok'', false, ''error'', ''subcontractors do not clock in''); end if;\n  if p_kind not in (''in'',''out'')');
    execute d;
  end if;
end $$;
