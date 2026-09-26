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

-- ---------- keys, generated here and kept in Vault ----------
-- The token-encryption key and the scheduler's secret. mail-connect reads them
-- through mail_vault(), callable by the service role only, so neither has to
-- be pasted into the function's secrets.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'mail_token_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'mail_token_key', 'mail-connect: encrypts stored inbox sign-ins');
  end if;
  if not exists (select 1 from vault.secrets where name = 'mail_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'mail_cron_secret', 'mail-connect: authenticates the 5-minute check');
  end if;
end $$;

create or replace function public.mail_vault(p_name text) returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = p_name and p_name in ('mail_token_key', 'mail_cron_secret') limit 1;
$$;
revoke all on function public.mail_vault(text) from public, anon, authenticated;
grant execute on function public.mail_vault(text) to service_role;

-- ---------- every five minutes, the secret read from Vault at run time ----------
select cron.unschedule('mail-connect-poll') where exists (select 1 from cron.job where jobname = 'mail-connect-poll');
select cron.schedule('mail-connect-poll', '*/5 * * * *', $c$
  select net.http_post(
    url := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/mail-connect',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'mail_cron_secret')),
    body := '{"op":"poll"}'::jsonb)
$c$);
