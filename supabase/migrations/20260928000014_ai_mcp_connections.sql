-- Command Center connections: outside tools (Higgsfield, GitHub, Supabase,
-- Canva...) the AI teams reach through Claude's MCP connector. Tokens stay
-- server-side; only the command function (service role) reads this table.
create table if not exists public.ai_mcp (
  id bigint generated always as identity primary key,
  name text not null unique,
  label text not null default '',
  url text not null,
  token text not null default '',
  agents text[] not null default '{}',
  disabled_tools text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now());
alter table public.ai_mcp enable row level security;
revoke all on public.ai_mcp from anon, authenticated;
