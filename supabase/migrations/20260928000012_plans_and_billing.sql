-- Plans and billing for self-serve sign-up: the plan they picked, its price,
-- every onboarding answer (profile), and the Stripe customer/subscription.
alter table public.accounts
  add column if not exists profile jsonb not null default '{}'::jsonb,
  add column if not exists price_monthly int not null default 0,
  add column if not exists stripe_customer_id text not null default '',
  add column if not exists stripe_subscription_id text not null default '',
  add column if not exists checkout_url text not null default '';
drop policy if exists accounts_own on public.accounts;
create policy accounts_own on public.accounts for select to authenticated using (user_id = auth.uid());
