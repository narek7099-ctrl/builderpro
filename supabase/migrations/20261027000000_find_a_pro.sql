-- Find a Pro: the BuilderPro contractor directory homeowners search.
--
-- bp_directory holds one public listing per contractor, built from what they
-- already typed into Settings (client_settings.data.company) and their account
-- status. It is never read from the browser: the `pros` edge function reads it
-- with the service key and returns only the public fields (no street address,
-- no email, no owner id). Contractors are listed by default while their account
-- is active or in trial; Settings > Business > "Show my business in Find a Pro"
-- (company.listed = false) takes them out.

create table if not exists public.bp_directory (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  id         uuid not null default gen_random_uuid() unique,   -- the public id the page uses
  name       text not null default '',
  trade      text not null default '',
  services   text not null default '',
  about      text not null default '',
  city       text not null default '',
  state      text not null default '',
  zips       text[] not null default '{}',
  area       text not null default '',
  phone      text not null default '',
  website    text not null default '',
  logo       text not null default '',
  color      text not null default '',
  listed     boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists bp_directory_listed_idx on public.bp_directory (listed) where listed;

alter table public.bp_directory enable row level security;
revoke all on public.bp_directory from public, anon, authenticated;
grant select, insert, update, delete on public.bp_directory to service_role;

create or replace function public.bp_dir_sync(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  co jsonb; st text; acc_trade text; acc_name text; addr text; m text[]; zs text[];
  v_city text := ''; v_state text := ''; v_name text; v_listed boolean;
begin
  if p_user is null then return; end if;
  select coalesce(s.data->'company', '{}'::jsonb) into co from public.client_settings s where s.user_id = p_user;
  select a.status, a.trade, a.business into st, acc_trade, acc_name from public.accounts a where a.user_id = p_user;
  if st is null then delete from public.bp_directory where user_id = p_user; return; end if;
  co := coalesce(co, '{}'::jsonb);
  addr := coalesce(co->>'address', '');
  -- "123 Main St, Burbank, CA 91502" -> Burbank / CA / 91502
  m := regexp_match(addr, '([^,]+),\s*([A-Za-z]{2})\.?\s*(\d{5})?(?:-\d{4})?\s*$');
  if m is not null then v_city := trim(m[1]); v_state := upper(m[2]); end if;
  select coalesce(array_agg(distinct z), '{}') into zs
    from (select (regexp_matches(addr || ' ' || coalesce(co->>'serviceArea', ''), '(?<!\d)(\d{5})(?!\d)', 'g'))[1] z) q;
  v_name := left(trim(coalesce(nullif(co->>'name', ''), acc_name, '')), 120);
  v_listed := st in ('active', 'trial') and v_name <> '' and coalesce((co->>'listed')::boolean, true);
  insert into public.bp_directory as d (user_id, name, trade, services, about, city, state, zips, area, phone, website, logo, color, listed, updated_at)
  values (p_user, v_name,
          left(initcap(trim(coalesce(nullif(co->>'trade', ''), acc_trade, ''))), 60),
          left(trim(coalesce(co->>'services', '')), 400),
          left(trim(coalesce(co->>'about', '')), 600),
          left(v_city, 80), v_state, zs,
          left(trim(coalesce(co->>'serviceArea', '')), 300),
          left(trim(coalesce(co->>'phone', '')), 40),
          left(trim(coalesce(co->>'website', '')), 200),
          case when coalesce(nullif(co->>'logoUrl', ''), co->>'logo', '') ~* '^https://' then left(coalesce(nullif(co->>'logoUrl', ''), co->>'logo'), 500) else '' end,
          case when coalesce(co->>'brandColor', '') ~* '^#[0-9a-f]{6}$' then co->>'brandColor' else '' end,
          v_listed, now())
  on conflict (user_id) do update set
    name = excluded.name, trade = excluded.trade, services = excluded.services, about = excluded.about,
    city = excluded.city, state = excluded.state, zips = excluded.zips, area = excluded.area,
    phone = excluded.phone, website = excluded.website, logo = excluded.logo, color = excluded.color,
    listed = excluded.listed, updated_at = now();
exception when others then raise warning 'bp_dir_sync %: %', p_user, sqlerrm;
end $$;
revoke all on function public.bp_dir_sync(uuid) from public, anon, authenticated;

create or replace function public.bp_dir_on_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.bp_dir_sync(new.user_id); return null; end $$;
revoke all on function public.bp_dir_on_row() from public, anon, authenticated;

drop trigger if exists bp_dir_on_settings on public.client_settings;
create trigger bp_dir_on_settings after insert or update of data on public.client_settings
  for each row execute function public.bp_dir_on_row();
drop trigger if exists bp_dir_on_account on public.accounts;
create trigger bp_dir_on_account after insert or update of status, trade, business on public.accounts
  for each row execute function public.bp_dir_on_row();

-- fill it for everyone who is already here
select public.bp_dir_sync(user_id) from public.accounts;
