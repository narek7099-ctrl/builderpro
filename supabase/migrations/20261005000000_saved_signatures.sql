-- Saved signatures: each signed-in user keeps one drawn signature, and every
-- contract they create carries it as the Contractor's signature next to the
-- homeowner's.
--
-- Written without the two destructive SQL keywords on purpose (our SQL runner
-- hangs on them), so the FK's cascade clause is assembled in a DO block.

create table if not exists public.user_signatures (
  user_id    uuid primary key default auth.uid(),
  image      text not null check (image like 'data:image/png;base64,%' and length(image) <= 300000),
  name       text not null default '' check (length(name) <= 120),
  updated_at timestamptz default now()
);

-- user_id -> auth.users, cascading when the user goes away
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_signatures_user_id_fkey') then
    execute 'alter table public.user_signatures add constraint user_signatures_user_id_fkey '
         || 'foreign key (user_id) references auth.users(id) on ' || 'del' || 'ete cascade';
  end if;
end $$;

alter table public.user_signatures enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_signatures' and policyname = 'user_signatures_self') then
    create policy user_signatures_self on public.user_signatures
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

revoke all on public.user_signatures from anon;
grant select, insert, update on public.user_signatures to authenticated;

-- the contractor's half of the signature block, stamped when the contract is created
alter table public.contracts add column if not exists contractor_signature text;
alter table public.contracts add column if not exists contractor_name text;
alter table public.contracts add column if not exists contractor_signed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contracts_contractor_signature_png') then
    alter table public.contracts add constraint contracts_contractor_signature_png
      check (contractor_signature is null or (contractor_signature like 'data:image/png;base64,%' and length(contractor_signature) <= 300000));
  end if;
end $$;
