-- Business settings (company, hours, crews, business number...), one row per
-- account. The portal wrote here since the Settings page was built, but the
-- table was never created, so settings only lived in each browser.
create table if not exists public.client_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null default '',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.client_settings enable row level security;
-- (policies are in 20260928000008_crew_portal.sql, which defines bp_team_role)
revoke all on public.client_settings from anon;
grant select, insert, update, delete on public.client_settings to authenticated;
insert into storage.buckets (id, name, public) values ('client-logos','client-logos', true) on conflict (id) do nothing;
drop policy if exists "client logos: upload own" on storage.objects;
create policy "client logos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "client logos: update own" on storage.objects;
create policy "client logos: update own" on storage.objects for update to authenticated
  using (bucket_id = 'client-logos' and (storage.foldername(name))[1] = auth.uid()::text);
