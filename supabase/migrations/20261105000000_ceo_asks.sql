-- AI CEO chat: each question and answer, so the chat is still there next visit
create table if not exists public.ceo_asks (
  id bigint generated always as identity primary key,
  owner uuid not null,
  question text not null,
  answer text not null default '',
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ceo_asks_owner_idx on public.ceo_asks (owner, created_at desc);
alter table public.ceo_asks enable row level security;
-- read and written only by the ai-ceo function (service role); no client policies
