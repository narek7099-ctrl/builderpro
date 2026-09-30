/* ==================================================================
   Material lists: a plain takeoff per job, like a spreadsheet.

   Supply used to feel like an online shop (cart, sourcing engine, split
   POs, will-call barcodes). Most contractors just want the list: what the
   job needs, how many, from whom, and what it comes to. That is this.

   - The list lives on the job: j.materials = { status, sentAt, items[],
     changeOrders[] }, so it saves and syncs with the job (bpJobsSet).
   - Items come from the real catalog (SP.search: the built-in catalog plus
     the contractor's own supplier price books), or are typed in.
   - "Send / share" makes a clean printable list per supplier, or text to
     paste. No cart, no checkout, no payment.
   - Anything added after the list went to the supplier is flagged, and can
     be turned into a change order for the customer.
   - Templates (bpMatTemplates in localStorage, mirrored into settings so
     they follow the account) start a list in one tap.

   The old Order materials / Orders pages stay in supply.js and still work
   if called; they are just out of the sidebar.
   ================================================================== */
(function () {
  'use strict';
  var ML = window.ML = { open: null, newing: false, share: null, co: null, tplOpen: null, q: {}, noPrices: false };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var $ = function (id) { return document.getElementById(id); };
  var uid = function (p) { return (p || 'm') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var num = function (v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  var money = function (n) { n = +n || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var jobs = function () { return window.bpJobsGet ? bpJobsGet() : []; };
  var jobById = function (id) { return jobs().filter(function (j) { return j.id === id; })[0]; };
  var saveJobs = function () { if (window.bpJobsSet) bpJobsSet(jobs()); };
  var biz = function () { var c = (window.bpSettingsGet && bpSettingsGet().company) || {}; return c.name || 'Your business'; };
  var who = function () { try { return (window._bpUser && _bpUser.email) || localStorage.getItem('bpEmail') || ''; } catch (e) { return ''; } };

  /* ---------- templates ---------- */
  function tpls() {
    try { var a = JSON.parse(localStorage.getItem('bpMatTemplates') || 'null'); if (Array.isArray(a)) return a; } catch (e) {}
    var st = window.bpSettingsGet ? bpSettingsGet() : {};
    return Array.isArray(st.matTemplates) ? st.matTemplates : [];
  }
  function tplsSet(a) {
    try { localStorage.setItem('bpMatTemplates', JSON.stringify(a)); } catch (e) {}
    if (window.bpSettingsGet && window.bpSettingsSet) {
      try { var st = bpSettingsGet(); st.matTemplates = a; bpSettingsSet(st); if (window.bpSettingsPush) bpSettingsPush(st); } catch (e) {}
    }
  }
  var tplById = function (id) { return tpls().filter(function (t) { return t.id === id; })[0]; };

  /* ---------- the list on a job ---------- */
  function listOf(j, make) {
    if (!j) return null;
    if (!j.materials && make) j.materials = { status: 'draft', sentAt: null, items: [], changeOrders: [] };
    var m = j.materials; if (!m) return null;
    m.items = m.items || []; m.changeOrders = m.changeOrders || []; m.status = m.status || 'draft';
    return m;
  }
  var line = function (it) { return (+it.qty || 0) * (+it.price || 0); };
  var total = function (items) { return (items || []).reduce(function (t, it) { return t + line(it); }, 0); };
  ML.total = function (j) { var m = listOf(j); return m ? total(m.items) : 0; };
  ML.coTotal = function (j) { var m = listOf(j); return m ? m.changeOrders.reduce(function (t, c) { return t + (+c.amount || 0); }, 0) : 0; };
  function bySupplier(items) {
    var g = {}, order = [];
    items.forEach(function (it) { var k = it.supplierName || 'No supplier'; if (!g[k]) { g[k] = []; order.push(k); } g[k].push(it); });
    return order.map(function (k) { return { name: k, items: g[k] }; });
  }

  /* where an editor is looking: a job's list or a template */
  function doc(t) {
    if (t.kind === 'tpl') { var all = tpls(), tp = all.filter(function (x) { return x.id === t.id; })[0]; return tp ? { items: tp.items, save: function () { tplsSet(all); }, tpl: tp } : null; }
    var j = jobById(t.id), m = listOf(j, true); if (!m) return null;
    return { items: m.items, save: saveJobs, job: j, m: m };
  }
  function redraw(t) {
    var el = $('ml-ed-' + t.kind + '-' + t.id); if (el) el.outerHTML = editor(t);
    if (window._bpCurView === 'matlists' && !ML.open) window.bpMatLists();
    if (t.kind === 'job' && $('bpx-pj-budget') && window.bpProjBudgetRender) bpProjBudgetRender();
  }
  var T = function (kind, id) { return { kind: kind, id: id }; };
  var tArg = function (t) { return '\'' + t.kind + '\',\'' + t.id + '\''; };

  /* ---------- catalog search ---------- */
  function supName(id) { var s = window.SP && SP.supById ? SP.supById(id) : null; return s ? s.name : ''; }
  function chainName(id) { var d = ((window.SP && SP.dirAll) || []).filter(function (x) { return x.id === id; })[0]; return d ? d.name : ''; }
  function options(q) {
    if (!window.SP || !SP.search) return [];
    var out = [];
    SP.search(q, 12).forEach(function (g) {
      if (g.offers && g.offers.length) {
        g.offers.slice(0, 3).forEach(function (o) {
          out.push({ name: o.name || g.name, sku: o.sku || '', supplierId: o.supplier_id, supplierName: supName(o.supplier_id), unit: o.unit || g.unit || 'ea', price: o.price == null ? 0 : +o.price, kind: 'yours' });
        });
      } else {
        var mid = g.lo && g.hi ? Math.round((g.lo + g.hi) / 2 * 100) / 100 : (g.lo || g.hi || 0);
        out.push({ name: g.name, sku: '', supplierId: (g.car || [])[0] || '', supplierName: chainName((g.car || [])[0]) || '', unit: g.unit || 'ea', price: mid, kind: 'typical' });
      }
    });
    return out.slice(0, 10);
  }
  ML._opts = {};
  ML.find = function (kind, id, v) {
    var t = T(kind, id), key = kind + '-' + id, box = $('ml-res-' + key); if (!box) return;
    ML.q[key] = v;
    if (String(v || '').trim().length < 2) { box.innerHTML = ''; box.hidden = true; return; }
    if (window.SP && !SP.loaded && SP.load) SP.load().then(function () { var i = $('ml-q-' + key); if (i && i.value === v) ML.find(kind, id, v); });
    var o = ML._opts[key] = options(v);
    box.hidden = false;
    box.innerHTML = (o.length ? o.map(function (x, i) {
      return '<button class="ml-opt" onmousedown="event.preventDefault()" onclick="ML.pick(' + tArg(t) + ',' + i + ')"><span class="ml-opt-n">' + esc(x.name)
        + (x.sku ? ' <small>' + esc(x.sku) + '</small>' : '') + '</span><span class="ml-opt-s">' + esc(x.supplierName || 'Any supplier') + '</span>'
        + '<span class="ml-opt-p">' + (x.price ? money(x.price) + '<small>/' + esc(x.unit) + (x.kind === 'typical' ? ' typical' : '') + '</small>' : '<small>no price</small>') + '</span></button>';
    }).join('') : '<div class="ml-opt-none bpx-mut">Nothing in the catalog matches.</div>')
      + '<button class="ml-opt ml-opt-custom" onmousedown="event.preventDefault()" onclick="ML.custom(' + tArg(t) + ')">+ Add &ldquo;' + esc(String(v).trim()) + '&rdquo; as a custom item</button>';
  };
  function push(t, it) {
    var d = doc(t); if (!d) return;
    var after = !!(d.m && d.m.status !== 'draft');
    d.items.push(Object.assign({ id: uid('mi'), qty: 1, addedAt: Date.now(), addedAfterSend: after, by: who() }, it));
    d.save(); ML.q[t.kind + '-' + t.id] = ''; redraw(t);
    var q = $('ml-q-' + t.kind + '-' + t.id); if (q) q.focus();
  }
  ML.pick = function (kind, id, i) {
    var o = (ML._opts[kind + '-' + id] || [])[i]; if (!o) return;
    push(T(kind, id), { name: o.name, sku: o.sku, supplierId: o.supplierId, supplierName: o.supplierName, unit: o.unit, price: o.price, custom: false });
  };
  ML.custom = function (kind, id) {
    var nm = String(ML.q[kind + '-' + id] || '').trim();
    push(T(kind, id), { name: nm || 'Custom item', sku: '', supplierId: '', supplierName: '', unit: 'ea', price: 0, custom: true });
    if (!nm) setTimeout(function () { var ins = document.querySelectorAll('#ml-ed-' + kind + '-' + id + ' .ml-in-name'); if (ins.length) ins[ins.length - 1].focus(); }, 0);
  };
  ML.edit = function (kind, id, itemId, k, v) {
    var t = T(kind, id), d = doc(t); if (!d) return;
    var it = d.items.filter(function (x) { return x.id === itemId; })[0]; if (!it) return;
    it[k] = (k === 'qty' || k === 'price') ? Math.max(0, num(v)) : String(v);
    d.save(); redraw(t);
  };
  ML.del = function (kind, id, itemId) {
    var t = T(kind, id), d = doc(t); if (!d) return;
    var i = d.items.map(function (x) { return x.id; }).indexOf(itemId); if (i < 0) return;
    d.items.splice(i, 1); d.save(); redraw(t);
  };

  /* ---------- status ---------- */
  ML.status = function (jid, s) {
    var j = jobById(jid), m = listOf(j, true); if (!m) return;
    if (s === 'sent' && !m.items.length) { window.bpToast && bpToast('Add something to the list first.'); return; }
    m.status = s;
    if (s === 'sent') m.sentAt = Date.now();
    if (s === 'received') m.receivedAt = Date.now();
    if (s === 'draft') m.sentAt = null;
    saveJobs(); redraw(T('job', jid));
  };

  /* ---------- templates ---------- */
  var tplItem = function (it) { return { id: uid('mi'), name: it.name, sku: it.sku || '', supplierId: it.supplierId || '', supplierName: it.supplierName || '', unit: it.unit || 'ea', qty: +it.qty || 1, price: +it.price || 0, custom: !!it.custom }; };
  ML.saveTpl = function (jid) {
    var j = jobById(jid), m = listOf(j); if (!m || !m.items.length) { window.bpToast && bpToast('The list is empty.'); return; }
    var name = prompt('Name this template', (j.title || 'Job') + ' materials'); if (name == null) return;
    var all = tpls(); all.unshift({ id: uid('mt'), name: String(name).trim() || 'Template', items: m.items.map(tplItem), at: Date.now() });
    tplsSet(all); window.bpToast && bpToast('Saved as a template.');
  };
  ML.useTpl = function (jid) { ML.share = null; ML.co = null; ML.tplPick = ML.tplPick === jid ? null : jid; redraw(T('job', jid)); };
  ML.applyTpl = function (jid, tid) {
    var tp = tplById(tid), j = jobById(jid), m = listOf(j, true); if (!tp || !m) return;
    var after = m.status !== 'draft';
    tp.items.forEach(function (it) { m.items.push(Object.assign(tplItem(it), { addedAt: Date.now(), addedAfterSend: after, by: who() })); });
    ML.tplPick = null; saveJobs(); redraw(T('job', jid));
  };
  ML.tplNew = function () {
    var name = prompt('Name the template', 'Standard materials'); if (name == null) return;
    var all = tpls(), tp = { id: uid('mt'), name: String(name).trim() || 'Template', items: [], at: Date.now() };
    all.unshift(tp); tplsSet(all); ML.tplOpen = tp.id; window.bpMatTemplates();
  };
  ML.tplRename = function (tid) {
    var all = tpls(), tp = all.filter(function (x) { return x.id === tid; })[0]; if (!tp) return;
    var n = prompt('Template name', tp.name); if (n == null) return; tp.name = String(n).trim() || tp.name; tplsSet(all); window.bpMatTemplates();
  };
  ML.tplDel = function (tid) {
    var tp = tplById(tid); if (!tp || !confirm('Delete the template "' + tp.name + '"? Lists made from it stay as they are.')) return;
    tplsSet(tpls().filter(function (x) { return x.id !== tid; })); if (ML.tplOpen === tid) ML.tplOpen = null; window.bpMatTemplates();
  };

  /* ---------- send / share ---------- */
  ML.shareToggle = function (jid) { ML.co = null; ML.tplPick = null; ML.share = ML.share === jid ? null : jid; redraw(T('job', jid)); };
  ML.noPricesSet = function (jid, on) { ML.noPrices = !!on; redraw(T('job', jid)); };
  function groupAt(jid, gi) { var m = listOf(jobById(jid)); return (m ? bySupplier(m.items)[gi] : null) || { name: '', items: [] }; }
  ML.print = function (jid, gi) {
    var j = jobById(jid), g = groupAt(jid, gi), sup = g.name, items = g.items, np = ML.noPrices; if (!j) return;
    var rows = items.map(function (it) {
      return '<tr><td>' + esc(it.name) + (it.sku ? '<div class="s">' + esc(it.sku) + '</div>' : '') + '</td><td class="n">' + esc(+it.qty || 0) + '</td><td>' + esc(it.unit || '') + '</td><td>' + esc(it.note || '') + '</td>'
        + (np ? '' : '<td class="n">' + money(it.price) + '</td><td class="n">' + money(line(it)) + '</td>') + '</tr>';
    }).join('');
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Material list - ' + esc(j.name || 'Job') + ' - ' + esc(sup) + '</title>'
      + '<style>body{font:14px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b1021;margin:32px;}h1{font-size:20px;margin:0 0 2px}'
      + '.m{color:#5b6475;font-size:13px;margin-bottom:18px}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5b6475;border-bottom:2px solid #0b1021;padding:6px 8px}'
      + 'td{border-bottom:1px solid #dde3ea;padding:8px;vertical-align:top}.n{text-align:right;white-space:nowrap}.s{font-size:11px;color:#5b6475}tfoot td{font-weight:700;border:0}'
      + '.pb{margin-top:22px}@media print{.pb{display:none}body{margin:12mm}}</style></head><body>'
      + '<h1>' + esc(biz()) + '</h1><div class="m">Material list for <b>' + esc(j.name || 'Job') + '</b>' + (j.title ? ' &middot; ' + esc(j.title) : '') + (j.addr ? ' &middot; ' + esc(j.addr) : '')
      + '<br>Supplier: <b>' + esc(sup) + '</b> &middot; ' + new Date().toLocaleDateString() + '</div>'
      + '<table><thead><tr><th>Item</th><th class="n">Qty</th><th>Unit</th><th>Notes</th>' + (np ? '' : '<th class="n">Unit price</th><th class="n">Total</th>') + '</tr></thead><tbody>' + rows + '</tbody>'
      + (np ? '' : '<tfoot><tr><td colspan="5" class="n">Total</td><td class="n">' + money(total(items)) + '</td></tr></tfoot>') + '</table>'
      + '<button class="pb" onclick="window.print()">Print</button></body></html>';
    var w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print the list.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };
  ML.text = function (jid, gi) {
    var j = jobById(jid) || {}, g = groupAt(jid, gi), sup = g.name, items = g.items, np = ML.noPrices;
    return biz() + '\nMaterial list: ' + (j.name || 'Job') + (j.title ? ' - ' + j.title : '') + (j.addr ? '\nJob site: ' + j.addr : '') + '\nSupplier: ' + sup + '\n\n'
      + items.map(function (it) { return (+it.qty || 0) + ' ' + (it.unit || 'ea') + '  ' + it.name + (it.sku ? ' (' + it.sku + ')' : '') + (np ? '' : '  @ ' + money(it.price) + ' = ' + money(line(it))); }).join('\n')
      + (np ? '' : '\n\nTotal: ' + money(total(items)));
  };
  ML.copy = function (jid, gi, btn) {
    var txt = ML.text(jid, gi);
    var shown = function () {
      var box = $('ml-copytxt'); if (box) { box.hidden = false; box.value = txt; box.select(); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { if (btn) btn.textContent = 'Copied'; }, shown);
    else shown();
  };

  /* ---------- change orders ---------- */
  var unbilled = function (m) { return m.items.filter(function (it) { return it.addedAfterSend && !it.coId; }); };
  ML.coOpen = function (jid) { var m = listOf(jobById(jid)); if (!m) return; ML.share = null; ML.tplPick = null; ML.co = { jid: jid, pick: unbilled(m).map(function (x) { return x.id; }), pct: 20, note: '' }; redraw(T('job', jid)); };
  ML.coClose = function () { var jid = ML.co && ML.co.jid; ML.co = null; if (jid) redraw(T('job', jid)); };
  ML.coTick = function (itemId, on) { var c = ML.co; if (!c) return; c.pick = c.pick.filter(function (x) { return x !== itemId; }); if (on) c.pick.push(itemId); ML.coAmt(); };
  ML.coPct = function (v) { if (ML.co) { ML.co.pct = Math.max(0, num(v)); ML.coAmt(); } };
  function coAmount() {
    var c = ML.co, m = c && listOf(jobById(c.jid)); if (!m) return 0;
    var sub = m.items.filter(function (it) { return c.pick.indexOf(it.id) >= 0; }).reduce(function (t, it) { return t + line(it); }, 0);
    return Math.round(sub * (1 + c.pct / 100) * 100) / 100;
  }
  ML.coAmt = function () { var e = $('ml-co-amt'); if (e) e.textContent = money(coAmount()); };
  ML.coSave = function () {
    var c = ML.co, j = c && jobById(c.jid), m = listOf(j); if (!m) return;
    if (!c.pick.length) { window.bpToast && bpToast('Tick at least one item.'); return; }
    var note = ($('ml-co-note') || {}).value || '';
    var co = { id: uid('co'), at: Date.now(), itemIds: c.pick.slice(), amount: coAmount(), markupPct: c.pct, note: note };
    m.changeOrders.push(co);
    m.items.forEach(function (it) { if (c.pick.indexOf(it.id) >= 0) it.coId = co.id; });
    ML.co = null; saveJobs(); redraw(T('job', j.id));
    window.bpToast && bpToast('Change order for ' + money(co.amount) + ' recorded on ' + (j.name || 'the job') + '.');
  };

  /* ---------- the editor ---------- */
  function statusPill(s) {
    var map = { draft: ['Draft', 'ml-st-draft'], sent: ['Sent to supplier', 'ml-st-sent'], received: ['Received', 'ml-st-recv'] };
    var x = map[s] || map.draft; return '<span class="ml-pill ' + x[1] + '">' + x[0] + '</span>';
  }
  function editor(t) {
    var d = doc(t); if (!d) return '<div id="ml-ed-' + t.kind + '-' + t.id + '" class="bpx-mut">Not found.</div>';
    var key = t.kind + '-' + t.id, a = tArg(t), items = d.items, m = d.m;
    var h = '<div class="ml-ed" id="ml-ed-' + key + '">';
    /* top bar: status + actions */
    if (m) {
      var jid = t.id;
      h += '<div class="ml-bar"><div class="ml-bar-l">' + statusPill(m.status)
        + (m.sentAt ? '<span class="bpx-mut ml-small">sent ' + new Date(m.sentAt).toLocaleDateString() + '</span>' : '') + '</div><div class="ml-bar-r">'
        + (m.status === 'draft' ? '<button class="bpx-rowbtn ml-primary" onclick="ML.status(\'' + jid + '\',\'sent\')">Mark sent to supplier</button>' : '')
        + (m.status === 'sent' ? '<button class="bpx-rowbtn ml-primary" onclick="ML.status(\'' + jid + '\',\'received\')">Mark received</button>' : '')
        + (m.status !== 'draft' ? '<button class="bpx-rowbtn" onclick="ML.status(\'' + jid + '\',\'draft\')" title="Back to draft">Reopen</button>' : '')
        + '<button class="bpx-rowbtn" onclick="ML.shareToggle(\'' + jid + '\')">Send / share</button>'
        + '<button class="bpx-rowbtn" onclick="ML.useTpl(\'' + jid + '\')">Use template</button>'
        + '<button class="bpx-rowbtn" onclick="ML.saveTpl(\'' + jid + '\')">Save as template</button>'
        + '</div></div>';
      if (ML.tplPick === jid) {
        var tl = tpls();
        h += '<div class="ml-sub">' + (tl.length ? '<div class="ml-sub-h">Add a template&rsquo;s items to this list</div>' + tl.map(function (tp) {
          return '<div class="ml-srow"><span><b>' + esc(tp.name) + '</b> <span class="bpx-mut">' + tp.items.length + (tp.items.length === 1 ? ' item' : ' items') + ' &middot; ' + money(total(tp.items)) + '</span></span><button class="bpx-rowbtn" onclick="ML.applyTpl(\'' + jid + '\',\'' + tp.id + '\')">Add</button></div>';
        }).join('') : '<div class="bpx-mut">No templates yet. Build a list, then "Save as template".</div>') + '</div>';
      }
      if (ML.share === jid) {
        var gs = bySupplier(items);
        h += '<div class="ml-sub"><div class="ml-sub-h">One list per supplier. Print it, or copy it into a text or email.'
          + '<label class="ml-chk"><input type="checkbox" ' + (ML.noPrices ? 'checked' : '') + ' onchange="ML.noPricesSet(\'' + jid + '\',this.checked)"> Leave prices off</label></div>'
          + (gs.length ? gs.map(function (g, gi) {
            return '<div class="ml-srow"><span><b>' + esc(g.name) + '</b> <span class="bpx-mut">' + g.items.length + (g.items.length === 1 ? ' item' : ' items') + ' &middot; ' + money(total(g.items)) + '</span></span><span class="ml-srow-a">'
              + '<button class="bpx-rowbtn" onclick="ML.print(\'' + jid + '\',' + gi + ')">Print list</button>'
              + '<button class="bpx-rowbtn" onclick="ML.copy(\'' + jid + '\',' + gi + ',this)">Copy as text</button></span></div>';
          }).join('') : '<div class="bpx-mut">Nothing on the list yet.</div>')
          + '<textarea id="ml-copytxt" class="ml-copytxt" hidden readonly></textarea></div>';
      }
    }
    /* add box */
    h += '<div class="ml-add"><span class="ms">search</span><input id="ml-q-' + key + '" class="ml-q" placeholder="Add an item: search your suppliers and the catalog (e.g. shingles, pex 3/4)" autocomplete="off" value="' + esc(ML.q[key] || '') + '" oninput="ML.find(' + a + ',this.value)" onfocus="ML.find(' + a + ',this.value)" onblur="setTimeout(function(){var a=document.activeElement;if(a&&a.id===\'ml-q-' + key + '\')return;var r=document.getElementById(\'ml-res-' + key + '\');if(r)r.hidden=true;},150)">'
      + '<button class="bpx-rowbtn" onclick="ML.custom(' + a + ')">Add custom item</button>'
      + '<div class="ml-res" id="ml-res-' + key + '" hidden></div></div>';
    /* table */
    if (!items.length) h += '<div class="ml-empty bpx-mut">No items yet. Search above to add real products from your suppliers, or add a custom item.</div>';
    else {
      h += '<table class="bpx-table ml-tbl"><thead><tr><th>Item</th><th class="ml-n">Qty</th><th>Unit</th><th>Supplier</th><th class="ml-n">Unit price</th><th class="ml-n">Line total</th><th></th></tr></thead><tbody>'
        + items.map(function (it) {
          var ed = function (k, v, cls, type) { return '<input class="ml-in ' + cls + '" ' + (type ? 'type="number" min="0" step="any" inputmode="decimal"' : '') + ' value="' + esc(v) + '" onchange="ML.edit(' + a + ',\'' + it.id + '\',\'' + k + '\',this.value)">'; };
          return '<tr' + (it.addedAfterSend ? ' class="ml-late"' : '') + '><td data-l="Item">'
            + (it.custom ? ed('name', it.name, 'ml-in-name') : '<div class="ml-name">' + esc(it.name) + '</div>')
            + '<div class="ml-meta">' + (it.sku ? '<small>' + esc(it.sku) + '</small>' : '') + (it.custom ? '<small>custom</small>' : '')
            + (it.addedAfterSend ? '<span class="ml-tag">Added after sending</span>' : '') + (it.coId ? '<span class="ml-tag ml-tag-ok">On change order</span>' : '') + '</div></td>'
            + '<td data-l="Qty" class="ml-n">' + ed('qty', +it.qty || 0, 'ml-in-num', 1) + '</td>'
            + '<td data-l="Unit">' + (it.custom ? ed('unit', it.unit || 'ea', 'ml-in-unit') : esc(it.unit || 'ea')) + '</td>'
            + '<td data-l="Supplier">' + (it.custom ? ed('supplierName', it.supplierName || '', 'ml-in-sup') : esc(it.supplierName || '—')) + '</td>'
            + '<td data-l="Unit price" class="ml-n">' + ed('price', (+it.price || 0).toFixed(2), 'ml-in-num', 1) + '</td>'
            + '<td data-l="Line total" class="ml-n ml-lt">' + money(line(it)) + '</td>'
            + '<td class="ml-x"><button class="ml-rm" title="Remove" aria-label="Remove ' + esc(it.name) + '" onclick="ML.del(' + a + ',\'' + it.id + '\')">&times;</button></td></tr>';
        }).join('') + '</tbody></table>';
      /* footer */
      var gs2 = bySupplier(items);
      h += '<div class="ml-foot">' + (gs2.length > 1 ? gs2.map(function (g) { return '<div class="ml-fr"><span>' + esc(g.name) + '</span><span>' + money(total(g.items)) + '</span></div>'; }).join('') : '')
        + '<div class="ml-fr ml-grand"><span>Total</span><span>' + money(total(items)) + '</span></div></div>';
    }
    /* change orders */
    if (m) {
      var ub = unbilled(m), cos = m.changeOrders;
      if (cos.length) h += '<div class="ml-cos"><div class="ml-fr"><span><b>Change orders: ' + money(ML.coTotal(d.job)) + '</b></span><span class="bpx-mut ml-small">' + cos.length + ' recorded</span></div>'
        + cos.map(function (c) { return '<div class="ml-fr ml-small"><span>' + new Date(c.at).toLocaleDateString() + ' &middot; ' + c.itemIds.length + (c.itemIds.length === 1 ? ' item' : ' items') + ' +' + c.markupPct + '%' + (c.note ? ' &middot; ' + esc(c.note) : '') + '</span><span>' + money(c.amount) + '</span></div>'; }).join('') + '</div>';
      if (ub.length && !(ML.co && ML.co.jid === t.id)) h += '<div class="ml-cobar"><span>' + ub.length + (ub.length === 1 ? ' item was' : ' items were') + ' added after the list was sent and not billed yet.</span><button class="bpx-rowbtn ml-primary" onclick="ML.coOpen(\'' + t.id + '\')">Create change order</button></div>';
      if (ML.co && ML.co.jid === t.id) {
        var c = ML.co;
        h += '<div class="ml-sub ml-co"><div class="ml-sub-h"><b>New change order</b></div>'
          + m.items.filter(function (it) { return it.addedAfterSend && !it.coId; }).map(function (it) {
            return '<label class="ml-srow ml-chkrow"><span><input type="checkbox" ' + (c.pick.indexOf(it.id) >= 0 ? 'checked' : '') + ' onchange="ML.coTick(\'' + it.id + '\',this.checked)"> ' + esc(it.name) + ' <span class="bpx-mut">&times; ' + (+it.qty || 0) + '</span></span><span>' + money(line(it)) + '</span></label>';
          }).join('')
          + '<div class="ml-co-f"><label>Markup %<input class="ml-in ml-in-num" type="number" min="0" step="any" value="' + c.pct + '" oninput="ML.coPct(this.value)"></label>'
          + '<label class="ml-co-note">Note<input id="ml-co-note" class="ml-in" placeholder="e.g. extra decking found under old roof"></label></div>'
          + '<div class="ml-fr ml-grand"><span>Change order amount</span><span id="ml-co-amt">' + money(coAmount()) + '</span></div>'
          + '<div class="ml-co-a"><button class="bpx-rowbtn" onclick="ML.coClose()">Cancel</button><button class="bpx-rowbtn ml-primary" onclick="ML.coSave()">Record change order</button></div></div>';
      }
    }
    return h + '</div>';
  }
  ML.editor = function (kind, id) { return editor(T(kind, id)); };

  /* ---------- pages ---------- */
  function tabs(active) {
    var t = [['matlists', 'Material lists'], ['mattemplates', 'Templates'], ['suppliers', 'Where I buy']];
    return '<div class="bpx-jobtabs" style="margin-bottom:14px">' + t.map(function (x) { return '<button class="bpx-jt' + (x[0] === active ? ' on' : '') + '" onclick="bpNav(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div>';
  }
  ML.tabs = tabs;
  function ensureSP(cb) { if (window.SP && SP.load && !SP.loaded) SP.load().then(cb); }
  function done() { window.bpSpin && bpSpin(false); }

  window.bpMatLists = function () {
    var area = $('bpxViewArea'); if (!area) return;
    ensureSP(function () { if (window._bpCurView === 'matlists' && !document.activeElement.classList.contains('ml-q')) window.bpMatLists(); });
    var all = jobs();
    if (ML.open) {
      var j = jobById(ML.open);
      if (j) {
        area.innerHTML = tabs('matlists') + '<div class="bpx-panel ml-panel"><div class="ml-head"><button class="bpx-rowbtn" onclick="ML.open=null;bpMatLists()">&larr; All lists</button>'
          + '<div class="ml-head-t"><b>' + esc(j.name || 'Job') + '</b><span class="bpx-mut">' + esc(j.title || '') + (j.addr ? ' &middot; ' + esc(j.addr) : '') + '</span></div>'
          + '<button class="bpx-rowbtn" onclick="bpProjOpen(\'' + j.id + '\');setTimeout(function(){bpProjTab(\'materials\')},30)">Open project</button></div>'
          + editor(T('job', j.id)) + '</div>';
        done(); return;
      }
      ML.open = null;
    }
    var rows = all.filter(function (j) { var m = j.materials; return j.status !== 'done' || (m && m.items && m.items.length); });
    var withList = rows.filter(function (j) { return j.materials && j.materials.items && j.materials.items.length; });
    var grand = withList.reduce(function (t, j) { return t + ML.total(j); }, 0);
    var h = tabs('matlists')
      + '<div class="ml-top"><div class="bpx-mut">' + withList.length + (withList.length === 1 ? ' list' : ' lists') + ' &middot; ' + money(grand) + ' in materials</div>'
      + '<button class="bpx-btn ml-new" onclick="ML.newing=!ML.newing;bpMatLists()">+ New list</button></div>';
    if (ML.newing) {
      var tl = tpls();
      h += '<div class="bpx-panel ml-newp"><div class="ml-sub-h"><b>New material list</b></div><div class="ml-newf">'
        + '<label>Job<select id="ml-new-job">' + rows.map(function (j) { return '<option value="' + j.id + '">' + esc(j.name || 'Job') + (j.title ? ' — ' + esc(j.title) : '') + '</option>'; }).join('') + '</select></label>'
        + '<label>Start from<select id="ml-new-tpl"><option value="">Blank list</option>' + tl.map(function (tp) { return '<option value="' + tp.id + '">' + esc(tp.name) + ' (' + tp.items.length + ' items)</option>'; }).join('') + '</select></label>'
        + '<button class="bpx-rowbtn ml-primary" onclick="ML.create()">Create</button></div>'
        + (rows.length ? '' : '<div class="bpx-mut">No open jobs. Add a project first.</div>') + '</div>';
    }
    h += '<div class="bpx-panel ml-panel">' + (rows.length ? '<table class="bpx-table ml-jobs"><thead><tr><th>Job</th><th class="ml-n">Items</th><th class="ml-n">Total</th><th>Status</th><th>Suppliers</th><th></th></tr></thead><tbody>'
      + rows.map(function (j) {
        var m = j.materials, n = m && m.items ? m.items.length : 0;
        var sups = m ? bySupplier(m.items).map(function (g) { return g.name; }) : [];
        return '<tr class="ml-jrow" onclick="ML.open=\'' + j.id + '\';bpMatLists()"><td data-l="Job"><b>' + esc(j.name || 'Job') + '</b><div class="bpx-mut ml-small">' + esc(j.title || '') + (j.status === 'done' ? ' &middot; done' : '') + '</div></td>'
          + '<td data-l="Items" class="ml-n">' + n + '</td><td data-l="Total" class="ml-n">' + (n ? money(ML.total(j)) : '—') + '</td>'
          + '<td data-l="Status">' + (n || m ? statusPill(m.status) : '<span class="bpx-mut ml-small">No list</span>') + '</td>'
          + '<td data-l="Suppliers" class="ml-sups">' + (sups.length ? esc(sups.join(', ')) : '<span class="bpx-mut">—</span>') + '</td>'
          + '<td class="ml-x"><button class="bpx-rowbtn">Open</button></td></tr>';
      }).join('') + '</tbody></table>' : '<div class="ml-empty bpx-mut">No jobs yet. Material lists hang off a project, so add one in Active Projects first.</div>') + '</div>';
    area.innerHTML = h; done();
  };
  ML.create = function () {
    var jid = ($('ml-new-job') || {}).value, tid = ($('ml-new-tpl') || {}).value; if (!jid) return;
    var j = jobById(jid), m = listOf(j, true);
    if (tid) { var tp = tplById(tid); if (tp) tp.items.forEach(function (it) { m.items.push(Object.assign(tplItem(it), { addedAt: Date.now(), addedAfterSend: m.status !== 'draft', by: who() })); }); }
    saveJobs(); ML.newing = false; ML.open = jid; window.bpMatLists();
    setTimeout(function () { var q = $('ml-q-job-' + jid); if (q) q.focus(); }, 30);
  };

  window.bpMatTemplates = function () {
    var area = $('bpxViewArea'); if (!area) return;
    ensureSP(function () {});
    var tl = tpls(), h = tabs('mattemplates');
    if (ML.tplOpen && tplById(ML.tplOpen)) {
      var tp = tplById(ML.tplOpen);
      area.innerHTML = h + '<div class="bpx-panel ml-panel"><div class="ml-head"><button class="bpx-rowbtn" onclick="ML.tplOpen=null;bpMatTemplates()">&larr; All templates</button>'
        + '<div class="ml-head-t"><b>' + esc(tp.name) + '</b><span class="bpx-mut">Template &middot; quantities and prices are a starting point</span></div>'
        + '<button class="bpx-rowbtn" onclick="ML.tplRename(\'' + tp.id + '\')">Rename</button></div>' + editor(T('tpl', tp.id)) + '</div>';
      done(); return;
    }
    ML.tplOpen = null;
    h += '<div class="ml-top"><div class="bpx-mut">Lists you use again and again. Start a job&rsquo;s list from one in a tap.</div><button class="bpx-btn ml-new" onclick="ML.tplNew()">+ New template</button></div>'
      + '<div class="bpx-panel ml-panel">' + (tl.length ? '<table class="bpx-table ml-jobs"><thead><tr><th>Template</th><th class="ml-n">Items</th><th class="ml-n">Total</th><th></th></tr></thead><tbody>'
        + tl.map(function (tp) {
          return '<tr class="ml-jrow" onclick="ML.tplOpen=\'' + tp.id + '\';bpMatTemplates()"><td data-l="Template"><b>' + esc(tp.name) + '</b></td><td data-l="Items" class="ml-n">' + tp.items.length + '</td><td data-l="Total" class="ml-n">' + money(total(tp.items)) + '</td>'
            + '<td class="ml-x"><button class="bpx-rowbtn">Open</button> <button class="bpx-rowbtn" onclick="event.stopPropagation();ML.tplDel(\'' + tp.id + '\')">Delete</button></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="ml-empty bpx-mut">No templates yet. Open a material list and tap &ldquo;Save as template&rdquo;, or start one here.</div>') + '</div>';
    area.innerHTML = h; done();
  };

  /* ---------- the Materials tab on a project ---------- */
  var oldProjMaterials = window.bpProjMaterials;
  ML.oldProjMaterials = oldProjMaterials;
  window.bpProjMaterials = function (jobId) {
    var el = $('bpx-pj-mat'); if (!el) return;
    var j = jobById(jobId); listOf(j, true);
    el.innerHTML = editor(T('job', jobId));
    ensureSP(function () {});
  };

  /* ---------- budget: show the list beside it, never counted twice ----------
     Supply bills already land as "Materials" expenses when they are matched,
     so adding the list total into spend would count the same shingles twice.
     The list is what the job NEEDS; expenses are what it COST. Shown side by
     side, against the Materials budget line. */
  var oldBudget = window.bpProjBudgetRender;
  if (oldBudget) {
    window.bpProjBudgetRender = function () {
      oldBudget.apply(this, arguments);
      var el = $('bpx-pj-budget'), j = jobById(window._bpProjId); if (!el || !j) return;
      var t = ML.total(j), co = ML.coTotal(j); if (!t && !co) return;
      var b = +((window._bpProjBudget || {})['Materials']) || 0;
      el.insertAdjacentHTML('beforeend', '<div class="ml-bud"><span class="ms">list_alt</span><span>Material list: <b>' + money(t) + '</b>'
        + (b ? ' against a ' + money(b) + ' materials budget' + (t > b ? ' <b class="ml-bad">(' + money(t - b) + ' over)</b>' : '') : '')
        + (co ? ' &middot; Change orders: <b>' + money(co) + '</b>' : '')
        + '<br><span class="bpx-mut">Planned, not spent: bills count once they are logged as expenses.</span></span></div>');
    };
  }

  /* ---------- styles ---------- */
  var css = '#bpx .ml-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}'
    + '#bpx .ml-new{width:auto;margin:0;padding:9px 16px;font-size:13.5px}'
    + '#bpx .ml-panel{padding:14px 16px}#bpx .ml-newp{margin-bottom:12px}'
    + '#bpx .ml-newf{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}#bpx .ml-newf label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;margin:0;flex:1 1 200px}'
    + '#bpx .ml-newf select{padding:8px 10px;border:1px solid var(--line);border-radius:9px;font:inherit;font-size:13.5px;background:#fff}'
    + '#bpx .ml-jrow{cursor:pointer}#bpx .ml-jrow:hover td{background:var(--soft)}#bpx .ml-sups{font-size:12.5px;color:var(--grey)}'
    + '#bpx .ml-n{text-align:right;white-space:nowrap}#bpx .ml-x{text-align:right;white-space:nowrap;width:1%}#bpx .ml-small{font-size:12px}'
    + '#bpx .ml-pill{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;white-space:nowrap}'
    + '#bpx .ml-st-draft{background:#eef1f6;color:#475569}#bpx .ml-st-sent{background:#fdf1dc;color:#a8710f}#bpx .ml-st-recv{background:rgba(31,170,90,.12);color:#178048}'
    + '#bpx .ml-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}#bpx .ml-head-t{flex:1;min-width:160px;display:flex;flex-direction:column}#bpx .ml-head-t span{font-size:12.5px}'
    + '#bpx .ml-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}#bpx .ml-bar-l{display:flex;gap:8px;align-items:center}#bpx .ml-bar-r{display:flex;gap:6px;flex-wrap:wrap}'
    + '#bpx .ml-primary{background:var(--blue,#006fff);color:#fff;border-color:var(--blue,#006fff)}'
    + '#bpx .ml-add{position:relative;display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:4px 4px 4px 10px;margin-bottom:10px;background:#fff}'
    + '#bpx .ml-add>.ms{color:var(--grey);font-size:19px}#bpx .ml-q{flex:1;min-width:0;border:0;outline:0;padding:8px 2px;font:inherit;font-size:14px;background:transparent}'
    + '#bpx .ml-res{position:absolute;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 30px rgba(10,20,40,.12);z-index:40;max-height:340px;overflow:auto}'
    + '#bpx .ml-opt{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line-2);padding:9px 12px;font:inherit;font-size:13.5px;cursor:pointer;color:inherit}'
    + '#bpx .ml-opt:hover{background:var(--soft)}#bpx .ml-opt small{color:var(--grey);font-size:11px}#bpx .ml-opt-s{font-size:12px;color:var(--grey);white-space:nowrap}#bpx .ml-opt-p{font-weight:600;white-space:nowrap;text-align:right}'
    + '#bpx .ml-opt-custom{display:block;color:var(--blue,#006fff);font-weight:600}#bpx .ml-opt-none{padding:10px 12px;font-size:13px}'
    + '#bpx .ml-tbl td{vertical-align:middle;padding:7px 8px}#bpx .ml-tbl th{padding:8px}#bpx .ml-name{font-weight:600}#bpx .ml-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center}#bpx .ml-meta small{color:var(--grey);font-size:11px}'
    + '#bpx .ml-in{border:1px solid var(--line);border-radius:7px;padding:6px 8px;font:inherit;font-size:13.5px;background:#fff;width:100%;box-sizing:border-box;min-width:0}'
    + '#bpx .ml-in-num{width:88px;text-align:right}#bpx .ml-in-unit{width:64px}#bpx .ml-in-name{font-weight:600}#bpx .ml-lt{font-weight:600}'
    + '#bpx .ml-rm{border:0;background:none;color:var(--grey);font-size:20px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}#bpx .ml-rm:hover{color:#dc2626;background:#fdecec}'
    + '#bpx .ml-late td{background:#fffbf0}#bpx .ml-tag{font-size:10.5px;font-weight:600;background:#fdf1dc;color:#a8710f;border-radius:5px;padding:1px 6px}#bpx .ml-tag-ok{background:rgba(31,170,90,.12);color:#178048}'
    + '#bpx .ml-foot{border-top:1px solid var(--line);margin-top:4px;padding-top:8px;display:flex;flex-direction:column;gap:3px;align-items:flex-end}'
    + '#bpx .ml-fr{display:flex;justify-content:space-between;gap:24px;font-size:13px;min-width:260px;max-width:100%}#bpx .ml-grand{font-weight:700;font-size:15px}'
    + '#bpx .ml-empty{padding:22px 6px;text-align:center;font-size:13.5px}'
    + '#bpx .ml-sub{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:10px;background:var(--soft)}#bpx .ml-sub-h{font-size:12.5px;margin-bottom:6px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}'
    + '#bpx .ml-srow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--line-2);font-size:13px;flex-wrap:wrap}#bpx .ml-srow-a{display:flex;gap:6px}'
    + '#bpx .ml-chk{white-space:nowrap;flex:0 0 auto;font-weight:600;display:inline-flex;gap:6px;align-items:center;margin:0;font-size:12.5px}#bpx .ml-chkrow{cursor:pointer;margin:0;font-weight:400}'
    + '#bpx .ml-copytxt{width:100%;min-height:120px;margin-top:8px;font:12.5px/1.4 ui-monospace,monospace;border:1px solid var(--line);border-radius:8px;padding:8px;box-sizing:border-box}'
    + '#bpx .ml-cos{margin-top:12px;padding-top:8px;border-top:1px dashed var(--line);display:flex;flex-direction:column;gap:2px}#bpx .ml-cos .ml-fr{min-width:0}'
    + '#bpx .ml-cobar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border-radius:10px;background:#fffbf0;border:1px solid #f3e1b5;font-size:13px}'
    + '#bpx .ml-co{margin-top:12px;background:#fff}#bpx .ml-co-f{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0}#bpx .ml-co-f label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;margin:0}#bpx .ml-co-note{flex:1;min-width:180px}'
    + '#bpx .ml-co .ml-fr{min-width:0}#bpx .ml-co-a{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}'
    + '#bpx .ml-bud{display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:9px 12px;border-radius:10px;background:var(--soft);font-size:12.5px;line-height:1.45}#bpx .ml-bud .ms{font-size:18px;color:var(--grey)}#bpx .ml-bad{color:#dc2626}'
    + '@media(max-width:640px){#bpx .ml-tbl thead,#bpx .ml-jobs thead{display:none}#bpx .ml-tbl,#bpx .ml-tbl tbody,#bpx .ml-jobs,#bpx .ml-jobs tbody{display:block}'
    + '#bpx .ml-tbl tr,#bpx .ml-jobs tr{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--line-2);position:relative}'
    + '#bpx .ml-tbl td,#bpx .ml-jobs td{display:flex;justify-content:space-between;align-items:center;gap:8px;border:0;padding:2px 0;text-align:left}'
    + '#bpx .ml-tbl td[data-l]:before,#bpx .ml-jobs td[data-l]:before{content:attr(data-l);font-size:11px;color:var(--grey);text-transform:uppercase;letter-spacing:.03em}'
    + '#bpx .ml-tbl td[data-l="Item"],#bpx .ml-jobs td[data-l="Job"],#bpx .ml-jobs td[data-l="Template"]{grid-column:1/-1;display:block;padding-right:34px}#bpx .ml-tbl td[data-l="Item"]:before,#bpx .ml-jobs td[data-l="Job"]:before,#bpx .ml-jobs td[data-l="Template"]:before{display:none}'
    + '#bpx .ml-tbl .ml-x{position:absolute;right:0;top:8px;width:auto}#bpx .ml-jobs .ml-x{grid-column:1/-1;justify-content:flex-end}#bpx .ml-jobs td[data-l="Suppliers"]{grid-column:1/-1}'
    + '#bpx .ml-in-num{width:90px}#bpx .ml-fr{min-width:0;width:100%}#bpx .ml-foot{align-items:stretch}#bpx .ml-opt{grid-template-columns:minmax(0,1fr) auto}#bpx .ml-opt-s{grid-column:1;grid-row:2}#bpx .ml-opt-p{grid-row:1/3;grid-column:2}}';
  var st = document.createElement('style'); st.id = 'ml-css'; st.textContent = css; document.head.appendChild(st);
})();

(function(){var s=document.getElementById('ml-css');if(s)s.textContent+='#bpx .ml-chk input{width:auto;margin:0}';})();
