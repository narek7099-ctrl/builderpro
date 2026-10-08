/* ==================================================================
   Estimate + invoice builder (Finances → New estimate / New invoice)

   An estimate is worked out, not typed in:
     Materials   the order-list editor (portal/matlists.js): catalog search,
                 your supplier prices, templates
     Labor       who, how many people, hours, cost an hour (an employee's
                 burdened rate fills in)
     Other       permits, dumpster, equipment, subs, disposal, delivery
   Each section has its own markup. Tax (on materials or everything) and a
   discount give the customer price; the side panel shows your cost, profit
   and margin as you go. You pick what the customer sees: every line, one
   line per section, or a single price.

   The sheet is saved as a project in 'quote' status on the jobs list (so it
   syncs like every other project, and its materials ARE the job's order
   list). When the customer pays the deposit, the project that the deposit
   creates takes over the sheet: the order list, the budget (cost per
   category) and the price. Nothing is typed twice.

   New invoice starts from the customer's estimate: every line carried over
   and editable, or a deposit %, a progress amount, or the final balance
   (the total less what was already billed).
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var r2 = function (n) { return Math.round((+n || 0) * 100) / 100; };
  var m2 = function (n) { var v = r2(n); return (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var m0 = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : m2(n); };
  var num = function (v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  var uid = function (p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var sum = function (a, f) { return (a || []).reduce(function (t, x) { return t + (+f(x) || 0); }, 0); };
  var toast = function (t, k) { if (window.bpToast) bpToast(t, k); };

  var Q = window.BPQ = { id: null, inv: null };

  /* ---------- defaults (Settings → saved from the sheet) ---------- */
  function defs() {
    var s = {}; try { s = (bpSettingsGet() || {}).quoteDefaults || {}; } catch (e) {}
    var d = function (k, v) { return s[k] == null || s[k] === '' ? v : s[k]; };
    return { mkMat: d('mkMat', 20), mkLab: d('mkLab', 25), mkOth: d('mkOth', 10), taxPct: d('taxPct', 0), taxOn: d('taxOn', 'materials'),
      show: d('show', 'sections'), validDays: d('validDays', 14), depositPct: d('depositPct', 50) };
  }
  Q.saveDefaults = function () {
    var j = job(Q.id); if (!j) return; var q = j.quote;
    try {
      var st = bpSettingsGet() || {};
      st.quoteDefaults = { mkMat: q.mkMat, mkLab: q.mkLab, mkOth: q.mkOth, taxPct: q.taxPct, taxOn: q.taxOn, show: q.show, validDays: q.validDays, depositPct: (st.quoteDefaults || {}).depositPct || 50 };
      bpSettingsSet(st); if (window.bpSettingsPush) bpSettingsPush(st);
      toast('Saved. New estimates start with these markups.', 'success');
    } catch (e) {}
  };

  /* ---------- the sheet lives on a job ---------- */
  var jobs = function () { return window.bpJobsGet ? bpJobsGet() : []; };
  var job = function (id) { return jobs().filter(function (j) { return j && j.id === id; })[0] || null; };
  var saveT = null;
  function save(now) {
    clearTimeout(saveT);
    var go = function () { if (window.bpJobsSet) bpJobsSet(jobs()); };
    if (now) go(); else saveT = setTimeout(go, 500);
  }
  function quoteOf(j) {
    if (!j.quote) { var d = defs(); j.quote = { labor: [], other: [], mkMat: d.mkMat, mkLab: d.mkLab, mkOth: d.mkOth, taxPct: d.taxPct, taxOn: d.taxOn,
      show: d.show, validDays: d.validDays, discount: 0, desc: '', via: 'sms', status: 'draft', invoices: [], at: Date.now() }; }
    var q = j.quote; q.labor = q.labor || []; q.other = q.other || []; q.invoices = q.invoices || [];
    if (!j.materials) j.materials = { status: 'draft', sentAt: null, items: [], changeOrders: [] };
    j.materials.items = j.materials.items || [];
    return q;
  }
  var hasWork = function (j) { var q = j.quote || {}; return !!((j.materials && j.materials.items && j.materials.items.length) || (q.labor || []).length || (q.other || []).length || q.estId || (j.title && j.title !== 'New estimate')); };
  /* empty sheets someone opened and walked away from */
  function tidy(keep) {
    var all = jobs(), n = all.length;
    var left = all.filter(function (j) { return !(j && j.status === 'quote' && j.id !== keep && !hasWork(j) && !j.contactId); });
    if (left.length !== n) { all.length = 0; Array.prototype.push.apply(all, left); save(true); }
  }

  /* ---------- the maths ---------- */
  var f = function (pct) { return 1 + (+pct || 0) / 100; };
  var labHrs = function (l) { return (+l.hours || 0) * Math.max(1, +l.people || 1); };
  function calc(j) {
    var q = quoteOf(j), mats = j.materials.items;
    var matCost = r2(sum(mats, function (it) { return (+it.qty || 0) * (+it.price || 0); }));
    var labCost = r2(sum(q.labor, function (l) { return labHrs(l) * (+l.rate || 0); }));
    var othCost = r2(sum(q.other, function (o) { return +o.cost || 0; }));
    var matPrice = r2(matCost * f(q.mkMat)), labPrice = r2(labCost * f(q.mkLab)), othPrice = r2(othCost * f(q.mkOth));
    var lines = [];
    if (q.show === 'items') {
      mats.forEach(function (it) { var qty = +it.qty || 0, u = r2((+it.price || 0) * f(q.mkMat)); if (qty > 0 && u > 0) lines.push({ name: it.name || 'Material', desc: it.note || '', qty: qty, price: u, unit: it.unit || 'ea', sec: 'mat' }); });
      q.labor.forEach(function (l) { var h = r2(labHrs(l)), u = r2((+l.rate || 0) * f(q.mkLab)); if (h > 0 && u > 0) lines.push({ name: 'Labor' + (l.name ? ': ' + l.name : ''), desc: (Math.max(1, +l.people || 1) > 1 ? (+l.people) + ' people × ' + (+l.hours || 0) + ' hrs' : ''), qty: h, price: u, unit: 'hr', sec: 'lab' }); });
      q.other.forEach(function (o) { var u = r2((+o.cost || 0) * f(q.mkOth)); if (u > 0) lines.push({ name: o.name || 'Other', desc: '', qty: 1, price: u, sec: 'oth' }); });
    } else if (q.show === 'total') {
      var t = r2(matPrice + labPrice + othPrice); if (t > 0) lines.push({ name: j.title || 'Project', desc: q.desc || '', qty: 1, price: t, sec: 'all' });
    } else {
      if (matPrice > 0) lines.push({ name: 'Materials', desc: mats.length + ' item' + (mats.length === 1 ? '' : 's'), qty: 1, price: matPrice, sec: 'mat' });
      if (labPrice > 0) lines.push({ name: 'Labor', desc: r2(sum(q.labor, labHrs)) + ' hours', qty: 1, price: labPrice, sec: 'lab' });
      if (othPrice > 0) lines.push({ name: q.other.length === 1 ? (q.other[0].name || 'Other costs') : 'Other costs', desc: q.other.length > 1 ? q.other.map(function (o) { return o.name; }).filter(Boolean).join(', ') : '', qty: 1, price: othPrice, sec: 'oth' });
    }
    var sub = r2(sum(lines, function (l) { return r2(l.qty * l.price); }));
    var base = q.taxOn === 'all' ? sub : Math.min(sub, q.show === 'items' ? r2(sum(lines.filter(function (l) { return l.sec === 'mat'; }), function (l) { return r2(l.qty * l.price); })) : matPrice);
    var tax = r2(base * (+q.taxPct || 0) / 100);
    if (tax > 0) lines.push({ name: 'Sales tax (' + (+q.taxPct) + '%' + (q.taxOn === 'all' ? '' : ' on materials') + ')', desc: '', qty: 1, price: tax, sec: 'tax' });
    var disc = Math.max(0, Math.min(r2(q.discount), r2(sub + tax)));
    var total = r2(sub + tax - disc), cost = r2(matCost + labCost + othCost), profit = r2(total - tax - cost), net = r2(sub - disc);
    return { lines: lines, matCost: matCost, labCost: labCost, othCost: othCost, matPrice: matPrice, labPrice: labPrice, othPrice: othPrice,
      sub: sub, tax: tax, disc: disc, total: total, cost: cost, profit: profit, margin: net > 0 ? Math.round(profit / net * 1000) / 10 : 0 };
  }
  Q.calc = function (id) { var j = job(id); return j ? calc(j) : null; };

  /* ---------- open ---------- */
  function contactBy(id) { return (window._bpContacts || []).filter(function (c) { return c.id === id; })[0] || null; }
  function newSheet(c) {
    var j = { id: 'j' + Date.now() + Math.floor(Math.random() * 1000), name: c ? (c.name || 'Customer') : 'New customer', phone: c ? (c.phone || '') : '', email: c ? (c.email || '') : '',
      contactId: c ? c.id : null, title: 'New estimate', addr: c ? (c.address1 || c.address || '') : '', status: 'quote', estimate: 0, collected: null, expenses: [], createdAt: Date.now() };
    quoteOf(j); jobs().unshift(j); save(true); return j;
  }
  /* New estimate: a contact's open sheet if there is one, else a fresh one */
  window.bpQuoteNew = async function (contactId) {
    if (window.bpEnsureContacts) { try { await bpEnsureContacts(); } catch (e) {} }
    var c = contactId ? contactBy(contactId) : null;
    var open = c ? jobs().filter(function (j) { return j.status === 'quote' && j.contactId === c.id; })[0] : null;
    var j = open || newSheet(c);
    bpQuoteOpen(j.id);
  };
  window.bpQuoteOpen = function (id) {
    Q.id = id; tidy(id);
    if (window.bpNav) bpNav('quote'); else render();
  };
  window.bpEstOpen = function () { bpQuoteNew(); };

  /* ---------- page ---------- */
  var seg = function (cur, opts, fn) { return '<div class="qb-seg">' + opts.map(function (o) { return '<button type="button" class="' + (cur === o[0] ? 'on' : '') + '" onclick="' + fn + '(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>'; };
  var mk = function (k, v) { return '<label class="qb-mk" title="Markup on this section">+<input type="number" min="0" step="any" inputmode="decimal" value="' + esc(v) + '" oninput="BPQ.set(\'' + k + '\',this.value,1)">%</label>'; };
  function render() {
    var area = $('bpxViewArea'), j = job(Q.id);
    if (!area) return;
    if (!j) { area.innerHTML = '<div class="pjk-empty">That estimate is gone. <a onclick="bpNav(\'estimates\')">Back to estimates</a></div>'; if (window.bpSpin) bpSpin(false); return; }
    var q = quoteOf(j), cs = window._bpContacts || [];
    var copts = '<option value="">Pick a customer…</option>' + cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === j.contactId ? ' selected' : '') + '>' + esc(c.name || c.phone || c.email || 'Contact') + '</option>'; }).join('')
      + (j.contactId && !contactBy(j.contactId) ? '<option value="' + esc(j.contactId) + '" selected>' + esc(j.name) + '</option>' : '');
    area.innerHTML = '<div class="qb">'
      + '<div class="qb-top"><button type="button" class="qb-back" onclick="bpNav(\'estimates\')"><span class="ms">arrow_back</span>Estimates</button>'
        + '<span class="qb-st ' + (q.estId ? 'sent' : '') + '">' + (q.estId ? 'Sent ' + new Date(q.sentAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Draft') + '</span></div>'
      + '<div class="qb-grid"><div class="qb-main">'
      /* 1. who and what */
      + '<section class="qb-card"><div class="qb-ch"><span class="qb-n">1</span><b>Customer and job</b></div>'
        + '<div class="qb-f2"><label>Customer<select id="qb-c" onchange="BPQ.contact(this.value)">' + copts + '</select></label>'
        + '<label>Job title<input id="qb-t" value="' + esc(j.title === 'New estimate' ? '' : j.title) + '" placeholder="e.g. Roof replacement" onchange="BPQ.setJ(\'title\',this.value)"></label></div>'
        + '<label>Job site address<input value="' + esc(j.addr || '') + '" placeholder="Where the work is" onchange="BPQ.setJ(\'addr\',this.value)"></label>'
        + '<label>Scope of work <small>shows on the estimate</small><textarea rows="3" placeholder="What you will do, what is included, what is not" onchange="BPQ.set(\'desc\',this.value)">' + esc(q.desc || '') + '</textarea></label></section>'
      /* 2. materials */
      + '<section class="qb-card"><div class="qb-ch"><span class="qb-n">2</span><b>Materials</b><span class="qb-cs" id="qb-cs-mat"></span>' + mk('mkMat', q.mkMat) + '</div>'
        + '<p class="qb-hint">Search your suppliers and the catalog, or start from a template. This becomes the job&rsquo;s order list.</p>'
        + '<div id="qb-mat">' + (window.ML && ML.editor ? ML.editor('job', j.id) : '<div class="bpx-mut">Loading…</div>') + '</div></section>'
      /* 3. labor */
      + '<section class="qb-card"><div class="qb-ch"><span class="qb-n">3</span><b>Labor</b><span class="qb-cs" id="qb-cs-lab"></span>' + mk('mkLab', q.mkLab) + '</div>'
        + '<div id="qb-lab"></div></section>'
      /* 4. other */
      + '<section class="qb-card"><div class="qb-ch"><span class="qb-n">4</span><b>Other costs</b><span class="qb-cs" id="qb-cs-oth"></span>' + mk('mkOth', q.mkOth) + '</div>'
        + '<div id="qb-oth"></div></section>'
      + '</div>'
      /* summary */
      + '<aside class="qb-side"><div class="qb-sum" id="qb-sum"></div></aside></div></div>';
    drawLabor(); drawOther(); paint();
    if (window.bpCrewLoad && !(window.bpEmpsActive && bpEmpsActive().length)) { try { Promise.resolve(bpCrewLoad()).then(function () { if ($('qb-lab')) drawLabor(); }); } catch (e) {} }
    if (window.bpSpin) bpSpin(false);
  }
  window.bpQuotePage = function () {
    if (!Q.id || !job(Q.id)) { var open = jobs().filter(function (j) { return j.status === 'quote'; })[0]; if (open) Q.id = open.id; else { bpQuoteNew(); return; } }
    if (window.bpEnsureContacts && !(window._bpContacts || []).length) { Promise.resolve(bpEnsureContacts()).then(render, render); return; }
    render();
  };

  /* ---------- labor ---------- */
  function emps() { try { return (window.bpEmpsActive ? bpEmpsActive() : []) || []; } catch (e) { return []; } }
  function drawLabor() {
    var el = $('qb-lab'), j = job(Q.id); if (!el || !j) return;
    var q = j.quote, es = emps();
    el.innerHTML = (q.labor.length ? '<div class="qb-rows"><div class="qb-rh qb-lab"><span>Who / what</span><span>People</span><span>Hours each</span><span>Cost / hr</span><span>Cost</span><span></span></div>'
      + q.labor.map(function (l) {
        var opt = '<option value="">Custom…</option>' + es.map(function (e) { return '<option value="' + esc(e.id) + '"' + (l.empId === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('');
        return '<div class="qb-r qb-lab">'
          + '<span class="qb-who">' + (es.length ? '<select onchange="BPQ.labEmp(\'' + l.id + '\',this.value)">' + opt + '</select>' : '')
            + '<input value="' + esc(l.name || '') + '" placeholder="e.g. Tear-off crew" onchange="BPQ.row(\'labor\',\'' + l.id + '\',\'name\',this.value)"></span>'
          + '<input type="number" min="1" step="1" inputmode="numeric" value="' + esc(l.people || 1) + '" oninput="BPQ.row(\'labor\',\'' + l.id + '\',\'people\',this.value,1)" aria-label="People">'
          + '<input type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.hours || '') + '" placeholder="0" oninput="BPQ.row(\'labor\',\'' + l.id + '\',\'hours\',this.value,1)" aria-label="Hours each">'
          + '<input type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.rate || '') + '" placeholder="0" oninput="BPQ.row(\'labor\',\'' + l.id + '\',\'rate\',this.value,1)" aria-label="Cost per hour">'
          + '<b class="qb-lc" id="qb-lc-' + l.id + '">' + m0(labHrs(l) * (+l.rate || 0)) + '</b>'
          + '<button type="button" class="qb-x" aria-label="Remove" onclick="BPQ.del(\'labor\',\'' + l.id + '\')">&times;</button></div>';
      }).join('') + '</div>' : '<p class="qb-hint">Add the crew time this job takes. Pick an employee to use their rate with payroll costs included, or type a rate.</p>')
      + '<div class="qb-adds"><button type="button" class="qb-add" onclick="BPQ.addLab()"><span class="ms">add</span>Add labor</button></div>';
  }
  Q.addLab = function () { var j = job(Q.id); if (!j) return; j.quote.labor.push({ id: uid('lb'), name: '', people: 1, hours: '', rate: '' }); save(); drawLabor(); paint(); };
  Q.labEmp = function (lid, eid) {
    var j = job(Q.id), l = j && j.quote.labor.filter(function (x) { return x.id === lid; })[0]; if (!l) return;
    var e = emps().filter(function (x) { return x.id === eid; })[0];
    l.empId = eid || null;
    if (e) { l.name = e.name; var r = window.bpBurdenedRate ? bpBurdenedRate(e) : (+e.rate || 0); if (r > 0) l.rate = r2(r); }
    save(); drawLabor(); paint();
  };

  /* ---------- other ---------- */
  var OTHER = [['Permit', 'Permits'], ['Dumpster', 'Other'], ['Equipment rental', 'Other'], ['Subcontractor', 'Subcontractor'], ['Disposal fees', 'Other'], ['Delivery', 'Other']];
  function drawOther() {
    var el = $('qb-oth'), j = job(Q.id); if (!el || !j) return;
    var q = j.quote;
    el.innerHTML = (q.other.length ? '<div class="qb-rows">' + q.other.map(function (o) {
      return '<div class="qb-r qb-oth"><input value="' + esc(o.name || '') + '" placeholder="What it is" onchange="BPQ.row(\'other\',\'' + o.id + '\',\'name\',this.value)">'
        + '<select onchange="BPQ.row(\'other\',\'' + o.id + '\',\'cat\',this.value)" aria-label="Budget category">' + ['Permits', 'Subcontractor', 'Other'].map(function (c) { return '<option' + (o.cat === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>'
        + '<label class="qb-money">$<input type="number" min="0" step="any" inputmode="decimal" value="' + esc(o.cost || '') + '" placeholder="0" oninput="BPQ.row(\'other\',\'' + o.id + '\',\'cost\',this.value,1)" aria-label="Cost"></label>'
        + '<button type="button" class="qb-x" aria-label="Remove" onclick="BPQ.del(\'other\',\'' + o.id + '\')">&times;</button></div>';
    }).join('') + '</div>' : '')
      + '<div class="qb-adds">' + OTHER.map(function (o) { return '<button type="button" class="qb-chip" onclick="BPQ.addOth(\'' + o[0] + '\',\'' + o[1] + '\')">+ ' + o[0] + '</button>'; }).join('')
      + '<button type="button" class="qb-chip" onclick="BPQ.addOth(\'\',\'Other\')">+ Something else</button></div>';
  }
  Q.addOth = function (name, cat) {
    var j = job(Q.id); if (!j) return; var id = uid('ot');
    j.quote.other.push({ id: id, name: name, cat: cat || 'Other', cost: '' }); save(); drawOther(); paint();
    setTimeout(function () { var r = document.querySelectorAll('#qb-oth .qb-r'), last = r[r.length - 1]; var i = last && last.querySelector(name ? '.qb-money input' : 'input'); if (i) i.focus(); }, 0);
  };

  /* ---------- edits ---------- */
  Q.row = function (kind, id, k, v, isNum) {
    var j = job(Q.id), r = j && j.quote[kind].filter(function (x) { return x.id === id; })[0]; if (!r) return;
    r[k] = isNum ? (String(v).trim() === '' ? '' : Math.max(0, num(v))) : String(v);
    if (kind === 'labor') { var c = $('qb-lc-' + id); if (c) c.textContent = m0(labHrs(r) * (+r.rate || 0)); }
    save(); paint();
  };
  Q.del = function (kind, id) { var j = job(Q.id); if (!j) return; j.quote[kind] = j.quote[kind].filter(function (x) { return x.id !== id; }); save(); kind === 'labor' ? drawLabor() : drawOther(); paint(); };
  Q.set = function (k, v, isNum) { var j = job(Q.id); if (!j) return; j.quote[k] = isNum ? Math.max(0, num(v)) : v; save(); paint(); };
  Q.setJ = function (k, v) { var j = job(Q.id); if (!j) return; j[k] = String(v || '').trim() || (k === 'title' ? 'New estimate' : ''); save(); paint(); };
  Q.show = function (v) { Q.set('show', v); };
  Q.taxOn = function (v) { Q.set('taxOn', v); };
  Q.via = function (v) { Q.set('via', v); };
  Q.contact = function (cid) {
    var j = job(Q.id), c = contactBy(cid); if (!j) return;
    j.contactId = cid || null;
    if (c) { j.name = c.name || 'Customer'; j.phone = c.phone || ''; j.email = c.email || ''; if (!j.addr) j.addr = c.address1 || c.address || ''; }
    save(true); paint();
  };
  /* matlists.js calls this after every change to the list */
  window.bpQbMat = function (jid) { if (jid === Q.id && $('qb-sum')) paint(); };

  /* ---------- summary ---------- */
  function paint() {
    var el = $('qb-sum'), j = job(Q.id); if (!el || !j) return;
    var q = j.quote, c = calc(j), ct = contactBy(j.contactId);
    j.estimate = c.total;
    var cs = function (id, cost) { var e = $(id); if (e) e.textContent = cost ? m0(cost) + ' cost' : ''; };
    cs('qb-cs-mat', c.matCost); cs('qb-cs-lab', c.labCost); cs('qb-cs-oth', c.othCost);
    var row = function (l, cost, price) { return '<div class="qb-sr"><span>' + l + '</span><span class="qb-sc">' + m0(cost) + '</span><b>' + m0(price) + '</b></div>'; };
    var good = c.margin >= 20 ? 'good' : c.margin >= 10 ? 'ok' : 'low';
    el.innerHTML = '<div class="qb-sh"><b>' + esc(j.title === 'New estimate' ? 'Estimate' : j.title) + '</b><span>' + esc(ct ? ct.name : (j.contactId ? j.name : 'No customer yet')) + '</span></div>'
      + '<div class="qb-sr qb-srh"><span></span><span class="qb-sc">Cost</span><b>Price</b></div>'
      + row('Materials', c.matCost, c.matPrice) + row('Labor', c.labCost, c.labPrice) + row('Other', c.othCost, c.othPrice)
      + (c.tax ? '<div class="qb-sr"><span>Tax</span><span class="qb-sc"></span><b>' + m0(c.tax) + '</b></div>' : '')
      + (c.disc ? '<div class="qb-sr"><span>Discount</span><span class="qb-sc"></span><b>-' + m0(c.disc) + '</b></div>' : '')
      + '<div class="qb-tot"><span>Customer pays</span><b>' + m2(c.total) + '</b></div>'
      + '<div class="qb-pf ' + good + '"><div><small>Your cost</small><b>' + m0(c.cost) + '</b></div><div><small>Profit</small><b>' + m0(c.profit) + '</b></div><div><small>Margin</small><b>' + c.margin + '%</b></div></div>'
      + '<div class="qb-opt"><label>The customer sees</label>' + seg(q.show, [['items', 'Every line'], ['sections', 'By section'], ['total', 'One price']], 'BPQ.show') + '</div>'
      + '<div class="qb-opt qb-opt2"><label>Tax %<input type="number" min="0" step="any" inputmode="decimal" value="' + esc(q.taxPct || '') + '" placeholder="0" oninput="BPQ.set(\'taxPct\',this.value,1)"></label>'
        + '<label>Taxed<select onchange="BPQ.taxOn(this.value)"><option value="materials"' + (q.taxOn !== 'all' ? ' selected' : '') + '>Materials</option><option value="all"' + (q.taxOn === 'all' ? ' selected' : '') + '>Everything</option></select></label>'
        + '<label>Discount $<input type="number" min="0" step="any" inputmode="decimal" value="' + esc(q.discount || '') + '" placeholder="0" oninput="BPQ.set(\'discount\',this.value,1)"></label></div>'
      + '<div class="qb-opt qb-opt2"><label>Valid for<select onchange="BPQ.set(\'validDays\',this.value,1)">' + [7, 14, 30, 60].map(function (d) { return '<option value="' + d + '"' + (+q.validDays === d ? ' selected' : '') + '>' + d + ' days</option>'; }).join('') + '</select></label>'
        + '<label>Send by<select onchange="BPQ.via(this.value)"><option value="sms"' + (q.via === 'sms' ? ' selected' : '') + '>Text</option><option value="email"' + (q.via === 'email' ? ' selected' : '') + '>Email</option><option value="both"' + (q.via === 'both' ? ' selected' : '') + '>Both</option></select></label></div>'
      + '<div class="qb-msg" id="qb-msg"></div>'
      + '<div class="qb-acts"><button type="button" class="qb-b ghost" onclick="BPQ.preview()"><span class="ms">visibility</span>Preview</button>'
        + '<button type="button" class="qb-b pri" id="qb-send" onclick="BPQ.send()"><span class="ms">send</span>' + (q.estId ? 'Send updated estimate' : 'Send estimate') + '</button></div>'
      + (q.estId ? '<button type="button" class="qb-b ghost wide" onclick="bpInvoiceFrom(\'' + j.id + '\')"><span class="ms">receipt_long</span>Make the invoice from this</button>' : '')
      + '<div class="qb-foot"><a onclick="BPQ.saveDefaults()">Save these markups as my defaults</a><a class="del" onclick="BPQ.remove()">Delete estimate</a></div>';
  }
  Q.remove = function () {
    var j = job(Q.id); if (!j || !confirm('Delete this estimate sheet? Anything already sent to the customer stays sent.')) return;
    var all = jobs(), left = all.filter(function (x) { return x.id !== j.id; }); all.length = 0; Array.prototype.push.apply(all, left); save(true);
    Q.id = null; bpNav('estimates');
  };

  /* ---------- the document the customer gets ---------- */
  function doc(kind, o) {
    var st = {}; try { st = bpSettingsGet() || {}; } catch (e) {}
    var co = st.company || {}, biz = co.name || 'Your Company';
    var fmt = function (d) { return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };
    var addr = [biz]; if (co.phone) addr.push(co.phone); if (co.address) addr.push(co.address);
    var sub = r2(sum(o.lines, function (l) { return r2(l.qty * l.price); }));
    return '<div class="qb-doc">'
      + '<div class="qb-dt">' + (kind === 'inv' ? 'INVOICE' : 'ESTIMATE') + '</div><div class="qb-dl"></div>'
      + '<div class="qb-da">' + addr.map(esc).join('<br>') + '</div>'
      + '<div class="qb-dm"><div><b>' + (kind === 'inv' ? 'Billed to' : 'Prepared for') + '</b><span>' + esc(o.cust || '—') + '</span></div>'
        + '<div><b>' + (kind === 'inv' ? 'Issued' : 'Issue date') + '</b><span>' + fmt(new Date()) + '</span></div>'
        + '<div><b>' + (kind === 'inv' ? 'Due' : 'Valid until') + '</b><span>' + (o.days === 0 ? 'On receipt' : fmt(new Date(Date.now() + (o.days || 14) * 864e5))) + '</span></div></div>'
      + (o.title ? '<div class="qb-dtt">' + esc(o.title) + '</div>' : '') + (o.desc ? '<div class="qb-dds">' + esc(o.desc).replace(/\n/g, '<br>') + '</div>' : '')
      + '<table class="qb-dtb"><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr></thead><tbody>'
      + (o.lines.length ? o.lines.map(function (l) { return '<tr><td><b>' + esc(l.name) + '</b>' + (l.desc ? '<small>' + esc(l.desc) + '</small>' : '') + '</td><td class="n">' + (+l.qty % 1 ? r2(l.qty) : +l.qty) + (l.unit && l.unit !== 'ea' ? ' ' + esc(l.unit) : '') + '</td><td class="n">' + m2(l.price) + '</td><td class="n">' + m2(l.qty * l.price) + '</td></tr>'; }).join('')
        : '<tr><td colspan="4" class="qb-dnone">Nothing priced yet.</td></tr>')
      + '</tbody></table>'
      + '<div class="qb-dsum">' + (o.disc ? '<div><span>Subtotal</span><span>' + m2(sub) + '</span></div><div><span>Discount</span><span>-' + m2(o.disc) + '</span></div>' : '')
        + '<div class="t"><span>' + (kind === 'inv' ? 'Amount due' : 'Estimate total') + '</span><span>' + m2(r2(sub - (o.disc || 0))) + '</span></div></div>'
      + '<div class="qb-dfoot">' + (kind === 'inv' ? 'Sent with a secure Pay button' : 'Sent with Accept and Decline buttons') + '</div></div>';
  }
  Q.preview = function () {
    var j = job(Q.id); if (!j) return; var c = calc(j);
    bpModal('<h3>What ' + esc(j.contactId ? j.name : 'your customer') + ' sees</h3>' + doc('est', { lines: c.lines, disc: c.disc, cust: j.contactId ? j.name : '', days: +j.quote.validDays, title: j.title === 'New estimate' ? '' : j.title, desc: j.quote.desc })
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '760px'; mc.style.width = '95vw'; }
  };

  /* ---------- send ---------- */
  var gItems = function (lines) { return lines.map(function (l) { return { name: String(l.name).slice(0, 120), description: String(l.desc || l.name).slice(0, 300), qty: r2(l.qty) || 1, amount: r2(l.price) }; }); };
  async function post(url, body) {
    var tok = window.bpJwt ? await bpJwt() : '';
    var r = await fetch(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + (tok || BP_ANON), 'apikey': BP_ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 404) return { ok: false, error: 'This isn’t switched on for your account yet.' };
    return r.json().catch(function () { return { ok: false, error: 'Bad reply' }; });
  }
  var biz = function () { try { return ((bpSettingsGet() || {}).company || {}).name || 'Your contractor'; } catch (e) { return 'Your contractor'; } };
  Q.send = async function () {
    var j = job(Q.id), msg = $('qb-msg'), btn = $('qb-send'); if (!j) return;
    var q = j.quote, c = calc(j), ct = contactBy(j.contactId);
    var say = function (t, ok) { if (msg) { msg.className = 'qb-msg ' + (ok ? 'ok' : 'err'); msg.textContent = t; } };
    if (!j.contactId) return say('Pick the customer first.');
    if (!(c.total > 0)) return say('Nothing is priced yet. Add materials, labor or other costs.');
    var phone = (ct && ct.phone) || j.phone || '', email = (ct && ct.email) || j.email || '';
    if (q.via !== 'email' && !phone) return say('This customer has no phone number. Send by email instead.');
    if (q.via !== 'sms' && !email) return say('This customer has no email. Send by text instead.');
    if (q.estId && !confirm('This sends a new estimate with the changes. The one sent before stays in their messages. Send it?')) return;
    btn.disabled = true; say('Sending…', true);
    try {
      var d = await post(GHL_EST_URL, { action: 'create', contactId: j.contactId, contactName: j.name, phone: phone, email: email,
        title: j.title === 'New estimate' ? 'Estimate' : j.title, amount: c.total, items: gItems(c.lines), discount: c.disc,
        description: q.desc || '', send: q.via, businessName: biz(), expiryDays: +q.validDays || 14 });
      if (d && d.ok) {
        q.estId = d.id; q.sentAt = Date.now(); q.status = 'sent'; q.sentTotal = c.total; save(true);
        toast(d.sent ? 'Estimate sent to ' + j.name + '.' : 'Estimate saved, but sending failed. It is in your estimates as a draft.', d.sent ? 'success' : 'error');
        render();
      } else { say('Couldn’t send: ' + String((d && d.error) || 'unknown error')); btn.disabled = false; }
    } catch (e) { say('Network error. Try again.'); btn.disabled = false; }
  };

  /* ================================================================
     Invoice
     ================================================================ */
  function srcFor(contactId) {
    return jobs().filter(function (j) { return j && j.contactId === contactId && j.quote && j.status !== 'done'; })
      .sort(function (a, b) { return (b.status === 'active') - (a.status === 'active') || (b.quote.sentAt || 0) - (a.quote.sentAt || 0); })[0] || null;
  }
  var billed = function (j) { return r2(sum((j && j.quote && j.quote.invoices) || [], function (x) { return x.amount; })); };
  function invLines() {
    var s = Q.inv, j = s.jobId ? job(s.jobId) : null, title = (j && j.title !== 'New estimate' ? j.title : '') || 'the project';
    var full = s.base;
    if (s.type === 'full') return s.lines;
    var amt = s.type === 'deposit' ? r2(full * (+s.pct || 0) / 100) : s.type === 'final' ? r2(full - s.billed) : r2(+s.amount || 0);
    var nm = s.type === 'deposit' ? 'Deposit (' + (+s.pct || 0) + '%): ' + title : s.type === 'final' ? 'Final balance: ' + title : 'Progress payment: ' + title;
    var ds = s.type === 'final' && s.billed ? 'Total ' + m2(full) + ' less ' + m2(s.billed) + ' already billed' : s.type === 'deposit' ? 'Of ' + m2(full) : '';
    return [{ name: nm, desc: ds, qty: 1, price: Math.max(0, amt) }];
  }
  window.bpInvoiceFrom = function (jid) { var j = job(jid); bpInvOpen(j ? j.contactId : null, jid); };
  window.bpInvOpen = async function (contactId, jobId) {
    if (window.bpEnsureContacts) { try { await bpEnsureContacts(); } catch (e) {} }
    Q.inv = { contactId: contactId || null, jobId: jobId || null, type: 'full', pct: defs().depositPct, amount: '', lines: [], base: 0, billed: 0, days: 7, via: 'sms', desc: '' };
    invLoad();
    if (window.bpNav) bpNav('invoicebuilder'); else invRender();
  };
  function invLoad() {
    var s = Q.inv, j = s.jobId ? job(s.jobId) : (s.contactId ? srcFor(s.contactId) : null);
    s.jobId = j ? j.id : null;
    if (j) {
      var c = calc(j);
      s.lines = c.lines.map(function (l) { return { id: uid('il'), name: l.name, desc: l.desc || '', qty: l.qty, price: l.price }; });
      s.base = c.total || +j.estimate || 0; s.billed = billed(j); s.desc = j.quote.desc || ''; s.via = j.quote.via || 'sms';
      if (s.disc == null) s.disc = c.disc;
      s.type = s.billed > 0 ? 'final' : 'full';
    } else { s.lines = [{ id: uid('il'), name: '', desc: '', qty: 1, price: '' }]; s.base = 0; s.billed = 0; s.disc = 0; }
  }
  window.bpInvoicePage = function () { if (!Q.inv) { bpInvOpen(); return; } invRender(); };
  function invRender() {
    var area = $('bpxViewArea'), s = Q.inv; if (!area || !s) return;
    var cs = window._bpContacts || [], j = s.jobId ? job(s.jobId) : null;
    var copts = '<option value="">Pick a customer…</option>' + cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.contactId ? ' selected' : '') + '>' + esc(c.name || c.phone || c.email || 'Contact') + '</option>'; }).join('');
    var T = [['full', 'Itemized'], ['deposit', 'Deposit %'], ['progress', 'Progress'], ['final', 'Final balance']];
    area.innerHTML = '<div class="qb">'
      + '<div class="qb-top"><button type="button" class="qb-back" onclick="bpNav(\'invoices\')"><span class="ms">arrow_back</span>Invoices</button></div>'
      + '<div class="qb-grid"><div class="qb-main">'
      + '<section class="qb-card"><div class="qb-ch"><span class="qb-n">1</span><b>Customer</b></div>'
        + '<label>Customer<select onchange="BPQ.invContact(this.value)">' + copts + '</select></label>'
        + (j ? '<div class="qb-from"><span class="ms">link</span><div><b>From the estimate: ' + esc(j.title === 'New estimate' ? 'Estimate' : j.title) + '</b><span>' + m2(s.base) + (s.billed ? ' · ' + m2(s.billed) + ' already billed' : '') + ' · everything below is filled in from it and can be changed</span></div>'
            + '<a onclick="bpQuoteOpen(\'' + j.id + '\')">Open estimate</a></div>'
          : (s.contactId ? '<p class="qb-hint">No estimate on file for this customer. Type the lines below, or <a onclick="bpQuoteNew(\'' + esc(s.contactId) + '\')">build an estimate first</a>.</p>' : '')) + '</section>'
      + '<section class="qb-card"><div class="qb-ch"><span class="qb-n">2</span><b>What you are billing</b></div>'
        + seg(s.type, T, 'BPQ.invType')
        + (s.type === 'deposit' ? '<div class="qb-f2"><label>Deposit %<input type="number" min="1" max="100" step="any" value="' + esc(s.pct) + '" oninput="BPQ.invSet(\'pct\',this.value,1)"></label><label>Of the total<input type="number" min="0" step="any" value="' + esc(s.base || '') + '" placeholder="0" oninput="BPQ.invSet(\'base\',this.value,1)"></label></div>' : '')
        + (s.type === 'progress' ? '<div class="qb-f2"><label>Amount<input type="number" min="0" step="any" value="' + esc(s.amount) + '" placeholder="0" oninput="BPQ.invSet(\'amount\',this.value,1)"></label><label>Project total<input type="number" min="0" step="any" value="' + esc(s.base || '') + '" placeholder="0" oninput="BPQ.invSet(\'base\',this.value,1)"></label></div>' : '')
        + (s.type === 'final' ? '<div class="qb-f2"><label>Project total<input type="number" min="0" step="any" value="' + esc(s.base || '') + '" placeholder="0" oninput="BPQ.invSet(\'base\',this.value,1)"></label><label>Already billed<input type="number" min="0" step="any" value="' + esc(s.billed || '') + '" placeholder="0" oninput="BPQ.invSet(\'billed\',this.value,1)"></label></div>' : '')
        + '<div id="qb-ilines"></div>'
        + '<label>Note on the invoice <small>optional</small><textarea rows="2" onchange="BPQ.invSet(\'desc\',this.value)">' + esc(s.desc || '') + '</textarea></label></section>'
      + '</div><aside class="qb-side"><div class="qb-sum" id="qb-isum"></div></aside></div></div>';
    invLinesDraw(); invPaint();
    if (window.bpSpin) bpSpin(false);
  }
  function invLinesDraw() {
    var el = $('qb-ilines'), s = Q.inv; if (!el) return;
    if (s.type !== 'full') { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="qb-rows"><div class="qb-rh qb-il"><span>Line</span><span>Qty</span><span>Price</span><span>Amount</span><span></span></div>'
      + s.lines.map(function (l) {
        return '<div class="qb-r qb-il"><input value="' + esc(l.name) + '" placeholder="What it is" onchange="BPQ.invRow(\'' + l.id + '\',\'name\',this.value)">'
          + '<input type="number" min="0" step="any" value="' + esc(l.qty) + '" oninput="BPQ.invRow(\'' + l.id + '\',\'qty\',this.value,1)" aria-label="Quantity">'
          + '<input type="number" min="0" step="any" value="' + esc(l.price) + '" placeholder="0" oninput="BPQ.invRow(\'' + l.id + '\',\'price\',this.value,1)" aria-label="Price">'
          + '<b id="qb-il-' + l.id + '">' + m2((+l.qty || 0) * (+l.price || 0)) + '</b>'
          + '<button type="button" class="qb-x" aria-label="Remove" onclick="BPQ.invDel(\'' + l.id + '\')">&times;</button></div>';
      }).join('') + '</div><div class="qb-adds"><button type="button" class="qb-add" onclick="BPQ.invAdd()"><span class="ms">add</span>Add line</button></div>';
  }
  function invPaint() {
    var el = $('qb-isum'), s = Q.inv; if (!el) return;
    var ls = invLines(), sub = r2(sum(ls, function (l) { return r2((+l.qty || 0) * (+l.price || 0)); })), disc = s.type === 'full' ? Math.min(r2(s.disc || 0), sub) : 0, tot = r2(sub - disc);
    var ct = contactBy(s.contactId);
    el.innerHTML = '<div class="qb-sh"><b>Invoice</b><span>' + esc(ct ? ct.name : 'No customer yet') + '</span></div>'
      + ls.map(function (l) { return '<div class="qb-sr"><span>' + esc(l.name || 'Line') + '</span><span class="qb-sc"></span><b>' + m0((+l.qty || 0) * (+l.price || 0)) + '</b></div>'; }).join('')
      + (disc ? '<div class="qb-sr"><span>Discount</span><span class="qb-sc"></span><b>-' + m0(disc) + '</b></div>' : '')
      + '<div class="qb-tot"><span>Amount due</span><b>' + m2(tot) + '</b></div>'
      + (s.base ? '<div class="qb-left"><span>Project total ' + m0(s.base) + '</span><span>After this: ' + m0(Math.max(0, s.base - s.billed - tot)) + ' left to bill</span></div>' : '')
      + '<div class="qb-opt qb-opt2"><label>Due<select onchange="BPQ.invSet(\'days\',this.value,1)">' + [[0, 'On receipt'], [7, 'In 7 days'], [14, 'In 14 days'], [30, 'In 30 days']].map(function (d) { return '<option value="' + d[0] + '"' + (+s.days === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('') + '</select></label>'
        + '<label>Send by<select onchange="BPQ.invSet(\'via\',this.value)"><option value="sms"' + (s.via === 'sms' ? ' selected' : '') + '>Text</option><option value="email"' + (s.via === 'email' ? ' selected' : '') + '>Email</option><option value="both"' + (s.via === 'both' ? ' selected' : '') + '>Both</option></select></label></div>'
      + '<div class="qb-msg" id="qb-imsg"></div>'
      + '<div class="qb-acts"><button type="button" class="qb-b ghost" onclick="BPQ.invPreview()"><span class="ms">visibility</span>Preview</button><button type="button" class="qb-b pri" id="qb-isend" onclick="BPQ.invSend()"><span class="ms">send</span>Send invoice</button></div>';
  }
  Q.invContact = function (cid) { Q.inv.contactId = cid || null; Q.inv.jobId = null; Q.inv.disc = null; invLoad(); invRender(); };
  Q.invType = function (t) {
    var s = Q.inv; s.type = t;
    if (t === 'full' && s.lines.length === 1 && !s.lines[0].name && s.base) s.lines = [{ id: uid('il'), name: 'Project', desc: '', qty: 1, price: s.base }];
    invRender();
  };
  Q.invSet = function (k, v, isNum) { Q.inv[k] = isNum ? Math.max(0, num(v)) : v; invPaint(); };
  Q.invRow = function (id, k, v, isNum) {
    var l = Q.inv.lines.filter(function (x) { return x.id === id; })[0]; if (!l) return;
    l[k] = isNum ? (String(v).trim() === '' ? '' : Math.max(0, num(v))) : v;
    var b = $('qb-il-' + id); if (b) b.textContent = m2((+l.qty || 0) * (+l.price || 0));
    invPaint();
  };
  Q.invAdd = function () { Q.inv.lines.push({ id: uid('il'), name: '', desc: '', qty: 1, price: '' }); invLinesDraw(); invPaint(); };
  Q.invDel = function (id) { Q.inv.lines = Q.inv.lines.filter(function (x) { return x.id !== id; }); invLinesDraw(); invPaint(); };
  Q.invPreview = function () {
    var s = Q.inv, ct = contactBy(s.contactId), ls = invLines().filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0; });
    bpModal('<h3>What ' + esc(ct ? ct.name : 'your customer') + ' sees</h3>' + doc('inv', { lines: ls, disc: s.type === 'full' ? r2(s.disc || 0) : 0, cust: ct ? ct.name : '', days: +s.days, desc: s.desc })
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '760px'; mc.style.width = '95vw'; }
  };
  Q.invSend = async function () {
    var s = Q.inv, msg = $('qb-imsg'), btn = $('qb-isend'), ct = contactBy(s.contactId), j = s.jobId ? job(s.jobId) : null;
    var say = function (t, ok) { if (msg) { msg.className = 'qb-msg ' + (ok ? 'ok' : 'err'); msg.textContent = t; } };
    var ls = invLines().filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0; });
    var sub = r2(sum(ls, function (l) { return r2((+l.qty || 0) * (+l.price || 0)); })), disc = s.type === 'full' ? Math.min(r2(s.disc || 0), sub) : 0, tot = r2(sub - disc);
    if (!s.contactId || !ct) return say('Pick the customer first.');
    if (!(tot > 0)) return say('The invoice is $0. Add a line or an amount.');
    if (s.via !== 'email' && !ct.phone) return say('This customer has no phone number. Send by email instead.');
    if (s.via !== 'sms' && !ct.email) return say('This customer has no email. Send by text instead.');
    var jt = j && j.title !== 'New estimate' ? j.title : '';
    /* the words Deposit / Final in the title drive the contact tags and workflows */
    var title = s.type === 'deposit' ? 'Deposit' + (jt ? ': ' + jt : '') : s.type === 'final' ? 'Final balance' + (jt ? ': ' + jt : '') : s.type === 'progress' ? 'Progress payment' + (jt ? ': ' + jt : '') : (jt || 'Invoice');
    btn.disabled = true; say('Sending…', true);
    try {
      var d = await post(GHL_INV_URL, { action: 'create', contactId: s.contactId, contactName: ct.name || 'Customer', phone: ct.phone || '', email: ct.email || '',
        title: title, amount: tot, items: gItems(ls), discount: disc, description: s.desc || '', send: s.via, businessName: biz(), dueDays: +s.days });
      if (d && d.ok) {
        if (j) { quoteOf(j).invoices.push({ id: d.id || uid('inv'), type: s.type, amount: tot, at: Date.now() }); save(true); }
        toast('Invoice sent to ' + (ct.name || 'the customer') + '.', 'success');
        Q.inv = null; bpNav('invoices');
      } else { say('Couldn’t send: ' + String((d && d.error) || 'unknown error')); btn.disabled = false; }
    } catch (e) { say('Network error. Try again.'); btn.disabled = false; }
  };

  /* ================================================================
     Estimate sheets on the Estimates page
     ================================================================ */
  window.bpQbSheets = function () {
    var el = $('bpxQbSheets'); if (!el) return;
    var list = jobs().filter(function (j) { return j && j.status === 'quote' && hasWork(j); }).sort(function (a, b) { return ((b.quote || {}).sentAt || b.createdAt || 0) - ((a.quote || {}).sentAt || a.createdAt || 0); });
    el.innerHTML = '<div class="bpx-panel qb-sheets"><div class="bpx-chead" style="margin-bottom:10px"><div class="bpx-ptitle" style="margin:0">Estimate sheets<span class="lg2">materials, labor and markup worked out, waiting on a yes</span></div>'
      + '</div>'
      + (list.length ? '<div class="pjl">' + list.map(function (j) {
        var c = calc(j), q = j.quote;
        return '<div class="pjl-r qb-shr" onclick="bpQuoteOpen(\'' + j.id + '\')"><span class="pjk-av"><span class="ms">request_quote</span></span>'
          + '<div class="pjl-id"><b>' + esc(j.contactId ? j.name : 'No customer yet') + '</b><span>' + esc(j.title === 'New estimate' ? 'Untitled' : j.title) + '</span></div>'
          + '<div class="pjl-st"><span class="pjk-tag' + (q.estId ? ' on' : '') + '">' + (q.estId ? 'Sent' : 'Draft') + '</span></div>'
          + '<div class="pjl-m"><b>' + m0(c.total) + '</b><small>' + c.margin + '% margin</small></div>'
          + '<div class="pjl-a"><button class="pjl-b" onclick="event.stopPropagation();bpQuoteOpen(\'' + j.id + '\')">Open</button>'
            + (q.estId ? '<button class="pjl-b pri" onclick="event.stopPropagation();bpInvoiceFrom(\'' + j.id + '\')">Invoice</button>' : '') + '</div></div>';
      }).join('') + '</div>' : '<div class="pjk-empty">No estimate sheets yet. <a onclick="bpQuoteNew()">Build one</a>: materials, labor and other costs with your markup, and you see the profit before you send it.</div>')
      + '</div>';
  };

  /* ================================================================
     When the deposit lands: the project takes the sheet over
     ================================================================ */
  function budgetOf(j) {
    var c = calc(j), b = {};
    if (c.matCost) b['Materials'] = c.matCost; if (c.labCost) b['Labor / crew'] = c.labCost;
    (j.quote.other || []).forEach(function (o) { var k = o.cat === 'Permits' ? 'Permits' : o.cat === 'Subcontractor' ? 'Subcontractor' : 'Other'; b[k] = r2((b[k] || 0) + (+o.cost || 0)); });
    return b;
  }
  /* a quote whose customer now has an active project: move everything onto it */
  window.bpQuoteAdopt = function () {
    var all = jobs(), changed = false;
    all.filter(function (j) { return j && j.status === 'quote' && j.contactId && hasWork(j); }).forEach(function (qj) {
      var act = all.filter(function (j) { return j && j.status === 'active' && j.contactId === qj.contactId && !j.quote; })[0];
      if (!act) return;
      var c = calc(qj);
      act.quote = qj.quote;
      if (!(act.materials && act.materials.items && act.materials.items.length)) act.materials = qj.materials;
      if (!act.budget || !Object.keys(act.budget).length) act.budget = budgetOf(qj);
      if (!(+act.estimate > 0)) act.estimate = c.total;
      if (!act.addr && qj.addr) act.addr = qj.addr;
      if ((!act.title || act.title === 'Job') && qj.title && qj.title !== 'New estimate') act.title = qj.title;
      qj._gone = true; changed = true;
    });
    /* a sheet the deposit webhook turned into the project: give it its budget */
    all.forEach(function (j) { if (j && j.status === 'active' && j.quote && j.materials && (!j.budget || !Object.keys(j.budget).length)) { var b = budgetOf(j); if (Object.keys(b).length) { j.budget = b; changed = true; } } });
    if (changed) { var left = all.filter(function (j) { return !j._gone; }); all.length = 0; Array.prototype.push.apply(all, left); save(true); }
    return changed;
  };
  /* marking a deal won in the portal: promote the sheet rather than start a blank job */
  var jfd = window.bpJobFromDeal;
  if (typeof jfd === 'function') {
    window.bpJobFromDeal = function (o) {
      var qj = o && o.contactId ? jobs().filter(function (j) { return j.status === 'quote' && j.contactId === o.contactId; })[0] : null;
      if (!qj) return jfd.apply(this, arguments);
      qj.status = 'active'; qj.wonAt = Date.now(); qj.dealId = o.dealId || null;
      if (!(+qj.estimate > 0) && o.estimate) qj.estimate = +o.estimate;
      if (!qj.budget) qj.budget = budgetOf(qj);
      save(true);
    };
  }
  setTimeout(function () { try { bpQuoteAdopt(); } catch (e) {} }, 4000);
  setInterval(function () { try { bpQuoteAdopt(); } catch (e) {} }, 120000);
})();
