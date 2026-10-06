-- Inspection reports: the write-up from a site visit, typed like a document,
-- with photos. Started from a contact (a lead being inspected) or from a
-- project. A report written on a contact shows on that contact's project too
-- once the lead becomes a job (the project tab reads by job_id or contact_id).
--
-- Who sees what (the whole team of one business, public.bp_owner()):
--   owner / office  every report of the business
--   crew / subs     reports they wrote, and reports on a project they are
--                   assigned to (bp_crew_sees_job on the project record)
-- Anyone on the team can write a report; only its author, the owner or the
-- office can change or remove it once written.
--
-- Photos go to the private project-files bucket under
-- <owner>/<report id>/inspection/..., which the existing team policies allow.
-- The row keeps only their references, "sb:<path>".

create table if not exists public.inspection_reports (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default public.bp_owner(),
  contact_id   text not null default '',
  contact_name text not null default '',
  address      text not null default '',
  job_id       text not null default '',
  title        text not null default 'Inspection report',
  kind         text not null default 'inspection',
  body         text not null default '',          -- the report, as sanitised HTML
  photos       jsonb not null default '[]'::jsonb, -- [{ref, cap, at}]
  status       text not null default 'draft' check (status in ('draft', 'final')),
  author       uuid not null default auth.uid(),
  author_name  text not null default '',
  inspected_on date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists inspection_reports_owner_contact_idx on public.inspection_reports (owner, contact_id);
create index if not exists inspection_reports_owner_job_idx on public.inspection_reports (owner, job_id);

-- a crew login may see a report on a project it is assigned to
create or replace function public.bp_crew_sees_job_id(p_job text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_job, '') <> '' and exists (
    select 1 from public.portal_finance pf, jsonb_array_elements(public.bp_jarr(pf.jobs)) j
     where pf.owner = public.bp_owner() and j->>'id' = p_job and public.bp_crew_sees_job(j));
$$;
revoke all on function public.bp_crew_sees_job_id(text) from public, anon;

alter table public.inspection_reports enable row level security;

create policy "inspections: read team" on public.inspection_reports for select to authenticated
  using (owner = public.bp_owner()
         and (public.bp_role() in ('owner', 'office') or author = auth.uid() or public.bp_crew_sees_job_id(job_id)));
create policy "inspections: write team" on public.inspection_reports for insert to authenticated
  with check (owner = public.bp_owner() and author = auth.uid()
              and (public.bp_role() in ('owner', 'office') or job_id = '' or public.bp_crew_sees_job_id(job_id)));
create policy "inspections: edit own or office" on public.inspection_reports for update to authenticated
  using (owner = public.bp_owner() and (public.bp_role() in ('owner', 'office') or author = auth.uid()))
  with check (owner = public.bp_owner());
create policy "inspections: remove own or office" on public.inspection_reports for delete to authenticated
  using (owner = public.bp_owner() and (public.bp_role() in ('owner', 'office') or author = auth.uid()));

create or replace function public.inspection_reports_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.owner := old.owner; new.author := old.author; return new; end $$;
drop trigger if exists inspection_reports_touch on public.inspection_reports;
create trigger inspection_reports_touch before update on public.inspection_reports
  for each row execute function public.inspection_reports_touch();
