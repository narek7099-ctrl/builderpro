/* The mailbox filter. Run: node tools/mail-senders.test.js

   A query that is too narrow loses leads and somebody complains. A query
   that is too WIDE pulls a contractor's private mail into a CRM and nobody
   notices at all. These tests are weighted accordingly: most of them are
   about what must NOT match. */
const { queryFor, sourceFor, normDomain, domainsFor } =
  require('../portal/lead-senders.js');

let fails = 0;
const check = (what, got, want) => {
  if (got !== want) { fails++; console.log('  FAIL ' + what + '\n    got  ' + JSON.stringify(got) + '\n    want ' + JSON.stringify(want)); }
};
const has = (what, got, needle) => {
  if (String(got).indexOf(needle) < 0) { fails++; console.log('  FAIL ' + what + '\n    got  ' + JSON.stringify(got) + '\n    want it to contain ' + JSON.stringify(needle)); }
};
const hasnt = (what, got, needle) => {
  if (String(got).indexOf(needle) >= 0) { fails++; console.log('  FAIL ' + what + '\n    got  ' + JSON.stringify(got) + '\n    must NOT contain ' + JSON.stringify(needle)); }
};

/* --- the query ---------------------------------------------------------- */
const q = queryFor([{ vendor: 'angi' }, { vendor: 'thumbtack' }], 2);
has('query has angi', q, 'from:angi.com');
has('query has thumbtack', q, 'from:thumbtack.com');
has('query is time-bounded', q, 'newer_than:2d');
has('query skips drafts', q, '-in:drafts');

/* THE safety property: no configured senders must mean no query at all,
   never a query that matches the mailbox. */
check('no sources means no query', queryFor([], 2), '');
check('null sources means no query', queryFor(null, 2), '');
check('a website source alone has no senders', queryFor([{ vendor: 'website' }], 2), '');
check('a generic source alone has no senders', queryFor([{ vendor: 'generic' }], 2), '');

/* a generic source with senders typed in does get a query */
const gq = queryFor([{ vendor: 'generic', sender_domains: 'leads@acmeleads.com' }], 2);
check('typed sender becomes its domain', gq.indexOf('from:acmeleads.com') >= 0, true);
hasnt('the local part is not in the query', gq, 'leads@');

/* the window is clamped — a caller passing junk must not widen it */
has('days floor', queryFor([{ vendor: 'angi' }], -5), 'newer_than:1d');
has('zero falls back to the default', queryFor([{ vendor: 'angi' }], 0), 'newer_than:2d');
has('days ceiling', queryFor([{ vendor: 'angi' }], 9999), 'newer_than:30d');
has('days junk', queryFor([{ vendor: 'angi' }], 'abc'), 'newer_than:2d');

/* --- domain normalising ------------------------------------------------- */
check('address to domain', normDomain('no-reply@angi.com'), 'angi.com');
check('url to domain', normDomain('https://angi.com/leads'), 'angi.com');
check('angle brackets', normDomain('<leads@angi.com>'), 'angi.com');
/* a bare word is not a domain and must never become a filter */
check('bare word rejected', normDomain('angi'), '');
check('empty rejected', normDomain(''), '');
check('junk rejected', normDomain('...'), '');

/* --- attributing a fetched message -------------------------------------- */
const sources = [
  { id: 'a', vendor: 'angi' },
  { id: 't', vendor: 'thumbtack' },
  { id: 'g', vendor: 'generic', sender_domains: 'acmeleads.com' }
];
check('angi message', (sourceFor(sources, 'Angi Leads <leads@angi.com>') || {}).id, 'a');
check('angi subdomain', (sourceFor(sources, 'x@emails.angi.com') || {}).id, 'a');
check('thumbtack message', (sourceFor(sources, 'Thumbtack <no-reply@thumbtack.com>') || {}).id, 't');
check('typed-in seller', (sourceFor(sources, 'sales@acmeleads.com') || {}).id, 'g');

/* Unattributable mail is dropped. A message we cannot place is one we
   should not have fetched, and guessing would file the accountant as a
   roofing lead. */
check('unknown sender is dropped', sourceFor(sources, 'accountant@example.com'), null);
check('empty from is dropped', sourceFor(sources, ''), null);

/* A lookalike domain must not pass as the real one. This is the case that
   matters if anyone ever tries to push mail into a contractor's CRM. */
check('lookalike suffix rejected', sourceFor(sources, 'x@notangi.com'), null);
check('lookalike prefix rejected', sourceFor(sources, 'x@angi.com.evil.net'), null);

check('domainsFor merges without duplicates',
  domainsFor('angi', 'angi.com, angi.com').filter(d => d === 'angi.com').length, 1);

console.log(fails ? '\n' + fails + ' FAILED' : 'mailbox filter behaves · nothing matches by default');
process.exit(fails ? 1 : 0);
