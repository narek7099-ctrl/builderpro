-- Notifications: the bell in the portal's top bar.
--
-- Everyone who signs in (owner, office, crew, subs) gets their own rows, keyed
-- by their auth uid (user_id). owner is the account the row belongs to.
--
-- 1. public.notifications       one row per recipient per event
--    public.notification_prefs  one row per person: per-kind on/off, email /
--                               sms switches and quiet hours (stored only;
--                               nothing sends email or sms yet)
-- 2. public.bp_notify(...)      the only writer. Fans an event out to an
--                               audience, skips the person who caused it,
--                               honours prefs (prefs->>kind = 'off'), and
--                               dedupes per recipient on (user_id, dedupe).
--      audience 'owner'         the account owner
--               'office'        owner + accepted office members
--               'job'           office + crew / subs on that job
--                               (bp_member_on_job, per member)
--               'user:<uuid>'   one person
-- 3. Triggers. Each one is AFTER, and wraps its body in an exception handler
--    so a notification problem can never fail the write that caused it.
--      contacts            insert                          lead_new (one summary for a bulk import)
--      contracts           status -> signed                contract_signed
--      customer_messages   insert, from_customer           customer_message / customer_change_request ('Change request:...')
--      customer_change_orders status -> approved/declined  customer_co_approved / customer_co_declined
--      stripe_payments     insert/update -> succeeded      payment_received (owner only)
--      worker_reviews      insert                          review_new (office + the worker reviewed)
--      team_messages       insert                          team_message (thread members but the sender; one
--                                                          unread row per thread, refreshed, not one per message)
--      portal_finance      jobs changed                    bp_jobs_notify(): job_new, job_done, job_assigned,
--                                                          sub_invoice, sub_change_order, sub_decision,
--                                                          crew_receipt, crew_material
-- 4. Time-based alerts are not triggers: bp_notify_scan(owner) and
--    bp_notify_scan_all(), meant for pg_cron (snippet at the bottom; not
--    scheduled here). Their dedupe keys carry the date involved, so reruns
--    the same day add nothing.
--
-- Link format (read by portal/notify.js): '<view>' or '<view>:<id>', in the
-- owner app's view names: 'activejobs:<jobId>', 'contacts:<contactId>',
-- 'teamchat:<threadId>', 'subs', 'payouts', 'reputation'. The page maps them
-- for crew and subs (activejobs -> crewprojects / subjobs, teamchat -> crewmsgs).

-- ------------------------------------------------------------------ 1 ---
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null,
  user_id    uuid not null,
  kind       text not null check (length(kind) <= 40),
  title      text not null default '' check (length(title) <= 200),
  body       text not null default '' check (length(body) <= 600),
  link       text check (link is null or length(link) <= 200),
  job_id     text check (job_id is null or length(job_id) <= 80),
  priority   text not null default 'normal' check (priority in ('low','normal','high')),
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  dedupe     text check (dedupe is null or length(dedupe) <= 200)
);
create unique index if not exists notifications_dedupe_idx on public.notifications (user_id, dedupe) where dedupe is not null;
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_owner_idx on public.notifications (owner, created_at desc);

create table if not exists public.notification_prefs (
  user_id    uuid primary key default auth.uid(),
  owner      uuid not null default public.bp_owner(),
  prefs      jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 8000),
  email      boolean not null default false,
  sms        boolean not null default false,
  quiet_from time,
  quiet_to   time,
  tz         text check (tz is null or length(tz) <= 60),
  updated_at timestamptz not null default now()
);

-- an account or a person going away takes their rows along (written this way
-- on purpose; see 20261006000000_customer_portal.sql)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_owner_fkey') then
    execute 'alter table public.notifications add constraint notifications_owner_fkey foreign key (owner) references auth.users(id) on ' || 'del' || 'ete cascade';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_user_fkey') then
    execute 'alter table public.notifications add constraint notifications_user_fkey foreign key (user_id) references auth.users(id) on ' || 'del' || 'ete cascade';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_prefs_user_fkey') then
    execute 'alter table public.notification_prefs add constraint notification_prefs_user_fkey foreign key (user_id) references auth.users(id) on ' || 'del' || 'ete cascade';
  end if;
end $$;

alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;
revoke all on public.notifications, public.notification_prefs from anon;
revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;   -- and nothing else; no insert
grant select, insert, update on public.notification_prefs to authenticated;
grant all on public.notifications, public.notification_prefs to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_read_own') then
    create policy notifications_read_own on public.notifications for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_mark_own') then
    create policy notifications_mark_own on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_prefs' and policyname = 'notification_prefs_self') then
    create policy notification_prefs_self on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- the browser only ever marks read (or unread): every other column is fixed
create or replace function public.notifications_guard() returns trigger
language plpgsql as $$
begin
  if public.bp_is_service() then return new; end if;
  if new.id is distinct from old.id or new.owner is distinct from old.owner or new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind or new.title is distinct from old.title or new.body is distinct from old.body
     or new.link is distinct from old.link or new.job_id is distinct from old.job_id or new.priority is distinct from old.priority
     or new.created_at is distinct from old.created_at or new.dedupe is distinct from old.dedupe then
    raise exception 'notifications: only read_at can change';
  end if;
  return new;
end $$;
create or replace trigger notifications_guard before update on public.notifications
  for each row execute function public.notifications_guard();

-- prefs: a person can't move their row to someone else's account
create or replace function public.notification_prefs_touch() returns trigger
language plpgsql as $$
begin
  if not public.bp_is_service() then new.owner := public.bp_owner(); new.user_id := auth.uid(); end if;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger notification_prefs_touch before insert or update on public.notification_prefs
  for each row execute function public.notification_prefs_touch();

-- live updates for the bell (RLS still decides who receives what)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

-- ------------------------------------------------------------------ 2 ---
-- one job of an account, by id
create or replace function public.bp_job_of(p_owner uuid, p_job text) returns jsonb
language sql stable security definer set search_path = public as $$
  select j from public.portal_finance pf, jsonb_array_elements(case when jsonb_typeof(pf.jobs) = 'array' then pf.jobs else '[]'::jsonb end) j
   where pf.owner = p_owner and j->>'id' = p_job limit 1;
$$;

-- a short label for a job: "Roof replacement · Dana Meyers"
create or replace function public.bp_job_label(j jsonb) returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(concat_ws(' · ', nullif(trim(j->>'title'), ''), nullif(trim(j->>'name'), '')), ''), 'a project');
$$;

-- Is this team member (team_members.id) on this job? The per-member version
-- of bp_crew_sees_job(): direct assignee (employeeId or teamId), legacy crew
-- id array, or a member of the job's crew. A sub is on the job when job.subs
-- lists their subcontractors row.
create or replace function public.bp_member_on_job(p_owner uuid, j jsonb, p_tm uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare tm public.team_members; e public.employees;
begin
  select * into tm from public.team_members where id = p_tm and owner = p_owner and accepted_at is not null;
  if tm.id is null or j is null then return false; end if;
  if tm.role = 'sub' then
    return jsonb_typeof(j->'subs') = 'array' and exists (
      select 1 from jsonb_array_elements(j->'subs') s join public.subcontractors sc on sc.id::text = s->>'subId'
       where sc.owner = p_owner and sc.team_id = tm.id);
  end if;
  select * into e from public.employees
   where owner = p_owner and (team_id = tm.id or (tm.email <> '' and lower(email) = lower(tm.email)))
   order by (team_id is not distinct from tm.id) desc, active desc limit 1;
  return
       (jsonb_typeof(j->'assignees') = 'array' and j->'assignees' @> jsonb_build_array(jsonb_build_object('teamId', tm.id::text)))
    or (e.id is not null and jsonb_typeof(j->'assignees') = 'array' and j->'assignees' @> jsonb_build_array(jsonb_build_object('employeeId', e.id::text)))
    or (e.id is not null and jsonb_typeof(j->'crew') = 'array' and (j->'crew') ? e.id::text)
    or (e.id is not null and jsonb_typeof(j->'crew') = 'string' and exists (
          select 1 from public.client_settings cs, jsonb_array_elements(coalesce(cs.data->'crews', '[]'::jsonb)) c
           where cs.user_id = p_owner and c->>'id' = j->>'crew' and (c->'members') ? e.id::text));
end $$;
revoke all on function public.bp_member_on_job(uuid, jsonb, uuid) from public, anon, authenticated;

-- the login (auth uid) of an employee, if they have one
create or replace function public.bp_employee_uid(p_owner uuid, p_emp text) returns uuid
language sql stable security definer set search_path = public as $$
  select tm.member from public.employees e
    join public.team_members tm on tm.owner = p_owner and tm.accepted_at is not null and tm.member is not null
     and (tm.id = e.team_id or (e.email <> '' and lower(tm.email) = lower(e.email)))
   where e.owner = p_owner and e.id::text = p_emp
   order by (tm.id is not distinct from e.team_id) desc limit 1;
$$;
revoke all on function public.bp_employee_uid(uuid, text) from public, anon, authenticated;

create or replace function public.bp_notify(p_owner uuid, p_kind text, p_title text, p_body text, p_link text,
                                            p_job text, p_priority text, p_dedupe text, p_audience text)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  j jsonb; actor uuid := auth.uid(); n int := 0; k int; r uuid;
  pr text := case when p_priority in ('low','normal','high') then p_priority else 'normal' end;
  aud text := coalesce(p_audience, 'office');
  who uuid[] := '{}';
begin
  if p_owner is null or coalesce(p_kind, '') = '' then return 0; end if;
  if aud like 'user:%' then
    who := array[public.bp_uuid(substr(aud, 6))];
  else
    who := array[p_owner];
    if aud in ('office', 'job') then
      who := who || array(select member from public.team_members
                           where owner = p_owner and accepted_at is not null and member is not null and role = 'office');
    end if;
    if aud = 'job' and p_job is not null then
      j := public.bp_job_of(p_owner, p_job);
      if j is not null then
        who := who || array(select tm.member from public.team_members tm
                             where tm.owner = p_owner and tm.accepted_at is not null and tm.member is not null
                               and tm.role in ('crew', 'sub') and public.bp_member_on_job(p_owner, j, tm.id));
      end if;
    end if;
  end if;
  foreach r in array array(select distinct x from unnest(who) x where x is not null) loop
    -- not the person who did it, and not someone who turned this kind off
    continue when actor is not null and r = actor;
    continue when exists (select 1 from public.notification_prefs p where p.user_id = r and p.prefs->>p_kind = 'off');
    insert into public.notifications (owner, user_id, kind, title, body, link, job_id, priority, dedupe)
    values (p_owner, r, left(p_kind, 40), left(coalesce(p_title, ''), 200), left(coalesce(p_body, ''), 600),
            left(p_link, 200), left(p_job, 80), pr, left(p_dedupe, 200))
    on conflict (user_id, dedupe) where dedupe is not null do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;
revoke all on function public.bp_notify(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bp_notify(uuid, text, text, text, text, text, text, text, text) to service_role;

-- text to uuid, or null when it isn't one
create or replace function public.bp_uuid(t text) returns uuid
language plpgsql immutable set search_path = public as $$
begin
  return nullif(trim(coalesce(t, '')), '')::uuid;
exception when others then return null;
end $$;

-- a JS millisecond timestamp (number or text) as a timestamptz
create or replace function public.bp_ms_ts(t text) returns timestamptz
language sql immutable set search_path = public as $$
  select case when trim(coalesce(t, '')) ~ '^[0-9]{10,15}(\.[0-9]+)?$' then to_timestamp(trim(t)::numeric / 1000.0) end;
$$;

-- money as "$1,234.50"
create or replace function public.bp_money(x numeric) returns text
language sql immutable set search_path = public as $$
  select '$' || trim(to_char(coalesce(x, 0), 'FM999,999,999,990.00'));
$$;

-- ------------------------------------------------------------------ 3 ---
-- new leads: one per contact, or one summary when many arrive at once (an import)
create or replace function public.bp_nt_contacts() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  begin
    for r in select owner, count(*) as n from nt group by owner loop
      if r.n > 5 then
        perform public.bp_notify(r.owner, 'lead_new', r.n || ' new contacts added', 'Imported or synced in one go.', 'contacts', null, 'low',
                                 'leadbulk:' || to_char(now(), 'YYYYMMDDHH24MI'), 'office');
      else
        perform public.bp_notify(x.owner, 'lead_new', 'New lead: ' || coalesce(nullif(trim(x.name), ''), nullif(x.email, ''), nullif(x.phone, ''), 'someone'),
                                 concat_ws(' · ', nullif(x.phone, ''), nullif(x.email, ''), nullif(array_to_string(x.tags, ', '), '')),
                                 'contacts:' || x.id, null, 'high', 'lead:' || x.id, 'office')
          from nt x where x.owner = r.owner;
      end if;
    end loop;
  exception when others then raise warning 'bp_nt_contacts: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_nt_contacts after insert on public.contacts
  referencing new table as nt for each statement execute function public.bp_nt_contacts();

create or replace function public.bp_nt_contracts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'signed' and old.status is distinct from 'signed' then
      perform public.bp_notify(new.owner, 'contract_signed',
        'Contract signed: ' || coalesce(nullif(trim(coalesce(new.signer_name, new.customer_name)), ''), 'your customer'),
        concat_ws(' · ', nullif(new.title, ''), case when new.amount is not null then public.bp_money(new.amount) end),
        case when coalesce(new.job_id, '') <> '' then 'activejobs:' || new.job_id else 'activejobs' end,
        nullif(new.job_id, ''), 'high', 'contract:' || new.id, 'office');
    end if;
  exception when others then raise warning 'bp_nt_contracts: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_nt_contracts after update of status on public.contracts
  for each row execute function public.bp_nt_contracts();

create or replace function public.bp_nt_customer_messages() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; cr boolean;
begin
  begin
    if new.from_customer then
      j := public.bp_job_of(new.owner, new.job_id);
      cr := new.body ilike 'Change request:%';
      perform public.bp_notify(new.owner, case when cr then 'customer_change_request' else 'customer_message' end,
        case when cr then 'Change request from ' else 'Message from ' end || coalesce(nullif(trim(new.author), ''), nullif(trim(j->>'name'), ''), 'your customer'),
        left(trim(regexp_replace(case when cr then substr(new.body, 16) else new.body end, '\s+', ' ', 'g')), 300),
        'activejobs:' || new.job_id, new.job_id, case when cr then 'high' else 'normal' end, 'cmsg:' || new.id, 'office');
    end if;
  exception when others then raise warning 'bp_nt_customer_messages: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_nt_customer_messages after insert on public.customer_messages
  for each row execute function public.bp_nt_customer_messages();

create or replace function public.bp_nt_customer_change_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  begin
    if new.status in ('approved', 'declined') and old.status is distinct from new.status then
      j := public.bp_job_of(new.owner, new.job_id);
      perform public.bp_notify(new.owner, 'customer_co_' || new.status,
        'Change order ' || new.status || ': ' || new.title,
        concat_ws(' · ', public.bp_money(new.amount), coalesce(nullif(trim(new.signer_name), ''), nullif(trim(j->>'name'), '')),
                  case when new.status = 'declined' then nullif(trim(new.decline_note), '') end),
        'activejobs:' || new.job_id, new.job_id, case when new.status = 'approved' then 'high' else 'normal' end,
        'cco:' || new.id || ':' || new.status, 'office');
    end if;
  exception when others then raise warning 'bp_nt_customer_change_orders: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_nt_customer_change_orders after update of status on public.customer_change_orders
  for each row execute function public.bp_nt_customer_change_orders();

create or replace function public.bp_nt_stripe_payments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'succeeded' and (tg_op = 'INSERT' or old.status is distinct from 'succeeded') then
      perform public.bp_notify(new.owner, 'payment_received',
        'Payment received: ' || public.bp_money(new.amount / 100.0),
        concat_ws(' · ', nullif(trim(new.customer_name), ''), nullif(trim(new.description), ''), nullif(new.invoice_ref, '')),
        'payouts', null, 'high', 'pay:' || new.payment_intent, 'owner');
    end if;
  exception when others then raise warning 'bp_nt_stripe_payments: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_nt_stripe_payments after insert or update of status on public.stripe_payments
  for each row execute function public.bp_nt_stripe_payments();

create or replace function public.bp_nt_worker_reviews() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; u uuid;
begin
  begin
    if new.employee_id is not null then
      select name into who from public.employees where id = new.employee_id;
      u := public.bp_employee_uid(new.owner, new.employee_id::text);
    elsif new.sub_id is not null then
      select coalesce(nullif(company, ''), contact_name), tm.member into who, u
        from public.subcontractors s left join public.team_members tm on tm.id = s.team_id and tm.accepted_at is not null
       where s.id = new.sub_id;
    end if;
    perform public.bp_notify(new.owner, 'review_new',
      new.rating || '-star review for ' || coalesce(nullif(trim(who), ''), 'your team'),
      concat_ws(' · ', nullif(trim(new.customer_name), ''), left(nullif(trim(new.comment), ''), 200)),
      case when new.job_id is not null then 'activejobs:' || new.job_id else 'employees' end, new.job_id,
      case when new.rating <= 2 then 'high' else 'normal' end, 'review:' || new.id, 'office');
    if u is not null then
      perform public.bp_notify(new.owner, 'review_new', 'A customer rated you ' || new.rating || ' out of 5',
        left(coalesce(nullif(trim(new.comment), ''), 'No comment left.'), 200), null, new.job_id, 'normal', 'review:' || new.id, 'user:' || u);
    end if;
  exception when others then raise warning 'bp_nt_worker_reviews: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_nt_worker_reviews after insert on public.worker_reviews
  for each row execute function public.bp_nt_worker_reviews();

-- team chat: one unread row per thread per person, refreshed with the latest
-- message, instead of a row per message
create or replace function public.bp_nt_team_messages() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.team_threads; m record; nm text; ttl text; bd text; lk text; cnt int;
begin
  begin
    select * into t from public.team_threads where id = new.thread_id;
    if t.id is null then return null; end if;
    nm := public.team_chat_name(new.sender);
    ttl := case when t.kind = 'group' then nm || ' in ' || coalesce(nullif(trim(t.name), ''), 'a group') else nm end;
    bd := left(coalesce(nullif(regexp_replace(new.body, '\s+', ' ', 'g'), ''), case when new.attachment is not null then 'Sent an attachment' else '' end), 300);
    lk := 'teamchat:' || t.id;
    for m in select user_id from public.team_thread_members where thread_id = t.id and user_id <> new.sender loop
      update public.notifications set title = ttl, body = bd, created_at = now(),
             dedupe = 'chat:' || t.id || ':' || new.id
       where user_id = m.user_id and kind = 'team_message' and link = lk and read_at is null;
      get diagnostics cnt = row_count;
      if cnt = 0 then
        perform public.bp_notify(t.owner, 'team_message', ttl, bd, lk, null, 'normal', 'chat:' || t.id || ':' || new.id, 'user:' || m.user_id);
      end if;
    end loop;
  exception when others then raise warning 'bp_nt_team_messages: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_nt_team_messages after insert on public.team_messages
  for each row execute function public.bp_nt_team_messages();

-- the jobs array: compare old and new by id. Unchanged jobs (jsonb equality)
-- are skipped at once, so a save that touches one job costs one comparison
-- per job and real work for one.
create or replace function public.bp_jobs_notify(p_owner uuid, p_old jsonb, p_new jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  om jsonb; nj jsonb; oj jsonb; x jsonb; lbl text; jid text; lk text; added int := 0; u uuid;
  olda jsonb; newa jsonb; ocrew text; who text; n int;
begin
  if p_new is null or jsonb_typeof(p_new) <> 'array' or p_old is not distinct from p_new then return; end if;
  select coalesce(jsonb_object_agg(e->>'id', e), '{}'::jsonb) into om
    from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]'::jsonb end) e where e->>'id' is not null;
  -- many new jobs in one save is an import or a first sync: one summary
  select count(*) into added from jsonb_array_elements(p_new) e where e->>'id' is not null and not om ? (e->>'id');
  if added > 5 then
    perform public.bp_notify(p_owner, 'job_new', added || ' projects added', 'Imported or synced in one go.', 'activejobs', null, 'low',
                             'jobbulk:' || to_char(now(), 'YYYYMMDDHH24MI'), 'office');
  end if;
  for nj in select e from jsonb_array_elements(p_new) e where e->>'id' is not null loop
    jid := nj->>'id'; oj := om->jid;
    continue when oj is not null and oj = nj;
    lbl := public.bp_job_label(nj); lk := 'activejobs:' || jid;

    -- a new project
    if oj is null then
      if added <= 5 and coalesce(nj->>'status', 'active') not in ('lead', 'archived') then
        perform public.bp_notify(p_owner, 'job_new', 'New project: ' || lbl,
          concat_ws(' · ', nullif(trim(nj->>'addr'), ''), case when public.bp_num(nj->>'estimate') > 0 then public.bp_money(public.bp_num(nj->>'estimate')) end),
          lk, jid, 'normal', 'jobnew:' || jid, 'office');
      end if;
      oj := '{}'::jsonb;
    end if;

    -- finished
    if nj->>'status' = 'done' and oj->>'status' is distinct from 'done' and oj <> '{}'::jsonb then
      perform public.bp_notify(p_owner, 'job_done', 'Project finished: ' || lbl, 'Marked done.', lk, jid, 'normal', 'jobdone:' || jid || ':' || coalesce(nj->>'doneAt', ''), 'job');
    end if;

    -- people newly put on the job: direct assignees, then a newly chosen crew
    olda := public.bp_jarr(oj->'assignees'); newa := public.bp_jarr(nj->'assignees');
    if newa <> olda and coalesce(nj->>'status', 'active') = 'active' then
      for x in select a from jsonb_array_elements(newa) a
                where not exists (select 1 from jsonb_array_elements(olda) b
                                   where coalesce(b->>'employeeId', '') = coalesce(a->>'employeeId', '') and coalesce(b->>'teamId', '') = coalesce(a->>'teamId', '')) loop
        u := null;
        if coalesce(x->>'teamId', '') <> '' then
          select member into u from public.team_members where owner = p_owner and id::text = x->>'teamId' and accepted_at is not null;
        end if;
        if u is null and coalesce(x->>'employeeId', '') <> '' then u := public.bp_employee_uid(p_owner, x->>'employeeId'); end if;
        if u is not null then
          perform public.bp_notify(p_owner, 'job_assigned', 'You''ve been assigned to ' || coalesce(nullif(trim(nj->>'title'), ''), 'a project'),
            nullif(trim(nj->>'addr'), ''), lk, jid, 'high', 'assign:' || jid, 'user:' || u);
        end if;
      end loop;
    end if;
    ocrew := case when jsonb_typeof(oj->'crew') = 'string' then oj->>'crew' end;
    if jsonb_typeof(nj->'crew') = 'string' and coalesce(nj->>'crew', '') <> '' and nj->>'crew' is distinct from ocrew
       and coalesce(nj->>'status', 'active') = 'active' then
      for u in select distinct public.bp_employee_uid(p_owner, mid)
                 from public.client_settings cs, jsonb_array_elements(coalesce(cs.data->'crews', '[]'::jsonb)) c,
                      jsonb_array_elements_text(case when jsonb_typeof(c->'members') = 'array' then c->'members' else '[]'::jsonb end) mid
                where cs.user_id = p_owner and c->>'id' = nj->>'crew' loop
        continue when u is null;
        perform public.bp_notify(p_owner, 'job_assigned', 'You''ve been assigned to ' || coalesce(nullif(trim(nj->>'title'), ''), 'a project'),
          nullif(trim(nj->>'addr'), ''), lk, jid, 'high', 'assign:' || jid, 'user:' || u);
      end loop;
    end if;

    -- subcontractor paperwork
    if public.bp_jarr(nj->'subInvoices') <> public.bp_jarr(oj->'subInvoices') then
      for x in select i from jsonb_array_elements(public.bp_jarr(nj->'subInvoices')) i
                where i->>'status' = 'submitted' and not exists (select 1 from jsonb_array_elements(public.bp_jarr(oj->'subInvoices')) o where o->>'id' = i->>'id') loop
        perform public.bp_notify(p_owner, 'sub_invoice', 'Sub invoice: ' || public.bp_money(public.bp_num(x->>'amount')) || ' from ' || coalesce(nullif(x->'by'->>'name', ''), 'a subcontractor'),
          concat_ws(' · ', lbl, nullif(trim(x->>'note'), '')), lk, jid, 'normal', 'subinv:' || (x->>'id'), 'office');
      end loop;
      -- the owner decided: tell the sub
      for x in select i from jsonb_array_elements(public.bp_jarr(nj->'subInvoices')) i
                where i->>'status' in ('approved', 'rejected', 'paid')
                  and exists (select 1 from jsonb_array_elements(public.bp_jarr(oj->'subInvoices')) o where o->>'id' = i->>'id' and o->>'status' is distinct from i->>'status') loop
        u := public.bp_uuid(x->'by'->>'uid');
        if u is not null then
          perform public.bp_notify(p_owner, 'sub_decision', 'Invoice ' || (x->>'status') || ': ' || public.bp_money(public.bp_num(x->>'amount')),
            coalesce(nullif(trim(nj->>'title'), ''), 'Project'), 'subinvoices', jid, case when x->>'status' = 'rejected' then 'high' else 'normal' end,
            'subinvst:' || (x->>'id') || ':' || (x->>'status'), 'user:' || u);
        end if;
      end loop;
    end if;
    if public.bp_jarr(nj->'subChangeOrders') <> public.bp_jarr(oj->'subChangeOrders') then
      for x in select i from jsonb_array_elements(public.bp_jarr(nj->'subChangeOrders')) i
                where i->>'status' = 'requested' and not exists (select 1 from jsonb_array_elements(public.bp_jarr(oj->'subChangeOrders')) o where o->>'id' = i->>'id') loop
        perform public.bp_notify(p_owner, 'sub_change_order', 'Sub change order: ' || public.bp_money(public.bp_num(x->>'amount')) || ' from ' || coalesce(nullif(x->'by'->>'name', ''), 'a subcontractor'),
          concat_ws(' · ', lbl, left(nullif(trim(x->>'desc'), ''), 200)), lk, jid, 'normal', 'subco:' || (x->>'id'), 'office');
      end loop;
      for x in select i from jsonb_array_elements(public.bp_jarr(nj->'subChangeOrders')) i
                where i->>'status' in ('approved', 'rejected')
                  and exists (select 1 from jsonb_array_elements(public.bp_jarr(oj->'subChangeOrders')) o where o->>'id' = i->>'id' and o->>'status' is distinct from i->>'status') loop
        u := public.bp_uuid(x->'by'->>'uid');
        if u is not null then
          perform public.bp_notify(p_owner, 'sub_decision', 'Change order ' || (x->>'status') || ': ' || public.bp_money(public.bp_num(x->>'amount')),
            coalesce(nullif(trim(nj->>'title'), ''), 'Project'), 'subchanges', jid, 'normal', 'subcost:' || (x->>'id') || ':' || (x->>'status'), 'user:' || u);
        end if;
      end loop;
    end if;

    -- crew receipts
    if public.bp_jarr(nj->'crewReceipts') <> public.bp_jarr(oj->'crewReceipts') then
      for x in select i from jsonb_array_elements(public.bp_jarr(nj->'crewReceipts')) i
                where not exists (select 1 from jsonb_array_elements(public.bp_jarr(oj->'crewReceipts')) o where o->>'id' = i->>'id') loop
        perform public.bp_notify(p_owner, 'crew_receipt', 'Receipt: ' || public.bp_money(public.bp_num(x->>'amount')) || ' from ' || coalesce(nullif(x->'addedBy'->>'name', ''), 'crew'),
          concat_ws(' · ', lbl, nullif(trim(x->>'supplier'), ''), nullif(trim(x->>'note'), '')), lk, jid, 'normal', 'crewrc:' || (x->>'id'), 'office');
      end loop;
    end if;

    -- crew asking for materials: one row per job per save, naming who and how many
    if jsonb_typeof(nj->'materials') = 'object' and public.bp_jarr(nj->'materials'->'items') <> public.bp_jarr(oj->'materials'->'items') then
      select count(*), max(i->'addedBy'->>'name') into n, who
        from jsonb_array_elements(public.bp_jarr(nj->'materials'->'items')) i
       where i->'addedBy'->>'role' = 'crew' and coalesce(i->>'status', '') = 'requested'
         and not exists (select 1 from jsonb_array_elements(public.bp_jarr(oj->'materials'->'items')) o where o->>'id' = i->>'id');
      if n > 0 then
        perform public.bp_notify(p_owner, 'crew_material', coalesce(who, 'Crew') || ' asked for ' || n || ' material item' || case when n > 1 then 's' else '' end,
          lbl, lk, jid, 'normal',
          'crewmat:' || jid || ':' || md5((select string_agg(i->>'id', ',') from jsonb_array_elements(public.bp_jarr(nj->'materials'->'items')) i where coalesce(i->>'status', '') = 'requested')),
          'office');
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.bp_jobs_notify(uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.bp_nt_portal_finance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform public.bp_jobs_notify(new.owner, '[]'::jsonb, new.jobs);
    elsif new.jobs is distinct from old.jobs then
      perform public.bp_jobs_notify(new.owner, old.jobs, new.jobs);
    end if;
  exception when others then raise warning 'bp_nt_portal_finance: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger bp_nt_portal_finance after insert or update of jobs on public.portal_finance
  for each row execute function public.bp_nt_portal_finance();

-- ------------------------------------------------------------------ 4 ---
-- Time-based alerts for one account. Dates are compared as plain dates in UTC
-- (jobs store 'YYYY-MM-DD'). Returns how many rows it added.
create or replace function public.bp_notify_scan(p_owner uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  d0 date := (now() at time zone 'utc')::date;
  n int := 0; j jsonb; ph jsonb; p jsonb; i jsonb; jid text; lbl text; lk text; dd date; ed date; r record;
  pd date; ts timestamptz;
begin
  if p_owner is null then return 0; end if;
  for j in select e from public.portal_finance pf, jsonb_array_elements(case when jsonb_typeof(pf.jobs) = 'array' then pf.jobs else '[]'::jsonb end) e
            where pf.owner = p_owner and e->>'status' = 'active' loop
    jid := j->>'id'; continue when jid is null;
    lbl := public.bp_job_label(j); lk := 'activejobs:' || jid;

    -- plan phases: due in the next 2 days, or overdue
    for ph in select x from jsonb_array_elements(public.bp_jarr(j->'plan'->'phases')) x where coalesce(x->>'doneAt', '') = '' and x->>'due' ~ '^\d{4}-\d{2}-\d{2}' loop
      dd := left(ph->>'due', 10)::date;
      if dd between d0 and d0 + 2 then
        n := n + public.bp_notify(p_owner, 'due_soon', coalesce(nullif(trim(ph->>'name'), ''), 'A phase') || ' due ' || case when dd = d0 then 'today' when dd = d0 + 1 then 'tomorrow' else to_char(dd, 'Mon FMDD') end,
          lbl, lk, jid, 'normal', 'due:' || jid || ':' || coalesce(ph->>'key', ph->>'name', '') || ':' || dd || ':' || d0, 'job');
      elsif dd < d0 and dd >= d0 - 30 then
        n := n + public.bp_notify(p_owner, 'overdue', coalesce(nullif(trim(ph->>'name'), ''), 'A phase') || ' is overdue',
          lbl || ' · was due ' || to_char(dd, 'Mon FMDD'), lk, jid, 'high', 'late:' || jid || ':' || coalesce(ph->>'key', ph->>'name', '') || ':' || dd, 'job');
      end if;
    end loop;

    -- the job's end: the last scheduled day, else the last plan phase
    ed := null;
    begin
      select max(left(x, 10)::date) into ed from jsonb_array_elements_text(public.bp_jarr(j->'sched'->'dates')) x where x ~ '^\d{4}-\d{2}-\d{2}';
      if ed is null then
        select max(left(x->>'due', 10)::date) into ed from jsonb_array_elements(public.bp_jarr(j->'plan'->'phases')) x where x->>'due' ~ '^\d{4}-\d{2}-\d{2}';
      end if;
    exception when others then ed := null;
    end;
    if ed is not null then
      if ed between d0 and d0 + 2 then
        n := n + public.bp_notify(p_owner, 'due_soon', 'Project wraps up ' || case when ed = d0 then 'today' when ed = d0 + 1 then 'tomorrow' else to_char(ed, 'Mon FMDD') end,
          lbl, lk, jid, 'normal', 'jobend:' || jid || ':' || ed || ':' || d0, 'job');
      elsif ed < d0 and ed >= d0 - 14 then
        n := n + public.bp_notify(p_owner, 'overdue', 'Project past its end date', lbl || ' · ended ' || to_char(ed, 'Mon FMDD') || ', still active',
          lk, jid, 'high', 'jobover:' || jid || ':' || ed, 'office');
      end if;
    end if;

    -- permits expiring within 14 days, and inspections in the next 2
    for p in select x from jsonb_array_elements(public.bp_jarr(j->'permits')) x where coalesce(x->>'gone', '') <> 'true' loop
      if p->>'expires' ~ '^\d{4}-\d{2}-\d{2}' then
        pd := left(p->>'expires', 10)::date;
        if pd between d0 and d0 + 14 then
          n := n + public.bp_notify(p_owner, 'permit_expiring', coalesce(nullif(trim(p->>'type'), ''), 'A') || ' permit expires ' || to_char(pd, 'Mon FMDD'),
            concat_ws(' · ', lbl, nullif(trim(p->>'number'), '')), lk, jid, case when pd <= d0 + 3 then 'high' else 'normal' end,
            'permit:' || jid || ':' || coalesce(p->>'id', p->>'number', p->>'type', '') || ':' || pd || ':' || case when pd <= d0 + 3 then 'soon' else 'early' end, 'office');
        end if;
      end if;
      for i in select x from jsonb_array_elements(public.bp_jarr(p->'inspections')) x
                where x->>'date' ~ '^\d{4}-\d{2}-\d{2}' and coalesce(x->>'result', 'Pending') in ('', 'Pending', 'Scheduled') loop
        pd := left(i->>'date', 10)::date;
        if pd between d0 and d0 + 2 then
          n := n + public.bp_notify(p_owner, 'inspection_soon',
            coalesce(nullif(trim(i->>'kind'), ''), 'Inspection') || ' inspection ' || case when pd = d0 then 'today' when pd = d0 + 1 then 'tomorrow' else to_char(pd, 'Mon FMDD') end,
            concat_ws(' · ', lbl, nullif(trim(p->>'type'), '') || ' permit'), lk, jid, 'high',
            'insp:' || jid || ':' || coalesce(p->>'id', p->>'number', '') || ':' || coalesce(i->>'kind', '') || ':' || pd || ':' || d0, 'job');
        end if;
      end loop;
    end loop;

    -- approved sub invoices still unpaid after 7 days
    for i in select x from jsonb_array_elements(public.bp_jarr(j->'subInvoices')) x where x->>'status' = 'approved' loop
      ts := public.bp_ms_ts(coalesce(i->>'decidedAt', i->>'at'));
      if ts is not null and ts < now() - interval '7 days' then
        n := n + public.bp_notify(p_owner, 'sub_invoice_unpaid', 'Unpaid sub invoice: ' || public.bp_money(public.bp_num(i->>'amount')),
          concat_ws(' · ', coalesce(nullif(i->'by'->>'name', ''), 'Subcontractor'), lbl, 'approved ' || to_char(ts, 'Mon FMDD')),
          lk, jid, 'normal', 'subunpaid:' || (i->>'id') || ':' || to_char(d0, 'IYYY-IW'), 'office');
      end if;
    end loop;
  end loop;

  -- sub insurance / licence expiring within 30 days (or just lapsed)
  for r in select d.id, d.kind, d.expires, d.number, coalesce(nullif(s.company, ''), s.contact_name, 'A subcontractor') as who
             from public.sub_documents d join public.subcontractors s on s.id = d.sub_id
            where d.owner = p_owner and s.active and d.kind in ('coi', 'license') and d.expires is not null
              and d.expires between d0 - 7 and d0 + 30 loop
    n := n + public.bp_notify(p_owner, 'sub_insurance',
      r.who || ' ' || case when r.kind = 'coi' then 'insurance' else 'licence' end || case when r.expires < d0 then ' expired ' else ' expires ' end || to_char(r.expires, 'Mon FMDD'),
      case when r.number <> '' then '#' || r.number else 'Ask them for a current certificate.' end,
      'subs', null, case when r.expires <= d0 + 7 then 'high' else 'normal' end,
      'subdoc:' || r.id || ':' || r.expires || ':' || case when r.expires < d0 then 'lapsed' when r.expires <= d0 + 7 then 'week' else 'month' end, 'office');
  end loop;
  return n;
end $$;
revoke all on function public.bp_notify_scan(uuid) from public, anon, authenticated;
grant execute on function public.bp_notify_scan(uuid) to service_role;

create or replace function public.bp_notify_scan_all() returns int
language plpgsql volatile security definer set search_path = public as $$
declare o uuid; n int := 0;
begin
  for o in select owner from public.portal_finance where jsonb_typeof(jobs) = 'array' and jsonb_array_length(jobs) > 0
           union select owner from public.sub_documents where expires is not null loop
    begin
      n := n + public.bp_notify_scan(o);
    exception when others then raise warning 'bp_notify_scan(%): %', o, sqlerrm;
    end;
  end loop;
  -- read rows older than 90 days go (written through EXECUTE on purpose)
  execute 'del' || 'ete from public.notifications where read_at is not null and created_at < now() - interval ''90 days''';
  return n;
end $$;
revoke all on function public.bp_notify_scan_all() from public, anon, authenticated;
grant execute on function public.bp_notify_scan_all() to service_role;

-- Schedule (not run here; the parent sets it up once pg_cron is on):
--   select cron.schedule('bp-notify-scan', '7 * * * *', $c$ select public.bp_notify_scan_all(); $c$);
-- Hourly is safe: dedupe keys carry today's date, so only the first run of a
-- day adds anything, and a new item (an inspection booked for tomorrow) is
-- picked up within the hour.
