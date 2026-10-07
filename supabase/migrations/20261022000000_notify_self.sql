-- Sales-pipeline, message and reminder alerts raised by the portal itself.
-- The portal knows the contact stages (tags), texts and to-dos; the database
-- does not. bp_notify_self() lets a signed-in owner or office user write an
-- alert to THEIR OWN bell only, for a short allow-list of kinds, deduped the
-- same way as every other notification.
create or replace function public.bp_notify_self(p_kind text, p_title text, p_body text, p_link text,
                                                 p_priority text, p_dedupe text)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); k int;
begin
  if me is null or coalesce(p_dedupe, '') = '' then return 0; end if;
  if p_kind not in ('needs_inspection', 'needs_estimate', 'needs_invoice', 'start_job', 'text_message', 'reminder') then return 0; end if;
  if exists (select 1 from public.notification_prefs p where p.user_id = me and p.prefs->>p_kind = 'off') then return 0; end if;
  insert into public.notifications (owner, user_id, kind, title, body, link, job_id, priority, dedupe)
  values (coalesce(public.bp_owner(), me), me, p_kind, left(coalesce(p_title, ''), 200), left(coalesce(p_body, ''), 600),
          left(p_link, 200), null, case when p_priority in ('low', 'normal', 'high') then p_priority else 'normal' end, left(p_dedupe, 200))
  on conflict (user_id, dedupe) where dedupe is not null do nothing;
  get diagnostics k = row_count;
  return k;
end $$;
revoke all on function public.bp_notify_self(text, text, text, text, text, text) from public, anon;
grant execute on function public.bp_notify_self(text, text, text, text, text, text) to authenticated;
