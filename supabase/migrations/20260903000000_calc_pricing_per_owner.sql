-- Calculator pricing per account: each client owns their own pricing row per
-- calculator. Rows with owner NULL are the agency defaults that power the
-- public homepage demo calculators (read anonymously).

alter table public.calculator_pricing add column if not exists owner uuid default auth.uid();

-- old shape was one shared row per calc_id (PK calc_id) — replace with
-- one row per (calc_id, owner), where at most one default (NULL-owner) row per calc
alter table public.calculator_pricing drop constraint if exists calculator_pricing_pkey;
alter table public.calculator_pricing drop constraint if exists calc_pricing_calc_owner_key;
alter table public.calculator_pricing
  add constraint calc_pricing_calc_owner_key unique nulls not distinct (calc_id, owner);

alter table public.calculator_pricing enable row level security;

drop policy if exists calc_pricing_sel on public.calculator_pricing;
create policy calc_pricing_sel on public.calculator_pricing
  for select using (owner is null or owner = auth.uid());

drop policy if exists calc_pricing_ins on public.calculator_pricing;
create policy calc_pricing_ins on public.calculator_pricing
  for insert with check (owner = auth.uid());

drop policy if exists calc_pricing_upd on public.calculator_pricing;
create policy calc_pricing_upd on public.calculator_pricing
  for update using (owner = auth.uid()) with check (owner = auth.uid());
