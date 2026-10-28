-- Daily health check (function health-check): one row per run, read by the
-- Command Center's "System health" card. Service role only (RLS on, no policies).
create table if not exists public.health_checks (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean not null,
  problems jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  source text not null default 'daily'
);
alter table public.health_checks enable row level security;
create index if not exists health_checks_at on public.health_checks (at desc);

-- What the scheduler did: each job's last run and failures in the last day, and how
-- many background web calls failed in the last 6 hours (pg_net keeps them about that long).
create or replace function public.bp_health_db() returns jsonb
language sql security definer set search_path = public, cron, net as $$
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
        'failed', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours'),
        'why', (select left(d.return_message, 160) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' order by d.start_time desc limit 1)))
      from cron.job j), '[]'::jsonb),
    'calls', (select jsonb_build_object('total', count(*), 'failed', count(*) filter (where status_code is null or status_code >= 500))
      from net._http_response where created > now() - interval '6 hours'));
$$;
revoke all on function public.bp_health_db() from public, anon, authenticated;
grant execute on function public.bp_health_db() to service_role;

-- Every day at 14:41 UTC (morning in the US).
select cron.unschedule('health-check-daily') where exists (select 1 from cron.job where jobname = 'health-check-daily');
select cron.schedule('health-check-daily', '41 14 * * *', $cron$
  select net.http_post(url:='https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/health-check',
    headers:=jsonb_build_object('x-cron-key',(select value from ai_config where key='cron_key'),'Content-Type','application/json'),
    body:='{}'::jsonb, timeout_milliseconds:=60000)
$cron$);
