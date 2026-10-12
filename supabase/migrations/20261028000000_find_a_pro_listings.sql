-- Find a Pro listings: photos, Yelp and verified BuilderPro reviews.
--
-- bp_directory gains
--   yelp_id      the alias from the Yelp page the contractor pasted in Settings
--   yelp, yelp_at  what the pros function last read from Yelp (rating, count,
--                url, photos, review excerpts). Yelp allows 24 hours of caching;
--                the function refreshes anything older.
--   photos       up to 10 listing photos the contractor uploaded (only URLs in
--                our public client-logos bucket are kept)
--   bp_rating, bp_count  the average and number of BuilderPro job ratings
--   bp_reviews   up to 6 recent ratings WITH a comment whose homeowner ticked
--                "show my review" (review_requests.share). First name only.
-- Ratings left before the share box existed count toward the average but
-- their comments stay private: homeowners were told the owner reads them.

alter table public.bp_directory
  add column if not exists yelp_id text not null default '',
  add column if not exists yelp jsonb not null default '{}',
  add column if not exists yelp_at timestamptz,
  add column if not exists photos text[] not null default '{}',
  add column if not exists bp_rating numeric(3,2),
  add column if not exists bp_count int not null default 0,
  add column if not exists bp_reviews jsonb not null default '[]';
alter table public.review_requests add column if not exists share boolean not null default false;

create or replace function public.bp_dir_reviews(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bp_directory d set
    bp_rating = s.avg, bp_count = s.n,
    bp_reviews = coalesce((
      select jsonb_agg(jsonb_build_object('rating', x.overall, 'text', left(x.overall_comment, 500),
                                          'name', split_part(trim(coalesce(x.customer_name, '')), ' ', 1),
                                          'job', left(coalesce(x.job_title, ''), 80), 'at', x.used_at) order by x.used_at desc)
      from (select * from public.review_requests r
             where r.owner = p_owner and r.share and r.overall between 1 and 5 and coalesce(trim(r.overall_comment), '') <> ''
             order by r.used_at desc limit 6) x), '[]'::jsonb)
  from (select round(avg(overall)::numeric, 2) avg, count(*)::int n
          from public.review_requests where owner = p_owner and overall between 1 and 5) s
  where d.user_id = p_owner;
exception when others then raise warning 'bp_dir_reviews %: %', p_owner, sqlerrm;
end $$;
revoke all on function public.bp_dir_reviews(uuid) from public, anon, authenticated;

create or replace function public.bp_dir_on_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.bp_dir_reviews(new.owner); return null; end $$;
revoke all on function public.bp_dir_on_review() from public, anon, authenticated;
create trigger bp_dir_on_review after update of used_at, overall, overall_comment, share on public.review_requests
  for each row execute function public.bp_dir_on_review();

-- bp_dir_sync now also reads company.yelp (a Yelp page URL or alias) and
-- company.photos, and refreshes the review numbers
create or replace function public.bp_dir_sync(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  co jsonb; st text; acc_trade text; acc_name text; addr text; m text[]; zs text[]; ph text[];
  v_city text := ''; v_state text := ''; v_name text; v_listed boolean; v_yelp text := '';
begin
  if p_user is null then return; end if;
  select coalesce(s.data->'company', '{}'::jsonb) into co from public.client_settings s where s.user_id = p_user;
  select a.status, a.trade, a.business into st, acc_trade, acc_name from public.accounts a where a.user_id = p_user;
  if st is null then delete from public.bp_directory where user_id = p_user; return; end if;
  co := coalesce(co, '{}'::jsonb);
  addr := coalesce(co->>'address', '');
  m := regexp_match(addr, '([^,]+),\s*([A-Za-z]{2})\.?\s*(\d{5})?(?:-\d{4})?\s*$');
  if m is not null then v_city := trim(m[1]); v_state := upper(m[2]); end if;
  select coalesce(array_agg(distinct z), '{}') into zs
    from (select (regexp_matches(addr || ' ' || coalesce(co->>'serviceArea', ''), '(?<!\d)(\d{5})(?!\d)', 'g'))[1] z) q;
  -- "https://www.yelp.com/biz/summit-roofing-burbank?osq=x" -> summit-roofing-burbank
  m := regexp_match(coalesce(co->>'yelp', ''), 'yelp\.[a-z.]+/biz/([A-Za-z0-9_%-]+)');
  if m is not null then v_yelp := left(m[1], 120);
  elsif coalesce(co->>'yelp', '') ~ '^[A-Za-z0-9_-]{3,120}$' then v_yelp := co->>'yelp'; end if;
  select coalesce(array_agg(u), '{}') into ph from (
    select u from jsonb_array_elements_text(case when jsonb_typeof(co->'photos') = 'array' then co->'photos' else '[]'::jsonb end) with ordinality t(u, i)
     where (u like 'https://ttzwzouhiwdwamuimhpo.supabase.co/storage/v1/object/public/client-logos/%'
            or u like 'https://builderpro-os.com/assets/demo/%') and length(u) < 400
     order by i limit 10) q;
  v_name := left(trim(coalesce(nullif(co->>'name', ''), acc_name, '')), 120);
  v_listed := st in ('active', 'trial') and v_name <> '' and coalesce((co->>'listed')::boolean, true);
  insert into public.bp_directory as d (user_id, name, trade, services, about, city, state, zips, area, phone, website, logo, color, listed, yelp_id, photos, updated_at)
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
          v_listed, v_yelp, ph, now())
  on conflict (user_id) do update set
    name = excluded.name, trade = excluded.trade, services = excluded.services, about = excluded.about,
    city = excluded.city, state = excluded.state, zips = excluded.zips, area = excluded.area,
    phone = excluded.phone, website = excluded.website, logo = excluded.logo, color = excluded.color,
    listed = excluded.listed, photos = excluded.photos, yelp_id = excluded.yelp_id,
    -- a different Yelp page: forget what we read from the old one
    yelp = case when d.yelp_id = excluded.yelp_id then d.yelp else '{}'::jsonb end,
    yelp_at = case when d.yelp_id = excluded.yelp_id then d.yelp_at else null end,
    updated_at = now();
  perform public.bp_dir_reviews(p_user);
exception when others then raise warning 'bp_dir_sync %: %', p_user, sqlerrm;
end $$;
revoke all on function public.bp_dir_sync(uuid) from public, anon, authenticated;

select public.bp_dir_sync(user_id) from public.accounts;
