-- Supabase-native contacts, so the dashboard no longer needs the GoHighLevel API.
-- Each logged-in client sees and manages only their own contacts (RLS by owner).

create extension if not exists "pgcrypto";

create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default '',
  phone       text default '',
  email       text default '',
  tags        text[] not null default '{}',
  notes       text default '',
  date_added  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists contacts_owner_idx on public.contacts(owner, date_added desc);

alter table public.contacts enable row level security;

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select using (owner = auth.uid());

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert with check (owner = auth.uid());

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete using (owner = auth.uid());

create or replace function public.contacts_touch() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts
  for each row execute function public.contacts_touch();
