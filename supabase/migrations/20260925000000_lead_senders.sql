-- Who sends a source's lead notifications.
--
-- Needed by the Gmail reader: it searches by sender and by nothing else, so
-- that it can never see anything in the mailbox but the lead emails it was
-- set up for. The big platforms have known sending domains built in; every
-- local seller and website form has whatever address its owner chose, and
-- until somebody types it in the reader matches NOTHING.
--
-- That is the intended failure. A filter that defaults to matching broadly
-- would quietly pull a contractor's private mail into a CRM, and nobody
-- would ever notice; a filter that matches nothing loses leads, and somebody
-- complains the same afternoon.
alter table public.lead_sources
  add column if not exists sender_domains text not null default '';

comment on column public.lead_sources.sender_domains is
  'Extra sending addresses or domains for this source, comma separated.
   Added to the platform defaults in portal/lead-senders.js. Only the domain
   part is ever used.';
