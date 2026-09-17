-- Supply, part two: paperwork becomes data.
--
-- A scanned invoice or quote carries the contractor's real negotiated prices
-- and the PO number, so it closes both the "needs a distributor API" gaps:
-- the price book maintains itself from documents the supplier already hands
-- over, and reconciliation matches without anyone typing.
--
-- Additive only. Safe to run after the first Supply migration.

-- where a price came from, so the price book can show its own freshness
alter table public.supplier_items add column if not exists source    text default 'manual';   -- manual, import, invoice, quote, feed
alter table public.supplier_items add column if not exists source_at timestamptz;
alter table public.supplier_items add column if not exists source_ref text default '';        -- invoice or quote number it came off

-- what the supplier actually billed, line by line, beside what was ordered
alter table public.purchase_orders add column if not exists invoice_lines jsonb not null default '[]'::jsonb;
alter table public.purchase_orders add column if not exists scan          jsonb;               -- raw reader output, for an audit trail

-- stock confidence: who last confirmed a count, and how
alter table public.supplier_items add column if not exists stock_source text default '';       -- import, feed, counter, phone
