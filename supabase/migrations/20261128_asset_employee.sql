-- Equipment is assigned to someone on the Employees list (2026-11-28).
-- employee_id is what the contractor picks. assigned_to (their login, when they
-- have one) follows it, and is what decides what a crew login can see. When
-- an employee gets a login later, their equipment follows them into the app.
alter table public.assets add column if not exists employee_id uuid references public.employees(id) on delete set null;
create index if not exists assets_employee_idx on public.assets(employee_id);

create or replace function public.bp_asset_follow_employee()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare e record;
begin
  if tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id then
    if new.employee_id is null then
      if tg_op = 'UPDATE' then new.assigned_to := null; new.assigned_name := null; new.assigned_at := null; end if;
    else
      select id, name, team_id into e from public.employees where id = new.employee_id and owner = new.owner;
      if e.id is null then raise exception 'That employee is not on your team.'; end if;
      new.assigned_to := e.team_id; new.assigned_name := e.name; new.assigned_at := now();
    end if;
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_asset_follow_employee') then
    create trigger bp_asset_follow_employee before insert or update of employee_id on public.assets
      for each row execute function public.bp_asset_follow_employee();
  end if;
end $$;

-- a tech's own new record: their employee row too (runs after the login is set)
create or replace function public.bp_asset_self_assign()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare tm record; em record;
begin
  if public.bp_team_role() = 'crew' then
    select id, coalesce(nullif(name, ''), email) as nm into tm
      from public.team_members where member = auth.uid() and owner = new.owner and accepted_at is not null limit 1;
    if tm.id is not null then
      select id, name into em from public.employees where team_id = tm.id and owner = new.owner limit 1;
      new.employee_id := em.id;
      new.assigned_to := tm.id; new.assigned_name := coalesce(em.name, tm.nm); new.assigned_at := now();
    end if;
  end if;
  return new;
end $$;

-- an employee linked to a login later (or a name change): their equipment follows
create or replace function public.bp_employee_assets_follow()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.team_id is distinct from old.team_id or new.name is distinct from old.name then
    update public.assets set assigned_to = new.team_id, assigned_name = new.name
     where employee_id = new.id and owner = new.owner;
  end if;
  return null;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_employee_assets_follow') then
    create trigger bp_employee_assets_follow after update of team_id, name on public.employees
      for each row execute function public.bp_employee_assets_follow();
  end if;
end $$;

-- the employee hears about it in their app
create or replace function public.bp_asset_follow_employee()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare e record; u uuid;
begin
  if tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id then
    if new.employee_id is null then
      if tg_op = 'UPDATE' then new.assigned_to := null; new.assigned_name := null; new.assigned_at := null; end if;
    else
      select id, name, team_id into e from public.employees where id = new.employee_id and owner = new.owner;
      if e.id is null then raise exception 'That employee is not on your team.'; end if;
      new.assigned_to := e.team_id; new.assigned_name := e.name; new.assigned_at := now();
      if e.team_id is not null then
        select member into u from public.team_members where id = e.team_id and accepted_at is not null;
        if u is not null then
          begin
            perform public.bp_notify(new.owner, 'asset_assigned', 'Equipment assigned to you',
              concat_ws(' · ', nullif(btrim(coalesce(new.name, '')), ''), nullif(btrim(coalesce(new.customer, '')), ''), nullif(btrim(coalesce(new.addr, '')), '')),
              'assets', new.job_id, 'normal', 'asset:' || new.id || ':' || e.id, 'user:' || u);
          exception when others then null;
          end;
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;
