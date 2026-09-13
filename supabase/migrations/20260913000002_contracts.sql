-- Contracts + e-signature for Active Projects.
--
-- A contract is created by the contractor against a job, sent to the homeowner
-- as a tokenised link, and signed on a public page. Everything the ESIGN Act /
-- UETA expects is recorded: the exact document text the signer saw, their
-- explicit consent to sign electronically, the signature itself, and an audit
-- trail (who, when, from where).
--
-- The signing page is public and unauthenticated, so it never touches this
-- table directly — the contract-sign edge function reads and writes it with the
-- service role and only ever exposes one contract, by its unguessable token.
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists "pgcrypto";

create table if not exists public.contracts (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade,
  job_id        text,                                  -- the portal job this belongs to
  token         text not null unique default encode(gen_random_bytes(18), 'hex'),
  title         text not null default 'Roofing Agreement',

  -- who it is for
  customer_name  text,
  customer_email text,
  customer_phone text,
  address        text,

  -- what was agreed
  body          text not null default '',              -- the full document text the signer sees
  scope         text,
  amount        numeric(12,2),
  deposit       numeric(12,2),
  start_note    text,

  -- lifecycle
  status        text not null default 'draft',         -- draft | sent | viewed | signed | declined | void
  sent_at       timestamptz,
  viewed_at     timestamptz,
  signed_at     timestamptz,
  declined_at   timestamptz,
  decline_note  text,

  -- the signature and its audit trail
  signer_name   text,
  signer_email  text,
  signature     text,                                   -- PNG data URI of the drawn mark
  signature_kind text,                                  -- drawn | typed
  consent       boolean not null default false,         -- ticked the ESIGN consent box
  signer_ip     text,
  signer_agent  text,
  audit         jsonb not null default '[]'::jsonb,     -- [{at, event, ip, agent}]

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists contracts_owner_idx on public.contracts(owner, created_at desc);
create index if not exists contracts_job_idx   on public.contracts(owner, job_id);
create unique index if not exists contracts_token_idx on public.contracts(token);

alter table public.contracts enable row level security;

-- The contractor sees and manages only their own. The public signing page has no
-- access here at all; it goes through the edge function.
drop policy if exists contracts_sel on public.contracts;
create policy contracts_sel on public.contracts for select to authenticated using (owner = auth.uid());
drop policy if exists contracts_ins on public.contracts;
create policy contracts_ins on public.contracts for insert to authenticated with check (owner = auth.uid());
drop policy if exists contracts_upd on public.contracts;
create policy contracts_upd on public.contracts for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists contracts_del on public.contracts;
create policy contracts_del on public.contracts for delete to authenticated using (owner = auth.uid());

grant select, insert, update, delete on public.contracts to authenticated;

-- A signed contract must not be quietly rewritten afterwards. Once status is
-- 'signed', the agreed text, amount and signature are frozen; only void is allowed.
create or replace function public.contracts_freeze_signed() returns trigger
language plpgsql as $$
begin
  if old.status = 'signed' then
    if new.status not in ('signed', 'void') then
      raise exception 'a signed contract cannot return to %', new.status;
    end if;
    new.body       := old.body;
    new.amount     := old.amount;
    new.scope      := old.scope;
    new.signature  := old.signature;
    new.signer_name := old.signer_name;
    new.signed_at  := old.signed_at;
    new.signer_ip  := old.signer_ip;
    new.audit      := old.audit;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists contracts_freeze on public.contracts;
create trigger contracts_freeze before update on public.contracts
  for each row execute function public.contracts_freeze_signed();
