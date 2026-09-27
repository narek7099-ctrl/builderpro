-- "Sign in with ..." for Command Center connections (Higgsfield, Canva...):
-- the renewable login and the app registration live with the connection;
-- in-flight sign-ins are kept for 20 minutes to match the return.
alter table public.ai_mcp
  add column if not exists refresh_token text not null default '',
  add column if not exists expires_at timestamptz,
  add column if not exists oauth jsonb not null default '{}'::jsonb;
create table if not exists public.ai_mcp_oauth_state (
  state text primary key, conn_id bigint not null references public.ai_mcp(id) on delete cascade,
  verifier text not null, created_at timestamptz not null default now());
alter table public.ai_mcp_oauth_state enable row level security;
revoke all on public.ai_mcp_oauth_state from anon, authenticated;
