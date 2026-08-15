# Enable scheduled messages / emails

The dashboard can schedule a broadcast or a single message/email for a future time.
This needs one table, one edge function, and a 1-minute cron that dispatches due sends.
Until it's deployed, the dashboard's schedule UI shows a "not set up yet" note and
"Send now" keeps working.

Everything runs on your existing Supabase project (`ttzwzouhiwdwamuimhpo`).

## 1. Create the table
Apply the migration (from the repo root):
```bash
supabase db push
```
…or paste `supabase/migrations/20260815000000_scheduled_messages.sql` into the
Supabase SQL editor and run it.

## 2. Deploy the function
```bash
supabase functions deploy ghl-schedule --no-verify-jwt
```
The function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (both provided to
edge functions automatically) — no extra secrets required. It dispatches by calling
your existing `ghl-messaging` function, so scheduled sends use the exact same path as
live ones.

## 3. Run the worker every minute
Something has to call the function with `{"action":"process"}` once a minute.

**Option A — Supabase Cron (easiest):** Dashboard → **Database → Cron Jobs → Create**:
- Schedule: `* * * * *`
- Type: **Edge Function** → `ghl-schedule`
- Body: `{"action":"process"}`

**Option B — pg_cron + pg_net (SQL):**
```sql
select cron.schedule('ghl-schedule-process','* * * * *', $$
  select net.http_post(
    url := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/ghl-schedule',
    headers := '{"Content-Type":"application/json","x-cron-key":"YOUR_SECRET"}'::jsonb,
    body := '{"action":"process"}'::jsonb
  );
$$);
```

**Option C — any external cron** (cron-job.org, GitHub Actions, etc.) hitting the URL
with `{"action":"process"}` every minute.

### Protect the worker (recommended)
```bash
supabase secrets set SCHED_CRON_KEY=some-long-random-string
```
Then send header `x-cron-key: some-long-random-string` from your cron call (the SQL/
external examples above show where). If `SCHED_CRON_KEY` is unset, `process` runs
unprotected (fine for testing).

## 4. Done
Dashboard → **Messaging → Broadcast → Schedule**, or the 🕐 button in a conversation.
Pending sends appear under **Scheduled** (with a Cancel button) and fire at their time.

### Notes
- Times are stored in UTC; the dashboard sends the browser's local time converted for you.
- Single-tenant: the worker sends through your one connected GHL account.
- Check the worker with `supabase functions logs ghl-schedule`.
