-- Link a client's portal login to their GoHighLevel sub-account.
--
-- Onboarding creates the ai_brain row (with ghl_location_id) before the client
-- has ever signed in, so `owner` is null and every owner-scoped lookup — Payouts,
-- invoices, payment-sync — finds nothing. We record the email onboarding was run
-- with; the first time that person signs in, ai-brain-sync claims the row for them.
-- Run in the Supabase SQL editor (or `supabase db push`).

alter table public.ai_brain add column if not exists owner_email text;
create index if not exists ai_brain_owner_email_idx on public.ai_brain (lower(owner_email)) where owner is null;
