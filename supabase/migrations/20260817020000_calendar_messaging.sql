-- Supabase-native calendar + messaging, so the dashboard no longer needs the GHL API
-- for viewing appointments or conversations. (Outbound SMS/email send still routes
-- through GHL for now.) Everything is scoped per logged-in client via RLS.

create extension if not exists "pgcrypto";

-- ---------- appointments (calendar) ----------
create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete set null,
  contact_name text default '',
  title        text not null default 'Appointment',
  address      text default '',
  kind         text not null default 'jobs',      -- 'jobs' | 'inspection' | 'appointment'
  start_at     timestamptz not null,
  end_at       timestamptz,
  status       text not null default 'confirmed', -- confirmed | rescheduled | cancelled
  notes        text default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists appointments_owner_idx on public.appointments(owner, start_at);

-- ---------- conversations (messaging inbox) ----------
create table if not exists public.conversations (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete set null,
  contact_name text default '',
  phone        text default '',
  email        text default '',
  last_message text default '',
  last_dir     text default 'inbound',            -- inbound | outbound
  unread       int  not null default 0,
  last_at      timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists conversations_owner_idx on public.conversations(owner, last_at desc);

-- ---------- messages (threads) ----------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction       text not null default 'outbound', -- inbound | outbound
  msg_type        text not null default 'SMS',       -- SMS | Email
  body            text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists messages_convo_idx on public.messages(conversation_id, created_at);

-- ---------- RLS: each client sees only their own rows ----------
do $$
declare t text;
begin
  foreach t in array array['appointments','conversations','messages'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_sel on public.%I;', t, t);
    execute format('create policy %I_sel on public.%I for select using (owner = auth.uid());', t, t);
    execute format('drop policy if exists %I_ins on public.%I;', t, t);
    execute format('create policy %I_ins on public.%I for insert with check (owner = auth.uid());', t, t);
    execute format('drop policy if exists %I_upd on public.%I;', t, t);
    execute format('create policy %I_upd on public.%I for update using (owner = auth.uid()) with check (owner = auth.uid());', t, t);
    execute format('drop policy if exists %I_del on public.%I;', t, t);
    execute format('create policy %I_del on public.%I for delete using (owner = auth.uid());', t, t);
  end loop;
end $$;
