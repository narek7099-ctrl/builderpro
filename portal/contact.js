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
    /* 2026-11-20 (third pass): one column, in the order a contractor uses it. Who it is, three big
       buttons to reach them, the one thing to do next, their details, their jobs. Inspection reports,
       equipment and delete fold away at the bottom. */
    var addr = c.address1 || c.address || '';
    var big = function (href, icon, label, on, click) {
      if (!on) return '<span class="ctp3-b off" aria-disabled="true" title="No ' + label.toLowerCase() + ' on file"><span class="ms">' + icon + '</span>' + label + '</span>';
      return (click ? '<button type="button" class="ctp3-b" onclick="' + click + '">' : '<a class="ctp3-b" href="' + esc(href) + '">') + '<span class="ms">' + icon + '</span>' + label + (click ? '</button>' : '</a>');
    };
    var head = '<section class="ctp3-head">'
      + (window.bpAvatar ? bpAvatar(c.name || '?', 52) : '')
      + '<div class="ctp3-who"><h2>' + esc(c.name || 'Unnamed contact') + '</h2>'
      + '<div class="ctp3-meta"><span class="ctp-stage"><i></i>' + esc(stage[0]) + '</span>' + (added ? '<span>' + esc(since(c.dateAdded)) + '</span>' : '') + '</div></div>'
      + '<button type="button" class="ctp3-edit" aria-label="Edit contact" onclick="bpOpenEdit(\'' + c.id + '\')"><span class="ms">edit</span><span class="ctp3-et">Edit</span></button>'
      + '</section>'
      + '<div class="ctp3-bs">' + big('tel:' + c.phone, 'call', 'Call', !!c.phone) + big('sms:' + c.phone, 'sms', 'Text', !!c.phone) + big('', 'mail', 'Email', !!c.email, 'bpCtpMail()') + '</div>';

    /* the one thing to do next, for where they are */
    var NEXT = [
      ['Book an inspection', [['event', 'Book a visit', "window._bpApptCal='inspection';window.bpOpenBook&&bpOpenBook()", 1], ['request_quote', 'Write the estimate', "bpQuoteNew('" + c.id + "')"]]],
      ['Send the estimate', [['request_quote', 'Write the estimate', "bpQuoteNew('" + c.id + "')", 1], ['fact_check', 'Inspection report', 'bpCtpInspect()']]],
      ['Waiting on a yes. A quick text often gets the answer.', [['sms', 'Text ' + first, c.phone ? "location.href='sms:" + esc(c.phone) + "'" : '', 1]]],
      ['They said yes. Send the deposit invoice.', [['receipt_long', 'Send an invoice', 'window.bpInvOpen&&bpInvOpen()', 1]]],
      ['Waiting on payment. Send a friendly reminder.', [['sms', 'Text ' + first, c.phone ? "location.href='sms:" + esc(c.phone) + "'" : '', 1]]],
      ['Paid in full. Close out the job when the work is done.', [['construction', 'See jobs', "bpNav('activejobs')", 1]]],
      ['Job done. Quote the next one.', [['request_quote', 'New estimate', "bpQuoteNew('" + c.id + "')", 1]]]
    ][step] || [stage[0], []];
    var next = '<section class="ctp-card ctp3-next"><div><small>Next step</small><b>' + esc(NEXT[0]) + '</b></div>'
      + '<div class="ctp3-nb">' + NEXT[1].filter(function (a) { return a[2]; }).map(function (a) { return '<button type="button" class="ctp3-a' + (a[3] ? ' pri' : '') + '" onclick="' + a[2] + '"><span class="ms">' + a[0] + '</span>' + esc(a[1]) + '</button>'; }).join('')
      + '</div></section>';

    var drow = function (k, v) { return '<div class="ctp3-r"><small>' + k + '</small><div>' + v + '</div></div>'; };
    var copyB = function (v, what) { return v ? '<button type="button" class="ctp-copy" title="Copy" aria-label="Copy ' + what + '" onclick="bpCtpCopy(this,\'' + esc(v).replace(/'/g, '&#39;') + '\')"><span class="ms">content_copy</span></button>' : ''; };
    var addB = '<button type="button" class="ctp3-add" onclick="bpOpenEdit(\'' + c.id + '\')">Add</button>';
    var details = '<section class="ctp-card ctp3-det"><div class="ctp-ch"><b>Details</b></div>'
      + drow('Phone', c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' + copyB(c.phone, 'phone') : addB)
      + drow('Email', c.email ? '<a href="#" onclick="bpCtpMail();return false">' + esc(c.email) + '</a>' + copyB(c.email, 'email') : addB)
      + drow('Address', addr ? '<a href="https://maps.google.com/?q=' + encodeURIComponent(addr) + '" target="_blank" rel="noopener">' + esc(addr) + '</a><a class="ctp3-dir" href="https://maps.google.com/?q=' + encodeURIComponent(addr) + '" target="_blank" rel="noopener">Directions</a>' : addB)
      + '</section>';

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
    var jobsHead = jobs.length ? jobs.length + (jobs.length === 1 ? ' job' : ' jobs') + (got ? ' · ' + money(got) + ' collected' : '') : '';
    var jobsCard2 = jobsCard.replace('<div class="ctp-ch"><b>Jobs</b>' + (jobs.length ? '<span>' + jobs.length + '</span>' : '') + '</div>',
      '<div class="ctp-ch"><b>Jobs and estimates</b>' + (jobsHead ? '<span>' + esc(jobsHead) + '</span>' : '') + '</div>')
      .replace(/<div class="ctp-empty">[\s\S]*?<\/div>(?=<\/section>$)/, '<div class="ctp3-none">Nothing yet. ' + (step < 2 ? 'Write the estimate when you’re ready.' : 'Their job shows here once it starts.') + '</div>');

    var equip = window.BPA && !(window.bpLocked && bpLocked('assets'));
    var more = '<div class="ctp3-more">'
      + (equip ? '<details class="ctp-card ctp3-fold"><summary><span class="ms">hvac</span>Equipment at their place<span class="ms ctp3-chev">expand_more</span></summary><div id="ctp-equip"></div></details>' : '')
      + '<button type="button" class="ctp-del" onclick="bpOpenDelete(\'' + c.id + '\')"><span class="ms">delete</span>Delete contact</button></div>';

    document.getElementById('bpxViewArea').innerHTML = '<div class="ctp ctp3" style="--st:' + col + '">'
      + '<button type="button" class="ctp-back" onclick="bpNav(\'contacts\')"><span class="ms">arrow_back</span>All contacts</button>'
      + head
      + '<div class="bpx-set-grid ctp-grid ctp3-grid">' + next + '<section class="ctp-card ctp-calc" id="ctp-calc" hidden></section>' + details + jobsCard2 + '</div>'
      + more + '</div>';
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
