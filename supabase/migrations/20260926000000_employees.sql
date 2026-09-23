-- Employees, and the hours they put into jobs.
--
-- Deliberately NOT payroll. Running payroll means withholding taxes, filing
-- with the IRS and the state, and moving money — regulated work where a bug
-- becomes the customer's tax liability rather than our support ticket. Every
-- contractor already pays through Gusto, QuickBooks, ADP or a bookkeeper,
-- and none of them will switch to a roofing CRM for it.
--
-- What they do lack is job costing on labour. A payroll provider knows Dave
-- earned $1,240 last week; it has no idea $780 of that went into the Smith
-- roof. So contractors guess at labour when they quote and find out whether
-- they were right months later, if at all. This is the one place that knows
-- both the hours and the job, so this is where that gets answered.
--
-- Separate from team_members on purpose. That table is about who can sign
-- in. A roofer on a crew does not need a login, and an office manager who
-- does is not necessarily on the payroll. Conflating them would force a
-- login on every labourer and put every employee's pay rate behind an
-- invitation.

create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  trade       text not null default '',          -- roofer, foreman, labourer, office
  -- W-2 employees and 1099 subcontractors are both "people who worked on the
  -- job" for costing, and completely different for tax. Kept on one table
  -- with a flag rather than two tables, because every question this software
  -- asks ("what did labour cost on the Smith roof") spans both.
  kind        text not null default 'w2' check (kind in ('w2','1099')),
  pay_type    text not null default 'hourly' check (pay_type in ('hourly','salary','day')),
  rate        numeric not null default 0,        -- per hour, per day, or per year
  -- What the employer pays ON TOP of the wage: FICA, unemployment, workers'
  -- comp. It matters more in roofing than almost any trade — comp rates for
  -- roofing classifications are among the highest there are, so a $25/hr
  -- roofer really costs $32-38. A contractor budgeting at $25 is underwater
  -- before the first bundle is opened.
  --
  -- Theirs to set, not ours to guess: comp rates vary by state and carrier,
  -- and a number we invented would be wrong in a way that looks authoritative.
  -- Zero for 1099, where there is no burden to add.
  burden_pct  numeric not null default 0 check (burden_pct >= 0 and burden_pct <= 200),
  active      boolean not null default true,
  notes       text not null default '',
  -- if this person also signs in, the team row they use
  team_id     uuid references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.employees enable row level security;
create index if not exists employees_owner on public.employees (owner, active, name);

-- bp_owner() so an invited office manager sees the same people the owner
-- does; the portal decides whether a crew member may open the page at all.
drop policy if exists employees_own on public.employees;
create policy employees_own on public.employees
  for all using (owner = public.bp_owner()) with check (owner = public.bp_owner());

-- ------------------------------------------------------------------ hours ---
-- One row per person per job per day. Not a clock-in/clock-out pair: crews
-- on a roof do not clock out for lunch and back in, and a schema that
-- insists on it collects fiction. Hours for the day, entered at the end of
-- it by whoever is keeping track, is what actually gets recorded.
create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  job_id      text not null default '',          -- the job blob's own id
  job_name    text not null default '',          -- kept so old entries read sensibly if a job is deleted
  worked_on   date not null default current_date,
  hours       numeric not null default 0 check (hours >= 0 and hours <= 24),
  -- Overtime is stored, never inferred. The federal rule is over 40 in a
  -- week, but several states count over 8 in a day, and some have a seventh
  -- consecutive day rule. Computing it from a rule we picked would quietly
  -- underpay somebody in California, so the person entering it says.
  ot_hours    numeric not null default 0 check (ot_hours >= 0 and ot_hours <= 24),
  note        text not null default '',
  -- the burdened cost of this entry, frozen when it was written. A rate
  -- change next spring must not silently rewrite what last autumn's jobs
  -- cost — the margin on a finished job is history, not a live calculation.
  cost        numeric not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.time_entries enable row level security;
create index if not exists time_entries_owner on public.time_entries (owner, worked_on desc);
create index if not exists time_entries_job on public.time_entries (owner, job_id);
create index if not exists time_entries_emp on public.time_entries (employee_id, worked_on desc);

drop policy if exists time_entries_own on public.time_entries;
create policy time_entries_own on public.time_entries
  for all using (owner = public.bp_owner()) with check (owner = public.bp_owner());

-- --------------------------------------------------------- what jobs cost ---
-- Labour per job, which is what the project budget's labour line reads.
create or replace view public.job_labour
with (security_invoker = true) as
  select owner, job_id,
         sum(hours)              as hours,
         sum(ot_hours)           as ot_hours,
         sum(cost)               as cost,
         count(distinct employee_id) as people,
         max(worked_on)          as last_day
    from public.time_entries
   group by owner, job_id;

-- ------------------------------------------------------- what to pay out ---
-- A pay period, per person, ready to be typed or imported into whatever they
-- actually run payroll through. Gross only, and gross is all it claims: no
-- withholding, no filing, no deductions. Saying "net pay" here would be a
-- number somebody trusts and we have no right to compute.
create or replace function public.payroll_period(p_from date, p_to date)
returns table (
  employee_id uuid, name text, kind text, pay_type text, rate numeric,
  hours numeric, ot_hours numeric, gross numeric, burdened numeric, jobs bigint
) language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.kind, e.pay_type, e.rate,
         coalesce(sum(t.hours), 0)    as hours,
         coalesce(sum(t.ot_hours), 0) as ot_hours,
         -- time and a half on the overtime hours, which is the federal floor.
         -- Day rate and salary do not accrue it here: those are agreements
         -- about the week, and guessing at the arithmetic would be worse
         -- than leaving it to the person who made the agreement.
         case when e.pay_type = 'hourly'
              then round(coalesce(sum(t.hours), 0) * e.rate
                       + coalesce(sum(t.ot_hours), 0) * e.rate * 1.5, 2)
              when e.pay_type = 'day'
              then round(coalesce(sum(t.hours), 0) / 8.0 * e.rate, 2)
              else 0 end              as gross,
         coalesce(sum(t.cost), 0)     as burdened,
         count(distinct t.job_id)     as jobs
    from public.employees e
    left join public.time_entries t
           on t.employee_id = e.id
          and t.worked_on between p_from and p_to
   where e.owner = public.bp_owner()
   group by e.id, e.name, e.kind, e.pay_type, e.rate
   having coalesce(sum(t.hours), 0) > 0 or coalesce(sum(t.ot_hours), 0) > 0
   order by e.name;
$$;
revoke all on function public.payroll_period(date, date) from public;
grant execute on function public.payroll_period(date, date) to authenticated;

comment on function public.payroll_period(date, date) is
  'Gross pay per person for a period, for export to a real payroll provider.
   Gross only — no withholding, no filing, no deductions. This software does
   not run payroll and must not appear to.';
