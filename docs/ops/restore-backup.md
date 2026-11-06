# Restoring the weekly database backup

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
