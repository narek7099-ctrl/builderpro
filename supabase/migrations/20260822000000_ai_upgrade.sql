-- AI upgrade: persistent memory for the command-center AI, an audit log of every
-- action it runs, and booking capability for the client-facing AIs (Nova/Atlas).
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ---------- ai_memory: things the command-center AI remembers forever ----------
create table if not exists public.ai_memory (
  id          uuid primary key default gen_random_uuid(),
  owner_email text not null,
  note        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists ai_memory_owner_idx on public.ai_memory(owner_email, created_at desc);
alter table public.ai_memory enable row level security;
-- (no policies on purpose: only the service-role edge function reads/writes)

-- ---------- audit_log: every action the command center executes ----------
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      text not null default '',
  op         text not null,
  args       jsonb not null default '{}'::jsonb,
  ok         boolean,
  status     int,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_time_idx on public.audit_log(created_at desc);
alter table public.audit_log enable row level security;
-- (no policies on purpose: only the service-role edge function reads/writes)

-- ---------- ai_brain: give client AIs booking powers ----------
alter table public.ai_brain add column if not exists booking_calendar_id text default '';
alter table public.ai_brain add column if not exists ghl_location_id     text default '';
