/* ==================================================================
   Receipts: what was actually bought, per supplier, per job.

   The material list (matlists.js) is a planning sheet and never counts as
   cost. A receipt does. Upload one from a supplier card on Suppliers:
   the photo is read by the same supply-scan edge function the old bill
   scanner uses (SP.scanRead), or typed in by hand when that is not
   reachable, then reviewed, a job picked, and saved. Saving:

     a) adds ONE 'Materials' expense to that job's j.expenses (the same
        shape SP.reconcile writes: { cat, amt, note, key, when }) so it
        counts in job profit, budget actuals and Finances. "Overhead / no
        job" writes a Materials expense to the Finances ledger (bpFin).
     b) keeps the receipt: localStorage 'bpReceipts', mirrored into
        settings (supplyReceipts) so it follows the account. The image is
        uploaded to the project-files bucket via bpPF.upload when signed
        in (an "sb:" reference); otherwise a shrunk data URL stays.
     c) puts the real prices into that supplier's price book (supplier_items,
        which is the "yours" tier), as supply-scan already does.

   Deleting a receipt removes its expense.
   ================================================================== */
(function () {
  'use strict';
  var SP = window.SP; if (!SP) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var uid = function (p) { return (p || 'r') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var num = function (v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  var r2 = function (n) { return Math.round((+n || 0) * 100) / 100; };
  var money = function (n) { n = +n || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var dateTs = function (s) { var t = Date.parse(String(s || '') + 'T12:00:00'); return isFinite(t) ? t : Date.now(); };
  var fmtDate = function (s) { var t = dateTs(s); return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  var jobsAll = function () { return window.bpJobsGet ? bpJobsGet() : []; };
  var openJobs = function () { return jobsAll().filter(function (j) { return j.status !== 'done'; }); };

  /* ---------- store ---------- */
  function all() {
    try { var a = JSON.parse(localStorage.getItem('bpReceipts') || 'null'); if (Array.isArray(a)) return a; } catch (e) {}
    var st = window.bpSettingsGet ? bpSettingsGet() : {};
    return Array.isArray(st.supplyReceipts) ? st.supplyReceipts : [];
  }
  function setAll(a) {
    try { localStorage.setItem('bpReceipts', JSON.stringify(a)); } catch (e) {
      /* full: drop inline images from the oldest receipts rather than lose them */
      a.slice(10).forEach(function (r) { if (r.image && r.image.indexOf('data:') === 0) { r.image = ''; r.imageDropped = true; } });
      try { localStorage.setItem('bpReceipts', JSON.stringify(a)); } catch (e2) {}
    }
    if (window.bpSettingsGet && window.bpSettingsSet) {
      try {
        var st = bpSettingsGet();
        /* the account copy carries storage references, not inline photos */
        st.supplyReceipts = a.map(function (r) { return Object.assign({}, r, { image: r.image && r.image.indexOf('data:') === 0 ? '' : r.image }); });
        bpSettingsSet(st); if (window.bpSettingsPush) bpSettingsPush(st);
      } catch (e) {}
    }
  }
  SP.receipts = all;
  var bySup = function (id) { return all().filter(function (r) { return r.supplierId === id; }); };
  var byJob = function (id) { return all().filter(function (r) { return r.jobId === id; }); };
  function jobName(r) {
    if (!r.jobId) return 'Overhead';
    var j = jobsAll().filter(function (x) { return x.id === r.jobId; })[0];
    return j ? (j.name || 'Job') : (r.jobName || 'Job');
  }

  /* ---------- on the supplier card ---------- */
  SP.rcStats = function (s) {
    var rs = bySup(s.id), ym = today().slice(0, 7);
    var month = rs.filter(function (r) { return String(r.date || '').slice(0, 7) === ym; }).reduce(function (t, r) { return t + (+r.total || 0); }, 0);
    return '<div class="rc-stats"><div><b>' + rs.length + '</b><span>' + (rs.length === 1 ? 'receipt' : 'receipts') + '</span></div>'
      + '<div><b>' + money(month) + '</b><span>spent this month</span></div>'
      + '<div><b>' + esc(s.account_no || '—') + '</b><span>account #</span></div></div>';
  };
  SP.rcFilter = '';
  SP.rcSection = function () {
    var rs = all().slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || (b.at || 0) - (a.at || 0); });
    if (SP.rcFilter) rs = rs.filter(function (r) { return r.supplierId === SP.rcFilter; });
    var sups = {}; all().forEach(function (r) { sups[r.supplierId] = r.supplierName; });
    var h = '<div class="bpx-chead" style="margin:22px 0 10px"><div class="bpx-ptitle" style="margin:0">Receipts'
      + '<span class="lg2">What you actually bought. Each one is a Materials expense on its job.</span></div>'
      + (Object.keys(sups).length > 1 ? '<select class="rc-filter" onchange="SP.rcFilter=this.value;bpSuppliers()"><option value="">All suppliers</option>'
        + Object.keys(sups).map(function (k) { return '<option value="' + esc(k) + '"' + (SP.rcFilter === k ? ' selected' : '') + '>' + esc(sups[k]) + '</option>'; }).join('') + '</select>' : '') + '</div>';
    if (!rs.length) return h + '<div class="bpx-panel rc-empty bpx-mut">No receipts yet. Tap &ldquo;Upload receipt&rdquo; on a supplier after you buy something.</div>';
    return h + '<div class="bpx-panel rc-list">' + rs.map(rowHtml).join('') + '</div>';
  };
  function rowHtml(r, onJob) {
    return '<div class="rc-row"><div class="rc-row-m"><b>' + esc(onJob ? r.supplierName : jobName(r)) + '</b>'
      + '<span class="bpx-mut">' + esc(fmtDate(r.date)) + (onJob ? '' : ' &middot; ' + esc(r.supplierName)) + (r.number ? ' &middot; #' + esc(r.number) : '')
      + ' &middot; ' + (r.lines || []).length + ((r.lines || []).length === 1 ? ' line' : ' lines') + '</span></div>'
      + '<b class="rc-row-t">' + money(r.total) + '</b><span class="rc-row-a">'
      + (r.image ? '<button class="bpx-rowbtn" onclick="SP.rcView(\'' + r.id + '\')">View</button>' : '')
      + '<button class="bpx-rowbtn rc-del" onclick="SP.rcDel(\'' + r.id + '\')" aria-label="Delete receipt">Delete</button></span></div>';
  }
  SP.rcView = function (id) {
    var r = all().filter(function (x) { return x.id === id; })[0]; if (!r || !r.image) return;
    if (window.bpPF && bpPF.open) { bpPF.open(r.image, r.mime || 'image/jpeg'); return; }
    var w = window.open('', '_blank'); if (w) w.document.write('<img src="' + r.image + '" style="max-width:100%">');
  };

  /* ---------- on the project Materials tab ---------- */
  window.bpReceiptsFor = function (jobId) {
    var rs = byJob(jobId).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var t = rs.reduce(function (s, r) { return s + (+r.total || 0); }, 0);
    return '<div class="rc-job"><div class="rc-job-h"><span>Bought <span class="bpx-mut">(counts toward cost)</span></span><b>' + money(t) + '</b></div>'
      + (rs.length ? rs.map(function (r) { return rowHtml(r, true); }).join('')
        : '<div class="bpx-mut rc-job-e">No receipts on this job yet. Upload one from Supply &rsaquo; Suppliers.</div>')
      + '<button class="bpx-linkbtn" onclick="bpCloseModal&&bpCloseModal();bpNav(\'suppliers\')">Upload a receipt</button></div>';
  };

  /* ---------- expense ---------- */
  function expenseNote(r) { return r.supplierName + ' receipt' + (r.number ? ' #' + r.number : ''); }
  function writeExpense(r) {
    var key = 'rc' + r.id, when = dateTs(r.date);
    if (r.jobId) {
      var js = jobsAll(), j = js.filter(function (x) { return x.id === r.jobId; })[0];
      if (!j) throw new Error('That job is gone.');
      j.expenses = (j.expenses || []).filter(function (e) { return e.key !== key; });
      j.expenses.push({ cat: 'Materials', amt: r2(r.total), note: expenseNote(r), key: key, when: when, receiptId: r.id });
      bpJobsSet(js);
    } else {
      var fin = (window.bpFinGet ? bpFinGet() : []).filter(function (e) { return e.id !== key; });
      fin.unshift({ id: key, kind: 'expense', amount: r2(r.total), category: 'Materials', note: expenseNote(r), when: when, receiptId: r.id });
      bpFinSet(fin);
    }
    return key;
  }
  function dropExpense(r) {
    var key = 'rc' + r.id;
    var js = jobsAll(), hit = false;
    js.forEach(function (j) { var n = (j.expenses || []).length; j.expenses = (j.expenses || []).filter(function (e) { return e.key !== key; }); if (j.expenses.length !== n) hit = true; });
    if (hit) bpJobsSet(js);
    if (window.bpFinGet) { var fin = bpFinGet(), f2 = fin.filter(function (e) { return e.id !== key; }); if (f2.length !== fin.length) bpFinSet(f2); }
  }
  SP.rcDel = function (id) {
    var a = all(), r = a.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (!confirm('Delete this ' + money(r.total) + ' receipt from ' + r.supplierName + '? Its expense on ' + jobName(r) + ' is removed too.')) return;
    dropExpense(r);
    if (window.bpPF && bpPF.remove && r.image) bpPF.remove(r.image);
    setAll(a.filter(function (x) { return x.id !== id; }));
    refresh(r.jobId);
  };
  function refresh(jobId) {
    if (window._bpCurView === 'suppliers') window.bpSuppliers();
    var m = $('bpx-pj-mat');
    if (m && window.bpProjMaterials && window._bpProjId) {
      bpProjMaterials(window._bpProjId);
      /* keep the open project's expense list in step, or its Save would put it back */
      if (window._bpProjId === jobId || !jobId) {
        var j = jobsAll().filter(function (x) { return x.id === window._bpProjId; })[0];
        if (j && typeof window._bpProjExp !== 'undefined') {
          window._bpProjExp = (j.expenses || []).map(function (e) { return Object.assign({}, e); });
          if (window.bpProjExpRender) bpProjExpRender(); if (window.bpProjBudgetRender) bpProjBudgetRender();
        }
      }
    }
  }

  /* ---------- upload + review ---------- */
  var R = SP.rc = null;
  function blank(supId) {
    var s = SP.supById(supId) || {};
    return { supplierId: supId, supplierName: s.name || '', jobId: null, date: today(), number: '', lines: [], tax: '', total: '', totalTouched: false,
      image: '', mime: '', file: '', read: '', learn: true };
  }
  SP.rcOpen = function (supId) {
    R = SP.rc = blank(supId);
    var s = SP.supById(supId) || {};
    window.bpModal('<h3>Upload a receipt</h3>'
      + '<div class="bpx-sub"><span style="display:inline;font-weight:700">From ' + esc(s.name || 'this supplier') + (s.branch ? ', ' + esc(s.branch) : '') + '.</span> We read the date, the lines and the total, then you pick the job it was for.</div>'
      + '<div class="rc-drop" id="rc-drop"><span class="ms">receipt_long</span><b>Take a photo or choose a file</b>'
      + '<span class="bpx-mut">Photo or PDF, flat and in good light.</span>'
      + '<div class="rc-drop-b"><label class="bpx-btn" for="rc-cam"><span class="ms">photo_camera</span>Take a photo</label>'
      + '<label class="bpx-btn ghost" for="rc-file">Choose a file</label></div>'
      + '<input type="file" id="rc-cam" accept="image/*" capture="environment" hidden>'
      + '<input type="file" id="rc-file" accept="image/*,application/pdf" hidden>'
      + '<button class="bpx-linkbtn" onclick="SP.rcManual()">No photo? Enter it by hand</button></div>'
      + '<div id="rc-out"></div><div class="bpx-mmsg" id="rc-msg"></div>'
      + '<div class="row" id="rc-foot"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button></div>');
    var card = document.querySelector('#bpx-modal .bpx-modalcard'); if (card) card.style.maxWidth = '760px';
    ['rc-cam', 'rc-file'].forEach(function (id) { var el = $(id); if (el) el.onchange = function () { if (el.files && el.files[0]) SP.rcFile(el.files[0]); }; });
    var drop = $('rc-drop');
    if (drop) {
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = function () { drop.classList.remove('over'); };
      drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) SP.rcFile(f); };
    }
  };
  function toDataUrl(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result || '')); }; r.onerror = rej; r.readAsDataURL(blob); }); }
  SP.rcFile = function (file) {
    if (!R) return;
    R.file = file.name || 'receipt'; R.mime = file.type || 'image/jpeg';
    $('rc-out').innerHTML = '<div class="rc-reading"><span class="sp-ring"></span><b>Reading ' + esc(R.file) + '</b><span class="bpx-mut">Finding the date, the lines and the total</span></div>';
    var keep = (SP.scanShrink ? SP.scanShrink(file) : Promise.resolve({ mime: file.type, blob: file }))
      .then(function (o) { R.mime = o.mime; return toDataUrl(o.blob); }).then(function (d) { R.image = d; }).catch(function () {});
    var read = SP.scanRead ? SP.scanRead(file) : Promise.reject(new Error('offline'));
    Promise.all([keep, read.then(function (d) { return { doc: d }; }, function (e) { return { err: e }; })]).then(function (out) {
      if (!R) return;
      var r = out[1];
      if (r.doc) {
        var d = r.doc;
        R.read = 'ok';
        if (d.dated) R.date = String(d.dated).slice(0, 10);
        R.number = d.invoice_no || '';
        R.lines = (d.lines || []).map(function (l) { return { id: uid('l'), name: l.name || '', sku: l.sku || '', qty: l.qty == null ? 1 : +l.qty, unit: l.unit || 'ea', price: +l.unit_price || 0, total: l.line_total != null ? +l.line_total : r2((+l.qty || 0) * (+l.unit_price || 0)) }; });
        R.tax = d.tax ? r2(d.tax) : '';
        if (d.total) { R.total = r2(d.total); R.totalTouched = true; }
        if (d.confidence != null && d.confidence < 0.55) R.read = 'low';
      } else { R.read = 'manual'; if (!R.lines.length) R.lines.push({ id: uid('l'), name: '', sku: '', qty: 1, unit: 'ea', price: '', total: '' }); }
      review();
    });
  };
  SP.rcManual = function () { if (!R) return; R.read = 'hand'; if (!R.lines.length) R.lines.push({ id: uid('l'), name: '', sku: '', qty: 1, unit: 'ea', price: '', total: '' }); review(); };

  function sumLines() { return r2(R.lines.reduce(function (t, l) { return t + (+l.total || 0); }, 0)); }
  function autoTotal() { if (!R.totalTouched) R.total = R.lines.length ? r2(sumLines() + num(R.tax)) : R.total; }
  function review() {
    var drop = $('rc-drop'); if (drop) drop.style.display = 'none';
    autoTotal();
    var js = openJobs(), h = '';
    if (R.read === 'manual') h += '<div class="sp-note warn"><span class="ms">edit_note</span>We could not read it automatically right now. Type the lines, or just the total.</div>';
    if (R.read === 'low') h += '<div class="sp-note warn"><span class="ms">warning</span>Hard to read. Check every figure before you save.</div>';
    h += '<div class="rc-grid">'
      + (R.image && R.mime !== 'application/pdf' ? '<img class="rc-thumb" src="' + R.image + '" alt="Receipt photo">' : R.image ? '<div class="rc-thumb rc-pdf"><span class="ms">picture_as_pdf</span>' + esc(R.file) + '</div>' : '')
      + '<div class="rc-f">'
      + '<label>Supplier<select id="rc-sup" onchange="SP.rcSet(\'supplierId\',this.value)">' + SP.sup.map(function (s) { return '<option value="' + s.id + '"' + (s.id === R.supplierId ? ' selected' : '') + '>' + esc(s.name) + (s.branch ? ', ' + esc(s.branch) : '') + '</option>'; }).join('') + '</select></label>'
      + '<label class="rc-req">Which job is this for?<select id="rc-job" onchange="SP.rcSet(\'jobId\',this.value)"><option value=""' + (R.jobId == null ? ' selected' : '') + ' disabled>Choose a job&hellip;</option>'
      + js.map(function (j) { return '<option value="' + j.id + '"' + (R.jobId === j.id ? ' selected' : '') + '>' + esc(j.name || 'Job') + (j.title ? ' — ' + esc(j.title) : '') + '</option>'; }).join('')
      + '<option value="__overhead"' + (R.jobId === '' ? ' selected' : '') + '>Overhead / no job</option></select></label>'
      + '<div class="rc-2"><label>Date<input type="date" id="rc-date" value="' + esc(R.date) + '" onchange="SP.rcSet(\'date\',this.value)"></label>'
      + '<label>Receipt #<input id="rc-num" value="' + esc(R.number) + '" placeholder="optional" onchange="SP.rcSet(\'number\',this.value)"></label></div>'
      + '</div></div>';
    h += '<div class="rc-lines"><div class="rc-lh"><span>Item</span><span>SKU</span><span class="n">Qty</span><span class="n">Each</span><span class="n">Line total</span><span></span></div>'
      + R.lines.map(function (l, i) {
        var f = function (k, v, cls, ph, isNum) { return '<input class="rc-in ' + cls + '" data-l="' + k + '" ' + (isNum ? 'inputmode="decimal"' : '') + ' placeholder="' + ph + '" value="' + esc(v) + '" onchange="SP.rcLine(' + i + ',\'' + k + '\',this.value)">'; };
        return '<div class="rc-line">' + f('name', l.name, 'rc-nm', 'Item name') + f('sku', l.sku, 'rc-sku', 'SKU') + f('qty', l.qty, 'n', 'Qty', 1)
          + f('price', l.price === '' ? '' : r2(l.price).toFixed(2), 'n', 'Each', 1) + f('total', l.total === '' ? '' : r2(l.total).toFixed(2), 'n', 'Total', 1)
          + '<button class="ml-rm rc-x" aria-label="Remove line" onclick="SP.rcLineDel(' + i + ')">&times;</button></div>';
      }).join('')
      + '<button class="bpx-linkbtn" onclick="SP.rcLineAdd()">+ Add a line</button></div>';
    h += '<div class="rc-tot"><label>Tax<input class="rc-in n" inputmode="decimal" id="rc-tax" value="' + esc(R.tax === '' ? '' : r2(R.tax).toFixed(2)) + '" placeholder="0.00" onchange="SP.rcSet(\'tax\',this.value)"></label>'
      + '<label class="rc-big">Total<input class="rc-in n" inputmode="decimal" id="rc-total" value="' + esc(R.total === '' ? '' : r2(R.total).toFixed(2)) + '" placeholder="0.00" onchange="SP.rcSet(\'total\',this.value)"></label></div>'
      + (R.lines.length && R.totalTouched && Math.abs(sumLines() + num(R.tax) - num(R.total)) > 0.02 ? '<div class="bpx-mut rc-diff">Lines plus tax come to ' + money(sumLines() + num(R.tax)) + '. <button class="bpx-linkbtn" onclick="SP.rcRetotal()">Use that</button></div>' : '');
    var priced = R.lines.filter(function (l) { return l.name && +l.price > 0; }).length, sname = (SP.supById(R.supplierId) || {}).name || 'this supplier';
    h += '<label class="sp-check rc-learn"><input type="checkbox" id="rc-learn"' + (priced && R.learn ? ' checked' : '') + (priced ? '' : ' disabled') + ' onchange="SP.rc.learn=this.checked"> '
      + (priced ? 'Update ' + esc(sname) + '&rsquo;s price book with ' + (priced === 1 ? 'this real price' : 'these ' + priced + ' real prices') : 'No line prices to add to the price book') + '</label>'
      + '<div class="bpx-mut rc-foot-n">Saving adds one ' + money(R.total) + ' Materials expense to the job you pick, so it counts toward that job&rsquo;s cost and your Finances.</div>';
    $('rc-out').innerHTML = h; var mm = $('rc-msg'); if (mm) mm.textContent = '';
    $('rc-foot').innerHTML = '<button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" id="rc-save" onclick="SP.rcSave()">Save receipt</button>';
  }
  SP.rcSet = function (k, v) {
    if (!R) return;
    if (k === 'jobId') R.jobId = v === '__overhead' ? '' : v;
    else if (k === 'supplierId') { R.supplierId = v; R.supplierName = (SP.supById(v) || {}).name || ''; }
    else if (k === 'tax') R.tax = String(v).trim() === '' ? '' : num(v);
    else if (k === 'total') { R.total = String(v).trim() === '' ? '' : num(v); R.totalTouched = String(v).trim() !== ''; }
    else R[k] = v;
    review();
  };
  SP.rcRetotal = function () { R.totalTouched = false; review(); };
  SP.rcLine = function (i, k, v) {
    var l = R && R.lines[i]; if (!l) return;
    if (k === 'name' || k === 'sku') l[k] = String(v);
    else {
      l[k] = String(v).trim() === '' ? '' : num(v);
      if (k === 'qty' || k === 'price') { if (l.qty !== '' && l.price !== '') l.total = r2(l.qty * l.price); }
      else if (k === 'total' && l.total !== '' && +l.qty > 0 && (l.price === '' || !+l.price)) l.price = r2(l.total / l.qty);
    }
    review();
  };
  SP.rcLineAdd = function () { R.lines.push({ id: uid('l'), name: '', sku: '', qty: 1, unit: 'ea', price: '', total: '' }); review(); var ins = document.querySelectorAll('#rc-out .rc-nm'); if (ins.length) ins[ins.length - 1].focus(); };
  SP.rcLineDel = function (i) { R.lines.splice(i, 1); review(); };

  function slug(name) { return 'X-' + String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24); }
  SP.rcSave = function () {
    if (!R) return;
    var msg = function (t) { var e = $('rc-msg'); if (e) { e.textContent = t; e.style.color = '#b3392f'; } };
    if (R.jobId == null) { msg('Pick the job this receipt is for (or Overhead / no job).'); var js = $('rc-job'); if (js) js.focus(); return; }
    var tot = r2(num(R.total));
    if (!(tot > 0)) { msg('Enter the receipt total.'); var t = $('rc-total'); if (t) t.focus(); return; }
    var sup = SP.supById(R.supplierId); if (!sup) { msg('Pick the supplier.'); return; }
    var job = R.jobId ? jobsAll().filter(function (x) { return x.id === R.jobId; })[0] : null;
    var rec = { id: uid('rc'), supplierId: sup.id, supplierName: sup.name, jobId: R.jobId, jobName: job ? job.name || 'Job' : '', date: R.date || today(), number: String(R.number || '').trim(),
      lines: R.lines.filter(function (l) { return String(l.name).trim() || +l.total; }).map(function (l) { return { name: String(l.name).trim(), sku: l.sku || '', qty: l.qty === '' ? null : +l.qty, unit: l.unit || 'ea', price: l.price === '' ? null : r2(l.price), total: l.total === '' ? null : r2(l.total) }; }),
      tax: R.tax === '' ? 0 : r2(R.tax), total: tot, image: R.image || '', mime: R.mime || '', file: R.file || '', read: R.read || 'hand', at: Date.now() };
    try { rec.expKey = writeExpense(rec); } catch (e) { msg('Could not add the expense. ' + (e.message || '')); return; }
    var a = all(); a.unshift(rec); setAll(a);
    /* move the photo to storage when signed in; the data URL stands until then */
    if (rec.image && rec.image.indexOf('data:') === 0 && window.bpPF && bpPF.upload && window.BP_LIVE) {
      bpPF.upload(rec.jobId || 'overhead', 'receipts', rec.image, rec.file || 'receipt').then(function (ref) {
        var b = all(), x = b.filter(function (y) { return y.id === rec.id; })[0]; if (x) { x.image = ref; setAll(b); }
      }).catch(function () {});
    }
    /* the price book: real prices at this supplier ("yours") */
    var learn = R.learn && !!($('rc-learn') || {}).checked;
    var rows = learn ? rec.lines.filter(function (l) { return l.name && l.price > 0; }).map(function (l) {
      return { supplier_id: sup.id, sku: l.sku || slug(l.name), name: l.name, unit: l.unit || 'ea', price: l.price, source: 'receipt', source_at: new Date().toISOString(), source_ref: rec.number || '' };
    }) : [];
    var done = function () {
      R = SP.rc = null; window.bpCloseModal();
      window.bpToast && bpToast(money(tot) + ' added to ' + (job ? (job.name || 'the job') : 'overhead') + ' as a Materials expense.');
      if (window._bpCurView === 'suppliers') window.bpSuppliers();
    };
    if (!rows.length) { done(); return; }
    SP.db.upsertItems(rows).then(function () { return SP.load(true); }).then(done, function () { done(); window.bpToast && bpToast('Receipt saved. The prices could not be added to the price book.'); });
  };

  /* ---------- styles ---------- */
  var css = '#bpx .rc-up{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:2px 0 0;padding:12px 14px;font-size:15px}#bpx .rc-up .ms{font-size:20px}'
    + '#bpx .rc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;border:1px solid var(--line);border-radius:11px;padding:9px 6px;background:var(--tint,#f4f6fa)}'
    + '#bpx .rc-stats>div{text-align:center;min-width:0}#bpx .rc-stats b{display:block;font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#bpx .rc-stats span{display:block;font-size:10.5px;color:var(--grey);margin-top:1px}'
    + '#bpx .rc-filter{padding:7px 10px;border:1px solid var(--line);border-radius:9px;font:inherit;font-size:13px;background:#fff;max-width:100%}'
    + '#bpx .rc-list{padding:4px 14px}#bpx .rc-empty{padding:18px;text-align:center;font-size:13.5px}'
    + '#bpx .rc-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line-2);flex-wrap:wrap}#bpx .rc-row:last-child{border-bottom:0}'
    + '#bpx .rc-row-m{flex:1 1 200px;min-width:0;display:flex;flex-direction:column}#bpx .rc-row-m span{font-size:12.5px}#bpx .rc-row-t{white-space:nowrap}#bpx .rc-row-a{display:flex;gap:6px}#bpx .rc-del{color:#b3392f}'
    + '#bpx .rc-job{margin-top:16px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff}#bpx .rc-job-h{display:flex;justify-content:space-between;gap:10px;font-weight:600;font-size:14px;padding-bottom:6px;border-bottom:1px solid var(--line-2)}#bpx .rc-job-e{font-size:12.5px;padding:10px 0}'
    + '#bpx .rc-drop{border:2px dashed var(--line);border-radius:14px;padding:22px 16px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin:12px 0}#bpx .rc-drop.over{border-color:var(--blue,#006fff);background:var(--soft)}#bpx .rc-drop>.ms{font-size:34px;color:var(--grey)}'
    + '#bpx .rc-drop-b{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:4px}#bpx .rc-drop-b .bpx-btn{width:auto;margin:0;padding:11px 18px;display:inline-flex;align-items:center;gap:6px;cursor:pointer}'
    + '#bpx .rc-reading{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px;text-align:center}'
    + '#bpx .rc-grid{display:flex;gap:14px;margin:10px 0;align-items:flex-start}#bpx .rc-thumb{width:120px;max-height:170px;object-fit:cover;border-radius:10px;border:1px solid var(--line);flex:0 0 auto}#bpx .rc-pdf{height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;padding:6px;text-align:center;word-break:break-all}'
    + '#bpx .rc-f{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}#bpx .rc-f label,#bpx .rc-tot label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;margin:0}'
    + '#bpx .rc-f select,#bpx .rc-f input{padding:8px 10px;border:1px solid var(--line);border-radius:9px;font:inherit;font-size:14px;background:#fff;width:100%;box-sizing:border-box;min-width:0}'
    + '#bpx .rc-req select{border-color:var(--blue,#006fff)}#bpx .rc-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}'
    + '#bpx .rc-lines{border-top:1px solid var(--line);margin-top:6px;padding-top:6px}#bpx .rc-lh,#bpx .rc-line{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1.3fr) 60px 84px 92px 28px;gap:6px;align-items:center}'
    + '#bpx .rc-lh{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--grey);padding:4px 0}#bpx .rc-line{padding:3px 0}#bpx .n{text-align:right}'
    + '#bpx .rc-in{border:1px solid var(--line);border-radius:7px;padding:7px 8px;font:inherit;font-size:13.5px;background:#fff;width:100%;box-sizing:border-box;min-width:0}'
    + '#bpx .rc-tot{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}#bpx .rc-tot label{width:130px}#bpx .rc-big input{font-weight:700;font-size:16px}'
    + '#bpx .rc-diff{text-align:right;font-size:12.5px;margin-top:4px}#bpx .rc-learn{margin-top:12px}#bpx .rc-foot-n{font-size:12.5px;margin-top:6px}'
    + '@media(max-width:640px){#bpx .rc-grid{flex-direction:column}#bpx .rc-thumb{width:100%;max-height:200px}#bpx .rc-lh{display:none}'
    + '#bpx .rc-line{grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--line-2);padding:8px 0;position:relative}#bpx .rc-line .rc-nm{grid-column:1/-1;width:calc(100% - 34px)}#bpx .rc-line .rc-x{position:absolute;right:0;top:12px}'
    + '#bpx .rc-tot label{flex:1;width:auto}#bpx .rc-row-a{margin-left:auto}}';
  var st = document.createElement('style'); st.id = 'rc-css'; st.textContent = css; document.head.appendChild(st);
})();
