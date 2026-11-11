-- The 20-seat pilot: the first sign-ups get a month free (30-day trial) instead of 14 days.
-- (Applied to the live database on 2026-11-11.)
alter table public.accounts add column if not exists pilot boolean not null default false;

-- how many seats the pilot has (edit this row to change it; 0 ends the pilot)
insert into public.ai_config (key, value) values ('pilot_seats', '20')
  on conflict (key) do nothing;

-- seats taken: pilot accounts with a trial or plan running, plus anyone mid-checkout in the
-- last 2 hours (so an abandoned checkout gives its seat back)
create or replace function public.pilot_seats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('total', t.total, 'taken', least(t.total, c.n), 'left', greatest(t.total - c.n, 0))
  from (select coalesce(nullif((select value from ai_config where key = 'pilot_seats'), '')::int, 0) as total) t,
       (select count(*)::int as n from accounts
          where pilot and (status in ('trial', 'active', 'past_due')
                           or (status = 'checkout' and created_at > now() - interval '2 hours'))) c
$$;
revoke all on function public.pilot_seats() from public;
grant execute on function public.pilot_seats() to anon, authenticated, service_role;
