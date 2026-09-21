/* The claim model rests on two spellings of one house producing one key.
   This runs the portal's implementation and the scheduled job's copy over
   the same cases and fails if they ever disagree, or if a pair that must
   collapse does not. */
const path = require('path');
const site = require(path.join(__dirname, '..', 'portal', 'radar-key.js')).doorKey;

let job;
try {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'radar-daily', 'door-key.js'), 'utf8');
  job = new Function(src.replace(/\bexport\s+/g, '') + '\n;return doorKey;')();
} catch (e) { job = null; }

const SAME = [
  ['7710 Highland Ave, Austin, TX', '7710 HIGHLAND AVENUE, AUSTIN, TX 78731'],
  ['1200 W 6th St', '1200 West Sixth'.replace('Sixth', '6th')],
  ['904 E Cesar Chavez St, Apt 2, Austin TX', '904 East Cesar Chavez Street #2'],
  ['15 Oak Ct.', '15 OAK COURT'],
  ['88 Rockridge Blvd Suite 300', '88 Rockridge Boulevard'],
];
const DIFFER = [
  ['100 N Main St', '100 S Main St'],
  ['7710 Highland Ave', '7712 Highland Ave'],
];
/* Deliberately NOT asserted as different: "12 Oak Ln, 78701" and
   "12 Oak Ln, 78745" collapse to one door. The feeds supply a zip on some
   rows and not others, so keying on it would split one house in two — and
   two keys for one house is the failure this whole model exists to prevent,
   where a collision between two same-named streets is merely untidy. */

let fail = 0;
const show = (a, b, ok, why) => { if (!ok) { fail++; console.log('  FAIL ' + why + '\n        ' + a + '\n        ' + b); } };

SAME.forEach(([a, b]) => show(site(a) + '  →  ' + a, site(b) + '  →  ' + b, site(a) === site(b) && site(a) !== '', 'these must be one door'));
DIFFER.forEach(([a, b]) => show(site(a) + '  →  ' + a, site(b) + '  →  ' + b, site(a) !== site(b), 'these must be different doors'));
if (job) {
  const all = [].concat(...SAME, ...DIFFER);
  all.forEach(a => show('portal: ' + site(a), 'job:    ' + job(a), site(a) === job(a), 'the two copies disagree on "' + a + '"'));
} else {
  console.log('  (the job copy is not in place yet — portal checked alone)');
}
console.log(fail ? '\n' + fail + ' failed' : 'door keys agree · ' + (SAME.length + DIFFER.length) + ' pairs');
process.exit(fail ? 1 : 0);
