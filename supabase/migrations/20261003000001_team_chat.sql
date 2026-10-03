-- Team chat: the owner and the people who sign in to their account talking
-- to each other. Not customer SMS (that is conversations/messages).
--
-- Every chat belongs to one account owner (team_threads.owner). A thread is
-- a named 'group' the owner set up, or a 'direct' line between two people of
-- the same account. People are auth uids: the owner's own, or a
-- team_members.member that has accepted.
--
-- Who may do what:
--   * read a thread, its members and its messages: members of that thread
--   * post: members of that thread, as themselves
--   * create / rename / delete groups and change who is in them: the owner
--   * open a direct line: the owner with any of their people, a team member
--     only with their owner (team_chat_open_direct)
-- Reading lists with names and unread counts goes through team_chat_list(),
-- a security-definer function, because names live in tables (client_settings,
-- team_members, auth.users) that a crew member cannot read directly.

-- ---------------------------------------------------------------- tables ---
create table if not exists public.team_threads (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('group','direct')),
  name            text not null default '',
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  -- 'a:b' with the two uids sorted, only on direct threads: one per pair
  direct_key      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz,
  constraint team_threads_direct_key check ((kind = 'direct') = (direct_key is not null))
);
create unique index if not exists team_threads_direct_key_idx on public.team_threads (direct_key) where direct_key is not null;
create index if not exists team_threads_owner_idx on public.team_threads (owner, last_message_at desc);

create table if not exists public.team_thread_members (
  thread_id    uuid not null references public.team_threads(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  added_at     timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists team_thread_members_user_idx on public.team_thread_members (user_id);

create table if not exists public.team_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.team_threads(id) on delete cascade,
  sender     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 8000),
  attachment jsonb,
  created_at timestamptz not null default now()
);
create index if not exists team_messages_thread_idx on public.team_messages (thread_id, created_at desc);

-- --------------------------------------------------------------- helpers ---
-- Is the caller in this thread? security definer so the members policy can
-- ask without recursing into itself.
create or replace function public.team_chat_is_member(p_thread uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_thread_members
                  where thread_id = p_thread and user_id = auth.uid());
$$;

-- Does this uid belong to the account p_owner (the owner, or an accepted
-- team member of theirs)?
create or replace function public.team_chat_in_account(p_owner uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = p_owner or exists (
    select 1 from public.team_members
     where owner = p_owner and member = p_user and accepted_at is not null);
$$;

-- A display name for a uid. For an owner: their name from settings, then
-- the company name, then the email. For a team member: the employee record
-- linked to their login, then their team row's name, then the email.
create or replace function public.team_chat_name(p_user uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    (select nullif(trim(coalesce(e.name, '')), '')
       from public.team_members tm join public.employees e on e.team_id = tm.id
      where tm.member = p_user and tm.accepted_at is not null limit 1),
    (select nullif(trim(tm.name), '') from public.team_members tm
      where tm.member = p_user and tm.accepted_at is not null limit 1),
    (select nullif(trim(coalesce(cs.data #>> '{owner,name}',
              concat_ws(' ', cs.data #>> '{owner,first}', cs.data #>> '{owner,last}'))), '')
       from public.client_settings cs where cs.user_id = p_user),
    (select nullif(trim(cs.data #>> '{company,name}'), '') from public.client_settings cs where cs.user_id = p_user),
    (select u.email from auth.users u where u.id = p_user),
    'Someone');
$$;

-- ------------------------------------------------------------------- RLS ---
alter table public.team_threads enable row level security;
alter table public.team_thread_members enable row level security;
alter table public.team_messages enable row level security;

drop policy if exists team_threads_read on public.team_threads;
create policy team_threads_read on public.team_threads
  for select to authenticated using (public.team_chat_is_member(id));
-- direct threads are only ever made by team_chat_open_direct()
drop policy if exists team_threads_insert on public.team_threads;
create policy team_threads_insert on public.team_threads
  for insert to authenticated with check (owner = auth.uid() and kind = 'group');
drop policy if exists team_threads_update on public.team_threads;
create policy team_threads_update on public.team_threads
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists team_threads_delete on public.team_threads;
create policy team_threads_delete on public.team_threads
  for delete to authenticated using (owner = auth.uid());

drop policy if exists team_thread_members_read on public.team_thread_members;
create policy team_thread_members_read on public.team_thread_members
  for select to authenticated using (public.team_chat_is_member(thread_id));
-- the owner manages who is in their groups, and only with their own people
drop policy if exists team_thread_members_insert on public.team_thread_members;
create policy team_thread_members_insert on public.team_thread_members
  for insert to authenticated with check (
    exists (select 1 from public.team_threads t
             where t.id = thread_id and t.owner = auth.uid() and t.kind = 'group')
    and public.team_chat_in_account(auth.uid(), user_id));
drop policy if exists team_thread_members_delete on public.team_thread_members;
create policy team_thread_members_delete on public.team_thread_members
  for delete to authenticated using (
    exists (select 1 from public.team_threads t
             where t.id = thread_id and t.owner = auth.uid() and t.kind = 'group'));
-- last_read_at moves through team_chat_mark_read(); no update policy

drop policy if exists team_messages_read on public.team_messages;
create policy team_messages_read on public.team_messages
  for select to authenticated using (public.team_chat_is_member(thread_id));
drop policy if exists team_messages_insert on public.team_messages;
create policy team_messages_insert on public.team_messages
  for insert to authenticated with check (sender = auth.uid() and public.team_chat_is_member(thread_id));
drop policy if exists team_messages_delete on public.team_messages;
create policy team_messages_delete on public.team_messages
  for delete to authenticated using (sender = auth.uid());

revoke all on public.team_threads, public.team_thread_members, public.team_messages from anon;
grant select, insert, update, delete on public.team_threads to authenticated;
grant select, insert, delete on public.team_thread_members to authenticated;
grant select, insert, delete on public.team_messages to authenticated;

-- ------------------------------------------------------------- triggers ---
create or replace function public.team_chat_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.team_threads
     set last_message_at = new.created_at, updated_at = now()
   where id = new.thread_id;
  -- your own message is never unread to you
  update public.team_thread_members
     set last_read_at = greatest(last_read_at, new.created_at)
   where thread_id = new.thread_id and user_id = new.sender;
  return new;
end $$;
drop trigger if exists team_messages_touch on public.team_messages;
create trigger team_messages_touch after insert on public.team_messages
  for each row execute function public.team_chat_on_message();

-- ----------------------------------------------------------------- RPCs ---
-- The people the caller can chat with: the owner and every accepted login.
create or replace function public.team_chat_people()
returns table (user_id uuid, name text, role text, is_owner boolean)
language sql stable security definer set search_path = public as $$
  with acct as (select public.bp_owner() as o)
  select a.o, public.team_chat_name(a.o), 'owner', true from acct a where a.o is not null
  union all
  select tm.member, public.team_chat_name(tm.member), tm.role, false
    from public.team_members tm, acct a
   where tm.owner = a.o and tm.member is not null and tm.accepted_at is not null
  order by 4 desc, 2;
$$;

-- Threads the caller is in, newest first, with members' names and unread count.
create or replace function public.team_chat_list()
returns table (id uuid, kind text, name text, owner uuid, created_at timestamptz,
               last_message_at timestamptz, unread integer, last_body text,
               last_sender uuid, members jsonb)
language sql stable security definer set search_path = public as $$
  select t.id, t.kind, t.name, t.owner, t.created_at, t.last_message_at,
         (select count(*)::int from public.team_messages m
           where m.thread_id = t.id and m.created_at > me.last_read_at and m.sender <> auth.uid()),
         lm.body, lm.sender,
         (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id,
                   'name', public.team_chat_name(x.user_id), 'is_owner', x.user_id = t.owner)
                   order by x.user_id = t.owner desc, x.added_at), '[]'::jsonb)
            from public.team_thread_members x where x.thread_id = t.id)
    from public.team_thread_members me
    join public.team_threads t on t.id = me.thread_id
    left join lateral (select m.body, m.sender from public.team_messages m
                        where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
   where me.user_id = auth.uid()
   order by coalesce(t.last_message_at, t.created_at) desc;
$$;

-- Owner only: a new group with these people (the owner is always in it).
create or replace function public.team_chat_create_group(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_me uuid := auth.uid();
begin
  if v_me is null or public.bp_owner() <> v_me then raise exception 'only the account owner can create groups'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'a group needs a name'; end if;
  insert into public.team_threads (owner, kind, name, created_by)
       values (v_me, 'group', left(trim(p_name), 80), v_me) returning id into v_id;
  insert into public.team_thread_members (thread_id, user_id)
       select v_id, u from (select v_me as u union select unnest(coalesce(p_members, '{}'::uuid[]))) s
        where public.team_chat_in_account(v_me, u)
  on conflict do nothing;
  return v_id;
end $$;

-- Owner only: set exactly who is in a group (the owner stays in).
create or replace function public.team_chat_set_members(p_thread uuid, p_members uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if not exists (select 1 from public.team_threads where id = p_thread and owner = v_me and kind = 'group') then
    raise exception 'not your group';
  end if;
  delete from public.team_thread_members
   where thread_id = p_thread and user_id <> v_me and not (user_id = any (coalesce(p_members, '{}'::uuid[])));
  insert into public.team_thread_members (thread_id, user_id)
       select p_thread, u from (select v_me as u union select unnest(coalesce(p_members, '{}'::uuid[]))) s
        where public.team_chat_in_account(v_me, u)
  on conflict do nothing;
  update public.team_threads set updated_at = now() where id = p_thread;
end $$;

-- Open (or make) the direct line between the caller and p_other.
-- A team member may only open one with their owner; p_other null means "my owner".
create or replace function public.team_chat_open_direct(p_other uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_owner uuid := public.bp_owner(); v_other uuid; v_key text; v_id uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if v_owner = v_me then
    v_other := p_other;
    if v_other is null or v_other = v_me or not public.team_chat_in_account(v_me, v_other) then
      raise exception 'that person is not on your team';
    end if;
  else
    if p_other is not null and p_other <> v_owner then raise exception 'team members can only message the owner directly'; end if;
    v_other := v_owner;
  end if;
  v_key := least(v_me::text, v_other::text) || ':' || greatest(v_me::text, v_other::text);
  select id into v_id from public.team_threads where direct_key = v_key;
  if v_id is null then
    insert into public.team_threads (owner, kind, name, created_by, direct_key)
         values (v_owner, 'direct', '', v_me, v_key)
    on conflict (direct_key) where direct_key is not null do nothing
    returning id into v_id;
    if v_id is null then select id into v_id from public.team_threads where direct_key = v_key; end if;
  end if;
  insert into public.team_thread_members (thread_id, user_id)
       values (v_id, v_me), (v_id, v_other)
  on conflict do nothing;
  return v_id;
end $$;

-- Everything up to now in this thread has been read by the caller.
create or replace function public.team_chat_mark_read(p_thread uuid)
returns void language sql security definer set search_path = public as $$
  update public.team_thread_members set last_read_at = now()
   where thread_id = p_thread and user_id = auth.uid();
$$;

-- Total unread across the caller's threads (for the sidebar badge).
create or replace function public.team_chat_unread()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.team_messages m
    join public.team_thread_members me on me.thread_id = m.thread_id and me.user_id = auth.uid()
   where m.created_at > me.last_read_at and m.sender <> auth.uid();
$$;

revoke all on function public.team_chat_is_member(uuid), public.team_chat_in_account(uuid, uuid),
  public.team_chat_name(uuid), public.team_chat_people(), public.team_chat_list(),
  public.team_chat_create_group(text, uuid[]), public.team_chat_set_members(uuid, uuid[]),
  public.team_chat_open_direct(uuid), public.team_chat_mark_read(uuid), public.team_chat_unread(),
  public.team_chat_on_message() from public, anon;
grant execute on function public.team_chat_is_member(uuid), public.team_chat_in_account(uuid, uuid),
  public.team_chat_name(uuid), public.team_chat_people(), public.team_chat_list(),
  public.team_chat_create_group(text, uuid[]), public.team_chat_set_members(uuid, uuid[]),
  public.team_chat_open_direct(uuid), public.team_chat_mark_read(uuid), public.team_chat_unread()
  to authenticated;

-- -------------------------------------------------------------- realtime ---
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_messages') then
    execute 'alter publication supabase_realtime add table public.team_messages';
  end if;
end $$;
