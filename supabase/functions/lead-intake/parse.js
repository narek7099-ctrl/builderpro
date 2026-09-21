/* ==================================================================
   Reading a lead out of whatever the vendor sent.

   Kept separate from the function, and plain JavaScript rather than
   TypeScript, so tools/lead-parse.test.js can run it under node against
   real payload shapes. This is the part most likely to be wrong and
   least likely to announce it: a field name that does not match just
   produces a lead with no phone number, which looks like a vendor
   problem rather than ours.

   The rule throughout is to take the union of what vendors send rather
   than branch per vendor. A ping-post seller in one city is a
   spreadsheet and a cron job, and its field names are whatever the
   person who built it typed that afternoon — a per-vendor parser would
   be wrong for everyone it was not written for, and there is no list of
   who that is.
   ================================================================== */
(function (root) {
  'use strict';

  function str(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    return '';
  }

  /* Vendors disagree about snake_case, camelCase, spaces and capitals for
     the same field, so keys are compared with all of that stripped out. */
  function norm(k) { return String(k).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function pick(o, keys) {
    var map = {};
    Object.keys(o).forEach(function (k) { var n = norm(k); if (!(n in map)) map[n] = o[k]; });
    for (var i = 0; i < keys.length; i++) {
      var v = str(map[keys[i]]);
      if (v) return v;
    }
    return '';
  }

  /* Only for comparison. 15125550134 and (512) 555-0134 are one person. */
  function phoneKey(s) {
    return String(s || '').replace(/\D+/g, '').replace(/^1(\d{10})$/, '$1');
  }

  var NAME = ['name', 'fullname', 'customername', 'contactname', 'homeownername', 'clientname'];
  var FIRST = ['firstname', 'fname', 'givenname'];
  var LAST = ['lastname', 'lname', 'surname', 'familyname'];
  var PHONE = ['phone', 'phonenumber', 'mobile', 'mobilephone', 'cellphone', 'cell',
    'primaryphone', 'homephone', 'telephone', 'tel', 'contactphone'];
  var EMAIL = ['email', 'emailaddress', 'primaryemail', 'contactemail'];
  var STREET = ['address', 'address1', 'streetaddress', 'street', 'serviceaddress',
    'propertyaddress', 'addressline1'];
  var CITY = ['city', 'town'];
  var STATE = ['state', 'region', 'province'];
  var ZIP = ['zip', 'zipcode', 'postalcode', 'postcode'];
  var JOB = ['job', 'jobdescription', 'description', 'comments', 'notes', 'message',
    'projectdescription', 'details', 'servicerequested', 'leadcomments'];
  /* the routing category, as distinct from what the homeowner typed */
  var TASK = ['task', 'taskname', 'projecttype', 'servicename', 'servicetype',
    'category', 'tradetype', 'jobtype'];

  /* Several vendors wrap the lead one level down, and a couple wrap it twice.
     Unwrap before reading, but only through keys that mean "the lead is in
     here" — walking every object would find the vendor's own account record
     and read a name off it. */
  var WRAP = ['lead', 'data', 'contact', 'customer', 'result', 'payload'];
  function unwrap(body) {
    var o = body, hops = 0;
    while (o && typeof o === 'object' && hops < 3) {
      var next = null;
      for (var i = 0; i < WRAP.length; i++) {
        var v = o[WRAP[i]];
        if (v && typeof v === 'object' && !Array.isArray(v)) { next = v; break; }
        /* some send a single-element array */
        if (Array.isArray(v) && v.length && typeof v[0] === 'object') { next = v[0]; break; }
      }
      if (!next) break;
      o = next; hops++;
    }
    return (o && typeof o === 'object') ? o : body;
  }

  function parseLead(body) {
    var o = unwrap(body || {});

    var whole = pick(o, NAME);
    var name = whole || [pick(o, FIRST), pick(o, LAST)].filter(Boolean).join(' ');

    var street = pick(o, STREET);
    var city = pick(o, CITY), state = pick(o, STATE), zip = pick(o, ZIP);
    var addr = [street, [city, state].filter(Boolean).join(', '), zip]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    var job = pick(o, JOB), task = pick(o, TASK);
    /* keep both: the category is what routes it, the free text is what the
       homeowner actually said, and they are rarely the same sentence */
    if (task && job && job.toLowerCase().indexOf(task.toLowerCase()) < 0) job = task + ' — ' + job;
    else if (task && !job) job = task;

    var phone = pick(o, PHONE);
    return {
      name: name || 'Lead',
      phone: phone,
      phoneKey: phoneKey(phone),
      email: pick(o, EMAIL).toLowerCase(),
      address: addr,
      job: job.slice(0, 600)
    };
  }

  var api = { parseLead: parseLead, phoneKey: phoneKey };
  root.leadParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
