-- Weekly snapshot, inside Supabase, until Pro's daily backups take over.
-- Every Sunday pg_cron copies every public table, plus logins (auth.users,
-- auth.identities), into bp_backup.snapshots as one JSON document. Four
-- rotating slots (week number mod 4), overwritten in place, so there are always
-- the last ~4 weeks and the table never grows.
-- Protects against mistakes and bugs (deleted or overwritten rows). It does not
-- protect against losing the whole project; the optional GitHub backup
-- (.github/workflows/db-backup.yml) and Supabase Pro do.
-- Not reachable through the API: its own schema, no grants to anon/authenticated.
-- Restore a table: docs/ops/restore-backup.md.
create schema if not exists bp_backup;
revoke all on schema bp_backup from public, anon, authenticated;

create table if not exists bp_backup.snapshots (
  slot int primary key check (slot between 0 and 3),
  taken_at timestamptz not null default now(),
  tables int not null default 0,
  row_count int not null default 0,
  data jsonb not null default '{}'::jsonb
);
revoke all on bp_backup.snapshots from public, anon, authenticated;

create or replace function bp_backup.take() returns text
language plpgsql security definer set search_path = '' as $$
declare
  t text; part jsonb; n int; doc jsonb := '{}'::jsonb; nt int := 0; nr int := 0;
  s int := (extract(week from now())::int % 4);
begin
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb), count(*) from public.%I x', t) into part, n;
    doc := doc || jsonb_build_object('public.' || t, part); nt := nt + 1; nr := nr + n;
  end loop;
  foreach t in array array['users', 'identities'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb), count(*) from auth.%I x', t) into part, n;
    doc := doc || jsonb_build_object('auth.' || t, part); nt := nt + 1; nr := nr + n;
  end loop;
  insert into bp_backup.snapshots (slot, taken_at, tables, row_count, data) values (s, now(), nt, nr, doc)
    on conflict (slot) do update set taken_at = excluded.taken_at, tables = excluded.tables, row_count = excluded.row_count, data = excluded.data;
  return format('slot %s: %s tables, %s rows', s, nt, nr);
end $$;
revoke all on function bp_backup.take() from public, anon, authenticated;

select cron.unschedule('bp-weekly-snapshot') where exists (select 1 from cron.job where jobname = 'bp-weekly-snapshot');
select cron.schedule('bp-weekly-snapshot', '17 9 * * 0', $c$ select bp_backup.take() $c$);
