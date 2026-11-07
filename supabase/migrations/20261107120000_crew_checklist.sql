-- Crew job checklist: the crew ticks the day's steps on their phone, a ring
-- fills segment by segment, and "Finish job" tells the office.
--   crew_check(p_job, p_step, p_done, p_steps)
--     ticks or unticks one step on the job's crew checklist (jobs JSON:
--     checklist = [{id, t, doneAt, by}]). The first tick on a job with no
--     checklist starts it from p_steps (the default names the app sends).
--   crew_finish(p_job)
--     every step ticked: stamps checklistDoneAt and rings the office's bell.
-- Same guard as the other crew_* functions: only a job this person is on.
create or replace function public.crew_check(p_job text, p_step text, p_done boolean, p_steps jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare j jsonb; cl jsonb; who jsonb; now_ms bigint; out jsonb := '[]'::jsonb; it jsonb; hit boolean := false; nm text;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;
  j := public.bp_crew_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  cl := case when jsonb_typeof(j->'checklist') = 'array' and jsonb_array_length(j->'checklist') > 0 then j->'checklist' else null end;
  if cl is null then
    if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 or jsonb_array_length(p_steps) > 12 then
      return jsonb_build_object('ok', false, 'error', 'no steps');
    end if;
    cl := '[]'::jsonb;
    for nm in select trim(x) from jsonb_array_elements_text(p_steps) x loop
      if nm = '' or length(nm) > 60 then return jsonb_build_object('ok', false, 'error', 'step name'); end if;
      cl := cl || jsonb_build_array(jsonb_build_object('id', public.bp_rid('ck'), 't', nm, 'doneAt', null, 'by', null));
    end loop;
  end if;
  who := public.bp_crew_actor();
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  for it in select x from jsonb_array_elements(cl) x loop
    if it->>'id' = p_step or (it->>'t' = p_step and not hit) then
      hit := true;
      it := it || jsonb_build_object('doneAt', case when p_done then to_jsonb(now_ms) else 'null'::jsonb end,
                                     'by', case when p_done then to_jsonb(who->>'name') else 'null'::jsonb end);
    end if;
    out := out || jsonb_build_array(it);
  end loop;
  if not hit then return jsonb_build_object('ok', false, 'error', 'no such step'); end if;
  j := jsonb_set(j, '{checklist}', out);
  if not p_done then j := j - 'checklistDoneAt'; end if;
  if not public.bp_crew_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  return jsonb_build_object('ok', true, 'checklist', out);
end $$;

create or replace function public.crew_finish(p_job text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare j jsonb; who jsonb; now_ms bigint; left_n int;
begin
  perform 1 from public.portal_finance where owner = public.bp_owner() for update;
  j := public.bp_crew_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  if jsonb_typeof(j->'checklist') <> 'array' or jsonb_array_length(j->'checklist') = 0 then return jsonb_build_object('ok', false, 'error', 'no checklist'); end if;
  select count(*) into left_n from jsonb_array_elements(j->'checklist') x where x->'doneAt' is null or x->>'doneAt' is null;
  if left_n > 0 then return jsonb_build_object('ok', false, 'error', 'steps left', 'left', left_n); end if;
  who := public.bp_crew_actor();
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  j := j || jsonb_build_object('checklistDoneAt', now_ms, 'checklistDoneBy', who->>'name');
  if not public.bp_crew_job_put(p_job, j) then return jsonb_build_object('ok', false, 'error', 'not saved'); end if;
  perform public.bp_notify(public.bp_owner(), 'job_done', 'Crew finished: ' || coalesce(j->>'name', 'a job'),
    coalesce(who->>'name', 'The crew') || ' ticked every step' || coalesce(' on ' || nullif(j->>'title', ''), '') || '. Ready for your walk-through and the final invoice.',
    'activejobs:' || p_job, p_job, 'high', 'crewdone:' || p_job || ':' || (now_ms / 3600000)::text, 'office');
  return jsonb_build_object('ok', true, 'at', now_ms);
end $$;

revoke all on function public.crew_check(text, text, boolean, jsonb) from public, anon;
revoke all on function public.crew_finish(text) from public, anon;
grant execute on function public.crew_check(text, text, boolean, jsonb) to authenticated;
grant execute on function public.crew_finish(text) to authenticated;

-- what the crew's phone reads (crew_me doesn't carry the checklist)
create or replace function public.crew_checklist(p_job text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare j jsonb;
begin
  j := public.bp_crew_job(p_job);
  if j is null then return jsonb_build_object('ok', false, 'error', 'not your job'); end if;
  return jsonb_build_object('ok', true,
    'checklist', case when jsonb_typeof(j->'checklist') = 'array' then j->'checklist' else '[]'::jsonb end,
    'doneAt', j->'checklistDoneAt', 'doneBy', j->>'checklistDoneBy', 'trade', coalesce(j->>'title', ''));
end $$;
revoke all on function public.crew_checklist(text) from public, anon;
grant execute on function public.crew_checklist(text) to authenticated;
