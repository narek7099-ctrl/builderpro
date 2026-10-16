set lock_timeout = '5s';
-- Every link a contractor sends lands in the homeowner's account.
--
-- homeowner_projects already remembers project pages (#home=). This adds the
-- rest of what a contractor sends: estimates (#est=), contracts to sign
-- (#sign=) and invoices to pay (#pay=). Opening any of them while signed in
-- saves it (bp_ho_save); the link token stays the credential, this only
-- remembers it for that one person.
--
-- After that the account follows the job: when the same contractor sends a
-- new estimate, contract or project page for a job (or a customer) the
-- homeowner already saved something from, it is added to their account and
-- they get a notification (and a push, when they have the app). Nobody is
-- matched by email or phone, only by links they opened themselves.

create table if not exists public.homeowner_links (
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('est', 'sign', 'pay')),
  token      text not null check (length(token) <= 200),
  owner      uuid,
  job_id     text,
  contact_id text,
  title      text not null default '' check (length(title) <= 160),
  added_at   timestamptz not null default now(),
  opened_at  timestamptz not null default now(),
  primary key (user_id, kind, token)
);
create index if not exists homeowner_links_job_idx on public.homeowner_links (owner, job_id);
create index if not exists homeowner_links_contact_idx on public.homeowner_links (owner, contact_id);
alter table public.homeowner_links enable row level security;
revoke all on public.homeowner_links from public, anon, authenticated;
grant select, delete on public.homeowner_links to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'homeowner_links' and policyname = 'homeowner links: read own') then
    create policy "homeowner links: read own" on public.homeowner_links for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'homeowner_links' and policyname = 'homeowner links: remove own') then
    create policy "homeowner links: remove own" on public.homeowner_links for delete to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- the contractor's name, as their customers see it
create or replace function public.bp_biz_name(p_owner uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim((select data->'company'->>'name' from public.client_settings where user_id = p_owner limit 1)), ''), 'Your contractor');
$$;
revoke all on function public.bp_biz_name(uuid) from public, anon, authenticated;

-- save a link for the signed-in person; true when it was a live link
create or replace function public.bp_ho_save(p_kind text, p_token text, p_title text default '') returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare o uuid; j text; c text; t text; loc text;
begin
  if auth.uid() is null or coalesce(p_token, '') = '' then return false; end if;
  if p_kind = 'home' then return public.bp_home_save(p_token); end if;
  if p_kind = 'est' then
    if p_token !~ '^[a-f0-9]{24,64}$' then return false; end if;
    select owner, job_id, contact_id, title into o, j, c, t from public.estimate_options where token = lower(p_token) and status <> 'void';
  elsif p_kind = 'sign' then
    if p_token !~ '^[A-Za-z0-9_-]{16,80}$' then return false; end if;
    select owner, job_id, null, title into o, j, c, t from public.contracts where token = p_token and status <> 'void';
  elsif p_kind = 'pay' then
    -- <location>.<invoice>.<signature>; the pay page checks the signature itself
    if p_token !~ '^[A-Za-z0-9]{6,40}\.[A-Za-z0-9]{6,40}\.[A-Za-z0-9_-]{10,40}$' then return false; end if;
    loc := split_part(p_token, '.', 1);
    select owner into o from public.ai_brain where ghl_location_id = loc limit 1;
    t := left(coalesce(nullif(trim(p_title), ''), 'Invoice'), 120);
  else return false;
  end if;
  if o is null and p_kind <> 'pay' then return false; end if;
  insert into public.homeowner_links (user_id, kind, token, owner, job_id, contact_id, title)
  values (auth.uid(), p_kind, case when p_kind = 'est' then lower(p_token) else p_token end, o, j, c, left(coalesce(t, ''), 160))
  on conflict (user_id, kind, token) do update set opened_at = now(), title = excluded.title;
  return true;
end $$;
revoke all on function public.bp_ho_save(text, text, text) from public, anon;
grant execute on function public.bp_ho_save(text, text, text) to authenticated;

-- homeowners already following this job (or this customer) at this contractor
create or replace function public.bp_ho_followers(p_owner uuid, p_job text, p_contact text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct user_id from public.homeowner_links
   where owner = p_owner and ((p_job is not null and p_job <> '' and job_id = p_job) or (p_contact is not null and p_contact <> '' and contact_id = p_contact))
  union
  select distinct hp.user_id from public.homeowner_projects hp
    join public.customer_portal_links l on l.token = hp.token
   where l.owner = p_owner and p_job is not null and p_job <> '' and l.job_id = p_job;
$$;
revoke all on function public.bp_ho_followers(uuid, text, text) from public, anon, authenticated;

-- add a new link to every follower's account and tell them
create or replace function public.bp_ho_deliver(p_owner uuid, p_job text, p_contact text, p_kind text, p_token text, p_title text, p_body text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare u uuid; biz text := public.bp_biz_name(p_owner);
begin
  for u in select * from public.bp_ho_followers(p_owner, p_job, p_contact) loop
    if p_kind = 'home' then
      insert into public.homeowner_projects (user_id, token) values (u, p_token) on conflict do nothing;
    else
      insert into public.homeowner_links (user_id, kind, token, owner, job_id, contact_id, title)
      values (u, p_kind, p_token, p_owner, p_job, p_contact, left(coalesce(p_title, ''), 160)) on conflict do nothing;
    end if;
    insert into public.notifications (owner, user_id, kind, title, body, link, priority, dedupe)
    values (u, u, 'ho_' || p_kind, left(biz || ': ' || p_body, 200), left(coalesce(p_title, ''), 300), '#' || p_kind || '=' || p_token, 'high', 'ho:' || p_kind || ':' || left(p_token, 60))
    on conflict do nothing;
  end loop;
exception when others then
  raise warning 'bp_ho_deliver: %', sqlerrm;
end $$;
revoke all on function public.bp_ho_deliver(uuid, text, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.bp_ho_on_estimate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.bp_ho_deliver(new.owner, new.job_id, new.contact_id, 'est', new.token, new.title,
    case when jsonb_array_length(coalesce(new.tiers, '[]'::jsonb)) > 1 then 'new estimate options to pick from' else 'a new estimate is ready' end);
  return null;
end $$;
revoke all on function public.bp_ho_on_estimate() from public, anon, authenticated;
create or replace trigger bp_ho_on_estimate after insert on public.estimate_options for each row execute function public.bp_ho_on_estimate();

create or replace function public.bp_ho_on_contract() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and (old.status is distinct from 'sent') and new.token is not null then
    perform public.bp_ho_deliver(new.owner, new.job_id, null, 'sign', new.token, new.title, 'a contract is ready to sign');
  end if;
  return null;
end $$;
revoke all on function public.bp_ho_on_contract() from public, anon, authenticated;
create or replace trigger bp_ho_on_contract after update of status on public.contracts for each row execute function public.bp_ho_on_contract();

create or replace function public.bp_ho_on_portal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.enabled and (tg_op = 'INSERT' or new.token is distinct from old.token) then
    perform public.bp_ho_deliver(new.owner, new.job_id, null, 'home', new.token, 'Your project page', 'your project page is ready');
  end if;
  return null;
end $$;
revoke all on function public.bp_ho_on_portal() from public, anon, authenticated;
create or replace trigger bp_ho_on_portal after insert or update of token on public.customer_portal_links for each row execute function public.bp_ho_on_portal();
