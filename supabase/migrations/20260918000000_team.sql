-- Team: other people signing in to work on one contractor's account.
--
-- Everything in the portal is owned by one auth user. A team member is a
-- second auth user who acts on that owner's data. Rather than touch every
-- table's shape, one function answers "whose data does this session work
-- on": bp_owner(). For the owner it is their own id; for an accepted team
-- member it is the owner they were invited by. Every owner-scoped table
-- gets one extra policy written against that function. The existing
-- policies stay, so nothing an owner could do before changes.
--
-- Two roles. Office sees everything the owner sees except billing and the
-- team itself. Crew is projects, calendar and materials. Crew's limits are
-- applied in the portal, not here: jobs and finances live in one row, so
-- the database cannot hand out one without the other.

create table if not exists public.team_members (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  owner_email  text not null default '',
  member       uuid references auth.users(id) on delete set null,
  email        text not null,
  name         text not null default '',
  role         text not null default 'crew' check (role in ('office','crew')),
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists team_members_owner_email_idx on public.team_members (owner, lower(email));
create index if not exists team_members_member_idx on public.team_members (member) where member is not null;

-- whose account this session works on
create or replace function public.bp_owner() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select owner from public.team_members where member = auth.uid() and accepted_at is not null limit 1),
    auth.uid());
$$;
-- and what they are allowed to do there
create or replace function public.bp_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.team_members where member = auth.uid() and accepted_at is not null limit 1),
    'owner');
$$;
-- an invited person signing in for the first time: their email is on a row
-- with no member yet, so the row becomes theirs
create or replace function public.bp_team_claim() returns setof public.team_members
language plpgsql security definer set search_path = public as $$
begin
  update public.team_members
     set member = auth.uid(), accepted_at = coalesce(accepted_at, now())
   where member is null
     and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  return query select * from public.team_members where member = auth.uid() and accepted_at is not null;
end $$;
grant execute on function public.bp_owner() to authenticated;
grant execute on function public.bp_role() to authenticated;
grant execute on function public.bp_team_claim() to authenticated;

alter table public.team_members enable row level security;
drop policy if exists team_members_owner on public.team_members;
create policy team_members_owner on public.team_members
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists team_members_self on public.team_members;
create policy team_members_self on public.team_members
  for select to authenticated using (member = auth.uid());
grant select, insert, update, delete on public.team_members to authenticated;

-- one additive policy per owner-scoped table
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','appointments','conversations','messages','portal_finance','calculator_pricing',
    'support_requests','campaign_requests','contracts','farm_campaigns','booking_closed_days',
    'embed_themes','calendar_notes','suppliers','supplier_items','parts_lists','purchase_orders',
    'job_kits','roof_checks','competitors','social_posts','integrations','ai_brain']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I_team on public.%I', t, t);
      if t in ('competitors','social_posts','integrations','ai_brain') then
        execute format('create policy %I_team on public.%I for select to authenticated using (owner = public.bp_owner())', t, t);
      else
        execute format('create policy %I_team on public.%I for all to authenticated using (owner = public.bp_owner()) with check (owner = public.bp_owner())', t, t);
      end if;
    end if;
  end loop;
  -- settings are keyed by user_id rather than owner
  if to_regclass('public.client_settings') is not null then
    execute 'drop policy if exists client_settings_team on public.client_settings';
    execute 'create policy client_settings_team on public.client_settings for all to authenticated using (user_id = public.bp_owner()) with check (user_id = public.bp_owner())';
  end if;
end $$;
