-- Payroll is for the owner and the office (2026-11-18). payroll_period() limited rows to the
-- caller's company but not to the caller's role, so a crew or subcontractor login could call
-- it directly (/rest/v1/rpc/payroll_period) and read everyone's pay rate and gross pay. The
-- app never showed it to them; the database now refuses too: crew and subs get no rows.
-- Same function otherwise (create or replace, same signature and result).
create or replace function public.payroll_period(p_from date, p_to date)
 returns table(employee_id uuid, name text, kind text, pay_type text, rate numeric, hours numeric, ot_hours numeric, gross numeric, burdened numeric, jobs bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
     and public.bp_role() in ('owner', 'office')
   group by e.id, e.name, e.kind, e.pay_type, e.rate
   having coalesce(sum(t.hours), 0) > 0 or coalesce(sum(t.ot_hours), 0) > 0
   order by e.name;
$function$;
