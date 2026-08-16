-- BuilderPro: per-client Settings storage
-- One row per client, keyed to their Supabase Auth user id.
-- Row-Level Security: each client can only read/write THEIR OWN row.
-- You (the operator) can see every row from the Supabase dashboard / SQL editor,
-- which uses the service role and bypasses RLS.

create table if not exists public.client_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.client_settings enable row level security;

-- A client can read only their own settings row.
drop policy if exists "client reads own settings" on public.client_settings;
create policy "client reads own settings"
  on public.client_settings for select
  using (auth.uid() = user_id);

-- A client can insert only their own row.
drop policy if exists "client inserts own settings" on public.client_settings;
create policy "client inserts own settings"
  on public.client_settings for insert
  with check (auth.uid() = user_id);

-- A client can update only their own row.
drop policy if exists "client updates own settings" on public.client_settings;
create policy "client updates own settings"
  on public.client_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Handy view for you: latest settings per client, flattened for quick scanning.
create or replace view public.client_settings_overview as
select
  s.email,
  s.data->'company'->>'name'        as business_name,
  s.data->'company'->>'trade'       as trade,
  s.data->'company'->>'phone'       as phone,
  s.data->'company'->>'serviceArea' as service_area,
  s.data->'owner'->>'name'          as owner_name,
  s.data->>'autoReply'              as auto_reply,
  s.updated_at
from public.client_settings s
order by s.updated_at desc;
