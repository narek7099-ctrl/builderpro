-- Past projects stay in the homeowner's account.
-- 1. "New link" (a new token) carries the saved project over to the new
--    token, so it doesn't drop out of the account.
-- 2. Turning a link off no longer hides a finished job from a homeowner who
--    saved it: customer-portal opens it read-only for them (their sign-in is
--    checked against homeowner_projects), see supabase/functions/customer-portal.
create or replace function public.bp_ho_follow_token() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.token is distinct from old.token then
    update public.homeowner_projects hp set token = new.token
     where hp.token = old.token
       and not exists (select 1 from public.homeowner_projects x where x.user_id = hp.user_id and x.token = new.token);
  end if;
  return new;
exception when others then raise warning 'bp_ho_follow_token: %', sqlerrm; return new;
end $$;
revoke all on function public.bp_ho_follow_token() from public, anon, authenticated;
create or replace trigger bp_ho_follow_token before update of token on public.customer_portal_links
  for each row execute function public.bp_ho_follow_token();
