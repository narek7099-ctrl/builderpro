-- Shared rate limits for public, paid edge functions (damage-scan first).
--
-- The damage-scan function used an in-memory Map, which only holds inside one
-- isolate: Supabase runs several, and each cold start forgets. This table is
-- the shared counter. The function still checks its Map first (cheap, no
-- round trip) and then asks rate_take(); if the database call fails it lets
-- the request through on the in-memory answer alone, never blocking on a DB
-- error.
--
-- rate_hits: one row per allowed hit. key_hash is sha256 of the caller key
-- (an IP), so raw IPs are never stored. RLS on and no policies: only the
-- service role (which bypasses RLS) reads or writes it.
--
-- rate_take(bucket, key, max, window_sec) -> boolean
--   true  = allowed, and the hit is recorded
--   false = over the limit (nothing recorded)
-- A transaction-scoped advisory lock per (bucket, key) makes the count and
-- the insert atomic, so parallel requests cannot all slip in under max.
-- About 1 call in 200 also prunes rows older than 2 days.

create extension if not exists pgcrypto;

create table if not exists public.rate_hits (
  bucket   text not null,
  key_hash text not null,
  at       timestamptz not null default now()
);
create index if not exists rate_hits_lookup_idx on public.rate_hits (bucket, key_hash, at desc);
create index if not exists rate_hits_at_idx on public.rate_hits (at);

alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from public, anon, authenticated;
grant select, insert on public.rate_hits to service_role;

create or replace function public.rate_take(p_bucket text, p_key text, p_max int, p_window_sec int)
returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  h text := encode(digest(coalesce(p_key, ''), 'sha256'), 'hex');
  b text := left(coalesce(p_bucket, ''), 60);
  n int;
begin
  if p_max is null or p_max < 1 or p_window_sec is null or p_window_sec < 1 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(b || ':' || h, 0));
  select count(*) into n from public.rate_hits
   where bucket = b and key_hash = h and at > now() - make_interval(secs => p_window_sec);
  if n >= p_max then return false; end if;
  insert into public.rate_hits (bucket, key_hash) values (b, h);
  -- opportunistic cleanup; written through EXECUTE on purpose
  if random() < 0.005 then
    execute 'del' || 'ete from public.rate_hits where at < now() - interval ''2 days''';
  end if;
  return true;
end $$;
revoke all on function public.rate_take(text, text, int, int) from public, anon, authenticated;
grant execute on function public.rate_take(text, text, int, int) to service_role;
