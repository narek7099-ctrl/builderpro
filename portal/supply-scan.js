/* ==================================================================
   Supply, part two: paperwork becomes data.

   A photo of a supplier invoice or quote carries the contractor's real
   negotiated prices and the PO number. Reading it closes both gaps that
   otherwise need a distributor API:

     - the price book maintains itself from documents the supplier
       already hands over, so pricing is the contractor's own and current
     - reconciliation matches the invoice to its PO and the job without
       anyone typing a number

   Extends window.SP from supply.js.
   ================================================================== */
(function () {
  'use strict';
  var SP = window.SP; if (!SP) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.bpEsc;
  var money = function (n) { n = +n || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var norm = function (s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var msg = function (id, t, bad) { var e = $(id); if (!e) return; e.textContent = t || ''; e.style.color = bad ? '#b3392f' : ''; };

  SP.scan = { doc: null, po: null, file: '', busy: false, mode: 'new', drive: 20 };

  /* ---------- open ---------- */
  SP.scanOpen = function (poId) {
    SP.scan = { doc: null, po: poId ? SP.pos.filter(function (p) { return p.id === poId; })[0] : null, file: '', busy: false, mode: 'new', drive: 20 };
    var p = SP.scan.po;
    window.bpModal('<h3>Scan a supplier document</h3>'
      + '<div class="bpx-sub">' + (p ? 'Photograph the invoice for ' + esc(p.po_number) + '. ' : 'An invoice, a quote or a counter receipt. ')
      + 'We read the prices and the PO number off it, match it to the job, and keep your price book current. Nothing is typed.</div>'
      + '<div class="sp-drop" id="sp-drop">'
      + '<span class="ms">document_scanner</span>'
      + '<b>Take a photo or choose a file</b>'
      + '<span class="bpx-mut">Photo, screenshot or PDF. Flat, in good light, all four corners in frame.</span>'
      + '<div class="sp-drop-btns">'
      + '<label class="bpx-btn sp-inline" for="sp-scan-cam">Take a photo</label>'
      + '<label class="bpx-btn ghost sp-inline" for="sp-scan-file">Choose a file</label>'
      + '</div>'
      + '<input type="file" id="sp-scan-cam" accept="image/*" capture="environment" hidden>'
      + '<input type="file" id="sp-scan-file" accept="image/*,application/pdf" hidden>'
      + '</div>'
      + '<div id="sp-scan-out"></div>'
      + '<div class="bpx-mmsg" id="sp-mmsg"></div>'
      + '<div class="row" id="sp-scan-foot"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button></div>');
    document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '720px';
    ['sp-scan-cam', 'sp-scan-file'].forEach(function (id) {
      var el = $(id); if (el) el.onchange = function () { if (el.files && el.files[0]) SP.scanFile(el.files[0]); };
    });
    var drop = $('sp-drop');
    if (drop) {
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = function () { drop.classList.remove('over'); };
      drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) SP.scanFile(f); };
    }
  };

  /* ---------- shrink, then read ---------- */
  function toBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result || ''); res(s.slice(s.indexOf(',') + 1)); };
      r.onerror = rej; r.readAsDataURL(blob);
    });
  }
  function shrink(file) {
    /* a phone photo is 4MB+ and mostly wasted pixels; 1600px keeps the print
       legible and makes the upload quick on a job site */
    if (file.type === 'application/pdf') return Promise.resolve({ mime: file.type, blob: file });
    return new Promise(function (res) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        if (s === 1 && file.size < 1.5e6) { URL.revokeObjectURL(url); res({ mime: file.type, blob: file }); return; }
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); res({ mime: 'image/jpeg', blob: b || file }); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res({ mime: file.type, blob: file }); };
      img.src = url;
    });
  }
  SP.scanFile = function (file) {
    if (SP.scan.busy) return;
    SP.scan.busy = true; SP.scan.file = file.name || 'document';
    $('sp-scan-out').innerHTML = '<div class="sp-scanning"><span class="sp-ring"></span><b>Reading ' + esc(SP.scan.file) + '</b><span class="bpx-mut">Finding the prices, the PO number and the total</span></div>';
    msg('sp-mmsg', '');
    if (!live()) {
      setTimeout(function () { SP.scanDone(demoDoc()); }, 1400);
      return;
    }
    shrink(file).then(function (out) { return toBase64(out.blob).then(function (b64) { return { mime: out.mime, data: b64 }; }); })
      .then(function (payload) { return window.bpAuthApi(window.BP_URL + '/functions/v1/supply-scan', { op: 'scan', mime: payload.mime, data: payload.data }); })
      .then(function (r) {
        if (!r || !r.ok) { SP.scan.busy = false; $('sp-scan-out').innerHTML = ''; msg('sp-mmsg', (r && (r.reason || r.error)) || 'Could not read that document.', true); return; }
        SP.scanDone(r.doc);
      })
      .catch(function () { SP.scan.busy = false; $('sp-scan-out').innerHTML = ''; msg('sp-mmsg', 'Could not reach the reader. Check the connection and try again.', true); });
  };
  function demoDoc() {
    var p = SP.scan.po, s = p ? SP.supById(p.supplier_id) : SP.sup[0];
    var lines = (p ? p.lines : (SP.itemsOf(s.id) || []).slice(0, 4).map(function (i) { return { sku: i.sku, name: i.name, qty: 2, unit: i.unit, price: i.price }; }));
    var out = lines.map(function (l, i) {
      var up = Math.round(l.price * (i === 1 ? 1.06 : 1) * 100) / 100;   /* one line moved, so the compare has something to show */
      return { sku: l.sku, name: l.name, qty: l.qty, unit: l.unit, unit_price: up, line_total: Math.round(up * l.qty * 100) / 100 };
    });
    var sub = out.reduce(function (t, l) { return t + l.line_total; }, 0);
    return { doc_type: 'invoice', supplier_name: s ? s.name : 'Supply house', branch: s ? s.branch : '', invoice_no: 'INV-' + (10000 + Math.floor(Math.random() * 8999)),
      po_number: p ? p.po_number : '', account_no: s ? s.account_no : '', dated: new Date().toISOString().slice(0, 10),
      subtotal: Math.round(sub * 100) / 100, tax: 0, fees: p ? +p.fees || 0 : 0, total: Math.round((sub + (p ? +p.fees || 0 : 0)) * 100) / 100, lines: out, confidence: 0.93, note: '' };
  }

  /* ---------- match + review ---------- */
  function findPo(doc) {
    if (SP.scan.po) return SP.scan.po;
    var open = SP.pos.filter(function (p) { return p.status !== 'reconciled' && p.status !== 'cancelled'; });
    if (doc.po_number) {
      var byNum = open.filter(function (p) { return norm(p.po_number) === norm(doc.po_number); })[0];
      if (byNum) return byNum;
    }
    /* no PO printed: the closest open order at that supplier by total */
    var sup = matchSupplier(doc);
    if (!sup) return null;
    var cands = open.filter(function (p) { return p.supplier_id === sup.id; })
      .map(function (p) { return { p: p, d: Math.abs((+p.total || 0) - (+doc.total || 0)) }; })
      .sort(function (a, b) { return a.d - b.d; });
    if (cands.length && cands[0].d <= Math.max(25, (+doc.total || 0) * 0.15)) return cands[0].p;
    return null;
  }
  function matchSupplier(doc) {
    if (SP.scan.po) return SP.supById(SP.scan.po.supplier_id);
    var n = norm(doc.supplier_name); if (!n) return null;
    var hit = SP.sup.filter(function (s) { var sn = norm(s.name); return sn && (sn === n || sn.indexOf(n) === 0 || n.indexOf(sn) === 0); })[0];
    if (hit) return hit;
    if (doc.account_no) { var a = SP.sup.filter(function (s) { return s.account_no && norm(s.account_no) === norm(doc.account_no); })[0]; if (a) return a; }
    return null;
  }
  SP.scanDone = function (doc) {
    SP.scan.busy = false; SP.scan.doc = doc;
    var drop = $('sp-drop'); if (drop) drop.style.display = 'none';
    var po = findPo(doc); SP.scan.po = po;
    var sup = matchSupplier(doc);
    SP.scan.sup = sup;
    var lowConf = doc.confidence < 0.55;
    var h = '';

    if (lowConf) h += '<div class="sp-note warn"><span class=ms>warning</span>Hard to read' + (doc.note ? ': ' + esc(doc.note) : '') + '. Check every figure below before you accept it.</div>';

    h += '<div class="sp-scan-head"><div><b>' + esc(doc.supplier_name || 'Unknown supplier') + '</b>'
      + '<span class="bpx-mut">' + [doc.doc_type, doc.invoice_no ? '#' + doc.invoice_no : '', doc.dated].filter(Boolean).map(esc).join(' &middot; ') + '</span></div>'
      + '<div class="sp-scan-tot"><span class="bpx-mut">Total</span><b>' + money(doc.total) + '</b>'
      + '<button class="sp-relink" onclick="SP.scanOpen(' + (po ? '\'' + po.id + '\'' : '') + ')">Scan a different one</button></div></div>';

    if (!sup) {
      var nm = doc.supplier_name || 'this supplier';
      if (SP.scan.mode !== 'pick' && doc.supplier_name) {
        h += '<div class="sp-note"><span class=ms>add_business</span>New supplier. We will set <b>' + esc(nm) + '</b> up from this document'
          + [doc.branch ? esc(doc.branch) : '', doc.account_no ? 'account ' + esc(doc.account_no) : ''].filter(Boolean).join(', ').replace(/^(.)/, ', $1') + '.</div>'
          + '<div class="sp-newsup"><label>Roughly how far is this branch?</label>'
          + '<div class="bpx-jobtabs">' + [10, 20, 35].map(function (d) {
            return '<button class="bpx-jt' + (SP.scan.drive === d ? ' on' : '') + '" onclick="SP.scanDrive(' + d + ')">' + d + (d === 35 ? '+ min' : ' min') + '</button>';
          }).join('') + '</div>'
          + '<span class="bpx-mut">That is all we need. It works out the fastest run, and you can change it later.</span>'
          + '<button class="sp-relink" onclick="SP.scanMode(\'pick\')">Use a supplier I already have</button></div>';
      } else {
        h += '<div class="sp-note warn"><span class=ms>info</span>Pick the supplier so the prices land in the right book.</div>'
          + '<label>Supplier</label><select id="sp-scan-sup" onchange="SP.scanSetSup(this.value)"><option value="">Choose</option>'
          + SP.sup.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + (s.branch ? ', ' + esc(s.branch) : '') + '</option>'; }).join('') + '</select>'
          + (doc.supplier_name ? '<button class="sp-relink" onclick="SP.scanMode(\'new\')">Set ' + esc(doc.supplier_name) + ' up instead</button>' : '');
      }
    }

    if (po) {
      h += '<div class="sp-note"><span class=ms>link</span>Matched to <b>' + esc(po.po_number) + '</b>'
        + (po.job_name ? ' on ' + esc(po.job_name) : ', no job attached')
        + (doc.po_number ? '' : ', matched on supplier and total because no PO number was printed') + '.</div>'
        + compareTable(po, doc);
    } else {
      h += '<div class="sp-note"><span class=ms>info</span>No open purchase order matches this. We will use it to update the price book' + (doc.doc_type === 'quote' ? ' from the quote' : '') + '.</div>'
        + plainTable(doc);
    }

    var landing = sup || (SP.scan.mode !== 'pick' && doc.supplier_name);
    var willPrice = landing ? doc.lines.filter(function (l) { return l.unit_price > 0; }).length : 0;
    h += '<label class="sp-check" style="margin-top:12px"><input type="checkbox" id="sp-scan-learn"' + (willPrice ? ' checked' : ' disabled') + '> '
      + (willPrice ? 'Save these ' + willPrice + ' prices to ' + esc(sup ? sup.name : doc.supplier_name) : 'No prices to save yet') + '</label>';

    $('sp-scan-out').innerHTML = h;
    $('sp-scan-foot').innerHTML = '<button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button>'
      + '<button class="bpx-btn" onclick="SP.scanApply()">' + (po ? 'Accept and post to the job' : 'Save these prices') + '</button>';
  };
  SP.scanSetSup = function (id) { SP.scan.sup = SP.supById(id); SP.scan.mode = 'pick'; SP.scanDone(SP.scan.doc); };
  SP.scanMode = function (m) { SP.scan.mode = m; if (m === 'new') SP.scan.sup = null; SP.scanDone(SP.scan.doc); };
  SP.scanDrive = function (d) { SP.scan.drive = d; SP.scanDone(SP.scan.doc); };

  function compareTable(po, doc) {
    var used = {};
    var rows = po.lines.map(function (ol) {
      var best = null, bi = -1;
      doc.lines.forEach(function (il, i) {
        if (used[i]) return;
        var s = 0;
        if (ol.sku && il.sku && norm(ol.sku) === norm(il.sku)) s = 1;
        else {
          var a = String(ol.name).toLowerCase().split(/\s+/), b = String(il.name).toLowerCase();
          var hit = a.filter(function (t) { return t.length > 2 && b.indexOf(t) >= 0; }).length;
          s = a.length ? hit / a.length : 0;
        }
        if (s > 0.55 && (!best || s > best.s)) { best = { s: s, il: il }; bi = i; }
      });
      if (bi >= 0) used[bi] = 1;
      return { ol: ol, il: best ? best.il : null };
    });
    var extra = doc.lines.filter(function (_, i) { return !used[i]; });
    var cell = function (ol, il) {
      if (!il) return '<td colspan=2 class="bpx-r sp-var bad">not on the invoice</td>';
      var dq = il.qty !== ol.qty, dp = Math.abs(il.unit_price - ol.price) >= 0.005;
      return '<td class="bpx-r bpx-num' + (dq ? ' sp-var bad' : '') + '">' + il.qty + (dq ? ' <small>ordered ' + ol.qty + '</small>' : '') + '</td>'
        + '<td class="bpx-r bpx-num' + (dp ? ' sp-var ' + (il.unit_price > ol.price ? 'bad' : 'good') : '') + '">' + money(il.unit_price) + (dp ? ' <small>was ' + money(ol.price) + '</small>' : '') + '</td>';
    };
    var varTotal = (+doc.total || 0) - (+po.total || 0);
    return '<div class="bpx-cwrap" style="max-height:38vh;overflow:auto"><table class="bpx-ctable"><thead><tr><th>Ordered</th><th class="bpx-r">Qty billed</th><th class="bpx-r">Price billed</th></tr></thead><tbody>'
      + rows.map(function (r) { return '<tr><td>' + esc(r.ol.name) + '<span class="bpx-mut"> / ' + esc(r.ol.unit || 'ea') + '</span></td>' + cell(r.ol, r.il) + '</tr>'; }).join('')
      + extra.map(function (il) { return '<tr><td class="sp-var bad">' + esc(il.name) + ' <small>not on the PO</small></td><td class="bpx-r bpx-num">' + il.qty + '</td><td class="bpx-r bpx-num">' + money(il.unit_price) + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<div class="sp-po-tot" style="margin-top:8px"><span>PO was ' + money(po.total) + ', invoice is ' + money(doc.total) + '</span><b class="' + (Math.abs(varTotal) > Math.max(2, po.total * 0.02) ? 'bpx-neg' : '') + '">' + (varTotal >= 0 ? '+' : '') + money(varTotal) + '</b></div>';
  }
  function plainTable(doc) {
    return '<div class="bpx-cwrap" style="max-height:38vh;overflow:auto"><table class="bpx-ctable"><thead><tr><th>Item</th><th>SKU</th><th class="bpx-r">Qty</th><th class="bpx-r">Each</th></tr></thead><tbody>'
      + (doc.lines.length ? doc.lines.map(function (l) { return '<tr><td>' + esc(l.name) + '</td><td class="bpx-mut">' + esc(l.sku || '') + '</td><td class="bpx-r bpx-num">' + l.qty + '</td><td class="bpx-r bpx-num">' + money(l.unit_price) + '</td></tr>'; }).join('')
        : '<tr><td colspan=4 class="bpx-empty2">No line items were readable.</td></tr>')
      + '</tbody></table></div>';
  }

  /* ---------- accept ---------- */
  SP.scanApply = function () {
    var doc = SP.scan.doc, po = SP.scan.po, sup = SP.scan.sup;
    if (!doc) return;
    var learn = !!($('sp-scan-learn') || {}).checked;
    msg('sp-mmsg', 'Saving');
    var work = Promise.resolve();

    /* the document names a supplier we have never seen: set it up from what it says */
    if (!sup && SP.scan.mode !== 'pick' && doc.supplier_name) {
      work = work.then(function () {
        return SP.db.insert('suppliers', {
          name: doc.supplier_name, kind: 'custom', branch: doc.branch || '', account_no: doc.account_no || '',
          drive_min: SP.scan.drive || 20, will_call: true, delivery: false, connection: { type: 'pricebook' },
          notes: 'Added from ' + (doc.doc_type || 'a document') + (doc.invoice_no ? ' ' + doc.invoice_no : ''),
        });
      }).then(function (row) { sup = row; SP.scan.sup = row; SP.sup.push(row); });
    }

    if (learn) {
      work = work.then(function () {
        if (!sup) return null;
        var now = new Date().toISOString();
        var rows = doc.lines.filter(function (l) { return l.unit_price > 0; }).map(function (l) {
          var sku = l.sku || matchSku(sup.id, l.name) || slug(l.name);
          return { supplier_id: sup.id, sku: sku, name: l.name, unit: l.unit || 'ea', price: l.unit_price,
            source: doc.doc_type === 'quote' ? 'quote' : 'invoice', source_at: now, source_ref: doc.invoice_no || '' };
        });
        return rows.length ? SP.db.upsertItems(rows) : null;
      });
    }

    if (po) {
      work = work.then(function () {
        return SP.db.update('purchase_orders', po.id, {
          status: 'invoiced', invoice_ref: doc.invoice_no || '', invoice_total: +doc.total || 0,
          invoiced_at: new Date().toISOString(), invoice_lines: doc.lines, scan: { confidence: doc.confidence, note: doc.note, dated: doc.dated, read_at: new Date().toISOString() },
        });
      }).then(function () { return SP.load(true); })
        .then(function () { return SP.reconcile(po.id, true); });
    } else {
      work = work.then(function () { return SP.load(true); });
    }

    work.then(function () {
      window.bpCloseModal();
      if (po) { SP.tab = 'orders_done'; window.bpNav('supplyorders'); }
      else SP.reload();
    }).catch(function (e) { msg('sp-mmsg', 'Could not save. ' + (e.message || ''), true); });
  };
  function slug(name) { return 'X-' + String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24); }
  function matchSku(supId, name) {
    var n = String(name).toLowerCase(), best = null, bs = 0;
    SP.itemsOf(supId).forEach(function (i) {
      var a = String(i.name).toLowerCase().split(/\s+/);
      var hit = a.filter(function (t) { return t.length > 2 && n.indexOf(t) >= 0; }).length;
      var s = a.length ? hit / a.length : 0;
      if (s > bs) { bs = s; best = i; }
    });
    return bs >= 0.7 && best ? best.sku : '';
  }

  /* ---------- what was actually on the shelf ---------- */
  SP.pickupOpen = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    window.bpModal('<h3>Picked up</h3><div class="bpx-sub">Was everything on the shelf? Tap anything that was short. It keeps the stock counts honest for the next run.</div>'
      + '<div class="sp-pick">' + p.lines.map(function (l, k) { return '<label class="sp-pick-row"><input type="checkbox" id="sp-pk-' + k + '"><span><b>' + esc(l.name) + '</b><span class="bpx-mut">' + l.qty + ' ' + esc(l.unit || 'ea') + '</span></span><em>was short</em></label>'; }).join('') + '</div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" onclick="SP.pickupSave(\'' + id + '\')">Confirm pickup</button></div>');
    document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '560px';
  };
  SP.pickupSave = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var short = p.lines.filter(function (l, k) { return (($('sp-pk-' + k) || {}).checked); });
    var now = new Date().toISOString();
    var work = Promise.resolve();
    if (short.length && p.supplier_id) {
      var rows = short.map(function (l) { return { supplier_id: p.supplier_id, sku: l.sku, name: l.name, unit: l.unit || 'ea', price: l.price, stock: 0, stock_at: now, stock_source: 'counter' }; });
      work = work.then(function () { return SP.db.upsertItems(rows); });
    }
    work.then(function () { return SP.db.update('purchase_orders', id, { status: 'picked_up', picked_up_at: now }); })
      .then(function () { window.bpCloseModal(); return SP.load(true); })
      .catch(function (e) { alert('Could not save. ' + (e.message || '')); });
  };
})();
