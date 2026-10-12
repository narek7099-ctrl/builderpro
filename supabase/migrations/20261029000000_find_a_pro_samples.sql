-- Find a Pro: sample listings and sample reviews for the test companies.
--
-- The five test/house accounts show in the public directory so the feature can
-- be tried end to end. Their reviews are written by us, not homeowners, so
-- they are flagged: review_requests.sample and bp_directory.sample. The page
-- labels those listings "Sample listing" and each such review "Sample review",
-- never "Verified BuilderPro job". Delete the sample rows (sample = true) and
-- clear bp_directory.sample when the test companies come out of the directory.

alter table public.review_requests add column if not exists sample boolean not null default false;
alter table public.bp_directory add column if not exists sample boolean not null default false;

-- bp_dir_reviews passes the flag through to the listing
create or replace function public.bp_dir_reviews(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bp_directory d set
    bp_rating = s.avg, bp_count = s.n,
    bp_reviews = coalesce((
      select jsonb_agg(jsonb_build_object('rating', x.overall, 'text', left(x.overall_comment, 500),
                                          'name', split_part(trim(coalesce(x.customer_name, '')), ' ', 1),
                                          'job', left(coalesce(x.job_title, ''), 80), 'at', x.used_at, 'sample', x.sample) order by x.used_at desc)
      from (select * from public.review_requests r
             where r.owner = p_owner and r.share and r.overall between 1 and 5 and coalesce(trim(r.overall_comment), '') <> ''
             order by r.used_at desc limit 6) x), '[]'::jsonb)
  from (select round(avg(overall)::numeric, 2) avg, count(*)::int n
          from public.review_requests where owner = p_owner and overall between 1 and 5) s
  where d.user_id = p_owner;
exception when others then raise warning 'bp_dir_reviews %: %', p_owner, sqlerrm;
end $$;
revoke all on function public.bp_dir_reviews(uuid) from public, anon, authenticated;

insert into public.review_requests (owner, job_id, job_title, customer_name, created_at, used_at, overall, overall_comment, share, sample)
select v.owner::uuid, 'sample-' || row_number() over (), v.job, v.who, v.at::timestamptz - interval '1 day', v.at::timestamptz, v.stars, v.txt, true, true
from (values
  -- BuilderPro Test Co: remodeling
  ('a1b2c3d4-0001-4000-8000-00000000a001','Kitchen remodel','Maria Lopez','2026-09-28',5,'They kept to the schedule they gave us on day one. The project page meant I never had to chase anyone for an update, and the cabinets look fantastic.'),
  ('a1b2c3d4-0001-4000-8000-00000000a001','Bathroom remodel','James Carter','2026-09-10',5,'Clean crew, tidy site every evening, and the tile work is perfect. Photos went up after every visit so I could check in from work.'),
  ('a1b2c3d4-0001-4000-8000-00000000a001','Kitchen remodel','Priya Shah','2026-08-22',4,'Great quality. Countertops arrived a few days late, but they told us right away and adjusted the plan. Would hire again.'),
  ('a1b2c3d4-0001-4000-8000-00000000a001','Flooring','Tom Becker','2026-07-30',5,'Quick, fair price and they moved all the furniture back. Payments were simple through the portal.'),
  ('a1b2c3d4-0001-4000-8000-00000000a001','Bathroom remodel','Grace Kim','2026-07-02',5,'Answered every message the same day. Our new shower is exactly what we pictured.'),
  -- Foundation Roofing: roofing
  ('a1b2c3d4-0099-4000-8000-00000000d099','Roof repair','Daniel Ortiz','2026-09-25',5,'Found and fixed a leak two other companies missed. Sent photos of the damage before and after.'),
  ('a1b2c3d4-0099-4000-8000-00000000d099','Roof replacement','Linda Park','2026-09-03',5,'Whole roof done in two days and they cleaned up every nail. Fair, clear quote with no surprises.'),
  ('a1b2c3d4-0099-4000-8000-00000000d099','Gutters','Kevin Walsh','2026-08-14',4,'Good work on the new gutters. Rain delayed the start by a day, but they kept me posted.'),
  ('a1b2c3d4-0099-4000-8000-00000000d099','Roof inspection','Angela Rossi','2026-07-19',5,'Free inspection, honest advice, and they did not push a full replacement we did not need.'),
  -- OS Roofing Co: plumbing
  ('a1b2c3d4-0199-4000-8000-00000000d199','Water heater','Robert Nguyen','2026-09-30',5,'Same-week appointment and the new water heater was in by lunch. Explained everything clearly.'),
  ('a1b2c3d4-0199-4000-8000-00000000d199','Drain cleaning','Sofia Martinez','2026-09-12',5,'Fixed a drain that had been slow for months. On time and very polite.'),
  ('a1b2c3d4-0199-4000-8000-00000000d199','Repiping','Mark Davis','2026-08-20',4,'Big job done well. Took one extra day for the inspection, which they warned us about.'),
  ('a1b2c3d4-0199-4000-8000-00000000d199','Leak repair','Hannah Lee','2026-07-25',5,'Came out the same evening for a leak under the sink. Reasonable price.'),
  -- Enterprise Roofing Group: general contractor
  ('a1b2c3d4-0299-4000-8000-00000000d299','ADU build','Chris Patel','2026-09-21',5,'Managed permits, inspections and every trade for our ADU. The schedule on the project page was spot on.'),
  ('a1b2c3d4-0299-4000-8000-00000000d299','Home addition','Rachel Green','2026-08-29',5,'Our addition blends in with the house perfectly. Weekly updates and photos kept us calm the whole way.'),
  ('a1b2c3d4-0299-4000-8000-00000000d299','Window replacement','Steven Brooks','2026-08-05',4,'Nice windows and a careful install. A couple of small touch-ups were needed after, and they came right back.'),
  ('a1b2c3d4-0299-4000-8000-00000000d299','Electrical upgrade','Nina Alvarez','2026-07-11',5,'Panel upgrade and new circuits done safely and passed inspection the first time.'),
  ('a1b2c3d4-0299-4000-8000-00000000d299','Interior painting','Paul Turner','2026-06-20',5,'Crisp lines, no mess, finished a day early.'),
  -- Summit Roofing Co.: roofing (house demo account)
  ('0909842f-f8b2-4651-950a-a772aef42b1d','Roof replacement','Emily Johnson','2026-09-18',5,'From the first visit to the final walk-through, everything was organized. The new roof looks great.'),
  ('0909842f-f8b2-4651-950a-a772aef42b1d','Re-roof','Brian Wilson','2026-08-27',5,'Crew was respectful of our yard and neighbors. Clear payment schedule and no hidden fees.'),
  ('0909842f-f8b2-4651-950a-a772aef42b1d','Roof repair','Olivia Chen','2026-08-08',4,'Quick repair after a storm. Had to wait a few days for a slot, but worth it.')
) v(owner, job, who, at, stars, txt);

update public.bp_directory set sample = true
 where user_id in ('a1b2c3d4-0001-4000-8000-00000000a001', 'a1b2c3d4-0099-4000-8000-00000000d099', 'a1b2c3d4-0199-4000-8000-00000000d199',
                   'a1b2c3d4-0299-4000-8000-00000000d299', '0909842f-f8b2-4651-950a-a772aef42b1d');
select public.bp_dir_reviews(user_id) from public.bp_directory where sample;
