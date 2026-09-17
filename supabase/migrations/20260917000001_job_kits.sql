-- Job kits: a contractor thinks in squares, not in twelve line items.
--
-- The portal ships built-in kits per trade, so this table is only for the
-- ones a contractor saves after tuning the quantities to how they actually
-- buy. Kits work without it; saving needs it.

create table if not exists public.job_kits (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  trade        text default '',
  size_label   text not null default 'units',              -- squares, sq ft, fixtures, tons...
  size_default numeric(12,2) not null default 10,
  items        jsonb not null default '[]'::jsonb,         -- [{n,u,per,fixed}] per unit of size, or fixed
  builtin      text default '',                            -- the built-in it started from, if any
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists job_kits_owner_idx on public.job_kits(owner, created_at desc);

alter table public.job_kits enable row level security;
drop policy if exists job_kits_own on public.job_kits;
create policy job_kits_own on public.job_kits for all using (auth.uid() = owner) with check (auth.uid() = owner);
grant select, insert, update, delete on public.job_kits to authenticated;

drop trigger if exists job_kits_touch on public.job_kits;
create trigger job_kits_touch before update on public.job_kits for each row execute function public.supply_touch();
