-- "Book a walkthrough" on the homepage: a visitor (no account) asks for a call.
-- Saved like an unfinished sign-up, tagged bp-demo-request right away, and shown
-- in the Command Center's Requests card (a request with no owner account).
alter table public.signup_interest add column if not exists business text;
alter table public.signup_interest add column if not exists source text;
alter table public.support_requests alter column owner drop not null;
