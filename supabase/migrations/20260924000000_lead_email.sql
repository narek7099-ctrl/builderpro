-- Lead sources by email.
--
-- Angi, Thumbtack and most small sellers will never offer a webhook, but all
-- of them send an email for every lead. This gives each source its own
-- inbound address: the contractor sets one forwarding rule in whatever inbox
-- those notifications already land in, and from then on an emailed lead goes
-- down exactly the same path as a posted one.

-- A short address is the whole point — a contractor types this into Gmail's
-- forwarding box by hand, and a UUID would be retyped wrong. Ten characters
-- of base32-ish alphabet is 40 bits: not a secret worth much on its own, but
-- it does not have to be. The worst an address does is let someone file a
-- lead into an account, and anything arriving there is visible, attributed to
-- a source, and trivially turned off.
create or replace function public.lead_inbox_slug()
returns text language sql volatile as $$
  -- no l/1/o/0: they are the characters people mistype when copying by eye
  select string_agg(substr('abcdefghijkmnpqrstuvwxyz23456789',
                           1 + floor(random() * 32)::int, 1), '')
    from generate_series(1, 10);
$$;

alter table public.lead_sources
  add column if not exists inbox_slug text unique default public.lead_inbox_slug();

-- existing rows predate the column and its default only fires on insert
update public.lead_sources set inbox_slug = public.lead_inbox_slug()
 where inbox_slug is null;

create index if not exists lead_sources_inbox on public.lead_sources (inbox_slug);

-- Resolving an inbound address to its source, for the lead-email function.
-- Returns the webhook secret too: that function does not write leads itself,
-- it hands the parsed fields to the ordinary intake endpoint. One write path
-- for both routes, so the email one cannot quietly drift away from the tested
-- one — and the email route is precisely the one whose drift nobody notices.
create or replace function public.lead_source_for_inbox(p_slug text)
returns table (id uuid, owner uuid, vendor text, label text, secret text)
language sql security definer set search_path = public as $$
  select s.id, s.owner, s.vendor, s.label, s.secret
    from public.lead_sources s
   where s.inbox_slug = lower(trim(p_slug)) and s.active
   limit 1;
$$;
revoke all on function public.lead_source_for_inbox(text) from public;
grant execute on function public.lead_source_for_inbox(text) to service_role;
