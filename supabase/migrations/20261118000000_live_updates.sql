-- Live updates (2026-11-18): an edit on one device shows on every other device of the same
-- company without a refresh.
--
-- bp_live holds one tiny row per company and kind of data ("jobs", "contacts", "calendar",
-- "clock", "employees", "inspections", "equipment", "checks", "settings"): just when it last
-- changed and who changed it. A trigger on each table touches that row; the row is
-- broadcast by Supabase Realtime, and the app (portal/live.js) fetches only that kind of
-- data again and redraws the open screen. Nothing else is broadcast, so a big jobs list is
-- never pushed to every phone, and the table never grows (one row per company and kind).
--
-- Who hears it: bp_owner() is the company a signed-in person works for (their own account,
-- or the owner of the team they joined), so the owner, office and crew of one company hear
-- that company's changes and nobody else's.

create table if not exists public.bp_live (
  owner uuid not null,
  kind  text not null,
  at    timestamptz not null default now(),
  by    uuid,
  primary key (owner, kind)
);
alter table public.bp_live enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bp_live' and policyname = 'bp_live_read') then
    create policy bp_live_read on public.bp_live for select to authenticated using (owner = public.bp_owner());
  end if;
end $$;
revoke all on public.bp_live from anon;
grant select on public.bp_live to authenticated;

-- touch the row for one company and kind; never stops the write that caused it
create or replace function public.bp_live_touch()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_row jsonb;
begin
  begin
    v_row := to_jsonb(coalesce(new, old));
    v_owner := nullif(v_row ->> tg_argv[1], '')::uuid;
    if v_owner is not null then
      insert into public.bp_live (owner, kind, at, by) values (v_owner, tg_argv[0], now(), auth.uid())
      on conflict (owner, kind) do update set at = excluded.at, by = excluded.by;
    end if;
  exception when others then
    raise warning 'bp_live_touch skipped: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.bp_live_touch() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_jobs' and tgrelid = 'public.portal_finance'::regclass) then
    create trigger bp_live_jobs after insert or update on public.portal_finance for each row execute function public.bp_live_touch('jobs', 'owner');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_contacts' and tgrelid = 'public.contacts'::regclass) then
    create trigger bp_live_contacts after insert or update or delete on public.contacts for each row execute function public.bp_live_touch('contacts', 'owner');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_calendar' and tgrelid = 'public.calendar_notes'::regclass) then
    create trigger bp_live_calendar after insert or update or delete on public.calendar_notes for each row execute function public.bp_live_touch('calendar', 'owner');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_clock' and tgrelid = 'public.time_clock'::regclass) then
    create trigger bp_live_clock after insert or update or delete on public.time_clock for each row execute function public.bp_live_touch('clock', 'owner');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_breaks' and tgrelid = 'public.time_breaks'::regclass) then
    create trigger bp_live_breaks after insert or update or delete on public.time_breaks for each row execute function public.bp_live_touch('clock', 'owner');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_employees' and tgrelid = 'public.employees'::regclass) then
    create trigger bp_live_employees after insert or update or delete on public.employees for each row execute function public.bp_live_touch('employees', 'owner');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_inspections' and tgrelid = 'public.inspection_reports'::regclass) then
    create trigger bp_live_inspections after insert or update or delete on public.inspection_reports for each row execute function public.bp_live_touch('inspections', 'owner');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_assets' and tgrelid = 'public.assets'::regclass) then
    create trigger bp_live_assets after insert or update or delete on public.assets for each row execute function public.bp_live_touch('equipment', 'owner');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_checks' and tgrelid = 'public.roof_checks'::regclass) then
    create trigger bp_live_checks after insert or update or delete on public.roof_checks for each row execute function public.bp_live_touch('checks', 'owner');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bp_live_settings' and tgrelid = 'public.client_settings'::regclass) then
    create trigger bp_live_settings after insert or update on public.client_settings for each row execute function public.bp_live_touch('settings', 'user_id');
  end if;
end $$;

-- broadcast it
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bp_live') then
    alter publication supabase_realtime add table public.bp_live;
  end if;
end $$;
