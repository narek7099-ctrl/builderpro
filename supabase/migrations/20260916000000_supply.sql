-- Supply: the contractor's supply houses, their price books, parts lists
-- built in the field, split purchase orders with will-call barcodes, and
-- the invoice match that turns a PO into an expense on the job.
--
-- Stock and contractor pricing come from a supplier "connection":
--   pricebook  the client imported a CSV or typed prices in (today)
--   api        a partner feed synced by the supply-sync function (adapters)
-- Every table is owner-scoped with RLS.

create table if not exists public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  kind         text not null default 'custom',          -- ferguson, abc, srs, homedepot_pro, custom...
  branch       text default '',
  address      text default '',
  lat          double precision,
  lng          double precision,
  drive_min    integer,                                  -- minutes from the shop; null = unknown
  account_no   text default '',
  email        text default '',                          -- contractor desk, where POs go
  tier         text default '',                          -- contractor pricing tier label
  hours        text default '',
  will_call    boolean not null default true,
  delivery     boolean not null default false,
  delivery_fee numeric(10,2) not null default 0,
  delivery_min numeric(10,2) not null default 0,         -- order size for free delivery
  connection   jsonb not null default '{"type":"pricebook"}'::jsonb,
  notes        text default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists suppliers_owner_idx on public.suppliers(owner);

create table if not exists public.supplier_items (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  sku          text not null,
  name         text not null,
  category     text default '',
  unit         text default 'ea',
  price        numeric(12,2) not null default 0,         -- the contractor's price
  list_price   numeric(12,2),                            -- shelf price, for the savings line
  stock        integer,                                  -- null = unknown
  stock_at     timestamptz,
  updated_at   timestamptz not null default now(),
  unique (supplier_id, sku)
);
create index if not exists supplier_items_owner_idx on public.supplier_items(owner, supplier_id);
create index if not exists supplier_items_name_idx on public.supplier_items using gin (to_tsvector('simple', name || ' ' || sku));

create table if not exists public.parts_lists (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  name         text not null default 'Parts list',
  job_id       text default '',                          -- id inside portal_finance.jobs
  job_name     text default '',
  priority     text not null default 'fastest' check (priority in ('fastest','cheapest')),
  status       text not null default 'draft' check (status in ('draft','sourced','ordered','received','reconciled')),
  items        jsonb not null default '[]'::jsonb,       -- [{key,name,qty,unit}]
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists parts_lists_owner_idx on public.parts_lists(owner, created_at desc);

create table if not exists public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade,
  list_id       uuid references public.parts_lists(id) on delete set null,
  supplier_id   uuid references public.suppliers(id) on delete set null,
  po_number     text not null,
  status        text not null default 'sent' check (status in ('sent','ready','picked_up','invoiced','reconciled','cancelled')),
  lines         jsonb not null default '[]'::jsonb,      -- [{sku,name,qty,unit,price}]
  subtotal      numeric(12,2) not null default 0,
  fees          numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  fulfil        text not null default 'will_call' check (fulfil in ('will_call','delivery')),
  eta_min       integer,
  job_id        text default '',
  job_name      text default '',
  invoice_ref   text default '',
  invoice_total numeric(12,2),
  invoiced_at   timestamptz,
  reconciled_at timestamptz,
  expense_key   text default '',                         -- id of the entry written into portal_finance.fin
  notes         text default '',
  sent_at       timestamptz not null default now(),
  picked_up_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner, po_number)
);
create index if not exists purchase_orders_owner_idx on public.purchase_orders(owner, created_at desc);

alter table public.suppliers        enable row level security;
alter table public.supplier_items   enable row level security;
alter table public.parts_lists      enable row level security;
alter table public.purchase_orders  enable row level security;

drop policy if exists suppliers_own       on public.suppliers;
drop policy if exists supplier_items_own  on public.supplier_items;
drop policy if exists parts_lists_own     on public.parts_lists;
drop policy if exists purchase_orders_own on public.purchase_orders;
create policy suppliers_own       on public.suppliers       for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy supplier_items_own  on public.supplier_items  for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy parts_lists_own     on public.parts_lists     for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy purchase_orders_own on public.purchase_orders for all using (auth.uid() = owner) with check (auth.uid() = owner);

grant select, insert, update, delete on public.suppliers, public.supplier_items, public.parts_lists, public.purchase_orders to authenticated;

create or replace function public.supply_touch() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers for each row execute function public.supply_touch();
drop trigger if exists supplier_items_touch on public.supplier_items;
create trigger supplier_items_touch before update on public.supplier_items for each row execute function public.supply_touch();
drop trigger if exists parts_lists_touch on public.parts_lists;
create trigger parts_lists_touch before update on public.parts_lists for each row execute function public.supply_touch();
drop trigger if exists purchase_orders_touch on public.purchase_orders;
create trigger purchase_orders_touch before update on public.purchase_orders for each row execute function public.supply_touch();
