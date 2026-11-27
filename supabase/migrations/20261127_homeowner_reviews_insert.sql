-- A review the project page writes in one go (no rate-link row to claim) is an
-- INSERT with used_at already set: refresh the listing and tell the contractor
-- then too, not only on UPDATE.
create or replace function public.bp_dir_on_review_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin if new.used_at is not null then perform public.bp_dir_reviews(new.owner); end if; return null; end $$;
revoke all on function public.bp_dir_on_review_ins() from public, anon, authenticated;
create or replace trigger bp_dir_on_review_ins after insert on public.review_requests
  for each row execute function public.bp_dir_on_review_ins();

create or replace function public.bp_nt_review_requests_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.sample or new.used_at is null or new.overall is null then return null; end if;
    perform public.bp_notify(new.owner, 'review_new',
      new.overall || '-star review from ' || coalesce(nullif(split_part(btrim(coalesce(new.customer_name, '')), ' ', 1), ''), 'a customer'),
      concat_ws(' · ', nullif(btrim(coalesce(new.job_title, '')), ''), left(nullif(btrim(coalesce(new.overall_comment, '')), ''), 200)),
      'reviews', new.job_id, case when new.overall <= 2 then 'high' else 'normal' end, 'bizrev:' || new.token || ':', 'office');
  exception when others then raise warning 'bp_nt_review_requests_ins: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.bp_nt_review_requests_ins() from public, anon, authenticated;
create or replace trigger bp_nt_review_requests_ins after insert on public.review_requests
  for each row execute function public.bp_nt_review_requests_ins();
