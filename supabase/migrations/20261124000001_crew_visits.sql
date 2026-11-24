-- 2026-11-24: visits a crew (or one person) is sent to that aren't project days:
-- inspections and site visits booked from the Calendar with "Who's going".
-- The owner's portal writes them; the crew sees theirs through crew_me() ('visits').
create table if not exists public.crew_visits (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default public.bp_owner(),
  crew_id text,
  employee_id text,
  day date not null,
  at_time text,
  dur_min int default 60,
  kind text default 'inspection',
  title text,
  customer text,
  address text,
  phone text,
  cancelled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists crew_visits_owner_day on public.crew_visits (owner, day);
alter table public.crew_visits enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'public.crew_visits'::regclass and polname = 'crew_visits_team') then
    create policy crew_visits_team on public.crew_visits for all using (owner = public.bp_owner()) with check (owner = public.bp_owner());
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.crew_visits'::regclass and polname = 'crew_visits_no_crew') then
    create policy crew_visits_no_crew on public.crew_visits as restrictive for all using (public.bp_team_role() <> 'crew') with check (public.bp_team_role() <> 'crew');
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.crew_visits'::regclass and polname = 'crew_visits_no_sub') then
    create policy crew_visits_no_sub on public.crew_visits as restrictive for all using (not public.bp_is_sub()) with check (not public.bp_is_sub());
  end if;
end $$;

-- crew_me(): add 'visits' (this crew's or this person's, yesterday to a month out)
do $$
declare d text := pg_get_functiondef('public.crew_me'::regproc);
begin
  if position('crew_visits' in d) = 0 then
    d := replace(d, 'declare e public.employees;', 'declare visits jsonb; e public.employees;');
    d := replace(d, '  return jsonb_build_object(', $q$  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'day', v.day, 'time', v.at_time, 'dur', v.dur_min, 'kind', v.kind,
      'title', v.title, 'customer', v.customer, 'addr', v.address, 'phone', v.phone) order by v.day, v.at_time), '[]'::jsonb)
    into visits from public.crew_visits v
   where v.owner = public.bp_owner() and not v.cancelled and v.day between current_date - 1 and current_date + 30
     and ((c is not null and v.crew_id = c->>'id') or (e.id is not null and v.employee_id = e.id::text));
  return jsonb_build_object($q$);
    d := replace(d, $q$'stats', stats,$q$, $q$'visits', coalesce(visits, '[]'::jsonb), 'stats', stats,$q$);
    execute d;
  end if;
end $$;
