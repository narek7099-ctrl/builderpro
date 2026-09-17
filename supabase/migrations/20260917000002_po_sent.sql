-- BuilderPro does not transmit orders to the supply house; the contractor
-- sends them. This records that they did, so an order sitting unsent does not
-- look identical to one the branch is already picking.

alter table public.purchase_orders add column if not exists sent_to_supplier boolean not null default false;
