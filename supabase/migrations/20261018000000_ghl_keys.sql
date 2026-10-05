-- Each client's HighLevel key (a Private Integration token made inside their
-- sub-account under Settings -> Private Integrations). The server functions
-- use it to reach that sub-account: invoices, estimates, the BP fields and
-- tags the workflows run on, the Jobs calendar. Saved from the Command
-- Center. Row level security is on with no policies, so only the server
-- (service role) can read or write it; no browser ever sees a key.
create table if not exists public.ghl_keys (
  location_id text primary key,
  token       text not null,
  label       text not null default '',
  checked_at  timestamptz,
  updated_at  timestamptz not null default now()
);
alter table public.ghl_keys enable row level security;
