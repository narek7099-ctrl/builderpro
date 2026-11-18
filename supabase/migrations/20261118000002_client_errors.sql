-- Error reporting (2026-11-18): when the app breaks on someone's phone or computer, the
-- operator finds out without waiting for a support email.
--
-- portal/errors.js catches crashes in the page and sends a short, scrubbed report here
-- through bp_report_error(). The same error from many people and many times is one row
-- with a count, so the table stays small. Only the service role reads it (the app-errors
-- edge function, behind the Command Center's admin check); no company can read another's
-- reports, or its own.
--
-- What a report holds: the error message and the top of its stack (emails, phone numbers,
-- tokens, ids and query strings already removed in the browser, and again here), the screen
-- that was open, the page path, the app version, the browser, and whether it was online.
-- No form contents, no job data, no names.

create table if not exists public.client_errors (
  id         bigserial primary key,
  fp         text not null unique,          -- fingerprint: kind + message + where, numbers removed
  kind       text not null default 'error', -- error | promise | resource
  area       text not null default 'app',   -- app | site
  message    text not null,
  source     text,                          -- file:line:col
  stack      text,
  view       text,                          -- the screen that was open
  path       text,
  app_ver    text,
  ua         text,
  online     boolean,
  count      integer not null default 1,
  users      uuid[] not null default '{}',  -- up to 25 people who hit it
  anon       integer not null default 0,    -- reports from a page with no one signed in
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  first_by   uuid,
  status     text not null default 'open',  -- open | fixed | ignored
  status_at  timestamptz,
  fixed_ver  text,                          -- app version when it was marked fixed
  back_at    timestamptz,                   -- seen again on a newer version after "fixed"
  note       text
);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
create index if not exists client_errors_last_at on public.client_errors (last_at desc);
create index if not exists client_errors_first_at on public.client_errors (first_at desc);

create or replace function public.bp_err_scrub(t text, n int)
returns text language sql immutable set search_path = public as $$
  select left(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(t, ''),
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g'),
      'eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){0,2}', '<token>', 'g'),
      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '<id>', 'g'),
      '\+?\d[\d ().-]{8,}\d', '<number>', 'g'),
      '\?[^\s)''"]*', '', 'g'),
    n)
$$;
revoke all on function public.bp_err_scrub(text, int) from public, anon, authenticated;

-- One report. Never raises: a broken report must not cause another error in the page.
create or replace function public.bp_report_error(
  p_kind text, p_message text, p_source text default null, p_stack text default null,
  p_view text default null, p_path text default null, p_app_ver text default null,
  p_ua text default null, p_online boolean default null, p_area text default 'app')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := case when p_kind in ('error', 'promise', 'resource') then p_kind else 'error' end;
  v_area text := case when p_area = 'site' then 'site' else 'app' end;
  v_msg text := bp_err_scrub(p_message, 300);
  v_src text := bp_err_scrub(p_source, 200);
  v_stack text := bp_err_scrub(p_stack, 2000);
  v_view text := left(regexp_replace(coalesce(p_view, ''), '[^A-Za-z0-9_-]', '', 'g'), 40);
  v_path text := left(regexp_replace(coalesce(p_path, ''), '[?#].*$', ''), 120);
  v_ver text := left(regexp_replace(coalesce(p_app_ver, ''), '[^A-Za-z0-9._-]', '', 'g'), 24);
  v_fp text;
  v_row public.client_errors%rowtype;
begin
  begin
    if coalesce(v_msg, '') = '' then return; end if;
    -- same error = same kind, message (numbers and quoted bits removed) and file:line
    v_fp := md5(v_kind || '|' || v_area || '|' ||
                regexp_replace(regexp_replace(v_msg, '"[^"]*"|''[^'']*''', '""', 'g'), '\d+', 'N', 'g') || '|' ||
                regexp_replace(coalesce(v_src, ''), ':\d+$', ''));
    select * into v_row from public.client_errors where fp = v_fp;
    if found then
      update public.client_errors set
        count   = least(count + 1, 2000000000),
        last_at = now(),
        users   = case when v_uid is not null and not (v_uid = any(users)) and cardinality(users) < 25 then users || v_uid else users end,
        anon    = anon + case when v_uid is null then 1 else 0 end,
        view    = coalesce(nullif(v_view, ''), view),
        app_ver = coalesce(nullif(v_ver, ''), app_ver),
        ua      = coalesce(nullif(left(p_ua, 160), ''), ua),
        online  = coalesce(p_online, online),
        stack   = coalesce(nullif(v_stack, ''), stack),
        -- marked fixed, then seen again on a newer version of the app: it's back
        back_at = case when status = 'fixed' and v_ver <> '' and coalesce(fixed_ver, '') <> '' and v_ver > fixed_ver then now() else back_at end,
        status  = case when status = 'fixed' and v_ver <> '' and coalesce(fixed_ver, '') <> '' and v_ver > fixed_ver then 'open' else status end
      where id = v_row.id;
      return;
    end if;
    -- new kinds of error: at most 300 an hour in all and 20 an hour from one person,
    -- so a broken loop or someone scripting this can't fill the table
    if (select count(*) from public.client_errors where first_at > now() - interval '1 hour') >= 300 then return; end if;
    if v_uid is not null and (select count(*) from public.client_errors where first_at > now() - interval '1 hour' and first_by = v_uid) >= 20 then return; end if;
    insert into public.client_errors (fp, kind, area, message, source, stack, view, path, app_ver, ua, online, users, anon, first_by)
    values (v_fp, v_kind, v_area, v_msg, nullif(v_src, ''), nullif(v_stack, ''), nullif(v_view, ''), nullif(v_path, ''), nullif(v_ver, ''),
            nullif(left(p_ua, 160), ''), p_online, case when v_uid is null then '{}'::uuid[] else array[v_uid] end,
            case when v_uid is null then 1 else 0 end, v_uid)
    on conflict (fp) do update set count = public.client_errors.count + 1, last_at = now();
  exception when others then
    raise warning 'bp_report_error skipped: %', sqlerrm;
  end;
end $$;
revoke all on function public.bp_report_error(text, text, text, text, text, text, text, text, boolean, text) from public;
grant execute on function public.bp_report_error(text, text, text, text, text, text, text, text, boolean, text) to anon, authenticated;
