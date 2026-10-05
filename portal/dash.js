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
      + '<button class="hero-cta" onclick="bpNav(\'matlists\')"><span class="ms">add</span>Order materials</button></div>'
      + '<div class="hero-ks">' + nums + '</div></div>';
  }

  /* ---------- projects: the photos, big, right under the hero ---------- */
  function projects(crew) {
    var jobs = ((window.bpJobsGet && bpJobsGet()) || []).filter(function (j) { return j.status === 'active'; });
    if (!jobs.length) {
      return '<div class="bpx-panel dash-projs-empty">'
        + '<div><b>No projects running</b><span class="bpx-mut">Win a deal in Close Deals, or add one straight away. Photos, the schedule and the costs all live on the project.</span>'
        + '<button class="bpx-btn ghost sp-inline" onclick="bpNav(\'activejobs\')">Open Active Projects</button></div></div>';
    }
    /* starred projects first: the ones the owner marked as the ones to watch */
    jobs = jobs.slice().sort(function (a, b) { return (b.starred ? 1 : 0) - (a.starred ? 1 : 0); });
    var iso = new Date().toISOString().slice(0, 10);
    /* The row always fills: as many columns as there are cards, up to four.
       One or two get a wide layout with the photo beside the detail, three
       or four get photo cards. No empty columns either way. */
    var shown = jobs.slice(0, 4);
    return '<div class="dash-projs"><div class="dash-sec"><h3>' + (shown.some(function (j) { return j.starred; }) ? 'Marked projects' : 'Projects in motion') + '</h3><button class="bpx-linkbtn" onclick="bpNav(\'activejobs\')">'
      + (jobs.length > shown.length ? 'All ' + jobs.length + ' projects' : 'All projects') + '</button></div>' + projCards(shown, crew) + '</div>';
  }
  /* No photo yet: a soft tile that says what kind of job it is, rather
     than a big grey box apologising for a missing picture. */
  function jobIcon(j) {
    var t = String((j.title || '') + ' ' + (j.trade || '')).toLowerCase();
    var map = [[/gutter|downspout/, 'water_drop'], [/leak|water/, 'water_damage'], [/storm|hail|wind/, 'thunderstorm'],
      [/roof|shingle|metal|flat|tpo|slate|tile/, 'roofing'], [/sid(ing|e)/, 'home'], [/window|door/, 'window'],
      [/paint/, 'format_paint'], [/deck|fence|porch/, 'fence'], [/solar/, 'solar_power'], [/hvac|furnace|air/, 'mode_fan'],
      [/plumb|pipe/, 'plumbing'], [/electric|wiring|panel/, 'electrical_services'], [/kitchen|bath|remodel/, 'kitchen'],
      [/insul|attic/, 'heat'], [/chimney|mason|brick/, 'foundation']];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(t)) return map[i][1];
    return 'construction';
  }
  function initials(n) {
    var p = String(n || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function noPhoto(j) {
    return '<div class="pj-np"><span class="pj-np-ico"><span class="ms">' + jobIcon(j) + '</span></span>'
      + '<span class="pj-np-t"><b>' + esc(j.title || 'Project') + '</b><small>' + esc(initials(j.name)) + ' &middot; ' + esc(j.name || '') + '</small></span>'
      + '<button class="pj-np-add" onclick="event.stopPropagation();bpNav(\'activejobs\');setTimeout(function(){bpProjOpen(\'' + j.id + '\');if(window.bpProjTab)bpProjTab(\'photos\')},60)"><span class="ms">add</span>Add photo</button></div>';
  }
  /* the photo cards, shared with the Projects page's starred row */
  function projCards(shown, crew) {
    var iso = new Date().toISOString().slice(0, 10), split = shown.length <= 2;
    var cards = shown.map(function (j) {
      var img = (j.photos && j.photos[0]) || '';
      var est = +j.estimate || 0, paid = +j.collected || 0;
      var pct = est > 0 ? Math.min(100, Math.round(paid / est * 100)) : 0;
      var today = j.sched && (j.sched.dates || []).indexOf(iso) >= 0;
      var nDays = (j.sched && (j.sched.dates || []).length) || 0;
      var meta = [];
      if (today) meta.push('<b class="pj-live"><i></i>Crew on site today</b>');
      else if (nDays) meta.push(nDays + (nDays === 1 ? ' day booked' : ' days booked'));
      if (j.photos && j.photos.length) meta.push(j.photos.length + (j.photos.length === 1 ? ' photo' : ' photos'));
      return '<article class="pj-card" onclick="bpNav(\'activejobs\');setTimeout(function(){bpProjOpen(\'' + j.id + '\')},60)">'

        + '<div class="pj-img' + (img ? '' : ' pj-noimg') + '">' + '<button class="pj-mark' + (j.starred ? ' on' : '') + '" title="' + (j.starred ? 'Unmark' : 'Mark this project') + '" onclick="event.stopPropagation();bpProjStar(\'' + j.id + '\')">' + (j.starred ? 'Marked' : 'Mark') + '</button>' + (!img ? noPhoto(j) : (window.bpPF ? bpPF.img(img, 'alt="" loading="lazy"') : '<img src="' + esc(img) + '" alt="" loading="lazy">')) + (today ? '<span class="pj-flag">Today</span>' : '') + '</div>'
        + '<div class="pj-body"><div class="pj-h"><b>' + esc(j.name) + '</b>' + (crew ? '' : '<span class="pj-amt">' + money(est) + '</span>') + '</div>'
        + '<div class="pj-sub">' + esc(j.title || 'Project') + '</div>'
        + (crew ? '' : '<div class="pj-bar" title="' + money(paid) + ' of ' + money(est) + ' collected"><i style="width:' + pct + '%"></i></div>'
          + '<div class="pj-pay">' + (est > 0 ? pct + '% paid · ' + money(Math.max(est - paid, 0)) + ' due' : 'no amount set') + '</div>')
        + '<div class="pj-meta">' + meta.join(' · ') + '</div>' + (window.bpPermitChip && (j.permits || []).length ? '<div class="pj-meta">' + bpPermitChip(j) + '</div>' : '') + '</div></article>';
    }).join('');
    return '<div class="pj-row' + (split ? ' split' : '') + '" style="grid-template-columns:repeat(' + shown.length + ',minmax(0,1fr))">' + cards + '</div>';
  }

  window.bpProjCards = projCards;

  /* ---------- the period the money figures cover; the owner picks ---------- */
  var PERIODS = [['month', 'This month'], ['6m', '6 months'], ['1y', '1 year']];
  function periodKey() { var v = null; try { v = localStorage.getItem('bpDashPeriod'); } catch (e) {} return PERIODS.some(function (p) { return p[0] === v; }) ? v : 'month'; }
  D.period = function (v) { try { localStorage.setItem('bpDashPeriod', v); } catch (e) {} window.bpDashboard(); };
  function periodOf(k) {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth(), b = [];
    var mon = function (yy, mm) { return new Date(yy, mm, 1).getTime(); };
    if (k === 'month') {
      var last = new Date(y, m + 1, 0).getDate();
      for (var d = 1; d <= last; d += 7) {
        var e = Math.min(d + 6, last);
        b.push({ label: new Date(y, m, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (e > d ? '\u2013' + e : ''), start: new Date(y, m, d).getTime(), end: new Date(y, m, e + 1).getTime() });
      }
      return { k: k, start: mon(y, m), end: mon(y, m + 1), pStart: mon(y, m - 1), pEnd: mon(y, m), buckets: b, axis: 'Week', word: 'this month', vs: 'last month', by: 'by week' };
    }
    var n = k === '1y' ? 12 : 6;
    for (var i = n - 1; i >= 0; i--) {
      var dt = new Date(y, m - i, 1);
      b.push({ label: dt.toLocaleDateString('en-US', { month: 'short' }), start: dt.getTime(), end: mon(y, m - i + 1) });
    }
    return { k: k, start: mon(y, m - n + 1), end: mon(y, m + 1), pStart: mon(y, m - 2 * n + 1), pEnd: mon(y, m - n + 1), buckets: b, axis: 'Month',
      word: 'last ' + n + ' months', vs: 'the ' + n + ' months before', by: 'by month' };
  }
  function periodSwitch(cur) {
    return '<div class="db-per" role="group" aria-label="Period">' + PERIODS.map(function (p) {
      return '<button class="' + (p[0] === cur ? 'on' : '') + '" aria-pressed="' + (p[0] === cur) + '" onclick="BP_DASH.period(\'' + p[0] + '\')">' + p[1] + '</button>';
    }).join('') + '</div>';
  }
  var P = periodOf('month');
  function inP(t, a, b) { t = +t; return t >= a && t < b; }
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
  /* Each finished job as a pair of thin columns, what came in beside what
     it cost: the same marks and the same two colours as Money in and out,
     so the two charts read as one. The profit sits over each pair. */
  function jobsChart() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var all = jobs.filter(function (j) { return j.status === 'done' && j.collected != null && inP(j.doneAt, P.start, P.end); })
      .sort(function (a, b) { return (+b.doneAt || 0) - (+a.doneAt || 0); });
    var T = 'What each job cost, and what it brought in';
    if (!all.length) return '<div class="bpx-panel">' + bpChart.empty({ title: T,
      empty: (jobs.some(function (j) { return j.status === 'done'; }) ? 'No job finished ' + P.word + '. ' : '') + 'Mark a project done and put in what you collected. Each one shows here with its costs beside it.' }) + '</div>';
    var rows = all.map(function (j) {
      var c = +j.collected || 0, e = (j.expenses || []).reduce(function (t, x) { return t + (+x.amt || 0); }, 0);
      return { j: j, c: c, e: e, p: c - e };
    });
    var kept = rows.reduce(function (t, r) { return t + r.p; }, 0);
    var shown = rows.slice(0, 8).reverse();
    var last = function (r) { var w = String(r.j.name || r.j.title || 'Job').trim().split(/\s+/); return w[w.length - 1]; };
    var sgn = function (v) { return (v < 0 ? '\u2212' : '+') + bpChart.compact(Math.abs(v), true); };
    return '<div class="bpx-panel">' + bpChart.columns({
      title: T,
      lead: rows.length + (rows.length === 1 ? ' finished job' : ' finished jobs') + ' \u00b7 ' + money(kept) + ' kept' + (rows.length > shown.length ? ' \u00b7 latest ' + shown.length + ' shown' : ''),
      x: { label: 'Job', values: shown.map(last) },
      series: [{ name: 'What you collected', values: shown.map(function (r) { return r.c; }) }, { name: 'What it cost', values: shown.map(function (r) { return r.e; }) }],
      groupCaps: shown.map(function (r) { return sgn(r.p); }),
      notes: shown.map(function (r) { return (r.j.name || '') + (r.j.title ? ', ' + r.j.title : '') + ' \u00b7 kept ' + (r.p < 0 ? '\u2212' : '') + money(Math.abs(r.p)) + (r.c > 0 ? ' (' + Math.round(r.p / r.c * 100) + '%)' : ''); }),
      fmt: money, height: 220,
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
    var rows = attRows();
    return '<div class="bpx-panel"><div class="bpx-ptitle">Needs you<span class="lg2">' + (rows.length ? rows.length + (rows.length === 1 ? ' thing' : ' things') + ' waiting' : 'nothing waiting') + '</span></div>'
      + (rows.length ? '<div class="dash-att">' + rows.map(function (r) { return '<div class="dash-att-r' + (r.tone ? ' ' + r.tone : '') + '" onclick="bpNav(\'' + r.go + '\')"><span class="ms">' + r.ico + '</span><span>' + r.t + '</span><span class="ms go">chevron_right</span></div>'; }).join('') + '</div>'
        : '<div class="dash-empty">Nothing is waiting on you. Bills matched, orders sent, contracts signed.</div>') + '</div>';
  }
  function attRows() {
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
    return rows;
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
    var ev = actRows();
    var ago = function (t) { var m = Math.round((Date.now() - t) / 60000); if (m < 60) return m + 'm'; var h = Math.round(m / 60); if (h < 24) return h + 'h'; var d = Math.round(h / 24); return d + 'd'; };
    return '<div class="bpx-panel"><div class="bpx-ptitle">Recent<span class="lg2">newest first</span></div>'
      + (ev.length ? '<div class="dash-act">' + ev.map(function (e) { return '<div class="dash-act-r" onclick="bpNav(\'' + e.go + '\')"><small>' + ago(e.t) + '</small><span>' + e.txt + '</span></div>'; }).join('') + '</div>'
        : '<div class="dash-empty">As you order materials, send contracts and finish jobs, they show here.</div>') + '</div>';
  }
  function actRows() {
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
    return ev.slice(0, 7);
  }
  /* the top bar's bell: what needs you, then what happened (portal/shell.js) */
  D.feed = function () {
    var undo = demoShim(live() && !hasOwnData());
    try { return { needs: attRows(), recent: actRows() }; } catch (e) { return { needs: [], recent: [] }; } finally { if (undo) undo(); }
  };

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
    return '<div class="db-top"><div><div class="db-greet">' + esc(greet) + (co.name ? ', ' + esc(String(co.name).split(' ')[0]) : '') + '</div>'
      + '<div class="db-date">' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + '</div></div>'
      + '<div class="db-acts">' + (layoutOf() === 'overview' ? periodSwitch(periodKey()) : '') + '<button class="bpx-btn ghost" onclick="bpNav(\'estimates\')">New estimate</button>'
      + '<button class="bpx-btn ghost" onclick="bpNav(\'activejobs\')">Add project</button>'
      + '<button class="bpx-btn" onclick="bpNav(\'matlists\')">Order materials</button></div></div>';
  }

  /* ---------- four numbers, two by two, in one card ---------- */
  function kpis() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [], act = jobs.filter(function (j) { return j.status === 'active'; });
    var fin; try { fin = bpFinData(); } catch (e) { fin = { inc: [], exp: [] }; }
    var inM = fin.inc.filter(function (x) { return inP(x.when, P.start, P.end); }).reduce(function (t, x) { return t + x.amt; }, 0);
    var outM = fin.exp.filter(function (x) { return inP(x.when, P.start, P.end); }).reduce(function (t, x) { return t + x.amt; }, 0);
    var owed = act.reduce(function (t, j) { return t + Math.max((+j.estimate || 0) - (+j.collected || 0), 0); }, 0);
    var inMotion = act.reduce(function (t, j) { return t + (+j.estimate || 0); }, 0);
    var net = inM - outM;
    var k = function (lbl, val, sub, go, tone) {
      return '<div class="db-k" onclick="bpNav(\'' + go + '\')"><span class="db-kl">' + lbl + '</span><span class="db-kv' + (tone ? ' ' + tone : '') + '">' + val + '</span><span class="db-ks">' + sub + '</span></div>';
    };
    return '<div class="bpx-panel db-kpis">'
      + k('Kept ' + P.word, money(net), money(inM) + ' in · ' + money(outM) + ' out', 'finances', net < 0 ? 'neg' : 'blue')
      + k('Owed to you', money(owed), owed ? 'on active projects' : 'all collected', 'finances')
      + k('In motion', String(act.length), money(inMotion) + ' of work', 'activejobs')
      + k('Waiting on a yes', D.deals ? String(D.deals.n) : '&middot;', D.deals && D.deals.v ? money(D.deals.v) + ' quoted' : 'estimates out', 'closedeals')
      + '</div>';
  }

  /* ---------- money in and out, month by month, as columns ---------- */
  function flow() {
    var fin; try { fin = bpFinData(); } catch (e) { return ''; }
    var inM = bpChart.byBuckets(fin.inc, P.buckets, function (x) { return x.when; }, function (x) { return x.amt; });
    var outM = bpChart.byBuckets(fin.exp, P.buckets, function (x) { return x.when; }, function (x) { return x.amt; });
    var any = inM.values.concat(outM.values).some(function (v) { return v > 0; });
    if (!any) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Money in and out', empty: 'Nothing in or out ' + P.word + '. Collect on a job or log an expense, and it lines up here.' }) + '</div>';
    var net = inM.values.reduce(function (t, v) { return t + v; }, 0) - outM.values.reduce(function (t, v) { return t + v; }, 0);
    return '<div class="bpx-panel">' + bpChart.columns({
      title: 'Money in and out', lead: P.word + ' ' + P.by + ' · ' + (net >= 0 ? money(net) + ' kept' : money(-net) + ' down'),
      x: { label: P.axis, values: inM.labels },
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
      title: 'Your pipeline', lead: 'quoted to collected', rows: rows, fixed: true, ordinal: true, fmt: money,
      centreNote: 'in the pipeline', axis: 'Stage',
    }) + '</div>';
  }

  /* ---------- where the money goes ---------- */
  function spend() {
    var fin; try { fin = bpFinData(); } catch (e) { return ''; }
    var cat = {};
    fin.exp.forEach(function (x) { if (inP(x.when, P.start, P.end)) { var c = x.type || 'Other'; cat[c] = (cat[c] || 0) + x.amt; } });
    var rows = Object.keys(cat).map(function (c) { return { label: c, value: cat[c] }; });
    if (!rows.length) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Where the money goes', empty: 'Log an expense or match a supply bill and your costs break down here.' }) + '</div>';
    return '<div class="bpx-panel">' + bpChart.ranked({ title: 'Where the money goes', lead: P.word, rows: rows, fmt: money, axis: 'Category', max: 6 }) + '</div>';
  }

  /* ---------- month-by-month series, for sparklines and the smaller charts ---------- */
  function monthly() {
    var fin; try { fin = bpFinData(); } catch (e) { fin = { inc: [], exp: [] }; }
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var W = function (x) { return x.when; }, A = function (x) { return x.amt; };
    var Jw = function (j) { return +j.wonAt; }, won = jobs.filter(function (j) { return j.wonAt; });
    var inM = bpChart.byBuckets(fin.inc, P.buckets, W, A), outM = bpChart.byBuckets(fin.exp, P.buckets, W, A);
    var wonN = bpChart.byBuckets(won, P.buckets, Jw, function () { return 1; });
    var wonV = bpChart.byBuckets(won, P.buckets, Jw, function (j) { return +j.estimate || 0; });
    var sum = function (rows, a, b, get, val) { return rows.reduce(function (t, r) { return t + (inP(get(r), a, b) ? val(r) : 0); }, 0); };
    var tot = function (a, b) {
      var i = sum(fin.inc, a, b, W, A), o = sum(fin.exp, a, b, W, A);
      return { inc: i, out: o, net: i - o, won: sum(won, a, b, Jw, function () { return 1; }), wonV: sum(won, a, b, Jw, function (j) { return +j.estimate || 0; }) };
    };
    return { labels: inM.labels, inc: inM.values, out: outM.values, net: inM.values.map(function (v, i) { return v - outM.values[i]; }),
      won: wonN.values, wonV: wonV.values, cur: tot(P.start, P.end), prev: tot(P.pStart, P.pEnd), fin: fin, jobs: jobs };
  }
  /* A headline figure with its trend: the total for the period, a delta
     chip against the period before it (coloured by whether that direction
     is good, arrowed so colour is never alone), and a sparkline of the
     period's weeks or months. */
  function sparkTiles(M) {
    var t = function (lbl, key, val, sub, vals, go, o) {
      o = o || {};
      return '<div class="bpx-panel db-st" onclick="bpNav(\'' + go + '\')"><div class="db-st-h"><span class="db-kl">' + lbl + '</span>'
        + bpChart.delta(M.prev[key], M.cur[key], { upIsGood: o.upIsGood, vs: P.vs }) + '</div>'
        + '<div class="db-kv' + (o.tone ? ' ' + o.tone : '') + '">' + val + '</div><div class="db-ks">' + sub + '</div>'
        + bpChart.spark(vals, { tone: o.tone === 'neg' ? 'neg' : '', fmt: o.fmt || money, labels: M.labels }) + '</div>';
    };
    var C = M.cur;
    return [
      t('Money in', 'inc', money(C.inc), P.word, M.inc, 'finances'),
      t('Kept', 'net', money(C.net), P.word + ', after costs', M.net, 'finances', { tone: C.net < 0 ? 'neg' : 'blue' }),
      t('Projects won', 'won', String(C.won), money(C.wonV) + ' of work ' + P.word, M.won, 'activejobs', { fmt: function (v) { return v + (v === 1 ? ' project' : ' projects'); } }),
      t('Money out', 'out', money(C.out), P.word + ', all costs', M.out, 'finances', { upIsGood: false }),
    ];
  }
  function netLine(M) {
    if (!M.net.some(function (v) { return v; })) return '<div class="bpx-panel">' + bpChart.empty({ title: 'What you kept', empty: 'Income less costs ' + P.by + ', once the money starts moving ' + P.word + '.' }) + '</div>';
    return '<div class="bpx-panel">' + bpChart.area({ title: 'What you kept', lead: 'income less costs, ' + P.by + ' · ' + P.word, x: { label: P.axis, values: M.labels },
      series: [{ name: 'Kept', values: M.net }], fmt: money, height: 190 }) + '</div>';
  }
  function wonCols(M) {
    if (!M.won.some(function (v) { return v; })) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Projects won', empty: 'Nothing won ' + P.word + '. Win a deal and it counts up here.' }) + '</div>';
    return '<div class="bpx-panel">' + bpChart.columns({ title: 'Projects won', lead: P.by + ' · ' + P.word, x: { label: P.axis, values: M.labels },
      series: [{ name: 'Won', values: M.won }], fmt: bpChart.NAMED.count, fmtKind: 'count', height: 190 }) + '</div>';
  }
  function spendDonut(M) {
    var cat = {};
    M.fin.exp.forEach(function (x) { if (inP(x.when, P.start, P.end)) { var c = x.type || 'Other'; cat[c] = (cat[c] || 0) + x.amt; } });
    var rows = Object.keys(cat).map(function (c) { return { label: c, value: cat[c] }; });
    if (!rows.length) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Where the money goes', empty: 'Nothing spent ' + P.word + '. Log an expense or match a supply bill and your costs split up here.' }) + '</div>';
    return '<div class="bpx-panel">' + bpChart.donut({ title: 'Where the money goes', lead: P.word, rows: rows, fmt: money, centreNote: 'spent', axis: 'Category' }) + '</div>';
  }
  function collection(M) {
    var act = M.jobs.filter(function (j) { return j.status === 'active' && (+j.estimate || 0) > 0; });
    if (!act.length) return '<div class="bpx-panel">' + bpChart.empty({ title: 'Collected on active projects', empty: 'Each running project shows how much of it you have been paid.' }) + '</div>';
    return '<div class="bpx-panel db-coll"><div class="bpx-ptitle">Collected on active projects<span class="lg2">paid against the price</span></div>'
      + act.slice(0, 5).map(function (j) { return bpChart.progress({ title: j.name, value: +j.collected || 0, target: +j.estimate || 0, fmt: money, note: j.title || '' }); }).join('')
      + '</div>';
  }

  /* ---------- the widget board: every card has a title, a kebab, one job ---------- */
  function W(go, html, cls) {
    return '<div class="hl-w' + (cls ? ' ' + cls : '') + '"><button class="hl-keb" aria-label="Widget menu" onclick="event.stopPropagation();BP_DASH.kebab(this,\'' + go + '\')">'
      + '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>' + html + '</div>';
  }
  function kpiW(title, val, sub, go, o) {
    o = o || {};
    return W(go, '<div class="bpx-panel hl-kpi" onclick="bpNav(\'' + go + '\')"><div class="hl-wh">' + title + '</div>'
      + '<div class="hl-kv' + (o.tone ? ' ' + o.tone : '') + '">' + val + '</div><div class="hl-ks">' + (o.delta || '') + '<span>' + sub + '</span></div></div>');
  }
  /* ---------- the smaller figures: one number each, from the same jobs and money ---------- */
  function avg(a) { return a.length ? a.reduce(function (t, v) { return t + v; }, 0) / a.length : 0; }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
  function jobCost(j) { return (j.expenses || []).reduce(function (t, x) { return t + (+x.amt || 0); }, 0); }
  function jobKind(j) {
    var t = String(j.trade || j.type || j.title || '').trim();
    t = t.split(/\s[—–-]\s|:|\(|,/)[0].trim();
    return t && !/^job$/i.test(t) ? t.slice(0, 28) : 'Other work';
  }
  function miniW(title, val, sub, go, o) {
    o = o || {};
    return W(go, '<div class="bpx-panel hl-mini" onclick="bpNav(\'' + go + '\')"><div class="hl-wh">' + title + '</div>'
      + '<div class="hl-mv' + (o.tone ? ' ' + o.tone : '') + '">' + val + '</div><div class="hl-ms">' + (o.delta || '') + '<span>' + sub + '</span></div>'
      + (o.chart || '') + '</div>');
  }
  function stats(M) {
    var jobs = M.jobs, now = Date.now(), day = 864e5, S = {};
    var bk = function (rows, get, val) { return bpChart.byBuckets(rows, P.buckets, get, val).values; };
    var won = jobs.filter(function (j) { return j.wonAt; }), Jw = function (j) { return +j.wonAt; }, Jd = function (j) { return +j.doneAt; };
    var done = jobs.filter(function (j) { return j.status === 'done' && j.doneAt; });
    var inCur = function (rows, get) { return rows.filter(function (r) { return inP(get(r), P.start, P.end); }); };
    var inPrev = function (rows, get) { return rows.filter(function (r) { return inP(get(r), P.pStart, P.pEnd); }); };
    var est = function (j) { return +j.estimate || 0; };
    /* average job size: what the projects won this period were priced at */
    var wc = inCur(won, Jw), wp = inPrev(won, Jw);
    S.avgJob = { cur: avg(wc.map(est)), prev: avg(wp.map(est)), n: wc.length };
    var wonV = bk(won, Jw, est), wonN = bk(won, Jw, function () { return 1; });
    S.avgJob.spark = wonV.map(function (v, i) { return wonN[i] ? v / wonN[i] : 0; });
    /* finished: count, revenue, margin, cycle time */
    var dc = inCur(done, Jd), dp = inPrev(done, Jd);
    S.done = { cur: dc.length, prev: dp.length, spark: bk(done, Jd, function () { return 1; }), val: dc.reduce(function (t, j) { return t + (+j.collected || 0); }, 0) };
    var coll = dc.reduce(function (t, j) { return t + (+j.collected || 0); }, 0), cost = dc.reduce(function (t, j) { return t + jobCost(j); }, 0);
    S.margin = { kept: coll - cost, coll: coll };
    var cyc = function (rows) { return avg(rows.filter(function (j) { return j.wonAt && +j.doneAt > +j.wonAt; }).map(function (j) { return (+j.doneAt - +j.wonAt) / day; })); };
    S.cycle = { cur: Math.round(cyc(dc)), prev: Math.round(cyc(dp)), n: dc.filter(function (j) { return j.wonAt; }).length };
    S.revPer = { cur: dc.length ? coll / dc.length : 0, prev: dp.length ? dp.reduce(function (t, j) { return t + (+j.collected || 0); }, 0) / dp.length : 0 };
    /* win rate: won this period against everything quoted (won plus still out) */
    var out = D.deals ? +D.deals.n || 0 : 0;
    S.win = { won: wc.length, quoted: wc.length + out };
    /* active and owed, with how long it has been owed */
    var act = jobs.filter(function (j) { return j.status === 'active'; });
    S.active = { n: act.length, v: act.reduce(function (t, j) { return t + est(j); }, 0) };
    var age = [['Under 30 days', 0], ['30–60 days', 0], ['Over 60 days', 0]], owed = 0;
    act.forEach(function (j) {
      var o = Math.max(est(j) - (+j.collected || 0), 0); if (!o) return; owed += o;
      var d = j.wonAt ? (now - +j.wonAt) / day : 0; age[d > 60 ? 2 : d > 30 ? 1 : 0][1] += o;
    });
    S.owed = { v: owed, age: age };
    /* billed against collected, on every job running or finished this period */
    var billed = act.concat(dc);
    S.billed = { got: billed.reduce(function (t, j) { return t + (+j.collected || 0); }, 0), of: billed.reduce(function (t, j) { return t + est(j); }, 0) };
    /* where the costs go, as a share of what came in */
    var expC = M.fin.exp.filter(function (x) { return inP(x.when, P.start, P.end); });
    var share = function (re) { return expC.filter(function (x) { return re.test(x.type || x.cat || ''); }).reduce(function (t, x) { return t + x.amt; }, 0); };
    S.mat = share(/material|suppl/i); S.lab = share(/labou?r|crew|payroll|wage/i);
    var spk = function (re) { return bk(M.fin.exp.filter(function (x) { return re.test(x.type || x.cat || ''); }), function (x) { return x.when; }, function (x) { return x.amt; }); };
    S.matSpark = spk(/material|suppl/i); S.labSpark = spk(/labou?r|crew|payroll|wage/i);
    /* repeat customers: a name on more than one project */
    var by = {}; jobs.forEach(function (j) { var k = String(j.name || '').trim().toLowerCase(); if (k) by[k] = (by[k] || 0) + 1; });
    var names = Object.keys(by); S.repeat = { n: names.filter(function (k) { return by[k] > 1; }).length, of: names.length };
    /* revenue by kind of work, on jobs won or finished this period */
    var kinds = {}; jobs.forEach(function (j) {
      var v = j.status === 'done' && inP(j.doneAt, P.start, P.end) ? +j.collected || 0 : (j.status === 'active' && inP(j.wonAt, P.start, P.end) ? est(j) : 0);
      if (v > 0) { var k = jobKind(j); kinds[k] = (kinds[k] || 0) + v; }
    });
    S.kinds = Object.keys(kinds).map(function (k) { return { label: k, value: kinds[k] }; });
    /* appointments ahead */
    var ahead = (D.events || []).filter(function (e) { var t = Date.parse(e.start); return !isNaN(t) && t >= new Date().setHours(0, 0, 0, 0) && t < now + 7 * day; });
    S.appts = { n: ahead.length, next: ahead.sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); })[0] };
    /* permits still open, and the ones running out */
    var permits = []; jobs.forEach(function (j) { (j.permits || []).forEach(function (p) { permits.push(p); }); });
    var open = permits.filter(function (p) { return p.status !== 'Closed' && p.status !== 'Passed'; });
    var soon = open.filter(function (p) { if (!p.expires) return false; var t = Date.parse(p.expires + 'T12:00:00'); return !isNaN(t) && (t - now) / day <= 14; });
    S.permits = { n: open.length, soon: soon.length, all: permits.length };
    /* installed work due for service in the next 30 days, or late */
    var ins = jobs.filter(function (j) { return j.install && j.install.date; }), due = 0, late = 0;
    ins.forEach(function (j) { var n = window.bpInstallNext ? bpInstallNext(j.install) : null; if (!n) return; var left = (n - now) / day; if (left < 0) late++; else if (left <= 30) due++; });
    S.installs = { n: due + late, late: late, all: ins.length };
    /* best stretch: the strongest bucket of the period by what was kept */
    var bi = -1; M.net.forEach(function (v, i) { if (bi < 0 || v > M.net[bi]) bi = i; });
    S.best = { label: bi >= 0 ? M.labels[bi] : '', v: bi >= 0 ? M.net[bi] : 0, any: M.net.some(function (v) { return v; }) };
    /* running balance across the period */
    var run = 0; S.balance = M.net.map(function (v) { run += v; return run; });
    return S;
  }
  function moreWidgets(M) {
    var S = stats(M), dl = function (p, c, up) { return bpChart.delta(p, c, { upIsGood: up, vs: P.vs }); };
    var sp = function (v, fmt) { return bpChart.spark(v, { fmt: fmt || money, labels: M.labels }); };
    var cnt = function (w) { return function (v) { return Math.round(v) + ' ' + w + (Math.round(v) === 1 ? '' : 's'); }; };
    var share = function (v) { return M.cur.inc > 0 ? pct(v, M.cur.inc) + '%' : '—'; };
    var mini = {
      avgJob: miniW('Average job size', S.avgJob.n ? money(S.avgJob.cur) : '—', S.avgJob.n ? S.avgJob.n + ' won ' + P.word : 'nothing won ' + P.word, 'activejobs',
        { delta: S.avgJob.n ? dl(S.avgJob.prev, S.avgJob.cur) : '', chart: sp(S.avgJob.spark) }),
      done: miniW('Jobs completed', String(S.done.cur), money(S.done.val) + ' collected', 'activejobs', { delta: dl(S.done.prev, S.done.cur), chart: sp(S.done.spark, cnt('job')) }),
      cycle: miniW('Won to done', S.cycle.n ? S.cycle.cur + '<small> days</small>' : '—', S.cycle.n ? 'average, ' + S.cycle.n + ' finished ' + P.word : 'no finished jobs ' + P.word, 'activejobs',
        { delta: S.cycle.n ? dl(S.cycle.prev, S.cycle.cur, false) : '' }),
      revPer: miniW('Revenue per project', S.done.cur ? money(S.revPer.cur) : '—', 'finished ' + P.word, 'finances', { delta: S.done.cur ? dl(S.revPer.prev, S.revPer.cur) : '' }),
      repeat: miniW('Repeat customers', String(S.repeat.n), S.repeat.of ? pct(S.repeat.n, S.repeat.of) + '% of ' + S.repeat.of + ' customers' : 'no customers yet', 'contacts'),
      mat: miniW('Materials', share(S.mat), money(S.mat) + ' of revenue ' + P.word, 'finances', { chart: sp(S.matSpark) }),
      lab: miniW('Labor', share(S.lab), money(S.lab) + ' of revenue ' + P.word, 'finances', { chart: sp(S.labSpark) }),
      permits: miniW('Open permits', String(S.permits.n), S.permits.all ? (S.permits.soon ? S.permits.soon + ' expiring within 14 days' : 'none expiring soon') : 'no permits on projects yet', 'activejobs',
        { tone: S.permits.soon ? 'warn' : '' }),
      installs: miniW('Maintenance due', String(S.installs.n), S.installs.all ? (S.installs.late ? S.installs.late + ' overdue, ' : '') + 'next 30 days' : 'no installations signed off yet', 'installations',
        { tone: S.installs.late ? 'warn' : '' }),
      appts: miniW('Next 7 days', String(S.appts.n), S.appts.next ? 'appointments · next: ' + esc(S.appts.next.name || '') : 'appointments booked', 'calendar'),
      best: miniW('Best ' + (P.k === 'month' ? 'week' : 'month'), S.best.any ? money(S.best.v) : '—', S.best.any ? esc(S.best.label) + ' · kept, ' + P.word : 'nothing kept ' + P.word, 'finances',
        { tone: S.best.v < 0 ? 'neg' : '' })
    };
    var gauge = function (title, v, of, fmt, note, go, tone) {
      return W(go, '<div class="bpx-panel hl-gauge">' + bpChart.gauge({ title: title, value: v, target: of, fmt: fmt, note: note, tone: tone }) + '</div>');
    };
    var countF = function (v) { return String(Math.round(v)); };
    var margin = S.margin.coll > 0
      ? gauge('Gross margin', Math.max(S.margin.kept, 0), S.margin.coll, money, 'kept on jobs finished ' + P.word, 'finances', S.margin.kept / S.margin.coll < 0.2 ? 'warn' : '')
      : W('finances', '<div class="bpx-panel">' + bpChart.empty({ title: 'Gross margin', empty: 'Finish a job ' + P.word + ' with its costs and the share you kept shows here.' }) + '</div>');
    var win = S.win.quoted > 0
      ? gauge('Win rate', S.win.won, S.win.quoted, countF, 'won of quoted ' + P.word, 'closedeals')
      : W('closedeals', '<div class="bpx-panel">' + bpChart.empty({ title: 'Win rate', empty: 'Send an estimate and the share you win shows here.' }) + '</div>');
    var billed = S.billed.of > 0
      ? W('finances', '<div class="bpx-panel hl-gauge">' + bpChart.gauge({ title: 'Collected vs billed', value: S.billed.got, target: S.billed.of, fmt: money, note: 'on running jobs and jobs finished ' + P.word }) + '</div>')
      : W('finances', '<div class="bpx-panel">' + bpChart.empty({ title: 'Collected vs billed', empty: 'Win a project and what you have been paid against its price shows here.' }) + '</div>');
    var owed = W('finances', '<div class="bpx-panel hl-mini"><div class="hl-wh">Owed to you</div><div class="hl-mv">' + money(S.owed.v) + '</div><div class="hl-ms"><span>on ' + S.active.n + ' active project' + (S.active.n === 1 ? '' : 's') + ', by age</span></div>'
      + (S.owed.v > 0 ? bpChart.ranked({ rows: S.owed.age.map(function (a) { return { label: a[0], value: a[1] }; }), fixed: true, fmt: money, ramp: ['var(--bpc-s1)', 'var(--bpc-warn)', 'var(--bpc-neg2)'], axis: 'Age' }) : '') + '</div>');
    var kinds = W('activejobs', '<div class="bpx-panel">' + (S.kinds.length
      ? bpChart.ranked({ title: 'Top kinds of work', lead: 'by revenue, ' + P.word, rows: S.kinds, fmt: money, max: 5, axis: 'Kind of work' })
      : bpChart.empty({ title: 'Top kinds of work', empty: 'Win or finish a project ' + P.word + ' and the kinds of work that pay most rank here.' })) + '</div>');
    var bal = W('finances', '<div class="bpx-panel">' + (S.best.any
      ? bpChart.line({ title: 'Running balance', lead: 'income less costs, added up ' + P.by + ' · ' + P.word, x: { label: P.axis, values: M.labels }, series: [{ name: 'Balance', values: S.balance }], fmt: money, height: 190 })
      : bpChart.empty({ title: 'Running balance', empty: 'Once money moves ' + P.word + ', the running total shows here.' })) + '</div>');
    return { mini: mini, margin: margin, win: win, billed: billed, owed: owed, kinds: kinds, bal: bal, active: S.active };
  }
  function widgets(M) {
    var jobs = M.jobs, act = jobs.filter(function (j) { return j.status === 'active'; }), C = M.cur;
    var owed = act.reduce(function (t, j) { return t + Math.max((+j.estimate || 0) - (+j.collected || 0), 0); }, 0);
    var inMotion = act.reduce(function (t, j) { return t + (+j.estimate || 0); }, 0);
    var dl = function (k, up) { return bpChart.delta(M.prev[k], C[k], { upIsGood: up, vs: P.vs }); };
    var g = function (list) { return '<div class="hl-grid">' + list.map(function (c) { return '<div class="hl-c' + c[0] + '">' + c[1] + '</div>'; }).join('') + '</div>'; };
    var stack = function (a, b) { return '<div class="hl-stack">' + a + b + '</div>'; };
    var st = sparkTiles(M), gos = ['finances', 'finances', 'activejobs', 'finances'];
    var X = moreWidgets(M), m = X.mini;
    return g([
      [3, W(gos[0], st[0], 'hl-spk')], [3, W(gos[1], st[1], 'hl-spk')], [3, W(gos[2], st[2], 'hl-spk')], [3, W(gos[3], st[3], 'hl-spk')],
      [3, kpiW('New leads', D.leads ? D.leads.n : '&middot;', 'this month', D.leads ? 'contacts' : 'marketing')],
      [3, kpiW('Appointments', D.leads ? D.leads.a : '&middot;', 'this month', 'calendar')],
      [3, kpiW('Active projects', String(X.active.n), money(X.active.v) + ' in progress', 'activejobs')],
      [3, kpiW('Waiting on a yes', D.deals ? String(D.deals.n) : '&middot;', D.deals && D.deals.v ? money(D.deals.v) + ' quoted' : 'estimates out', 'closedeals')],
      [8, W('finances', flow())],
      [4, W('activejobs', pipeline())],
      [3, m.avgJob], [3, m.revPer], [3, m.done], [3, m.cycle],
      [4, X.margin], [4, X.win], [4, X.billed],
      [3, m.mat], [3, m.lab], [3, m.best], [3, m.repeat],
      [8, X.bal], [4, X.kinds],
      [4, X.owed], [4, W('finances', spendDonut(M))], [4, W('activejobs', wonCols(M))],
      [4, m.permits], [4, m.installs], [4, m.appts],
      [12, projects(false)],
      [8, W('finances', jobsChart())],
      [4, W('activejobs', collection(M))],
      [4, W('dashboard', attention())],
      [4, W('calendar', week())],
      [4, W('dashboard', activity())]
    ]);
  }
  D.kebab = function (btn, go) {
    if (!window.bpShell) { bpNav(go); return; }
    var name = (window.BPVIEWS && BPVIEWS[go] && BPVIEWS[go].t) || 'page';
    bpShell.menu(btn, [
      { t: 'Open ' + name, fn: function () { bpNav(go); } },
      { t: 'Refresh', fn: function () { window.bpDashboard(); } },
      { t: 'Change layout', fn: function () { bpNav('settings'); } }
    ], { align: 'right' });
  };

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
    P = periodOf(periodKey());
    var M = monthly(), st = sparkTiles(M), per = periodSwitch(P.k);
    if (lay === 'command') {
      return per + '<div class="db-split"><div class="db-main">'
        + cells([[12, flow()], [6, pipeline()], [6, spendDonut(M)], [12, jobsChart()], [12, projects(crew)]])
        + '</div><div class="db-rail">' + kpis() + attention() + week() + activity() + '</div></div>';
    }
    if (lay === 'projects') {
      return cells([[12, projects(crew)], [5, collection(M)], [7, week()]])
        + per + '<div class="db-row4">' + st.join('') + '</div>'
        + cells([[6, flow()], [6, netLine(M)], [4, pipeline()], [4, spend()], [4, attention()], [12, activity()]]);
    }
    return widgets(M);
  }

  /* ---------- example data, so the page can be seen before anyone signs in ---------- */
  function hasOwnData() {
    var j = (window.bpJobsGet && bpJobsGet()) || [], f = (window.bpFinData && bpFinData()) || {};
    return j.length > 0 || (f.inc && f.inc.length) || (f.exp && f.exp.length);
  }
  function demoShim(force) {
    if (live() && !force) return null;
    var now = Date.now(), day = 864e5, iso = function (d) { return new Date(now + d * day).toISOString().slice(0, 10); };
    var jobs = [
      { id: 'd1', name: 'Mike Johnson', title: 'Full re-roof, architectural', estimate: 18400, collected: 9200, status: 'active', wonAt: now - 12 * day, sched: { dates: [iso(0), iso(1)], time: '7:00 AM' }, expenses: [] },
      { id: 'd2', name: 'Sarah Malik', title: 'Storm repair and gutters', estimate: 7600, collected: 0, status: 'active', wonAt: now - 5 * day, sched: { dates: [iso(3)] }, expenses: [] },
      { id: 'd3', name: 'Carlos Rivera', title: 'Leak repair', estimate: 2100, collected: 1050, status: 'active', wonAt: now - 3 * day, sched: { dates: [iso(5)] }, expenses: [] },
    ];
    jobs[0].permits = [{ id: 'p1', status: 'Approved', expires: iso(9) }];
    jobs[1].permits = [{ id: 'p2', status: 'Applied' }];
    var done = [['Dana Meyers', 14200, 8900, 'Re-roof'], ['Jessica Tran', 21600, 13100, 'Re-roof'], ['Ethan Wells', 6400, 3900, 'Gutters'], ['Nina Patel', 9800, 6700, 'Siding repair'], ['Omar Haddad', 4300, 2600, 'Leak repair'], ['Mike Johnson', 3200, 1900, 'Gutters']];
    done.forEach(function (d, i) { jobs.push({ id: 'x' + i, name: d[0], title: d[3], estimate: d[1], collected: d[1], status: 'done', wonAt: now - (40 + i * 30) * day, doneAt: now - (20 + i * 31) * day,
      install: i < 3 ? { date: now - (20 + i * 31) * day, period: i + 1, item: d[3] } : undefined,
      expenses: [{ cat: 'Materials', amt: Math.round(d[2] * .6) }, { cat: 'Labor / crew', amt: Math.round(d[2] * .32) }, { cat: 'Permits', amt: Math.round(d[2] * .08) }] }); });
    var inc = [], exp = [];
    jobs.forEach(function (j) {
      if (j.collected) inc.push({ amt: j.collected, when: j.doneAt || now, type: 'Job' });
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
    var sample = live() && !hasOwnData();
    var cl = crew ? '' : checklist();   /* the setup steps always read the account's real state */
    var undo = demoShim(sample);
    try {
      el.innerHTML = (sample ? '<div class="sp-note warn"><span class="ms">science</span>Example numbers, so you can see how it looks. Add a project or log money and this switches to your own.</div>'
        : live() ? '' : '<div class="sp-note warn"><span class="ms">science</span>Example numbers. Sign in and this shows your own.</div>')
        + topline()
        + (crew || !window.bpCeoDashCard ? '' : bpCeoDashCard(D.ceo))   /* the AI CEO's morning briefing (portal/aiceo.js) */
        + cl
        + (crew
          ? projects(crew) + '<div style="margin-top:16px">' + week() + '</div>'
          : body(layoutOf(), crew));   /* the layout is chosen under Settings > Appearance */
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
    if (D.ceo === undefined && !(window.bpTeamIsCrew && bpTeamIsCrew()) && window.bpCeoDashCard) jobs.push(BP_SB.from('ceo_reports').select('id,day,kind,source,stats,created_at').order('created_at', { ascending: false }).limit(1).then(function (r) { D.ceo = (r && r.data && r.data[0]) || null; }).catch(function () { D.ceo = null; }));
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
