-- Project files: photos, documents and blueprints, in Storage rather than
-- inside the project record.
--
-- A project now holds up to 24 photos, 32 documents and 8 blueprints. Kept as
-- data URLs in the jobs JSON (how photos were stored before), that is tens of
-- megabytes per account: past the browser's ~5 MB localStorage cap, and sent
-- in full on every save. So the file goes to this bucket and the project keeps
-- only its path.
--
-- Private: blueprints, contracts and insurance papers are not for the open
-- web. The portal reads them through short-lived signed URLs. Paths are
-- <business owner id>/<project id>/<kind>/<file>, and the whole team of that
-- business (public.bp_owner(), from 20260918000000_team.sql) can read and
-- write inside it, nobody else.
--
-- Run in the Supabase SQL editor (or `supabase db push`).

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 26214400)          -- 25 MB a file
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "project files: read team"   on storage.objects;
drop policy if exists "project files: upload team" on storage.objects;
drop policy if exists "project files: update team" on storage.objects;
drop policy if exists "project files: delete team" on storage.objects;

create policy "project files: read team" on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and (storage.foldername(name))[1] = public.bp_owner()::text);
create policy "project files: upload team" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and (storage.foldername(name))[1] = public.bp_owner()::text);
create policy "project files: update team" on storage.objects for update to authenticated
  using (bucket_id = 'project-files' and (storage.foldername(name))[1] = public.bp_owner()::text);
create policy "project files: delete team" on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and (storage.foldername(name))[1] = public.bp_owner()::text);
