-- 2026-11-24: the owner asked for no daily briefings ("they can just ask the CEO").
-- The AI Team brief was already removed; this pauses the AI CEO's morning
-- briefing run too. Asking the AI CEO and running a briefing by hand
-- (Briefing & map → run now) still work. Paused, not dropped: set active
-- back to true to bring the morning briefing back.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bp-ai-ceo-daily') then
    perform cron.alter_job((select jobid from cron.job where jobname = 'bp-ai-ceo-daily'), active := false);
  end if;
end $$;
