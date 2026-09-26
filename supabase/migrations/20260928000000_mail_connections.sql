-- Connected inboxes: a contractor signs in with Microsoft once, and the
-- mail-connect function reads their lead emails (Angi, Thumbtack, ...) out of
-- Outlook every few minutes, with nothing to forward and nothing to paste.
--
-- The refresh token is the whole of the risk here: it opens the mailbox. So:
--   * it is stored encrypted (AES-GCM, key in the MAIL_TOKEN_KEY secret),
--   * the browser can never select it: authenticated users get column-level
--     access to everything BUT the token,
--   * only the mail-connect function (service role) writes or reads it.
-- What the function takes from the mailbox is limited in code to messages
-- whose sender matches one of the contractor's lead sources.
--
-- Run in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.mail_connections (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade,
  provider      text not null default 'outlook',         -- outlook (gmail once Google verifies the app)
  email         text not null default '',
  token_enc     text not null default '',                -- encrypted refresh token; never sent to a browser
  status        text not null default 'connected',       -- connected | error | revoked
  error         text not null default '',
  last_checked  timestamptz,
  last_found    timestamptz,
  found_total   integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (owner, provider)
);
alter table public.mail_connections enable row level security;

drop policy if exists mail_connections_read on public.mail_connections;
create policy mail_connections_read on public.mail_connections for select to authenticated
  using (owner = public.bp_owner());

-- column-level: the token column is not readable by signed-in users at all
revoke all on public.mail_connections from anon, authenticated;
grant select (id, owner, provider, email, status, error, last_checked, last_found, found_total, created_at)
  on public.mail_connections to authenticated;

-- ---------- the five-minute check (optional but recommended) ----------
-- Inboxes are also checked whenever the contractor opens Lead Sources or taps
-- "Check now", so nothing is lost without this; this makes it automatic.
--   1. Database > Extensions: enable pg_cron and pg_net (already on if you
--      set up the social scheduler).
--   2. Edge Functions > mail-connect > Secrets: CRON_SECRET (reuse the same one).
--   3. Put that value in place of CHANGE-ME below and run this block.
do $$
begin
  perform cron.schedule(
    'mail-connect-poll', '*/5 * * * *',
    $c$ select net.http_post(
          url     := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/mail-connect',
          headers := '{"Content-Type":"application/json","x-cron-secret":"CHANGE-ME"}'::jsonb,
          body    := '{"op":"poll"}'::jsonb) $c$);
exception when others then
  raise notice 'scheduler not installed (%). Enable pg_cron + pg_net and re-run this block.', sqlerrm;
end $$;
