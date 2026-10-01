/* ==================================================================
   Finances > Archive: one folder per business year.

   Most US small businesses (sole proprietors, LLCs, S-corps) file on the
   calendar year, so a business year runs January to December unless the
   owner says otherwise. Anyone on a different fiscal year sets the month
   it starts in (bpSettings.fiscalStart, 1-12) and every folder re-cuts.

   A year opens to its profit and loss, twelve months of money in against
   money out, the months themselves (tick some to export just those), and
   the jobs finished in it. Exports are plain CSV for the accountant, and a
   clean printable P&L that the browser saves as a PDF.
   ================================================================== */
(function () {
  'use strict';
  var esc = window.bpEsc || function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var money = function (n) { n = Math.round(+n || 0); return (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString(); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var A = window.BP_ARC = { fy: null, sel: {} };

  function fs() { var v = +(((window.bpSettingsGet && bpSettingsGet()) || {}).fiscalStart) || 1; return v >= 1 && v <= 12 ? v - 1 : 0; }
  /* the year a business year is named for: the calendar year for Jan-Dec,
     otherwise the year it ends in (FY 2026 = Apr 2025 to Mar 2026) */
  function fyOf(t) { var d = new Date(t), f = fs(); return d.getMonth() >= f ? d.getFullYear() : d.getFullYear() - 1; }
  function range(y) { var f = fs(); return { start: new Date(y, f, 1).getTime(), end: new Date(y, f + 12, 1).getTime() }; }
  function name(y) { return fs() === 0 ? String(y) : 'FY ' + (y + 1); }
  function span(y) {
    var f = fs(), a = new Date(y, f, 1), b = new Date(y, f + 11, 1);
    var o = { month: 'short', year: 'numeric' };
    return a.toLocaleDateString('en-US', o) + ' – ' + b.toLocaleDateString('en-US', o);
  }
  function months(y) {
    var f = fs(), out = [];
    for (var i = 0; i < 12; i++) {
      var d = new Date(y, f + i, 1);
      out.push({ i: i, start: d.getTime(), end: new Date(y, f + i + 1, 1).getTime(), label: d.toLocaleDateString('en-US', { month: 'short' }), long: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
    }
    return out;
  }
  function data() {
    var fin; try { fin = bpFinData(); } catch (e) { fin = { inc: [], exp: [], jobs: [] }; }
    var jobs = fin.jobs || ((window.bpJobsGet && bpJobsGet()) || []);
    var tx = fin.inc.map(function (x) { return { w: +x.when || 0, dir: 'Income', cat: x.type === 'Job' ? 'Job payments' : x.type === 'Manual' ? 'Other income' : (x.type || 'Income'), desc: x.name || '', job: x.job || '', amt: +x.amt || 0 }; })
      .concat(fin.exp.map(function (x) { return { w: +x.when || 0, dir: 'Expense', cat: x.type || 'Other', desc: x.name || '', job: x.job || '', amt: +x.amt || 0 }; }))
      .filter(function (x) { return x.w > 0; });
    var done = jobs.filter(function (j) { return j.status === 'done' && +j.doneAt; });
    return { tx: tx, done: done };
  }
  function sumUp(D, a, b) {
    var t = D.tx.filter(function (x) { return x.w >= a && x.w < b; });
    var inc = 0, out = 0, byInc = {}, byExp = {};
    t.forEach(function (x) {
      if (x.dir === 'Income') { inc += x.amt; byInc[x.cat] = (byInc[x.cat] || 0) + x.amt; }
      else { out += x.amt; byExp[x.cat] = (byExp[x.cat] || 0) + x.amt; }
    });
    var jobs = D.done.filter(function (j) { return +j.doneAt >= a && +j.doneAt < b; });
    return { tx: t, inc: inc, out: out, net: inc - out, margin: inc > 0 ? Math.round((inc - out) / inc * 100) : null, byInc: byInc, byExp: byExp, jobs: jobs };
  }
  function years(D) {
    var ys = {};
    D.tx.forEach(function (x) { ys[fyOf(x.w)] = 1; });
    D.done.forEach(function (j) { ys[fyOf(+j.doneAt)] = 1; });
    return Object.keys(ys).map(Number).sort(function (a, b) { return b - a; });
  }
  function jobCost(j) { return (j.expenses || []).reduce(function (t, e) { return t + (+e.amt || 0); }, 0); }
  function area() { return document.getElementById('bpxViewArea'); }
  function scopeOf(y) {
    var ms = months(y), picked = ms.filter(function (m) { return A.sel[m.i]; });
    return { ms: ms, picked: picked };
  }

  /* ---------- the folders ---------- */
  function list() {
    var D = data(), ys = years(D), cur = fyOf(Date.now()), f = fs();
    var opts = MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i === f ? ' selected' : '') + '>' + m + '</option>'; }).join('');
    var head = '<div class="bpx-panel arc-set"><div class="arc-set-t"><b>Business year starts in</b>'
      + '<span class="bpx-mut">Most US small businesses file on the calendar year, January to December. Change this only if your accountant set up a different fiscal year.</span></div>'
      + '<select id="arcFs" class="arc-sel" aria-label="Business year starts in" onchange="BP_ARC.setStart(this.value)">' + opts + '</select></div>';
    if (!ys.length) {
      return head + '<div class="bpx-panel"><div class="bpx-empty2">Nothing filed yet. Mark a job done with what you collected, or log income and expenses, and each business year gets its own folder here.</div></div>';
    }
    return head + '<div class="arc-grid">' + ys.map(function (y) {
      var r = range(y), S = sumUp(D, r.start, r.end), live = y === cur;
      return '<button class="arc-card" onclick="BP_ARC.open(' + y + ')">'
        + '<div class="arc-card-h"><span class="arc-fold"><span class="ms">' + (live ? 'folder_open' : 'folder') + '</span></span>'
        + '<span class="arc-card-n"><b>' + esc(name(y)) + '</b><small>' + esc(span(y)) + '</small></span>'
        + (live ? '<span class="arc-badge">In progress</span>' : '<span class="arc-badge done">Closed</span>') + '</div>'
        + '<div class="arc-card-k">'
        + '<span><small>Income</small><b>' + money(S.inc) + '</b></span>'
        + '<span><small>Costs</small><b>' + money(S.out) + '</b></span>'
        + '<span><small>' + (S.net < 0 ? 'Loss' : 'Profit') + '</small><b class="' + (S.net < 0 ? 'neg' : 'pos') + '">' + money(S.net) + '</b></span>'
        + '<span><small>Margin</small><b>' + (S.margin == null ? '—' : S.margin + '%') + '</b></span></div>'
        + '<div class="arc-card-f">' + S.jobs.length + (S.jobs.length === 1 ? ' job' : ' jobs') + ' finished · ' + S.tx.length + ' entries<span class="ms">chevron_right</span></div>'
        + '</button>';
    }).join('') + '</div>';
  }

  /* ---------- one year ---------- */
  function plRows(S) {
    var inc = Object.keys(S.byInc).sort(function (a, b) { return S.byInc[b] - S.byInc[a]; });
    var exp = Object.keys(S.byExp).sort(function (a, b) { return S.byExp[b] - S.byExp[a]; });
    return { inc: inc, exp: exp };
  }
  function plTable(S) {
    var R = plRows(S);
    var row = function (l, v, cls) { return '<tr class="' + (cls || '') + '"><td>' + esc(l) + '</td><td class="bpx-r bpx-num">' + money(v) + '</td></tr>'; };
    return '<table class="bpx-ctable arc-pl"><tbody>'
      + '<tr class="sec"><th colspan="2">Income</th></tr>'
      + (R.inc.length ? R.inc.map(function (c) { return row(c, S.byInc[c]); }).join('') : '<tr><td colspan="2" class="bpx-mut">No income logged</td></tr>')
      + row('Total income', S.inc, 'tot')
      + '<tr class="sec"><th colspan="2">Expenses</th></tr>'
      + (R.exp.length ? R.exp.map(function (c) { return row(c, S.byExp[c]); }).join('') : '<tr><td colspan="2" class="bpx-mut">No expenses logged</td></tr>')
      + row('Total expenses', S.out, 'tot')
      + '<tr class="net ' + (S.net < 0 ? 'neg' : 'pos') + '"><td>Net ' + (S.net < 0 ? 'loss' : 'profit') + (S.margin == null ? '' : ' · ' + S.margin + '% margin') + '</td><td class="bpx-r bpx-num">' + money(S.net) + '</td></tr>'
      + '</tbody></table>';
  }
  function detail(y) {
    var D = data(), r = range(y), S = sumUp(D, r.start, r.end), ms = months(y), now = Date.now(), cur = fyOf(now) === y;
    var per = ms.map(function (m) { var s = sumUp(D, m.start, m.end); s.m = m; return s; });
    var nSel = ms.filter(function (m) { return A.sel[m.i]; }).length;
    var allOn = nSel === 12;
    var stat = function (l, v, n, cls) { return '<div class="bpx-stat"><div class="lbl">' + l + '</div><div class="val' + (cls ? ' ' + cls : '') + '">' + v + '</div><div class="note">' + n + '</div></div>'; };
    var chart = bpChart.columns({
      title: 'Money in and out', lead: span(y) + ' · by month',
      x: { label: 'Month', values: ms.map(function (m) { return m.label; }) },
      series: [{ name: 'Money in', values: per.map(function (p) { return p.inc; }) }, { name: 'Money out', values: per.map(function (p) { return p.out; }) }],
      fmt: bpChart.money, height: 220,
    });
    var mrows = per.map(function (p) {
      var future = p.m.start > now, on = !!A.sel[p.m.i];
      return '<tr class="' + (future ? 'fut' : '') + (on ? ' on' : '') + '"><td class="arc-ck"><input type="checkbox" aria-label="Select ' + esc(p.m.long) + '"' + (on ? ' checked' : '') + ' onchange="BP_ARC.pick(' + p.m.i + ',this.checked)"></td>'
        + '<td>' + esc(p.m.long) + (future ? ' <span class="bpx-mut">· ahead</span>' : '') + '</td>'
        + '<td class="bpx-r bpx-num">' + money(p.inc) + '</td><td class="bpx-r bpx-num">' + money(p.out) + '</td>'
        + '<td class="bpx-r bpx-num ' + (p.net < 0 ? 'bpx-neg' : p.net > 0 ? 'bpx-pos' : '') + '">' + money(p.net) + '</td>'
        + '<td class="bpx-r bpx-num">' + p.jobs.length + '</td></tr>';
    }).join('');
    var jobs = S.jobs.slice().sort(function (a, b) { return +a.doneAt - +b.doneAt; });
    var jrows = jobs.length ? jobs.map(function (j) {
      var c = +j.collected || 0, e = jobCost(j), p = c - e;
      return '<tr><td>' + esc(j.name || '') + '<div class="bpx-mut arc-sub">' + esc(j.title || 'Job') + '</div></td>'
        + '<td class="bpx-mut">' + new Date(+j.doneAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</td>'
        + '<td class="bpx-r bpx-num">' + money(c) + '</td><td class="bpx-r bpx-num">' + money(e) + '</td>'
        + '<td class="bpx-r bpx-num ' + (p < 0 ? 'bpx-neg' : 'bpx-pos') + '">' + money(p) + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="bpx-empty2">No jobs finished in this business year.</td></tr>';
    var csvBtn = function (fn, label, dis) { return '<button class="bpx-btn ghost bpx-csv"' + (dis ? ' disabled title="Tick one or more months below first"' : '') + ' onclick="' + fn + '">' + (window.bpCsvIcon || '') + label + '</button>'; };
    return '<div class="arc-top"><button class="bpx-linkbtn arc-back" onclick="BP_ARC.back()"><span class="ms">arrow_back</span>All years</button>'
      + '<div class="arc-title"><h2>' + esc(name(y)) + '</h2><span class="bpx-mut">' + esc(span(y)) + '</span>' + (cur ? '<span class="arc-badge">In progress</span>' : '<span class="arc-badge done">Closed</span>') + '</div>'
      + '<div class="arc-acts">'
      + csvBtn('BP_ARC.csv(\'year\')', 'Export year (CSV)')
      + csvBtn('BP_ARC.csv(\'sel\')', 'Export selected months (CSV)' + (nSel ? ' · ' + nSel : ''), !nSel)
      + csvBtn('BP_ARC.pl()', 'P&amp;L summary (CSV)')
      + '<button class="bpx-btn arc-print" onclick="BP_ARC.print()"><span class="ms">print</span>Print / Save PDF</button></div></div>'
      + (nSel ? '<div class="arc-note">' + nSel + (nSel === 1 ? ' month' : ' months') + ' selected. The P&amp;L summary and Print use just those; clear the ticks to use the whole year.</div>' : '')
      + '<div class="bpx-stats">'
      + stat('Income', money(S.inc), cur ? 'so far this year' : 'for the year')
      + stat('Costs', money(S.out), 'all expenses')
      + stat(S.net < 0 ? 'Net loss' : 'Net profit', money(S.net), 'income − costs', S.net < 0 ? 'neg' : 'blue')
      + stat('Margin', S.margin == null ? '—' : S.margin + '%', S.jobs.length + (S.jobs.length === 1 ? ' job' : ' jobs') + ' finished')
      + '</div>'
      + '<div class="arc-two"><div class="bpx-panel">' + chart + '</div>'
      + '<div class="bpx-panel"><div class="bpx-ptitle">Profit &amp; loss<span class="lg2">' + esc(name(y)) + '</span></div><div class="bpx-cwrap" style="border:0;border-radius:0">' + plTable(S) + '</div></div></div>'
      + '<div class="bpx-panel"><div class="bpx-ptitle">Month by month<span class="lg2">tick months to export or print just those</span></div>'
      + '<div class="bpx-cwrap" style="border:0;border-radius:0"><table class="bpx-ctable arc-months"><thead><tr><th class="arc-ck"><input type="checkbox" aria-label="Select all months"' + (allOn ? ' checked' : '') + ' onchange="BP_ARC.pickAll(this.checked)"></th><th>Month</th><th class="bpx-r">In</th><th class="bpx-r">Out</th><th class="bpx-r">Net</th><th class="bpx-r">Jobs</th></tr></thead>'
      + '<tbody>' + mrows + '</tbody><tfoot><tr><td></td><td>Year</td><td class="bpx-r bpx-num">' + money(S.inc) + '</td><td class="bpx-r bpx-num">' + money(S.out) + '</td><td class="bpx-r bpx-num ' + (S.net < 0 ? 'bpx-neg' : 'bpx-pos') + '">' + money(S.net) + '</td><td class="bpx-r bpx-num">' + S.jobs.length + '</td></tr></tfoot></table></div></div>'
      + '<div class="bpx-panel"><div class="bpx-ptitle">Jobs finished<span class="lg2">' + jobs.length + ' in ' + esc(name(y)) + '</span></div>'
      + '<div class="bpx-cwrap" style="border:0;border-radius:0"><table class="bpx-ctable"><thead><tr><th>Job</th><th>Finished</th><th class="bpx-r">Collected</th><th class="bpx-r">Cost</th><th class="bpx-r">Profit</th></tr></thead><tbody>' + jrows + '</tbody></table></div></div>';
  }

  function render() {
    var el = area(); if (!el) return;
    el.innerHTML = '<div class="arc">' + (A.fy == null ? list() : detail(A.fy)) + '</div>';
    if (window.bpSpin) bpSpin(false);
  }
  window.bpFinArchive = function () { A.fy = null; A.sel = {}; render(); };
  A.open = function (y) { A.fy = +y; A.sel = {}; render(); if (window.bpScrollTop) bpScrollTop(); };
  A.back = function () { A.fy = null; A.sel = {}; render(); };
  A.pick = function (i, on) { if (on) A.sel[i] = 1; else delete A.sel[i]; render(); };
  A.pickAll = function (on) { A.sel = {}; if (on) for (var i = 0; i < 12; i++) A.sel[i] = 1; render(); };
  A.setStart = function (v) {
    var s = (window.bpSettingsGet && bpSettingsGet()) || {};
    s.fiscalStart = Math.max(1, Math.min(12, +v || 1));
    if (window.bpSettingsSet) bpSettingsSet(s);
    A.fy = null; A.sel = {}; render();
  };

  /* ---------- exports ---------- */
  function iso(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function windows(y, onlySel) {
    var sc = scopeOf(y);
    if (onlySel && sc.picked.length) return { list: sc.picked.map(function (m) { return [m.start, m.end]; }), label: sc.picked.map(function (m) { return m.label; }).join(', ') + ' \u00b7 ' + name(y), slug: name(y) + '-' + sc.picked.map(function (m) { return m.label; }).join('-') };
    var r = range(y); return { list: [[r.start, r.end]], label: name(y) + ' (' + span(y) + ')', slug: name(y) };
  }
  function inW(t, W) { return W.list.some(function (w) { return t >= w[0] && t < w[1]; }); }
  function scoped(W) {
    var D = data(), S = { tx: [], inc: 0, out: 0, byInc: {}, byExp: {}, jobs: [] };
    W.list.forEach(function (w) {
      var s = sumUp(D, w[0], w[1]);
      S.tx = S.tx.concat(s.tx); S.inc += s.inc; S.out += s.out; S.jobs = S.jobs.concat(s.jobs);
      Object.keys(s.byInc).forEach(function (k) { S.byInc[k] = (S.byInc[k] || 0) + s.byInc[k]; });
      Object.keys(s.byExp).forEach(function (k) { S.byExp[k] = (S.byExp[k] || 0) + s.byExp[k]; });
    });
    S.net = S.inc - S.out; S.margin = S.inc > 0 ? Math.round(S.net / S.inc * 100) : null;
    S.tx.sort(function (a, b) { return a.w - b.w; });
    return S;
  }
  A.csv = function (which) {
    if (A.fy == null || !window.bpCsv) return;
    if (which === 'sel' && !scopeOf(A.fy).picked.length) return;
    var W = windows(A.fy, which === 'sel'), S = scoped(W);
    bpCsv('transactions-' + W.slug, ['Date', 'Type', 'Category', 'Description', 'Job', 'Amount'], S.tx.map(function (x) {
      return [iso(x.w), x.dir, x.cat, x.desc, x.job, (x.dir === 'Expense' ? -1 : 1) * Math.round(x.amt * 100) / 100];
    }));
  };
  A.pl = function () {
    if (A.fy == null || !window.bpCsv) return;
    var W = windows(A.fy, true), S = scoped(W), R = plRows(S), rows = [];
    rows.push(['Period', W.label, '']);
    R.inc.forEach(function (c) { rows.push(['Income', c, S.byInc[c]]); });
    rows.push(['Income', 'Total income', S.inc]);
    R.exp.forEach(function (c) { rows.push(['Expenses', c, S.byExp[c]]); });
    rows.push(['Expenses', 'Total expenses', S.out]);
    rows.push(['Net', S.net < 0 ? 'Net loss' : 'Net profit', S.net]);
    rows.push(['Net', 'Margin %', S.margin == null ? '' : S.margin]);
    rows.push(['Jobs', 'Jobs finished', S.jobs.length]);
    bpCsv('profit-and-loss-' + W.slug, ['Section', 'Line', 'Amount'], rows.map(function (r) { return [r[0], r[1], typeof r[2] === 'number' ? Math.round(r[2] * 100) / 100 : r[2]]; }));
  };
  A.print = function () {
    if (A.fy == null) return;
    var W = windows(A.fy, true), S = scoped(W), co = (((window.bpSettingsGet && bpSettingsGet()) || {}).company) || {};
    var old = document.getElementById('arcPrint'); if (old) old.remove();
    var el = document.createElement('div'); el.id = 'arcPrint';
    var jobs = S.jobs.slice().sort(function (a, b) { return +a.doneAt - +b.doneAt; });
    el.innerHTML = '<div class="arcp-h"><div><h1>Profit &amp; loss</h1><p>' + esc(W.label) + '</p></div><div class="arcp-co"><b>' + esc(co.name || '') + '</b>' + (co.address ? '<span>' + esc(co.address) + '</span>' : '') + '</div></div>'
      + '<div class="arcp-k"><span><small>Income</small><b>' + money(S.inc) + '</b></span><span><small>Expenses</small><b>' + money(S.out) + '</b></span><span><small>' + (S.net < 0 ? 'Net loss' : 'Net profit') + '</small><b>' + money(S.net) + '</b></span><span><small>Margin</small><b>' + (S.margin == null ? '—' : S.margin + '%') + '</b></span></div>'
      + plTable(S)
      + (jobs.length ? '<h2>Jobs finished</h2><table class="arcp-j"><thead><tr><th>Job</th><th>Finished</th><th>Collected</th><th>Cost</th><th>Profit</th></tr></thead><tbody>'
        + jobs.map(function (j) { var c = +j.collected || 0, e = jobCost(j); return '<tr><td>' + esc(j.name || '') + ' — ' + esc(j.title || 'Job') + '</td><td>' + iso(+j.doneAt) + '</td><td>' + money(c) + '</td><td>' + money(e) + '</td><td>' + money(c - e) + '</td></tr>'; }).join('')
        + '</tbody></table>' : '')
      + '<p class="arcp-f">Prepared ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' from BuilderPro. A management summary of income collected and costs logged, not a filed tax return.</p>';
    document.body.appendChild(el);
    document.body.classList.add('arc-printing');
    var done = function () { document.body.classList.remove('arc-printing'); var n = document.getElementById('arcPrint'); if (n) n.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { done(); }
  };
})();
