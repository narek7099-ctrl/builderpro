-- Stores the agency-level GHL OAuth tokens from the marketplace app install.
-- Only the edge functions (service role) touch this; no anon/user access.
create table if not exists public.ghl_oauth (
  id            int primary key default 1,
  access_token  text,
  refresh_token text,
  company_id    text,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now(),
  constraint ghl_oauth_singleton check (id = 1)
);
alter table public.ghl_oauth enable row level security;
-- (no policies on purpose: service-role edge functions bypass RLS; nobody else can read tokens)
