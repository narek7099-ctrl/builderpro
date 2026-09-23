/* The lead-email parser, against the message shapes vendors actually send.

   Run: node tools/email-parse.test.js

   The case that matters most is "does not take the vendor's support number".
   An email parser does not fail loudly — it returns the wrong phone number,
   and on a lead notification the wrong phone number is nearly always the
   vendor's own support line. A contractor then rings Angi instead of the
   homeowner and concludes the leads are junk. */
const { parseEmail, htmlToText, nameFromSubject, isVendorEmail } =
  require('../supabase/functions/lead-email/email-parse.js');

let fails = 0;
function check(what, got, want) {
  if (got !== want) {
    fails++;
    console.log('  FAIL ' + what + '\n    got  ' + JSON.stringify(got) + '\n    want ' + JSON.stringify(want));
  }
}
function has(what, got, needle) {
  if (String(got).indexOf(needle) < 0) {
    fails++;
    console.log('  FAIL ' + what + '\n    got  ' + JSON.stringify(got) + '\n    want it to contain ' + JSON.stringify(needle));
  }
}

/* --- Angi-shaped: labelled plain text, support number in the footer ----- */
const angi = parseEmail({
  subject: 'New Lead: Roof repair - Dana Whitfield',
  text: [
    'You have a new lead!',
    '',
    'Name: Dana Whitfield',
    'Phone: (512) 555-0134',
    'Email: dana.w@example.com',
    'Address: 7710 Highland Ave',
    'City: Austin',
    'State: TX',
    'Zip: 78704',
    'Task: Roof repair',
    'Comments: Shingles blew off in the storm last week.',
    'A few are in the yard and I think there is a leak',
    'over the garage.',
    '',
    'Questions? Call us at 877-947-3639 or email support@angi.com',
    'Unsubscribe | Manage your leads | © 2026 Angi Inc.'
  ].join('\n')
});
check('angi name', angi.name, 'Dana Whitfield');
check('angi phone', angi.phone, '(512) 555-0134');
check('angi email', angi.email, 'dana.w@example.com');
check('angi address', angi.address, '7710 Highland Ave Austin, TX 78704');
has('angi job keeps the task', angi.job, 'Roof repair');
has('angi job keeps the wrapped comment', angi.job, 'leak over the garage.');

/* THE case. Both of these are in the message; neither may win. */
if (angi.phone.indexOf('947') >= 0) { fails++; console.log('  FAIL angi took the SUPPORT number'); }
if (angi.email.indexOf('angi.com') >= 0) { fails++; console.log('  FAIL angi took the SUPPORT address'); }

/* --- an HTML table, which is what most of them really send -------------- */
const html = parseEmail({
  subject: 'New request from Thumbtack',
  html: `<html><body><table>
    <tr><td>Customer</td><td>Marco Reyes</td></tr>
    <tr><td>Phone</td><td>512.555.0199</td></tr>
    <tr><td>Email</td><td>marco&#64;example.com</td></tr>
    <tr><td>Service</td><td>Gutter repair</td></tr>
    <tr><td>Zip</td><td>78664</td></tr>
    <tr><td>Details</td><td>Gutters overflowing at the back of the house</td></tr>
    </table>
    <p style="font-size:10px">Need help? Contact us at 866-501-2069.
    <a href="#">Unsubscribe</a></p></body></html>`
});
check('html customer', html.name, 'Marco Reyes');
check('html phone', html.phone, '512.555.0199');
check('html email entity decoded', html.email, 'marco@example.com');
has('html job', html.job, 'Gutter repair');
if (html.phone.indexOf('501') >= 0) { fails++; console.log('  FAIL html took the SUPPORT number'); }

/* --- forwarded by the contractor from their own inbox ------------------- */
/* This is the normal case for option 2: they set a forward up in Gmail, so
   the sender is them and the lead is quoted below. */
const fwd = parseEmail({
  subject: 'Fwd: New Lead - Priya Nair',
  text: [
    '---------- Forwarded message ---------',
    'From: Angi Leads <leads@angi.com>',
    'To: me@myroofingco.com',
    '',
    '> Name: Priya Nair',
    '> Phone: 512-555-0111',
    '> Email: priya@example.com',
    '> Task: Roof replacement',
    '',
    'Unsubscribe'
  ].join('\n')
});
check('forwarded name', fwd.name, 'Priya Nair');
check('forwarded phone', fwd.phone, '512-555-0111');
check('forwarded email', fwd.email, 'priya@example.com');
/* the forwarding headers must not become the lead */
if (fwd.email.indexOf('angi.com') >= 0 || fwd.email.indexOf('myroofingco') >= 0) {
  fails++; console.log('  FAIL forwarded took an address out of the forward header');
}

/* --- no labels at all: a seller who writes a sentence ------------------- */
const loose = parseEmail({
  subject: 'Sam Okafor wants a roof inspection',
  text: 'Sam Okafor asked for a quote. Reach them on 512 555 0123 or sam@example.com.\n\nUnsubscribe here.'
});
check('loose name from subject', loose.name, 'Sam Okafor');
check('loose phone', loose.phone, '512 555 0123');
check('loose email', loose.email, 'sam@example.com');

/* --- a long label must not swallow a sentence containing a colon -------- */
const colon = parseEmail({
  subject: 'Lead',
  text: 'Name: Lee Park\nPhone: 5125550144\nComments: Available Tuesday: after 3pm is best'
});
check('name survives a later colon', colon.name, 'Lee Park');
has('comment keeps its own colon', colon.job, 'Tuesday: after 3pm');

/* --- nothing usable: invent nothing ------------------------------------ */
const junk = parseEmail({ subject: 'Your weekly summary', text: 'Thanks for using our service. Unsubscribe' });
check('junk invents no phone', junk.phone, '');
check('junk invents no email', junk.email, '');
check('empty message does not throw', parseEmail(null).phone, '');
check('empty message name', parseEmail({}).name, '');

/* --- units -------------------------------------------------------------- */
check('vendor address rejected', isVendorEmail('no-reply@thumbtack.com'), true);
check('homeowner address accepted', isVendorEmail('dana@example.com'), false);
check('subject with a lead prefix', nameFromSubject('New lead: Dana Whitfield - Roofing'), 'Dana Whitfield');
has('html to text splits rows', htmlToText('<tr><td>A</td><td>B</td></tr>'), 'A\tB');

console.log(fails ? '\n' + fails + ' FAILED' : 'email parser behaves · vendor footers kept out');
process.exit(fails ? 1 : 0);
