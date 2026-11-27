-- Homeowner reviews of the contractor, written on the project page.
--
-- Builds on review_requests (20261003000003_worker_reviews.sql), the row the
-- rate link already uses, so both ways of reviewing land in one place:
--   cats        detail stars 1-5: quality, communication, schedule, cleanup, value
--   would_hire  "Would you hire them again?"
--   photos      up to 6 of the job's photos the homeowner picked (storage refs;
--               the pros function signs them when a listing is opened)
--   reply       the contractor's public answer (reply_at stamped here)
--   edited_at   the homeowner changed their review after posting it
--   source      'link' (rate page) | 'portal' (project page)
--   flagged_at, flag_reason  the contractor reported it for BuilderPro to look
--               at; it stays visible until we decide (a contractor can't bury a
--               bad review by reporting it)
--
-- Trust: the homeowner's words are written only by the service role (the
-- customer-portal and worker-review functions). The contractor can reply and
-- report, and nothing else: review_requests_guard below.

alter table public.review_requests
  add column if not exists cats        jsonb not null default '{}'::jsonb,
  add column if not exists would_hire  boolean,
  add column if not exists photos      jsonb not null default '[]'::jsonb,
  add column if not exists reply       text,
  add column if not exists reply_at    timestamptz,
  add column if not exists edited_at   timestamptz,
  add column if not exists source      text not null default 'link',
  add column if not exists flagged_at  timestamptz,
  add column if not exists flag_reason text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'review_requests_detail_ck') then
    alter table public.review_requests add constraint review_requests_detail_ck check (
      jsonb_typeof(cats) = 'object' and jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 6
      and (reply is null or length(reply) <= 1500) and (flag_reason is null or length(flag_reason) <= 300)
      and source in ('link', 'portal'));
  end if;
end $$;
create index if not exists review_requests_used_idx on public.review_requests (owner, used_at desc) where used_at is not null;

alter table public.bp_directory
  add column if not exists bp_cats jsonb not null default '{}'::jsonb,
  add column if not exists bp_hire int;

-- the contractor (and office) may reply and report; the review itself is the homeowner's
create or replace function public.review_requests_guard() returns trigger
language plpgsql as $$
begin
  if public.bp_is_service() then
    if tg_op = 'UPDATE' and new.reply is distinct from old.reply then
      new.reply_at := case when new.reply is null then null else now() end;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.used_at := null; new.overall := null; new.overall_comment := null; new.cats := '{}'::jsonb; new.would_hire := null;
    new.photos := '[]'::jsonb; new.share := false; new.reply := null; new.reply_at := null; new.edited_at := null;
    new.flagged_at := null; new.flag_reason := null; new.source := 'link'; new.sample := false;
    return new;
  end if;
  if new.used_at is distinct from old.used_at or new.overall is distinct from old.overall
     or new.overall_comment is distinct from old.overall_comment or new.cats is distinct from old.cats
     or new.would_hire is distinct from old.would_hire or new.photos is distinct from old.photos
     or new.share is distinct from old.share or new.edited_at is distinct from old.edited_at
     or new.source is distinct from old.source or new.sample is distinct from old.sample
     or new.owner is distinct from old.owner or new.token is distinct from old.token
     or (old.used_at is not null and (new.customer_name is distinct from old.customer_name or new.job_id is distinct from old.job_id)) then
    raise exception 'A homeowner''s review can''t be changed. You can reply to it, or report it to BuilderPro.';
  end if;
  if old.used_at is null and (new.reply is not null or new.flagged_at is not null) then
    raise exception 'There''s no review to answer yet.';
  end if;
  if new.reply is distinct from old.reply then
    new.reply := nullif(btrim(left(new.reply, 1500)), '');
    new.reply_at := case when new.reply is null then null else now() end;
  else
    new.reply_at := old.reply_at;
  end if;
  if new.flagged_at is distinct from old.flagged_at then
    new.flagged_at := case when new.flagged_at is null then null else now() end;
    new.flag_reason := case when new.flagged_at is null then null else left(btrim(coalesce(new.flag_reason, '')), 300) end;
  end if;
  return new;
end $$;
create or replace trigger review_requests_guard before insert or update on public.review_requests
  for each row execute function public.review_requests_guard();

-- the listing: average, detail averages, % who'd hire again, and the 12 newest shared reviews
create or replace function public.bp_dir_reviews(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cats jsonb := '{}'::jsonb; k text;
begin
  foreach k in array array['quality', 'communication', 'schedule', 'cleanup', 'value'] loop
    cats := cats || coalesce((select jsonb_build_object(k, round(avg((r.cats->>k)::numeric), 1))
                                from public.review_requests r
                               where r.owner = p_owner and r.used_at is not null and (r.cats->>k) ~ '^[1-5]$'
                              having count(*) > 0), '{}'::jsonb);
  end loop;
  update public.bp_directory d set
    bp_rating = s.avg, bp_count = s.n, bp_cats = cats,
    bp_hire = (select round(100.0 * count(*) filter (where would_hire) / nullif(count(*), 0))::int
                 from public.review_requests where owner = p_owner and used_at is not null and would_hire is not null),
    bp_reviews = coalesce((
      select jsonb_agg(jsonb_build_object(
               'rating', x.overall, 'text', left(x.overall_comment, 2000),
               'name', btrim(split_part(btrim(coalesce(x.customer_name, '')), ' ', 1) || ' ' ||
                       coalesce(nullif(left(split_part(btrim(coalesce(x.customer_name, '')), ' ', 2), 1), '') || '.', '')),
               'job', left(coalesce(x.job_title, ''), 80), 'at', x.used_at, 'sample', x.sample,
               'cats', x.cats, 'hire', x.would_hire, 'photos', x.photos, 'edited', x.edited_at is not null,
               'reply', x.reply, 'reply_at', x.reply_at) order by x.used_at desc)
      from (select * from public.review_requests r
             where r.owner = p_owner and r.share and r.overall between 1 and 5 and coalesce(btrim(r.overall_comment), '') <> ''
             order by r.used_at desc limit 12) x), '[]'::jsonb)
  from (select round(avg(overall)::numeric, 2) avg, count(*)::int n
          from public.review_requests where owner = p_owner and overall between 1 and 5) s
  where d.user_id = p_owner;
exception when others then raise warning 'bp_dir_reviews %: %', p_owner, sqlerrm;
end $$;
revoke all on function public.bp_dir_reviews(uuid) from public, anon, authenticated;

create or replace trigger bp_dir_on_review after update of used_at, overall, overall_comment, share, cats, would_hire, photos, reply
  on public.review_requests for each row execute function public.bp_dir_on_review();

-- tell the contractor about a new or changed review, and the homeowner about a reply
create or replace function public.bp_nt_review_requests() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; tok text; biz text;
begin
  begin
    if new.sample then return null; end if;
    if new.overall is not null and (old.used_at is null and new.used_at is not null or new.edited_at is distinct from old.edited_at) then
      perform public.bp_notify(new.owner, 'review_new',
        case when old.used_at is null then new.overall || '-star review from ' else 'Review updated by ' end
          || coalesce(nullif(split_part(btrim(coalesce(new.customer_name, '')), ' ', 1), ''), 'a customer'),
        concat_ws(' · ', nullif(btrim(coalesce(new.job_title, '')), ''), left(nullif(btrim(coalesce(new.overall_comment, '')), ''), 200)),
        'reviews', new.job_id, case when new.overall <= 2 then 'high' else 'normal' end,
        'bizrev:' || new.token || ':' || coalesce(new.edited_at::text, ''), 'office');
    end if;
    if new.reply is not null and new.reply is distinct from old.reply and new.used_at is not null then
      select token into tok from public.customer_portal_links where owner = new.owner and job_id = new.job_id limit 1;
      biz := public.bp_biz_name(new.owner);
      if tok is not null then
        for u in select * from public.bp_ho_followers(new.owner, new.job_id, null) loop
          insert into public.notifications (owner, user_id, kind, title, body, link, priority, dedupe)
          values (u, u, 'ho_reply', left(coalesce(nullif(biz, ''), 'Your contractor') || ' replied to your review', 200),
                  left(new.reply, 300), '#home=' || tok, 'normal', 'ho:reply:' || new.token || ':' || coalesce(new.reply_at::text, ''))
          on conflict do nothing;
        end loop;
      end if;
    end if;
  exception when others then raise warning 'bp_nt_review_requests: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.bp_nt_review_requests() from public, anon, authenticated;
create or replace trigger bp_nt_review_requests after update on public.review_requests
  for each row execute function public.bp_nt_review_requests();
