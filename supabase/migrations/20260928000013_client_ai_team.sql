-- AI Team add-on ($49/month): Sales, Marketing and Office assistants per
-- contractor. Only the ai-team function (service role) touches these tables.
alter table public.accounts
  add column if not exists ai_addon text not null default 'off',          -- off | checkout | active | past_due | cancelled
  add column if not exists ai_addon_sub_id text not null default '',
  add column if not exists ai_brief_at timestamptz;
create table if not exists public.cai_threads (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  agent text not null, title text not null default 'New conversation', kind text not null default 'chat',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists cai_threads_owner on public.cai_threads(owner, updated_at desc);
create table if not exists public.cai_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.cai_threads(id) on delete cascade,
  role text not null, content jsonb not null, model text not null default '', created_at timestamptz not null default now());
create index if not exists cai_messages_thread on public.cai_messages(thread_id, id);
create table if not exists public.cai_approvals (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.cai_threads(id) on delete cascade,
  agent text not null, tool text not null, input jsonb not null, summary text not null default '',
  status text not null default 'pending', result jsonb, created_at timestamptz not null default now(), decided_at timestamptz);
create table if not exists public.cai_usage (
  owner uuid not null references auth.users(id) on delete cascade,
  month text not null, messages int not null default 0, input_tokens bigint not null default 0, output_tokens bigint not null default 0, cost_cents numeric not null default 0,
  primary key (owner, month));
alter table public.cai_threads enable row level security;
alter table public.cai_messages enable row level security;
alter table public.cai_approvals enable row level security;
alter table public.cai_usage enable row level security;
revoke all on public.cai_threads, public.cai_messages, public.cai_approvals, public.cai_usage from anon, authenticated;
-- the 7am daily brief: hourly tick, each account runs once in its own 7-10am window
select cron.unschedule('ai-team-brief') where exists (select 1 from cron.job where jobname='ai-team-brief');
select cron.schedule('ai-team-brief', '5 * * * *', $$
  select net.http_post(
    url := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/ai-team?brief',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select value from public.ai_config where key='cron_key')),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
$$);
