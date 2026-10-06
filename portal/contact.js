/* ==================================================================
   Contact profile (Leads → Contacts → a contact).

   Replaces the plain card + two panels with:
     a hero      stage-tinted banner, avatar, name, stage, tags, how long
                 they have been a lead, and Call / Text / Email / New
                 inspection (a missing phone or email greys the action
                 out rather than hiding it)
     a stat row  jobs, estimate total, collected, inspection reports
     a pipeline  where this customer is, from new lead to job completed
     two cards   contact details (copy buttons) and their jobs
   portal/inspect.js then adds the Overview | Inspections tabs above the
   .bpx-set-grid, as before. Loaded before inspect.js so it wraps this one.
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var money = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : '$' + Math.round(+n || 0); };
  var STEPS = [['New lead', 'person_add'], ['Contacted', 'chat'], ['Estimate sent', 'request_quote'], ['Accepted', 'handshake'], ['Invoiced', 'receipt_long'], ['Paid', 'paid'], ['Completed', 'task_alt']];
  function stepOf(tags) {
    var t = (tags || []).map(function (x) { return String(x).toLowerCase(); }), has = function (k) { return t.indexOf(k) > -1; };
    if (has('job-complete')) return 6;
    if (has('paid-in-full')) return 5;
    if (has('final-sent') || has('deposit-sent')) return 4;
    if (has('estimate-accepted') || has('customer')) return 3;
    if (has('estimate-sent') || has('estimate')) return 2;
    if (has('contacted') || has('missed-call-no-response')) return 1;
    return 0;
  }
  /* the workflow's machinery tags stay out of the chips */
  var MACHINE = /^(new_lead|contacted|estimate|estimate-sent|estimate-accepted|deposit-sent|final-sent|paid-in-full|job-complete|customer|missed-call-no-response|bp-|ghl-)/i;
  function since(d) {
    if (!d) return ''; var days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
    if (isNaN(days) || days < 0) return '';
    return days === 0 ? 'Added today' : days === 1 ? 'Added yesterday' : days < 60 ? 'Added ' + days + ' days ago' : 'Added ' + Math.round(days / 30) + ' months ago';
  }
  function act(href, icon, label, on, primary, click) {
    var cls = 'ctp-act' + (primary ? ' pri' : '') + (on ? '' : ' off');
    if (!on) return '<span class="' + cls + '" aria-disabled="true" title="No ' + label.toLowerCase() + ' on file"><span class="ms">' + icon + '</span><span>' + label + '</span></span>';
    return click ? '<button type="button" class="' + cls + '" onclick="' + click + '"><span class="ms">' + icon + '</span><span>' + label + '</span></button>'
      : '<a class="' + cls + '" href="' + esc(href) + '"><span class="ms">' + icon + '</span><span>' + label + '</span></a>';
  }
  function row(icon, label, val, copy) {
    return '<div class="ctp-row"><span class="ctp-ri"><span class="ms">' + icon + '</span></span><div class="ctp-rv"><small>' + label + '</small>' + val + '</div>'
      + (copy ? '<button type="button" class="ctp-copy" title="Copy" aria-label="Copy ' + label.toLowerCase() + '" onclick="bpCtpCopy(this,\'' + esc(copy).replace(/'/g, '&#39;') + '\')"><span class="ms">content_copy</span></button>' : '') + '</div>';
  }
  window.bpCtpCopy = function (b, v) {
    var done = function () { var i = b.querySelector('.ms'); i.textContent = 'check'; setTimeout(function () { i.textContent = 'content_copy'; }, 1200); };
    try { navigator.clipboard.writeText(v).then(done, done); } catch (e) { done(); }
  };
  window.bpCtpInspect = function () {
    if (window.bpCtTab) bpCtTab('inspect');
    setTimeout(function () { if (window.bpInspNew) bpInspNew(); }, 60);
  };

  window.bpContactPage = function (id) {
    var c = (window._bpContacts || []).filter(function (x) { return x.id === id; })[0];
    if (!c) { bpNav('contacts'); return; }
    var stage = window.bpStageOf ? bpStageOf(c) : ['New lead', '#64748b'], col = stage[1], step = stepOf(c.tags);
    var digits = function (s) { return String(s || '').replace(/\D/g, ''); };
    var jobs = (typeof bpJobsGet === 'function' ? bpJobsGet() : []).filter(function (j) {
      return (j.contactId && j.contactId === id) || (c.name && j.name === c.name) || (c.phone && j.phone && digits(j.phone) === digits(c.phone));
    });
    var est = jobs.reduce(function (s, j) { return s + (+j.estimate || 0); }, 0), got = jobs.reduce(function (s, j) { return s + (+j.collected || 0); }, 0);
    var tags = (c.tags || []).filter(function (t) { return !MACHINE.test(t); }).slice(0, 6);
    var added = c.dateAdded ? new Date(c.dateAdded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    var first = String(c.name || '').trim().split(/\s+/)[0] || 'them';

    var hero = '<section class="ctp-hero">'
      + '<div class="ctp-band"></div>'
      + '<div class="ctp-hbody">'
      + '<div class="ctp-av">' + (window.bpAvatar ? bpAvatar(c.name || '?', 76) : '') + '</div>'
      + '<div class="ctp-who"><h2>' + esc(c.name || 'Unnamed contact') + '</h2>'
      + '<div class="ctp-meta"><span class="ctp-stage"><i></i>' + esc(stage[0]) + '</span>' + (added ? '<span class="ctp-since" title="' + esc(added) + '">' + esc(since(c.dateAdded)) + '</span>' : '') + '</div>'
      + (tags.length ? '<div class="ctp-tags">' + tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' : '')
      + '</div>'
      + '<div class="ctp-acts">'
      + act('tel:' + c.phone, 'call', 'Call', !!c.phone)
      + act('sms:' + c.phone, 'sms', 'Text', !!c.phone)
      + act('mailto:' + c.email, 'mail', 'Email', !!c.email)
      + act('', 'fact_check', 'New inspection', true, true, 'bpCtpInspect()')
      + '</div></div></section>';

    var stats = '<div class="ctp-stats">'
      + '<div><small>Jobs</small><b>' + jobs.length + '</b></div>'
      + '<div><small>Estimated</small><b>' + (est ? money(est) : '—') + '</b></div>'
      + '<div><small>Collected</small><b>' + (got ? money(got) : '—') + '</b></div>'
      + '<div><small>Inspection reports</small><b id="ctp-insp-n">—</b></div></div>';

    var pipe = '<section class="ctp-card ctp-pipe"><div class="ctp-ch"><b>Where ' + esc(first) + ' is</b><span>' + esc(stage[0]) + '</span></div><ol>'
      + STEPS.map(function (s, i) { return '<li class="' + (i < step ? 'done' : i === step ? 'now' : '') + '"><span class="ctp-dot"><span class="ms">' + (i < step ? 'check' : s[1]) + '</span></span><small>' + s[0] + '</small></li>'; }).join('')
      + '</ol></section>';

    var info = '<section class="ctp-card"><div class="ctp-ch"><b>Contact details</b><button type="button" class="ctp-link" onclick="bpOpenEdit(\'' + c.id + '\')"><span class="ms">edit</span>Edit</button></div>'
      + row('call', 'Phone', c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '<span class="ctp-none">Not on file</span>', c.phone)
      + row('mail', 'Email', c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '<span class="ctp-none">Not on file</span>', c.email)
      + row('flag', 'Stage', '<span>' + esc(stage[0]) + '</span>')
      + row('event', 'Added', '<span>' + (added || '—') + '</span>')
      + '<div class="ctp-foot"><button type="button" class="ctp-del" onclick="bpOpenDelete(\'' + c.id + '\')"><span class="ms">delete</span>Delete contact</button></div></section>';

    var jobsCard = '<section class="ctp-card"><div class="ctp-ch"><b>Jobs</b>' + (jobs.length ? '<span>' + jobs.length + '</span>' : '') + '</div>'
      + (jobs.length ? jobs.map(function (j) {
        var done = j.status === 'done', pct = j.estimate ? Math.min(100, Math.round((+j.collected || 0) / j.estimate * 100)) : 0;
        return '<button type="button" class="ctp-job" onclick="bpNav(\'activejobs\');setTimeout(function(){bpProjOpen(\'' + j.id + '\')},60)">'
          + '<span class="ctp-ji"><span class="ms">' + (done ? 'task_alt' : 'construction') + '</span></span>'
          + '<span class="ctp-jt"><b>' + esc(j.title || 'Job') + '</b><small>' + money(j.estimate) + (j.estimate ? ' · ' + pct + '% collected' : '') + '</small>'
          + (j.estimate ? '<i class="ctp-bar"><i style="width:' + pct + '%"></i></i>' : '') + '</span>'
          + '<span class="ctp-js ' + (done ? 'ok' : '') + '">' + (done ? 'Done' : 'In progress') + '</span><span class="ms ctp-go">chevron_right</span></button>';
      }).join('')
        : '<div class="ctp-empty"><span class="ms">construction</span><b>No jobs yet</b><small>When ' + esc(first) + ' signs, the project shows up here, with any inspection reports you wrote.</small></div>')
      + '</section>';

    document.getElementById('bpxViewArea').innerHTML = '<div class="ctp" style="--st:' + col + '">'
      + '<button type="button" class="ctp-back" onclick="bpNav(\'contacts\')"><span class="ms">arrow_back</span>All contacts</button>'
      + hero + stats
      + '<div class="bpx-set-grid ctp-grid">' + pipe + info + jobsCard + '</div></div>';

    /* the report count, once inspect.js can answer */
    setTimeout(function () {
      var n = document.querySelector('[data-ct-tab="inspect"] .pjs-n'), out = document.getElementById('ctp-insp-n');
      if (out) out.textContent = n && n.textContent ? n.textContent : '0';
    }, 900);
  };
})();
