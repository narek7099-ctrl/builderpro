-- Ready pool: HighLevel sub-accounts made ahead of time (while the agency is on
-- Agency Pro, which the API needs to create them). Sign-ups take one when
-- HighLevel won't create a new one.
create table if not exists public.ghl_pool (
  location_id text primary key,
  plan text not null,
  name text,
  created_at timestamptz not null default now(),
  taken_by uuid,
  taken_at timestamptz
);
alter table public.ghl_pool enable row level security;

create or replace function public.ghl_pool_take(p_plan text, p_user uuid) returns text
language sql security definer set search_path = public as $$
  update ghl_pool set taken_by = p_user, taken_at = now()
  where location_id = (select location_id from ghl_pool where plan = p_plan and taken_by is null
                       order by created_at limit 1 for update skip locked)
  returning location_id
$$;
revoke execute on function public.ghl_pool_take(text, uuid) from public, anon, authenticated;

-- the last BuilderPro status pushed to the house HighLevel account as a tag
alter table public.accounts add column if not exists house_synced text;
-- existing accounts start as already synced, so only changes from now on are tagged
update public.accounts set house_synced = case when status = 'trial' and trial_ends_at < now() + interval '3 days' then 'trial_ending' else coalesce(status, '') end
where house_synced is null;
