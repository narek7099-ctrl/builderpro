-- Security audit, October 2026.
-- 1. Functions nobody signed out (or any signed-in user) should be able to call
--    through the REST API. Triggers run as their owner and keep working.
revoke execute on function public.bp_job_of(uuid, text) from public, anon, authenticated;
revoke execute on function public.bp_team_role() from public, anon;
revoke execute on function public.bp_ghl_contracts() from public, anon, authenticated;
revoke execute on function public.bp_ghl_portal_finance() from public, anon, authenticated;
revoke execute on function public.bp_ghl_time_clock() from public, anon, authenticated;
revoke execute on function public.bp_nt_contacts() from public, anon, authenticated;
revoke execute on function public.bp_nt_contracts() from public, anon, authenticated;
revoke execute on function public.bp_nt_customer_change_orders() from public, anon, authenticated;
revoke execute on function public.bp_nt_customer_messages() from public, anon, authenticated;
revoke execute on function public.bp_nt_portal_finance() from public, anon, authenticated;
revoke execute on function public.bp_nt_stripe_payments() from public, anon, authenticated;
revoke execute on function public.bp_nt_team_messages() from public, anon, authenticated;
revoke execute on function public.bp_nt_worker_reviews() from public, anon, authenticated;
-- 2. A fixed search_path on every function the linter flagged, so a table
--    planted in another schema can never be picked up by mistake.
alter function public.bp_job_spent(jsonb) set search_path = public;
alter function public.bp_job_budget(jsonb) set search_path = public;
alter function public.bp_is_service() set search_path = public;
alter function public.customer_messages_guard() set search_path = public;
alter function public.customer_change_orders_guard() set search_path = public;
alter function public.customer_portal_links_guard() set search_path = public;
alter function public.notifications_guard() set search_path = public;
alter function public.notification_prefs_touch() set search_path = public;
alter function public.bp_metres(double precision, double precision, double precision, double precision) set search_path = public;
