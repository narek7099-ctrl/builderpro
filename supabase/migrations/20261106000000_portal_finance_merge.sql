-- Jobs and money entries merge item by item instead of "last save wins".
--
-- portal_finance keeps one row per owner with every job and money entry in two
-- JSON arrays. Two devices saving (owner on the phone, office on the desktop)
-- used to overwrite each other's edits. Now every write goes through a trigger
-- that merges by item id:
--   * the app stamps each job / entry it changed with _mt (ms since epoch) and
--     saves through portal_finance_save(); the newer _mt wins per item
--   * server functions that PATCH the row (payments, estimates, new projects)
--     don't stamp; an item they changed wins and gets stamped now
--   * items the write doesn't include are kept, unless the id is in `gone`
--     (id -> ms when it was deleted), which is how a delete travels

alter table public.portal_finance add column if not exists gone jsonb not null default '{}'::jsonb;

create or replace function public.bp_item_mt(e jsonb) returns bigint
language sql immutable as $$
  select case when jsonb_typeof(e->'_mt') = 'number' then (e->>'_mt')::numeric::bigint else 0 end
$$;

create or replace function public.bp_merge_items(old_a jsonb, new_a jsonb, gone jsonb, from_app boolean)
returns jsonb language plpgsql stable as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  olds jsonb := '{}'::jsonb;
  seen jsonb := '{}'::jsonb;
  head jsonb := '[]'::jsonb;
  body jsonb := '[]'::jsonb;
  e jsonb; o jsonb; pick jsonb; id text;
begin
  if jsonb_typeof(old_a) is distinct from 'array' then old_a := '[]'::jsonb; end if;
  if jsonb_typeof(new_a) is distinct from 'array' then new_a := '[]'::jsonb; end if;
  if jsonb_typeof(gone) is distinct from 'object' then gone := '{}'::jsonb; end if;
  for e in select value from jsonb_array_elements(old_a) loop
    id := e->>'id';
    if id is not null then olds := olds || jsonb_build_object(id, e); end if;
  end loop;
  for e in select value from jsonb_array_elements(new_a) loop
    id := e->>'id';
    if id is null then body := body || jsonb_build_array(e); continue; end if;
    if seen ? id then continue; end if;
    seen := seen || jsonb_build_object(id, true);
    o := olds->id;
    if o is null then
      pick := e;
    elsif from_app then
      pick := case when public.bp_item_mt(e) >= public.bp_item_mt(o) then e else o end;
    elsif (e - '_mt') = (o - '_mt') then
      pick := o;
    else
      pick := e || jsonb_build_object('_mt', greatest(now_ms, public.bp_item_mt(o) + 1));
    end if;
    if gone ? id and (gone->>id)::numeric >= public.bp_item_mt(pick) then continue; end if;
    body := body || jsonb_build_array(pick);
  end loop;
  -- kept from before: added on another device, or the writer never had it
  for e in select value from jsonb_array_elements(old_a) loop
    id := e->>'id';
    if id is null or seen ? id then continue; end if;
    if gone ? id and (gone->>id)::numeric >= public.bp_item_mt(e) then continue; end if;
    head := head || jsonb_build_array(e);
  end loop;
  return head || body;
end $$;

create or replace function public.bp_portal_finance_merge() returns trigger
language plpgsql as $$
declare
  from_app boolean := coalesce(current_setting('bp.pf_app', true), '') = '1';
  g jsonb := coalesce(old.gone, '{}'::jsonb);
  k text; v jsonb;
  cutoff bigint := ((extract(epoch from now()) - 90 * 86400) * 1000)::bigint;
begin
  -- tombstones: keep the latest per id, forget ones older than 90 days
  for k, v in select key, value from jsonb_each(coalesce(new.gone, '{}'::jsonb)) loop
    if jsonb_typeof(v) = 'number' and (not g ? k or (g->>k)::numeric < v::text::numeric) then g := g || jsonb_build_object(k, v); end if;
  end loop;
  g := coalesce((select jsonb_object_agg(key, value) from jsonb_each(g) where jsonb_typeof(value) = 'number' and value::text::numeric >= cutoff), '{}'::jsonb);
  new.gone := g;
  new.jobs := public.bp_merge_items(old.jobs, new.jobs, g, from_app);
  new.fin := public.bp_merge_items(old.fin, new.fin, g, from_app);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists portal_finance_merge on public.portal_finance;
create trigger portal_finance_merge before update on public.portal_finance
  for each row execute function public.bp_portal_finance_merge();

-- the app's save: merges under the caller's own row rules (RLS applies) and
-- hands back the merged copy so the device can pick up the other device's edits
create or replace function public.portal_finance_save(p_jobs jsonb, p_fin jsonb, p_gone jsonb default '{}'::jsonb, p_owner uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.portal_finance%rowtype;
begin
  perform set_config('bp.pf_app', '1', true);
  insert into public.portal_finance as pf (owner, jobs, fin, gone)
    values (coalesce(p_owner, auth.uid()), coalesce(p_jobs, '[]'::jsonb), coalesce(p_fin, '[]'::jsonb), coalesce(p_gone, '{}'::jsonb))
  on conflict (owner) do update set jobs = excluded.jobs, fin = excluded.fin, gone = excluded.gone
  returning * into r;
  perform set_config('bp.pf_app', '', true);
  return jsonb_build_object('jobs', r.jobs, 'fin', r.fin, 'gone', r.gone);
end $$;

grant execute on function public.portal_finance_save(jsonb, jsonb, jsonb, uuid) to authenticated;
revoke execute on function public.portal_finance_save(jsonb, jsonb, jsonb, uuid) from anon, public;
