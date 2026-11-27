-- Every new project gets its homeowner link (customer_portal_links) by itself,
-- however it was made: computer, phone, Lisa or an offline save that syncs
-- later. Nothing is sent: the link just exists, so the automatic texts that
-- carry {{contact.bp_portal_link}} (ghl-events) never go out with a blank
-- link. If the homeowner already has a BuilderPro account, bp_ho_on_portal
-- adds the project to it, the same as pressing "Create link" did.
-- Only jobs that are new in this save (not in OLD.jobs), not samples.
-- A link the owner turned off stays off: on conflict do nothing.

create or replace function public.bp_portal_auto_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare jid text;
begin
  for jid in
    select distinct j->>'id'
      from jsonb_array_elements(case when jsonb_typeof(new.jobs) = 'array' then new.jobs else '[]'::jsonb end) j
     where coalesce(j->>'id', '') <> ''
       and coalesce(j->>'sample', '') not in ('true', '1')
       and (tg_op = 'INSERT' or jsonb_typeof(old.jobs) <> 'array'
            or not exists (select 1 from jsonb_array_elements(old.jobs) o where o->>'id' = j->>'id'))
  loop
    insert into public.customer_portal_links (owner, job_id) values (new.owner, jid) on conflict do nothing;
  end loop;
  return null;
exception when others then
  raise warning 'bp_portal_auto_link: %', sqlerrm;
  return null;
end $$;
revoke all on function public.bp_portal_auto_link() from public, anon, authenticated;

create or replace trigger bp_portal_auto_link after insert or update of jobs on public.portal_finance
  for each row execute function public.bp_portal_auto_link();
