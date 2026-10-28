-- Sign-ups that were started but not finished (name, email, phone from the first step).
-- After 45 minutes without an account, the ghl-diag watcher tags them bp-demo-request
-- in the house HighLevel account (workflow W1).
create table if not exists public.signup_interest (
  email text primary key,
  name text,
  phone text,
  plan text,
  ip text,
  created_at timestamptz not null default now(),
  tagged_at timestamptz,
  note text
);
alter table public.signup_interest enable row level security;

-- When an owner last opened the portal; 7 days without a visit tags bp-inactive-7d (W7).
alter table public.accounts add column if not exists last_seen_at timestamptz;
alter table public.accounts add column if not exists inactive_tagged_at timestamptz;
-- accounts that exist today start as already handled, so nobody is tagged on day one
update public.accounts set inactive_tagged_at = now() where inactive_tagged_at is null;

create or replace function public.bp_touch() returns void
language sql security definer set search_path = public as $$
  update accounts set last_seen_at = now() where user_id = auth.uid()
$$;
revoke execute on function public.bp_touch() from public, anon;
grant execute on function public.bp_touch() to authenticated;
