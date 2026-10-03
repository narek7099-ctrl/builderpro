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

  /* ---------- who changed what (crew changes come from crew_material_add / _remove) ----------
     Every item carries addedBy {uid, name, role}; every change goes on
     j.materials.log, newest last. Removed item ids go on j.materials.gone so
     the database trigger (bp_jobs_keep_crew) doesn't put a crew line back
     when this device saves. */
  function actor() {
    var T = window.BP_TEAM || {}, u = window._bpUser || {}, md = u.user_metadata || {};
    var co = (window.bpSettingsGet && (bpSettingsGet() || {}).company) || {};
    var nm = T.name || md.full_name || md.name || co.owner || String(u.email || who() || '').split('@')[0] || 'Owner';
    return { uid: T.uid || u.id || '', name: String(nm), role: T.role === 'office' ? 'office' : 'owner' };
  }
  ML.actor = actor;
  var meUid = function () { return actor().uid; };
  function logIt(m, e) {
    if (!m) return;
    m.log = Array.isArray(m.log) ? m.log : [];
    m.log.push(Object.assign({ id: uid('lg'), at: Date.now(), by: actor() }, e));
    if (m.log.length > 300) m.log = m.log.slice(-300);
  }
  ML.log = function (j, e) { var m = listOf(j, true); logIt(m, e); };
  function tomb(m, id) { if (!m || !id) return; m.gone = Array.isArray(m.gone) ? m.gone : []; if (m.gone.indexOf(id) < 0) m.gone.push(id); if (m.gone.length > 1000) m.gone = m.gone.slice(-1000); }
  var initials = function (n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); };
  var qtyTxt = function (q, u) { return q === '' || q == null ? '' : (+q || 0) + (u ? ' ' + u : ''); };

  /* last time the office looked at a job's list: per device */
  function seenAll() { try { return JSON.parse(localStorage.getItem('bpMatSeen') || '{}') || {}; } catch (e) { return {}; } }
  ML.seenAt = function (jid) { return +seenAll()[jid] || 0; };
  ML.newCount = function (j) {
    var m = j && j.materials; if (!m || !Array.isArray(m.log)) return 0;
    var s = ML.seenAt(j.id);
    return m.log.filter(function (e) { return e && e.by && e.by.role === 'crew' && +e.at > s; }).length;
  };
  ML.seen = function (jid) {
    if (!jid) return; var a = seenAll(); a[jid] = Date.now();
    try { localStorage.setItem('bpMatSeen', JSON.stringify(a)); } catch (e) {}
    ML.badgeTab(jid);
  };
  /* "2 new" on the project's Materials tab */
  ML.badgeTab = function (jid) {
    var b = document.querySelector('[data-pj-tab="materials"]'); if (!b || jid !== window._bpProjId) return;
    var j = jobById(jid), n = ML.newCount(j), x = b.querySelector('.ml-newb');
    var t = n ? n + ' new' : '';
    if (!t) { if (x) x.remove(); return; }
    if (!x) { x = document.createElement('span'); x.className = 'ml-newb'; b.appendChild(x); }
    x.textContent = t; x.title = n + ' change' + (n === 1 ? '' : 's') + ' by the crew since you last looked';
  };
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-pj-tab="materials"]');
    if (t && window._bpProjId) setTimeout(function () { ML.seen(window._bpProjId); }, 0);
  }, true);

  /* the crew writes straight to the database; bring those changes into this
     device's copy (same rule as bp_jobs_keep_crew in the database) */
  function idsOf(a) { var o = {}; (a || []).forEach(function (x) { if (x && x.id) o[x.id] = 1; }); return o; }
  ML.mergeCrew = function (lj, sj) {
    if (!lj || !sj) return false;
    var before = JSON.stringify([lj.materials || null, lj.crewReceipts || null, lj.crewReceiptsGone || null, lj.expenses || null]);
    var sm = sj.materials && typeof sj.materials === 'object' ? sj.materials : null;
    if (sm) {
      var m = listOf(lj, true), gone = {};
      (m.gone || []).concat(sm.gone || []).forEach(function (g) { if (typeof g === 'string') gone[g] = 1; });
      var have = idsOf(m.items);
      m.items = m.items.filter(function (it) { return !(it && it.id && gone[it.id]); })
        .concat((sm.items || []).filter(function (it) { return it && it.id && it.addedBy && it.addedBy.role === 'crew' && !have[it.id] && !gone[it.id]; }));
      m.gone = Object.keys(gone);
      var hl = idsOf(m.log);
      m.log = (m.log || []).concat((sm.log || []).filter(function (e) { return e && e.id && !hl[e.id]; }))
        .sort(function (a, b) { return (+a.at || 0) - (+b.at || 0); }).slice(-300);
      if (!m.log.length) delete m.log;
      if (!m.gone.length) delete m.gone;
    }
    if (Array.isArray(sj.crewReceipts) || Array.isArray(lj.crewReceipts)) {
      var rg = {}; (lj.crewReceiptsGone || []).concat(sj.crewReceiptsGone || []).forEach(function (g) { if (typeof g === 'string') rg[g] = 1; });
      var srv = {}; (sj.crewReceipts || []).forEach(function (r) { if (r && r.id) srv[r.id] = r; });
      var mine = idsOf(lj.crewReceipts);
      lj.crewReceipts = (lj.crewReceipts || []).filter(function (r) { return !(r && r.id && rg[r.id]); }).map(function (r) {
        var s = srv[r.id]; return s && r.status === 'pending' && s.status !== 'pending' ? s : r;
      }).concat((sj.crewReceipts || []).filter(function (r) { return r && r.id && !mine[r.id] && !rg[r.id]; }));
      lj.crewReceiptsGone = Object.keys(rg);
      if (!lj.crewReceiptsGone.length) delete lj.crewReceiptsGone;
      /* crew receipts are expenses the moment they are posted ('crewrc:<id>') */
      var isCrew = function (e) { return e && typeof e.key === 'string' && e.key.indexOf('crewrc:') === 0; };
      var hk = {}; (lj.expenses || []).forEach(function (e) { if (e && e.key) hk[e.key] = 1; });
      var add = (sj.expenses || []).filter(function (e) { return isCrew(e) && !hk[e.key] && !rg[e.key.slice(7)]; });
      var drop = (lj.expenses || []).some(function (e) { return isCrew(e) && rg[e.key.slice(7)]; });
      if (add.length || drop) lj.expenses = (lj.expenses || []).filter(function (e) { return !(isCrew(e) && rg[e.key.slice(7)]); }).concat(add);
    }
    return JSON.stringify([lj.materials || null, lj.crewReceipts || null, lj.crewReceiptsGone || null, lj.expenses || null]) !== before;
  };
  var syncAt = 0, syncing = null;
  ML.sync = function (force) {
    if (!(window.BP_LIVE && window.BP_SB) || (window.bpTeamIsCrew && bpTeamIsCrew())) return Promise.resolve(false);
    if (syncing) return syncing;
    if (!force && Date.now() - syncAt < 15000) return Promise.resolve(false);
    syncAt = Date.now();
    syncing = Promise.resolve(BP_SB.from('portal_finance').select('jobs').maybeSingle()).then(function (r) {
      syncing = null;
      var srv = r && r.data && Array.isArray(r.data.jobs) ? r.data.jobs : null; if (!srv) return false;
      var js = jobs(), byId = {}, changed = false;
      srv.forEach(function (s) { if (s && s.id) byId[s.id] = s; });
      js.forEach(function (j) { if (j && byId[j.id] && ML.mergeCrew(j, byId[j.id])) changed = true; });
      if (changed) {
        try { localStorage.setItem('bpJobs', JSON.stringify(js)); } catch (e) {}
        ML.repaint();
      }
      return changed;
    }).catch(function () { syncing = null; return false; });
    return syncing;
  };
  ML.repaint = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.ml-ed[id^="ml-ed-job-"]'), function (el) {
      if (el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;   /* don't yank a field from under the user */
      var jid = el.id.slice('ml-ed-job-'.length); el.outerHTML = editor(T('job', jid));
    });
    var rc = $('bpx-pj-mat') && $('bpx-pj-mat').querySelector('.rc-job');
    if (rc && window.bpReceiptsFor && window._bpProjId) { var d = document.createElement('div'); d.innerHTML = bpReceiptsFor(window._bpProjId); rc.replaceWith(d.firstChild); }
    if (window._bpProjId) ML.badgeTab(window._bpProjId);
    if (window._bpCurView === 'matlists' && !ML.open && $('bpxViewArea') && !document.activeElement.classList.contains('ml-q')) window.bpMatLists();
  };

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
    /* one line per supplier that sells it, with their price, so the
       supplier is picked by price; the cheapest real price is marked */
    if (window.PR && PR.cells) {
      SP.search(q, 8).forEach(function (g, gi) {
        var cells = PR.cells(g).filter(function (c) { return c.kind !== 'none'; });
        /* ballparks alone are the same number everywhere: one line is enough */
        if (!cells.some(function (c) { return c.kind === 'yours'; })) cells = cells.slice(0, 1);
        if (cells.length === 1) { var c1 = cells[0]; out.push({ name: g.name, sku: c1.sku || '', supplierId: c1.sup.id, supplierName: c1.sup.name, unit: c1.unit || g.unit || 'ea', price: c1.price || 0, kind: c1.kind, n: 1 }); return; }
        if (!cells.length) {
          var mid = PR.mid(g);
          out.push({ name: g.name, sku: '', supplierId: '', supplierName: '', unit: g.unit || 'ea', price: mid, kind: mid ? 'typical' : 'none', gi: gi, first: true, n: 1 });
          return;
        }
        var best = PR.best(cells);
        cells.forEach(function (c, k) {
          out.push({ name: g.name, sku: c.sku || '', supplierId: c.sup.id, supplierName: c.sup.name, unit: c.unit || g.unit || 'ea', price: c.price || 0, kind: c.kind,
            gi: gi, first: k === 0, n: cells.length, cheap: best != null && c === cells[best] && cells.length > 1 });
        });
      });
      return out.slice(0, 24);
    }
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
      if (x.n > 1) {
        return (x.first ? '<div class="ml-opt-g">' + esc(x.name) + ' <small>' + x.n + ' suppliers</small></div>' : '')
          + '<button class="ml-opt ml-opt-sub' + (x.cheap ? ' ml-opt-cheap' : '') + '" onmousedown="event.preventDefault()" onclick="ML.pick(' + tArg(t) + ',' + i + ')"><span class="ml-opt-n">' + esc(x.supplierName)
          + (x.sku ? ' <small>' + esc(x.sku) + '</small>' : '') + (x.cheap ? ' <span class="ml-cheap">cheapest</span>' : '') + '</span><span class="ml-opt-s">' + (x.kind === 'yours' ? 'your price' : 'typical') + '</span>'
          + '<span class="ml-opt-p">' + (x.price ? (x.kind === 'typical' ? '~' : '') + money(x.price) + '<small>/' + esc(x.unit) + '</small>' : '<small>no price</small>') + '</span></button>';
      }
      return '<button class="ml-opt" onmousedown="event.preventDefault()" onclick="ML.pick(' + tArg(t) + ',' + i + ')"><span class="ml-opt-n">' + esc(x.name)
        + (x.sku ? ' <small>' + esc(x.sku) + '</small>' : '') + '</span><span class="ml-opt-s">' + esc(x.supplierName || 'Any supplier') + '</span>'
        + '<span class="ml-opt-p">' + (x.price ? money(x.price) + '<small>/' + esc(x.unit) + (x.kind === 'typical' ? ' typical' : '') + '</small>' : '<small>no price</small>') + '</span></button>';
    }).join('') : '<div class="ml-opt-none bpx-mut">Nothing in the catalog matches.</div>')
      + '<button class="ml-opt ml-opt-custom" onmousedown="event.preventDefault()" onclick="ML.custom(' + tArg(t) + ')">+ Add &ldquo;' + esc(String(v).trim()) + '&rdquo; as a custom item</button>';
  };
  function push(t, it) {
    var d = doc(t); if (!d) return;
    var after = !!(d.m && d.m.status !== 'draft');
    var row = Object.assign({ id: uid('mi'), qty: 1, addedAt: Date.now(), addedAfterSend: after, by: who() }, it);
    if (d.m) { row.addedBy = actor(); logIt(d.m, { action: 'add', item: row.name || 'Custom line', itemId: row.id, qty: row.qty, unit: row.unit || '' }); }
    d.items.push(row);
    d.save(); ML.q[t.kind + '-' + t.id] = ''; redraw(t);
    var q = $('ml-q-' + t.kind + '-' + t.id); if (q) q.focus();
  }
  /* used by prices.js: put one item on a job's list */
  window.bpMatAddItem = function (jobId, it) {
    var j = jobById(jobId), m = listOf(j, true); if (!m) return false;
    var row = Object.assign({ id: uid('mi'), qty: 1, addedAt: Date.now(), addedAfterSend: m.status !== 'draft', by: who(), custom: false, addedBy: actor() }, it);
    m.items.push(row);
    logIt(m, { action: 'add', item: row.name || 'Item', itemId: row.id, qty: row.qty, unit: row.unit || '' });
    saveJobs(); return true;
  };
  ML.pick = function (kind, id, i) {
    var o = (ML._opts[kind + '-' + id] || [])[i]; if (!o) return;
    push(T(kind, id), { name: o.name, sku: o.sku, supplierId: o.supplierId, supplierName: o.supplierName, unit: o.unit, price: o.price, custom: false });
  };
  ML.custom = function (kind, id) {
    var nm = String(ML.q[kind + '-' + id] || '').trim();
    push(T(kind, id), { name: nm || '', sku: '', supplierId: '', supplierName: '', unit: 'ea', qty: '', price: '', note: '', custom: true });
    if (!nm) setTimeout(function () { var ins = document.querySelectorAll('#ml-ed-' + kind + '-' + id + ' .ml-in-name'); if (ins.length) ins[ins.length - 1].focus(); }, 0);
  };
  ML.edit = function (kind, id, itemId, k, v) {
    var t = T(kind, id), d = doc(t); if (!d) return;
    var it = d.items.filter(function (x) { return x.id === itemId; })[0]; if (!it) return;
    var was = it[k];
    it[k] = (k === 'qty' || k === 'price') ? (String(v).trim() === '' ? '' : Math.max(0, num(v))) : String(v);
    if (d.m && String(was == null ? '' : was) !== String(it[k])) {
      logIt(d.m, k === 'qty' ? { action: 'qty', item: it.name || 'Item', itemId: it.id, before: was === undefined ? '' : was, after: it[k], unit: it.unit || '' }
        : { action: 'edit', field: k, item: it.name || 'Item', itemId: it.id, before: k === 'price' ? undefined : was, after: k === 'price' ? undefined : it[k] });
    }
    d.save(); redraw(t);
  };
  ML.del = function (kind, id, itemId) {
    var t = T(kind, id), d = doc(t); if (!d) return;
    var i = d.items.map(function (x) { return x.id; }).indexOf(itemId); if (i < 0) return;
    var it = d.items[i];
    if (d.m) { tomb(d.m, it.id); logIt(d.m, { action: 'remove', item: it.name || 'Item', itemId: it.id, qty: it.qty, unit: it.unit || '', whose: it.addedBy && it.addedBy.role === 'crew' ? it.addedBy.name : undefined }); }
    d.items.splice(i, 1); d.save(); redraw(t);
  };
  /* accept a crew request onto the order: the crew can no longer take it back */
  ML.approve = function (jid, itemId) {
    var j = jobById(jid), m = listOf(j); if (!m) return;
    var it = m.items.filter(function (x) { return x.id === itemId; })[0]; if (!it || it.status !== 'requested') return;
    it.status = 'approved';
    logIt(m, { action: 'approve', item: it.name || 'Item', itemId: it.id, qty: it.qty, unit: it.unit || '', whose: it.addedBy && it.addedBy.name });
    saveJobs(); redraw(T('job', jid));
  };
  ML.lock = function (jid, on) {
    var j = jobById(jid), m = listOf(j, true); if (!m) return;
    on = !!on; if (!!m.locked === on) return;
    m.locked = on; logIt(m, { action: on ? 'lock' : 'unlock', item: '' });
    saveJobs(); redraw(T('job', jid));
  };

  /* ---------- status ---------- */
  ML.status = function (jid, s) {
    var j = jobById(jid), m = listOf(j, true); if (!m) return;
    if (s === 'sent' && !m.items.length) { window.bpToast && bpToast('Add something to the list first.'); return; }
    if (m.status === s) return;
    m.status = s;
    if (s === 'sent') {
      m.sentAt = Date.now();
      /* what the crew asked for went out with the order; no more changes from them */
      m.items.forEach(function (it) { if (it.status === 'requested' || it.status === 'approved') it.status = 'ordered'; });
      m.locked = true;
    }
    if (s === 'received') m.receivedAt = Date.now();
    if (s === 'draft') { m.sentAt = null; m.locked = false; }
    logIt(m, { action: 'status', item: '', after: s });
    saveJobs(); redraw(T('job', jid));
  };

  /* ---------- templates ---------- */
  var tplItem = function (it) { return { id: uid('mi'), name: it.name, sku: it.sku || '', supplierId: it.supplierId || '', supplierName: it.supplierName || '', unit: it.unit || 'ea', qty: it.qty === '' ? '' : (+it.qty || 1), price: it.price === '' ? '' : (+it.price || 0), note: it.note || '', custom: !!it.custom }; };
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
    tp.items.forEach(function (it) { m.items.push(Object.assign(tplItem(it), { addedAt: Date.now(), addedAfterSend: after, by: who(), addedBy: actor() })); });
    if (tp.items.length) logIt(m, { action: 'add', item: tp.items.length + ' items from “' + tp.name + '”' });
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
      + '<table><thead><tr><th>Item</th><th class="n">Qty</th><th>Unit</th><th>Notes</th>' + (np ? '' : '<th class="n">Est. price</th><th class="n">Est. total</th>') + '</tr></thead><tbody>' + rows + '</tbody>'
      + (np ? '' : '<tfoot><tr><td colspan="5" class="n">Estimated total</td><td class="n">' + money(total(items)) + '</td></tr></tfoot>') + '</table>'
      + '<button class="pb" onclick="window.print()">Print</button></body></html>';
    var w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print the list.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };
  ML.text = function (jid, gi) {
    var j = jobById(jid) || {}, g = groupAt(jid, gi), sup = g.name, items = g.items, np = ML.noPrices;
    return biz() + '\nMaterial list: ' + (j.name || 'Job') + (j.title ? ' - ' + j.title : '') + (j.addr ? '\nJob site: ' + j.addr : '') + '\nSupplier: ' + sup + '\n\n'
      + items.map(function (it) { return (it.qty === '' || it.qty == null ? '' : (+it.qty || 0) + ' ') + (it.unit || 'ea') + '  ' + it.name + (it.sku ? ' (' + it.sku + ')' : '') + (it.note ? ' - ' + it.note : '') + (np || !+it.price ? '' : '  @ ' + money(it.price) + ' = ' + money(line(it))); }).join('\n')
      + (np ? '' : '\n\nEstimated total: ' + money(total(items)));
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

  /* ---------- the change log ---------- */
  function whenTxt(ts) {
    var d = new Date(+ts); if (isNaN(d)) return '';
    var t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
    var td = new Date(); td.setHours(0, 0, 0, 0);
    if (d >= td) return t;
    if (d >= new Date(td.getTime() - 864e5)) return 'yesterday ' + t;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + t;
  }
  ML.whenTxt = whenTxt;
  function logLine(e) {
    var by = e.by || {}, nm = by.uid && by.uid === meUid() ? 'You' : (String(by.name || 'Someone').split(' ')[0]);
    var it = '<b>' + esc(e.item || 'an item') + '</b>', q = qtyTxt(e.qty, e.unit), amt = e.amount != null ? money(e.amount) : '';
    var s = {
      add: 'added ' + (q ? esc(q) + ' of ' : '') + it,
      remove: 'removed ' + it + (e.whose && by.role !== 'crew' ? ' <span class="bpx-mut">(' + esc(String(e.whose).split(' ')[0]) + '’s request)</span>' : ''),
      qty: 'changed ' + it + ' from ' + esc(qtyTxt(e.before, '') || 'no qty') + ' to ' + esc(qtyTxt(e.after, e.unit) || 'no qty'),
      edit: 'edited the ' + esc(e.field === 'supplierName' ? 'supplier' : e.field || 'line') + ' on ' + it,
      approve: 'approved ' + it + (q ? ' (' + esc(q) + ')' : ''),
      status: 'marked the list <b>' + esc(e.after === 'sent' ? 'sent to supplier' : e.after === 'received' ? 'received' : 'draft') + '</b>',
      lock: 'locked the list for crew', unlock: 'unlocked the list for crew',
      receipt: 'added a receipt <b>' + amt + '</b>' + (e.item && e.item !== 'Receipt' ? ' · ' + esc(e.item) : ''),
      'receipt-remove': 'deleted a receipt <b>' + amt + '</b>' + (e.item && e.item !== 'Receipt' ? ' · ' + esc(e.item) : ''),
      'receipt-delete': 'deleted a receipt <b>' + amt + '</b>' + (e.whose ? ' from ' + esc(String(e.whose).split(' ')[0]) : ''),
      'receipt-approve': 'approved a receipt <b>' + amt + '</b>' + (e.whose ? ' from ' + esc(String(e.whose).split(' ')[0]) : ''),
      'receipt-reject': 'rejected a receipt <b>' + amt + '</b>' + (e.whose ? ' from ' + esc(String(e.whose).split(' ')[0]) : '')
    }[e.action] || esc(e.action || 'changed') + ' ' + it;
    return '<b class="ml-lgn">' + esc(nm) + '</b> ' + s;
  }
  ML.logLine = logLine;
  ML.logOpen = {};
  function timeline(j, m) {
    var lg = Array.isArray(m.log) ? m.log.filter(function (e) { return e && e.at; }) : [];
    if (!lg.length || !j) return '';
    var seen = ML.seenAt(j.id), fresh = ML.newCount(j), list = lg.slice().reverse().slice(0, 60);
    var open = ML.logOpen[j.id] != null ? ML.logOpen[j.id] : fresh > 0;
    return '<details class="ml-log"' + (open ? ' open' : '') + ' ontoggle="ML.logOpen[\'' + j.id + '\']=this.open">'
      + '<summary><span class="ms">history</span>Changes <span class="bpx-mut">(' + lg.length + ')</span>' + (fresh ? '<span class="ml-newb">' + fresh + ' new</span>' : '') + '</summary>'
      + '<ol>' + list.map(function (e) {
        var by = e.by || {}, isNew = by.role === 'crew' && +e.at > seen;
        return '<li class="' + (by.role === 'crew' ? 'crew' : '') + (isNew ? ' new' : '') + '"><i class="ml-av">' + esc(initials(by.name)) + '</i><span>' + logLine(e) + '</span><time>' + whenTxt(e.at) + '</time></li>';
      }).join('') + '</ol>' + (lg.length > list.length ? '<div class="bpx-mut ml-small">Showing the latest ' + list.length + '.</div>' : '') + '</details>';
  }

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
        + (m.sentAt ? '<span class="bpx-mut ml-small">sent ' + new Date(m.sentAt).toLocaleDateString() + '</span>' : '')
        + '<label class="ml-lock" title="Locked: the crew can see the list but can\'t add to it or take things off. Sending the order locks it."><input type="checkbox" data-ml-lock="' + esc(jid) + '"' + (m.locked ? ' checked' : '') + ' onchange="ML.lock(\'' + jid + '\',this.checked)"><span class="ms">' + (m.locked ? 'lock' : 'lock_open') + '</span>' + (m.locked ? 'Locked for crew' : 'Crew can add') + '</label>'
        + '</div><div class="ml-bar-r">'
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
            return '<div class="ml-srow"><span><b>' + esc(g.name) + '</b> <span class="bpx-mut">' + g.items.length + (g.items.length === 1 ? ' item' : ' items') + ' &middot; ' + money(total(g.items)) + ' estimated</span></span><span class="ml-srow-a">'
              + '<button class="bpx-rowbtn" onclick="ML.print(\'' + jid + '\',' + gi + ')">Print list</button>'
              + '<button class="bpx-rowbtn" onclick="ML.copy(\'' + jid + '\',' + gi + ',this)">Copy as text</button></span></div>';
          }).join('') : '<div class="bpx-mut">Nothing on the list yet.</div>')
          + '<textarea id="ml-copytxt" class="ml-copytxt" hidden readonly></textarea></div>';
      }
    }
    /* add box */
    h += '<div class="ml-add"><span class="ms">search</span><input id="ml-q-' + key + '" class="ml-q" placeholder="Add an item: search your suppliers and the catalog (e.g. shingles, pex 3/4)" autocomplete="off" value="' + esc(ML.q[key] || '') + '" oninput="ML.find(' + a + ',this.value)" onfocus="ML.find(' + a + ',this.value)" onblur="setTimeout(function(){var a=document.activeElement;if(a&&a.id===\'ml-q-' + key + '\')return;var r=document.getElementById(\'ml-res-' + key + '\');if(r)r.hidden=true;},150)">'
      + '<button class="bpx-rowbtn" onclick="ML.custom(' + a + ')">+ Custom line</button>'
      + '<div class="ml-res" id="ml-res-' + key + '" hidden></div></div>';
    /* table */
    if (!items.length) h += '<div class="ml-empty bpx-mut">No items yet. Search above to add products from your suppliers and the catalog, or add a custom line and write whatever you need.</div>';
    else {
      h += '<table class="bpx-table ml-tbl"><thead><tr><th>Item</th><th class="ml-n">Qty</th><th>Unit</th><th>Supplier</th><th class="ml-n">Est. price</th><th class="ml-n">Est. total</th><th></th></tr></thead><tbody>'
        + items.map(function (it) {
          var ed = function (k, v, cls, type, ph) { return '<input class="ml-in ' + cls + '" ' + (type ? 'type="number" min="0" step="any" inputmode="decimal"' : '') + (ph ? ' placeholder="' + ph + '"' : '') + ' value="' + esc(v) + '" onchange="ML.edit(' + a + ',\'' + it.id + '\',\'' + k + '\',this.value)">'; };
          var blank = function (v) { return v === '' || v == null; };
          var ab = it.addedBy, crew = ab && ab.role === 'crew', mineIt = ab && ab.uid && ab.uid === meUid();
          var byChip = ab && ab.name ? '<span class="ml-by' + (crew ? ' crew' : '') + '" title="' + esc((crew ? 'Requested by ' : 'Added by ') + ab.name + (it.addedAt ? ' · ' + whenTxt(it.addedAt) : '')) + '"><i>' + esc(initials(ab.name)) + '</i>'
            + (crew ? 'Requested by ' + esc(String(ab.name).split(' ')[0]) : mineIt ? 'added by you' : 'added by ' + esc(String(ab.name).split(' ')[0])) + '</span>' : '';
          var stChip = it.status === 'requested' ? '<span class="ml-tag ml-tag-req">Requested</span>' + (m ? '<button class="ml-ok" onclick="ML.approve(\'' + t.id + '\',\'' + it.id + '\')" title="Accept onto the order. The crew can no longer take it back.">Approve</button>' : '')
            : it.status === 'approved' ? '<span class="ml-tag ml-tag-ok">Approved</span>' : it.status === 'ordered' && crew ? '<span class="ml-tag ml-tag-ok">Ordered</span>' : '';
          return '<tr class="' + (it.addedAfterSend ? 'ml-late' : '') + (crew ? ' ml-crewrow' : '') + '" data-ml-item="' + esc(it.id) + '"><td data-l="Item">'
            + (it.custom ? ed('name', it.name, 'ml-in-name', 0, 'Write anything: item, size, color') : '<div class="ml-name">' + esc(it.name) + '</div>')
            + '<div class="ml-meta">' + (it.sku ? '<small>' + esc(it.sku) + '</small>' : '') + (it.custom ? '<small>custom</small>' : '')
            + (it.addedAfterSend ? '<span class="ml-tag">Added after sending</span>' : '') + (it.coId ? '<span class="ml-tag ml-tag-ok">On change order</span>' : '') + byChip + stChip + '</div>'
            + '<input class="ml-in ml-in-note" placeholder="Notes (color, length, where it goes)" value="' + esc(it.note || '') + '" onchange="ML.edit(' + a + ',\'' + it.id + '\',\'note\',this.value)"></td>'
            + '<td data-l="Qty" class="ml-n">' + ed('qty', blank(it.qty) ? '' : +it.qty || 0, 'ml-in-num', 1, 'optional') + '</td>'
            + '<td data-l="Unit">' + (it.custom ? ed('unit', it.unit || 'ea', 'ml-in-unit') : esc(it.unit || 'ea')) + '</td>'
            + '<td data-l="Supplier">' + (it.custom ? ed('supplierName', it.supplierName || '', 'ml-in-sup', 0, 'optional') : esc(it.supplierName || '—')) + '</td>'
            + '<td data-l="Est. price" class="ml-n">' + ed('price', blank(it.price) ? '' : (+it.price || 0).toFixed(2), 'ml-in-num', 1, 'optional') + '</td>'
            + '<td data-l="Est. total" class="ml-n ml-lt">' + (blank(it.price) || blank(it.qty) ? '<span class="bpx-mut">—</span>' : money(line(it))) + '</td>'
            + '<td class="ml-x"><button class="ml-rm" title="Remove" aria-label="Remove ' + esc(it.name) + '" onclick="ML.del(' + a + ',\'' + it.id + '\')">&times;</button></td></tr>';
        }).join('') + '</tbody></table>';
      /* footer */
      var gs2 = bySupplier(items);
      h += '<div class="ml-foot">' + (gs2.length > 1 ? gs2.map(function (g) { return '<div class="ml-fr"><span>' + esc(g.name) + '</span><span>' + money(total(g.items)) + '</span></div>'; }).join('') : '')
        + '<div class="ml-fr ml-grand"><span>Estimated total</span><span>' + money(total(items)) + '</span></div>'
        + '<div class="ml-fr ml-small bpx-mut"><span>A plan, not spending. Receipts are what count as cost.</span></div></div>';
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
      h += timeline(d.job, m);
    }
    return h + '</div>';
  }
  ML.editor = function (kind, id) { return editor(T(kind, id)); };

  /* ---------- pages ---------- */
  function tabs(active) {
    var t = [['matlists', 'Lists'], ['mattemplates', 'Templates'], ['suppliers', 'Suppliers']];
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
        done(); ML.sync(); ML.seen(j.id); return;
      }
      ML.open = null;
    }
    var rows = all.filter(function (j) { var m = j.materials; return j.status !== 'done' || (m && m.items && m.items.length); });
    var withList = rows.filter(function (j) { return j.materials && j.materials.items && j.materials.items.length; });
    var grand = withList.reduce(function (t, j) { return t + ML.total(j); }, 0);
    var h = tabs('matlists')
      + '<div class="ml-top"><div class="bpx-mut">' + withList.length + (withList.length === 1 ? ' list' : ' lists') + ' &middot; ' + money(grand) + ' estimated. Planning only; receipts on Suppliers are what count as cost.</div>'
      + '<button class="bpx-btn ml-new" onclick="ML.newing=!ML.newing;bpMatLists()">+ New list</button></div>';
    if (ML.newing) {
      var tl = tpls();
      h += '<div class="bpx-panel ml-newp"><div class="ml-sub-h"><b>New list</b></div><div class="ml-newf">'
        + '<label>Job<select id="ml-new-job">' + rows.map(function (j) { return '<option value="' + j.id + '">' + esc(j.name || 'Job') + (j.title ? ' — ' + esc(j.title) : '') + '</option>'; }).join('') + '</select></label>'
        + '<label>Start from<select id="ml-new-tpl"><option value="">Blank list</option>' + tl.map(function (tp) { return '<option value="' + tp.id + '">' + esc(tp.name) + ' (' + tp.items.length + ' items)</option>'; }).join('') + '</select></label>'
        + '<button class="bpx-rowbtn ml-primary" onclick="ML.create()">Create</button></div>'
        + (rows.length ? '' : '<div class="bpx-mut">No open jobs. Add a project first.</div>') + '</div>';
    }
    h += '<div class="bpx-panel ml-panel">' + (rows.length ? '<table class="bpx-table ml-jobs"><thead><tr><th>Job</th><th class="ml-n">Items</th><th class="ml-n">Estimated</th><th>Status</th><th>Suppliers</th><th></th></tr></thead><tbody>'
      + rows.map(function (j) {
        var m = j.materials, n = m && m.items ? m.items.length : 0;
        var sups = m ? bySupplier(m.items).map(function (g) { return g.name; }) : [];
        var nw = ML.newCount(j);
        return '<tr class="ml-jrow" onclick="ML.open=\'' + j.id + '\';bpMatLists()"><td data-l="Job"><b>' + esc(j.name || 'Job') + '</b>'
          + (nw ? ' <span class="ml-newb" title="Changes by the crew since you last looked">' + nw + ' new change' + (nw === 1 ? '' : 's') + '</span>' : '')
          + '<div class="bpx-mut ml-small">' + esc(j.title || '') + (j.status === 'done' ? ' &middot; done' : '') + '</div></td>'
          + '<td data-l="Items" class="ml-n">' + n + '</td><td data-l="Estimated" class="ml-n">' + (n ? money(ML.total(j)) : '—') + '</td>'
          + '<td data-l="Status">' + (n || m ? statusPill(m.status) : '<span class="bpx-mut ml-small">No list</span>') + '</td>'
          + '<td data-l="Suppliers" class="ml-sups">' + (sups.length ? esc(sups.join(', ')) : '<span class="bpx-mut">—</span>') + '</td>'
          + '<td class="ml-x"><button class="bpx-rowbtn">Open</button></td></tr>';
      }).join('') + '</tbody></table>' : '<div class="ml-empty bpx-mut">No jobs yet. Lists hang off a project, so add one in Active Projects first.</div>') + '</div>';
    area.innerHTML = h; done(); ML.sync();
  };
  ML.create = function () {
    var jid = ($('ml-new-job') || {}).value, tid = ($('ml-new-tpl') || {}).value; if (!jid) return;
    var j = jobById(jid), m = listOf(j, true);
    if (tid) {
      var tp = tplById(tid);
      if (tp) {
        tp.items.forEach(function (it) { m.items.push(Object.assign(tplItem(it), { addedAt: Date.now(), addedAfterSend: m.status !== 'draft', by: who(), addedBy: actor() })); });
        if (tp.items.length) logIt(m, { action: 'add', item: tp.items.length + ' items from “' + tp.name + '”' });
      }
    }
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
        + '<button class="bpx-rowbtn ml-primary" onclick="ML.tplUse(\'' + tp.id + '\')">Use on a job</button><button class="bpx-rowbtn" onclick="ML.tplRename(\'' + tp.id + '\')">Rename</button></div>'
        + (ML.tplUsing === tp.id ? useBox(tp) : '') + editor(T('tpl', tp.id)) + '</div>';
      done(); return;
    }
    ML.tplOpen = null;
    h += '<div class="ml-top"><div class="bpx-mut">Lists you use again and again. Start a job&rsquo;s list from one in a tap.</div><button class="bpx-btn ml-new" onclick="ML.tplNew()">+ New template</button></div>'
      + '<div class="bpx-panel ml-panel">' + (tl.length ? '<table class="bpx-table ml-jobs"><thead><tr><th>Template</th><th class="ml-n">Items</th><th class="ml-n">Estimated</th><th></th></tr></thead><tbody>'
        + tl.map(function (tp) {
          return '<tr class="ml-jrow" onclick="ML.tplOpen=\'' + tp.id + '\';bpMatTemplates()"><td data-l="Template"><b>' + esc(tp.name) + '</b></td><td data-l="Items" class="ml-n">' + tp.items.length + '</td><td data-l="Estimated" class="ml-n">' + money(total(tp.items)) + '</td>'
            + '<td class="ml-x"><button class="bpx-rowbtn ml-primary" onclick="event.stopPropagation();ML.tplUse(\'' + tp.id + '\')">Use on a job</button> <button class="bpx-rowbtn">Open</button> <button class="bpx-rowbtn" onclick="event.stopPropagation();ML.tplDel(\'' + tp.id + '\')">Delete</button></td></tr>'
            + (ML.tplUsing === tp.id ? '<tr class="ml-use"><td colspan="4">' + useBox(tp) + '</td></tr>' : '');
        }).join('') + '</tbody></table>' : '<div class="ml-empty bpx-mut">No templates yet. Open a material list and tap &ldquo;Save as template&rdquo;, or start one here.</div>') + '</div>';
    area.innerHTML = h; done();
  };

  /* "Use on a job": creates that job's list, or adds to the one it has */
  function useBox(tp) {
    var js = jobs().filter(function (j) { return j.status !== 'done'; });
    if (!js.length) return '<div class="ml-sub bpx-mut">No open jobs. Add a project first.</div>';
    return '<div class="ml-sub ml-usebox"><div class="ml-sub-h"><b>Put &ldquo;' + esc(tp.name) + '&rdquo; on a job</b></div><div class="ml-newf">'
      + '<label>Job<select id="ml-use-job">' + js.map(function (j) {
        var n = j.materials && j.materials.items ? j.materials.items.length : 0;
        return '<option value="' + j.id + '">' + esc(j.name || 'Job') + (j.title ? ' — ' + esc(j.title) : '') + (n ? ' (adds to its ' + n + '-item list)' : ' (new list)') + '</option>';
      }).join('') + '</select></label>'
      + '<button class="bpx-rowbtn" onclick="ML.tplUsing=null;bpMatTemplates()">Cancel</button><button class="bpx-rowbtn ml-primary" onclick="ML.tplUseGo(\'' + tp.id + '\')">Add ' + tp.items.length + (tp.items.length === 1 ? ' item' : ' items') + '</button></div></div>';
  }
  ML.tplUse = function (tid) { ML.tplUsing = ML.tplUsing === tid ? null : tid; window.bpMatTemplates(); };
  ML.tplUseGo = function (tid) {
    var jid = ($('ml-use-job') || {}).value, tp = tplById(tid), j = jobById(jid); if (!tp || !j) return;
    var had = !!(j.materials && j.materials.items && j.materials.items.length);
    ML.applyTpl(jid, tid); ML.tplUsing = null;
    window.bpToast && bpToast((had ? 'Added to ' : 'Started a list for ') + (j.name || 'the job') + '.');
    ML.open = jid; bpNav('matlists');
  };

  /* ---------- the Materials tab on a project ---------- */
  var oldProjMaterials = window.bpProjMaterials;
  ML.oldProjMaterials = oldProjMaterials;
  window.bpProjMaterials = function (jobId) {
    var el = $('bpx-pj-mat'); if (!el) return;
    var j = jobById(jobId); listOf(j, true);
    el.innerHTML = '<div class="ml-pj-h"><b>List</b> <span class="bpx-mut">planning only, estimated</span></div>' + editor(T('job', jobId))
      + (window.bpReceiptsFor ? window.bpReceiptsFor(jobId) : '');
    ensureSP(function () {});
    setTimeout(function () { ML.badgeTab(jobId); }, 0);
    ML.sync(true);
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
      el.insertAdjacentHTML('beforeend', '<div class="ml-bud"><span class="ms">list_alt</span><span>Planned (material list, estimated): <b>' + money(t) + '</b>'
        + (b ? ' vs a ' + money(b) + ' materials budget' + (t > b ? ' <b class="ml-bad">(planned ' + money(t - b) + ' over)</b>' : '') : '')
        + (co ? ' &middot; Change orders: <b>' + money(co) + '</b>' : '')
        + '<br><span class="bpx-mut">Planned, not spent. Only receipts and expenses count as cost.</span></span></div>');
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
    + '#bpx .ml-opt-g{padding:8px 12px 3px;font-size:13px;font-weight:600;border-top:1px solid var(--line-2)}#bpx .ml-opt-g small{color:var(--grey);font-weight:400;font-size:11px}'
    + '#bpx .ml-opt-sub{padding:6px 12px 6px 24px;font-size:13px}#bpx .ml-opt-cheap{background:rgba(31,170,90,.07)}#bpx .ml-cheap{font-size:10.5px;font-weight:700;color:#178048;background:rgba(31,170,90,.14);border-radius:5px;padding:1px 6px;margin-left:4px}'
    + '#bpx .ml-opt-custom{display:block;color:var(--blue,#006fff);font-weight:600}#bpx .ml-opt-none{padding:10px 12px;font-size:13px}'
    + '#bpx .ml-tbl td{vertical-align:middle;padding:7px 8px}#bpx .ml-tbl th{padding:8px}#bpx .ml-name{font-weight:600}#bpx .ml-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center}#bpx .ml-meta small{color:var(--grey);font-size:11px}'
    + '#bpx .ml-in{border:1px solid var(--line);border-radius:7px;padding:6px 8px;font:inherit;font-size:13.5px;background:#fff;width:100%;box-sizing:border-box;min-width:0}'
    + '#bpx .ml-in-note{margin-top:5px;font-size:12.5px;padding:5px 8px;background:var(--soft)}#bpx .ml-pj-h{font-size:13.5px;margin-bottom:8px}#bpx .ml-use td{background:var(--soft);cursor:default}#bpx .ml-jobs .ml-use td{grid-column:1/-1;display:block}#bpx .ml-usebox{margin:8px 0}#bpx .ml-usebox select{max-width:100%}'
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
    + '#bpx#bpx#bpx#bpx#bpx .ml-tbl td,#bpx#bpx#bpx#bpx#bpx .ml-jobs td{height:auto !important}'
    + '#bpx .ml-tbl tr,#bpx .ml-jobs tr{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:auto;height:auto !important;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--line-2);position:relative}'
    + '#bpx .ml-tbl td,#bpx .ml-jobs td{display:flex;justify-content:space-between;align-items:center;gap:8px;border:0;padding:2px 0;text-align:left}'
    + '#bpx .ml-tbl td[data-l]:before,#bpx .ml-jobs td[data-l]:before{content:attr(data-l);font-size:11px;color:var(--grey);text-transform:uppercase;letter-spacing:.03em}'
    + '#bpx .ml-tbl td[data-l="Item"],#bpx .ml-jobs td[data-l="Job"],#bpx .ml-jobs td[data-l="Template"]{grid-column:1/-1;display:block;padding-right:34px}#bpx .ml-tbl td[data-l="Item"]:before,#bpx .ml-jobs td[data-l="Job"]:before,#bpx .ml-jobs td[data-l="Template"]:before{display:none}'
    + '#bpx .ml-tbl .ml-x{position:absolute;right:0;top:8px;width:auto}#bpx .ml-jobs .ml-x{grid-column:1/-1;justify-content:flex-end}#bpx .ml-jobs td[data-l="Suppliers"]{grid-column:1/-1}'
    + '#bpx .ml-in-num{width:90px}#bpx .ml-fr{min-width:0;width:100%}#bpx .ml-foot{align-items:stretch}#bpx .ml-opt{grid-template-columns:minmax(0,1fr) auto}#bpx .ml-opt-s{grid-column:1;grid-row:2}#bpx .ml-opt-p{grid-row:1/3;grid-column:2}}';
  css += '#bpx .ml-by{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--grey);background:var(--soft,#f4f6fa);border-radius:20px;padding:1px 8px 1px 2px;white-space:nowrap}'
    + '#bpx .ml-by i,#bpx .ml-av{font-style:normal;display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;background:#64748b;color:#fff;font-size:8.5px;font-weight:700;flex:0 0 auto}'
    + '#bpx .ml-by.crew{background:#eef2ff;color:#3730a3;font-weight:600}#bpx .ml-by.crew i{background:#4f46e5}'
    + '#bpx .ml-tag-req{background:#eef2ff;color:#3730a3}#bpx .ml-crewrow td{background:#fafaff}'
    + '#bpx .ml-ok{border:1px solid #c7d2fe;background:#fff;color:#3730a3;font:inherit;font-size:11px;font-weight:600;border-radius:6px;padding:1px 8px;cursor:pointer}#bpx .ml-ok:hover{background:#eef2ff}'
    + '#bpx .ml-lock{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;margin:0;cursor:pointer;color:var(--grey);border:1px solid var(--line);border-radius:7px;padding:3px 9px 3px 6px;white-space:nowrap}'
    + '#bpx .ml-lock input{position:absolute;opacity:0;width:1px;height:1px}#bpx .ml-lock .ms{font-size:16px}#bpx .ml-lock:has(input:checked){color:#a8710f;background:#fdf1dc;border-color:#f3e1b5}#bpx .ml-lock:has(input:focus-visible){outline:2px solid var(--blue,#006fff)}'
    + '#bpx .ml-newb{display:inline-block;margin-left:6px;background:#dc2626;color:#fff;font-size:10.5px;font-weight:700;border-radius:10px;padding:1px 7px;line-height:1.5;vertical-align:1px;white-space:nowrap}#bpx .ml-newb.rc{background:#4f46e5}'
    + '#bpx .pjs-tab .ml-newb{margin-left:4px;font-size:10px;padding:0 6px}'
    + '#bpx .ml-log{margin-top:14px;border:1px solid var(--line);border-radius:10px;padding:0 12px;background:#fff}#bpx .ml-log summary{cursor:pointer;padding:10px 0;font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:6px;list-style:none}#bpx .ml-log summary::-webkit-details-marker{display:none}#bpx .ml-log summary .ms{font-size:18px;color:var(--grey)}'
    + '#bpx .ml-log ol{list-style:none;margin:0;padding:0 0 8px;max-height:320px;overflow:auto}#bpx .ml-log li{display:flex;align-items:flex-start;gap:8px;padding:6px 4px;border-top:1px solid var(--line-2);font-size:13px;line-height:1.4}'
    + '#bpx .ml-log li>span{flex:1;min-width:0}#bpx .ml-log time{font-size:11.5px;color:var(--grey);white-space:nowrap}#bpx .ml-log li.crew .ml-av{background:#4f46e5}#bpx .ml-log li.new{background:#fff7ed;border-radius:6px}#bpx .ml-log li.new time{color:#c2410c;font-weight:600}';
  var st = document.createElement('style'); st.id = 'ml-css'; st.textContent = css; document.head.appendChild(st);
})();

(function(){var s=document.getElementById('ml-css');if(s)s.textContent+='#bpx .ml-chk input{width:auto;margin:0}';})();
