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
    var t = (tags || []).map(function (x) { return String(x).toLowerCase().trim().replace(/\s+/g, '-'); }), has = function (k) { return t.indexOf(k) > -1; };
    if (has('job-complete')) return 6;
    if (has('paid-in-full')) return 5;
    if (has('final-sent') || has('deposit-sent')) return 4;
    if (has('estimate-accepted') || has('customer') || has('won')) return 3;
    if (has('estimate-sent') || has('estimate')) return 2;
    if (has('contacted') || has('missed-call-no-response') || has('inspection-booked') || has('booked')) return 1;
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
    var tb = document.querySelector('[data-ct-tab="inspect"]'); if (tb && tb.scrollIntoView) tb.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { if (window.bpInspNew) bpInspNew(); }, 60);
  };

  /* ---------- the estimate they ran on the contractor's calculator ----------
     lead_log keeps what the calculator sent (and, from the result screen, the
     option they picked and the three prices). One tap starts a draft estimate
     from it (portal/quote.js bpQuoteFromCalc). */
  var TRADE_JOB = { roofing: 'Roof replacement', hvac: 'HVAC system', countertops: 'Countertops', trim: 'Trim carpentry', painting: 'Painting', pools: 'Pool',
    landscaping: 'Landscaping', plumbing: 'Plumbing', electrical: 'Electrical', general: 'Remodel', concrete: 'Concrete', flooring: 'Flooring' };
  var UUIDRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function pretty(v) { v = String(v || '').replace(/[-_]+/g, ' ').trim(); return v ? v.charAt(0).toUpperCase() + v.slice(1) : ''; }
  function calcData(row) {
    var l = row.lead || {}, trade = String(row.page || '').replace(/\.html$/, '').replace(/^.*\//, '');
    var low = +(l.result_low || l.estimateLow) || 0, high = +(l.result_high || l.estimateHigh) || 0;
    if (!(low > 0 && high >= low) || !TRADE_JOB[trade]) return null;
    var pick = String(l.pick || '') || pretty(l.material || l.system || '');
    var area = +(l.sqft || l.projectAreaSqft || l.conditionedSqft || 0) || 0;
    var base = TRADE_JOB[trade];
    return {
      logId: row.id, trade: trade, low: low, high: high, pick: pick, at: row.created_at, tiers: Array.isArray(l.tiers) ? l.tiers : [],
      addr: String(l.address || ''), area: area,
      title: pick ? base + ' · ' + pick : base, line: pick ? base + ': ' + pick : base,
      desc: base + (pick ? ' with ' + pick : '') + (l.address ? ' at ' + l.address : '') + '. Priced from the online estimate (' + money(low) + ' to ' + money(high) + '); the final price is confirmed after the inspection.'
    };
  }
  function calcCard(c) {
    var box = document.getElementById('ctp-calc');
    if (!box || !(window.BP_LIVE && window.BP_SB)) return;
    var qy = BP_SB.from('lead_log').select('id,page,source,lead,created_at').order('created_at', { ascending: false }).limit(5);
    if (UUIDRE.test(String(c.id))) qy = qy.eq('contact_id', c.id);
    else if (c.email) qy = qy.eq('email', String(c.email).toLowerCase());
    else return;
    Promise.resolve(qy).then(function (r) {
      var d = null; ((r && r.data) || []).some(function (row) { d = calcData(row); return !!d; });
      if (!d || !document.getElementById('ctp-calc')) return;
      window._bpCtpCalc = d;
      var when = d.at ? new Date(d.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      box.innerHTML = '<div class="ctp-ch"><b>Calculator estimate</b><span>' + esc(when) + '</span></div>'
        + '<div class="ctp-calc-p">' + money(d.low) + ' – ' + money(d.high) + '</div>'
        + '<div class="ctp-calc-s">' + esc([TRADE_JOB[d.trade], d.pick, d.area ? Math.round(d.area).toLocaleString() + ' sq ft' : ''].filter(Boolean).join(' · ')) + '</div>'
        + (d.tiers.length === 3 ? '<div class="ctp-calc-t">' + d.tiers.map(function (t) {
          return '<div class="' + (t.mine ? 'mine' : '') + '"><small>' + esc(t.tier) + (t.mine ? ' · their pick' : '') + '</small><b>' + esc(t.name) + '</b><span>' + money(t.low) + ' – ' + money(t.high) + '</span></div>';
        }).join('') + '</div>' : '')
        + '<button type="button" class="bpx-addbtn ctp-calc-go" onclick="bpCtpCalcEstimate(\'' + esc(c.id) + '\')"><span class="ms">request_quote</span> Start an estimate from this</button>'
        + '<div class="ctp-calc-n">Fills in the job, the address and a starting price in the middle of their range. Swap in your real costs after the inspection.</div>';
      box.hidden = false;
    }, function () {});
  }
  window.bpCtpCalcEstimate = function (cid) { var d = window._bpCtpCalc; if (d && window.bpQuoteFromCalc) bpQuoteFromCalc(cid, d); };

  window.bpContactPage = function (id) {
    var c = (window._bpContacts || []).filter(function (x) { return x.id === id; })[0];
    if (!c) { bpNav('contacts'); return; }
    var stage = window.bpStageOf ? bpStageOf(c) : ['New lead', '#64748b'], col = stage[1], step = stepOf(c.tags);
    var digits = function (s) { return String(s || '').replace(/\D/g, ''); };
    var jobs = (typeof bpJobsGet === 'function' ? bpJobsGet() : []).filter(function (j) {
      return (j.contactId && j.contactId === id) || (c.name && j.name === c.name) || (c.phone && j.phone && digits(j.phone) === digits(c.phone));
    });
    var est = jobs.filter(function (j) { return j.status !== 'quote'; }).reduce(function (s, j) { return s + (+j.estimate || 0); }, 0), got = jobs.reduce(function (s, j) { return s + (+j.collected || 0); }, 0);
    var tags = (c.tags || []).filter(function (t) { return !MACHINE.test(t); }).slice(0, 6);
    var added = c.dateAdded ? new Date(c.dateAdded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    var first = String(c.name || '').trim().split(/\s+/)[0] || 'them';

    window.bpCtpMail = function () { if (window.bpNav) bpNav('email'); setTimeout(function () { if (window.bpMailCompose) bpMailCompose({ to: c.email, name: c.name || '' }); }, 250); };
    /* 2026-11-20 (second pass, "too much going on"): two columns. On the left, one card that is
       the person: who, their stage, Call / Text / Email, and their details. On the right, what to do
       next (one suggestion for where they are, with a slim progress line), then their jobs and
       estimates, the calculator estimate and equipment. The colour band, the number strip, the big
       seven-step pipeline and the repeated stage / added rows are gone. */
    var circ = function (href, icon, label, on, click) {
      if (!on) return '<span class="ctp2-q off" aria-disabled="true" title="No ' + label.toLowerCase() + ' on file"><span class="ms">' + icon + '</span><small>' + label + '</small></span>';
      return (click ? '<button type="button" class="ctp2-q" onclick="' + click + '">' : '<a class="ctp2-q" href="' + esc(href) + '">')
        + '<span class="ms">' + icon + '</span><small>' + label + '</small>' + (click ? '</button>' : '</a>');
    };
    var line = function (icon, html) { return '<div class="ctp2-l"><span class="ms">' + icon + '</span><div>' + html + '</div></div>'; };
    var addr = c.address1 || c.address || '';
    /* tags that only say the stage again ("new lead", "missed call") stay out of the chips */
    var stl = String(stage[0] || '').toLowerCase();
    tags = tags.filter(function (t) { var n = String(t).toLowerCase().replace(/[-_]+/g, ' ').trim(); return n && stl.indexOf(n) < 0 && !/^new lead$/.test(n); });
    var side = '<aside class="ctp2-side"><section class="ctp-card ctp2-me">'
      + '<div class="ctp2-top">' + (window.bpAvatar ? bpAvatar(c.name || '?', 56) : '')
      + '<button type="button" class="ctp-link ctp2-edit" onclick="bpOpenEdit(\'' + c.id + '\')"><span class="ms">edit</span>Edit</button></div>'
      + '<h2>' + esc(c.name || 'Unnamed contact') + '</h2>'
      + '<div class="ctp-meta"><span class="ctp-stage"><i></i>' + esc(stage[0]) + '</span>' + (added ? '<span class="ctp-since" title="' + esc(added) + '">' + esc(since(c.dateAdded)) + '</span>' : '') + '</div>'
      + '<div class="ctp2-qs">' + circ('tel:' + c.phone, 'call', 'Call', !!c.phone) + circ('sms:' + c.phone, 'sms', 'Text', !!c.phone) + circ('', 'mail', 'Email', !!c.email, 'bpCtpMail()') + '</div>'
      + '<div class="ctp2-ls">'
      + line('call', c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '<span class="ctp-none">No phone yet</span>')
      + line('mail', c.email ? '<a href="#" onclick="bpCtpMail();return false">' + esc(c.email) + '</a>' : '<span class="ctp-none">No email yet</span>')
      + (addr ? line('location_on', '<a href="https://maps.google.com/?q=' + encodeURIComponent(addr) + '" target="_blank" rel="noopener">' + esc(addr) + '</a>') : '')
      + '</div>'
      + (tags.length ? '<div class="ctp-tags">' + tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' : '')
      + '<div class="ctp-foot"><button type="button" class="ctp-del" onclick="bpOpenDelete(\'' + c.id + '\')"><span class="ms">delete</span>Delete contact</button></div>'
      + '</section></aside>';

    /* the one thing to do next, for where they are */
    var NEXT = [
      ['Book an inspection', 'Get out there, measure and take photos. Then send the estimate.', [['event', 'Book a visit', "window._bpApptCal='inspection';window.bpOpenBook&&bpOpenBook()", 1], ['request_quote', 'Write the estimate', "bpQuoteNew('" + c.id + "')"]]],
      ['Send the estimate', 'You’ve been in touch. Price the job and send it while it’s fresh.', [['request_quote', 'Write the estimate', "bpQuoteNew('" + c.id + "')", 1], ['fact_check', 'Inspection report', 'bpCtpInspect()']]],
      ['Waiting on a yes', 'The estimate is with ' + first + '. A quick text often gets the answer.', [['sms', 'Text ' + first, c.phone ? "location.href='sms:" + esc(c.phone) + "'" : '', 1]]],
      ['Collect the deposit', first + ' said yes. Send the deposit invoice to get the job on the calendar.', [['receipt_long', 'Send an invoice', 'window.bpInvOpen&&bpInvOpen()', 1]]],
      ['Waiting on payment', 'An invoice is out. A friendly reminder helps if it’s been a few days.', [['sms', 'Text ' + first, c.phone ? "location.href='sms:" + esc(c.phone) + "'" : '', 1]]],
      ['Finish the job', 'Paid in full. Close out the project when the work is done.', [['construction', 'See jobs', "bpNav('activejobs')", 1]]],
      ['All done', 'Job completed. Ask for a review, or quote the next one.', [['request_quote', 'New estimate', "bpQuoteNew('" + c.id + "')", 1]]]
    ][step] || [stage[0], '', []];
    var next = '<section class="ctp-card ctp2-next"><div class="ctp2-nh"><small>Next step</small><span>Step ' + (step + 1) + ' of ' + STEPS.length + ' · ' + esc(stage[0]) + '</span></div>'
      + '<div class="ctp2-bar">' + STEPS.map(function (x, k) { return '<i class="' + (k < step ? 'done' : k === step ? 'now' : '') + '" title="' + esc(x[0]) + '"></i>'; }).join('') + '</div>'
      + '<b class="ctp2-nt">' + esc(NEXT[0]) + '</b><p>' + esc(NEXT[1]) + '</p>'
      + '<div class="ctp2-nb">' + NEXT[2].filter(function (a) { return a[2]; }).map(function (a) { return '<button type="button" class="ctp-act' + (a[3] ? ' pri' : '') + '" onclick="' + a[2] + '"><span class="ms">' + a[0] + '</span><span>' + esc(a[1]) + '</span></button>'; }).join('')
      + '</div></section>';

    var jobsCard = '<section class="ctp-card"><div class="ctp-ch"><b>Jobs</b>' + (jobs.length ? '<span>' + jobs.length + '</span>' : '') + '</div>'
      + (jobs.length ? jobs.map(function (j) {
        if (j.status === 'quote') { var qt = window.BPQ && BPQ.calc ? BPQ.calc(j.id) : null;
          return '<button type="button" class="ctp-job" onclick="bpQuoteOpen(\'' + j.id + '\')"><span class="ctp-ji"><span class="ms">request_quote</span></span><span class="ctp-jt"><b>' + esc(j.title === 'New estimate' ? 'Estimate' : j.title) + '</b><small>' + money(qt ? qt.total : j.estimate) + ' · estimate ' + ((j.quote || {}).estId ? 'sent' : 'draft') + '</small></span><span class="ctp-js">Estimate</span><span class="ms ctp-go">chevron_right</span></button>'; }
        var done = j.status === 'done', pct = j.estimate ? Math.min(100, Math.round((+j.collected || 0) / j.estimate * 100)) : 0;
        return '<button type="button" class="ctp-job" onclick="bpNav(\'activejobs\');setTimeout(function(){bpProjOpen(\'' + j.id + '\')},60)">'
          + '<span class="ctp-ji"><span class="ms">' + (done ? 'task_alt' : 'construction') + '</span></span>'
          + '<span class="ctp-jt"><b>' + esc(j.title || 'Job') + '</b><small>' + money(j.estimate) + (j.estimate ? ' · ' + pct + '% collected' : '') + '</small>'
          + (j.estimate ? '<i class="ctp-bar"><i style="width:' + pct + '%"></i></i>' : '') + '</span>'
          + '<span class="ctp-js ' + (done ? 'ok' : '') + '">' + (done ? 'Done' : 'In progress') + '</span><span class="ms ctp-go">chevron_right</span></button>';
      }).join('')
        : '<div class="ctp-empty"><span class="ms">construction</span><b>No jobs yet</b><small>When ' + esc(first) + ' signs, the project shows up here, with any inspection reports you wrote.</small></div>')
      + '</section>';
    var jobsHead = jobs.length ? jobs.length + (jobs.length === 1 ? ' job' : ' jobs') + (got ? ' · ' + money(got) + ' collected' : est ? ' · ' + money(est) + ' total' : '') : '';
    var jobsCard2 = jobsCard.replace('<div class="ctp-ch"><b>Jobs</b>' + (jobs.length ? '<span>' + jobs.length + '</span>' : '') + '</div>',
      '<div class="ctp-ch"><b>Jobs and estimates</b>' + (jobsHead ? '<span>' + esc(jobsHead) + '</span>' : '') + '</div>');

    document.getElementById('bpxViewArea').innerHTML = '<div class="ctp ctp2" style="--st:' + col + '">'
      + '<button type="button" class="ctp-back" onclick="bpNav(\'contacts\')"><span class="ms">arrow_back</span>All contacts</button>'
      + '<div class="ctp2-wrap">' + side
      + '<div class="ctp2-main"><div class="bpx-set-grid ctp-grid ctp2-grid">' + next + '<section class="ctp-card ctp-calc" id="ctp-calc" hidden></section>' + jobsCard2
      + (window.BPA && !(window.bpLocked && bpLocked('assets')) ? '<section class="ctp-card"><div class="ctp-ch"><b>Equipment</b></div><div id="ctp-equip"></div></section>' : '') + '</div></div></div></div>';
    /* the units at their place: age, service and when they'll need replacing (portal/assets.js) */
    if (window.BPA && document.getElementById('ctp-equip')) BPA.mount(document.getElementById('ctp-equip'), { contactId: c.id, name: c.name || '', addr: c.address1 || c.address || '' });

    calcCard(c);

    /* the report count, once inspect.js can answer */
    setTimeout(function () {
      var n = document.querySelector('[data-ct-tab="inspect"] .pjs-n'), out = document.getElementById('ctp-insp-n');
      if (out) out.textContent = n && n.textContent ? n.textContent : '0';
    }, 900);
  };
})();
