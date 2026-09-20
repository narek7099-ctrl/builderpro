-- NOT IN USE. Written for a BuilderPro-owned Stripe connection, which was
-- set aside: invoices are raised in the sub-account and charged through the
-- Stripe connected there. Harmless if already applied (two empty tables).
--
-- Stripe Connect: the contractor's own Stripe account, linked to BuilderPro.
--
-- Until now card payments went through the Stripe connection inside each
-- client's GoHighLevel sub-account, so the portal could only point at it and
-- hope. This links the account to BuilderPro directly: the contractor signs in
-- to Stripe once, we keep the resulting account id, and every charge is made
-- ON that account. The money never passes through us and we take nothing on
-- top, so the promise the Payouts page already makes stays literally true.
--
-- Standard accounts, not Express: the contractor owns the Stripe account, gets
-- their own Stripe dashboard, and handles their own disputes. We are only
-- allowed to act on it while they leave us connected.
--
-- Connecting a bank account is the owner's business alone, so unlike most
-- tables here stripe_accounts is NOT shared with the team. The payment log is,
-- because the office reconciles it against jobs.

create table if not exists public.stripe_accounts (
  owner             uuid primary key references auth.users(id) on delete cascade,
  account_id        text not null default '',
  livemode          boolean not null default false,
  -- Stripe's own view of the account, refreshed whenever we look
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due  text not null default '',   -- what Stripe still wants, if anything
  business_name     text not null default '',
  country           text not null default '',
  currency          text not null default 'usd',
  connected_at      timestamptz,
  disconnected_at   timestamptz,
  checked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists stripe_accounts_account_idx on public.stripe_accounts (account_id) where account_id <> '';

-- Every payment taken through a connected account. Written by the webhook
-- (service role), read by the portal so Payouts can show real money.
create table if not exists public.stripe_payments (
  id               uuid primary key default gen_random_uuid(),
  owner            uuid not null references auth.users(id) on delete cascade,
  account_id       text not null default '',
  payment_intent   text not null,
  checkout_session text not null default '',
  amount           bigint not null default 0,    -- minor units, as Stripe sends it
  fee              bigint not null default 0,    -- Stripe's cut, ours is always zero
  net              bigint not null default 0,
  currency         text not null default 'usd',
  status           text not null default 'succeeded',
  customer_name    text not null default '',
  customer_email   text not null default '',
  description      text not null default '',
  invoice_ref      text not null default '',     -- our invoice number, if the charge carried one
  job_id           uuid,
  paid_at          timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
-- one row per charge, however many times Stripe retries the webhook
create unique index if not exists stripe_payments_intent_idx on public.stripe_payments (payment_intent);
create index if not exists stripe_payments_owner_idx on public.stripe_payments (owner, paid_at desc);

alter table public.stripe_accounts enable row level security;
alter table public.stripe_payments enable row level security;

-- the owner alone: a team member must not be able to point payouts at
-- their own bank, and Office is explicitly kept out of billing
drop policy if exists stripe_accounts_owner on public.stripe_accounts;
create policy stripe_accounts_owner on public.stripe_accounts
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- the team can read what came in, because they reconcile it against jobs.
-- Nobody writes here from the browser; the webhook writes as service role.
drop policy if exists stripe_payments_read on public.stripe_payments;
create policy stripe_payments_read on public.stripe_payments
  for select to authenticated using (owner = public.bp_owner());

grant select, insert, update, delete on public.stripe_accounts to authenticated;
grant select on public.stripe_payments to authenticated;

create or replace function public.stripe_touch() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists stripe_accounts_touch on public.stripe_accounts;
create trigger stripe_accounts_touch before update on public.stripe_accounts
  for each row execute function public.stripe_touch();
