-- When a plan is set to end (the client pressed Cancel; Stripe ends it at the end of the
-- period, so a trial is never charged). billing-webhook keeps it in step with Stripe.
alter table public.accounts add column if not exists cancel_at timestamptz;
