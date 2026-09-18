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
  var D = window.BPDASH = { brain: undefined, calc: undefined, appts: undefined, supply: undefined, leads: undefined };

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
    if (pct === 100) return '<div class="dash-done"><span class="ms">verified</span><b>Set up. Everything is in place.</b><button class="bpx-linkbtn" onclick="BPDASH.hide()">Hide this</button></div>';
    var next = list.filter(function (x) { return x.done === false; })[0];
    return '<div class="bpx-panel dash-setup">'
      + '<div class="dash-setup-h"><div><b>Getting set up</b><span class="bpx-mut">' + done + ' of ' + list.length + ' done' + (next ? ' &middot; next: ' + esc(next.t) : '') + '</span></div><div class="dash-pct">' + pct + '%</div></div>'
      + '<div class="dash-bar"><i style="width:' + pct + '%"></i></div>'
      + '<div class="dash-steps">' + list.map(function (x) {
        var st = x.done === null ? 'wait' : x.done ? 'ok' : 'todo';
        return '<div class="dash-step ' + st + '" onclick="bpNav(\'' + x.go + '\')">'
          + '<span class="dash-tick"><span class="ms">' + (st === 'ok' ? 'check' : st === 'wait' ? 'more_horiz' : '') + '</span></span>'
          + '<div><b>' + esc(x.t) + '</b><small>' + esc(x.s) + '</small></div>'
          + (st === 'todo' ? '<span class="dash-go">Do it <span class="ms">arrow_forward</span></span>' : '')
          + '</div>';
      }).join('') + '</div></div>';
  }
  D.hide = function () { try { localStorage.setItem('bpSetupHidden', '1'); } catch (e) {} window.bpDashboard(); };

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

  /* ---------- charts: two series, validated in both modes ---------- */
  function moneyChart() {
    var fin; try { fin = bpFinData(); } catch (e) { return ''; }
    var now = new Date(), keys = [], labels = [];
    for (var i = 5; i >= 0; i--) { var dt = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push(dt.getFullYear() + '-' + dt.getMonth()); labels.push(dt.toLocaleDateString('en-US', { month: 'short' })); }
    var inM = {}, outM = {};
    fin.inc.forEach(function (x) { if (x.when) { var k = monthKey(x.when); inM[k] = (inM[k] || 0) + x.amt; } });
    fin.exp.forEach(function (x) { if (x.when) { var k = monthKey(x.when); outM[k] = (outM[k] || 0) + x.amt; } });
    var iv = keys.map(function (k) { return inM[k] || 0; }), ov = keys.map(function (k) { return outM[k] || 0; });
    var has = iv.some(Boolean) || ov.some(Boolean);
    if (!has) return '<div class="bpx-panel"><div class="bpx-ptitle">Money in and out<span class="lg2">last 6 months</span></div><div class="dash-empty">Nothing logged yet. Collect on a job, or photograph a supply bill, and it lands here.</div></div>';
    var W = 620, H = 200, padL = 8, padR = 8, top = 22, base = H - 26, max = Math.max.apply(null, iv.concat(ov).concat([1]));
    var gw = (W - padL - padR) / 6, bw = Math.min(26, gw * 0.3), gap = 2;
    var y = function (v) { return base - (v / max) * (base - top); };
    var svg = '';
    for (var g = 1; g <= 3; g++) { var gy = top + (base - top) * g / 4; svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '" class="dash-grid"/>'; }
    svg += '<line x1="' + padL + '" y1="' + base + '" x2="' + (W - padR) + '" y2="' + base + '" class="dash-axis"/>';
    var bar = function (x, v, cls, title) { var h = Math.max(0, base - y(v)); if (!v) return ''; return '<path class="' + cls + '" d="M' + x + ' ' + base + ' v-' + Math.max(0, h - 4) + ' a4 4 0 0 1 4 -4 h' + (bw - 8) + ' a4 4 0 0 1 4 4 v' + Math.max(0, h - 4) + ' z"><title>' + title + '</title></path>'; };
    for (var m = 0; m < 6; m++) {
      var cx = padL + gw * m + gw / 2;
      svg += bar(cx - bw - gap / 2, iv[m], 'dash-in', labels[m] + ' in: ' + money(iv[m]));
      svg += bar(cx + gap / 2, ov[m], 'dash-out', labels[m] + ' out: ' + money(ov[m]));
      /* direct label on the latest month only */
      if (m === 5) {
        if (iv[m]) svg += '<text x="' + (cx - gap / 2 - bw / 2) + '" y="' + (y(iv[m]) - 6) + '" class="dash-lbl" text-anchor="middle">' + money(iv[m]) + '</text>';
        if (ov[m]) svg += '<text x="' + (cx + gap / 2 + bw / 2) + '" y="' + (y(ov[m]) - 6) + '" class="dash-lbl" text-anchor="middle">' + money(ov[m]) + '</text>';
      }
      svg += '<text x="' + cx + '" y="' + (H - 8) + '" class="dash-ax" text-anchor="middle">' + labels[m] + '</text>';
    }
    var net = iv.reduce(function (t, v) { return t + v; }, 0) - ov.reduce(function (t, v) { return t + v; }, 0);
    return '<div class="bpx-panel"><div class="bpx-ptitle">Money in and out<span class="lg2">last 6 months &middot; ' + (net >= 0 ? money(net) + ' kept' : money(-net) + ' down') + '</span></div>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" class="dash-chart" role="img" aria-label="Money in and out by month">' + svg + '</svg>'
      + '<div class="dash-legend"><span><i class="dash-in"></i>In</span><span><i class="dash-out"></i>Out</span></div></div>';
  }
  function jobsChart() {
    var jobs = (window.bpJobsGet && bpJobsGet()) || [];
    var done = jobs.filter(function (j) { return j.status === 'done' && j.collected != null; }).map(function (j) {
      var c = +j.collected || 0, e = (j.expenses || []).reduce(function (t, x) { return t + (+x.amt || 0); }, 0);
      return { n: j.name, c: c, p: c - e, m: c > 0 ? Math.round((c - e) / c * 100) : 0 };
    }).sort(function (a, b) { return b.p - a.p; }).slice(0, 6);
    if (!done.length) return '<div class="bpx-panel"><div class="bpx-ptitle">Profit by job<span class="lg2">finished projects</span></div><div class="dash-empty">Mark a project done and put in what you collected. Each one shows here with its margin.</div></div>';
    var max = Math.max.apply(null, done.map(function (d) { return Math.abs(d.p); }).concat([1]));
    return '<div class="bpx-panel"><div class="bpx-ptitle">Profit by job<span class="lg2">finished projects, best first</span></div><div class="dash-jobs">'
      + done.map(function (d) {
        return '<div class="dash-job"><span class="n">' + esc(d.n) + '</span><span class="b"><i class="' + (d.p < 0 ? 'neg' : '') + '" style="width:' + Math.max(3, Math.round(Math.abs(d.p) / max * 100)) + '%"></i></span><span class="v bpx-num">' + money(d.p) + '<small>' + d.m + '%</small></span></div>';
      }).join('') + '</div></div>';
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

  /* ---------- the page ---------- */
  window.bpDashboard = function () {
    var el = $('bpxViewArea'); if (!el) return;
    var crew = !!(window.bpTeamIsCrew && bpTeamIsCrew());
    el.innerHTML = (live() ? '' : '<div class="sp-note warn"><span class="ms">science</span>Example numbers. Sign in and this shows your own.</div>')
      + (crew ? '' : checklist())
      + (crew ? '' : numbers())
      + (crew ? '<div style="margin-top:16px">' + today() + '</div>' : '<div class="dash-two">' + moneyChart() + today() + '</div>')
      + '<div class="bpx-panel" style="margin-top:16px"><div class="bpx-ptitle">Projects in motion<span class="lg2">tap one to open it</span></div><div id="bpxProjCard" class="bpx-mut" style="font-size:13.5px">Loading</div></div>'
      + (crew ? '' : '<div style="margin-top:16px">' + jobsChart() + '</div>')
      + (D.leads ? '<div class="bpx-stats dash-nums" style="margin-top:16px"><div class="bpx-stat"><div class="lbl">New leads this month</div><div class="val">' + D.leads.n + '</div><div class="note">from your website and phone line</div></div><div class="bpx-stat"><div class="lbl">Appointments this month</div><div class="val">' + D.leads.a + '</div><div class="note">booked through ' + (window.BP_AI_NAME || 'Lisa') + ' and your booking page</div></div></div>' : '');
    if (window.bpDashProjects) bpDashProjects();
    fetchState();
  };

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
    if (D.appts === undefined && window.GHL_CAL_URL) jobs.push(window.bpApi(window.GHL_CAL_URL, { action: 'list', cal: 'inspection' }).then(function (d) {
      var iso = new Date().toISOString().slice(0, 10);
      D.appts = ((d && (d.appointments || d.events)) || []).filter(function (a) { return String(a.start || a.startTime || a.date || '').slice(0, 10) === iso; })
        .map(function (a) { var t = a.start || a.startTime; return { time: t ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '', name: a.contact || a.contactName || a.title || a.name || 'Appointment', what: a.title || a.calendar || 'Inspection' }; });
    }).catch(function () { D.appts = null; }));
    if (D.leads === undefined && window.GHL_DASH_URL) jobs.push(window.bpApi(window.GHL_DASH_URL, {}).then(function (d) {
      D.leads = (d && d.newLeadsMonth != null) ? { n: Number(d.newLeadsMonth).toLocaleString(), a: d.appointmentsBookedMonth != null ? Number(d.appointmentsBookedMonth).toLocaleString() : '&middot;' } : null;
    }).catch(function () { D.leads = null; }));
    /* nothing left to fetch: stop here, or the re-render would fetch again forever */
    if (!jobs.length) { fetching = false; return; }
    Promise.all(jobs).then(function () { fetching = false; again(); }, function () { fetching = false; again(); });
  }
})();
