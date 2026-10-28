-- Each client's Lisa call minutes per month (read from HighLevel by usage-sync),
-- against their plan's minutes (Foundation 150, OS 300, Enterprise 500).
create table if not exists public.usage_month (
  user_id uuid not null,
  month text not null,                 -- 'YYYY-MM' (UTC)
  minutes numeric not null default 0,
  calls int not null default 0,
  included int not null default 0,     -- the plan's minutes that month
  source text,                         -- where the minutes came from in HighLevel
  last_error text,
  warned80 boolean not null default false,
  extra_billed numeric,                -- dollars put on their Stripe invoice for minutes over
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.usage_month enable row level security;
drop policy if exists usage_month_own on public.usage_month;
create policy usage_month_own on public.usage_month for select using (auth.uid() = user_id);
