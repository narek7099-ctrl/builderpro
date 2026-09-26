-- Only the lead-intake / lead-email functions (service role) call these. Left open, anyone who
-- knew a source's inbox address could read its webhook secret through lead_source_for_inbox.
revoke execute on function public.lead_source_for_inbox(text) from public, anon, authenticated;
revoke execute on function public.lead_source_for_hook(uuid, text) from public, anon, authenticated;
revoke execute on function public.lead_source_bump(uuid) from public, anon, authenticated;
grant execute on function public.lead_source_for_inbox(text) to service_role;
grant execute on function public.lead_source_for_hook(uuid, text) to service_role;
grant execute on function public.lead_source_bump(uuid) to service_role;
