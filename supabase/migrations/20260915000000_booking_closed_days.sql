-- Days a contractor closes off (holidays, crew away). The portal's Calendar
-- manages them; the public booking page and the staff picker both skip them.
--
-- Run in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.booking_closed_days (
  owner      uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  note       text default '',
  created_at timestamptz not null default now(),
  primary key (owner, day)
);

alter table public.booking_closed_days enable row level security;

drop policy if exists closed_days_own on public.booking_closed_days;
create policy closed_days_own on public.booking_closed_days
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

grant select, insert, update, delete on public.booking_closed_days to authenticated;
