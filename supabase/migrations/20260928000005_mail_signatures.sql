-- Each user's email signature, added to emails written in Compose.
create table if not exists public.mail_signatures (
  user_id    uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  html       text not null default '',
  auto       boolean not null default true,     -- add it to every new email
  updated_at timestamptz not null default now()
);
alter table public.mail_signatures enable row level security;
drop policy if exists mail_signatures_own on public.mail_signatures;
create policy mail_signatures_own on public.mail_signatures for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.mail_signatures from anon;
grant select, insert, update, delete on public.mail_signatures to authenticated;
