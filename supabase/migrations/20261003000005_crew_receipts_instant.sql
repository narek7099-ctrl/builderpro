-- Crew receipts count right away.
--
-- A crew receipt means the money is already spent, so it no longer waits
-- for approval. crew_receipt_add now writes, in one update:
--   job.crewReceipts[]  {id, amount, supplier, note, image, mime, addedBy, at, status:'posted'}
--   job.expenses[]      {cat:'Materials', amt, note:'<Supplier> receipt (from <First>)',
--                        key:'crewrc:<id>', when:<at>, receiptId:<id>, crewReceiptId:<id>,
--                        by:<name>, crew:true}
--                       (the shape portal/receipts.js writes; key prefix 'crewrc:')
--   materials.log[]     {action:'receipt', item:<supplier>, receiptId, amount}
--
-- crew_receipt_remove: the crew member who uploaded it can delete it for 24
-- hours (mistakes); it removes the receipt and its expense and tombstones the
-- id in job.crewReceiptsGone. After 24 hours only the owner can delete.
--
-- The owner deletes in the portal (receipt row or the expense on the Money
-- tab); the page drops both and tombstones the id in crewReceiptsGone.
--
-- bp_jobs_keep_crew additionally:
--   * puts back crew-posted expenses (key 'crewrc:<id>') that an older copy
--     of the jobs array is missing, unless <id> is in crewReceiptsGone;
--   * drops 'crewrc:<id>' expenses whose <id> is in crewReceiptsGone.
-- On unchanged data it returns the same jobs (plus the empty arrays it
-- already added before).
--
-- Crew material REQUESTS still need approval; nothing changes there.

-- ---------------------------------------------------------------- 1 ---
-- the expense a crew receipt makes
create or replace function public.bp_crew_rc_expense(r jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'cat', 'Materials',
    'amt', round(coalesce((r->>'amount')::numeric, 0), 2),
    'note', coalesce(nullif(trim(coalesce(r->>'supplier', '')), ''), 'Crew') || ' receipt'
            || coalesce(' (from ' || nullif(split_part(trim(coalesce(r->'addedBy'->>'name', '')), ' ', 1), '') || ')', ''),
    'key', 'crewrc:' || (r->>'id'),
    'when', r->'at',
    'receiptId', r->>'id',
    'crewReceiptId', r->>'id',
    'by', coalesce(r->'addedBy'->>'name', ''),
    'crew', true);
$$;

-- ---------------------------------------------------------------- 2 ---
-- keep crew changes when an older copy of the jobs array is saved
create or replace function public.bp_jobs_keep_crew(p_old jsonb, p_new jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  nj jsonb; oj jsonb; o bigint; out jsonb := '[]'::jsonb;
  nm jsonb; om jsonb; gone jsonb; nitems jsonb; oitems jsonb; items jsonb; nlog jsonb; olog jsonb; lg jsonb;
  nr jsonb; orc jsonb; rgone jsonb; rc jsonb; nexp jsonb; oexp jsonb; exps jsonb;
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

    -- crew receipts and the expenses they made
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

      -- expenses: only touched when a crewrc: expense must be dropped or put back
      nexp := public.bp_jarr(nj->'expenses'); oexp := public.bp_jarr(oj->'expenses');
      if exists (select 1 from jsonb_array_elements(nexp) e
                  where jsonb_typeof(e) = 'object' and e->>'key' like 'crewrc:%' and rgone ? substr(e->>'key', 8))
         or exists (select 1 from jsonb_array_elements(oexp) e
                     where jsonb_typeof(e) = 'object' and e->>'key' like 'crewrc:%' and not rgone ? substr(e->>'key', 8)
                       and not exists (select 1 from jsonb_array_elements(nexp) x where jsonb_typeof(x) = 'object' and x->>'key' = e->>'key')) then
        select coalesce(jsonb_agg(e order by k), '[]'::jsonb) into exps from (
          select e, k from jsonb_array_elements(nexp) with ordinality a(e, k)
           where not (jsonb_typeof(e) = 'object' and e->>'key' like 'crewrc:%' and rgone ? substr(e->>'key', 8))
          union all
          select e, 100000 + k from jsonb_array_elements(oexp) with ordinality b(e, k)
           where jsonb_typeof(e) = 'object' and e->>'key' like 'crewrc:%' and not rgone ? substr(e->>'key', 8)
             and not exists (select 1 from jsonb_array_elements(nexp) x where jsonb_typeof(x) = 'object' and x->>'key' = e->>'key')) s;
        nj := nj || jsonb_build_object('expenses', exps);
      end if;
    end if;
    out := out || jsonb_build_array(nj);
  end loop;
  return out;
end $$;

-- ---------------------------------------------------------------- 3 ---
-- crew uploads a receipt: it is a Materials expense on the job right away
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
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  -- a flood guard: 30 receipts a day per job from the crew
  if (select count(*) from jsonb_array_elements(public.bp_jarr(j->'crewReceipts')) x
       where (x->>'at') ~ '^[0-9]+$' and (x->>'at')::bigint > now_ms - 86400000) >= 30 then
    return jsonb_build_object('ok', false, 'error', 'too many');
  end if;
  who := public.bp_crew_actor();
  r := jsonb_build_object('id', public.bp_rid('cr'), 'amount', amt, 'supplier', sup, 'note', note, 'image', img, 'mime', mime,
         'addedBy', who, 'at', now_ms, 'status', 'posted');
  j := j || jsonb_build_object('crewReceipts', public.bp_jarr(j->'crewReceipts') || jsonb_build_array(r),
                               'expenses', public.bp_jarr(j->'expenses') || jsonb_build_array(public.bp_crew_rc_expense(r)));
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

-- crew deletes their own receipt within 24 hours of uploading it
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
  if coalesce(r->>'status', '') not in ('pending', 'posted') then return jsonb_build_object('ok', false, 'error', 'already decided'); end if;
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  if coalesce(r->>'at', '') !~ '^[0-9]+$' or (r->>'at')::bigint < now_ms - 86400000 then
    return jsonb_build_object('ok', false, 'error', 'too late');
  end if;
  who := public.bp_crew_actor();
  j := j || jsonb_build_object(
    'crewReceipts', (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(public.bp_jarr(j->'crewReceipts')) with ordinality t(x, o) where x->>'id' is distinct from p_id),
    'crewReceiptsGone', public.bp_jarr(j->'crewReceiptsGone') || jsonb_build_array(p_id));
  if jsonb_typeof(j->'expenses') = 'array' then
    j := j || jsonb_build_object('expenses', (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(j->'expenses') with ordinality t(x, o)
                                               where x->>'key' is distinct from 'crewrc:' || p_id));
  end if;
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
-- receipts still waiting become posted, with their expense
-- (the keep-crew trigger only fires on jobs changes and passes this through:
--  old and new both carry the same receipts and the new expenses)
update public.portal_finance pf set jobs = (
  select jsonb_agg(case
      when jsonb_typeof(j) = 'object' and exists (select 1 from jsonb_array_elements(public.bp_jarr(j->'crewReceipts')) r where r->>'status' = 'pending')
      then j || jsonb_build_object(
             'crewReceipts', (select jsonb_agg(case when r->>'status' = 'pending' then r || jsonb_build_object('status', 'posted') else r end order by ro)
                                from jsonb_array_elements(j->'crewReceipts') with ordinality y(r, ro)),
             'expenses', public.bp_jarr(j->'expenses') || (
               select coalesce(jsonb_agg(public.bp_crew_rc_expense(r) order by ro), '[]'::jsonb)
                 from jsonb_array_elements(j->'crewReceipts') with ordinality y(r, ro)
                where r->>'status' = 'pending' and r ? 'id'
                  and not exists (select 1 from jsonb_array_elements(public.bp_jarr(j->'expenses')) e where e->>'key' = 'crewrc:' || (r->>'id'))))
      else j end order by o)
    from jsonb_array_elements(pf.jobs) with ordinality x(j, o))
 where jsonb_typeof(pf.jobs) = 'array'
   and exists (select 1 from jsonb_array_elements(pf.jobs) j, jsonb_array_elements(public.bp_jarr(j->'crewReceipts')) r
                where jsonb_typeof(j) = 'object' and r->>'status' = 'pending');
