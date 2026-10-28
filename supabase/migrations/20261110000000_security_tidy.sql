-- Security advisor tidy-up: a trigger-only function isn't callable from the API,
-- and the portal_finance merge functions run with a fixed search_path.
revoke execute on function public.bp_asset_serviced() from public, anon, authenticated;
alter function public.bp_item_mt(jsonb) set search_path = public;
alter function public.bp_merge_items(jsonb, jsonb, jsonb, boolean) set search_path = public;
alter function public.bp_portal_finance_merge() set search_path = public;
