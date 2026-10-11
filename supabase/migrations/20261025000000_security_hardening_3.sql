-- bp_crew_job returns the whole project, money included. Only the crew_* functions
-- (security definer) need it; a crew login must not call it straight from the API.
revoke execute on function public.bp_crew_job(text) from public, anon, authenticated;
