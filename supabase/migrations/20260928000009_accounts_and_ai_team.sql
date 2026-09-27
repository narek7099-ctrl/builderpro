-- Accounts created by self-serve sign-up, and the AI team behind the new
-- command center. Accounts: the owner can read their own row. AI team
-- tables: no policies at all - only the admin-checked command function
-- (service role) touches them.
create table if not exists public.accounts (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  full_name        text not null default '',
  business         text not null default '',
  phone            text not null default '',
  trade            text not null default '',
  ghl_location_id  text not null default '',
  plan             text not null default 'trial',
  status           text not null default 'trial',     -- trial | active | past_due | cancelled
  trial_ends_at    timestamptz not null default now() + interval '14 days',
  setup_log        jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);
alter table public.accounts enable row level security;
drop policy if exists accounts_own on public.accounts;
create policy accounts_own on public.accounts for select to authenticated using (user_id = auth.uid());
revoke all on public.accounts from anon;
grant select on public.accounts to authenticated;

create table if not exists public.signup_attempts (
  id bigint generated always as identity primary key,
  ip text not null default '', email text not null default '', ok boolean not null default false,
  created_at timestamptz not null default now());
alter table public.signup_attempts enable row level security;
revoke all on public.signup_attempts from anon, authenticated;

create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  agent text not null, title text not null default 'New conversation',
  created_by text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.ai_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  role text not null, content jsonb not null, created_at timestamptz not null default now());
create index if not exists ai_messages_thread on public.ai_messages(thread_id, id);
create table if not exists public.ai_approvals (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.ai_threads(id) on delete cascade,
  agent text not null, tool text not null, input jsonb not null, summary text not null default '',
  status text not null default 'pending',   -- pending | approved | rejected | failed
  result jsonb, decided_by text not null default '', created_at timestamptz not null default now(), decided_at timestamptz);
create table if not exists public.ai_memory (
  id bigint generated always as identity primary key,
  agent text not null default 'all', note text not null, created_at timestamptz not null default now());
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_approvals enable row level security;
alter table public.ai_memory enable row level security;
revoke all on public.ai_threads, public.ai_messages, public.ai_approvals, public.ai_memory from anon, authenticated;
