-- The BuilderPro app (iPhone, iPad, Android): push notifications and
-- in-app account deletion.
--
-- Push: the app registers its device token with bp_device_register (one row
-- per device; a phone that changes hands moves to the new user). Every bell
-- notification inserted for a user is posted to the push-send function, which
-- delivers it through Apple (APNs) or Google (FCM) once those keys are added
-- as function secrets. Until then push-send answers "not configured" and the
-- bell keeps working as before. The trigger never blocks or fails the insert.
--
-- The hook secret is generated inside Vault and never leaves the database:
-- push-send reads it back with bp_push_secret() (service role only).

create table if not exists public.device_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  app_version text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists device_tokens_user_idx on public.device_tokens (user_id);
alter table public.device_tokens enable row level security;
revoke all on public.device_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.device_tokens to service_role;

create or replace function public.bp_device_register(p_token text, p_platform text, p_version text default '')
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(p_token, '') !~ '^[A-Za-z0-9:_\-\.]{20,4096}$' or p_platform not in ('ios', 'android') then return false; end if;
  insert into public.device_tokens (token, user_id, platform, app_version, updated_at)
  values (p_token, auth.uid(), p_platform, left(coalesce(p_version, ''), 40), now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, app_version = excluded.app_version, updated_at = now();
  return true;
end $$;
revoke all on function public.bp_device_register(text, text, text) from public, anon;
grant execute on function public.bp_device_register(text, text, text) to authenticated;

create or replace function public.bp_device_forget(p_token text) returns void
language sql volatile security definer set search_path = public as $$
  delete from public.device_tokens where token = p_token and user_id = auth.uid();
$$;
revoke all on function public.bp_device_forget(text) from public, anon;
grant execute on function public.bp_device_forget(text) to authenticated;

-- the shared secret between this trigger and push-send, made and kept in Vault
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'push_hook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_hook_secret');
  end if;
end $$;
create or replace function public.bp_push_secret() returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret' limit 1;
$$;
revoke all on function public.bp_push_secret() from public, anon, authenticated;
grant execute on function public.bp_push_secret() to service_role;

create or replace function public.bp_push_on_notification() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  -- only people who have the app installed
  if exists (select 1 from public.device_tokens where user_id = new.user_id) then
    perform net.http_post(
      url := 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/push-send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', public.bp_push_secret()),
      body := jsonb_build_object('id', new.id));
  end if;
  return null;
exception when others then
  raise warning 'bp_push_on_notification: %', sqlerrm;
  return null;
end $$;
revoke all on function public.bp_push_on_notification() from public, anon, authenticated;
drop trigger if exists bp_push_on_notification on public.notifications;
create trigger bp_push_on_notification after insert on public.notifications
  for each row execute function public.bp_push_on_notification();

-- account deletion requests from contractors (homeowners are deleted at once)
alter table public.support_requests add column if not exists handled_at timestamptz;
