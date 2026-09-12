-- Social Media page: post planner + photo storage.
-- Posts are written by the marketing-oauth edge function (service role); the
-- browser only reads its own rows. Photos go to a public `social` bucket
-- because Facebook / Instagram / Google fetch the image from a URL.
-- Run in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.social_posts (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  channels     text[] not null default '{}',          -- facebook | instagram | gbp
  text         text,
  image_url    text,
  link_url     text,
  scheduled_at timestamptz,
  status       text not null default 'scheduled',    -- scheduled | publishing | published | partial | failed
  results      jsonb not null default '{}'::jsonb,   -- per channel: {ok, id | error}
  published_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists social_posts_owner_idx on public.social_posts(owner, scheduled_at desc);
create index if not exists social_posts_due_idx   on public.social_posts(scheduled_at) where status = 'scheduled';
alter table public.social_posts enable row level security;
drop policy if exists social_posts_read on public.social_posts;
create policy social_posts_read on public.social_posts for select using (owner = auth.uid());

-- ---------- photo bucket ----------
insert into storage.buckets (id, name, public) values ('social', 'social', true)
  on conflict (id) do nothing;
drop policy if exists "social photos: upload own"  on storage.objects;
drop policy if exists "social photos: read"        on storage.objects;
drop policy if exists "social photos: delete own"  on storage.objects;
create policy "social photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'social' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "social photos: read" on storage.objects for select
  using (bucket_id = 'social');
create policy "social photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'social' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- scheduler (optional but recommended) ----------
-- Scheduled posts are also published whenever the client opens the Social
-- Media page, so nothing is lost without this. This makes them go out on time
-- even when nobody is logged in.
--   1. Dashboard → Database → Extensions: enable `pg_cron` and `pg_net`.
--   2. Edge Functions → marketing-oauth → Secrets: add CRON_SECRET (any long random string).
--   3. Put the same string in place of CHANGE-ME below and run this block.
do $$
begin
  perform cron.schedule(
    'social-publish-due', '* * * * *',
    $c$ select net.http_post(
          url     := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/marketing-oauth',
          headers := '{"Content-Type":"application/json","x-cron-secret":"CHANGE-ME"}'::jsonb,
          body    := '{"op":"social.publish_due"}'::jsonb) $c$);
exception when others then
  raise notice 'scheduler not installed (%). Enable pg_cron + pg_net and re-run this block.', sqlerrm;
end $$;
