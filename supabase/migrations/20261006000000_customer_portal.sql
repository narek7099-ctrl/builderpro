-- Customer (homeowner) portal.
--
-- The owner sends the homeowner a private link, builderpro-os.com/#home=<token>.
-- No password: the token is the credential, like a contract's #sign=<token>.
-- The page never reads these tables; it talks to the customer-portal edge
-- function, which uses the service role and answers for one job only.
--
-- Everything the homeowner writes lives here, in its own tables, never in
-- portal_finance.jobs, so a stale owner save cannot lose a message or a
-- signed change order and the portal_finance_keep_crew trigger is untouched.
--
-- 1. customer_portal_links: one row per job. token (48 hex), enabled (the
--    owner turns it off), share_photos / share_docs: the photo refs and
--    document refs (job.photos[i] / job.docs[i].d) the owner chose to show.
--    Sharing lives here, not on the job, for the same stale-save reason.
-- 2. customer_messages: the thread. from_customer marks the homeowner's side;
--    read_at is when the other side read it.
-- 3. customer_change_orders: the owner proposes (title, description, amount),
--    the homeowner approves with a drawn signature + name, or declines. The
--    function records ip and agent. applied_at: the owner's portal added it
--    to the job's contract total (estimate); the job itself remembers which
--    ones it already added (job.custCoApplied), so adding is idempotent.
--
-- RLS: owner and office (bp_team_role() <> 'crew'; a sub answers 'crew' too).
-- Guard triggers stop the browser forging the homeowner's side: from the
-- portal a message is always from the business, a change order is created
-- pending with no signature, and afterwards only voided (while pending) or
-- marked applied. The service role (the edge function) is not limited.

create table if not exists public.customer_portal_links (
  owner          uuid not null,
  job_id         text not null,
  token          text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  enabled        boolean not null default true,
  share_photos   jsonb not null default '[]'::jsonb,
  share_docs     jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  regenerated_at timestamptz,
  last_seen_at   timestamptz,
  primary key (owner, job_id),
  constraint customer_portal_links_token_ck check (token ~ '^[a-f0-9]{40,64}$'),
  constraint customer_portal_links_share_ck check (jsonb_typeof(share_photos) = 'array' and jsonb_typeof(share_docs) = 'array'
    and pg_column_size(share_photos) < 200000 and pg_column_size(share_docs) < 200000)
);

create table if not exists public.customer_messages (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null,
  job_id        text not null,
  from_customer boolean not null default false,
  author        text not null default '',
  body          text not null check (length(body) between 1 and 4000),
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index if not exists customer_messages_job_idx on public.customer_messages (owner, job_id, created_at);
create index if not exists customer_messages_unread_idx on public.customer_messages (owner) where from_customer and read_at is null;

create table if not exists public.customer_change_orders (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null,
  job_id       text not null,
  title        text not null check (length(title) between 1 and 200),
  description  text not null default '' check (length(description) <= 4000),
  amount       numeric(12,2) not null default 0 check (amount between -9999999 and 9999999),
  status       text not null default 'pending' check (status in ('pending','approved','declined','void')),
  signature    text,
  signer_name  text,
  signed_at    timestamptz,
  decline_note text,
  ip           text,
  agent        text,
  applied_at   timestamptz,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists customer_change_orders_job_idx on public.customer_change_orders (owner, job_id, created_at);

-- an account going away takes its homeowner data with it
do $$
declare t text;
begin
  foreach t in array array['customer_portal_links','customer_messages','customer_change_orders'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_owner_fkey') then
      execute format('alter table public.%I add constraint %I foreign key (owner) references auth.users(id) on ' || 'del' || 'ete cascade', t, t || '_owner_fkey');
    end if;
  end loop;
end $$;

alter table public.customer_portal_links enable row level security;
alter table public.customer_messages enable row level security;
alter table public.customer_change_orders enable row level security;
revoke all on public.customer_portal_links, public.customer_messages, public.customer_change_orders from anon;
grant select, insert, update on public.customer_portal_links, public.customer_messages, public.customer_change_orders to authenticated;

do $$
declare t text;
begin
  foreach t in array array['customer_portal_links','customer_messages','customer_change_orders'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_own') then
      execute format('create policy %I on public.%I for all to authenticated using (owner = public.bp_owner() and public.bp_team_role() <> ''crew'') with check (owner = public.bp_owner() and public.bp_team_role() <> ''crew'')', t || '_own', t);
    end if;
  end loop;
end $$;

-- the function (service role) is the homeowner; anyone else is the business
create or replace function public.bp_is_service() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role'
      or current_user in ('postgres','service_role','supabase_admin')
$$;

create or replace function public.customer_messages_guard() returns trigger
language plpgsql as $$
begin
  if public.bp_is_service() then return new; end if;
  if tg_op = 'INSERT' then
    new.from_customer := false; new.read_at := null; new.created_at := now();
  else
    -- the business only marks the homeowner's messages read
    if new.body is distinct from old.body or new.from_customer is distinct from old.from_customer
       or new.author is distinct from old.author or new.created_at is distinct from old.created_at
       or new.job_id is distinct from old.job_id or new.owner is distinct from old.owner
       or (not old.from_customer and new.read_at is distinct from old.read_at) then
      raise exception 'customer_messages: only read_at can change';
    end if;
  end if;
  return new;
end $$;
create or replace trigger customer_messages_guard before insert or update on public.customer_messages
  for each row execute function public.customer_messages_guard();

create or replace function public.customer_change_orders_guard() returns trigger
language plpgsql as $$
begin
  if public.bp_is_service() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.signature := null; new.signer_name := null; new.signed_at := null;
    new.decline_note := null; new.ip := null; new.agent := null; new.applied_at := null; new.created_at := now();
    return new;
  end if;
  if new.signature is distinct from old.signature or new.signer_name is distinct from old.signer_name
     or new.signed_at is distinct from old.signed_at or new.ip is distinct from old.ip or new.agent is distinct from old.agent
     or new.decline_note is distinct from old.decline_note or new.owner is distinct from old.owner or new.job_id is distinct from old.job_id
     or new.created_at is distinct from old.created_at then
    raise exception 'customer_change_orders: the homeowner''s side cannot be edited';
  end if;
  -- wording and amount only while nobody has answered
  if old.status <> 'pending' and (new.title is distinct from old.title or new.description is distinct from old.description or new.amount is distinct from old.amount) then
    raise exception 'customer_change_orders: already answered';
  end if;
  if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'void') then
    raise exception 'customer_change_orders: only a pending change order can be withdrawn';
  end if;
  if new.applied_at is distinct from old.applied_at and (old.applied_at is not null or new.status <> 'approved') then
    raise exception 'customer_change_orders: applied_at is set once, on an approved change order';
  end if;
  return new;
end $$;
create or replace trigger customer_change_orders_guard before insert or update on public.customer_change_orders
  for each row execute function public.customer_change_orders_guard();

create or replace function public.customer_portal_links_guard() returns trigger
language plpgsql as $$
begin
  if public.bp_is_service() then return new; end if;
  if tg_op = 'INSERT' then new.last_seen_at := null; new.created_at := now(); return new; end if;
  if new.last_seen_at is distinct from old.last_seen_at or new.owner is distinct from old.owner or new.job_id is distinct from old.job_id then
    raise exception 'customer_portal_links: read-only column';
  end if;
  if new.token is distinct from old.token then new.regenerated_at := now(); new.last_seen_at := null; end if;
  return new;
end $$;
create or replace trigger customer_portal_links_guard before insert or update on public.customer_portal_links
  for each row execute function public.customer_portal_links_guard();
