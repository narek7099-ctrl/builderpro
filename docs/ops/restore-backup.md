# Restoring a backup

## The weekly snapshot inside Supabase (always on)

Every Sunday `bp_backup.take()` copies every public table plus logins into
`bp_backup.snapshots` (4 rotating weekly slots). See what's there:
`select slot, taken_at, tables, row_count from bp_backup.snapshots order by taken_at desc;`

Put back rows of one table that were deleted by mistake (example: contacts,
from the newest snapshot; only rows that are missing now):
```sql
insert into public.contacts
select * from jsonb_populate_recordset(null::public.contacts,
  (select data->'public.contacts' from bp_backup.snapshots order by taken_at desc limit 1))
on conflict do nothing;
```
Ask for help before restoring more than one table; tables depend on each other.

## The optional off-site backup on GitHub

Only for a real emergency (data deleted or the project lost). Do it with help;
a restore overwrites what's there. Once Supabase is on Pro, use its daily
backups instead (Database > Backups), which restore with one click.

1. GitHub > Actions > "Database backup" > the newest green run > Artifacts:
   download `db-backup-N` and unzip it. You get `backup.tar.gz.gpg`.
2. Unlock it with the backup passphrase:
   `gpg -d backup.tar.gz.gpg | tar xz` gives `backup/roles.sql`, `schema.sql`, `data.sql`.
3. Into a new, empty Supabase project (never on top of the live one without a reason),
   with that project's Session pooler connection string:
   ```
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file backup/roles.sql --file backup/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file backup/data.sql --dbname "<connection string>"
   ```
4. Logins come back with it (auth.users). Not in the backup, redo by hand:
   edge function secrets, auth settings (SMTP, templates, URLs), Storage files,
   cron jobs' Vault secrets.

Supabase's guide: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
