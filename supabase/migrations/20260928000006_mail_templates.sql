-- Email templates for Compose, shared by the whole business (bp_owner()).
create table if not exists public.mail_templates (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default public.bp_owner() references auth.users(id) on delete cascade,
  name       text not null default '',
  subject    text not null default '',
  html       text not null default '',
  created_at timestamptz not null default now()
);
alter table public.mail_templates enable row level security;
drop policy if exists mail_templates_team on public.mail_templates;
create policy mail_templates_team on public.mail_templates for all to authenticated
  using (owner = public.bp_owner()) with check (owner = public.bp_owner());
revoke all on public.mail_templates from anon;
grant select, insert, update, delete on public.mail_templates to authenticated;
create index if not exists mail_templates_owner on public.mail_templates(owner);
