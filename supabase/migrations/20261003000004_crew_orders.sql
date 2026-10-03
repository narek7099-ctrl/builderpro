-- Crew order changes and crew receipts.
--
-- Material list on a job (portal_finance.jobs[i].materials):
--   items[]  each item may now carry
--              addedBy {uid, name, role:'owner'|'office'|'crew'}, addedAt (ms)
--              status  'requested' (crew asked, office hasn't acted)
--                      'approved'  (office accepted it)
--                      'ordered'   (it went out with the order)
--   log[]    {id, at(ms), by{uid,name,role}, action, item, itemId, qty, unit, before, after}
--   gone[]   ids of items that were removed (tombstones, see the merge below)
--   locked   true: crew can't add or remove
--
-- Crew receipts (portal_finance.jobs[i].crewReceipts[]):
--   {id, amount, supplier, note, image ('sb:<owner>/<job>/receipts/...'), mime,
--    addedBy, at(ms), status:'pending'|'approved'|'rejected', receiptId?}
--   crewReceiptsGone[]  ids crew deleted while pending
--   The owner approves/rejects in the page (they own the row); approving
--   writes the Materials expense exactly like portal/receipts.js does.
--
-- Crew still cannot touch portal_finance directly: everything goes through
-- the security-definer functions below, which use bp_crew_sees_job().
--
-- The owner's page saves the whole jobs array at once. If it was loaded
-- before a crew change, that save would wipe the change. The trigger
-- bp_jobs_keep_crew puts back crew-added items, crew receipts and log
-- entries the incoming copy doesn't know about, and drops tombstoned ones.
--
-- Storage: crew receipt photos go to project-files under <owner>/<job>/receipts/,
-- which the existing "project files: upload team" policy already allows.

-- ---------------------------------------------------------------- 1 ---
-- helpers
create or replace function public.bp_jarr(x jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(x) = 'array' then x else '[]'::jsonb end;
$$;

create or replace function public.bp_crew_actor() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.employees; nm text;
begin
  e := public.bp_my_employee();
  nm := nullif(trim(coalesce(e.name, '')), '');
  if nm is null then
    select nullif(trim(name), '') into nm from public.team_members where member = auth.uid() and owner = public.bp_owner() limit 1;
  end if;
  return jsonb_build_object('uid', auth.uid()::text, 'name', coalesce(nm, 'Crew'), 'role', 'crew');
end $$;
revoke all on function public.bp_crew_actor() from public, anon;

create or replace function public.bp_rid(p text) returns text
language sql volatile set search_path = public as $$
  select p || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
$$;

-- ---------------------------------------------------------------- 2 ---
-- keep crew changes when an older copy of the jobs array is saved
create or replace function public.bp_jobs_keep_crew(p_old jsonb, p_new jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  nj jsonb; oj jsonb; o bigint; out jsonb := '[]'::jsonb;
  nm jsonb; om jsonb; gone jsonb; nitems jsonb; oitems jsonb; items jsonb; nlog jsonb; olog jsonb; lg jsonb;
  nr jsonb; orc jsonb; rgone jsonb; rc jsonb;
begin
  if jsonb_typeof(p_new) <> 'array' or jsonb_typeof(p_old) <> 'array' then return p_new; end if;
  for nj, o in select x, n from jsonb_array_elements(p_new) with ordinality t(x, n) loop
    oj := null;
    if jsonb_typeof(nj) = 'object' and nj ? 'id' then
      select x into oj from jsonb_array_elements(p_old) x where jsonb_typeof(x) = 'object' and x->>'id' = nj->>'id' limit 1;
    end if;
    if oj is null or (jsonb_typeof(oj->'materials') <> 'object' and jsonb_typeof(oj->'crewReceipts') <> 'array') then
      out := out || jsonb_build_array(nj); continue;
    end if;

    -- materials
    om := case when jsonb_typeof(oj->'materials') = 'object' then oj->'materials' else null end;
    if om is not null then
      nm := case when jsonb_typeof(nj->'materials') = 'object' then nj->'materials' else '{}'::jsonb end;
      select coalesce(jsonb_agg(distinct g), '[]'::jsonb) into gone
        from (select jsonb_array_elements(public.bp_jarr(nm->'gone')) g union select jsonb_array_elements(public.bp_jarr(om->'gone'))) s
       where jsonb_typeof(g) = 'string';
      nitems := public.bp_jarr(nm->'items'); oitems := public.bp_jarr(om->'items');
      select coalesce(jsonb_agg(it order by k), '[]'::jsonb) into items from (
        select it, k from jsonb_array_elements(nitems) with ordinality a(it, k)
         where not (jsonb_typeof(it) = 'object' and it ? 'id' and gone ? (it->>'id'))
        union all
        select it, 100000 + k from jsonb_array_elements(oitems) with ordinality b(it, k)
         where jsonb_typeof(it) = 'object' and it->'addedBy'->>'role' = 'crew' and it ? 'id'
           and not gone ? (it->>'id')
           and not exists (select 1 from jsonb_array_elements(nitems) x where x->>'id' = it->>'id')) s;
      nlog := public.bp_jarr(nm->'log'); olog := public.bp_jarr(om->'log');
      select coalesce(jsonb_agg(e order by (e->>'at')::numeric nulls first), '[]'::jsonb) into lg from (
        select e from (
          select e from jsonb_array_elements(nlog) e
          union all
          select e from jsonb_array_elements(olog) e
           where jsonb_typeof(e) = 'object' and e ? 'id'
             and not exists (select 1 from jsonb_array_elements(nlog) x where x->>'id' = e->>'id')) u
        order by (e->>'at')::numeric desc nulls last limit 300) s;
      nm := nm || jsonb_build_object('items', items, 'log', lg,
              'gone', (select coalesce(jsonb_agg(g), '[]'::jsonb) from (select g from jsonb_array_elements(gone) g limit 1000) z));
      nj := jsonb_set(nj, '{materials}', nm);
    end if;

    -- crew receipts
    if jsonb_typeof(oj->'crewReceipts') = 'array' or jsonb_typeof(nj->'crewReceipts') = 'array' then
      select coalesce(jsonb_agg(distinct g), '[]'::jsonb) into rgone
        from (select jsonb_array_elements(public.bp_jarr(nj->'crewReceiptsGone')) g union select jsonb_array_elements(public.bp_jarr(oj->'crewReceiptsGone'))) s
       where jsonb_typeof(g) = 'string';
      nr := public.bp_jarr(nj->'crewReceipts'); orc := public.bp_jarr(oj->'crewReceipts');
      select coalesce(jsonb_agg(r order by k), '[]'::jsonb) into rc from (
        -- a decision already saved is never undone by an older pending copy
        select case when r->>'status' = 'pending' and exists (select 1 from jsonb_array_elements(orc) y where y->>'id' = r->>'id' and y->>'status' <> 'pending')
                    then (select y from jsonb_array_elements(orc) y where y->>'id' = r->>'id' limit 1) else r end r, k
          from jsonb_array_elements(nr) with ordinality a(r, k)
         where not (r ? 'id' and rgone ? (r->>'id'))
        union all
        select r, 100000 + k from jsonb_array_elements(orc) with ordinality b(r, k)
         where jsonb_typeof(r) = 'object' and r ? 'id' and not rgone ? (r->>'id')
           and not exists (select 1 from jsonb_array_elements(nr) x where x->>'id' = r->>'id')) s;
      nj := nj || jsonb_build_object('crewReceipts', rc, 'crewReceiptsGone', rgone);
    end if;
    out := out || jsonb_build_array(nj);
  end loop;
  return out;
end $$;

create or replace function public.portal_finance_keep_crew() returns trigger
language plpgsql set search_path = public as $$
begin
  begin
    new.jobs := public.bp_jobs_keep_crew(old.jobs, new.jobs);
  exception when others then
    raise warning 'bp_jobs_keep_crew skipped: %', sqlerrm;   -- never block a save
  end;
  return new;
end $$;
drop trigger if exists portal_finance_keep_crew on public.portal_finance;
create trigger portal_finance_keep_crew before update on public.portal_finance
  for each row when (old.jobs is distinct from new.jobs) execute function public.portal_finance_keep_crew();

-- ---------------------------------------------------------------- 3 ---
-- apply fn(job) to the caller's job p_job; shared by the four crew writes
-- returns the job as it was before, or null when the caller can't see it
create or replace function public.bp_crew_job(p_job text) returns jsonb
language sql stable security definer set search_path = public as $$
  select j from public.portal_finance pf, jsonb_array_elements(coalesce(pf.jobs, '[]'::jsonb)) j
   where pf.owner = public.bp_owner() and public.bp_team_role() = 'crew'
     and j->>'id' = p_job and j->>'status' = 'active' and public.bp_crew_sees_job(j)
   limit 1;
$$;
revoke all on function public.bp_crew_job(text) from public, anon;

create or replace function public.bp_crew_job_put(p_job text, p_new jsonb) returns boolean
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
revoke all on function public.bp_crew_job_put(text, jsonb) from public, anon, authenticated;

-- crew asks for a material
create or replace function public.crew_material_add(p_job text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; m jsonb; nm text; unit text; note text; q numeric; qs text; who jsonb; it jsonb; now_ms bigint;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;   -- one change at a time
  j := public.bp_crew_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  m := case when jsonb_typeof(j->'materials') = 'object' then j->'materials' else jsonb_build_object('status', 'draft', 'sentAt', null, 'items', '[]'::jsonb, 'changeOrders', '[]'::jsonb) end;
  if coalesce((m->>'locked')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if jsonb_typeof(p_item) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad item'); end if;
  nm := trim(coalesce(p_item->>'name', ''));
  unit := trim(coalesce(p_item->>'unit', ''));
  note := trim(coalesce(p_item->>'note', ''));
  if nm = '' or length(nm) > 120 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if length(unit) > 20 then return jsonb_build_object('ok', false, 'error', 'unit'); end if;
  if length(note) > 300 then return jsonb_build_object('ok', false, 'error', 'note'); end if;
  qs := trim(coalesce(p_item->>'qty', ''));
  if qs = '' then q := null;
  elsif qs ~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' then q := qs::numeric; if q <= 0 or q > 100000 then return jsonb_build_object('ok', false, 'error', 'qty'); end if;
  else return jsonb_build_object('ok', false, 'error', 'qty'); end if;
  if (select count(*) from jsonb_array_elements(public.bp_jarr(m->'items')) x where x->'addedBy'->>'role' = 'crew') >= 200 then
    return jsonb_build_object('ok', false, 'error', 'too many');
  end if;
  who := public.bp_crew_actor();
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  it := jsonb_build_object('id', public.bp_rid('mc'), 'name', nm, 'qty', coalesce(to_jsonb(q), '""'::jsonb), 'unit', coalesce(nullif(unit, ''), 'ea'),
          'note', note, 'sku', '', 'supplierId', '', 'supplierName', '', 'price', '', 'custom', true,
          'addedAt', now_ms, 'addedBy', who, 'by', who->>'name', 'status', 'requested',
          'addedAfterSend', coalesce(m->>'status', 'draft') <> 'draft');
  m := m || jsonb_build_object('items', public.bp_jarr(m->'items') || jsonb_build_array(it),
          'log', public.bp_jarr(m->'log') || jsonb_build_array(jsonb_build_object('id', public.bp_rid('lg'), 'at', now_ms, 'by', who,
                   'action', 'add', 'item', nm, 'itemId', it->>'id', 'qty', to_jsonb(q), 'unit', it->>'unit', 'note', note)));
  if not public.bp_crew_job_put(p_job, jsonb_set(j, '{materials}', m)) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true, 'item', it);
end $$;
revoke all on function public.crew_material_add(text, jsonb) from public, anon;
grant execute on function public.crew_material_add(text, jsonb) to authenticated;

-- crew takes back something they asked for (only theirs, only while still a request)
create or replace function public.crew_material_remove(p_job text, p_item_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; m jsonb; it jsonb; who jsonb; now_ms bigint;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;   -- one change at a time
  j := public.bp_crew_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  m := j->'materials';
  if jsonb_typeof(m) <> 'object' then return jsonb_build_object('ok', false, 'error', 'not found'); end if;
  if coalesce((m->>'locked')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  select x into it from jsonb_array_elements(public.bp_jarr(m->'items')) x where x->>'id' = p_item_id limit 1;
  if it is null then return jsonb_build_object('ok', false, 'error', 'not found'); end if;
  if coalesce(it->'addedBy'->>'uid', '') <> auth.uid()::text or coalesce(it->'addedBy'->>'role', '') <> 'crew' then
    return jsonb_build_object('ok', false, 'error', 'not yours');
  end if;
  if coalesce(it->>'status', '') <> 'requested' then return jsonb_build_object('ok', false, 'error', 'already ordered'); end if;
  who := public.bp_crew_actor();
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  m := m || jsonb_build_object(
    'items', (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(public.bp_jarr(m->'items')) with ordinality t(x, o) where x->>'id' is distinct from p_item_id),
    'gone', public.bp_jarr(m->'gone') || jsonb_build_array(p_item_id),
    'log', public.bp_jarr(m->'log') || jsonb_build_array(jsonb_build_object('id', public.bp_rid('lg'), 'at', now_ms, 'by', who,
             'action', 'remove', 'item', it->>'name', 'itemId', p_item_id, 'qty', it->'qty', 'unit', it->>'unit')));
  if not public.bp_crew_job_put(p_job, jsonb_set(j, '{materials}', m)) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.crew_material_remove(text, text) from public, anon;
grant execute on function public.crew_material_remove(text, text) to authenticated;

-- crew uploads a receipt for the job; the owner approves it into an expense
create or replace function public.crew_receipt_add(p_job text, p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; m jsonb; amt numeric; sup text; note text; img text; mime text; who jsonb; r jsonb; now_ms bigint; a text;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;   -- one change at a time
  j := public.bp_crew_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  if jsonb_typeof(p_receipt) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad receipt'); end if;
  a := trim(coalesce(p_receipt->>'amount', ''));
  if a !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
  amt := a::numeric;
  if amt <= 0 or amt > 100000 then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
  sup := trim(coalesce(p_receipt->>'supplier', ''));
  note := trim(coalesce(p_receipt->>'note', ''));
  img := trim(coalesce(p_receipt->>'image', ''));
  mime := trim(coalesce(p_receipt->>'mime', ''));
  if length(sup) > 80 then return jsonb_build_object('ok', false, 'error', 'supplier'); end if;
  if length(note) > 300 then return jsonb_build_object('ok', false, 'error', 'note'); end if;
  if img <> '' and (img not like 'sb:' || public.bp_owner()::text || '/' || p_job || '/receipts/%' or length(img) > 300 or img like '%..%') then
    return jsonb_build_object('ok', false, 'error', 'image');
  end if;
  if mime <> '' and mime !~ '^(image/[a-z0-9.+-]{1,30}|application/pdf)$' then mime := ''; end if;
  if (select count(*) from jsonb_array_elements(public.bp_jarr(j->'crewReceipts')) x where x->>'status' = 'pending') >= 50 then
    return jsonb_build_object('ok', false, 'error', 'too many');
  end if;
  who := public.bp_crew_actor();
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  r := jsonb_build_object('id', public.bp_rid('cr'), 'amount', amt, 'supplier', sup, 'note', note, 'image', img, 'mime', mime,
         'addedBy', who, 'at', now_ms, 'status', 'pending');
  j := j || jsonb_build_object('crewReceipts', public.bp_jarr(j->'crewReceipts') || jsonb_build_array(r));
  -- the change log lives on the material list
  m := case when jsonb_typeof(j->'materials') = 'object' then j->'materials' else jsonb_build_object('status', 'draft', 'sentAt', null, 'items', '[]'::jsonb, 'changeOrders', '[]'::jsonb) end;
  m := m || jsonb_build_object('log', public.bp_jarr(m->'log') || jsonb_build_array(jsonb_build_object('id', public.bp_rid('lg'), 'at', now_ms, 'by', who,
         'action', 'receipt', 'item', coalesce(nullif(sup, ''), 'Receipt'), 'receiptId', r->>'id', 'amount', amt)));
  j := jsonb_set(j, '{materials}', m);
  if not public.bp_crew_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true, 'receipt', r);
end $$;
revoke all on function public.crew_receipt_add(text, jsonb) from public, anon;
grant execute on function public.crew_receipt_add(text, jsonb) to authenticated;

-- crew deletes their own receipt while it still waits for the office
create or replace function public.crew_receipt_remove(p_job text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j jsonb; r jsonb; m jsonb; who jsonb; now_ms bigint;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;   -- one change at a time
  j := public.bp_crew_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  select x into r from jsonb_array_elements(public.bp_jarr(j->'crewReceipts')) x where x->>'id' = p_id limit 1;
  if r is null then return jsonb_build_object('ok', false, 'error', 'not found'); end if;
  if coalesce(r->'addedBy'->>'uid', '') <> auth.uid()::text then return jsonb_build_object('ok', false, 'error', 'not yours'); end if;
  if coalesce(r->>'status', '') <> 'pending' then return jsonb_build_object('ok', false, 'error', 'already decided'); end if;
  who := public.bp_crew_actor();
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  j := j || jsonb_build_object(
    'crewReceipts', (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(public.bp_jarr(j->'crewReceipts')) with ordinality t(x, o) where x->>'id' is distinct from p_id),
    'crewReceiptsGone', public.bp_jarr(j->'crewReceiptsGone') || jsonb_build_array(p_id));
  if jsonb_typeof(j->'materials') = 'object' then
    m := j->'materials';
    m := m || jsonb_build_object('log', public.bp_jarr(m->'log') || jsonb_build_array(jsonb_build_object('id', public.bp_rid('lg'), 'at', now_ms, 'by', who,
           'action', 'receipt-remove', 'item', coalesce(nullif(r->>'supplier', ''), 'Receipt'), 'receiptId', p_id, 'amount', r->'amount')));
    j := jsonb_set(j, '{materials}', m);
  end if;
  if not public.bp_crew_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true, 'image', r->>'image');
end $$;
revoke all on function public.crew_receipt_remove(text, text) from public, anon;
grant execute on function public.crew_receipt_remove(text, text) to authenticated;

-- ---------------------------------------------------------------- 4 ---
-- crew_me: the definition from 20261003000003_worker_reviews.sql section 4,
-- plus per material item id / status / who added it / mine, the list's lock,
-- and the caller's own receipts on each job. Still no prices.
create or replace function public.crew_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.employees; c jsonb; mates jsonb; biz jsonb; openc jsonb; jobs jsonb; crews jsonb; stats jsonb; revs jsonb; me text;
begin
  e := public.bp_my_employee();
  c := public.bp_my_crew();
  me := coalesce(auth.uid()::text, '');
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
      'materials', (select coalesce(jsonb_agg(jsonb_build_object('name', it->>'name', 'qty', it->'qty', 'unit', it->>'unit', 'note', it->>'note', 'supplier', it->>'supplier',
                        'id', it->>'id', 'status', it->>'status', 'addedAt', it->'addedAt',
                        'addedBy', it->'addedBy'->>'name', 'byCrew', coalesce(it->'addedBy'->>'role', '') = 'crew',
                        'mine', me <> '' and coalesce(it->'addedBy'->>'uid', '') = me) order by o), '[]')
                      from jsonb_array_elements(case when jsonb_typeof(j->'materials'->'items') = 'array' then j->'materials'->'items' else '[]'::jsonb end) with ordinality y(it, o)
                     where jsonb_typeof(it) = 'object'),
      'materialsStatus', j->'materials'->>'status',
      'materialsLocked', coalesce((j->'materials'->>'locked')::boolean, false),
      -- receipts: only the ones I uploaded, with my amounts
      'crewReceipts', (select coalesce(jsonb_agg(jsonb_build_object('id', r->>'id', 'amount', r->'amount', 'supplier', r->>'supplier', 'note', r->>'note',
                          'image', r->>'image', 'mime', r->>'mime', 'at', r->'at', 'status', r->>'status') order by o), '[]')
                         from jsonb_array_elements(case when jsonb_typeof(j->'crewReceipts') = 'array' then j->'crewReceipts' else '[]'::jsonb end) with ordinality y(r, o)
                        where me <> '' and r->'addedBy'->>'uid' = me),
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
