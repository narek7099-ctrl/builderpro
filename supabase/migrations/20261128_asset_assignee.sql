-- Equipment has an employee assigned (2026-11-28).
-- Each piece of equipment is looked after by one team member. Crew logins see
-- only the equipment assigned to them (before: anything on jobs they work).
-- A tech who adds equipment themselves gets it assigned to them. Owner and
-- office see everything and pick who it goes to (portal/assets.js).
alter table public.assets add column if not exists assigned_to uuid references public.team_members(id) on delete set null;
alter table public.assets add column if not exists assigned_name text;
alter table public.assets add column if not exists assigned_at timestamptz;
create index if not exists assets_assigned_idx on public.assets(assigned_to);

-- crew see a record only when it is assigned to them
create or replace function public.bp_crew_sees_asset2(p_assigned uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.bp_team_role() <> 'crew'
      or (p_assigned is not null and exists (
            select 1 from public.team_members tm
             where tm.id = p_assigned and tm.member = auth.uid() and tm.owner = public.bp_owner()));
$$;

-- a tech's own new record is theirs
create or replace function public.bp_asset_self_assign()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare tm record;
begin
  if public.bp_team_role() = 'crew' then
    select id, coalesce(nullif(name, ''), email) as nm into tm
      from public.team_members where member = auth.uid() and owner = new.owner and accepted_at is not null limit 1;
    if tm.id is not null then
      new.assigned_to := tm.id; new.assigned_name := tm.nm; new.assigned_at := now();
    end if;
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_asset_self_assign') then
    create trigger bp_asset_self_assign before insert on public.assets for each row execute function public.bp_asset_self_assign();
  end if;
end $$;

alter policy assets_read on public.assets
  using ((owner = bp_owner()) and (bp_role() <> 'sub') and bp_crew_sees_asset2(assigned_to));
alter policy assets_edit on public.assets
  using ((owner = bp_owner()) and (bp_role() <> 'sub') and bp_crew_sees_asset2(assigned_to))
  with check ((owner = bp_owner()) and (bp_role() <> 'sub') and bp_crew_sees_asset2(assigned_to));
alter policy asset_services_read on public.asset_services
  using ((owner = bp_owner()) and (bp_role() <> 'sub') and ((bp_team_role() <> 'crew') or exists (
    select 1 from public.assets a where a.id = asset_services.asset_id and bp_crew_sees_asset2(a.assigned_to))));
alter policy asset_services_add on public.asset_services
  with check ((owner = bp_owner()) and (bp_role() <> 'sub') and ((bp_team_role() <> 'crew') or exists (
    select 1 from public.assets a where a.id = asset_services.asset_id and bp_crew_sees_asset2(a.assigned_to))));

-- who equipment can be assigned to: the owner's team (not subcontractors), for owner and office
create or replace function public.bp_team_people()
returns table(id uuid, name text, email text, role text, joined boolean)
language sql stable security definer set search_path to 'public' as $$
  select tm.id, coalesce(nullif(tm.name, ''), split_part(tm.email, '@', 1)), tm.email, tm.role, tm.member is not null
    from public.team_members tm
   where tm.owner = public.bp_owner() and public.bp_team_role() <> 'crew' and coalesce(tm.role, 'crew') <> 'sub'
   order by 2;
$$;
revoke all on function public.bp_team_people() from public, anon;
grant execute on function public.bp_team_people() to authenticated;
