/* ==================================================================
   Dashboard: what needs doing, and the numbers that are real.

   The old one opened on "342 new leads, up 18%" for an account that had
   been open ten minutes. Every figure here is either computed from the
   contractor's own data, fetched live, or absent. Nothing is invented.

   Top: a setup checklist with a completion bar, each item verified from
   the actual state (a logo is done when there is a logo), each linking to
   the page that finishes it. It folds away at 100%.
   Then: four numbers that change a decision today, two charts that read
   from the ledger, and the projects in motion.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.bpEsc;
  var money = function (n) { n = Math.round(+n || 0); return (n < 0 ? '\u2212' : '') + '$' + Math.abs(n).toLocaleString(); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var D = window.BPDASH = { brain: undefined, calc: undefined, appts: undefined, events: undefined, supply: undefined, leads: undefined, contracts: undefined, unread: undefined, deals: undefined, setupOpen: false };

  /* ---------- setup: verified, not self-reported ---------- */
  function isSample(s) { return !!(s && s.connection && s.connection.sample); }
  function steps() {
    var s = (window.bpSettingsGet && bpSettingsGet()) || {}, c = s.company || {};
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var sup = (window.SP && SP.sup) || [], items = (window.SP && SP.items) || [];
    var priced = sup.some(function (x) { return !isSample(x) && items.some(function (i) { return i.supplier_id === x.id; }); });
    return [
      { k: 'biz', t: 'Your business details', s: 'Name, trade, phone and address. Everything else is built from these.', done: !!(c.name && c.phone && c.address), go: 'settings' },
      { k: 'logo', t: 'Your logo', s: 'On your estimates, contracts and booking page.', done: !!c.logo, go: 'settings' },
      { k: 'ai', t: 'Publish what ' + (window.BP_AI_NAME || 'Lisa') + ' knows', s: 'Your services, prices and rules, so the receptionist answers like you would.', done: D.brain === undefined ? null : !!(D.brain && D.brain.published_at), go: 'ai' },
      { k: 'calc', t: 'Set your calculator prices', s: 'The estimator on your website quotes from these.', done: D.calc === undefined ? null : !!D.calc, go: 'calculator' },
      { k: 'job', t: 'Add your first project', s: 'Photos, schedule and costs live on the project.', done: jobs.length > 0, go: 'activejobs' },
      { k: 'sup', t: 'Photograph a bill from your supply house', s: 'Then we can tell you where each job is cheapest to buy.', done: (window.SP && SP.loaded) ? priced : null, go: 'supply' },
    ];
  }
  function checklist() {
    var list = steps(), known = list.filter(function (x) { return x.done !== null; });
    var done = known.filter(function (x) { return x.done; }).length, pct = Math.round(done / list.length * 100);
    var hidden = false; try { hidden = localStorage.getItem('bpSetupHidden') === '1'; } catch (e) {}
    if (pct === 100 && hidden) return '';
    if (pct === 100) return '<div class="dash-mini done"><span class="ms">verified</span><span>Set up. Everything is in place.</span><button class="bpx-linkbtn" onclick="BPDASH.hide()">Hide</button></div>';
    var next = list.filter(function (x) { return x.done === false; })[0];
    /* one line: how far along, what is next, and a way to see the rest */
    var mini = '<div class="dash-mini"><span class="dash-mini-bar"><i style="width:' + pct + '%"></i></span>'
      + '<span class="dash-mini-t"><b>Set up ' + pct + '%</b>' + (next ? ' &middot; next: ' + esc(next.t) : '') + '</span>'
      + (next ? '<button class="bpx-rowbtn primary" onclick="bpNav(\'' + next.go + '\')">Do it</button>' : '')
      + '<button class="bpx-linkbtn" onclick="BPDASH.setupOpen=!BPDASH.setupOpen;bpDashboard()">' + (D.setupOpen ? 'Fewer' : 'All ' + list.length + ' steps') + '</button></div>';
    if (!D.setupOpen) return mini;
    return mini + '<div class="bpx-panel dash-setup"><div class="dash-steps">' + list.map(function (x) {
        var st = x.done === null ? 'wait' : x.done ? 'ok' : 'todo';
        return '<div class="dash-step ' + st + '" onclick="bpNav(\'' + x.go + '\')">'
          + '<span class="dash-tick"><span class="ms">' + (st === 'ok' ? 'check' : st === 'wait' ? 'more_horiz' : '') + '</span></span>'
          + '<div><b>' + esc(x.t) + '</b><small>' + esc(x.s) + '</small></div>'
          + (st === 'todo' ? '<span class="dash-go">Do it <span class="ms">arrow_forward</span></span>' : '')
          + '</div>';
      }).join('') + '</div></div>';
  }
  window.BP_DASH = D;
  D.hide = function () { try { localStorage.setItem('bpSetupHidden', '1'); } catch (e) {} window.bpDashboard(); };

  /* ---------- hero: one band, so the page opens with a statement ---------- */
  function hero(crew) {
    var co = ((window.bpSettingsGet && bpSettingsGet().company) || {});
    var h = new Date().getHours();
    var greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var act = jobs.filter(function (j) { return j.status === 'active'; });
    var iso = new Date().toISOString().slice(0, 10);
    var onSite = act.filter(function (j) { return j.sched && (j.sched.dates || []).indexOf(iso) >= 0; }).length;
    var appts = (D.events || []).filter(function (e) { return String(e.start || '').slice(0, 10) === iso; }).length;
    var bits = [];
    if (onSite) bits.push(onSite === 1 ? 'one crew out' : onSite + ' crews out');
    if (appts) bits.push(appts === 1 ? 'one appointment' : appts + ' appointments');
    var line = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + (bits.length ? ' · ' + bits.join(' · ') : '');
    var fin; try { fin = bpFinData(); } catch (e) { fin = { inc: [], exp: [] }; }
    var mk = monthKey(Date.now());
    var inM = fin.inc.filter(function (x) { return x.when && monthKey(x.when) === mk; }).reduce(function (t, x) { return t + x.amt; }, 0);
    var outM = fin.exp.filter(function (x) { return x.when && monthKey(x.when) === mk; }).reduce(function (t, x) { return t + x.amt; }, 0);
    var owed = act.reduce(function (t, j) { return t + Math.max((+j.estimate || 0) - (+j.collected || 0), 0); }, 0);
    var inMotion = act.reduce(function (t, j) { return t + (+j.estimate || 0); }, 0);
    var pos = (window.SP && SP.pos) || [];
    var waiting = pos.filter(function (p) { return (p.status === 'sent' && !p.sent_to_supplier) || p.status === 'invoiced'; }).length;
    var k = function (lbl, val, sub, go, tone) {
      return '<div class="hero-k' + (go ? ' go' : '') + (tone ? ' ' + tone : '') + '"' + (go ? ' onclick="bpNav(\'' + go + '\')"' : '') + '><span class="hero-k-l">' + lbl + '</span><span class="hero-k-v">' + val + '</span><span class="hero-k-s">' + sub + '</span></div>';
    };
    var nums = crew
      ? k('On site today', String(onSite), onSite ? 'tap to open the job' : 'nothing scheduled', 'activejobs')
        + k('Appointments', String(appts), 'today', 'calendar')
        + k('Projects running', String(act.length), 'across the business', 'activejobs')
      : k('In motion', String(act.length), money(inMotion) + ' of work', 'activejobs')
        + k('Owed to you', money(owed), owed ? 'on active projects' : 'all collected', 'finances')
        + k('This month', money(inM - outM), money(inM) + ' in · ' + money(outM) + ' out', 'finances', inM - outM < 0 ? 'neg' : 'pos')
        + k('Materials', String(waiting), waiting ? 'waiting on you' : 'nothing waiting', 'supplyorders', waiting ? 'warn' : '');
    return '<div class="dash-hero">'
      + '<div class="hero-top"><div><div class="hero-greet">' + esc(greet) + (co.name ? ', ' + esc(String(co.name).split(' ')[0]) : '') + '</div><div class="hero-line">' + esc(line) + '</div></div>'
      + '<button class="hero-cta" onclick="bpNav(\'supply\')"><span class="ms">add</span>Order materials</button></div>'
      + '<div class="hero-ks">' + nums + '</div></div>';
  }

  /* ---------- projects: the photos, big, right under the hero ---------- */
  function projects(crew) {
    var jobs = ((window.bpJobsGet && bpJobsGet()) || []).filter(function (j) { return j.status === 'active'; });
    if (!jobs.length) {
      return '<div class="bpx-panel dash-projs-empty"><img src="assets/roofing/roof-underlayment-sm.jpg" alt="" loading="lazy">'
        + '<div><b>No projects running</b><span class="bpx-mut">Win a deal in Close Deals, or add one straight away. Photos, the schedule and the costs all live on the project.</span>'
        + '<button class="bpx-btn ghost sp-inline" onclick="bpNav(\'activejobs\')">Open Active Projects</button></div></div>';
    }
    var iso = new Date().toISOString().slice(0, 10);
    /* The row always fills: as many columns as there are cards, up to four.
       One or two get a wide layout with the photo beside the detail, three
       or four get photo cards. No empty columns either way. */
    var shown = jobs.slice(0, 4), split = shown.length <= 2;
    var cards = shown.map(function (j) {
      var img = (j.photos && j.photos[0]) || (window.bpStockImg ? bpStockImg(j.id) : 'assets/roofing/roof-completed.jpg');
      var est = +j.estimate || 0, paid = +j.collected || 0;
      var pct = est > 0 ? Math.min(100, Math.round(paid / est * 100)) : 0;
      var today = j.sched && (j.sched.dates || []).indexOf(iso) >= 0;
      var nDays = (j.sched && (j.sched.dates || []).length) || 0;
      var meta = [];
      if (today) meta.push('<b class="pj-live"><i></i>Crew on site today</b>');
      else if (nDays) meta.push(nDays + (nDays === 1 ? ' day booked' : ' days booked'));
      if (j.photos && j.photos.length) meta.push(j.photos.length + (j.photos.length === 1 ? ' photo' : ' photos'));
      else meta.push('no photos yet');
      return '<article class="pj-card" onclick="bpNav(\'activejobs\');setTimeout(function(){bpProjOpen(\'' + j.id + '\')},60)">'
        + '<div class="pj-img"><img src="' + esc(img) + '" alt="" loading="lazy">' + (today ? '<span class="pj-flag">Today</span>' : '') + '</div>'
        + '<div class="pj-body"><div class="pj-h"><b>' + esc(j.name) + '</b>' + (crew ? '' : '<span class="pj-amt">' + money(est) + '</span>') + '</div>'
        + '<div class="pj-sub">' + esc(j.title || 'Project') + '</div>'
        + (crew ? '' : '<div class="pj-bar" title="' + money(paid) + ' of ' + money(est) + ' collected"><i style="width:' + pct + '%"></i></div>'
          + '<div class="pj-pay">' + (est > 0 ? pct + '% paid · ' + money(Math.max(est - paid, 0)) + ' due' : 'no amount set') + '</div>')
        + '<div class="pj-meta">' + meta.join(' · ') + '</div></div></article>';
    }).join('');
    return '<div class="dash-projs"><div class="dash-sec"><h3>Projects in motion</h3><button class="bpx-linkbtn" onclick="bpNav(\'activejobs\')">'
      + (jobs.length > shown.length ? 'All ' + jobs.length + ' projects' : 'All projects') + '</button></div>'
      + '<div class="pj-row' + (split ? ' split' : '') + '" style="grid-template-columns:repeat(' + shown.length + ',minmax(0,1fr))">' + cards + '</div></div>';
  }

  /* ---------- the four numbers ---------- */
  function monthKey(t) { var d = new Date(t); return d.getFullYear() + '-' + d.getMonth(); }
  function numbers() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var act = jobs.filter(function (j) { return j.status === 'active'; });
    var inMotion = act.reduce(function (t, j) { return t + (+j.estimate || 0); }, 0);
    var owed = act.reduce(function (t, j) { return t + Math.max((+j.estimate || 0) - (+j.collected || 0), 0); }, 0);
    var fin; try { fin = bpFinData(); } catch (e) { fin = { inc: [], exp: [] }; }
    var mk = monthKey(Date.now());
    var inM = fin.inc.filter(function (x) { return x.when && monthKey(x.when) === mk; }).reduce(function (t, x) { return t + x.amt; }, 0);
    var outM = fin.exp.filter(function (x) { return x.when && monthKey(x.when) === mk; }).reduce(function (t, x) { return t + x.amt; }, 0);
    var pos = (window.SP && SP.pos) || [];
    var unsent = pos.filter(function (p) { return p.status === 'sent' && !p.sent_to_supplier; }).length;
    var bills = pos.filter(function (p) { return p.status === 'invoiced'; }).length;
    var tile = function (l, v, note, go, tone) { return '<div class="bpx-stat dash-tile' + (go ? ' go' : '') + '"' + (go ? ' onclick="bpNav(\'' + go + '\')"' : '') + '><div class="lbl">' + l + '</div><div class="val' + (tone ? ' ' + tone : '') + '">' + v + '</div><div class="note">' + note + '</div></div>'; };
    var supplyNote = !window.SP || !SP.loaded ? 'checking' : (unsent + bills) ? [unsent ? unsent + ' not sent' : '', bills ? bills + ' bill' + (bills === 1 ? '' : 's') + ' to check' : ''].filter(Boolean).join(', ') : 'nothing waiting';
    return '<div class="bpx-stats dash-nums">'
      + tile('In motion', act.length + '<small>' + (act.length === 1 ? ' project' : ' projects') + '</small>', money(inMotion) + ' of work', 'activejobs')
      + tile('Owed to you', money(owed), owed ? 'on active projects' : 'all collected', owed ? 'finances' : null, owed ? 'blue' : '')
      + tile('This month', money(inM - outM), money(inM) + ' in, ' + money(outM) + ' out', 'finances', inM - outM < 0 ? 'neg' : '')
      + tile('Materials', (window.SP && SP.loaded) ? String(unsent + bills) : '&middot;', supplyNote, 'supplyorders', (unsent + bills) ? 'warn' : '')
      + '</div>';
  }

  /* ---------- charts ----------
     These go through bpChart, the same as Finances and Orders: one palette,
     one hover layer, a table under each. The dashboard used to draw its own
     bars, which meant two chart languages in one product. */
  function moneyChart() {
    var fin; try { fin = bpFinData(); } catch (e) { return ''; }
    var inM = bpChart.byMonth(fin.inc, 6, function (x) { return x.when; }, function (x) { return x.amt; });
    var outM = bpChart.byMonth(fin.exp, 6, function (x) { return x.when; }, function (x) { return x.amt; });
    var months = inM.values.filter(function (v, i) { return v > 0 || outM.values[i] > 0; }).length;
    var totalIn = inM.values.reduce(function (t, v) { return t + v; }, 0);
    var totalOut = outM.values.reduce(function (t, v) { return t + v; }, 0);
    var net = totalIn - totalOut;
    var kept = (net >= 0 ? money(net) + ' kept' : money(-net) + ' down');

    if (!months) return '<div class="bpx-panel">' + bpChart.empty({
      title: 'Money in and out',
      empty: 'Nothing logged yet. Collect on a job, or photograph a supply bill, and six months of it appears here.',
    }) + '</div>';

    /* One or two months of history makes a six-column time series mostly
       empty air. Until there is a trend to draw, show where the money
       actually went, which is full from the first week. */
    if (months < 3) {
      var cat = {};
      fin.exp.forEach(function (x) { if (x.when) { var c = x.type || 'Other'; cat[c] = (cat[c] || 0) + x.amt; } });
      var rows = Object.keys(cat).map(function (c) { return { label: c, value: cat[c] }; });
      if (!rows.length) rows = [{ label: 'Money in', value: totalIn }];
      return '<div class="bpx-panel">' + bpChart.ranked({
        title: 'Where the money went',
        lead: kept + ' so far · a month or two more and this becomes income against costs, month by month',
        rows: rows, fmt: money, axis: 'Category',
      }) + '</div>';
    }

    return '<div class="bpx-panel">' + bpChart.line({
      title: 'Money in and out',
      lead: 'last six months · ' + kept,
      x: { label: 'Month', values: inM.labels },
      series: [{ name: 'Money in', values: inM.values }, { name: 'Money out', values: outM.values }],
      fmt: money, height: 200,
    }) + '</div>';
  }
  function jobsChart() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var rows = jobs.filter(function (j) { return j.status === 'done' && j.collected != null; }).map(function (j) {
      var c = +j.collected || 0, e = (j.expenses || []).reduce(function (t, x) { return t + (+x.amt || 0); }, 0);
      return { label: j.name || 'Job', a: e, b: c, profit: c - e };
    }).sort(function (x, y) { return y.profit - x.profit; });
    if (!rows.length) return '<div class="bpx-panel">' + bpChart.empty({
      title: 'What each job cost, and what it brought in',
      empty: 'Mark a project done and put in what you collected. Each one shows here with its costs beside it.',
    }) + '</div>';
    /* A single bar of profit hides the size of the job it came off: $2,000
       kept on a $4,000 repair and $2,000 kept on a $40,000 re-roof are not
       the same week. Both numbers, and the distance between them, in one row. */
    var kept = rows.reduce(function (t, r) { return t + r.profit; }, 0);
    return '<div class="bpx-panel">' + bpChart.dumbbell({
      title: 'What each job cost, and what it brought in',
      lead: rows.length + (rows.length === 1 ? ' finished job ' : ' finished jobs ') + '\u00b7 ' + money(kept) + ' kept across them',
      rows: rows, aName: 'What it cost', bName: 'What you collected',
      fmt: money, axis: 'Job', max: 7,
    }) + '</div>';
  }

  /* ---------- today: appointments and crews ---------- */
  function today() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var iso = new Date().toISOString().slice(0, 10);
    var crews = jobs.filter(function (j) { return j.status === 'active' && j.sched && (j.sched.dates || []).indexOf(iso) >= 0; });
    var ap = D.appts;
    var rows = [];
    crews.forEach(function (j) { rows.push({ t: (j.sched.time ? esc(j.sched.time) : 'All day'), w: esc(j.name) + (j.title ? ', ' + esc(j.title) : ''), s: 'Crew on site', go: 'activejobs' }); });
    (ap || []).slice(0, 4).forEach(function (a) { rows.push({ t: esc(a.time || ''), w: esc(a.name || 'Appointment'), s: esc(a.what || 'Inspection'), go: 'calendar' }); });
    if (!rows.length && ap === undefined && live()) return '';
    return '<div class="bpx-panel"><div class="bpx-ptitle">Today<span class="lg2">' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + '</span></div>'
      + (rows.length ? '<div class="dash-today">' + rows.map(function (r) { return '<div class="dash-ev" onclick="bpNav(\'' + r.go + '\')"><b>' + r.t + '</b><div><span>' + r.w + '</span><small>' + r.s + '</small></div></div>'; }).join('') + '</div>'
        : '<div class="dash-empty">Nothing booked today.</div>') + '</div>';
  }

  /* ---------- needs attention: what is waiting on them, only when non-zero ---------- */
  function attention() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [], rows = [];
    var todayIso = new Date().toISOString().slice(0, 10);
    var late = jobs.filter(function (j) { return j.status === 'active' && j.sched && j.sched.target && String(j.sched.target) < todayIso && ((+j.estimate || 0) - (+j.collected || 0)) > 0; });
    if (late.length) rows.push({ ico: 'schedule', n: late.length, t: late.length === 1 ? money((+late[0].estimate || 0) - (+late[0].collected || 0)) + ' still owed on ' + esc(late[0].name) + ', past its target date' : late.length + ' projects past their target date with money owed', go: 'activejobs', tone: 'bad' });
    var waiting = (D.contracts || []).filter(function (c) { return c.status === 'sent' || c.status === 'viewed'; });
    if (waiting.length) rows.push({ ico: 'draw', n: waiting.length, t: waiting.length === 1 ? (esc(waiting[0].customer_name || waiting[0].title) + ' has not signed yet' + (waiting[0].status === 'viewed' ? ' (opened it)' : '')) : waiting.length + ' contracts waiting for a signature', go: 'activejobs' });
    var pos = (window.SP && SP.pos) || [];
    var unsent = pos.filter(function (p) { return p.status === 'sent' && !p.sent_to_supplier; }).length, bills = pos.filter(function (p) { return p.status === 'invoiced'; }).length;
    if (unsent) rows.push({ ico: 'outgoing_mail', n: unsent, t: unsent === 1 ? 'One materials order has not been sent to the supply house' : unsent + ' materials orders not sent to the supply house', go: 'supplyorders', tone: 'warn' });
    if (bills) rows.push({ ico: 'receipt_long', n: bills, t: bills === 1 ? 'One supply bill to check against its order' : bills + ' supply bills to check', go: 'supplyorders' });
    if (D.unread) rows.push({ ico: 'chat', n: D.unread, t: D.unread === 1 ? 'One message waiting for a reply' : D.unread + ' messages waiting for a reply', go: 'messaging' });
    if (D.deals && D.deals.n) rows.push({ ico: 'handshake', n: D.deals.n, t: D.deals.n + (D.deals.n === 1 ? ' estimate' : ' estimates') + ' waiting on a yes' + (D.deals.v ? ', ' + money(D.deals.v) : ''), go: 'closedeals' });
    return '<div class="bpx-panel"><div class="bpx-ptitle">Needs you<span class="lg2">' + (rows.length ? rows.length + (rows.length === 1 ? ' thing' : ' things') + ' waiting' : 'nothing waiting') + '</span></div>'
      + (rows.length ? '<div class="dash-att">' + rows.map(function (r) { return '<div class="dash-att-r' + (r.tone ? ' ' + r.tone : '') + '" onclick="bpNav(\'' + r.go + '\')"><span class="ms">' + r.ico + '</span><span>' + r.t + '</span><span class="ms go">chevron_right</span></div>'; }).join('') + '</div>'
        : '<div class="dash-empty">Nothing is waiting on you. Bills matched, orders sent, contracts signed.</div>') + '</div>';
  }

  /* ---------- this week: crews and appointments, day by day ---------- */
  function week() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var days = [], now = new Date();
    for (var i = 0; i < 7; i++) { var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12); days.push({ iso: d.toISOString().slice(0, 10), lbl: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }), num: d.getDate(), crews: [], appts: [] }); }
    jobs.forEach(function (j) { if (j.status !== 'active' || !j.sched) return; (j.sched.dates || []).forEach(function (iso) { var day = days.filter(function (x) { return x.iso === iso; })[0]; if (day) day.crews.push(j); }); });
    (D.events || []).forEach(function (a) { var iso = String(a.start || '').slice(0, 10); var day = days.filter(function (x) { return x.iso === iso; })[0]; if (day) day.appts.push(a); });
    var busy = days.some(function (d) { return d.crews.length || d.appts.length; });
    var strip = '<div class="dash-week">' + days.map(function (d) {
      var n = d.crews.length + d.appts.length;
      return '<div class="dash-day' + (n ? ' on' : '') + (d.lbl === 'Today' ? ' today' : '') + '" title="' + esc(d.crews.map(function (j) { return j.name; }).concat(d.appts.map(function (a) { return a.name; })).join(', ')) + '"><small>' + d.lbl + '</small><b>' + d.num + '</b>'
        + '<span>' + (d.crews.length ? '<i class="c">' + d.crews.length + '</i>' : '') + (d.appts.length ? '<i class="a">' + d.appts.length + '</i>' : '') + '</span></div>';
    }).join('') + '</div>';
    var today = days[0], rows = [];
    today.crews.forEach(function (j) { rows.push({ t: j.sched.time ? esc(j.sched.time) : 'All day', w: esc(j.name) + (j.title ? ', ' + esc(j.title) : ''), s: 'Crew on site', go: 'activejobs' }); });
    today.appts.slice(0, 4).forEach(function (a) { rows.push({ t: esc(a.time || ''), w: esc(a.name || 'Appointment'), s: esc(a.what || 'Inspection'), go: 'calendar' }); });
    return '<div class="bpx-panel"><div class="bpx-ptitle">This week<span class="lg2"><i class="dash-key c"></i>crews <i class="dash-key a"></i>appointments</span></div>' + strip
      + (rows.length ? '<div class="dash-today">' + rows.map(function (r) { return '<div class="dash-ev" onclick="bpNav(\'' + r.go + '\')"><b>' + r.t + '</b><div><span>' + r.w + '</span><small>' + r.s + '</small></div></div>'; }).join('') + '</div>'
        : '<div class="dash-empty" style="padding-top:10px">' + (busy ? 'Nothing on today.' : 'Nothing booked this week. Schedule days on a project, or share your booking link.') + '</div>') + '</div>';
  }

  /* ---------- recent: what happened, newest first, from timestamps we already keep ---------- */
  function activity() {
    var ev = [], jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var add = function (t, txt, go) { if (t && !isNaN(t)) ev.push({ t: t, txt: txt, go: go }); };
    ((window.SP && SP.pos) || []).forEach(function (p) {
      var sup = window.SP && SP.supById && SP.supById(p.supplier_id);
      add(Date.parse(p.reconciled_at), 'Bill from ' + esc(sup ? sup.name : 'a supplier') + ' matched to ' + esc(p.job_name || 'the account') + ', ' + money(p.invoice_total || p.total), 'supplyorders');
      add(Date.parse(p.sent_at), 'Ordered ' + money(p.total) + ' of materials from ' + esc(sup ? sup.name : 'a supplier') + (p.job_name ? ' for ' + esc(p.job_name) : ''), 'supplyorders');
    });
    (D.contracts || []).forEach(function (c) {
      add(Date.parse(c.signed_at), esc(c.customer_name || c.title) + ' signed the contract' + (c.amount ? ', ' + money(c.amount) : ''), 'activejobs');
      add(Date.parse(c.sent_at), 'Contract sent to ' + esc(c.customer_name || c.title), 'activejobs');
    });
    jobs.forEach(function (j) {
      add(+j.doneAt, esc(j.name) + ' marked done' + (j.collected != null ? ', ' + money(j.collected) + ' collected' : ''), 'finances');
      add(+j.wonAt, esc(j.name) + ' won' + (j.estimate ? ', ' + money(j.estimate) : ''), 'activejobs');
    });
    ev.sort(function (a, b) { return b.t - a.t; });
    ev = ev.slice(0, 7);
    var ago = function (t) { var m = Math.round((Date.now() - t) / 60000); if (m < 60) return m + 'm'; var h = Math.round(m / 60); if (h < 24) return h + 'h'; var d = Math.round(h / 24); return d + 'd'; };
    return '<div class="bpx-panel"><div class="bpx-ptitle">Recent<span class="lg2">newest first</span></div>'
      + (ev.length ? '<div class="dash-act">' + ev.map(function (e) { return '<div class="dash-act-r" onclick="bpNav(\'' + e.go + '\')"><small>' + ago(e.t) + '</small><span>' + e.txt + '</span></div>'; }).join('') + '</div>'
        : '<div class="dash-empty">As you order materials, send contracts and finish jobs, they show here.</div>') + '</div>';
  }

  /* ---------- the foot: four figures about the business, not the day ---------- */
  function footStats() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [], mk = monthKey(Date.now());
    var wonM = jobs.filter(function (j) { return j.wonAt && monthKey(+j.wonAt) === mk; });
    var wonVal = wonM.reduce(function (t, j) { return t + (+j.estimate || 0); }, 0);
    var doneM = jobs.filter(function (j) { return j.doneAt && monthKey(+j.doneAt) === mk; });
    var doneVal = doneM.reduce(function (t, j) { return t + (+j.collected || 0); }, 0);
    var sized = jobs.filter(function (j) { return (+j.estimate || 0) > 0; });
    var avg = sized.length ? sized.reduce(function (t, j) { return t + (+j.estimate || 0); }, 0) / sized.length : 0;
    var t = function (l, v, note, go) { return '<div class="bpx-stat dash-tile' + (go ? ' go' : '') + '"' + (go ? ' onclick="bpNav(\'' + go + '\')"' : '') + '><div class="lbl">' + l + '</div><div class="val">' + v + '</div><div class="note">' + note + '</div></div>'; };
    return '<div class="bpx-stats dash-nums db-foot">'
      + t('New leads this month', D.leads ? D.leads.n : '&middot;', D.leads ? 'from your website and phone line' : 'connect your phone line to count these', D.leads ? 'contacts' : 'marketing')
      + t('Appointments this month', D.leads ? D.leads.a : '&middot;', D.leads ? 'booked through ' + (window.BP_AI_NAME || 'Lisa') + ' and your booking page' : 'your booking page feeds this', 'calendar')
      + t('Won this month', String(wonM.length), wonM.length ? money(wonVal) + ' of work' : 'nothing marked won yet', 'activejobs')
      + t('Average job', avg ? money(avg) : '&middot;', sized.length ? 'across ' + sized.length + (sized.length === 1 ? ' priced job' : ' priced jobs') : 'put a price on a job to see this', 'activejobs')
      + '</div>'
      + (doneM.length ? '<div class="dash-foot-note">' + doneM.length + (doneM.length === 1 ? ' project' : ' projects') + ' finished this month, ' + money(doneVal) + ' collected.</div>' : '');
  }

  /* ---------- the top line: who, when, and the three things started from here ---------- */
  function topline() {
    var co = ((window.bpSettingsGet && bpSettingsGet().company) || {});
    var h = new Date().getHours();
    var greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return '<div class="db-top"><div><div class="db-greet">' + esc(greet) + (co.name ? ', ' + esc(String(co.name).split(' ')[0]) : '') + '.</div>'
      + '<div class="db-date">' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + '</div></div>'
      + '<div class="db-acts"><button class="bpx-btn ghost" onclick="bpNav(\'estimates\')">New estimate</button>'
      + '<button class="bpx-btn ghost" onclick="bpNav(\'activejobs\')">Add project</button>'
      + '<button class="bpx-btn" onclick="bpNav(\'supply\')">Order materials</button></div></div>';
  }

  /* ---------- four numbers, two by two, in one card ---------- */
  function kpis() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [], act = jobs.filter(function (j) { return j.status === 'active'; });
    var fin; try { fin = bpFinData(); } catch (e) { fin = { inc: [], exp: [] }; }
    var mk = monthKey(Date.now());
    var inM = fin.inc.filter(function (x) { return x.when && monthKey(x.when) === mk; }).reduce(function (t, x) { return t + x.amt; }, 0);
    var outM = fin.exp.filter(function (x) { return x.when && monthKey(x.when) === mk; }).reduce(function (t, x) { return t + x.amt; }, 0);
    var owed = act.reduce(function (t, j) { return t + Math.max((+j.estimate || 0) - (+j.collected || 0), 0); }, 0);
    var inMotion = act.reduce(function (t, j) { return t + (+j.estimate || 0); }, 0);
    var net = inM - outM;
    var k = function (lbl, val, sub, go, tone) {
      return '<div class="db-k" onclick="bpNav(\'' + go + '\')"><span class="db-kl">' + lbl + '</span><span class="db-kv' + (tone ? ' ' + tone : '') + '">' + val + '</span><span class="db-ks">' + sub + '</span></div>';
    };
    return '<div class="bpx-panel db-kpis">'
      + k('Kept this month', money(net), money(inM) + ' in · ' + money(outM) + ' out', 'finances', net < 0 ? 'neg' : 'blue')
      + k('Owed to you', money(owed), owed ? 'on active projects' : 'all collected', 'finances')
      + k('In motion', String(act.length), money(inMotion) + ' of work', 'activejobs')
      + k('Waiting on a yes', D.deals ? String(D.deals.n) : '&middot;', D.deals && D.deals.v ? money(D.deals.v) + ' quoted' : 'estimates out', 'closedeals')
      + '</div>';
  }

  /* ---------- money in and out, month by month, as columns ---------- */
  function flow() {
    var fin; try { fin = bpFinData(); } catch (e) { return ''; }
    var inM = bpChart.byMonth(fin.inc, 6, function (x) { return x.when; }, function (x) { return x.amt; });
    var outM = bpChart.byMonth(fin.exp, 6, function (x) { return x.when; }, function (x) { return x.amt; });
    var any = inM.values.concat(outM.values).some(function (v) { return v > 0; });
    if (!any) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Money in and out', empty: 'Collect on a job or log an expense, and six months of it lines up here.' }) + '</div>';
    var net = inM.values.reduce(function (t, v) { return t + v; }, 0) - outM.values.reduce(function (t, v) { return t + v; }, 0);
    return '<div class="bpx-panel">' + bpChart.columns({
      title: 'Money in and out', lead: 'last six months · ' + (net >= 0 ? money(net) + ' kept' : money(-net) + ' down'),
      x: { label: 'Month', values: inM.labels },
      series: [{ name: 'Money in', values: inM.values }, { name: 'Money out', values: outM.values }],
      fmt: money, height: 230,
    }) + '</div>';
  }

  /* ---------- the pipeline: where the work is, in dollars ---------- */
  function pipeline() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var act = jobs.filter(function (j) { return j.status === 'active'; });
    var owed = act.reduce(function (t, j) { return t + Math.max((+j.estimate || 0) - (+j.collected || 0), 0); }, 0);
    var got = act.reduce(function (t, j) { return t + (+j.collected || 0); }, 0);
    var quoted = D.deals ? +D.deals.v || 0 : 0;
    var rows = [{ label: 'Quoted, waiting', value: quoted }, { label: 'Won, still owed', value: owed }, { label: 'Won, collected', value: got }];
    if (!rows.some(function (r) { return r.value > 0; })) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Your pipeline', empty: 'Send an estimate or win a project and it shows up here, quoted to collected.' }) + '</div>';
    return '<div class="bpx-panel">' + bpChart.donut({
      title: 'Your pipeline', lead: 'quoted to collected', rows: rows, fixed: true, fmt: money,
      centreNote: 'in the pipeline', axis: 'Stage',
    }) + '</div>';
  }

  /* ---------- where the money goes ---------- */
  function spend() {
    var fin; try { fin = bpFinData(); } catch (e) { return ''; }
    var cut = Date.now() - 183 * 864e5, cat = {};
    fin.exp.forEach(function (x) { if (x.when && x.when >= cut) { var c = x.type || 'Other'; cat[c] = (cat[c] || 0) + x.amt; } });
    var rows = Object.keys(cat).map(function (c) { return { label: c, value: cat[c] }; });
    if (!rows.length) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Where the money goes', empty: 'Log an expense or match a supply bill and your costs break down here.' }) + '</div>';
    return '<div class="bpx-panel">' + bpChart.ranked({ title: 'Where the money goes', lead: 'last six months', rows: rows, fmt: money, axis: 'Category', max: 6 }) + '</div>';
  }

  /* ---------- month-by-month series, for sparklines and the smaller charts ---------- */
  function monthly() {
    var fin; try { fin = bpFinData(); } catch (e) { fin = { inc: [], exp: [] }; }
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var inM = bpChart.byMonth(fin.inc, 6, function (x) { return x.when; }, function (x) { return x.amt; });
    var outM = bpChart.byMonth(fin.exp, 6, function (x) { return x.when; }, function (x) { return x.amt; });
    var won = bpChart.byMonth(jobs.filter(function (j) { return j.wonAt; }), 6, function (j) { return +j.wonAt; }, function () { return 1; });
    var wonV = bpChart.byMonth(jobs.filter(function (j) { return j.wonAt; }), 6, function (j) { return +j.wonAt; }, function (j) { return +j.estimate || 0; });
    return { labels: inM.labels, inc: inM.values, out: outM.values, net: inM.values.map(function (v, i) { return v - outM.values[i]; }), won: won.values, wonV: wonV.values, fin: fin, jobs: jobs };
  }
  /* a sparkline: one series, no axes, the last point marked */
  function spark(vals, tone) {
    var W = 120, H = 34, mx = Math.max.apply(null, vals.concat([1])), mn = Math.min.apply(null, vals.concat([0]));
    var pts = vals.map(function (v, i) { return [i * W / (vals.length - 1 || 1), H - 3 - (v - mn) / ((mx - mn) || 1) * (H - 6)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
    var last = pts[pts.length - 1];
    return '<svg class="db-spark ' + (tone || '') + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
      + '<path class="a" d="' + d + 'L' + W + ' ' + H + 'L0 ' + H + 'Z"></path><path class="l" d="' + d + '"></path>'
      + '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3"></circle></svg>';
  }
  function trend(vals) {
    var a = vals[vals.length - 2] || 0, b = vals[vals.length - 1] || 0;
    if (!a) return '';
    var p = Math.round((b - a) / Math.abs(a) * 100);
    return '<span class="db-trend ' + (p >= 0 ? 'up' : 'down') + '">' + (p >= 0 ? '&#9650; ' : '&#9660; ') + Math.abs(p) + '%</span>';
  }
  function sparkTiles(M) {
    var jobs = M.jobs, act = jobs.filter(function (j) { return j.status === 'active'; });
    var owed = act.reduce(function (t, j) { return t + Math.max((+j.estimate || 0) - (+j.collected || 0), 0); }, 0);
    var L = M.inc.length - 1;
    var t = function (lbl, val, sub, vals, go, tone) {
      return '<div class="bpx-panel db-st" onclick="bpNav(\'' + go + '\')"><div class="db-st-h"><span class="db-kl">' + lbl + '</span>' + trend(vals) + '</div>'
        + '<div class="db-kv' + (tone ? ' ' + tone : '') + '">' + val + '</div><div class="db-ks">' + sub + '</div>' + spark(vals, tone) + '</div>';
    };
    return [
      t('Money in', money(M.inc[L]), 'this month', M.inc, 'finances'),
      t('Kept', money(M.net[L]), 'this month, after costs', M.net, 'finances', M.net[L] < 0 ? 'neg' : 'blue'),
      t('Projects won', String(M.won[L]), money(M.wonV[L]) + ' of work this month', M.won, 'activejobs'),
      t('Money out', money(M.out[L]), 'this month, all costs', M.out, 'finances'),
    ];
  }
  function netLine(M) {
    if (!M.net.some(function (v) { return v; })) return '<div class="bpx-panel">' + bpChart.empty({ title: 'What you kept', empty: 'Six months of income less costs, once the money starts moving.' }) + '</div>';
    return '<div class="bpx-panel">' + bpChart.line({ title: 'What you kept', lead: 'income less costs, by month', x: { label: 'Month', values: M.labels },
      series: [{ name: 'Kept', values: M.net }], fmt: money, height: 190 }) + '</div>';
  }
  function wonCols(M) {
    if (!M.won.some(function (v) { return v; })) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Projects won', empty: 'Win a deal and each month counts up here.' }) + '</div>';
    return '<div class="bpx-panel">' + bpChart.columns({ title: 'Projects won', lead: 'by month', x: { label: 'Month', values: M.labels },
      series: [{ name: 'Won', values: M.won }], fmt: function (v) { return String(Math.round(v)); }, height: 190 }) + '</div>';
  }
  function spendDonut(M) {
    var cut = Date.now() - 183 * 864e5, cat = {};
    M.fin.exp.forEach(function (x) { if (x.when && x.when >= cut) { var c = x.type || 'Other'; cat[c] = (cat[c] || 0) + x.amt; } });
    var rows = Object.keys(cat).map(function (c) { return { label: c, value: cat[c] }; });
    if (!rows.length) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Where the money goes', empty: 'Log an expense or match a supply bill and your costs split up here.' }) + '</div>';
    return '<div class="bpx-panel">' + bpChart.donut({ title: 'Where the money goes', lead: 'last six months', rows: rows, fmt: money, centreNote: 'spent', axis: 'Category' }) + '</div>';
  }
  function collection(M) {
    var act = M.jobs.filter(function (j) { return j.status === 'active' && (+j.estimate || 0) > 0; });
    if (!act.length) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Collected on active projects', empty: 'Each running project shows how much of it you have been paid.' }) + '</div>';
    return '<div class="bpx-panel db-coll"><div class="bpx-ptitle">Collected on active projects<span class="lg2">paid against the price</span></div>'
      + act.slice(0, 5).map(function (j) { return bpChart.progress({ title: j.name, value: +j.collected || 0, target: +j.estimate || 0, fmt: money, note: j.title || '' }); }).join('')
      + '</div>';
  }

  /* ---------- three ways to lay the page out; the owner picks ---------- */
  var LAYOUTS = [['overview', 'Overview'], ['command', 'Command center'], ['projects', 'Projects first']];
  function layoutOf() { var v = null; try { v = localStorage.getItem('bpDashLayout'); } catch (e) {} return LAYOUTS.some(function (l) { return l[0] === v; }) ? v : 'overview'; }
  D.layout = function (v) { try { localStorage.setItem('bpDashLayout', v); } catch (e) {} window.bpDashboard(); };
  function switcher(cur) {
    return '<div class="db-lay"><span>Layout</span>' + LAYOUTS.map(function (l) {
      return '<button class="bpx-jt' + (l[0] === cur ? ' on' : '') + '" onclick="BP_DASH.layout(\'' + l[0] + '\')">' + l[1] + '</button>';
    }).join('') + '</div>';
  }
  function cells(list) { return '<div class="db-grid">' + list.map(function (c) { return '<div class="db-c' + c[0] + '">' + c[1] + '</div>'; }).join('') + '</div>'; }
  function body(lay, crew) {
    var M = monthly(), st = sparkTiles(M);
    if (lay === 'command') {
      return '<div class="db-split"><div class="db-main">'
        + cells([[12, flow()], [6, pipeline()], [6, spendDonut(M)], [12, jobsChart()], [12, projects(crew)]])
        + '</div><div class="db-rail">' + kpis() + attention() + week() + activity() + '</div></div>';
    }
    if (lay === 'projects') {
      return cells([[12, projects(crew)], [5, collection(M)], [7, week()]])
        + '<div class="db-row4">' + st.join('') + '</div>'
        + cells([[6, flow()], [6, netLine(M)], [4, pipeline()], [4, spend()], [4, attention()], [12, activity()]]);
    }
    return '<div class="db-row4">' + st.join('') + '</div>'
      + cells([[8, flow()], [4, pipeline()], [4, spendDonut(M)], [4, netLine(M)], [4, wonCols(M)],
        [12, projects(crew)], [8, jobsChart()], [4, collection(M)], [4, attention()], [4, week()], [4, activity()]]);
  }

  /* ---------- example data, so the page can be seen before anyone signs in ---------- */
  function demoShim() {
    if (live()) return null;
    var now = Date.now(), day = 864e5, iso = function (d) { return new Date(now + d * day).toISOString().slice(0, 10); };
    var jobs = [
      { id: 'd1', name: 'Mike Johnson', title: 'Full re-roof, architectural', estimate: 18400, collected: 9200, status: 'active', wonAt: now - 12 * day, sched: { dates: [iso(0), iso(1)], time: '7:00 AM' }, expenses: [] },
      { id: 'd2', name: 'Sarah Malik', title: 'Storm repair and gutters', estimate: 7600, collected: 0, status: 'active', wonAt: now - 5 * day, sched: { dates: [iso(3)] }, expenses: [] },
      { id: 'd3', name: 'Carlos Rivera', title: 'Leak repair', estimate: 2100, collected: 1050, status: 'active', wonAt: now - 3 * day, sched: { dates: [iso(5)] }, expenses: [] },
    ];
    var done = [['Dana Meyers', 14200, 8900], ['Jessica Tran', 21600, 13100], ['Ethan Wells', 6400, 3900], ['Nina Patel', 9800, 6700], ['Omar Haddad', 4300, 2600]];
    done.forEach(function (d, i) { jobs.push({ id: 'x' + i, name: d[0], title: 'Re-roof', estimate: d[1], collected: d[1], status: 'done', wonAt: now - (40 + i * 30) * day, doneAt: now - (20 + i * 31) * day,
      expenses: [{ cat: 'Materials', amt: Math.round(d[2] * .6) }, { cat: 'Labor / crew', amt: Math.round(d[2] * .32) }, { cat: 'Permits', amt: Math.round(d[2] * .08) }] }); });
    var inc = [], exp = [];
    jobs.forEach(function (j) {
      if (j.collected) inc.push({ amt: j.collected, when: j.doneAt || now - 2 * day, type: 'Job' });
      (j.expenses || []).forEach(function (e) { exp.push({ amt: e.amt, when: j.doneAt, type: e.cat }); });
    });
    for (var m = 0; m < 6; m++) { exp.push({ amt: 640, when: now - m * 30 * day, type: 'Ads' }); exp.push({ amt: 380, when: now - m * 30 * day, type: 'Fuel' }); }
    var fin = { inc: inc, exp: exp };
    fin.income = inc.reduce(function (t, x) { return t + x.amt; }, 0); fin.expense = exp.reduce(function (t, x) { return t + x.amt; }, 0);
    var keep = { jg: window.bpJobsGet, fd: window.bpFinData };
    window.bpJobsGet = function () { return jobs; };
    window.bpFinData = function () { return fin; };
    if (D.deals === undefined) D.deals = { n: 4, v: 38400 };
    if (D.unread === undefined) D.unread = 2;
    if (D.leads === undefined) D.leads = { n: '23', a: '9' };
    if (D.contracts === undefined) D.contracts = [{ customer_name: 'Sarah Malik', status: 'viewed', sent_at: new Date(now - 2 * day).toISOString() }];
    if (D.events === undefined) { D.events = [
      { start: new Date(now).toISOString(), time: '10:00 AM', name: 'Priya Shah', what: 'Roof inspection' },
      { start: new Date(now + 2 * day).toISOString(), time: '2:00 PM', name: 'Tom Becker', what: 'Storm inspection' },
      { start: new Date(now + 4 * day).toISOString(), time: '9:30 AM', name: 'Lena Ortiz', what: 'Estimate walk-through' }]; D.appts = D.events; }
    return function () { window.bpJobsGet = keep.jg; window.bpFinData = keep.fd; };
  }

  /* ---------- the page ----------
     A grid of mixed sizes rather than one column of equal panels: the
     numbers and the money chart open it side by side, then three charts in
     a row, the projects across the full width, and the lists last. */
  window.bpDashboard = function () {
    var el = $('bpxViewArea'); if (!el) return;
    var crew = !!(window.bpTeamIsCrew && bpTeamIsCrew());
    var undo = demoShim();
    try {
      el.innerHTML = (live() ? '' : '<div class="sp-note warn"><span class="ms">science</span>Example numbers. Sign in and this shows your own.</div>')
        + topline()
        + (crew ? '' : checklist())
        + (crew
          ? projects(crew) + '<div style="margin-top:16px">' + week() + '</div>'
          : switcher(layoutOf()) + body(layoutOf(), crew));
    } finally { if (undo) undo(); }
    fetchState();
  };

  /* a rotation crosses the breakpoint: redraw so the chart is drawn for the
     size it is actually being shown at */
  var wasNarrow = (window.innerWidth || 1200) < 760;
  window.addEventListener('resize', function () {
    var now = (window.innerWidth || 1200) < 760;
    if (now === wasNarrow) return;
    wasNarrow = now;
    if (window._bpCurView === 'dashboard') window.bpDashboard();
  });

  /* what needs the network: fetched once per visit, page re-rendered when it lands */
  var fetching = false;
  function fetchState() {
    if (!live() || fetching) return;
    fetching = true;
    var again = function () { if (window._bpCurView === 'dashboard') window.bpDashboard(); };
    var jobs = [];
    if (D.brain === undefined) jobs.push(window.bpAuthApi(window.AI_BRAIN_URL, { op: 'get' }).then(function (r) { D.brain = (r && r.ok && r.brain) || null; }).catch(function () { D.brain = null; }));
    if (D.calc === undefined) jobs.push(BP_SB.from('calculator_pricing').select('calc_id').limit(1).then(function (r) { D.calc = !!(r && r.data && r.data.length); }).catch(function () { D.calc = false; }));
    if (window.SP && !SP.loaded && SP.load) jobs.push(SP.load().catch(function () {}));
    if (D.events === undefined && window.GHL_CAL_URL) jobs.push(window.bpApi(window.GHL_CAL_URL, { action: 'list', cal: 'inspection' }).then(function (d) {
      D.events = ((d && (d.appointments || d.events)) || []).map(function (a) { var t = a.start || a.startTime; return { start: t ? new Date(t).toISOString() : '', time: t ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '', name: a.contact || a.contactName || a.title || a.name || 'Appointment', what: a.title || a.calendar || 'Inspection' }; });
      D.appts = D.events;
    }).catch(function () { D.events = null; D.appts = null; }));
    if (D.contracts === undefined) jobs.push(BP_SB.from('contracts').select('id,title,customer_name,status,amount,sent_at,signed_at').order('created_at', { ascending: false }).limit(30).then(function (r) { D.contracts = (r && r.data) || []; }).catch(function () { D.contracts = []; }));
    if (D.unread === undefined) jobs.push(BP_SB.from('conversations').select('unread').gt('unread', 0).limit(200).then(function (r) { D.unread = ((r && r.data) || []).reduce(function (t, c) { return t + (+c.unread || 0); }, 0); }).catch(function () { D.unread = 0; }));
    if (D.deals === undefined && window.GHL_OPP_URL) jobs.push(window.bpApi(window.GHL_OPP_URL, { action: 'list' }).then(function (d) { var o = (d && d.opportunities) || []; D.deals = { n: o.length, v: o.reduce(function (t, x) { return t + (+x.value || 0); }, 0) }; }).catch(function () { D.deals = null; }));
    if (D.leads === undefined && window.GHL_DASH_URL) jobs.push(window.bpApi(window.GHL_DASH_URL, {}).then(function (d) {
      D.leads = (d && d.newLeadsMonth != null) ? { n: Number(d.newLeadsMonth).toLocaleString(), a: d.appointmentsBookedMonth != null ? Number(d.appointmentsBookedMonth).toLocaleString() : '&middot;' } : null;
    }).catch(function () { D.leads = null; }));
    /* nothing left to fetch: stop here, or the re-render would fetch again forever */
    if (!jobs.length) { fetching = false; return; }
    Promise.all(jobs).then(function () { fetching = false; again(); }, function () { fetching = false; again(); });
  }
})();
