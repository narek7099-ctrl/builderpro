-- Cloud-backed Finances + Active Jobs for the BuilderPro client portal.
-- One row per logged-in client holding their jobs and manual income/expense
-- entries, so the data follows them across devices instead of living in
-- localStorage. RLS: each client reads/writes only their own row.

create table if not exists public.portal_finance (
  owner      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  jobs       jsonb not null default '[]'::jsonb,
  fin        jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.portal_finance enable row level security;

drop policy if exists portal_finance_sel on public.portal_finance;
create policy portal_finance_sel on public.portal_finance
  for select using (owner = auth.uid());

drop policy if exists portal_finance_ins on public.portal_finance;
create policy portal_finance_ins on public.portal_finance
  for insert with check (owner = auth.uid());

drop policy if exists portal_finance_upd on public.portal_finance;
create policy portal_finance_upd on public.portal_finance
  for update using (owner = auth.uid()) with check (owner = auth.uid());

create or replace function public.portal_finance_touch() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists portal_finance_touch on public.portal_finance;
create trigger portal_finance_touch before update on public.portal_finance
  for each row execute function public.portal_finance_touch();
