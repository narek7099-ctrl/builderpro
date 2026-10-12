-- Homeowner accounts.
--
-- A homeowner signs up at builderpro-os.com/#my (homeowner-signup creates the
-- auth user with user_metadata.bp_role = 'homeowner'). Every project link they
-- open while signed in (#home=<token>) is saved to homeowner_projects, so
-- "My projects" lists all of them in one place, from every contractor.
-- homeowner_requests keeps the Find a Pro quote requests they sent.
--
-- The link token stays the credential for the project itself: saving it here
-- only remembers it for that one user, readable by nobody else (RLS). Saving
-- goes through bp_home_save, which only accepts a token for a live link.

create table if not exists public.homeowner_projects (
  user_id  uuid not null references auth.users (id) on delete cascade,
  token    text not null,
  added_at timestamptz not null default now(),
  opened_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.homeowner_projects enable row level security;
revoke all on public.homeowner_projects from public, anon, authenticated;
grant select, delete on public.homeowner_projects to authenticated;
create policy "homeowner projects: read own" on public.homeowner_projects for select to authenticated using (user_id = auth.uid());
create policy "homeowner projects: remove own" on public.homeowner_projects for delete to authenticated using (user_id = auth.uid());

create or replace function public.bp_home_save(p_token text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(p_token, '') !~ '^[a-f0-9]{40,64}$' then return false; end if;
  if not exists (select 1 from public.customer_portal_links where token = lower(p_token) and enabled) then return false; end if;
  insert into public.homeowner_projects (user_id, token) values (auth.uid(), lower(p_token))
  on conflict (user_id, token) do update set opened_at = now();
  return true;
end $$;
revoke all on function public.bp_home_save(text) from public, anon;
grant execute on function public.bp_home_save(text) to authenticated;

create table if not exists public.homeowner_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  pro_id     uuid,             -- bp_directory.id (the public id), never the owner's user id
  pro_name   text not null default '',
  service    text not null default '',
  details    text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists homeowner_requests_user_idx on public.homeowner_requests (user_id, created_at desc);
alter table public.homeowner_requests enable row level security;
revoke all on public.homeowner_requests from public, anon, authenticated;
grant select on public.homeowner_requests to authenticated;
grant select, insert on public.homeowner_requests to service_role;
create policy "homeowner requests: read own" on public.homeowner_requests for select to authenticated using (user_id = auth.uid());
