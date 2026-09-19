-- An order can now be emailed to the branch from inside BuilderPro. Record
-- where it went and when, so the ticket can say "emailed to prodesk@... at
-- 2:14 PM" rather than only "sent".

alter table public.purchase_orders add column if not exists sent_to        text default '';
alter table public.purchase_orders add column if not exists sent_msg_id    text default '';
alter table public.purchase_orders add column if not exists branch_sent_at timestamptz;

-- lines may now carry price null with tbc:true: an item the contractor has
-- never bought, which the branch prices at their account rate. No schema
-- change: lines is jsonb. Noted here so the shape is documented.
