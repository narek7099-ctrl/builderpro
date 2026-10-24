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
    return { mkMat: d('mkMat', 20), mkLab: d('mkLab', 25), mkOth: d('mkOth', 10), taxPct: d('taxPct', (Q.stateTax && Q.stateTax()) ? Q.stateTax().rate : 0), taxOn: d('taxOn', 'materials'),
      show: d('show', 'items'), validDays: d('validDays', 14), depositPct: d('depositPct', 50), gbbMode: s.gbbMode === 'pick' ? 'pick' : 'choose' };
  }
  Q.saveDefaults = function () {
    var j = job(Q.id); if (!j) return; var q = j.quote;
    try {
      var st = bpSettingsGet() || {};
      st.quoteDefaults = { mkMat: q.mkMat, mkLab: q.mkLab, mkOth: q.mkOth, taxPct: q.taxPct, taxOn: q.taxOn, show: q.show, validDays: q.validDays, depositPct: (st.quoteDefaults || {}).depositPct || 50, gbbMode: (st.quoteDefaults || {}).gbbMode || 'choose' };
      bpSettingsSet(st); if (window.bpSettingsPush) bpSettingsPush(st);
      toast('Saved. New estimates start with these markups.', 'success');
    } catch (e) {}
  };

  /* ---------- sales tax: a starting rate from the business's state ----------
     The statewide base rate only. Cities and counties add their own on top,
     so the contractor checks it and saves their real rate as the default. */
  var STATE_TAX = { AL: 4, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35, DE: 0, DC: 6, FL: 6, GA: 4, HI: 4, ID: 6, IL: 6.25, IN: 7, IA: 6, KS: 6.5, KY: 6,
    LA: 5, ME: 5.5, MD: 6, MA: 6.25, MI: 6, MN: 6.875, MS: 7, MO: 4.225, MT: 0, NE: 5.5, NV: 6.85, NH: 0, NJ: 6.625, NM: 4.875, NY: 4, NC: 4.75, ND: 5, OH: 5.75,
    OK: 4.5, OR: 0, PA: 6, RI: 7, SC: 6, SD: 4.2, TN: 7, TX: 6.25, UT: 6.1, VT: 6, VA: 5.3, WA: 6.5, WV: 6, WI: 5, WY: 4 };
  var STATE_NAMES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC' };
  function bizState() {
    var a = ''; try { a = String(((bpSettingsGet() || {}).company || {}).address || ''); } catch (e) {}
    var m = a.match(/\b([A-Z]{2})\b\s*\d{5}/) || a.match(/,\s*([A-Z]{2})\s*(?:,|$)/);
    if (m && STATE_TAX[m[1]] != null) return m[1];
    var low = a.toLowerCase(), hit = '';
    Object.keys(STATE_NAMES).forEach(function (n) { if (low.indexOf(n) > -1 && n.length > hit.length) hit = n; });
    return hit ? STATE_NAMES[hit] : '';
  }
  Q.stateTax = function () { var s = bizState(); return s ? { st: s, rate: STATE_TAX[s] } : null; };
  Q.saveTax = function (v) {
    try { var st = bpSettingsGet() || {}; st.quoteDefaults = Object.assign({}, st.quoteDefaults || {}, { taxPct: Math.max(0, num(v)) }); bpSettingsSet(st); if (window.bpSettingsPush) bpSettingsPush(st);
      toast('Saved. New estimates and invoices start at ' + Math.max(0, num(v)) + '% tax.', 'success'); } catch (e) {}
  };

  /* ---------- the sheet lives on a job ---------- */
  var jobs = function () { return window.bpJobsGet ? bpJobsGet() : []; };
  var job = function (id) { return jobs().filter(function (j) { return j && j.id === id; })[0] || (id === 'jsample' && Q._sample) || null; };
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
  function calcBase(j, showAs) {
    var q = quoteOf(j), mats = j.materials.items, show = showAs || q.show;
    var matCost = r2(sum(mats, function (it) { return (+it.qty || 0) * (+it.price || 0); }));
    var labCost = r2(sum(q.labor, function (l) { return labHrs(l) * (+l.rate || 0); }));
    var othCost = r2(sum(q.other, function (o) { return +o.cost || 0; }));
    var matPrice = r2(matCost * f(q.mkMat)), labPrice = r2(labCost * f(q.mkLab)), othPrice = r2(othCost * f(q.mkOth));
    var lines = [];
    if (show === 'items') {
      mats.forEach(function (it) { var qty = +it.qty || 0, u = r2((+it.price || 0) * f(q.mkMat)); if (qty > 0 && u > 0) lines.push({ name: it.name || 'Material', desc: it.note || '', qty: qty, price: u, unit: it.unit || 'ea', sec: 'mat' }); });
      q.labor.forEach(function (l) { var h = r2(labHrs(l)), u = r2((+l.rate || 0) * f(q.mkLab)); if (h > 0 && u > 0) lines.push({ name: 'Labor' + (l.name ? ': ' + l.name : ''), desc: (Math.max(1, +l.people || 1) > 1 ? (+l.people) + ' people × ' + (+l.hours || 0) + ' hrs' : ''), qty: h, price: u, unit: 'hr', sec: 'lab' }); });
      q.other.forEach(function (o) { var u = r2((+o.cost || 0) * f(q.mkOth)); if (u > 0) lines.push({ name: o.name || 'Other', desc: '', qty: 1, price: u, sec: 'oth' }); });
    } else if (show === 'total') {
      var t = r2(matPrice + labPrice + othPrice); if (t > 0) lines.push({ name: j.title || 'Project', desc: q.desc || '', qty: 1, price: t, sec: 'all' });
    } else {
      if (matPrice > 0) lines.push({ name: 'Materials', desc: mats.length + ' item' + (mats.length === 1 ? '' : 's'), qty: 1, price: matPrice, sec: 'mat' });
      if (labPrice > 0) lines.push({ name: 'Labor', desc: r2(sum(q.labor, labHrs)) + ' hours', qty: 1, price: labPrice, sec: 'lab' });
      if (othPrice > 0) lines.push({ name: q.other.length === 1 ? (q.other[0].name || 'Other costs') : 'Other costs', desc: q.other.length > 1 ? q.other.map(function (o) { return o.name; }).filter(Boolean).join(', ') : '', qty: 1, price: othPrice, sec: 'oth' });
    }
    var sub = r2(sum(lines, function (l) { return r2(l.qty * l.price); }));
    var base = q.taxOn === 'all' ? sub : Math.min(sub, show === 'items' ? r2(sum(lines.filter(function (l) { return l.sec === 'mat'; }), function (l) { return r2(l.qty * l.price); })) : matPrice);
    var tax = r2(base * (+q.taxPct || 0) / 100);
    if (tax > 0) lines.push({ name: 'Sales tax (' + (+q.taxPct) + '%' + (q.taxOn === 'all' ? '' : ' on materials') + ')', desc: '', qty: 1, price: tax, sec: 'tax' });
    var disc = Math.max(0, Math.min(r2(q.discount), r2(sub + tax)));
    var total = r2(sub + tax - disc), cost = r2(matCost + labCost + othCost), profit = r2(total - tax - cost), net = r2(sub - disc);
    return { lines: lines, matCost: matCost, labCost: labCost, othCost: othCost, matPrice: matPrice, labPrice: labPrice, othPrice: othPrice,
      sub: sub, tax: tax, disc: disc, total: total, cost: cost, profit: profit, margin: net > 0 ? Math.round(profit / net * 1000) / 10 : 0 };
  }
  /* once the customer has picked one of the Good / Better / Best options, the
     sheet IS that option: its lines and price go to the invoice, the payment
     plan and the project; costs scale with it so profit stays honest */
  function picked(j) {
    var o = j.quote && j.quote.opt;
    if (!o || !Array.isArray(o.sent)) return null;
    /* one option sent on its own is the price from the moment it goes out */
    if (o.sent.length === 1 && o.status !== 'void' && gb(j).on) return o.sent[0];
    if (o.status !== 'chosen' || !o.chosen) return null;
    return o.sent.filter(function (t) { return t && t.key === o.chosen; })[0] || null;
  }
  function calc(j) {
    var c = calcBase(j), t = picked(j); if (!t) return c;
    var q = j.quote, tc = tierCalc(j, t.lines || []);
    var lines = (t.lines || []).map(function (l) { return { name: l.name, desc: l.desc || '', qty: +l.qty || 1, price: +l.price || 0, unit: l.unit || 'ea', sec: l.sec || 'oth' }; });
    if (tc.tax > 0) lines.push({ name: 'Sales tax (' + (+q.taxPct) + '%' + (q.taxOn === 'all' ? '' : ' on materials') + ')', desc: '', qty: 1, price: tc.tax, sec: 'tax' });
    var k = c.sub > 0 ? tc.sub / c.sub : 1;
    var out = Object.assign({}, c, { lines: lines, sub: tc.sub, tax: tc.tax, disc: tc.disc, total: tc.total,
      matCost: r2(c.matCost * k), labCost: r2(c.labCost * k), othCost: r2(c.othCost * k), cost: r2(c.cost * k), tier: t.key });
    var net = r2(tc.sub - tc.disc); out.profit = r2(tc.total - tc.tax - out.cost); out.margin = net > 0 ? Math.round(out.profit / net * 1000) / 10 : 0;
    return out;
  }
  /* tax and discount on one option's lines, the same way the server works it out */
  function tierCalc(j, lines) {
    var q = quoteOf(j);
    var sub = r2(sum(lines, function (l) { return r2((+l.qty || 0) * (+l.price || 0)); }));
    var mat = r2(sum(lines.filter(function (l) { return l.sec === 'mat' || l.sec === 'all'; }), function (l) { return r2((+l.qty || 0) * (+l.price || 0)); }));
    var tax = r2((q.taxOn === 'all' ? sub : mat) * Math.max(0, Math.min(20, +q.taxPct || 0)) / 100);
    var disc = Math.max(0, Math.min(r2(q.discount), r2(sub + tax)));
    return { sub: sub, tax: tax, disc: disc, total: r2(sub + tax - disc) };
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
  window.bpQuoteOpen = function (id, mode) {
    if (Q.id !== id) Q.step = null;   /* each sheet opens on its own step, not the last one's */
    Q.id = id; tidy(id);
    /* an estimate opens as the estimate; an empty one opens ready to fill in */
    var j0 = job(id); Q.mode = mode || (j0 && hasWork(j0) && calc(j0).total > 0 ? 'view' : 'edit');
    if (window.bpNav) bpNav('quote'); else render();
  };
  window.bpEstOpen = function () { bpQuoteNew(); };

  /* ---------- page ----------
     Left: the job, then materials, labor and other costs, all open.
     Right: one summary that stays in view, with the price, tax, what the
     customer sees and the buttons. Built from the app's own panels. */
  var seg = function (cur, opts, fn) { return '<div class="bpx-bulk-tabs qx-seg">' + opts.map(function (o) { return '<button type="button" class="' + (cur === o[0] ? 'on' : '') + '" onclick="' + fn + '(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>'; };
  var mk = function (k, v) { return '<label class="qx-mk">Mark-up<span class="qx-in"><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(v) + '" oninput="BPQ.set(\'' + k + '\',this.value,1)"><i>%</i></span></label>'; };
  var sec = function (n, title, sub, right, body, id) { return '<section class="bpx-panel qx-sec"' + (id ? ' id="' + id + '"' : '') + '><div class="qx-ph"><span class="qx-n">' + n + '</span><div class="qx-pt"><div class="bpx-ptitle">' + title + '</div><p>' + sub + '</p></div>' + right + '</div>' + body + '</section>'; };
  Q.edit = function (on) { Q.mode = on ? 'edit' : 'view'; render(); var m = document.querySelector('.bpx-main'); if (m) m.scrollTop = 0; };
  /* the estimate as the customer gets it, with what to do next */
  function renderView(area, j) {
    var q = quoteOf(j), c = calc(j), ct = contactBy(j.contactId);
    var G = gb(j), o = q.opt, os = optState(j), multi = o && o.sent ? o.sent.length > 1 : G.on && G.tiers && tiersOut(j).length > 1;
    var badge = os ? '<span class="bpx-badge qg-st ' + os.cls + '">' + os.t + '</span>' : '<span class="bpx-badge' + (q.estId ? ' qx-sent' : '') + '">' + (q.estId ? 'Sent ' + new Date(q.sentAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Draft') + '</span>';
    var paper = multi ? '<div class="qx-paper qg-paper">' + (j.title && j.title !== 'New estimate' ? '<div class="qg-pvt">' + esc(j.title) + '</div>' : '') + (q.desc ? '<p class="qg-pvd">' + esc(q.desc) + '</p>' : '')
        + optsHtml(j, o && o.sent && o.sent.length ? o.sent : tiersOut(j), (o && o.rec) || G.rec, o && o.status === 'chosen' ? o.chosen : '') + '</div>'
      : '<div class="qx-paper">' + doc('est', { lines: c.lines, disc: c.disc, cust: j.contactId ? j.name : '', days: +q.validDays, title: j.title === 'New estimate' ? '' : j.title, desc: q.desc }) + '</div>';
    var optRows = o && o.sent ? '<tr><td>' + (o.sent.length > 1 ? 'Options' : 'Status') + '</td><td></td><td>' + esc(os ? os.t : '') + '</td></tr>'
        + (o.status === 'chosen' ? '<tr><td>Signed by</td><td></td><td>' + esc(o.signer || '') + '</td></tr>' : '')
        + (o.status === 'declined' && o.note ? '<tr><td>They said</td><td></td><td>' + esc(o.note) + '</td></tr>' : '') : '';
    var tone = c.margin >= 20 ? 'good' : c.margin >= 10 ? 'ok' : 'low';
    area.innerHTML = '<div class="qx qx-view">'
      + '<a class="qx-back" onclick="bpNav(\'estimates\')">&larr; Estimates</a>'
      + '<div class="bpx-chead"><div class="qx-h"><h2>' + esc(j.title === 'New estimate' ? 'Estimate' : j.title) + '</h2>' + badge + '</div>'
        + '<div class="qx-acts"><button class="bpx-btn ghost" onclick="BPQ.edit(1)">Edit estimate</button>'
        + (o && o.link && o.status === 'sent' ? '<button class="bpx-btn ghost" onclick="BPQ.optLink()">Copy link</button>' : '')
        + (q.estId && !(o && o.status === 'sent' && (o.sent || []).length > 1) ? '<button class="bpx-btn ghost" onclick="bpInvoiceFrom(\'' + j.id + '\')">Make invoice</button>' : '')
        + (o && o.status === 'chosen' ? '' : '<button class="bpx-addbtn" id="qb-send" onclick="BPQ.send()">' + (q.estId ? (multi ? 'Send options again' : 'Send again') : G.on && G.tiers ? sendLabel(j) : 'Send to ' + esc(String(j.contactId ? j.name : 'customer').split(' ')[0])) + '</button>') + '</div></div>'
      + '<div class="qb-msg" id="qb-msg"></div>'
      + (o && o.status === 'chosen' ? '<div class="qg-won"><span class="ms">task_alt</span><div><b>' + esc(j.name.split(' ')[0]) + ((o.sent || []).length > 1 ? ' picked ' + esc((TK.filter(function (t) { return t[0] === o.chosen; })[0] || [0, ''])[1]) : ' approved the estimate') + ': ' + m2(c.total) + '</b><small>Signed' + (o.signer ? ' by ' + esc(o.signer) : '') + (o.at ? ' on ' + new Date(o.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '') + '. It’s now the accepted estimate, so the deposit and the rest of your follow-up run as usual.</small></div></div>' : '')
      + '<div class="qx-vgrid' + (multi ? ' qg-vgrid' : '') + '">' + paper
      + '<aside class="bpx-panel qx-priv"><div class="bpx-ptitle">Only you see this</div>'
        + '<table class="qx-st"><tbody><tr><td>Your cost</td><td></td><td>' + m2(c.cost) + '</td></tr><tr><td>Mark-up</td><td></td><td>' + m2(Math.max(0, c.total - c.tax - c.cost + c.disc)) + '</td></tr>'
        + (c.tax ? '<tr><td>Tax</td><td></td><td>' + m2(c.tax) + '</td></tr>' : '') + '</tbody></table>'
        + '<div class="qx-profit ' + tone + '"><span>Profit <b>' + m0(c.profit) + '</b></span><span>Margin <b>' + c.margin + '%</b></span></div>'
        + '<table class="qx-st qx-st2"><tbody><tr><td>Customer</td><td></td><td>' + esc(ct ? ct.name : j.contactId ? j.name : '—') + '</td></tr>'
        + optRows
        + '<tr><td>Sends by</td><td></td><td>' + ({ sms: 'Text', email: 'Email', both: 'Text and email' }[q.via] || 'Text') + '</td></tr>'
        + '<tr><td>Valid for</td><td></td><td>' + (+q.validDays || 14) + ' days</td></tr></tbody></table>'
        + '<div class="qx-foot"><a onclick="BPQ.edit(1)">Change anything</a><button class="bpx-delbtn" onclick="BPQ.remove()">Delete ' + (q.estId ? 'estimate' : 'draft') + '</button></div></aside></div>'
      + '</div>';
    if (window.bpSpin) bpSpin(false);
  }
  /* ---------- the builder, one step at a time ----------
     Job, Materials, Labor, Other costs, Price, then (when they get a choice)
     Good / Better / Best, then Review and send. Each step is its own screen:
     on a phone the bottom bar carries the running total and Back / Next; on
     a computer the summary stays on the right. */
  var STEPS = { job: 'Job', mat: 'Materials', lab: 'Labor', oth: 'Other costs', price: 'Price', opts: 'Good · Better · Best', send: 'Review & send' };
  var SHORT = { job: 'Job', mat: 'Materials', lab: 'Labor', oth: 'Other', price: 'Price', opts: 'Options', send: 'Send' };
  function stepsOf(j) { return ['job', 'mat', 'lab', 'oth', 'price'].concat(gb(j).on ? ['opts'] : []).concat(['send']); }
  function curStep(j) { var s = stepsOf(j), st = Q.step || (j.quote && j.quote.step) || 'job'; return s.indexOf(st) > -1 ? st : s[0]; }
  var focusMode = function (on) { var x = $('bpx'); if (x) x.classList.toggle('qs-focus', !!on); if (!on) undock(); };
  /* on a phone the bar sits on the bottom of the screen; the page's slide-in
     animation would pin a fixed bar to the page instead, so it moves out */
  function undock() { var d = document.querySelectorAll('#bpx > .qs-bar'); for (var i = 0; i < d.length; i++) d[i].remove(); }
  function dock() {
    undock();
    var b = document.querySelector('#bpxViewArea .qs-bar'), x = $('bpx');
    if (b && x && window.matchMedia && matchMedia('(max-width: 820px)').matches) x.appendChild(b);
    var on = document.querySelector('.qs-steps .qs-st.on'), nav = on && on.parentNode;
    if (on && nav && nav.scrollTo) nav.scrollTo({ left: Math.max(0, on.offsetLeft - 40) });
  }
  /* leaving the builder gives the tab bar back */
  var navWas = window.bpNav;
  if (typeof navWas === 'function' && !navWas._qs) { window.bpNav = function (v) { if (v !== 'quote' && v !== 'invoicebuilder') focusMode(false); return navWas.apply(this, arguments); }; window.bpNav._qs = 1; }
  Q.go = function (st) {
    var j = job(Q.id); if (!j) return;
    if (st === 'next' || st === 'back') { var s = stepsOf(j), i = s.indexOf(curStep(j)); st = s[Math.max(0, Math.min(s.length - 1, i + (st === 'next' ? 1 : -1)))]; }
    Q.step = st; quoteOf(j).step = st; save();
    var a = document.activeElement; if (a && a.blur) a.blur();
    render(); scrollTop();
  };
  function scrollTop() { if (window.bpScrollTop) { try { bpScrollTop(); return; } catch (e) {} } var m = document.querySelector('.bpx-main'); if (m) m.scrollTop = 0; }
  Q.close = function () { var j = job(Q.id); focusMode(false); if (j && hasWork(j) && calc(j).total > 0) { Q.mode = 'view'; render(); scrollTop(); } else bpNav('estimates'); };
  function stepBar(j, cur) {
    var s = stepsOf(j), i = s.indexOf(cur);
    return '<nav class="qs-steps" aria-label="Steps">' + s.map(function (k, n) {
      return '<button type="button" class="qs-st' + (k === cur ? ' on' : n < i ? ' done' : '') + '" onclick="BPQ.go(\'' + k + '\')"' + (k === cur ? ' aria-current="step"' : '') + '><i>' + (n < i ? '<span class="ms">check</span>' : n + 1) + '</i><span>' + SHORT[k] + '</span></button>';
    }).join('') + '</nav>';
  }
  function head(j, q, cur) {
    var s = stepsOf(j);
    return '<div class="qs-head"><div class="qs-hrow"><a class="qx-back" onclick="BPQ.close()">&larr; ' + (hasWork(j) && calc(j).total > 0 ? 'Save and close' : 'Estimates') + '</a>'
        + '<span class="qs-count">Step ' + (s.indexOf(cur) + 1) + ' of ' + s.length + '</span></div>'
      + '<div class="qx-h"><h2>' + esc(j.title === 'New estimate' ? 'New estimate' : j.title) + '</h2><span class="bpx-badge' + (q.estId ? ' qx-sent' : '') + '">' + (q.estId ? 'Sent ' + new Date(q.sentAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Draft') + '</span></div>'
      + stepBar(j, cur) + '</div>';
  }
  function card(title, sub, right, body, cls) {
    return '<section class="bpx-panel qs-card' + (cls ? ' ' + cls : '') + '"><div class="qs-ch"><div><h3>' + title + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (right || '') + '</div>' + body + '</section>';
  }
  function sendLabel(j) {
    var q = j.quote;
    var again = q.opt && q.opt.status === 'sent';
    if (!gb(j).on) return again || q.estId ? 'Send updated estimate' : 'Send estimate';
    if (!gb(j).tiers) return 'Build the options first';
    var ts = tiersOut(j);
    if (gb(j).mode === 'pick') return ts.length ? (again ? 'Resend ' : 'Send ') + ts[0].name + ' · ' + m0(tierCalc(j, ts[0].lines).total) : 'Send your pick';
    return (again ? 'Resend ' : 'Send ') + (ts.length || 3) + ' options to choose from';
  }
  /* one option going out alone: its lines, with tax, as a normal estimate */
  function tierAsSheet(j, t) {
    var tc = tierCalc(j, t.lines);
    return { key: t.key, name: t.name, title: t.title, summary: t.summary, bullets: t.bullets, warranty: t.warranty, lines: t.lines, sub: tc.sub, tax: tc.tax, disc: tc.disc, total: tc.total };
  }
  function bar(j, cur) {
    var s = stepsOf(j), i = s.indexOf(cur), last = i === s.length - 1;
    return '<div class="qs-bar" id="qs-bar">'
      + (i > 0 ? '<button type="button" class="qs-back" onclick="BPQ.go(\'back\')" aria-label="Back"><span class="ms">arrow_back</span></button>' : '')
      + '<button type="button" class="qs-tot" onclick="BPQ.sumSheet()"><small id="qs-totl">Customer pays</small><b id="qs-totv">$0.00</b><em id="qs-totm"></em></button>'
      + (last ? '<button type="button" class="qs-next" id="qb-send" onclick="BPQ.send()">' + sendLabel(j) + '</button>'
        : '<button type="button" class="qs-next" onclick="BPQ.go(\'next\')">' + (s[i + 1] === 'send' ? 'Review' : 'Next: ' + SHORT[s[i + 1]]) + '<span class="ms">arrow_forward</span></button>')
      + '</div>';
  }
  function stepBody(j, q, cur) {
    if (cur === 'job') {
      var cs = window._bpContacts || [];
      var copts = '<option value="">Pick a customer…</option>' + cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === j.contactId ? ' selected' : '') + '>' + esc(c.name || c.phone || c.email || 'Contact') + '</option>'; }).join('')
        + (j.contactId && !contactBy(j.contactId) ? '<option value="' + esc(j.contactId) + '" selected>' + esc(j.name) + '</option>' : '')
        + (window.bpOpenAdd ? '<option value="__new">+ Add a new customer…</option>' : '');
      return card('Who and where', 'The customer, the job and what you will do.', '',
          '<label class="qs-f">Customer<select id="qb-c" onchange="BPQ.contact(this.value)">' + copts + '</select></label>'
          + '<label class="qs-f">Job title<input value="' + esc(j.title === 'New estimate' ? '' : j.title) + '" placeholder="e.g. Roof replacement" onchange="BPQ.setJ(\'title\',this.value);var h=document.querySelector(\'.qs-head .qx-h h2\');if(h)h.textContent=this.value||\'New estimate\'"></label>'
          + '<label class="qs-f">Job site address<input value="' + esc(j.addr || '') + '" placeholder="Where the work is" onchange="BPQ.setJ(\'addr\',this.value)"></label>'
          + '<label class="qs-f">Scope of work <small>printed on the estimate</small><textarea rows="4" placeholder="What you will do, what is included, what is not" onchange="BPQ.set(\'desc\',this.value)">' + esc(q.desc || '') + '</textarea></label>');
    }
    if (cur === 'mat') return card('Materials', 'Quantity &times; your price for each item. This list is also the job&rsquo;s order list.', mk('mkMat', q.mkMat),
          '<div class="qx-warn" id="qx-matwarn" hidden></div><div id="qb-mat">' + (window.ML && ML.editor ? ML.editor('job', j.id) : '') + '</div>', 'qs-mat');
    if (cur === 'lab') return card('Labor', 'People &times; hours &times; cost an hour. Pick an employee to use their rate with payroll costs included.', mk('mkLab', q.mkLab), '<div id="qb-lab"></div>');
    if (cur === 'oth') return card('Other costs', 'Permits, dumpster, equipment, subcontractors: anything else the job costs you.', mk('mkOth', q.mkOth), '<div id="qb-oth"></div>');
    if (cur === 'price') {
      var stx = Q.stateTax(), G = gb(j);
      return card('The price', 'What it costs you, your mark-up, and what the customer pays.', '', '<div id="qs-price"></div>'
          + '<div class="qs-f2"><label class="qs-f">Sales tax<span class="qx-in"><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(q.taxPct || '') + '" placeholder="0" oninput="BPQ.set(\'taxPct\',this.value,1)"><i>%</i></span></label>'
            + '<label class="qs-f">Taxed<select onchange="BPQ.taxOn(this.value)"><option value="materials"' + (q.taxOn !== 'all' ? ' selected' : '') + '>Materials</option><option value="all"' + (q.taxOn === 'all' ? ' selected' : '') + '>Everything</option></select></label></div>'
          + '<p class="qx-hint">' + (stx ? stx.st + ' state rate is ' + stx.rate + '%. Add your city and county rate on top. ' : 'Add your business address in Settings to start from your state&rsquo;s rate. ') + '<a onclick="BPQ.saveTax(' + (+q.taxPct || 0) + ')">Make ' + (+q.taxPct || 0) + '% my default</a></p>'
          + '<label class="qs-f">Discount<span class="qx-in"><i>$</i><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(q.discount || '') + '" placeholder="0" oninput="BPQ.set(\'discount\',this.value,1)"></span></label>'
          + '<p class="qx-hint"><a onclick="BPQ.saveDefaults()">Save these mark-ups and tax as my defaults</a></p>')
        + card('How they get it', '', '',
          '<div class="qs-choice">'
            + '<button type="button" class="qs-opt' + (G.on ? '' : ' on') + '" onclick="BPQ.sendAs(\'one\')"><span class="qs-radio"></span><span class="qs-ot"><b>One price</b><small>The estimate as you built it, with Accept and Decline buttons.</small></span></button>'
            + '<button type="button" class="qs-opt' + (G.on ? ' on' : '') + '" onclick="BPQ.sendAs(\'gbb\')"><span class="qs-radio"></span><span class="qs-ot"><b>Good · Better · Best <i class="qs-new">More yeses</i></b><small>Three options on one link. Yours is Better; we write a budget and a premium version. They pick one and sign.</small></span></button>'
          + '</div>'
          + '<label class="qs-f" style="margin-top:14px">The customer sees</label>' + seg(q.show, [['items', 'Every line'], ['sections', 'By section'], ['total', 'One price']], 'BPQ.show')
          + '<p class="qx-hint">' + (q.show === 'items' ? 'Each item with its quantity and unit price, the labor, every other cost and the tax.' : q.show === 'total' ? 'One price for the whole job, with the scope of work underneath.' : 'Three lines: Materials, Labor and Other costs, then the tax.') + '</p>'
          + '<div class="qs-f2"><label class="qs-f">Valid for<select onchange="BPQ.set(\'validDays\',this.value,1)">' + [7, 14, 30, 60].map(function (d) { return '<option value="' + d + '"' + (+q.validDays === d ? ' selected' : '') + '>' + d + ' days</option>'; }).join('') + '</select></label>'
          + '<label class="qs-f">Send by<select onchange="BPQ.via(this.value)"><option value="sms"' + (q.via === 'sms' ? ' selected' : '') + '>Text</option><option value="email"' + (q.via === 'email' ? ' selected' : '') + '>Email</option><option value="both"' + (q.via === 'both' ? ' selected' : '') + '>Both</option></select></label></div>');
    }
    if (cur === 'opts') return '<div id="qg-body"></div>';
    /* send: exactly what goes out */
    var G2 = gb(j), c = calc(j), ct = contactBy(j.contactId);
    var to = ct ? (q.via === 'email' ? ct.email : q.via === 'both' ? [ct.phone, ct.email].filter(Boolean).join(' and ') : ct.phone) : '';
    return '<div class="qs-review"><div class="qs-to"><span class="ms">' + (q.via === 'email' ? 'mail' : 'sms') + '</span><div><b>' + (j.contactId ? 'Going to ' + esc(j.name) : 'Pick the customer first') + '</b><small>' + (j.contactId ? esc(to || 'No ' + (q.via === 'email' ? 'email' : 'phone') + ' on file') + ' · by ' + ({ sms: 'text', email: 'email', both: 'text and email' }[q.via] || 'text') + ' · valid ' + (+q.validDays || 14) + ' days' : '<a onclick="BPQ.go(\'job\')">Choose who it is for</a>') + '</small></div><select class="qs-via" aria-label="Send by" onchange="BPQ.viaSend(this.value)"><option value="sms"' + (q.via !== 'email' && q.via !== 'both' ? ' selected' : '') + '>Text</option><option value="email"' + (q.via === 'email' ? ' selected' : '') + '>Email</option><option value="both"' + (q.via === 'both' ? ' selected' : '') + '>Both</option></select></div>'
      + '<div class="qb-msg" id="qb-msg"></div>'
      + (G2.on && G2.tiers && G2.mode === 'pick' && tiersOut(j).length === 1 ? (function () { var t1 = tierAsSheet(j, tiersOut(j)[0]); var ls = t1.lines.map(function (l) { return { name: l.name, desc: l.desc, qty: l.qty, price: l.price, unit: l.unit }; }); if (t1.tax) ls.push({ name: 'Sales tax (' + (+q.taxPct) + '%)', qty: 1, price: t1.tax }); return '<div class="qs-solo"><span class="ms">info</span><span>You’re sending your pick, <b>' + esc(t1.name) + '</b>, at ' + m2(t1.total) + '. ' + esc(j.contactId ? j.name.split(' ')[0] : 'They') + ' gets one price to approve. <a onclick="BPQ.go(\'opts\')">Change</a></span></div><div class="qs-paper">' + doc('est', { lines: ls, disc: t1.disc, cust: j.contactId ? j.name : '', days: +q.validDays, title: (j.title === 'New estimate' ? '' : j.title) + (t1.title ? ' · ' + t1.title : ''), desc: q.desc }) + '</div>'; })()
        : G2.on && !G2.tiers ? '<div class="qs-solo"><span class="ms">info</span><span>The Good and Best options aren’t built yet. <a onclick="BPQ.go(\'opts\')">Build them on the Options step</a></span></div>'
        : G2.on ? '<div class="qs-paper qg-paper">' + (j.title && j.title !== 'New estimate' ? '<div class="qg-pvt">' + esc(j.title) + '</div>' : '') + (q.desc ? '<p class="qg-pvd">' + esc(q.desc) + '</p>' : '') + optsHtml(j, tiersOut(j), G2.rec, '') + '</div>'
        : '<div class="qs-paper">' + doc('est', { lines: c.lines, disc: c.disc, cust: j.contactId ? j.name : '', days: +q.validDays, title: j.title === 'New estimate' ? '' : j.title, desc: q.desc }) + '</div>')
      + '<div class="qs-foot"><button class="bpx-delbtn" onclick="BPQ.remove()">Delete ' + (q.estId ? 'estimate' : 'draft') + '</button></div></div>';
  }
  function render() {
    var area = $('bpxViewArea'), j = job(Q.id);
    if (!area) return;
    if (!j) { focusMode(false); area.innerHTML = '<div class="pjk-empty">That estimate is gone. <a onclick="bpNav(\'estimates\')">Back to estimates</a></div>'; if (window.bpSpin) bpSpin(false); return; }
    if (Q.mode === 'view') { focusMode(false); renderView(area, j); return; }
    var q = quoteOf(j), cur = curStep(j); Q.step = cur;
    var wide = cur === 'opts' || cur === 'send' || cur === 'price';
    focusMode(true);
    area.innerHTML = '<div class="qx qs qs-' + cur + '">' + head(j, q, cur)
      + '<div class="qs-body' + (wide ? ' wide' : '') + '"><div class="qs-main">' + stepBody(j, q, cur) + '</div>'
      + (wide ? '' : '<aside class="qs-side"><div class="bpx-panel qx-sum" id="qx-sum"></div></aside>') + '</div>'
      + bar(j, cur) + '</div>';
    if (cur === 'lab') drawLabor();
    if (cur === 'oth') drawOther();
    if (cur === 'opts') drawTiers();
    dock(); paint();
    if (cur === 'opts' && gb(j).on && !gb(j).tiers && !gb(j).busy && calc(j).total > 0) Q.gbbBuild();
    if (cur === 'lab' && window.bpCrewLoad && !(window.bpEmpsActive && bpEmpsActive().length)) { try { Promise.resolve(bpCrewLoad()).then(function () { if ($('qb-lab')) drawLabor(); }); } catch (e) {} }
    if (window.bpSpin) bpSpin(false);
  }
  window.bpQuotePage = function () {
    Q.syncOpts();
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
        var opt = '<option value="">Someone else…</option>' + es.map(function (e) { return '<option value="' + esc(e.id) + '"' + (l.empId === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('');
        return '<div class="qb-r qb-lab">'
          /* an employee picked: just their name; otherwise a box to type who or what */
          + '<span class="qb-who' + (l.empId ? ' emp' : '') + '">' + (es.length ? '<select onchange="BPQ.labEmp(\'' + l.id + '\',this.value)">' + opt + '</select>' : '')
            + (l.empId ? '' : '<input value="' + esc(l.name || '') + '" placeholder="e.g. Tear-off crew" onchange="BPQ.row(\'labor\',\'' + l.id + '\',\'name\',this.value)">') + '</span>'
          + '<label class="qb-f"><small>People</small><input type="number" min="1" step="1" inputmode="numeric" value="' + esc(l.people || 1) + '" oninput="BPQ.row(\'labor\',\'' + l.id + '\',\'people\',this.value,1)" aria-label="People"></label>'
          + '<label class="qb-f"><small>Hours each</small><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.hours || '') + '" placeholder="0" oninput="BPQ.row(\'labor\',\'' + l.id + '\',\'hours\',this.value,1)" aria-label="Hours each"></label>'
          + '<label class="qb-f"><small>$ per hour</small><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.rate || '') + '" placeholder="0" oninput="BPQ.row(\'labor\',\'' + l.id + '\',\'rate\',this.value,1)" aria-label="Cost per hour"></label>'
          + '<b class="qb-lc" id="qb-lc-' + l.id + '">' + m0(labHrs(l) * (+l.rate || 0)) + '</b>'
          + '<button type="button" class="qb-x" aria-label="Remove" onclick="BPQ.del(\'labor\',\'' + l.id + '\')">&times;</button></div>';
      }).join('') + '</div>' : '<p class="qb-hint">Add the crew time this job takes. Pick an employee to use their rate with payroll costs included, or type a rate.</p>')
      + '<button type="button" class="bpx-rowbtn" onclick="BPQ.addLab()">+ Add labor</button>';
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
  Q.taxOn = function (v) { Q.set('taxOn', v); };
  Q.via = function (v) { Q.set('via', v); };
  /* changed on the Send step itself: redraw it so the line above says the new way */
  Q.viaSend = function (v) { var j = job(Q.id); if (!j) return; j.quote.via = v; save(); render(); };
  Q.contact = function (cid) {
    /* a new customer without leaving the estimate: the contact form opens, and the saved contact is picked here */
    if (cid === '__new') {
      var was = (job(Q.id) || {}).contactId || '', sel = $('qb-c'); if (sel) sel.value = was;
      var eid = Q.id;
      window._bpAfterContact = function (c) { if (Q.id !== eid || !$('qb-c')) return; var cs = window._bpContacts = window._bpContacts || []; if (!contactBy(c.id)) cs.unshift(c); Q.contact(c.id); render(); };
      var lisa; window.bpOpenAdd(); lisa = document.getElementById('bpx-f-lisa'); if (lisa) lisa.checked = false;
      return;
    }
    var j = job(Q.id), c = contactBy(cid); if (!j) return;
    j.contactId = cid || null;
    if (c) { j.name = c.name || 'Customer'; j.phone = c.phone || ''; j.email = c.email || ''; if (!j.addr) j.addr = c.address1 || c.address || ''; }
    save(true); paint();
  };
  /* matlists.js calls this after every change to the list */
  window.bpQbMat = function (jid) { if (jid === Q.id && $('qx-sum')) paint(); };

  /* ---------- the running numbers: side summary, bottom bar, Price step ---------- */
  function priceRows(j, c) {
    var q = j.quote;
    return '<table class="qx-st"><thead><tr><th></th><th>Cost</th><th>Price</th></tr></thead><tbody>'
      + '<tr><td>Materials <small>+' + (+q.mkMat || 0) + '%</small></td><td>' + m0(c.matCost) + '</td><td>' + m2(c.matPrice) + '</td></tr>'
      + '<tr><td>Labor <small>+' + (+q.mkLab || 0) + '%</small></td><td>' + m0(c.labCost) + '</td><td>' + m2(c.labPrice) + '</td></tr>'
      + '<tr><td>Other <small>+' + (+q.mkOth || 0) + '%</small></td><td>' + m0(c.othCost) + '</td><td>' + m2(c.othPrice) + '</td></tr>'
      + '<tr class="sub"><td>Subtotal</td><td>' + m0(c.cost) + '</td><td>' + m2(c.matPrice + c.labPrice + c.othPrice) + '</td></tr>'
      + '<tr><td>Tax <small>' + (+q.taxPct || 0) + '%' + (q.taxOn === 'all' ? '' : ' on materials') + '</small></td><td></td><td>' + m2(c.tax) + '</td></tr>'
      + (c.disc ? '<tr><td>Discount</td><td></td><td>&minus;' + m2(c.disc) + '</td></tr>' : '')
      + '</tbody></table>'
      + '<div class="qx-total"><span>Customer pays</span><b>' + m2(c.total) + '</b></div>'
      + '<div class="qx-profit ' + (c.margin >= 20 ? 'good' : c.margin >= 10 ? 'ok' : 'low') + '"><span>Profit <b>' + m0(c.profit) + '</b></span><span>Margin <b>' + c.margin + '%</b></span></div>';
  }
  function paint() {
    var j = job(Q.id); if (!j) return;
    var q = j.quote;
    var c = calc(j), G = gb(j);
    j.estimate = c.total;
    if (G.on && !picked(j)) { var bt = tierCalc(j, baseLines(j)); j.estimate = bt.total; }
    /* items on the list that add nothing because they have no price (or no quantity) */
    var np = (j.materials.items || []).filter(function (it) { return !(+it.price > 0) || !(+it.qty > 0); });
    var w = $('qx-matwarn'); if (w) { w.hidden = !np.length; w.innerHTML = np.length ? '<b>' + np.length + ' item' + (np.length === 1 ? ' has' : 's have') + ' no ' + (np.every(function (it) { return +it.price > 0; }) ? 'quantity' : 'price') + ' yet</b>, so ' + (np.length === 1 ? 'it adds' : 'they add') + ' nothing: ' + np.slice(0, 4).map(function (it) { return esc(it.name || 'unnamed line'); }).join(', ') + (np.length > 4 ? '…' : '') + '.' : ''; }
    var rows = priceRows(j, c);
    var el = $('qx-sum'); if (el) el.innerHTML = '<div class="bpx-ptitle">Summary</div>' + rows;
    var pr = $('qs-price'); if (pr) pr.innerHTML = rows;
    /* the bottom bar: Better's price while there are options, else the one price */
    var tv = $('qs-totv'), tl = $('qs-totl'), tm = $('qs-totm');
    if (tv) {
      if (G.on && G.tiers && (Q.step === 'opts' || Q.step === 'send')) {
        var out = tiersOut(j), ts = out.map(function (t) { return tierCalc(j, t.lines).total; });
        tl.textContent = !out.length ? 'Nothing to send' : G.mode === 'pick' ? 'Your pick: ' + out[0].name : 'They choose: ' + out.map(function (t) { return t.name; }).join(', ');
        tv.textContent = !out.length ? '—' : out.length === 1 ? m2(ts[0]) : m0(Math.min.apply(null, ts)) + ' to ' + m0(Math.max.apply(null, ts)); tm.textContent = '';
      }
      else { tl.textContent = G.on ? 'Better option' : 'Customer pays'; tv.textContent = m2(G.on ? tierCalc(j, baseLines(j)).total : c.total); tm.textContent = c.margin + '% margin'; tm.className = c.margin >= 20 ? 'good' : c.margin >= 10 ? 'ok' : 'low'; }
    }
  }
  /* on a phone the summary opens from the bottom bar */
  Q.sumSheet = function () {
    var j = job(Q.id); if (!j) return;
    bpModal('<h3>Summary</h3>' + priceRows(j, calc(j)) + '<div class="row"><button class="bpx-btn" onclick="bpCloseModal()">Done</button></div>');
  };
  Q.sendAs = function (v) { Q.gbbOn(v === 'gbb'); };
  Q.show = function (v) { var j = job(Q.id); if (!j) return; j.quote.show = v; save(); var a = document.activeElement; if (a && a.blur) a.blur(); render(); };
  Q.removeId = function (id) {
    var j = job(id); if (!j || !confirm('Delete the draft for ' + (j.contactId ? j.name : 'this estimate') + '? This can’t be undone.')) return;
    var all = jobs(), left = all.filter(function (x) { return x.id !== id; }); all.length = 0; Array.prototype.push.apply(all, left); save(true);
    if (Q.id === id) Q.id = null; toast('Draft deleted.', 'success'); if (window.bpQbSheets) bpQbSheets();
  };
  Q.remove = function () {
    var j = job(Q.id); if (!j || !confirm('Delete this draft estimate? Anything already sent to the customer stays sent.')) return;
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

  /* ================================================================
     Good / Better / Best
     The sheet as built is Better. "Build the 3 options" writes Good (the
     budget way to do the same job) and Best (premium, with the upgrades
     that make sense for the trade) around it, through estimate-options.
     The contractor checks them, then sends ONE link with all three: the
     customer picks one and signs, and that becomes the accepted estimate
     in their HighLevel, so the deposit and everything after runs as usual.
     ================================================================ */
  var OPT_URL = function () { return (window.BP_URL || '') + '/functions/v1/estimate-options'; };
  var TK = [['good', 'Good'], ['better', 'Better'], ['best', 'Best']];
  function gb(j) {
    var q = quoteOf(j);
    if (!q.gbb) q.gbb = { on: false, tiers: null, rec: 'better' };
    var g = q.gbb;
    if (!g.mode) {
      /* sheets from before the two modes: one option switched on was a pick */
      var on = g.send ? TK.filter(function (k) { return g.send[k[0]] !== false; }) : TK;
      if (g.send && on.length === 1) { g.mode = 'pick'; g.pick = on[0][0]; } else g.mode = lastMode();
    }
    if (!g.pick) g.pick = g.rec || 'better';
    return g;
  }
  /* the sheet's own lines (one line per section when it's set to show one price) */
  function baseLines(j) {
    var q = quoteOf(j);
    return calcBase(j, q.show === 'total' ? 'sections' : q.show).lines.filter(function (l) { return l.sec !== 'tax'; })
      .map(function (l) { return { name: l.name, desc: l.desc || '', qty: r2(l.qty) || 1, unit: l.unit || 'ea', price: r2(l.price), sec: l.sec === 'all' ? 'mat' : l.sec }; });
  }
  function tierLines(j, key) {
    if (key === 'better') return baseLines(j);
    var t = (gb(j).tiers || []).filter(function (x) { return x.key === key; })[0];
    return (t && t.lines) || [];
  }
  var tierOf = function (j, key) { return (gb(j).tiers || []).filter(function (x) { return x.key === key; })[0] || null; };
  var trade = function () { try { var st = bpSettingsGet() || {}; return (st.company || {}).trade || (window._bpAcct || {}).trade || ''; } catch (e) { return ''; } };
  /* without a connection: the same shape the server falls back to */
  function localTiers(j) {
    var base = baseLines(j), sub = r2(sum(base, function (l) { return l.qty * l.price; }));
    var f = function (l, m, lb, o) { return Object.assign({}, l, { price: r2(l.price * (l.sec === 'mat' ? m : l.sec === 'lab' ? lb : o)) }); };
    return [
      { key: 'good', name: 'Good', title: 'Essential', summary: 'The job done right at the lowest price.', bullets: ['Standard-grade materials', 'Complete, code-compliant installation', 'Clean-up and haul-away'], warranty: '1-yr workmanship', lines: base.map(function (l) { return f(l, 0.8, 0.95, 1); }) },
      { key: 'better', name: 'Better', title: 'Recommended', summary: 'The best value for most homes.', bullets: ['Quality materials we recommend', 'Complete, code-compliant installation', 'Clean-up and haul-away', 'Longer workmanship warranty'], warranty: '2-yr workmanship' },
      { key: 'best', name: 'Best', title: 'Premium', summary: 'Top-grade materials and the longest protection.', bullets: ['Premium-grade materials', 'Upgrades that last longer', 'Longest workmanship warranty', 'Priority service for a year'], warranty: '5-yr workmanship',
        lines: base.map(function (l) { return f(l, 1.25, 1.1, 1); }).concat([{ name: 'Extended workmanship warranty', desc: '5 years', qty: 1, unit: 'ea', price: r2(Math.max(150, sub * 0.06)), sec: 'oth' }]) }
    ];
  }
  Q.gbbBuild = async function () {
    var j = job(Q.id); if (!j) return; var g = gb(j), base = baseLines(j);
    if (!base.length) { toast('Price the estimate first. It becomes the Better option.', 'error'); return; }
    if (g.tiers && g.tiers.some(function (t) { return t.edited; }) && !confirm('Rebuild Good and Best from the estimate as it is now? Your edits to them will be replaced.')) return;
    g.busy = true; drawTiers();
    var out = null;
    try {
      if (window.BP_LIVE && window.bpAuthApi) {
        var d = await bpAuthApi(OPT_URL(), { op: 'build', trade: trade(), title: j.title === 'New estimate' ? '' : j.title, scope: j.quote.desc || '', lines: base });
        if (d && d.ok && Array.isArray(d.tiers)) { out = d.tiers; g.ai = !!d.ai; }
      }
    } catch (e) {}
    if (!out) { out = localTiers(j); g.ai = false; }
    var keepRec = g.rec || 'better';
    g.tiers = out.map(function (t) { var o = { key: t.key, name: t.name, title: t.title, summary: t.summary, bullets: t.bullets || [], warranty: t.warranty || '' }; if (t.key !== 'better') o.lines = (t.lines || []).map(function (l) { return { id: uid('tl'), name: l.name, desc: l.desc || '', qty: r2(l.qty) || 1, unit: l.unit || 'ea', price: r2(l.price), sec: l.sec || 'oth' }; }); return o; });
    g.rec = keepRec; g.baseSub = r2(sum(base, function (l) { return l.qty * l.price; })); g.builtAt = Date.now(); g.busy = false;
    save(true); drawTiers(); paint();
  };
  Q.tier = function (key, k, v) {
    var j = job(Q.id), t = j && tierOf(j, key); if (!t) return;
    t[k] = k === 'bullets' ? String(v || '').split(/\n+/).map(function (x) { return x.replace(/^[-•*\s]+/, '').trim(); }).filter(Boolean).slice(0, 6) : String(v || '').trim();
    t.edited = 1; save();
  };
  Q.tierRec = function (key) { var j = job(Q.id); if (!j) return; gb(j).rec = key; save(); drawTiers(); };
  Q.tline = function (key, id, k, v) {
    var j = job(Q.id), t = j && tierOf(j, key), l = t && (t.lines || []).filter(function (x) { return x.id === id; })[0]; if (!l) return;
    l[k] = k === 'name' ? String(v || '') : Math.max(0, num(v)); t.edited = 1; save();
    var el = $('qg-tot-' + key); if (el) el.textContent = m2(tierCalc(j, t.lines).total);
    var se = $('qg-sub-' + key); if (se) se.textContent = m2(tierCalc(j, t.lines).sub);
    var sw = $('qg-sw-' + key); if (sw) sw.textContent = m0(tierCalc(j, t.lines).total);
    paint();
  };
  Q.tlineDel = function (key, id) { var j = job(Q.id), t = j && tierOf(j, key); if (!t) return; t.lines = t.lines.filter(function (x) { return x.id !== id; }); t.edited = 1; save(); drawTiers(); };
  Q.tlineAdd = function (key) { var j = job(Q.id), t = j && tierOf(j, key); if (!t) return; t.lines.push({ id: uid('tl'), name: '', desc: '', qty: 1, unit: 'ea', price: 0, sec: 'oth' }); t.edited = 1; save(); drawTiers(); setTimeout(function () { var r = document.querySelectorAll('#qg-lines-' + key + ' input[data-n]'); if (r.length) r[r.length - 1].focus(); }, 0); };
  Q.tlinesOpen = function (key, on) { Q._tlOpen = Q._tlOpen || {}; Q._tlOpen[key] = on; };
  /* the contractor's last choice is where the next estimate starts */
  function lastMode() { var m = ''; try { m = localStorage.getItem('bp.gbbMode') || ''; } catch (e) {} return m === 'pick' || m === 'choose' ? m : defs().gbbMode; }
  Q.gbbMode = function (m) {
    var j = job(Q.id); if (!j) return; var g = gb(j);
    if (m !== 'pick' && m !== 'choose') return;
    g.mode = m;
    if (m === 'choose') { g.send = g.send || {}; if (TK.filter(function (k) { return g.send[k[0]] !== false; }).length < 2) g.send = { good: true, better: true, best: true }; }
    try { localStorage.setItem('bp.gbbMode', m); } catch (e) {}
    try { var st = bpSettingsGet() || {}; if ((st.quoteDefaults || {}).gbbMode !== m) { st.quoteDefaults = Object.assign({}, st.quoteDefaults || {}, { gbbMode: m }); bpSettingsSet(st); if (window.bpSettingsPush) bpSettingsPush(st); } } catch (e) {}
    save(); drawTiers(); paint(); var b = $('qb-send'); if (b) b.textContent = sendLabel(j);
  };
  Q.gbbOn = function (on) {
    var j = job(Q.id); if (!j) return; var g = gb(j);
    if (on && j.quote.opt && j.quote.opt.status === 'chosen') { toast('The customer already picked an option.', 'error'); return; }
    g.on = !!on;
    save(true);
    if (Q.mode === 'view') { render(); return; }
    if (on) Q.go('opts'); else if (Q.step === 'opts') Q.go('price'); else render();
  };
  Q.tierTab = function (k) {
    Q._tierTab = k;
    Array.prototype.forEach.call(document.querySelectorAll('.qg-switch button'), function (b) { var on = b.getAttribute('data-k') === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    Array.prototype.forEach.call(document.querySelectorAll('.qg-grid .qg-card'), function (c) { c.classList.toggle('on', c.getAttribute('data-k') === k); });
    growAll();
  };
  /* the points wrap instead of being cut off */
  Q.grow = function (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
  function growAll() { Array.prototype.forEach.call(document.querySelectorAll('.qg-buls textarea, .qg-page .qg-sum'), function (t) { if (t.offsetParent) Q.grow(t); }); }
  /* Send my pick: the one option that goes. Let them choose: any two or all three */
  Q.tierSend = function (key) {
    var j = job(Q.id); if (!j) return; var g = gb(j);
    if (g.mode === 'pick') { g.pick = key; save(); drawTiers(); paint(); var b0 = $('qb-send'); if (b0) b0.textContent = sendLabel(j); return; }
    g.send = g.send || { good: true, better: true, best: true };
    var on = g.send[key] === false;
    if (!on && TK.filter(function (k) { return g.send[k[0]] !== false; }).length <= 2) { toast('Choosing needs two options at least. To send just one, switch to Send my pick.', 'error'); drawTiers(); return; }
    g.send[key] = on;
    if (!on && g.rec === key) { var first = TK.filter(function (k) { return g.send[k[0]] !== false; })[0]; if (first) g.rec = first[0]; }
    save(); drawTiers(); paint(); var b = $('qb-send'); if (b) b.textContent = sendLabel(j);
    var nx = document.querySelector('.qs-bar .qs-next'); if (nx && Q.step === 'opts') { /* label stays Review */ }
  };
  Q.bul = function (key, i, v) {
    var j = job(Q.id), t = j && tierOf(j, key); if (!t) return; t.bullets = t.bullets || [];
    v = String(v || '').replace(/^[-•*\s]+/, '').trim();
    if (v) t.bullets[i] = v.slice(0, 120); else t.bullets.splice(i, 1);
    t.edited = 1; save(); if (!v) drawTiers();
  };
  Q.bulDel = function (key, i) { var j = job(Q.id), t = j && tierOf(j, key); if (!t) return; (t.bullets || []).splice(i, 1); t.edited = 1; save(); drawTiers(); };
  Q.bulAdd = function (key) {
    var j = job(Q.id), t = j && tierOf(j, key); if (!t) return; t.bullets = t.bullets || [];
    if (t.bullets.length >= 6) { toast('Six points is plenty. Keep the strongest ones.', 'error'); return; }
    t.bullets.push(''); drawTiers(); t.bullets.pop();
    setTimeout(function () { var r = document.querySelectorAll('.qg-card[data-k="' + key + '"] .qg-buls textarea'); if (r.length) r[r.length - 1].focus(); }, 0);
  };
  function drawTiers() {
    var body = $('qg-body'), j = job(Q.id); if (!body || !j) return;
    var g = gb(j);
    var hero = '<div class="qg-hero"><div><h3>Good · Better · Best</h3><p>Your estimate is the <b>Better</b> option. <b>Good</b> is the budget way to do the same job and <b>Best</b> adds premium materials and upgrades. Check each one, then choose how it goes out.</p></div>'
      + (g.tiers && !g.busy ? '<div class="qg-hacts"><button type="button" class="bpx-btn ghost" onclick="BPQ.gbbBuild()"><span class="ms">auto_awesome</span>Rebuild</button><button type="button" class="bpx-btn ghost" onclick="BPQ.gbbPreview()"><span class="ms">visibility</span>Preview</button></div>' : '') + '</div>';
    if (g.busy) { body.innerHTML = '<div class="qg-page">' + hero + '<div class="qg-busy"><span class="qg-spin"></span><div><b>Writing Good and Best around your estimate…</b><small>Budget and premium versions of the same job, with what each includes. About 10 seconds.</small></div></div></div>'; return; }
    if (!g.tiers) { body.innerHTML = '<div class="qg-page">' + hero + '<div class="qg-empty">' + (calc(j).total > 0 ? '<button class="bpx-addbtn" onclick="BPQ.gbbBuild()"><span class="ms">auto_awesome</span>Build the 3 options</button>' : '<p>Price the job first (materials, labor or other costs). It becomes the Better option.</p><button class="bpx-btn ghost" onclick="BPQ.go(\'mat\')">Go to materials</button>') + '</div></div>'; return; }
    var base = baseLines(j), bsub = r2(sum(base, function (l) { return l.qty * l.price; })), stale = g.baseSub != null && Math.abs(bsub - g.baseSub) > 0.5;
    var open = Q._tlOpen || {}, tab = Q._tierTab || 'better';
    var sw = '<div class="qg-switch" role="tablist">' + TK.map(function (k) {
      var tc = tierCalc(j, tierLines(j, k[0]));
      return '<button type="button" role="tab" data-k="' + k[0] + '" class="k-' + k[0] + (tab === k[0] ? ' on' : '') + (sending(j, k[0]) ? '' : ' off') + '" aria-selected="' + (tab === k[0]) + '" onclick="BPQ.tierTab(\'' + k[0] + '\')"><span>' + k[1] + (g.rec === k[0] ? ' <i class="ms">star</i>' : '') + '</span><b id="qg-sw-' + k[0] + '">' + m0(tc.total) + '</b></button>';
    }).join('') + '</div>';
    var pickMode = g.mode === 'pick';
    var modes = '<div class="qg-mode" role="radiogroup" aria-label="How it goes out">'
      + '<button type="button" role="radio" aria-checked="' + pickMode + '" class="qg-m' + (pickMode ? ' on' : '') + '" onclick="BPQ.gbbMode(\'pick\')"><span class="qs-radio"></span><span><b>Send my pick</b><small>You choose one. They get one price to approve.</small></span></button>'
      + '<button type="button" role="radio" aria-checked="' + !pickMode + '" class="qg-m' + (!pickMode ? ' on' : '') + '" onclick="BPQ.gbbMode(\'choose\')"><span class="qs-radio"></span><span><b>Let them choose</b><small>They see the options side by side, pick one and sign.</small></span></button></div>'
      + '<p class="qg-mhint">' + (pickMode ? 'Tap <b>Send this one</b> on the option you want to send.' : 'Untick any option you don’t want to offer. Two or three can go.') + ' We remember this for your next estimate.</p>';
    body.innerHTML = '<div class="qg-page' + (pickMode ? ' pickm' : '') + '">' + hero + modes
      + (stale ? '<div class="qx-warn">Your estimate changed since these were built. Better follows it; Good and Best don’t. <a onclick="BPQ.gbbBuild()">Rebuild Good and Best</a></div>' : '')
      + sw + '<div class="qg-grid">' + TK.map(function (k) {
        var t = tierOf(j, k[0]) || { key: k[0], name: k[1], bullets: [] }, ls = tierLines(j, k[0]), tc = tierCalc(j, ls), rec = g.rec === k[0], ro = k[0] === 'better';
        var out = sending(j, k[0]);
        return '<div class="qg-card k-' + k[0] + (rec ? ' rec' : '') + (tab === k[0] ? ' on' : '') + (out ? '' : ' off') + '" data-k="' + k[0] + '">'
          + (pickMode ? '<label class="qg-send qg-pick"><span><b>' + (out ? 'Your pick' : 'Send this one') + '</b><small>' + (out ? 'This is the one that goes' : 'Tap to send this instead') + '</small></span><input type="radio" name="qg-pick"' + (out ? ' checked' : '') + ' onchange="BPQ.tierSend(\'' + k[0] + '\')"><i class="qg-rd"></i></label>'
            : '<label class="qg-send"><span><b>' + (out ? 'Offered' : 'Not offered') + '</b><small>' + (out ? 'They can pick this' : 'Stays here, off the estimate') + '</small></span><input type="checkbox"' + (out ? ' checked' : '') + ' onchange="BPQ.tierSend(\'' + k[0] + '\')"><i class="qg-sw"></i></label>')
          + '<div class="qg-top"><span class="qg-k">' + k[1] + '</span><button type="button" class="qg-star' + (rec ? ' on' : '') + '" onclick="BPQ.tierRec(\'' + k[0] + '\')" aria-pressed="' + rec + '"><span class="ms">' + (rec ? 'star' : 'star_outline') + '</span>' + (rec ? 'Most popular' : 'Mark most popular') + '</button></div>'
          + '<input class="qg-title" value="' + esc(t.title || '') + '" placeholder="Name this option" onchange="BPQ.tier(\'' + k[0] + '\',\'title\',this.value)" aria-label="' + k[1] + ' option name">'
          + '<div class="qg-price"><b id="qg-tot-' + k[0] + '">' + m2(tc.total) + '</b><small>' + (tc.tax ? 'incl. ' + m2(tc.tax) + ' tax' : 'total') + (bsub > 0 && !ro ? ' · ' + Math.round(tc.sub / bsub * 100) + '% of Better' : '') + '</small></div>'
          + '<textarea class="qg-sum" rows="2" placeholder="One line on who this suits" oninput="BPQ.grow(this)" onchange="BPQ.tier(\'' + k[0] + '\',\'summary\',this.value)">' + esc(t.summary || '') + '</textarea>'
          + '<div class="qg-sect">What’s included</div><ul class="qg-buls">' + (t.bullets || []).map(function (b, i) {
              return '<li><span class="ms">check</span><textarea rows="1" placeholder="What they get" oninput="BPQ.grow(this)" onchange="BPQ.bul(\'' + k[0] + '\',' + i + ',this.value)">' + esc(b) + '</textarea><button type="button" class="qb-x" aria-label="Remove" onclick="BPQ.bulDel(\'' + k[0] + '\',' + i + ')">&times;</button></li>';
            }).join('') + '</ul>'
          + '<button type="button" class="qg-addb" onclick="BPQ.bulAdd(\'' + k[0] + '\')">+ Add a point</button>'
          + '<label class="qg-war"><span class="ms">verified_user</span><input value="' + esc(t.warranty || '') + '" placeholder="Warranty, e.g. 10-yr parts, 2-yr labor" onchange="BPQ.tier(\'' + k[0] + '\',\'warranty\',this.value)" aria-label="Warranty"></label>'
          + '<details class="qg-lines"' + (open[k[0]] ? ' open' : '') + ' ontoggle="BPQ.tlinesOpen(\'' + k[0] + '\',this.open)"><summary><span>Price breakdown</span><small>' + ls.length + ' line' + (ls.length === 1 ? '' : 's') + ' · <span id="qg-sub-' + k[0] + '">' + m2(tc.sub) + '</span> before tax</small></summary>'
            + (ro ? '<div class="qg-ro">' + ls.map(function (l) { return '<div><span>' + esc(l.name) + (l.qty !== 1 ? ' <small>× ' + l.qty + '</small>' : '') + '</span><b>' + m2(l.qty * l.price) + '</b></div>'; }).join('') + '<p class="qx-hint">These are your estimate’s own lines. <a onclick="BPQ.go(\'mat\')">Change them in Materials</a>.</p></div>'
              : '<div class="qg-ed" id="qg-lines-' + k[0] + '">' + (t.lines || []).map(function (l) {
                return '<div class="qg-l"><input data-n value="' + esc(l.name) + '" placeholder="Line" onchange="BPQ.tline(\'' + k[0] + '\',\'' + l.id + '\',\'name\',this.value)">'
                  + '<input type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.qty) + '" oninput="BPQ.tline(\'' + k[0] + '\',\'' + l.id + '\',\'qty\',this.value)" aria-label="Quantity">'
                  + '<label class="qb-money">$<input type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.price) + '" oninput="BPQ.tline(\'' + k[0] + '\',\'' + l.id + '\',\'price\',this.value)" aria-label="Price each"></label>'
                  + '<button type="button" class="qb-x" aria-label="Remove" onclick="BPQ.tlineDel(\'' + k[0] + '\',\'' + l.id + '\')">&times;</button></div>';
              }).join('') + '<button type="button" class="bpx-rowbtn" onclick="BPQ.tlineAdd(\'' + k[0] + '\')">+ Add a line</button></div>')
          + '</details></div>';
      }).join('') + '</div>'
      + '<div class="qg-foot">' + (g.ai ? '<span class="ms">auto_awesome</span>Written by AI from your estimate. Check the prices before you send.' : 'Check the prices before you send.') + '</div></div>';
    growAll();
  }
  /* what goes to the server: all three, each with its own lines */
  var sending = function (j, k) { var g = gb(j); return g.mode === 'pick' ? g.pick === k : !g.send || g.send[k] !== false; };
  function tiersOut(j) {
    var g = gb(j);
    return TK.filter(function (k) { return sending(j, k[0]); }).map(function (k) {
      var t = tierOf(j, k[0]) || {};
      return { key: k[0], name: k[1], title: t.title || k[1], summary: t.summary || '', bullets: t.bullets || [], warranty: t.warranty || '', lines: tierLines(j, k[0]).filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0 && String(l.name || '').trim(); }) };
    }).filter(function (t) { return t.lines.length; });
  }
  /* the three cards, as the customer will see them (preview and the sheet's view) */
  function optsHtml(j, tiers, rec, chosen) {
    var q = quoteOf(j), showLines = q.show !== 'total';
    return '<div class="qg-pv n' + tiers.length + '">' + tiers.map(function (t) {
      var tc = t.total != null ? t : tierCalc(j, t.lines || []), on = chosen === t.key;
      return '<div class="qg-pc k-' + t.key + (rec === t.key ? ' rec' : '') + (on ? ' picked' : '') + (chosen && !on ? ' dim' : '') + '">' + (rec === t.key ? '<span class="qg-badge">Most popular</span>' : '') + (on ? '<span class="qg-badge pk">Picked</span>' : '')
        + '<span class="qg-k">' + esc(t.name) + '</span><b class="qg-pt">' + esc(t.title || t.name) + '</b>' + (t.summary ? '<p>' + esc(t.summary) + '</p>' : '')
        + '<div class="qg-pp">' + m2(tc.total) + '</div>'
        + ((t.bullets || []).length ? '<ul>' + t.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '')
        + (t.warranty ? '<div class="qg-w"><span class="ms">verified_user</span>' + esc(t.warranty) + '</div>' : '')
        + (showLines ? '<details><summary>What’s in the price</summary>' + (t.lines || []).map(function (l) { return '<div class="qg-pl"><span>' + esc(l.name) + '</span><b>' + m2((+l.qty || 0) * (+l.price || 0)) + '</b></div>'; }).join('') + (tc.tax ? '<div class="qg-pl"><span>Sales tax</span><b>' + m2(tc.tax) + '</b></div>' : '') + (tc.disc ? '<div class="qg-pl"><span>Discount</span><b>&minus;' + m2(tc.disc) + '</b></div>' : '') + '</details>' : '')
        + '</div>';
    }).join('') + '</div>';
  }
  Q.gbbPreview = function () {
    var j = job(Q.id); if (!j) return; var g = gb(j), ts = tiersOut(j);
    if (!ts.length) { toast('Build the options first.', 'error'); return; }
    bpModal('<h3>What ' + esc(j.contactId ? j.name.split(' ')[0] : 'your customer') + ' sees</h3><div class="bpx-sub">' + (ts.length === 1 ? 'One price on one link. They approve and sign right there.' : 'One link with ' + (ts.length === 3 ? 'all three' : 'both') + '. They pick one and sign right there.') + '</div>'
      + (j.title && j.title !== 'New estimate' ? '<div class="qg-pvt">' + esc(j.title) + '</div>' : '') + (j.quote.desc ? '<p class="qg-pvd">' + esc(j.quote.desc) + '</p>' : '')
      + optsHtml(j, ts, g.rec, '') + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '1040px'; mc.style.width = '96vw'; }
  };
  Q.sendOptions = async function () {
    var j = job(Q.id), msg = $('qb-msg'), btn = $('qb-send'); if (!j) return;
    var q = j.quote, g = gb(j), ct = contactBy(j.contactId);
    var say = function (t, ok) { if (msg) { msg.className = 'qb-msg ' + (ok ? 'ok' : 'err'); msg.textContent = t; } };
    if (!j.contactId) return say('Pick the customer first.');
    var plain = !g.on;
    if (!plain && !g.tiers) return say('Build the 3 options first.');
    /* a plain estimate goes the same way, as one option: the sheet itself */
    var ts = plain ? [{ key: 'better', name: 'Estimate', title: '', summary: '', bullets: [], warranty: '', lines: baseLines(j).filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0; }) }] : tiersOut(j);
    if (!ts.length) return say(g.mode === 'pick' ? 'Pick the option to send.' : 'Choose the options to offer.');
    if (!plain && g.mode === 'choose' && ts.length < 2) return say('Choosing needs two options. Offer another, or switch to Send my pick.');
    if (ts.some(function (t) { return !t.lines.length || !(tierCalc(j, t.lines).total > 0); })) return say(plain ? 'Nothing is priced yet. Add materials, labor or other costs.' : 'Each option needs a price.');
    var phone = (ct && ct.phone) || j.phone || '', email = (ct && ct.email) || j.email || '';
    if (q.via !== 'email' && !phone) return say('This customer has no phone number. Send by email instead.');
    if (q.via !== 'sms' && !email) return say('This customer has no email. Send by text instead.');
    if (((q.opt && q.opt.status === 'sent') || q.estId) && !confirm('Send it again with your changes? The link sent before stops working.')) return;
    if (!window.BP_LIVE || !window.bpAuthApi) return say('Sign in to send estimates.');
    if (btn) btn.disabled = true; say('Sending…', true);
    try {
      var d = await bpAuthApi(OPT_URL(), { op: 'send', jobId: j.id, contactId: j.contactId, customer: j.name, phone: phone, email: email,
        title: j.title === 'New estimate' ? 'Your estimate' : j.title, scope: q.desc || '', addr: j.addr || '', tiers: ts, taxPct: +q.taxPct || 0, taxOn: q.taxOn, discount: +q.discount || 0,
        recommended: ts.length === 1 ? ts[0].key : (g.rec || 'better'), via: q.via, validDays: +q.validDays || 14, businessName: biz(), show: q.show });
      if (!d || !d.ok) { say('Couldn’t send: ' + String((d && d.error) || 'unknown error')); if (btn) btn.disabled = false; return; }
      var sent = d.tiers || [], better = sent.filter(function (t) { return t.key === 'better'; })[0] || sent[0];
      q.opt = { id: d.id, token: d.token, link: d.link, status: 'sent', sent: sent, rec: g.rec, chosen: sent.length === 1 ? sent[0].key : '', sentAt: Date.now(), messaged: !!d.sent, reason: d.reason || '' };
      q.estId = 'opt:' + d.id; q.sentAt = Date.now(); q.status = 'sent'; q.sentTotal = better ? better.total : calc(j).total; save(true);
      Q.mode = 'view'; render();
      if (d.sent) toast(sent.length > 1 ? 'Sent ' + j.name + ' ' + sent.length + ' options to choose from.' : 'Estimate sent to ' + j.name + '.', 'success'); else Q.optLink(true);
    } catch (e) { say('Network error. Try again.'); if (btn) btn.disabled = false; }
  };
  var WHY = { no_highlevel: 'Your texting number isn’t connected yet', no_contact: 'This customer isn’t in your texting inbox yet', no_token: 'Your texting number isn’t connected yet' };
  /* the same reasons, said for email when the estimate went by email */
  var WHY_EMAIL = { no_highlevel: 'Your business email isn’t connected yet', no_contact: 'This customer isn’t in your inbox yet', no_token: 'Your business email isn’t connected yet', no_email: 'There’s no email on file for this customer' };
  Q.optLink = function (failed) {
    var j = job(Q.id), o = j && j.quote.opt; if (!o || !o.link) return;
    bpModal('<h3>' + (failed ? 'Send them this link' : 'The options link') + '</h3>'
      + (failed ? '<p class="bpx-sub">' + esc((j.quote.via === 'email' ? WHY_EMAIL[o.reason] : WHY[o.reason]) || (j.quote.via === 'email' ? 'We couldn’t email it automatically' : 'We couldn’t text it automatically')) + ', so send this link to ' + esc(j.name.split(' ')[0]) + ' yourself. When they ' + ((o.sent || []).length > 1 ? 'pick an option' : 'approve it') + ' it shows up here.</p>' : '<p class="bpx-sub">The link ' + esc(j.name.split(' ')[0]) + ' got. Anyone with it can see the estimate.</p>')
      + '<div class="qg-link"><input readonly value="' + esc(o.link) + '" onclick="this.select()"><button class="bpx-btn" onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + esc(o.link) + '\');this.textContent=\'Copied\'">Copy</button></div>'
      + '<div class="row"><a class="bpx-btn ghost" href="' + esc(o.link) + '" target="_blank" rel="noopener">Open it</a><button class="bpx-btn" onclick="bpCloseModal()">Done</button></div>');
  };
  /* a customer approving on their phone shows up here without a reload:
     when the app comes back to the front, and every 30 seconds while an
     estimates page or one estimate is open */
  var syncOn = function () { return document.visibilityState === 'visible' && /^(estimates|quote|invoices|closedeals|dashboard)$/.test(String(window._bpCurView || '')); };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && Q.syncOpts) Q.syncOpts(true); });
  window.addEventListener('focus', function () { if (Q.syncOpts) Q.syncOpts(); });
  setInterval(function () { if (syncOn() && Q.syncOpts) Q.syncOpts(true); }, 30000);
  /* picks and opens made on the customer's page, brought onto the sheets */
  var lastSync = 0;
  Q.syncOpts = function (force) {
    if (!window.BP_LIVE || !window.BP_SB || (window.bpTeamIsCrew && bpTeamIsCrew())) return Promise.resolve(false);
    if (!force && Date.now() - lastSync < 20000) return Promise.resolve(false);
    lastSync = Date.now();
    var mine = jobs().filter(function (j) { return j && j.quote && j.quote.opt && j.quote.opt.id && j.quote.opt.status === 'sent'; });
    if (!mine.length) return Promise.resolve(false);
    return Promise.resolve(BP_SB.from('estimate_options').select('id,status,chosen,viewed_at,chosen_at,signer_name,est_id,note').in('id', mine.map(function (j) { return j.quote.opt.id; }))).then(function (r) {
      var rows = (r && !r.error && r.data) || [], changed = false;
      rows.forEach(function (x) {
        var j = mine.filter(function (y) { return y.quote.opt.id === x.id; })[0]; if (!j) return; var q = j.quote, o = q.opt;
        if (x.viewed_at && !o.viewedAt) { o.viewedAt = Date.parse(x.viewed_at); changed = true; }
        if (x.status === 'chosen' && o.status !== 'chosen') {
          o.status = 'chosen'; o.chosen = x.chosen; o.signer = x.signer_name; o.at = Date.parse(x.chosen_at) || Date.now();
          q.status = 'accepted'; q.acceptedAt = o.at; if (x.est_id) q.estId = x.est_id;
          var c = calc(j); j.estimate = c.total; q.sentTotal = c.total; changed = true;
        } else if (x.status === 'declined' && o.status !== 'declined') { o.status = 'declined'; o.note = x.note || ''; changed = true; }
        else if (x.status === 'void' && o.status === 'sent') { o.status = 'void'; changed = true; }
      });
      if (changed) { save(true); if (window._bpCurView === 'quote' && $('bpxViewArea')) render(); if ($('bpxQbSheets')) bpQbSheets(); }
      return changed;
    }, function () { return false; });
  };
  function optState(j) {
    var o = j.quote && j.quote.opt; if (!o || !o.id) return null;
    var n = (o.sent || []).length, nm = function (k) { return (TK.filter(function (t) { return t[0] === k; })[0] || [0, k])[1]; };
    if (o.status === 'chosen') return { cls: 'ok', t: n > 1 ? 'Picked ' + nm(o.chosen) : 'Approved' };
    if (o.status === 'declined') return { cls: 'bad', t: 'Declined' };
    if (o.viewedAt) return { cls: 'on', t: 'Opened' };
    return { cls: 'on', t: n > 1 ? n + ' options sent' : 'Sent' };
  }
  Q.optState = optState;

  /* ---------- send ---------- */
  var gItems = function (lines) { return lines.map(function (l) { return { name: String(l.name).slice(0, 120), description: String(l.desc || l.name).slice(0, 300), qty: r2(l.qty) || 1, amount: r2(l.price) }; }); };
  async function post(url, body) {
    var tok = window.bpJwt ? await bpJwt() : '';
    var r = await fetch(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + (tok || BP_ANON), 'apikey': BP_ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 404) return { ok: false, error: 'This isn’t switched on for your account yet.' };
    return r.json().catch(function () { return { ok: false, error: 'Bad reply' }; });
  }
  var biz = function () { try { return ((bpSettingsGet() || {}).company || {}).name || 'Your contractor'; } catch (e) { return 'Your contractor'; } };
  /* every estimate goes out as a BuilderPro link (#est=): one price to approve,
     or the options to choose from. The customer signs on that page and it
     becomes the accepted estimate in HighLevel, deposit and all. */
  Q.send = function () {
    var j = job(Q.id);
    if (j && gb(j).on && !gb(j).tiers) { Q.mode = 'edit'; return Q.go('opts'); }
    return Q.sendOptions();
  };

  /* ================================================================
     Invoice
     ================================================================ */
  function srcFor(contactId) {
    return jobs().filter(function (j) { return j && j.contactId === contactId && j.quote && j.status !== 'done'; })
      .sort(function (a, b) { return (b.status === 'active') - (a.status === 'active') || (b.quote.sentAt || 0) - (a.quote.sentAt || 0); })[0] || null;
  }
  var billed = function (j) { return r2(sum((j && j.quote && j.quote.invoices) || [], function (x) { return x.amount; })); };
  var BPPx = function () { return window.BPP || null; };
  function invLines() {
    var s = Q.inv, j = s.jobId ? job(s.jobId) : null, title = (j && j.title !== 'New estimate' ? j.title : '') || 'the project';
    var full = s.base;
    if (s.type === 'full') {
      if (!(+s.taxPct > 0) || s.jobId) return s.lines;
      var subt = r2(sum(s.lines, function (l) { return r2((+l.qty || 0) * (+l.price || 0)); }));
      return s.lines.concat([{ name: 'Sales tax (' + (+s.taxPct) + '%)', desc: '', qty: 1, price: r2(subt * (+s.taxPct) / 100) }]);
    }
    /* a payment plan step brings its own amount and name (s.fixed, s.label) */
    var mine = s.fixType === s.type, fx = mine && s.fixed != null && s.fixed !== '' ? r2(+s.fixed) : null;
    var amt = fx != null ? fx : s.type === 'deposit' ? r2(full * (+s.pct || 0) / 100) : s.type === 'final' ? r2(full - s.billed) : r2(+s.amount || 0);
    var nm = mine && s.label ? s.label + ': ' + title : s.type === 'deposit' ? 'Deposit (' + (+s.pct || 0) + '%): ' + title : s.type === 'final' ? 'Final balance: ' + title : 'Progress payment: ' + title;
    var ds = mine && s.note != null ? s.note : s.type === 'final' && s.billed ? 'Total ' + m2(full) + ' less ' + m2(s.billed) + ' already billed' : s.type === 'deposit' ? 'Of ' + m2(full) : '';
    return [{ name: nm, desc: ds, qty: 1, price: Math.max(0, amt) }];
  }
  window.bpInvoiceFrom = function (jid, mode, stepId) { var j = job(jid); bpInvOpen(j ? j.contactId : null, jid, mode, stepId); };
  function invInit(contactId, jobId, stepId) {
    Q.inv = { contactId: contactId || null, jobId: jobId || null, stepId: stepId || null, type: 'full', pct: defs().depositPct, taxPct: defs().taxPct, amount: '', lines: [], base: 0, billed: 0, days: 7, via: 'sms', desc: '' };
    invLoad(); return Q.inv;
  }
  window.bpInvOpen = async function (contactId, jobId, mode, stepId) {
    if (window.bpEnsureContacts) { try { await bpEnsureContacts(); } catch (e) {} }
    invInit(contactId, jobId, stepId);
    Q.inv.mode = mode || (Q.inv.jobId && invTotalFor(Q.inv.type) > 0 ? 'view' : 'edit');
    Q.inv.step = Q.inv.contactId ? 'amt' : 'who';
    if (window.bpNav) bpNav('invoicebuilder'); else invRender();
  };
  Q.invEdit = function (on) { Q.inv.mode = on ? 'edit' : 'view'; invRender(); var m = document.querySelector('.bpx-main'); if (m) m.scrollTop = 0; };
  function invView(area) {
    var s = Q.inv, ct = contactBy(s.contactId), j = s.jobId ? job(s.jobId) : null;
    var ls = invLines().filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0; }), tot = invTotalFor(s.type);
    var kind = s.fixType === s.type && s.label ? s.label : { full: 'Itemized', deposit: 'Deposit (' + (+s.pct || 0) + '%)', progress: 'Progress payment', final: 'Final balance' }[s.type];
    area.innerHTML = '<div class="qx qx-view">'
      + '<a class="qx-back" onclick="bpNav(\'invoices\')">&larr; Invoices</a>'
      + '<div class="bpx-chead"><div class="qx-h"><h2>Invoice' + (ct ? ' for ' + esc(ct.name) : '') + '</h2><span class="bpx-badge">' + kind + '</span></div>'
        + '<div class="qx-acts"><button class="bpx-btn ghost" onclick="BPQ.invEdit(1)">Edit invoice</button><button class="bpx-addbtn" id="qb-isend" onclick="BPQ.invSend()">Send ' + m2(tot) + '</button></div></div>'
      + '<div class="qb-msg" id="qb-imsg"></div>'
      + '<div class="qx-vgrid"><div class="qx-paper">' + doc('inv', { lines: ls, disc: s.type === 'full' ? r2(s.disc || 0) : 0, cust: ct ? ct.name : '', days: +s.days, desc: s.desc, title: j && j.title !== 'New estimate' ? j.title : '' }) + '</div>'
      + '<aside class="bpx-panel qx-priv"><div class="bpx-ptitle">This invoice</div>'
        + '<table class="qx-st"><tbody><tr><td>Project total</td><td></td><td>' + (s.base ? m2(s.base) : '—') + '</td></tr><tr><td>Billed before</td><td></td><td>' + m2(s.billed) + '</td></tr>'
        + '<tr class="sub"><td>This invoice</td><td></td><td>' + m2(tot) + '</td></tr><tr><td>Left to bill after</td><td></td><td>' + (s.base ? m2(Math.max(0, s.base - s.billed - tot)) : '—') + '</td></tr></tbody></table>'
        + '<table class="qx-st qx-st2"><tbody><tr><td>Due</td><td></td><td>' + (+s.days ? 'In ' + s.days + ' days' : 'On receipt') + '</td></tr><tr><td>Sends by</td><td></td><td>' + ({ sms: 'Text', email: 'Email', both: 'Text and email' }[s.via] || 'Text') + '</td></tr></tbody></table>'
        + '<div class="qx-foot"><a onclick="BPQ.invEdit(1)">Change anything</a>' + (j && !j.sample ? '<a onclick="bpQuoteOpen(\'' + j.id + '\')">See the estimate</a>' : '') + '</div></aside></div></div>';
    if (window.bpSpin) bpSpin(false);
  }
  function invLoad() {
    var s = Q.inv, j = s.jobId ? job(s.jobId) : (s.contactId ? srcFor(s.contactId) : null);
    s.jobId = j ? j.id : null;
    if (j && j.quote) {
      var c = calc(j);
      s.lines = c.lines.map(function (l) { return { id: uid('il'), name: l.name, desc: l.desc || '', qty: l.qty, price: l.price, unit: l.unit || '' }; });
      s.base = j.status === 'quote' ? (c.total || +j.estimate || 0) : (+j.estimate || c.total || 0); s.billed = billed(j); s.desc = j.quote.desc || ''; s.via = j.quote.via || 'sms';
      if (s.disc == null) s.disc = c.disc;
      s.type = s.billed > 0 ? 'final' : 'full';
    } else if (j) {
      /* a project with no estimate sheet: one line for the job (never gives it a quote) */
      var t = +j.estimate || 0;
      s.lines = [{ id: uid('il'), name: j.title || 'Project', desc: '', qty: 1, price: t || '' }];
      s.base = t; s.billed = 0; s.disc = 0; s.desc = ''; s.via = 'sms';
      s.type = 'full';
    } else { s.lines = [{ id: uid('il'), name: '', desc: '', qty: 1, price: '' }]; s.base = 0; s.billed = 0; s.disc = 0; }
    if (!s.contactId && j && j.contactId) s.contactId = j.contactId;
    /* the payment plan says which payment this is */
    var P = BPPx(), st = j && j.pay && P ? (s.stepId ? P.step(j, s.stepId) : P.next(j)) : null;
    if (st && (st.state === 'due' || st.state === 'sent')) {
      s.stepId = st.id;
      var paidBefore = r2(+j.collected || 0);
      if (st.kind === 'full') { if (st.paid > 0) { s.type = 'final'; s.fixed = st.left; s.label = 'Final balance'; s.note = 'Total ' + m2(st.amount) + ' less ' + m2(st.paid) + ' paid'; } else s.type = 'full'; }
      else if (st.kind === 'deposit') { s.type = 'deposit'; s.fixed = st.left; s.label = 'Deposit'; s.note = 'Of ' + m2(s.base); }
      else if (st.kind === 'progress') { s.type = 'progress'; s.fixed = st.left; s.label = st.name; s.note = (st.pct ? st.pct + '% of ' + m2(s.base) : ''); }
      else if (st.kind === 'final') { s.type = 'final'; s.fixed = st.left; s.label = 'Final balance'; s.note = paidBefore > 0 ? 'Total ' + m2(s.base) + ' less ' + m2(paidBefore) + ' paid' : ''; }
      else if (st.kind === 'deductible') { s.type = 'progress'; s.fixed = st.left; s.label = 'Insurance deductible'; s.note = j.pay.ins && j.pay.ins.claim ? 'Claim ' + j.pay.ins.claim + (j.pay.ins.carrier ? ', ' + j.pay.ins.carrier : '') : ''; }
      s.fixType = s.type;
    } else s.stepId = null;
  }
  window.bpInvoicePage = function () { if (!Q.inv) { bpInvOpen(); return; } invRender(); };
  var INV_T = [['full', 'Itemized'], ['deposit', 'Deposit'], ['progress', 'Progress'], ['final', 'Final balance']];
  function invTotalFor(type) {
    var s = Q.inv, was = s.type; s.type = type;
    var ls = invLines(), sub = r2(sum(ls, function (l) { return r2((+l.qty || 0) * (+l.price || 0)); }));
    var disc = type === 'full' ? Math.min(r2(s.disc || 0), sub) : 0;
    s.type = was; return r2(sub - disc);
  }
  /* the invoice builder, in three steps like the estimate: who, what, send */
  var ISTEPS = [['who', 'Customer'], ['amt', 'Amount'], ['send', 'Send']];
  Q.invGo = function (st) {
    var s = Q.inv; if (!s) return;
    var ks = ISTEPS.map(function (x) { return x[0]; }), i = ks.indexOf(s.step || 'who');
    if (st === 'next' || st === 'back') st = ks[Math.max(0, Math.min(ks.length - 1, i + (st === 'next' ? 1 : -1)))];
    s.step = st; var a = document.activeElement; if (a && a.blur) a.blur(); invRender(); scrollTop();
  };
  Q.invClose = function () { focusMode(false); if (Q.inv && invTotalFor(Q.inv.type) > 0) Q.invEdit(0); else bpNav('invoices'); };
  function invRender() {
    var area = $('bpxViewArea'), s = Q.inv; if (!area || !s) return;
    if (s.mode === 'view') { focusMode(false); invView(area); return; }
    var cur = s.step || 'who', ks = ISTEPS.map(function (x) { return x[0]; }), i = ks.indexOf(cur);
    var cs = window._bpContacts || [], j = s.jobId ? job(s.jobId) : null, ct = contactBy(s.contactId);
    focusMode(true);
    var body = '';
    if (cur === 'who') {
      var copts = '<option value="">Pick a customer…</option>' + cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.contactId ? ' selected' : '') + '>' + esc(c.name || c.phone || c.email || 'Contact') + '</option>'; }).join('')
        + (window.bpOpenAdd ? '<option value="__new">+ Add a new customer…</option>' : '');
      body = card('Who you are billing', j && j.sample ? 'Filled in from the sample estimate. Nothing here can be sent.' : j && !j.quote ? 'Filled in from the project ' + esc(j.title || '') + '.' : j ? 'Filled in from the estimate <a onclick="bpQuoteOpen(\'' + j.id + '\')">' + esc(j.title === 'New estimate' ? 'Estimate' : j.title) + '</a>.' : (s.contactId ? 'No estimate on file for this customer. <a onclick="bpQuoteNew(\'' + esc(s.contactId) + '\')">Build one first</a>, or type the lines in the next step.' : ''), '',
          '<label class="qs-f">Customer<select onchange="BPQ.invContact(this.value)">' + copts + '</select></label>'
          + '<label class="qs-f">Due<select onchange="BPQ.invSet(\'days\',this.value,1)">' + [[0, 'On receipt'], [7, 'In 7 days'], [14, 'In 14 days'], [30, 'In 30 days']].map(function (d) { return '<option value="' + d[0] + '"' + (+s.days === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('') + '</select></label>'
          + '<label class="qs-f">Note on the invoice <small>optional</small><textarea rows="3" onchange="BPQ.invSet(\'desc\',this.value)">' + esc(s.desc || '') + '</textarea></label>');
    } else if (cur === 'amt') {
      var opt = '';
      if (s.fixType === s.type && s.fixed != null && s.type !== 'full') opt = '<div class="qs-f2"><label class="qs-f">' + esc(s.label || 'Amount') + '<span class="qx-in"><i>$</i><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(s.fixed) + '" oninput="BPQ.invSet(\'fixed\',this.value,1)"></span></label><label class="qs-f">Project total<span class="qx-in"><i>$</i><input type="number" min="0" step="any" inputmode="decimal" data-qx-base value="' + esc(s.base || '') + '" placeholder="0" oninput="BPQ.invSet(\'base\',this.value,1)"></span></label></div><p class="qx-hint">From the payment plan' + (s.note ? ': ' + esc(s.note) : '') + '.</p>';
      else if (s.type === 'deposit') opt = '<div class="qs-f2"><label class="qs-f">Deposit<span class="qx-in"><input type="number" min="1" max="100" step="any" inputmode="decimal" value="' + esc(s.pct) + '" oninput="BPQ.invSet(\'pct\',this.value,1)"><i>%</i></span></label><label class="qs-f">Of the project total<span class="qx-in"><i>$</i><input type="number" min="0" step="any" inputmode="decimal" data-qx-base value="' + esc(s.base || '') + '" placeholder="0" oninput="BPQ.invSet(\'base\',this.value,1)"></span></label></div>';
      else if (s.type === 'progress') opt = '<div class="qs-f2"><label class="qs-f">Bill now<span class="qx-in"><i>$</i><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(s.amount) + '" placeholder="0" oninput="BPQ.invSet(\'amount\',this.value,1)"></span></label><label class="qs-f">Project total<span class="qx-in"><i>$</i><input type="number" min="0" step="any" inputmode="decimal" data-qx-base value="' + esc(s.base || '') + '" placeholder="0" oninput="BPQ.invSet(\'base\',this.value,1)"></span></label></div>';
      else if (s.type === 'final') opt = '<div class="qs-f2"><label class="qs-f">Project total<span class="qx-in"><i>$</i><input type="number" min="0" step="any" inputmode="decimal" data-qx-base value="' + esc(s.base || '') + '" placeholder="0" oninput="BPQ.invSet(\'base\',this.value,1)"></span></label><label class="qs-f">Already billed<span class="qx-in"><i>$</i><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(s.billed || '') + '" placeholder="0" oninput="BPQ.invSet(\'billed\',this.value,1)"></span></label></div>';
      var hint = { full: j ? 'Every line from the estimate, with quantities, unit prices and tax. Change any of them, or add more.' : 'Type each line with its quantity and unit price. Tax is added below.', deposit: 'A share of the total, up front. The title says Deposit, so your deposit workflow runs.', progress: 'An amount as the work moves along.', final: 'The total, less everything billed before. The title says Final balance.' }[s.type];
      var tax = s.type === 'full' && !j ? '<div class="qs-f2 qx-taxrow"><label class="qs-f">Sales tax<span class="qx-in"><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(s.taxPct || '') + '" placeholder="0" oninput="BPQ.invSet(\'taxPct\',this.value,1)"><i>%</i></span></label><p class="qx-hint">' + (Q.stateTax() ? Q.stateTax().st + ' state rate is ' + Q.stateTax().rate + '%. Add your city and county rate on top.' : 'Applied to every line above.') + '</p></div>' : '';
      body = card('What you are billing', hint, '',
          '<div class="qs-types">' + INV_T.map(function (t) { return '<button type="button" class="qs-type' + (s.type === t[0] ? ' on' : '') + '" onclick="BPQ.invType(\'' + t[0] + '\')"><b>' + t[1] + '</b><small id="qx-ta-' + t[0] + '"></small></button>'; }).join('') + '</div>'
          + opt + '<div id="qb-ilines"></div>' + tax);
    } else {
      var ls = invLines().filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0; });
      var to = ct ? (s.via === 'email' ? ct.email : s.via === 'both' ? [ct.phone, ct.email].filter(Boolean).join(' and ') : ct.phone) : '';
      body = '<div class="qs-review"><div class="qs-to"><span class="ms">' + (s.via === 'email' ? 'mail' : 'sms') + '</span><div><b>' + (ct ? 'Going to ' + esc(ct.name) : 'Pick the customer first') + '</b><small>' + (ct ? esc(to || 'No ' + (s.via === 'email' ? 'email' : 'phone') + ' on file') + ' · with a secure Pay button' : '<a onclick="BPQ.invGo(\'who\')">Choose who it is for</a>') + '</small></div></div>'
        + '<label class="qs-f">Send by</label>' + seg(s.via, [['sms', 'Text'], ['email', 'Email'], ['both', 'Both']], 'BPQ.invVia')
        + '<div class="qb-msg" id="qb-imsg"></div>'
        + '<div class="qs-paper">' + doc('inv', { lines: ls, disc: s.type === 'full' ? r2(s.disc || 0) : 0, cust: ct ? ct.name : '', days: +s.days, desc: s.desc, title: j && j.title !== 'New estimate' ? j.title : '' }) + '</div></div>';
    }
    var wide = cur === 'send', last = i === ks.length - 1;
    area.innerHTML = '<div class="qx qs qs-inv qs-' + cur + '">'
      + '<div class="qs-head"><div class="qs-hrow"><a class="qx-back" onclick="BPQ.invClose()">&larr; ' + (invTotalFor(s.type) > 0 ? 'Save and close' : 'Invoices') + '</a><span class="qs-count">Step ' + (i + 1) + ' of ' + ks.length + '</span></div>'
        + '<div class="qx-h"><h2>New invoice' + (ct ? ' for ' + esc(ct.name) : '') + '</h2></div>'
        + '<nav class="qs-steps">' + ISTEPS.map(function (x, n) { return '<button type="button" class="qs-st' + (x[0] === cur ? ' on' : n < i ? ' done' : '') + '" onclick="BPQ.invGo(\'' + x[0] + '\')"><i>' + (n < i ? '<span class="ms">check</span>' : n + 1) + '</i><span>' + x[1] + '</span></button>'; }).join('') + '</nav></div>'
      + '<div class="qs-body' + (wide ? ' wide' : '') + '"><div class="qs-main">' + body + '</div>' + (wide ? '' : '<aside class="qs-side"><div class="bpx-panel qx-sum" id="qx-isum"></div></aside>') + '</div>'
      + '<div class="qs-bar">' + (i > 0 ? '<button type="button" class="qs-back" onclick="BPQ.invGo(\'back\')" aria-label="Back"><span class="ms">arrow_back</span></button>' : '')
        + '<button type="button" class="qs-tot" onclick="BPQ.invSumSheet()"><small>Amount due</small><b id="qs-itot">$0.00</b></button>'
        + (last ? '<button type="button" class="qs-next" id="qb-isend" onclick="BPQ.invSend()">Send invoice</button>' : '<button type="button" class="qs-next" onclick="BPQ.invGo(\'next\')">' + (ks[i + 1] === 'send' ? 'Review' : 'Next: ' + ISTEPS[i + 1][1]) + '<span class="ms">arrow_forward</span></button>') + '</div>'
      + '</div>';
    dock(); invLinesDraw(); invPaint();
    if (window.bpSpin) bpSpin(false);
  }
  function invLinesDraw() {
    var el = $('qb-ilines'), s = Q.inv; if (!el) return;
    if (s.type !== 'full') { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="qb-rows"><div class="qb-rh qb-il"><span>Item</span><span>Qty</span><span>Unit price</span><span>Amount</span><span></span></div>'
      + s.lines.map(function (l) {
        return '<div class="qb-r qb-il"><input value="' + esc(l.name) + '" placeholder="What it is" onchange="BPQ.invRow(\'' + l.id + '\',\'name\',this.value)">'
          + '<span class="qb-qty' + (l.unit && l.unit !== 'ea' ? ' has-u' : '') + '"><input type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.qty) + '" oninput="BPQ.invRow(\'' + l.id + '\',\'qty\',this.value,1)" aria-label="Quantity">' + (l.unit && l.unit !== 'ea' ? '<i>' + esc(l.unit) + '</i>' : '') + '</span>'
          + '<input type="number" min="0" step="any" inputmode="decimal" value="' + (l.price === '' || l.price == null ? '' : (+l.price).toFixed(2)) + '" placeholder="0.00" oninput="BPQ.invRow(\'' + l.id + '\',\'price\',this.value,1)" onblur="if(this.value!==\'\')this.value=(+this.value).toFixed(2)" aria-label="Unit price">'
          + '<b id="qb-il-' + l.id + '">' + m2((+l.qty || 0) * (+l.price || 0)) + '</b>'
          + '<button type="button" class="qb-x" aria-label="Remove" onclick="BPQ.invDel(\'' + l.id + '\')">&times;</button></div>';
      }).join('') + '</div><button type="button" class="bpx-rowbtn" onclick="BPQ.invAdd()">+ Add line</button>';
  }
  function invSumRows() {
    var s = Q.inv, tot = invTotalFor(s.type), ls = invLines();
    return '<table class="qx-st"><tbody>' + ls.filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0; }).map(function (l) { return '<tr><td>' + esc(l.name || 'Line') + (+l.qty !== 1 ? ' <small>' + r2(l.qty) + ' &times; ' + m2(l.price) + '</small>' : '') + '</td><td></td><td>' + m2((+l.qty || 0) * (+l.price || 0)) + '</td></tr>'; }).join('')
      + '</tbody></table>'
      + '<div class="qx-total"><span>Amount due</span><b>' + m2(tot) + '</b></div>'
      + '<table class="qx-st qx-st2"><tbody><tr><td>Project total <small>' + (s.baseManual ? 'typed in' : s.jobId ? 'from the estimate' : 'from the lines') + '</small></td><td></td><td>' + (s.base ? m0(s.base) : '—') + '</td></tr>'
      + '<tr><td>Billed before</td><td></td><td>' + m0(s.billed) + '</td></tr>'
      + '<tr class="sub"><td>Left to bill after this</td><td></td><td>' + (s.base ? m0(Math.max(0, s.base - s.billed - tot)) : '—') + '</td></tr></tbody></table>';
  }
  function invPaint() {
    var s = Q.inv; if (!s) return;
    INV_T.forEach(function (t) { var e = $('qx-ta-' + t[0]); if (e) { var v = invTotalFor(t[0]); e.textContent = v > 0 ? m0(v) : ''; } });
    var el = $('qx-isum'); if (el) el.innerHTML = '<div class="bpx-ptitle">Summary</div>' + invSumRows();
    var tv = $('qs-itot'); if (tv) tv.textContent = m2(invTotalFor(s.type));
  }
  Q.invSumSheet = function () { if (!Q.inv) return; bpModal('<h3>Summary</h3>' + invSumRows() + '<div class="row"><button class="bpx-btn" onclick="bpCloseModal()">Done</button></div>'); };
  Q.invVia = function (v) { Q.inv.via = v; invRender(); };
  Q.invContact = function (cid) {
    if (cid === '__new') {
      invRender();
      window._bpAfterContact = function (c) { if (!Q.inv) return; var cs = window._bpContacts = window._bpContacts || []; if (!contactBy(c.id)) cs.unshift(c); Q.invContact(c.id); };
      window.bpOpenAdd(); var lisa = document.getElementById('bpx-f-lisa'); if (lisa) lisa.checked = false;
      return;
    }
    Q.inv.contactId = cid || null; Q.inv.jobId = null; Q.inv.disc = null; invLoad(); invRender(); };
  Q.invType = function (t) {
    var s = Q.inv; s.type = t;
    if (t === 'full' && s.lines.length === 1 && !s.lines[0].name && s.base) s.lines = [{ id: uid('il'), name: 'Project', desc: '', qty: 1, price: s.base }];
    invRender();
  };
  /* the project total follows the itemized lines, until it is typed by hand */
  function invFollow() { var s = Q.inv; if (s && !s.baseManual) { s.base = invTotalFor('full'); var b = document.querySelectorAll('[data-qx-base]'); for (var i = 0; i < b.length; i++) if (b[i] !== document.activeElement) b[i].value = s.base || ''; } }
  Q.invSet = function (k, v, isNum) { Q.inv[k] = isNum ? Math.max(0, num(v)) : v; if (k === 'base') Q.inv.baseManual = true; if (k === 'taxPct') invFollow(); invPaint(); };
  Q.invRow = function (id, k, v, isNum) {
    var l = Q.inv.lines.filter(function (x) { return x.id === id; })[0]; if (!l) return;
    l[k] = isNum ? (String(v).trim() === '' ? '' : Math.max(0, num(v))) : v;
    var b = $('qb-il-' + id); if (b) b.textContent = m2((+l.qty || 0) * (+l.price || 0));
    invFollow(); invPaint();
  };
  Q.invAdd = function () { Q.inv.lines.push({ id: uid('il'), name: '', desc: '', qty: 1, price: '' }); invLinesDraw(); invPaint(); var r = document.querySelectorAll('#qb-ilines .qb-r'), l = r[r.length - 1]; var i = l && l.querySelector('input'); if (i) i.focus(); };
  Q.invDel = function (id) { Q.inv.lines = Q.inv.lines.filter(function (x) { return x.id !== id; }); invLinesDraw(); invFollow(); invPaint(); };
  Q.invPreview = function () {
    var s = Q.inv, ct = contactBy(s.contactId), ls = invLines().filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0; });
    bpModal('<h3>What ' + esc(ct ? ct.name : 'your customer') + ' sees</h3>' + doc('inv', { lines: ls, disc: s.type === 'full' ? r2(s.disc || 0) : 0, cust: ct ? ct.name : '', days: +s.days, desc: s.desc })
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '760px'; mc.style.width = '95vw'; }
  };
  Q.invSend = async function (quick) {
    var s = Q.inv, msg = $(quick ? 'qb-qmsg' : 'qb-imsg'), btn = $(quick ? 'qb-qsend' : 'qb-isend'), ct = contactBy(s.contactId), j = s.jobId ? job(s.jobId) : null;
    if (!btn) btn = { disabled: false };
    var say = function (t, ok) { if (msg) { msg.className = 'qb-msg ' + (ok ? 'ok' : 'err'); msg.textContent = t; } else if (t !== 'Sending…') toast(t, ok ? 'success' : 'error'); };
    var ls = invLines().filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0; });
    var sub = r2(sum(ls, function (l) { return r2((+l.qty || 0) * (+l.price || 0)); })), disc = s.type === 'full' ? Math.min(r2(s.disc || 0), sub) : 0, tot = r2(sub - disc);
    if (j && j.sample) return say('This is the sample invoice, so nothing was sent. Remove it from Ready to invoice when you are done looking.', true);
    if (!s.contactId || !ct) return say('Pick the customer first.');
    if (!(tot > 0)) return say('The invoice is $0. Add a line or an amount.');
    if (s.via !== 'email' && !ct.phone) return say('This customer has no phone number. Send by email instead.');
    if (s.via !== 'sms' && !ct.email) return say('This customer has no email. Send by text instead.');
    var jt = j && j.title !== 'New estimate' ? j.title : '';
    /* the words Deposit / Final in the title drive the contact tags and workflows */
    var title = s.label && s.fixType === s.type && s.type !== 'full' ? s.label + (jt ? ': ' + jt : '') : s.type === 'deposit' ? 'Deposit' + (jt ? ': ' + jt : '') : s.type === 'final' ? 'Final balance' + (jt ? ': ' + jt : '') : s.type === 'progress' ? 'Progress payment' + (jt ? ': ' + jt : '') : (jt || 'Invoice');
    btn.disabled = true; say('Sending…', true);
    try {
      var d = await post(GHL_INV_URL, { action: 'create', contactId: s.contactId, contactName: ct.name || 'Customer', phone: ct.phone || '', email: ct.email || '',
        title: title, amount: tot, items: gItems(ls), discount: disc, description: s.desc || '', send: s.via, businessName: biz(), dueDays: +s.days });
      if (d && d.ok) {
        if (j) {
          if (j.quote) quoteOf(j).invoices.push({ id: d.id || uid('inv'), type: s.type, amount: tot, at: Date.now() });
          if (s.stepId && BPPx()) BPPx().markSent(j, s.stepId, tot, d.id || '');
          save(true);
        }
        toast('Invoice sent to ' + (ct.name || 'the customer') + '.', 'success');
        Q.inv = null; if (quick) { if ($('qb-qsend') && window.bpCloseModal) bpCloseModal(); if (window.bpQbInvs) bpQbInvs(); if (window.bpInvLoad) setTimeout(bpInvLoad, 1500); } else bpNav('invoices');
      } else { say('Couldn’t send: ' + String((d && d.error) || 'unknown error')); btn.disabled = false; }
    } catch (e) { say('Network error. Try again.'); btn.disabled = false; }
  };

  /* ================================================================
     Estimate sheets on the Estimates page
     ================================================================ */
  window.bpQbSheets = function () {
    var el = $('bpxQbSheets'); if (!el) return;
    Q.syncOpts();
    var list = jobs().filter(function (j) { return j && j.status === 'quote' && !j.sample && hasWork(j); }).sort(function (a, b) { return ((b.quote || {}).sentAt || b.createdAt || 0) - ((a.quote || {}).sentAt || a.createdAt || 0); });
    el.innerHTML = '<div class="bpx-panel qb-sheets"><div class="bpx-chead" style="margin-bottom:10px"><div class="bpx-ptitle" style="margin:0">Drafts<span class="lg2">estimates you’re still working on — not sent yet</span></div>'
      + '</div>'
      + (list.length ? '<div class="pjl">' + list.map(function (j) {
        var c = calc(j), q = j.quote;
        return '<div class="pjl-r qb-shr" onclick="bpQuoteOpen(\'' + j.id + '\')"><span class="pjk-av"><span class="ms">request_quote</span></span>'
          + '<div class="pjl-id"><b>' + esc(j.contactId ? j.name : 'No customer yet') + '</b><span>' + esc(j.title === 'New estimate' ? 'Untitled' : j.title) + '</span></div>'
          + '<div class="pjl-st">' + (optState(j) ? '<span class="pjk-tag qg-st ' + optState(j).cls + '">' + optState(j).t + '</span>' : '<span class="pjk-tag' + (q.estId ? ' on' : '') + '">' + (q.estId ? 'Sent' : 'Draft') + '</span>') + '</div>'
          + '<div class="pjl-m"><b>' + m0(c.total) + '</b><small>' + c.margin + '% margin</small></div>'
          + '<div class="pjl-a"><button class="pjl-b" onclick="event.stopPropagation();bpQuoteOpen(\'' + j.id + '\')">Open</button>'
            + (q.estId ? '<button class="pjl-b pri" onclick="event.stopPropagation();bpInvoiceFrom(\'' + j.id + '\')">Invoice</button>' : '<button class="pjl-b qx-del" onclick="event.stopPropagation();BPQ.removeId(\'' + j.id + '\')">Delete</button>') + '</div></div>';
      }).join('') + '</div>' : '<div class="pjk-empty">No drafts yet. <a onclick="bpQuoteNew()">Start an estimate</a>: materials, labor and other costs with your markup, and you see the profit before you send it.</div>')
      + '</div>';
  };

  /* ================================================================
     Ready to invoice, on the Invoices page
     An estimate the customer agreed to lands here as the invoice it
     becomes: every line, the amount due. Confirm sends it as is; Edit
     opens the full invoice builder.
     ================================================================ */
  var estStatus = function (q) { var it = q && q.estId ? (window._bpEstItems || []).filter(function (v) { return v.id === q.estId; })[0] : null; return it ? String(it.status || '').toLowerCase() : ''; };
  function agreed(j) {
    var q = j.quote || {};
    if (j.status === 'active' || q.status === 'accepted') return true;
    var st = estStatus(q);
    if (st === 'accepted' || st === 'invoiced') { q.status = 'accepted'; q.acceptedAt = q.acceptedAt || Date.now(); Q._dirty = true; return true; }
    return false;
  }
  /* work out the invoice a sheet turns into, without touching the one open in the builder */
  function draftOf(jid) {
    var was = Q.inv, j = job(jid), s = invInit(j ? j.contactId : null, jid);
    var out = { s: s, lines: invLines().filter(function (l) { return (+l.qty || 0) * (+l.price || 0) > 0; }), total: invTotalFor(s.type) };
    Q.inv = was; return out;
  }
  /* a worked example so the flow can be seen before a real customer says yes.
     It lives on the page only (never saved to the projects), and shows until
     Remove sample is pressed. */
  function sampleJob() {
    if (Q._sample) return Q._sample;
    var mat = function (n, q, u, p) { return { id: uid('m'), name: n, qty: q, unit: u, price: p, supplier: '' }; };
    var j = { id: 'jsample', sample: true, name: 'Sample customer', phone: '', email: '', contactId: null, title: 'Roof replacement (sample)', addr: '128 Maple Ave',
      status: 'quote', estimate: 0, collected: null, expenses: [], createdAt: Date.now(),
      materials: { status: 'draft', sentAt: null, changeOrders: [], items: [
        mat('Architectural shingles (bundle)', 66, 'bdl', 38.5), mat('Synthetic underlayment (roll)', 8, 'roll', 92), mat('Ice and water shield (roll)', 4, 'roll', 118),
        mat('Drip edge, 10 ft', 22, 'ea', 9.75), mat('Ridge cap (bundle)', 5, 'bdl', 64), mat('Coil roofing nails (box)', 6, 'box', 41) ] } };
    quoteOf(j);
    var q = j.quote; q.labor = [{ id: uid('l'), name: 'Tear-off and install crew', people: 4, hours: 18, rate: 38 }];
    q.other = [{ id: uid('o'), name: 'Dumpster (20 yd)', cat: 'Dumpster', cost: 475 }, { id: uid('o'), name: 'Building permit', cat: 'Permits', cost: 260 }];
    q.estId = 'sample'; q.sentAt = Date.now() - 3 * 864e5; q.status = 'accepted'; q.acceptedAt = Date.now();
    return (Q._sample = j);
  }
  var sampleOff = function () { try { return !!(bpSettingsGet() || {}).ivSampleOff; } catch (e) { return false; } };
  var setSampleOff = function (v) { try { var st = bpSettingsGet() || {}; if (v) st.ivSampleOff = 1; else delete st.ivSampleOff; bpSettingsSet(st); if (window.bpSettingsPush) bpSettingsPush(st); } catch (e) {} };
  Q.ivSample = function () { setSampleOff(false); bpQbInvs(); };
  Q.ivSampleOff = function () {
    setSampleOff(true); Q._sample = null; if (Q.inv && Q.inv.jobId === 'jsample') Q.inv = null;
    /* an older build saved the sample with the projects: clear that too */
    var all = jobs(); if (all.some(function (j) { return j && j.sample; })) { var left = all.filter(function (j) { return !(j && j.sample); }); all.length = 0; Array.prototype.push.apply(all, left); save(true); }
    bpQbInvs(); toast('Sample removed.', 'success');
  };
  window.bpQbInvs = function () {
    var el = $('bpxQbInvs'); if (!el) return;
    Q._dirty = false;
    var P = BPPx();
    /* estimate sheets, and any project with a payment plan */
    var mine = jobs().filter(function (j) { return j && j.id !== 'jsample' && ((j.quote && j.status !== 'done' && (j.status === 'active' || hasWork(j))) || (j.pay && P)); });
    if (!sampleOff()) mine.unshift(sampleJob());
    var ready = [], waiting = [], track = [];
    mine.forEach(function (j) {
      if (!agreed(j)) { if (j.quote && j.status === 'quote' && j.quote.estId) waiting.push(j); return; }
      if (j.pay && P) {
        if (j.pay.method === 'financing' && ((j.pay.fin || {}).status !== 'funded')) track.push(j);
        if (j.pay.method === 'insurance' && P.insTotals(j).owed > 0.009) track.push(j);
        var nx = P.next(j);
        if (nx) { var dn = draftOf(j.id); if (dn.total > 0.009) ready.push({ j: j, d: dn, st: nx }); }
        return;
      }
      if (!j.quote) return;
      var d = draftOf(j.id);
      /* no plan yet: one invoice for what is left, unless it is paid */
      if (d.total > 0.009 && !(d.s.base > 0 && (+j.collected || 0) >= d.s.base - 0.009)) ready.push({ j: j, d: d, st: null });
    });
    if (Q._dirty) save(true);
    ready.sort(function (a, b) { return ((b.j.quote || {}).acceptedAt || b.j.wonAt || 0) - ((a.j.quote || {}).acceptedAt || a.j.wonAt || 0); });
    var kind = { full: 'Itemized', deposit: 'Deposit', progress: 'Progress', final: 'Final balance' };
    var chip = function (j) {
      return '<button type="button" class="qb-pchip' + (j.pay ? '' : ' unset') + '" onclick="event.stopPropagation();BPP.choose(\'' + j.id + '\')" title="How the customer is paying">'
        + (j.pay ? esc(P.label(j)) : 'Choose payment plan') + '<span class="ms">expand_more</span></button>';
    };
    var row = function (x) {
      var j = x.j, d = x.d, s = d.s, st = x.st, ttl = j.title === 'New estimate' ? 'Estimate' : j.title;
      var what = st ? esc(st.name) + (st.of > 1 ? ' · ' + st.n + ' of ' + st.of : '') : kind[s.type] + (s.billed > 0 ? ' · ' + m0(s.billed) + ' billed' : '');
      return '<div class="pjl-r qb-shr qb-ivr" onclick="BPQ.ivPreview(\'' + j.id + '\')"><span class="pjk-av"><span class="ms">receipt_long</span></span>'
        + '<div class="pjl-id"><b>' + esc(j.name || 'Customer') + '</b><span>' + esc(ttl) + '</span>' + (P ? chip(j) : '') + '</div>'
        + '<div class="pjl-st"><span class="pjk-tag on">' + (j.sample ? 'Sample' : st ? (st.state === 'sent' ? 'Sent' : 'Ready') : s.billed > 0 ? 'Balance due' : 'Agreed') + '</span></div>'
        + '<div class="pjl-m"><b>' + m0(d.total) + '</b><small>' + what + '</small></div>'
        + '<div class="pjl-a"><button class="pjl-b" onclick="event.stopPropagation();BPQ.ivPreview(\'' + j.id + '\')">Preview</button>'
          + '<button class="pjl-b" onclick="event.stopPropagation();bpInvoiceFrom(\'' + j.id + '\',\'edit\')">Edit</button>'
          + '<button class="pjl-b pri" onclick="event.stopPropagation();BPQ.ivConfirm(\'' + j.id + '\')">Confirm and send</button></div></div>';
    };
    var wrow = function (j) {
      var c = calc(j), ttl = j.title === 'New estimate' ? 'Estimate' : j.title;
      return '<div class="pjl-r qb-shr qb-wait" onclick="bpQuoteOpen(\'' + j.id + '\')"><span class="pjk-av"><span class="ms">hourglass_top</span></span>'
        + '<div class="pjl-id"><b>' + esc(j.name || 'Customer') + '</b><span>' + esc(ttl) + '</span></div>'
        + '<div class="pjl-st"><span class="pjk-tag">Waiting</span></div>'
        + '<div class="pjl-m"><b>' + m0(c.total) + '</b><small>sent ' + (j.quote.sentAt ? new Date(j.quote.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '') + '</small></div>'
        + '<div class="pjl-a"><button class="pjl-b" onclick="event.stopPropagation();BPQ.ivAgree(\'' + j.id + '\')">Mark agreed</button></div></div>';
    };
    /* financing and insurance: where the money stands */
    var trow = function (j) {
      var ttl = j.title === 'New estimate' ? 'Estimate' : j.title, tag = '', sub = '', amt = 0;
      if (j.pay.method === 'financing') {
        var f = j.pay.fin || {}, stx = { offered: 'Offered', applied: 'Applied', approved: 'Approved', funded: 'Funded' }[f.status || 'offered'];
        tag = '<span class="pjk-tag ' + (f.status === 'funded' ? 'ok' : f.status === 'approved' ? 'on' : '') + '">' + stx + '</span>';
        amt = f.funded ? r2((+f.funded || 0) + (+f.fee || 0)) : (+f.approved || P.contract(j));
        sub = (f.lender || 'Lender') + (f.status === 'approved' && (j.status === 'done') ? ' · ask them to pay you' : f.status === 'funded' ? ' · paid to you' : f.status === 'approved' ? ' · approved' : ' · waiting on the customer');
      } else {
        var t = P.insTotals(j), ins = j.pay.ins || {};
        tag = '<span class="pjk-tag ' + (t.owed > 0.009 ? 'on">Claim open' : 'ok">Paid') + '</span>';
        amt = t.owed; sub = (ins.carrier || 'Insurance') + (ins.claim ? ' · claim ' + ins.claim : '') + ' · still owed';
      }
      return '<div class="pjl-r qb-shr" onclick="BPP.open(\'' + j.id + '\')"><span class="pjk-av"><span class="ms">' + (j.pay.method === 'financing' ? 'account_balance' : 'shield') + '</span></span>'
        + '<div class="pjl-id"><b>' + esc(j.name || 'Customer') + '</b><span>' + esc(ttl) + '</span></div>'
        + '<div class="pjl-st">' + tag + '</div>'
        + '<div class="pjl-m"><b>' + m0(amt) + '</b><small>' + esc(sub) + '</small></div>'
        + '<div class="pjl-a"><button class="pjl-b" onclick="event.stopPropagation();BPP.open(\'' + j.id + '\')">Open</button></div></div>';
    };
    el.innerHTML = '<div class="bpx-panel qb-sheets"><div class="bpx-ptitle">Ready to invoice<span class="lg2">the next payment due on each job</span></div>'
      + (ready.length ? '<div class="pjl">' + ready.map(row).join('') + '</div>'
        : '<div class="pjk-empty">Nothing to send right now. When a customer accepts an estimate, or a payment on a job comes due, its invoice shows up here ready to confirm. <a onclick="BPQ.ivSample()">See an example</a></div>')
      + (track.length ? '<div class="qb-wh">Financing and insurance <span>' + track.length + '</span></div><div class="pjl">' + track.map(trow).join('') + '</div>' : '')
      + (waiting.length ? '<div class="qb-wh">Sent, not approved yet <span>' + waiting.length + '</span></div><div class="pjl">' + waiting.map(wrow).join('') + '</div>' : '')
      + '</div>';
  };
  /* the invoice exactly as the customer gets it, with the same three choices */
  Q.ivPreview = function (jid) {
    var j = job(jid); if (!j) return;
    var d = draftOf(jid), s = d.s, ct = contactBy(j.contactId), sub = r2(sum(d.lines, function (l) { return r2((+l.qty || 0) * (+l.price || 0)); }));
    bpModal('<h3>Invoice for ' + esc(ct ? ct.name : j.name) + (s.label && s.fixType === s.type ? ' <small class="qb-pvk">' + esc(s.label) + '</small>' : '') + (j.sample ? ' <span class="pjk-tag on" style="vertical-align:middle;margin-left:6px">Sample</span>' : '') + '</h3>'
      + doc('inv', { lines: d.lines, disc: s.type === 'full' ? r2(sub - d.total) : 0, cust: ct ? ct.name : j.name, days: +s.days, desc: s.desc, title: j.title === 'New estimate' ? '' : j.title })
      + '<div class="qb-msg" id="qb-qmsg"></div>'
      + '<div class="row qb-pvr">' + (j.sample ? '<button class="bpx-btn ghost qb-ivx-rm" onclick="bpCloseModal();BPQ.ivSampleOff()">Remove sample</button>' : '<button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button>')
        + '<button class="bpx-btn ghost" onclick="bpCloseModal();bpInvoiceFrom(\'' + j.id + '\',\'edit\')">Edit</button>'
        + '<button class="bpx-addbtn" id="qb-qsend" onclick="BPQ.ivConfirm(\'' + j.id + '\')">Confirm and send ' + m2(d.total) + '</button></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '760px'; mc.style.width = '95vw'; }
  };
  Q.ivAgree = function (jid) {
    var j = job(jid); if (!j) return; var q = quoteOf(j); q.status = 'accepted'; q.acceptedAt = Date.now(); save(true); bpQbInvs();
    /* agreed: now say how they are paying */
    if (BPPx() && !j.pay) BPPx().choose(jid); else toast('Marked agreed. The invoice is ready to send.', 'success');
  };
  Q.ivConfirm = async function (jid) {
    /* invoicing isn't set up on this account: say so and point to the fix, instead of an error that vanishes */
    if (window._bpInvOff && !((job(jid) || {}).sample)) {
      bpModal('<h3>Invoicing isn’t set up yet</h3><p class="bpx-sub">Before you can send invoices, connect your Stripe so customers can pay by card. It takes about two minutes.</p>'
        + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Not now</button><button class="bpx-btn" onclick="bpCloseModal();bpNav(\'payouts\')">Set up payments</button></div>');
      return;
    }
    if (window.bpEnsureContacts) { try { await bpEnsureContacts(); } catch (e) {} }
    var keep = Q.inv, j = job(jid); invInit(j ? j.contactId : null, jid);
    var ct = contactBy(Q.inv.contactId);
    if (!(j && j.sample) && !confirm('Send this ' + m2(invTotalFor(Q.inv.type)) + ' invoice to ' + (ct ? ct.name : 'the customer') + '?')) { Q.inv = keep; return; }
    await Q.invSend(1);
    if (Q.inv && Q.inv.jobId === jid) Q.inv = keep;
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
