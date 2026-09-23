/* ==================================================================
   Pulling a lead out of a lead-notification email.

   Angi, Thumbtack, HomeAdvisor and every small seller send the same
   information as a formatted email, because that is what they have
   always done and most of them will never offer a webhook. This turns
   that email back into fields.

   Plain JavaScript, beside the function, so tools/email-parse.test.js
   can run it under node against real message shapes. It needs the tests
   more than anything else in here: an email parser does not fail loudly,
   it just returns the wrong phone number — and the wrong phone number on
   a lead notification is usually the VENDOR'S support line, which means
   a contractor cheerfully ringing Angi instead of the homeowner.

   Deliberately label-first. Loose pattern matching over the whole body
   finds the unsubscribe address and the support number every time, so
   those patterns only run when no labelled field was found, and then
   only on lines that are not obviously footer.
   ================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------- html --- */
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#160': ' ' };

  function decode(s) {
    return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (m, k) {
      var lk = k.toLowerCase();
      if (ENT[lk] !== undefined) return ENT[lk];
      if (lk.charAt(0) === '#') {
        var n = lk.charAt(1) === 'x' ? parseInt(lk.slice(2), 16) : parseInt(lk.slice(1), 10);
        if (isFinite(n) && n > 0 && n < 0x10000) return String.fromCharCode(n);
      }
      return m;
    });
  }

  /* Most lead emails are an HTML table: label in one cell, value in the
     next. Cells become tabs and rows become newlines, which turns that
     table back into the "Label: value" shape the rest of this reads. */
  function htmlToText(html) {
    var s = String(html || '');
    s = s.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ');
    s = s.replace(/<!--[\s\S]*?-->/g, ' ');
    s = s.replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, '\t');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n');
    s = s.replace(/<[^>]+>/g, ' ');
    s = decode(s);
    s = s.replace(/[ \t ]+/g, function (m) { return m.indexOf('\t') >= 0 ? '\t' : ' '; });
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.split('\n').map(function (l) { return l.replace(/[ \t]+$/, '').replace(/^[ ]+/, ''); }).join('\n').trim();
  }

  /* --------------------------------------------------------- footers --- */
  /* Lines past this point are the vendor talking to the contractor, not the
     homeowner's details. Anything found below the first match is ignored by
     the loose fallbacks. */
  var FOOTER = /(unsubscribe|manage your (?:account|leads|preferences)|privacy policy|terms of (?:use|service)|©|\(c\)\s*\d{4}|all rights reserved|sent to you because|view (?:this|it) (?:online|in browser)|update your profile|do not reply|this is an automated)/i;

  /* Lines offering the VENDOR'S contact details. The support number sits
     under exactly these words, and it is the single most damaging thing to
     mistake for the lead's own number. */
  var VENDOR_LINE = /(questions\??|need help|contact (?:us|support)|customer (?:care|support|service)|call us|our team|support line|help (?:center|centre)|reply to this email)/i;

  /* Addresses that are never the homeowner. */
  var VENDOR_DOM = /(angi|angies?list|homeadvisor|thumbtack|networx|modernize|porch|houzz|bark|craftjack|33mail|mailchimp|sendgrid|mailgun)\.|(^|@)(no-?reply|donotreply|do-not-reply|notifications?|support|help|info|hello|leads?|alerts?)@/i;

  function isVendorEmail(e) {
    var s = String(e || '').toLowerCase();
    if (!s) return true;
    return VENDOR_DOM.test(s) || /@.*\.(angi|thumbtack|homeadvisor)\./.test(s);
  }

  /* ---------------------------------------------------------- labels --- */
  /* Normalised the same way the webhook parser normalises JSON keys, so one
     set of synonyms serves both routes. */
  function norm(k) { return String(k).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /* A label is short, wordy, and sits before a colon or a tab. The length
     cap is what stops a whole sentence containing a colon from being read
     as a field — "Note: I'm free Tuesday: after 3" has one label, not two. */
  var LABEL = /^[\s>*|-]*([A-Za-z][A-Za-z0-9 /&'’-]{1,34}?)\s*(?::|\t)[\s]*(.*)$/;

  /* Labels whose value continues onto the following lines — the homeowner's
     own description is nearly always wrapped across several. */
  var MULTILINE = ['comments', 'description', 'details', 'notes', 'message', 'jobdescription',
    'projectdescription', 'additionalinformation', 'customercomments', 'leadcomments'];

  function fields(text) {
    var out = {};
    var lines = String(text || '').split('\n');
    var footerAt = lines.length;
    for (var i = 0; i < lines.length; i++) {
      if (FOOTER.test(lines[i])) { footerAt = i; break; }
    }

    var lastKey = null;
    for (var j = 0; j < footerAt; j++) {
      var line = lines[j];
      var m = LABEL.exec(line);
      if (m) {
        var key = norm(m[1]);
        var val = m[2].trim();
        /* the value can sit on the next line instead — an HTML table where
           the label cell and the value cell became separate rows */
        if (!val) {
          var nx = (lines[j + 1] || '').trim();
          if (nx && !LABEL.test(nx) && nx.length < 200) { val = nx; j++; }
        }
        if (key && val && out[key] === undefined) out[key] = val;
        lastKey = MULTILINE.indexOf(key) >= 0 ? key : null;
        continue;
      }
      /* continuation of a free-text field */
      if (lastKey && line.trim()) {
        if (out[lastKey].length < 500) out[lastKey] += ' ' + line.trim();
        continue;
      }
      if (!line.trim()) lastKey = null;
    }
    return { fields: out, body: lines.slice(0, footerAt).join('\n') };
  }

  /* ---------------------------------------------------------- loose ---- */
  var RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  /* North American, in the shapes these emails actually use. Anchored on a
     boundary so it does not bite a chunk out of an order number. */
  var RE_PHONE = /(?:\+?1[\s.-]*)?\(?([2-9]\d{2})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})(?!\d)/g;

  function looseEmail(body) {
    var lines = body.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (VENDOR_LINE.test(lines[i])) continue;
      var found = lines[i].match(RE_EMAIL) || [];
      for (var k = 0; k < found.length; k++) {
        if (!isVendorEmail(found[k])) return found[k];
      }
    }
    return '';
  }

  function loosePhone(body) {
    var lines = body.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (VENDOR_LINE.test(lines[i])) continue;
      RE_PHONE.lastIndex = 0;
      var m = RE_PHONE.exec(lines[i]);
      if (m) return m[0].trim();
    }
    return '';
  }

  /* Subjects carry the name often enough to be worth reading, in shapes like
     "New lead: Dana Whitfield - Roof repair" or "Dana Whitfield wants a quote".
     Only used when no Name field was labelled. */
  function nameFromSubject(subject) {
    var s = String(subject || '').replace(/^(re|fwd?|fw)\s*:\s*/i, '').trim();
    s = s.replace(/^(new\s+)?(lead|request|opportunity|inquiry|enquiry|contact|message)\s*(alert)?\s*[:\-–]\s*/i, '');
    var m = /^([A-Z][a-zA-Z'’-]+(?:\s+[A-Z][a-zA-Z'’.-]+){0,2})\s*(?:[-–|,]|\bwants\b|\bneeds\b|\bis\b|\brequested\b)/.exec(s);
    if (m) return m[1].trim();
    if (/^[A-Z][a-zA-Z'’-]+(\s+[A-Z][a-zA-Z'’.-]+){1,2}$/.test(s)) return s;
    return '';
  }

  /* ---------------------------------------------------------- public --- */
  /* Returns a flat object of the shape the webhook parser already reads, so
     an emailed lead and a posted lead go down one code path from here on.
     That is the point: two paths would drift, and the email one is the one
     nobody would notice had drifted. */
  function parseEmail(msg) {
    msg = msg || {};
    var text = String(msg.text || '').trim();
    if (!text && msg.html) text = htmlToText(msg.html);
    var subject = String(msg.subject || '');

    var got = fields(text);
    var f = got.fields, body = got.body;

    var val = function (keys) {
      for (var i = 0; i < keys.length; i++) if (f[keys[i]]) return f[keys[i]];
      return '';
    };

    var name = val(['name', 'fullname', 'customername', 'customer', 'contactname',
      'clientname', 'client', 'homeowner', 'homeownername', 'leadname']);
    if (!name) {
      var fst = val(['firstname', 'first']), lst = val(['lastname', 'last']);
      name = [fst, lst].filter(Boolean).join(' ');
    }
    if (!name) name = nameFromSubject(subject);

    var email = val(['email', 'emailaddress', 'customeremail', 'contactemail']);
    if (isVendorEmail(email)) email = '';
    if (!email) email = looseEmail(body);

    var phone = val(['phone', 'phonenumber', 'mobile', 'mobilephone', 'cell', 'cellphone',
      'homephone', 'primaryphone', 'telephone', 'contactphone', 'bestnumber']);
    if (!phone) phone = loosePhone(body);

    var street = val(['address', 'address1', 'streetaddress', 'street', 'serviceaddress',
      'propertyaddress', 'jobaddress', 'location']);
    var city = val(['city', 'town']);
    var state = val(['state', 'province', 'region']);
    var zip = val(['zip', 'zipcode', 'postalcode', 'postcode']);
    var addr = [street, [city, state].filter(Boolean).join(', '), zip]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    var job = val(['comments', 'description', 'details', 'message', 'notes', 'jobdescription',
      'projectdescription', 'additionalinformation', 'customercomments', 'leadcomments',
      'whattheyneed', 'request']);
    var task = val(['task', 'taskname', 'service', 'servicename', 'servicetype', 'servicerequested',
      'category', 'projecttype', 'jobtype', 'trade']);
    if (task && job && job.toLowerCase().indexOf(task.toLowerCase()) < 0) job = task + ' — ' + job;
    else if (task && !job) job = task;
    if (!job) job = subject.replace(/^(re|fwd?|fw)\s*:\s*/i, '').trim();

    return {
      name: name || '',
      phone: phone || '',
      email: (email || '').toLowerCase(),
      address: addr,
      /* both names, because the webhook parser accepts either and this object
         is handed straight to it */
      job: job.slice(0, 600),
      comments: job.slice(0, 600)
    };
  }

  /* ----------------------------------------------- provider envelopes --- */
  /* Every inbound-email service posts the same message under its own field
     names. Postmark sends JSON with TitleCase keys, Mailgun and SendGrid send
     form data with lower-case and hyphenated ones, a Cloudflare Worker sends
     whatever it is told to.

     Reading all of them costs a few lines and keeps the provider choice out
     of the code, which matters because that choice gets made by whoever
     manages the DNS rather than by whoever writes this. Here rather than in
     the function so it can be tested against real payloads: a mapping that
     misses means every message parses as empty, and the only symptom is
     leads that never arrive. */
  function pickStr(o, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = o[keys[i]];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  function normaliseInbound(o) {
    o = (o && typeof o === 'object') ? o : {};
    return {
      /* Postmark OriginalRecipient / Mailgun recipient / SendGrid to.
         OriginalRecipient first: on a forwarded message it is the address the
         mail was actually delivered to, which is the one carrying our slug,
         while To can still say the contractor's own inbox. */
      to: pickStr(o, ['OriginalRecipient', 'recipient', 'envelope_to', 'to', 'To']),
      from: pickStr(o, ['From', 'from', 'sender']),
      subject: pickStr(o, ['Subject', 'subject']),
      text: pickStr(o, ['TextBody', 'text', 'body-plain', 'stripped-text', 'plain']),
      html: pickStr(o, ['HtmlBody', 'html', 'body-html', 'stripped-html'])
    };
  }

  /* ------------------------------------------------- forwarding codes --- */
  /* Setting a Gmail forward up means Google emails a confirmation code TO the
     address being verified — which is this one. So the code arrives here,
     inside a message with no phone and no email, and would otherwise be
     filed as an unusable lead with the code buried in the stored payload
     where nobody can read it. That would strand the contractor at step two
     of their own setup instructions.

     Pulled out and put in the open instead. Not a lead, and not pretending
     to be one: it lands in the list clearly labelled, with the code in
     plain sight. */
  function forwardCode(msg) {
    msg = msg || {};
    var from = String(msg.from || '').toLowerCase();
    var subject = String(msg.subject || '');
    var text = String(msg.text || '');
    if (!text && msg.html) text = htmlToText(msg.html);
    var body = subject + '\n' + text;

    var isGoogle = from.indexOf('forwarding-noreply@google.com') >= 0;
    var looksLikeOne = /confirm(?:ation|ing)?\b[\s\S]{0,80}?\bcode\b|verify (?:your|this) (?:forwarding|email)|forwarding confirmation/i.test(body);
    if (!isGoogle && !looksLikeOne) return null;

    /* Google's is nine digits; other providers use six to ten. Take the one
       nearest the word "code" rather than the first number in the message,
       because these emails also quote the address and the date. */
    var code = '';
    var near = /code[^0-9]{0,40}(\d{6,10})/i.exec(body) || /(\d{6,10})[^0-9]{0,40}\bcode/i.exec(body);
    if (near) code = near[1];
    if (!code && isGoogle) { var any = /\b(\d{9})\b/.exec(body); if (any) code = any[1]; }
    if (!code) return null;

    var link = '';
    var lm = /(https?:\/\/[^\s"'<>]*(?:verify|confirm)[^\s"'<>]*)/i.exec(body);
    if (lm) link = lm[1];

    return { code: code, link: link };
  }

  var api = { parseEmail: parseEmail, htmlToText: htmlToText, fields: fields, forwardCode: forwardCode,
    normaliseInbound: normaliseInbound,
    nameFromSubject: nameFromSubject, isVendorEmail: isVendorEmail };
  root.emailParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
