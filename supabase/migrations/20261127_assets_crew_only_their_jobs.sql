-- 2026-11-27: crew members see only the equipment at their own jobs (applied to the live project).
-- Owner and office see everything as before; subcontractors still see nothing.
create or replace function public.bp_crew_sees_asset(p_job text, p_contact text, p_by uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.bp_team_role() <> 'crew'
      or p_by = auth.uid()
      or public.bp_crew_sees_job_id(p_job)
      or (coalesce(p_contact, '') <> '' and exists (
            select 1 from public.portal_finance pf, jsonb_array_elements(public.bp_jarr(pf.jobs)) j
             where pf.owner = public.bp_owner()
               and coalesce(j->>'contactId', '') = p_contact
               and coalesce(j->>'status', '') <> 'quote'
               and public.bp_crew_sees_job(j)));
$$;
revoke all on function public.bp_crew_sees_asset(text, text, uuid) from public;
grant execute on function public.bp_crew_sees_asset(text, text, uuid) to authenticated;

alter policy assets_read on public.assets
  using ((owner = bp_owner()) and (bp_role() <> 'sub') and bp_crew_sees_asset(job_id, contact_id, created_by));
alter policy assets_edit on public.assets
  using ((owner = bp_owner()) and (bp_role() <> 'sub') and bp_crew_sees_asset(job_id, contact_id, created_by))
  with check ((owner = bp_owner()) and (bp_role() <> 'sub') and bp_crew_sees_asset(job_id, contact_id, created_by));
alter policy asset_services_read on public.asset_services
  using ((owner = bp_owner()) and (bp_role() <> 'sub') and (bp_team_role() <> 'crew' or exists (
    select 1 from public.assets a where a.id = asset_services.asset_id and bp_crew_sees_asset(a.job_id, a.contact_id, a.created_by))));
alter policy asset_services_add on public.asset_services
  with check ((owner = bp_owner()) and (bp_role() <> 'sub') and (bp_team_role() <> 'crew' or exists (
    select 1 from public.assets a where a.id = asset_services.asset_id and bp_crew_sees_asset(a.job_id, a.contact_id, a.created_by))));
revoke execute on function public.bp_crew_sees_asset(text, text, uuid) from anon;
