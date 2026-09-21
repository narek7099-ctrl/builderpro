/* The lead parser, against the payload shapes vendors actually post.

   Run: node tools/lead-parse.test.js

   These cases are the point of extracting parse.js from the edge function.
   A parser that misses a field does not throw — it produces a lead with no
   phone number, which looks like a bad lead from the vendor rather than a
   bug in here, and nobody goes looking. */
const { parseLead, phoneKey } = require('../supabase/functions/lead-intake/parse.js');

let fails = 0;
function check(what, got, want) {
  const ok = got === want;
  if (!ok) { fails++; console.log('  FAIL ' + what + '\n    got  ' + JSON.stringify(got) + '\n    want ' + JSON.stringify(want)); }
  return ok;
}

/* --- Angi-shaped: nested, split name, separate task and comments --------- */
const angi = parseLead({
  lead: {
    firstName: 'Dana', lastName: 'Whitfield',
    primaryPhone: '(512) 555-0134', email: 'Dana.W@example.com',
    address: '7710 Highland Ave', city: 'Austin', state: 'TX', zip: '78704',
    taskName: 'Roof replacement',
    comments: 'Shingles blew off in the storm last week, need someone out soon.'
  }
});
check('angi name', angi.name, 'Dana Whitfield');
check('angi phone kept raw', angi.phone, '(512) 555-0134');
check('angi phone key', angi.phoneKey, '5125550134');
check('angi email lowercased', angi.email, 'dana.w@example.com');
check('angi address joined', angi.address, '7710 Highland Ave Austin, TX 78704');
check('angi keeps task AND comments', angi.job,
  'Roof replacement — Shingles blew off in the storm last week, need someone out soon.');

/* --- Thumbtack-shaped: flat, full name, snake_case ----------------------- */
const tt = parseLead({
  full_name: 'Marco Reyes', phone_number: '512.555.0199',
  email_address: 'marco@example.com',
  street_address: '88 Elm St', city: 'Round Rock', state: 'TX', zip_code: '78664',
  service_type: 'Gutter repair'
});
check('thumbtack name', tt.name, 'Marco Reyes');
check('thumbtack phone key', tt.phoneKey, '5125550199');
check('thumbtack job from category alone', tt.job, 'Gutter repair');

/* --- a website form: camelCase, +1 country code, no category ------------- */
const web = parseLead({
  data: { contactName: 'Priya N', mobilePhone: '+1 512 555 0134',
    Address1: '12031 W Sherman Road', City: 'Austin', State: 'TX',
    message: 'Requesting a quote for a new roof.' }
});
check('web name', web.name, 'Priya N');
check('+1 stripped for comparison', web.phoneKey, '5125550134');
check('web job', web.job, 'Requesting a quote for a new roof.');

/* The whole reason phoneKey exists: three spellings, one homeowner. */
check('angi and web are the same person', angi.phoneKey, web.phoneKey);

/* --- single-element array wrapper, which a couple of sellers use --------- */
const arr = parseLead({ result: [{ name: 'Sam Okafor', tel: '5125550111', zip: '78704' }] });
check('array-wrapped name', arr.name, 'Sam Okafor');
check('array-wrapped phone', arr.phoneKey, '5125550111');

/* --- the unwrap must not wander off into the vendor's own account -------- */
const acct = parseLead({
  account: { name: 'Acme Lead Sellers LLC', phone: '8005550000' },
  lead: { name: 'Real Homeowner', phone: '5125550123' }
});
check('reads the lead, not the seller', acct.name, 'Real Homeowner');
check('reads the lead phone', acct.phoneKey, '5125550123');

/* --- junk in, nothing pretended -------------------------------------- */
const empty = parseLead({ foo: 'bar' });
check('no name invents nothing but a placeholder', empty.name, 'Lead');
check('no phone stays empty', empty.phoneKey, '');
check('no email stays empty', empty.email, '');
check('null body does not throw', parseLead(null).name, 'Lead');

/* --- category already inside the free text is not repeated -------------- */
const dup = parseLead({ name: 'X', phone: '5125550101',
  category: 'Roofing', description: 'Roofing job, two storey house' });
check('category not doubled up', dup.job, 'Roofing job, two storey house');

check('phoneKey on rubbish', phoneKey('n/a'), '');

console.log(fails ? '\n' + fails + ' FAILED' : 'lead parser behaves · all payload shapes read');
process.exit(fails ? 1 : 0);
