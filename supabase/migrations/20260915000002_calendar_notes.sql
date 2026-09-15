-- The owner's own calendar entries: to-dos and notes on a day, outside
-- GoHighLevel. Shown on the Calendar's "Everything" view next to inspections
-- and jobs.

create table if not exists public.calendar_notes (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  kind       text not null default 'todo' check (kind in ('todo','note')),
  text       text not null default '',
  at         text default '',            -- optional "9:30 AM" style time, free text
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_notes_owner_day_idx on public.calendar_notes(owner, day);

alter table public.calendar_notes enable row level security;

drop policy if exists calendar_notes_own on public.calendar_notes;
create policy calendar_notes_own on public.calendar_notes
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

grant select, insert, update, delete on public.calendar_notes to authenticated;
