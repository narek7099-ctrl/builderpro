-- Scheduled SMS / Email sends for the BuilderPro dashboard broadcast + per-conversation scheduling.
create table if not exists public.scheduled_messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  send_at     timestamptz not null,
  channel     text not null default 'SMS' check (channel in ('SMS','Email')),
  subject     text,
  message     text not null,
  contact_ids jsonb not null default '[]'::jsonb,
  label       text,
  status      text not null default 'pending' check (status in ('pending','sent','canceled','error')),
  sent_at     timestamptz,
  result      jsonb
);

create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages (status, send_at);

-- The edge function talks to this table with the service role key, so RLS can stay on
-- with no public policies (service role bypasses RLS). Enable it to block anon access.
alter table public.scheduled_messages enable row level security;
