-- BuilderPro: client logo storage
-- A public bucket `client-logos`. Each client can upload only into their own
-- folder (named by their user id); anyone can read (so the logo URL renders and
-- you, the operator, can view it). The public URL is saved into
-- client_settings.data.company.logoUrl by the dashboard.

insert into storage.buckets (id, name, public)
values ('client-logos', 'client-logos', true)
on conflict (id) do nothing;

-- Public read of logos.
drop policy if exists "client-logos public read" on storage.objects;
create policy "client-logos public read"
  on storage.objects for select
  using (bucket_id = 'client-logos');

-- A client can upload into their own folder only  (path = <user_id>/logo.ext).
drop policy if exists "client-logos owner insert" on storage.objects;
create policy "client-logos owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'client-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A client can overwrite their own logo.
drop policy if exists "client-logos owner update" on storage.objects;
create policy "client-logos owner update"
  on storage.objects for update
  using (
    bucket_id = 'client-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A client can delete their own logo.
drop policy if exists "client-logos owner delete" on storage.objects;
create policy "client-logos owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'client-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Add the logo URL to the operator overview.
create or replace view public.client_settings_overview as
select
  s.email,
  s.data->'company'->>'name'        as business_name,
  s.data->'company'->>'trade'       as trade,
  s.data->'company'->>'phone'       as phone,
  s.data->'company'->>'serviceArea' as service_area,
  s.data->'company'->>'logoUrl'     as logo_url,
  s.data->'owner'->>'name'          as owner_name,
  s.data->>'autoReply'              as auto_reply,
  s.updated_at
from public.client_settings s
order by s.updated_at desc;
