-- 24/7 AI team: pg_cron calls the command function every 30 minutes; each
-- call runs one team's shift (round-robin), so every team works every 3 hours.
-- ai_config holds the scheduler's key and the on/off switch; service role only.
create table if not exists public.ai_config (key text primary key, value text not null default '');
alter table public.ai_config enable row level security;
revoke all on public.ai_config from anon, authenticated;
insert into public.ai_config(key,value) values ('cron_key', encode(gen_random_bytes(24),'hex')), ('shifts_on','true') on conflict (key) do nothing;
select cron.unschedule('ai-team-shift') where exists (select 1 from cron.job where jobname='ai-team-shift');
select cron.schedule('ai-team-shift', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/command?shift',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select value from public.ai_config where key='cron_key')),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
$$);
