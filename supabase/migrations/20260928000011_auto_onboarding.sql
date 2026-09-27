-- Auto-onboarding: every new sign-up is tracked until the Builder team has
-- finished it; the scheduler now ticks every 5 min (team shifts stay 30 min).
alter table public.accounts add column if not exists onboard_state text not null default 'new', add column if not exists onboard_attempts int not null default 0;
select cron.alter_job((select jobid from cron.job where jobname='ai-team-shift'), schedule := '*/5 * * * *');
