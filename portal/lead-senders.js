/* ==================================================================
   Which messages in a connected mailbox are lead notifications.

   This is the narrowest part of the whole feature and deliberately so.
   Connecting a mailbox hands us a token that could read everything in
   it — invoices, the accountant, their divorce. The only defensible
   version of that is to never ask for anything outside a tight,
   explicit filter, and the filter is here.

   Plain JavaScript beside the function so tools/mail-senders.test.js
   can check it under node. A query that is too narrow loses leads and
   somebody notices; a query that is too WIDE quietly pulls a
   contractor's private mail into a CRM, and nobody notices at all.
   That asymmetry is why the default is to match nothing.
   ================================================================== */
(function (root) {
  'use strict';

  /* The domains each platform actually sends lead notifications from.
     Matched on the domain and not on the display name, because a display
     name is whatever the sender types — "Angi Leads" is trivially
     spoofable and the domain is not. */
  var VENDOR_SENDERS = {
    angi: ['angi.com', 'angieslist.com', 'emails.angi.com', 'leads.angi.com'],
    homeadvisor: ['homeadvisor.com', 'emails.homeadvisor.com', 'hameadvisor.com'],
    thumbtack: ['thumbtack.com', 'email.thumbtack.com'],
    networx: ['networx.com', 'networxsystems.com'],
    modernize: ['modernize.com', 'email.modernize.com'],
    /* 'website' and 'generic' have no fixed sender: whoever set the form up
       chose it. Those are configured per source instead, and until somebody
       types one in they match nothing — see queryFor. */
    website: [],
    generic: []
  };

  function domainsFor(vendor, extra) {
    var base = VENDOR_SENDERS[vendor] || [];
    var out = [];
    base.concat(splitList(extra)).forEach(function (d) {
      d = normDomain(d);
      if (d && out.indexOf(d) < 0) out.push(d);
    });
    return out;
  }

  /* Accepts "leads@angi.com, thumbtack.com" or a newline-separated list,
     because a contractor pasting addresses in will use whatever separator
     comes to hand. An address is reduced to its domain: they will paste
     "no-reply@angi.com" meaning "mail from Angi". */
  function splitList(s) {
    return String(s || '').split(/[\s,;]+/).filter(Boolean);
  }

  function normDomain(d) {
    var s = String(d || '').toLowerCase().trim();
    s = s.replace(/^[^@]*@/, '');            /* an address becomes its domain */
    s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    s = s.replace(/[<>()"']/g, '');
    /* a bare label with no dot is not a domain and must not become a filter
       that matches half the mailbox */
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return '';
    return s;
  }

  /* A Gmail search string. Scoped three ways at once — sender, recency, and
     nothing already handled — because each one on its own has a failure mode
     that ends with reading mail we have no business reading. */
  function queryFor(sources, sinceDays) {
    var domains = [];
    (sources || []).forEach(function (s) {
      domainsFor(s.vendor, s.sender_domains).forEach(function (d) {
        if (domains.indexOf(d) < 0) domains.push(d);
      });
    });
    /* No configured senders means no query. Returning '' rather than a
       match-everything default is the entire safety property of this file:
       a bug upstream that loses the source list must read nothing, not
       everything. */
    if (!domains.length) return '';
    var days = Math.max(1, Math.min(30, parseInt(sinceDays, 10) || 2));
    return '(' + domains.map(function (d) { return 'from:' + d; }).join(' OR ') + ')'
      + ' newer_than:' + days + 'd'
      + ' -in:chats -in:drafts';
  }

  /* Which source a fetched message belongs to, by its sender's domain.
     Returns null when nothing matches, and the caller drops the message —
     a message we cannot attribute is one we should not have fetched. */
  function sourceFor(sources, fromHeader) {
    var dom = normDomain(String(fromHeader || '').replace(/^.*</, '').replace(/>.*$/, ''));
    if (!dom) return null;
    var best = null;
    (sources || []).forEach(function (s) {
      domainsFor(s.vendor, s.sender_domains).forEach(function (d) {
        /* exact, or a subdomain of it: emails.angi.com belongs to angi.com */
        if (dom === d || dom.slice(-(d.length + 1)) === '.' + d) {
          if (!best || d.length > best.d.length) best = { s: s, d: d };
        }
      });
    });
    return best ? best.s : null;
  }

  var api = { VENDOR_SENDERS: VENDOR_SENDERS, domainsFor: domainsFor,
    normDomain: normDomain, queryFor: queryFor, sourceFor: sourceFor };
  root.mailSenders = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
