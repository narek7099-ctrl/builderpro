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

/* --- provider envelopes -------------------------------------------------
   A mapping that misses does not throw. Every message just parses as empty
   and the only symptom is leads that never arrive, so these are worth
   pinning to the real payload shapes. */
const { normaliseInbound } = require('../supabase/functions/lead-email/email-parse.js');

/* Postmark: JSON, TitleCase, ToFull is an array of objects and must be
   ignored in favour of the string fields. */
const pm = normaliseInbound({
  From: 'Angi Leads <leads@angi.com>',
  FromFull: { Email: 'leads@angi.com', Name: 'Angi Leads' },
  To: 'ab3k9x2p7q@leads.builderpro-os.com',
  ToFull: [{ Email: 'ab3k9x2p7q@leads.builderpro-os.com', Name: '' }],
  OriginalRecipient: 'ab3k9x2p7q@leads.builderpro-os.com',
  Subject: 'New Lead: Roof repair',
  TextBody: 'Name: Dana Whitfield\nPhone: 5125550134',
  HtmlBody: '<p>Name: Dana Whitfield</p>',
  MessageID: 'a8c1...'
});
check('postmark to', pm.to, 'ab3k9x2p7q@leads.builderpro-os.com');
check('postmark from', pm.from, 'Angi Leads <leads@angi.com>');
check('postmark subject', pm.subject, 'New Lead: Roof repair');
has('postmark text', pm.text, 'Dana Whitfield');
has('postmark html', pm.html, 'Dana Whitfield');

/* and it must reach the same lead as a webhook would */
const pmLead = parseEmail(pm);
check('postmark end to end name', pmLead.name, 'Dana Whitfield');
check('postmark end to end phone', pmLead.phone, '5125550134');

/* Postmark forwarded: To is still the contractor's own inbox, and only
   OriginalRecipient carries our slug. Taking To here would lose the source. */
const pmFwd = normaliseInbound({
  To: 'me@myroofingco.com',
  OriginalRecipient: 'mn4r7t8w2v@leads.builderpro-os.com',
  Subject: 'Fwd: lead', TextBody: 'x'
});
check('forwarded uses the delivered-to address', pmFwd.to, 'mn4r7t8w2v@leads.builderpro-os.com');

/* Mailgun / SendGrid: form data, lower case, hyphenated */
const mg = normaliseInbound({
  recipient: 'ab3k9x2p7q@leads.builderpro-os.com',
  sender: 'leads@angi.com',
  subject: 'New Lead',
  'body-plain': 'Phone: 5125550134',
  'body-html': '<p>Phone: 5125550134</p>'
});
check('mailgun recipient', mg.to, 'ab3k9x2p7q@leads.builderpro-os.com');
has('mailgun text', mg.text, '5125550134');
check('empty envelope is safe', normaliseInbound(null).to, '');

/* --- Gmail's forwarding confirmation ------------------------------------
   This lands on the inbound address, not in their inbox, so the code has to
   be readable in the list or the contractor is stranded halfway through
   setting the forward up. */
const { forwardCode } = require('../supabase/functions/lead-email/email-parse.js');
const gm = forwardCode({
  from: 'Gmail Team <forwarding-noreply@google.com>',
  subject: '(#057620342) Gmail Forwarding Confirmation - Receive Mail from me@myroofingco.com',
  text: [
    'me@myroofingco.com has requested to automatically forward mail to your address.',
    'Confirmation code: 057620342',
    'To allow it, please click the link below:',
    'https://mail.google.com/mail/vf-ANGjdJ8-confirm'
  ].join('\n')
});
check('gmail code found', gm && gm.code, '057620342');
has('gmail link found', gm && gm.link, 'confirm');

/* a real lead must never be mistaken for a confirmation */
check('a lead is not a code', forwardCode({
  from: 'leads@angi.com', subject: 'New Lead',
  text: 'Name: Dana Whitfield\nPhone: 5125550134\nJob number 88213456'
}), null);

console.log(fails ? '\n' + fails + ' FAILED' : 'email parser behaves · vendor footers kept out, forwarding codes surfaced');
process.exit(fails ? 1 : 0);
