-- a trigger function fires without EXECUTE; nobody should call it by hand
revoke execute on function public.team_chat_on_message() from public, anon, authenticated;

-- a sub's compliance summary is only for the business that hired them, or the sub themself
create or replace function public.bp_sub_compliance(p_sub uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
with latest as (
  select distinct on (kind) kind, expires, number
  from public.sub_documents
  where sub_id = p_sub and kind in ('coi','license','w9')
    and exists (select 1 from public.subcontractors s
                where s.id = p_sub
                  and (s.owner = public.bp_owner() or s.team_id in (select id from public.team_members where member = auth.uid())
                       or lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
  order by kind, expires desc nulls last, created_at desc),
st as (select kind, expires, number,
  case when kind = 'w9' or expires is null then 'valid'
       when expires < current_date then 'expired'
       when expires <= current_date + 30 then 'expiring' else 'valid' end s from latest)
select jsonb_build_object(
  'status', case when exists (select 1 from st where s = 'expired') then 'expired'
                 when not exists (select 1 from st where kind = 'coi') then 'missing'
                 when exists (select 1 from st where s = 'expiring') then 'expiring' else 'valid' end,
  'docs', coalesce((select jsonb_object_agg(kind, jsonb_build_object('expires', expires, 'number', number, 'status', s)) from st), '{}'::jsonb));
$$;
