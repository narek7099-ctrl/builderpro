-- Crew lockdown: a crew login reads only what its portal needs.
--
-- Before this, the "_team" policies (owner = bp_owner()) let any accepted
-- team member, crew included, read and often write the owner's contacts,
-- contracts, settings, Stripe payments and more straight through the API.
-- The crew portal never uses those tables: it gets everything through the
-- security-definer crew_* RPCs, its own time_clock rows and team chat.
--
-- 1. A RESTRICTIVE policy on each of those tables refuses crew (and subs,
--    for whom bp_team_role() also answers 'crew'). Owner and office are
--    untouched. Tables that already check bp_team_role() <> 'crew'
--    (portal_finance, employees, time_entries, worker_reviews,
--    review_requests, subcontractors, sub_documents, client_settings writes)
--    and time_clock (crew reads its own punches) are left as they are.
-- 2. Storage (project-files): crew keeps
--      <owner>/<job>/...           jobs it is on (bp_crew_sees_job)
--      <owner>/employees/...       read any (teammates' photos), write only its own folder
--      <owner>/chat/<thread>/...   threads it is a member of
--    and nothing else (company licenses, other jobs, sub folders).

do $$
declare t text;
begin
  foreach t in array array['ai_brain','booking_closed_days','calculator_pricing','calendar_notes','campaign_requests',
    'client_settings','competitors','contacts','contracts','embed_themes','farm_campaigns','integrations','job_kits',
    'mail_connections','mail_templates','parts_lists','purchase_orders','roof_checks','social_posts','stripe_payments',
    'supplier_items','suppliers','support_requests'] loop
    if to_regclass('public.' || t) is not null and not exists (
         select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_no_crew') then
      execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.bp_team_role() <> ''crew'') with check (public.bp_team_role() <> ''crew'')', t || '_no_crew', t);
    end if;
  end loop;
end $$;

create or replace function public.bp_crew_path_ok(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f text[]; e public.employees;
begin
  if p_name like '%..%' then return false; end if;
  f := string_to_array(p_name, '/');
  if array_length(f, 1) < 3 or f[1] <> public.bp_owner()::text then return false; end if;
  if f[2] = 'employees' then
    if not p_write then return true; end if;
    e := public.bp_my_employee();
    return e.id is not null and f[3] = e.id::text;
  end if;
  if f[2] = 'chat' then
    return exists (select 1 from public.team_thread_members m where m.thread_id::text = f[3] and m.user_id = auth.uid());
  end if;
  if f[2] in ('subs', 'company') then return false; end if;
  return exists (select 1 from public.portal_finance pf, jsonb_array_elements(coalesce(pf.jobs, '[]'::jsonb)) j
                  where pf.owner = public.bp_owner() and j->>'id' = f[2] and public.bp_crew_sees_job(j));
end $$;
revoke all on function public.bp_crew_path_ok(text, boolean) from public, anon;
grant execute on function public.bp_crew_path_ok(text, boolean) to authenticated;

-- (subs have their own limits; the crew check skips them)
create policy "project files: crew limits read" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'project-files' or public.bp_team_role() <> 'crew' or public.bp_is_sub() or public.bp_crew_path_ok(name, false));
create policy "project files: crew limits upload" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'project-files' or public.bp_team_role() <> 'crew' or public.bp_is_sub() or public.bp_crew_path_ok(name, true));
create policy "project files: crew limits update" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'project-files' or public.bp_team_role() <> 'crew' or public.bp_is_sub() or public.bp_crew_path_ok(name, true));
create policy "project files: crew limits delete" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'project-files' or public.bp_team_role() <> 'crew' or public.bp_is_sub() or public.bp_crew_path_ok(name, true));
