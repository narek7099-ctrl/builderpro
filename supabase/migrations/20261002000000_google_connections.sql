-- Google Analytics / Search Console connection per owner (Marketing -> Website).
--
-- Written only by the google-analytics edge function (service role). The
-- refresh token is AES-GCM encrypted with the GOOGLE_TOKEN_KEY function secret
-- before it gets here, so the database never holds it in the clear.
--
-- RLS is on with NO policies: browsers cannot read or write this table at all
-- (not even the encrypted token). The portal asks the function's "status" op
-- for the email / chosen property instead.

create table if not exists public.google_connections (
  owner             uuid primary key references auth.users(id) on delete cascade,
  email             text,
  refresh_token_enc text not null,
  ga_property       text,          -- "properties/123456789"
  gsc_site          text,          -- "https://example.com/" or "sc-domain:example.com"
  connected_at      timestamptz not null default now()
);

alter table public.google_connections enable row level security;

revoke all on public.google_connections from anon, authenticated;
grant all on public.google_connections to service_role;
