/* ==================================================================
   Equipment (Projects → Equipment, and the crew app)

   One record per piece of equipment at a customer's place: the AC, the
   furnace, the water heater, the roof. A tech takes a photo of the
   nameplate and asset-scan reads the make, model and serial, and works out
   when it was made (printed, or decoded from the serial). From the install
   date and the expected life the record shows its age, how much life is
   left, and a predicted replacement date, which is also a sales lead.

   Record:   photo, name, make · model, serial, tags (Installed, Pre-existing,
             Rental), Log a service visit, Ask AI
   Tabs:     Overview (age, installed, predicted replacement, warranty, next
             service, details) · Service history · Documents
   Data:     public.assets, public.asset_services (RLS: the owner's team, not
             subcontractors; crew can add and service, not delete)
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var toast = function (t, k) { if (window.bpToast) bpToast(t, k); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var crew = function () { return !!(window.bpTeamIsCrew && bpTeamIsCrew()); };
  var URL_FN = function () { return (window.BP_URL || '') + '/functions/v1/asset-scan'; };
  var A = window.BPA = { list: [], loaded: false, id: null, tab: 'overview', svc: {}, chat: [] };

  /* ---------- kinds of equipment ---------- */
  var CAT = {
    ac_condenser: ['AC condenser', 'ac_unit', 14], heat_pump: ['Heat pump', 'heat_pump', 14], furnace: ['Furnace', 'local_fire_department', 18],
    air_handler: ['Air handler', 'air', 18], package_unit: ['Package unit', 'hvac', 15], rooftop_unit: ['Rooftop unit', 'hvac', 18], mini_split: ['Mini split', 'mode_fan', 14],
    boiler: ['Boiler', 'water_heater', 25], water_heater_tank: ['Water heater', 'water_heater', 10], water_heater_tankless: ['Tankless water heater', 'water_heater', 20],
    water_softener: ['Water softener', 'water_drop', 12], well_pump: ['Well pump', 'water_pump', 12], sump_pump: ['Sump pump', 'water_pump', 8],
    pool_pump: ['Pool pump', 'pool', 10], pool_heater: ['Pool heater', 'pool', 10], pool_filter: ['Pool filter', 'pool', 12],
    electrical_panel: ['Electrical panel', 'electrical_services', 35], generator: ['Generator', 'bolt', 25], ev_charger: ['EV charger', 'ev_station', 12],
    solar_inverter: ['Solar inverter', 'solar_power', 12], battery: ['Battery', 'battery_charging_full', 12], roof: ['Roof', 'roofing', 22],
    garage_door_opener: ['Garage door opener', 'garage', 12], appliance: ['Appliance', 'kitchen', 12], other: ['Equipment', 'build', 15]
  };
  var catName = function (k) { return (CAT[k] || CAT.other)[0]; };
  var catIco = function (k) { return (CAT[k] || CAT.other)[1]; };
  var catLife = function (k) { return (CAT[k] || CAT.other)[2]; };
  var SVC = { ac_condenser: 6, heat_pump: 6, furnace: 12, air_handler: 6, package_unit: 6, rooftop_unit: 3, mini_split: 6, boiler: 12, water_heater_tank: 12, water_heater_tankless: 12,
    water_softener: 12, well_pump: 12, sump_pump: 12, pool_pump: 6, pool_heater: 12, pool_filter: 6, electrical_panel: 24, generator: 12, roof: 24, solar_inverter: 12, battery: 12 };
  var TAGS = [['installed', 'Installed'], ['pre-existing', 'Pre-existing'], ['rental', 'Rental']];

  /* what a maintenance visit checks, by kind */
  var CHECKS = {
    hvac: ['Replace or clean the filter', 'Clean the condenser coil', 'Check refrigerant pressures', 'Test capacitor and contactor', 'Flush the condensate drain', 'Tighten electrical connections', 'Check the blower and belts', 'Test the thermostat and safeties'],
    heat: ['Inspect the burners and flame', 'Check the heat exchanger', 'Test the ignitor and flame sensor', 'Check gas pressure', 'Test CO and the venting', 'Replace or clean the filter', 'Test the safeties and limit switch'],
    water: ['Flush the tank', 'Test the T&P relief valve', 'Check the anode rod', 'Inspect the venting', 'Check gas or electrical connections', 'Look for leaks and corrosion', 'Check the temperature setting'],
    pool: ['Clean the strainer basket', 'Check the seals for leaks', 'Check pressure and flow', 'Inspect the motor and bearings', 'Clean or backwash the filter'],
    elec: ['Check for loose or hot connections', 'Test the breakers and GFCI/AFCI', 'Look for corrosion or moisture', 'Check labeling', 'Thermal scan'],
    gen: ['Change the oil and filter', 'Check the battery', 'Run under load', 'Inspect the air filter and plugs', 'Update the firmware or controller'],
    roof: ['Look for missing or damaged shingles', 'Check flashing and penetrations', 'Clear gutters and valleys', 'Check the attic for leaks', 'Seal exposed fasteners'],
    other: ['Visual inspection', 'Clean', 'Test operation', 'Check connections']
  };
  function checksFor(k) {
    if (/^(ac_condenser|heat_pump|air_handler|package_unit|rooftop_unit|mini_split)$/.test(k)) return CHECKS.hvac;
    if (/^(furnace|boiler)$/.test(k)) return CHECKS.heat;
    if (/^water_/.test(k) || /pump$/.test(k) && k !== 'pool_pump') return CHECKS.water;
    if (/^pool_/.test(k)) return CHECKS.pool;
    if (k === 'electrical_panel' || k === 'ev_charger' || k === 'solar_inverter' || k === 'battery') return CHECKS.elec;
    if (k === 'generator') return CHECKS.gen;
    if (k === 'roof') return CHECKS.roof;
    return CHECKS.other;
  }

  /* ---------- dates ---------- */
  var DAY = 864e5;
  var pd = function (s) { if (!s) return null; var d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? null : d; };
  var ymd = function (d) { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var nice = function (s) { var d = pd(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
  var addMonths = function (d, m) { var x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
  function since(d) {
    if (!d) return '';
    var ms = Date.now() - d.getTime(); if (ms < 0) return 'Not yet';
    var mo = Math.floor(ms / (30.44 * DAY)), y = Math.floor(mo / 12), m = mo % 12;
    if (y && m) return y + ' yr' + (y > 1 ? 's' : '') + ' ' + m + ' mo';
    if (y) return y + ' yr' + (y > 1 ? 's' : '');
    return mo ? mo + ' mo' : 'Under a month';
  }
  function away(d) {
    var days = Math.round((d.getTime() - Date.now()) / DAY), a = Math.abs(days);
    var t = a >= 365 ? Math.round(a / 36.5) / 10 + ' yrs' : a >= 60 ? Math.round(a / 30.4) + ' months' : a + ' day' + (a === 1 ? '' : 's');
    return days < 0 ? t + ' ago' : 'in ' + t;
  }
  /* everything the record works out from its dates */
  function facts(a) {
    var start = pd(a.installed_on) || pd(a.mfg_date);
    var life = +a.life_years || catLife(a.category);
    var repl = start ? addMonths(start, Math.round(life * 12)) : null;
    var used = start ? (Date.now() - start.getTime()) / (life * 365.25 * DAY) : 0;
    var per = +a.service_months || 0, last = pd(a.last_service) || pd(a.installed_on) || (a.created_at ? new Date(a.created_at) : null);
    var next = per && last ? addMonths(last, per) : null;
    var ndays = next ? Math.round((next.getTime() - Date.now()) / DAY) : null;
    var svc = !per ? { k: 'none', t: 'No plan', c: '#788493' } : ndays < 0 ? { k: 'over', t: 'Service overdue', c: '#b91c1c' } : ndays <= 30 ? { k: 'soon', t: 'Service due soon', c: '#b45309' } : { k: 'ok', t: 'On schedule', c: '#0f7a43' };
    var eol = used >= 1 ? { k: 'past', t: 'Past expected life', c: '#b91c1c' } : used >= 0.8 ? { k: 'near', t: 'Nearing end of life', c: '#b45309' } : null;
    var wp = pd(a.warranty_until), wl = pd(a.labor_warranty_until);
    return { start: start, life: life, repl: repl, used: Math.max(0, used), next: next, svc: svc, eol: eol, wp: wp, wl: wl,
      warr: (wp && wp.getTime() > Date.now()) || (wl && wl.getTime() > Date.now()) };
  }

  /* ---------- data ---------- */
  var COLS = '*';
  A.load = function (force) {
    if (!live()) { A.loaded = true; A.list = A.list || []; return Promise.resolve(A.list); }
    if (A.loaded && !force) return Promise.resolve(A.list);
    return Promise.resolve(BP_SB.from('assets').select(COLS).order('updated_at', { ascending: false }).limit(2000)).then(function (r) {
      A.loaded = true; A.list = (r && !r.error && r.data) || []; return A.list;
    }, function () { A.loaded = true; return A.list; });
  };
  var byId = function (id) { return (A.list || []).filter(function (x) { return x.id === id; })[0] || null; };
  function history(id) {
    if (!live()) return Promise.resolve([]);
    return Promise.resolve(BP_SB.from('asset_services').select('*').eq('asset_id', id).order('at', { ascending: false }).limit(200))
      .then(function (r) { A.svc[id] = (r && !r.error && r.data) || []; return A.svc[id]; }, function () { return A.svc[id] || []; });
  }

  /* ---------- photos ---------- */
  function shrink(file, max) {
    max = max || 1600;
    return new Promise(function (res) {
      if (!/^image\//.test(file.type)) { res({ mime: file.type, blob: file }); return; }
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        if (s === 1 && file.size < 1.2e6 && /jpe?g|png|webp/.test(file.type)) { URL.revokeObjectURL(u); res({ mime: file.type, blob: file }); return; }
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(u); res({ mime: 'image/jpeg', blob: b || file }); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(u); res({ mime: file.type, blob: file }); };
      img.src = u;
    });
  }
  function b64(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { var s = String(r.result || ''); res(s.slice(s.indexOf(',') + 1)); }; r.onerror = rej; r.readAsDataURL(blob); }); }
  function dataUrl(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result || '')); }; r.onerror = rej; r.readAsDataURL(blob); }); }
  function upload(blob, kind, name) {
    if (!(window.bpPF && bpPF.upload) || !live()) return dataUrl(blob);   /* the demo keeps it inline */
    return bpPF.upload('equipment', kind, blob, name || 'photo.jpg').catch(function () { return dataUrl(blob); });
  }
  /* fill every <img data-ref> under el from storage */
  function paintRefs(el) {
    if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('img[data-ref]'), function (im) {
      var ref = im.getAttribute('data-ref'); if (!ref) return;
      if (ref.indexOf('sb:') !== 0) { im.src = ref; return; }
      if (window.bpPF && bpPF.url) bpPF.url(ref).then(function (u) { if (u) im.src = u; });
    });
    Array.prototype.forEach.call(el.querySelectorAll('a[data-open]'), function (a) {
      a.onclick = function (e) { e.preventDefault(); var ref = a.getAttribute('data-open'); if (window.bpPF && bpPF.open && ref.indexOf('sb:') === 0) bpPF.open(ref); else window.open(ref, '_blank'); };
    });
  }

  /* ---------- who and where ---------- */
  function contacts() { return (window._bpContacts || []).filter(function (c) { return c && c.id; }); }
  function jobsAll() {
    if (crew()) return (window.bpCrewProjectsList ? bpCrewProjectsList() : []) || [];
    try { return (window.bpJobsGet ? bpJobsGet() : []).filter(function (j) { return j && j.status !== 'quote'; }); } catch (e) { return []; }
  }
  var jobBy = function (id) { return jobsAll().filter(function (j) { return j.id === id; })[0] || null; };

  /* ================================================================
     The Equipment page
     ================================================================ */
  A.filter = 'all'; A.q = '';
  window.bpAssetsPage = function () {
    var area = $('bpxViewArea'); if (!area) return;
    A.id = null;
    if (!A.loaded) area.innerHTML = '<div class="eq"><div class="eq-load">Loading equipment…</div></div>';
    var go = function () { A.load().then(function () { if (window._bpCurView === 'assets' && !A.id) drawList(); }); };
    if (!crew() && window.bpEnsureContacts && !contacts().length) Promise.resolve(bpEnsureContacts()).then(go, go); else go();
  };
  A.setFilter = function (f) { A.filter = f; drawList(); };
  A.search = function (v) { A.q = String(v || '').toLowerCase(); drawRows(); };
  function matches(a, f) {
    var x = facts(a);
    if (f === 'due') return x.svc.k === 'over' || x.svc.k === 'soon';
    if (f === 'eol') return !!x.eol;
    if (f === 'warr') return x.warr;
    if (f === 'installed' || f === 'pre-existing' || f === 'rental') return (a.tags || []).indexOf(f) > -1;
    return true;
  }
  function drawList() {
    var area = $('bpxViewArea'); if (!area) return;
    var L = (A.list || []).filter(function (a) { return a.status !== 'removed'; });
    var n = function (f) { return L.filter(function (a) { return matches(a, f); }).length; };
    var tile = function (k, v, t, c, ico) { return '<button class="eq-tile' + (A.filter === k ? ' on' : '') + '" onclick="BPA.setFilter(\'' + k + '\')"><span class="ms" style="color:' + c + '">' + ico + '</span><b>' + v + '</b><small>' + t + '</small></button>'; };
    var chip = function (k, t) { return '<button class="eq-chip' + (A.filter === k ? ' on' : '') + '" onclick="BPA.setFilter(\'' + k + '\')">' + t + '</button>'; };
    area.innerHTML = '<div class="eq">'
      + '<div class="bpx-chead eq-head"><div><h2>Equipment</h2><p class="eq-sub">Every unit you install or service, with its age, warranty and when it will need replacing.</p></div>'
        + '<div class="eq-acts"><button class="bpx-btn ghost" onclick="BPA.add()"><span class="ms">edit_note</span>Add by hand</button>'
        + '<button class="bpx-addbtn" onclick="BPA.add({scan:1})"><span class="ms">photo_camera</span>Scan a nameplate</button></div></div>'
      + (L.length ? '<div class="eq-tiles">' + tile('all', L.length, 'All equipment', 'var(--blue)', 'inventory_2') + tile('due', n('due'), 'Service due', '#b45309', 'build_circle')
          + tile('eol', n('eol'), 'Near end of life', '#b91c1c', 'hourglass_bottom') + tile('warr', n('warr'), 'Under warranty', '#0f7a43', 'verified_user') + '</div>'
        + '<div class="eq-bar"><label class="eq-search"><span class="ms">search</span><input placeholder="Search customer, make, model or serial" value="' + esc(A.q) + '" oninput="BPA.search(this.value)"></label>'
          + '<div class="eq-chips">' + chip('all', 'All') + TAGS.map(function (t) { return chip(t[0], t[1]); }).join('') + '</div></div>'
        + '<div class="eq-list" id="eq-rows"></div>'
      : '<div class="bpx-panel eq-empty"><span class="ms">qr_code_scanner</span><b>No equipment yet</b><p>Point your phone at the nameplate of the next unit you install or service. BuilderPro reads the make, model and serial, works out how old it is, and tells you when it’s due for service and when it’ll need replacing.</p>'
        + '<button class="bpx-addbtn" onclick="BPA.add({scan:1})"><span class="ms">photo_camera</span>Scan a nameplate</button></div>')
      + '</div>';
    drawRows();
    if (window.bpSpin) bpSpin(false);
  }
  function thumb(a, cls) {
    var ref = a.photo || a.nameplate;
    return '<span class="' + (cls || 'eq-th') + '">' + (ref ? '<img alt="" data-ref="' + esc(ref) + '">' : '<span class="ms">' + catIco(a.category) + '</span>') + '</span>';
  }
  function drawRows() {
    var el = $('eq-rows'); if (!el) return;
    var q = A.q;
    var L = (A.list || []).filter(function (a) { return a.status !== 'removed' && matches(a, A.filter); })
      .filter(function (a) { return !q || [a.name, a.make, a.model, a.serial, a.customer, a.addr, catName(a.category)].join(' ').toLowerCase().indexOf(q) > -1; })
      .sort(function (a, b) { var fa = facts(a), fb = facts(b); var r = { over: 0, soon: 1, ok: 2, none: 3 }; return (r[fa.svc.k] - r[fb.svc.k]) || String(b.updated_at).localeCompare(String(a.updated_at)); });
    el.innerHTML = L.length ? L.map(function (a) {
      var x = facts(a);
      return '<button class="eq-row" onclick="BPA.open(\'' + a.id + '\')">' + thumb(a)
        + '<span class="eq-rt"><b>' + esc(a.name || catName(a.category)) + '</b><small>' + esc([a.customer, a.addr].filter(Boolean).join(' · ') || 'No customer yet') + '</small>'
        + '<span class="eq-rtags">' + (a.tags || []).map(function (t) { return '<i class="eq-tag t-' + esc(t) + '">' + esc((TAGS.filter(function (z) { return z[0] === t; })[0] || [0, t])[1]) + '</i>'; }).join('') + '</span></span>'
        + '<span class="eq-rc"><em>Age</em>' + (x.start ? since(x.start) : '—') + '</span>'
        + '<span class="eq-rc"><em>Replace by</em>' + (x.repl ? nice(ymd(x.repl)) : '—') + '</span>'
        + '<span class="eq-rc eq-rs"><span class="eq-pill" style="color:' + x.svc.c + ';background:' + x.svc.c + '14">' + x.svc.t + '</span>' + (x.eol ? '<span class="eq-pill" style="color:' + x.eol.c + ';background:' + x.eol.c + '14">' + x.eol.t + '</span>' : '') + '</span>'
        + '<span class="ms eq-chev">chevron_right</span></button>';
    }).join('') : '<div class="eq-none">Nothing matches.</div>';
    paintRefs(el);
  }

  /* ================================================================
     One record
     ================================================================ */
  A.open = function (id, tab) {
    A.id = id; A.tab = tab || 'overview'; A.chat = [];
    if (window._bpCurView !== 'assets' && window.bpNav) { A._pending = id; bpNav('assets'); return; }
    drawRecord(); history(id).then(function () { if (A.id === id) drawRecord(); });
  };
  /* bpNav('assets') draws the list; a pending open takes over after it */
  var _page = window.bpAssetsPage;
  window.bpAssetsPage = function () {
    var p = A._pending; A._pending = null;
    if (p) { A.load().then(function () { A.open(p, A.tab); if (window.bpSpin) bpSpin(false); }); return; }
    _page();
  };
  window.bpAssetOpen = function (id, tab) { A.open(id, tab); };
  A.back = function () { A.id = null; drawList(); var m = document.querySelector('.bpx-main'); if (m) m.scrollTop = 0; };
  A.setTab = function (t) { A.tab = t; drawRecord(); };

  function drawRecord() {
    var area = $('bpxViewArea'), a = byId(A.id); if (!area) return;
    if (!a) { area.innerHTML = '<div class="eq"><div class="eq-none">That equipment is gone. <a onclick="BPA.back()">Back to equipment</a></div></div>'; return; }
    var x = facts(a), tabs = [['overview', 'Overview'], ['history', 'Service history'], ['docs', 'Documents']];
    var tagBtn = function (t) { var on = (a.tags || []).indexOf(t[0]) > -1; return '<button class="eq-tag t-' + t[0] + (on ? ' on' : ' off') + '" onclick="BPA.toggleTag(\'' + t[0] + '\')" aria-pressed="' + on + '">' + (on ? '<span class="ms">check</span>' : '') + t[1] + '</button>'; };
    area.innerHTML = '<div class="eq eq-rec">'
      + '<a class="eq-back" onclick="BPA.back()">&larr; Equipment</a>'
      + '<section class="bpx-panel eq-hero">' + thumb(a, 'eq-ph')
        + '<div class="eq-ht"><span class="eq-cat"><span class="ms">' + catIco(a.category) + '</span>' + esc(catName(a.category)) + (a.location ? ' · ' + esc(a.location) : '') + '</span>'
          + '<h2>' + esc(a.name || catName(a.category)) + '</h2>'
          + '<div class="eq-ids">' + (a.make || a.model ? '<span><em>Make · Model</em>' + esc([a.make, a.model].filter(Boolean).join(' · ')) + '</span>' : '') + (a.serial ? '<span><em>Serial</em><b class="eq-mono">' + esc(a.serial) + '</b></span>' : '') + '</div>'
          + '<div class="eq-tags">' + TAGS.map(tagBtn).join('') + '</div></div>'
        + '<div class="eq-hacts"><button class="bpx-addbtn" onclick="BPA.service()"><span class="ms">build</span>Log a service visit</button>'
          + '<button class="bpx-btn ghost eq-ai" onclick="BPA.ask()"><span class="ms">auto_awesome</span>Ask AI</button>'
          + '<button class="bpx-btn ghost" onclick="BPA.edit()"><span class="ms">edit</span>Edit</button></div></section>'
      + '<div class="eq-tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" aria-selected="' + (A.tab === t[0]) + '" class="' + (A.tab === t[0] ? 'on' : '') + '" onclick="BPA.setTab(\'' + t[0] + '\')">' + t[1] + (t[0] === 'history' && (A.svc[a.id] || []).length ? ' <i>' + A.svc[a.id].length + '</i>' : '') + '</button>'; }).join('') + '</div>'
      + '<div id="eq-pane">' + (A.tab === 'history' ? paneHistory(a) : A.tab === 'docs' ? paneDocs(a) : paneOverview(a, x)) + '</div>'
      + '</div>';
    paintRefs(area);
    if (window.bpSpin) bpSpin(false);
  }
  function stat(label, val, sub, tone) { return '<div class="eq-stat' + (tone ? ' ' + tone : '') + '"><small>' + label + '</small><b>' + (val || '—') + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>'; }
  function paneOverview(a, x) {
    var pct = Math.min(100, Math.round(x.used * 100));
    var tone = x.used >= 1 ? 'bad' : x.used >= 0.8 ? 'warn' : 'ok';
    var dateSrc = a.scan && a.scan.mfg_date_source === 'serial_decoded' ? 'decoded from the serial' : a.scan && a.scan.mfg_date_source === 'printed' ? 'printed on the nameplate' : '';
    var kv = function (rows) { rows = rows.filter(function (r) { return r[1]; }); return rows.length ? '<dl class="eq-kv">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' : ''; };
    var warr = function (d) { return d ? nice(ymd(d)) + (d.getTime() > Date.now() ? ' <small class="eq-ok">active</small>' : ' <small class="eq-bad">expired</small>') : ''; };
    var replLead = x.eol && !crew() && a.contact_id;
    return '<div class="eq-stats">'
        + stat('Age', x.start ? since(x.start) : '', x.start ? (pd(a.installed_on) ? 'since it was installed' : 'since it was made') : 'Add the install date')
        + stat('Date installed', a.installed_on ? nice(a.installed_on) : '', a.mfg_date ? 'Made ' + nice(a.mfg_date) : '')
        + stat('Predicted replacement', x.repl ? nice(ymd(x.repl)) : '', x.repl ? away(x.repl) + ' · ' + x.life + '-yr life' : '', x.eol ? (x.used >= 1 ? 'bad' : 'warn') : '')
        + stat('Next service', x.next ? nice(ymd(x.next)) : '', +a.service_months ? 'every ' + a.service_months + ' months' + (a.last_service ? ' · last ' + nice(a.last_service) : '') : 'No service plan', x.svc.k === 'over' ? 'bad' : x.svc.k === 'soon' ? 'warn' : '')
      + '</div>'
      + (x.start ? '<div class="bpx-panel eq-life ' + tone + '"><div class="eq-life-h"><b>Life used</b><span>' + pct + '% of a typical ' + x.life + '-year life</span></div><div class="eq-lbar"><i style="width:' + pct + '%"></i></div>'
        + (replLead ? '<div class="eq-lead"><span class="ms">sell</span><div><b>' + (x.used >= 1 ? 'Past its expected life' : 'Getting close to replacement') + '</b><p>Worth a replacement estimate on the next visit, before it fails in the middle of a season.</p></div><button class="bpx-btn" onclick="BPA.quote()">Start an estimate</button></div>' : '')
        + '</div>' : '')
      + '<div class="eq-cols"><section class="bpx-panel eq-sec"><div class="bpx-ptitle">Details</div>' + (kv([
          ['Kind', esc(catName(a.category))], ['Make', esc(a.make)], ['Model', esc(a.model)], ['Serial', a.serial ? '<span class="eq-mono">' + esc(a.serial) + '</span>' : ''],
          ['Size', esc(a.capacity)], ['Fuel', esc(a.fuel)], ['Refrigerant', esc(a.refrigerant)], ['Electrical', esc(a.voltage)], ['Location', esc(a.location)],
          ['Made', a.mfg_date ? nice(a.mfg_date) + (dateSrc ? ' <small>' + dateSrc + '</small>' : '') : '']]) || '<p class="eq-mut">Nothing recorded yet.</p>')
        + (a.scan && a.scan.date_note ? '<p class="eq-note"><span class="ms">info</span>' + esc(a.scan.date_note) + '</p>' : '') + '</section>'
      + '<section class="bpx-panel eq-sec"><div class="bpx-ptitle">Customer and warranty</div>' + kv([
          ['Customer', a.contact_id && !crew() ? '<a onclick="bpContactPage&&bpContactPage(\'' + esc(a.contact_id) + '\')">' + esc(a.customer || 'Customer') + '</a>' : esc(a.customer)],
          ['Address', a.addr ? '<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a.addr) + '">' + esc(a.addr) + '</a>' : ''],
          ['Job', a.job_id && jobBy(a.job_id) ? esc(jobBy(a.job_id).title || 'Job') : ''],
          ['Parts warranty', warr(x.wp)], ['Labor warranty', warr(x.wl)]])
        + (a.notes ? '<p class="eq-notes">' + esc(a.notes).replace(/\n/g, '<br>') + '</p>' : '') + '</section></div>';
  }
  var CONDS = { good: ['Good', '#0f7a43'], fair: ['Fair', '#b45309'], poor: ['Poor', '#b91c1c'] };
  var KINDS = { maintenance: 'Maintenance', repair: 'Repair', inspection: 'Inspection', install: 'Install' };
  function paneHistory(a) {
    var H = A.svc[a.id];
    if (!H) return '<div class="eq-load">Loading the history…</div>';
    return '<div class="eq-hhead"><button class="bpx-addbtn" onclick="BPA.service()"><span class="ms">add</span>Log a service visit</button></div>'
      + (H.length ? '<ol class="eq-tl">' + H.map(function (s) {
        var c = CONDS[s.condition], done = (s.checklist || []).filter(function (k) { return k.ok; }).length;
        return '<li><span class="eq-dot"></span><div class="bpx-panel eq-ev"><div class="eq-evh"><b>' + esc(KINDS[s.kind] || 'Visit') + '</b><span>' + nice(s.at) + (s.by_name ? ' · ' + esc(s.by_name) : '') + '</span>'
          + (c ? '<i class="eq-pill" style="color:' + c[1] + ';background:' + c[1] + '14">' + c[0] + ' condition</i>' : '') + '</div>'
          + (s.summary ? '<p>' + esc(s.summary).replace(/\n/g, '<br>') + '</p>' : '')
          + ((s.checklist || []).length ? '<div class="eq-cl">' + s.checklist.map(function (k) { return '<span class="' + (k.ok ? 'ok' : '') + '"><span class="ms">' + (k.ok ? 'check_circle' : 'radio_button_unchecked') + '</span>' + esc(k.t) + '</span>'; }).join('') + '</div><small class="eq-mut">' + done + ' of ' + s.checklist.length + ' checks done</small>' : '')
          + (s.readings && s.readings.text ? '<p class="eq-read"><span class="ms">speed</span>' + esc(s.readings.text) + '</p>' : '')
          + ((s.photos || []).length ? '<div class="eq-phs">' + s.photos.map(function (p) { return '<a data-open="' + esc(p) + '" href="#"><img alt="" data-ref="' + esc(p) + '"></a>'; }).join('') + '</div>' : '')
          + '</div></li>';
      }).join('') + '</ol>' : '<div class="bpx-panel eq-empty sm"><span class="ms">history</span><b>No visits logged yet</b><p>Each maintenance, repair or inspection goes here with the checklist, readings and photos, so the next tech knows exactly what was done.</p></div>');
  }
  function paneDocs(a) {
    var D = (a.docs || []).slice();
    var files = [];
    if (a.nameplate) files.push({ n: 'Nameplate photo', ref: a.nameplate, img: 1 });
    if (a.photo && a.photo !== a.nameplate) files.push({ n: 'Equipment photo', ref: a.photo, img: 1 });
    D.forEach(function (d, i) { files.push({ n: d.n || 'Document', ref: d.ref, at: d.at, i: i, img: /^image\//.test(d.type || '') }); });
    return '<div class="eq-hhead"><label class="bpx-addbtn eq-up"><span class="ms">upload_file</span>Add a manual, warranty or invoice<input type="file" hidden multiple accept="image/*,application/pdf" onchange="BPA.addDocs(this)"></label><span class="eq-msg" id="eq-dmsg"></span></div>'
      + (files.length ? '<div class="eq-docs">' + files.map(function (f) {
        return '<div class="bpx-panel eq-doc"><a data-open="' + esc(f.ref) + '" href="#">' + (f.img ? '<img alt="" data-ref="' + esc(f.ref) + '">' : '<span class="ms">description</span>') + '<b>' + esc(f.n) + '</b>' + (f.at ? '<small>' + nice(f.at) + '</small>' : '') + '</a>'
          + (f.i != null && !crew() ? '<button class="eq-x" aria-label="Remove" onclick="BPA.delDoc(' + f.i + ')">&times;</button>' : '') + '</div>';
      }).join('') + '</div>' : '<div class="bpx-panel eq-empty sm"><span class="ms">folder_open</span><b>No documents yet</b><p>Keep the install manual, the warranty registration and the invoice with the unit, so they’re there when it needs a part.</p></div>');
  }

  /* ---------- small edits on the record ---------- */
  function patch(a, ch) {
    Object.assign(a, ch, { updated_at: new Date().toISOString() });
    if (!live()) return Promise.resolve(a);
    return Promise.resolve(BP_SB.from('assets').update(Object.assign({}, ch, { updated_at: a.updated_at })).eq('id', a.id)).then(function (r) {
      if (r && r.error) toast('Couldn’t save: ' + r.error.message, 'error'); return a;
    });
  }
  A.toggleTag = function (t) {
    var a = byId(A.id); if (!a) return;
    var tags = (a.tags || []).slice(), i = tags.indexOf(t);
    if (i > -1) tags.splice(i, 1); else { tags.push(t); if (t === 'installed') tags = tags.filter(function (x) { return x !== 'pre-existing'; }); if (t === 'pre-existing') tags = tags.filter(function (x) { return x !== 'installed'; }); }
    patch(a, { tags: tags }).then(drawRecord);
  };
  A.addDocs = function (inp) {
    var a = byId(A.id), files = Array.prototype.slice.call(inp.files || []); inp.value = ''; if (!a || !files.length) return;
    var msg = $('eq-dmsg'); if (msg) msg.textContent = 'Uploading…';
    Promise.all(files.slice(0, 8).map(function (f) {
      return (/^image\//.test(f.type) ? shrink(f, 2000) : Promise.resolve({ mime: f.type, blob: f })).then(function (o) {
        return upload(o.blob, 'docs', f.name).then(function (ref) { return { n: f.name.replace(/\.[a-z0-9]+$/i, '') || 'Document', ref: ref, type: o.mime, at: ymd(new Date()) }; });
      });
    })).then(function (add) { return patch(a, { docs: (a.docs || []).concat(add).slice(-40) }); }).then(function () { toast('Added.', 'success'); drawRecord(); }, function () { if (msg) msg.textContent = 'Upload failed. Try again.'; });
  };
  A.delDoc = function (i) {
    var a = byId(A.id); if (!a || !confirm('Remove this document from the record?')) return;
    var d = (a.docs || []).slice(), gone = d.splice(i, 1)[0];
    patch(a, { docs: d }).then(function () { if (gone && window.bpPF && bpPF.remove) bpPF.remove(gone.ref); drawRecord(); });
  };
  A.quote = function () {
    var a = byId(A.id); if (!a) return;
    if (window.bpQuoteNew) { bpQuoteNew(a.contact_id).then(function () {
      try { var j = (bpJobsGet() || []).filter(function (x) { return x.id === (window.BPQ && BPQ.id); })[0];
        if (j && (!j.title || j.title === 'New estimate')) { j.title = 'Replace ' + (a.name || catName(a.category)); if (!j.addr) j.addr = a.addr || ''; bpJobsSet(bpJobsGet()); }
      } catch (e) {} }); }
  };

  /* ================================================================
     Add / edit (with the nameplate scan)
     ================================================================ */
  var D = null;   /* the draft in the dialog */
  A.add = function (o) {
    o = o || {};
    var j = o.jobId ? jobBy(o.jobId) : null;
    D = { id: null, name: '', category: '', make: '', model: '', serial: '', capacity: '', fuel: '', refrigerant: '', voltage: '', location: '',
      installed_on: o.tag === 'installed' ? ymd(new Date()) : '', mfg_date: '', life_years: '', service_months: '', warranty_until: '', labor_warranty_until: '',
      tags: o.tag ? [o.tag] : ['pre-existing'], contact_id: o.contactId || (j && j.contactId) || '', customer: o.customer || (j && j.name) || '', addr: o.addr || (j && j.addr) || '',
      job_id: o.jobId || '', notes: '', photo: '', nameplate: '', scan: {}, _plateBlob: null, _photoBlob: null, _ai: {} };
    if (D.contact_id && !D.customer) { var c = contacts().filter(function (x) { return x.id === D.contact_id; })[0]; if (c) D.customer = c.name || ''; }
    dialog(!!o.scan);
  };
  A.edit = function () {
    var a = byId(A.id); if (!a) return;
    D = Object.assign({}, a, { tags: (a.tags || []).slice(), life_years: a.life_years || '', service_months: a.service_months || '', _ai: {} });
    ['installed_on', 'mfg_date', 'warranty_until', 'labor_warranty_until'].forEach(function (k) { D[k] = D[k] ? String(D[k]).slice(0, 10) : ''; });
    dialog(false);
  };
  function field(k, label, type, ph, extra) {
    return '<label class="eq-f' + (D._ai[k] ? ' ai' : '') + '"><span>' + label + (D._ai[k] ? ' <i class="eq-aib">read from photo</i>' : '') + '</span><input id="eqf-' + k + '" type="' + (type || 'text') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '')
      + ' value="' + esc(D[k] == null ? '' : D[k]) + '" oninput="BPA.df(\'' + k + '\',this.value)"' + (extra || '') + '></label>';
  }
  A.df = function (k, v) { if (D) { D[k] = v; if (D._ai[k]) { D._ai[k] = 0; var el = $('eqf-' + k); if (el && el.parentNode) el.parentNode.classList.remove('ai'); } } };
  function dialog(scanFirst) {
    var editing = !!D.id;
    var cs = contacts(), js = jobsAll();
    var copts = crew() ? '' : '<option value="">No customer yet</option>' + cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === D.contact_id ? ' selected' : '') + '>' + esc(c.name || c.phone || c.email || 'Contact') + '</option>'; }).join('')
      + (D.contact_id && !cs.some(function (c) { return c.id === D.contact_id; }) ? '<option value="' + esc(D.contact_id) + '" selected>' + esc(D.customer || 'Customer') + '</option>' : '');
    var jopts = '<option value="">Not tied to a job</option>' + js.slice(0, 200).map(function (j) { return '<option value="' + esc(j.id) + '"' + (j.id === D.job_id ? ' selected' : '') + '>' + esc((j.name ? j.name + ' · ' : '') + (j.title || 'Job')) + '</option>'; }).join('');
    var cats = Object.keys(CAT).map(function (k) { return '<option value="' + k + '"' + (D.category === k ? ' selected' : '') + '>' + CAT[k][0] + '</option>'; }).join('');
    var per = [[0, 'No service plan'], [3, 'Every 3 months'], [6, 'Every 6 months'], [12, 'Once a year'], [24, 'Every 2 years']];
    bpModal('<div class="eq-dlg"><h3>' + (editing ? 'Edit equipment' : 'New equipment') + '</h3>'
      + '<div class="eq-scan" id="eq-scan">' + scanBox() + '</div>'
      + '<div class="eq-form">'
        + '<div class="eq-g2">' + field('name', 'Name', 'text', 'e.g. Trane 3-ton heat pump')
          + '<label class="eq-f' + (D._ai.category ? ' ai' : '') + '"><span>Kind</span><select id="eqf-category" onchange="BPA.df(\'category\',this.value);BPA.catSet(this.value)"><option value="">Pick one…</option>' + cats + '</select></label></div>'
        + '<div class="eq-g3">' + field('make', 'Make', 'text', 'Trane') + field('model', 'Model', 'text', '4TWR6036H1000A') + field('serial', 'Serial', 'text', '13241V8AF', ' autocapitalize="characters" spellcheck="false"') + '</div>'
        + '<div class="eq-g3">' + field('capacity', 'Size', 'text', '3 ton / 50 gal') + field('refrigerant', 'Refrigerant', 'text', 'R-410A') + field('fuel', 'Fuel', 'text', 'Electric / Gas') + '</div>'
        + '<div class="eq-g3">' + field('installed_on', 'Date installed', 'date') + field('mfg_date', 'Date made', 'date') + field('life_years', 'Expected life (years)', 'number', '', ' min="1" max="60" inputmode="numeric"') + '</div>'
        + '<div class="eq-g3"><label class="eq-f"><span>Service</span><select onchange="BPA.df(\'service_months\',this.value)">' + per.map(function (p) { return '<option value="' + p[0] + '"' + (+D.service_months === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></label>'
          + field('warranty_until', 'Parts warranty until', 'date') + field('labor_warranty_until', 'Labor warranty until', 'date') + '</div>'
        + '<div class="eq-f"><span>This unit is</span><div class="eq-tagpick">' + TAGS.map(function (t) { return '<label class="eq-tag t-' + t[0] + '"><input type="checkbox" value="' + t[0] + '"' + (D.tags.indexOf(t[0]) > -1 ? ' checked' : '') + ' onchange="BPA.dtag(this)">' + t[1] + '</label>'; }).join('') + '</div></div>'
        + '<div class="eq-g2">' + (crew() ? field('customer', 'Customer', 'text', 'Who owns it') : '<label class="eq-f"><span>Customer</span><select onchange="BPA.dcontact(this.value)">' + copts + '</select></label>')
          + '<label class="eq-f"><span>Job</span><select onchange="BPA.djob(this.value)">' + jopts + '</select></label></div>'
        + '<div class="eq-g2">' + field('addr', 'Address', 'text', 'Where it is') + field('location', 'Where in the property', 'text', 'Attic, garage, roof, side yard') + '</div>'
        + '<label class="eq-f"><span>Notes</span><textarea rows="2" oninput="BPA.df(\'notes\',this.value)" placeholder="Access, quirks, parts on order">' + esc(D.notes || '') + '</textarea></label>'
        + '<label class="eq-f eq-ph2"><span>Photo of the whole unit <small>optional</small></span><input type="file" accept="image/*" capture="environment" onchange="BPA.dphoto(this)"><em id="eq-phmsg">' + (D.photo || D._photoBlob ? 'Photo added.' : '') + '</em></label>'
      + '</div>'
      + '<div class="bpx-mmsg" id="eq-msg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button>' + (editing && !crew() ? '<button class="bpx-delbtn" onclick="BPA.remove()">Delete</button>' : '') + '<button class="bpx-btn" id="eq-save" onclick="BPA.save()">' + (editing ? 'Save' : 'Add equipment') + '</button></div></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.classList.add('eq-card'); }
    paintRefs($('eq-scan'));
    if (scanFirst) setTimeout(function () { var i = $('eq-plate'); if (i) i.click(); }, 60);
  }
  function scanBox() {
    var p = D._plateUrl || (D.nameplate && D.nameplate);
    if (D._reading) return '<div class="eq-sbox busy"><span class="eq-spin"></span><div><b>Reading the nameplate…</b><small>Make, model, serial and the year it was made</small></div></div>';
    var s = D.scan || {}, conf = +s.confidence || 0;
    if (p && (D._read || D.id)) return '<div class="eq-sbox done">' + (D._plateUrl ? '<img alt="" src="' + esc(D._plateUrl) + '">' : '<img alt="" data-ref="' + esc(D.nameplate) + '">')
      + '<div>' + (D._read ? '<b>' + (conf >= 0.6 ? 'Read the nameplate' : 'Read some of it') + '</b><small>' + (conf >= 0.6 ? 'Check the highlighted fields.' : 'The photo was hard to read. Check the fields, or take it again closer and without glare.') + '</small>' + (s.date_note ? '<small class="eq-dn"><span class="ms">event</span>' + esc(s.date_note) + '</small>' : '') : '<b>Nameplate photo</b>')
      + '<label class="eq-relink">Take it again<input id="eq-plate" type="file" accept="image/*" capture="environment" hidden onchange="BPA.scan(this)"></label></div></div>';
    return '<label class="eq-sbox"><span class="ms">qr_code_scanner</span><div><b>Scan the nameplate</b><small>Take a photo of the data plate. We fill in the make, model, serial and age for you.</small></div><span class="bpx-btn">Take photo</span>'
      + '<input id="eq-plate" type="file" accept="image/*" capture="environment" hidden onchange="BPA.scan(this)"></label>';
  }
  A.catSet = function (k) {
    if (!D) return;
    if (!D.life_years) { D.life_years = catLife(k); var l = $('eqf-life_years'); if (l) l.value = D.life_years; }
    if (!+D.service_months && SVC[k]) { D.service_months = SVC[k]; var sel = document.querySelector('.eq-dlg select[onchange*="service_months"]'); if (sel) sel.value = String(SVC[k]); }
  };
  A.dtag = function (cb) {
    var t = cb.value, on = cb.checked;
    D.tags = D.tags.filter(function (x) { return x !== t; }); if (on) D.tags.push(t);
    if (on && (t === 'installed' || t === 'pre-existing')) {
      var other = t === 'installed' ? 'pre-existing' : 'installed'; D.tags = D.tags.filter(function (x) { return x !== other; });
      var o = document.querySelector('.eq-tagpick input[value="' + other + '"]'); if (o) o.checked = false;
      if (t === 'installed' && !D.installed_on) { D.installed_on = ymd(new Date()); var i = $('eqf-installed_on'); if (i) i.value = D.installed_on; }
    }
  };
  A.dcontact = function (id) {
    D.contact_id = id || ''; var c = contacts().filter(function (x) { return x.id === id; })[0];
    D.customer = c ? (c.name || '') : '';
    if (c && !D.addr && (c.address1 || c.address)) { D.addr = c.address1 || c.address; var a = $('eqf-addr'); if (a) a.value = D.addr; }
  };
  A.djob = function (id) {
    D.job_id = id || ''; var j = jobBy(id); if (!j) return;
    if (!D.contact_id && j.contactId) D.contact_id = j.contactId;
    if (!D.customer && j.name) { D.customer = j.name; var cu = $('eqf-customer'); if (cu) cu.value = j.name; }
    if (!D.addr && j.addr) { D.addr = j.addr; var a = $('eqf-addr'); if (a) a.value = j.addr; }
  };
  A.dphoto = function (inp) {
    var f = inp.files && inp.files[0]; if (!f) return;
    shrink(f, 1600).then(function (o) { D._photoBlob = o.blob; var m = $('eq-phmsg'); if (m) m.textContent = 'Photo added.'; });
  };
  /* the nameplate: shrink, show it, read it, fill the form */
  A.scan = function (inp) {
    var f = inp.files && inp.files[0]; if (!f || !D) return;
    D._reading = true; D._read = false; $('eq-scan').innerHTML = scanBox();
    shrink(f, 1800).then(function (o) {
      D._plateBlob = o.blob;
      return Promise.all([b64(o.blob), dataUrl(o.blob)]).then(function (r) {
        D._plateUrl = r[1];
        if (!live() || !window.bpAuthApi) return { ok: false, reason: 'Sign in to read nameplates.' };
        return bpAuthApi(URL_FN(), { op: 'scan', mime: o.mime === 'image/jpeg' || /png|webp|heic|heif/.test(o.mime) ? o.mime : 'image/jpeg', data: r[0] });
      });
    }).then(function (r) {
      D._reading = false;
      if (!r || !r.ok || !r.plate) { D._read = false; $('eq-scan').innerHTML = scanBox(); var m = $('eq-msg'); if (m) { m.style.color = '#b91c1c'; m.textContent = (r && (r.reason || r.error)) || 'Couldn’t read that photo. Fill it in by hand, or try again.'; } return; }
      var p = r.plate, set = function (k, v) { if (v && (!D[k] || D._ai[k] || !D.id)) { D[k] = v; D._ai[k] = 1; } };
      set('make', p.manufacturer); set('model', p.model_no); set('serial', p.serial_no); set('capacity', p.capacity); set('fuel', p.fuel);
      set('refrigerant', p.refrigerant); set('voltage', p.voltage); set('mfg_date', p.mfg_date);
      if (p.category && p.category !== 'other') set('category', p.category);
      if (p.name && !(D.name && !D._ai.name && D.id)) set('name', p.name);
      if (p.life_years) set('life_years', p.life_years);
      if (!+D.service_months && SVC[D.category]) D.service_months = SVC[D.category];
      /* pre-existing equipment: no install date of ours, so its age runs from when it was made */
      D.scan = { confidence: p.confidence, mfg_date_source: p.mfg_date_source, date_note: p.date_note, note: p.note, model: r.model, at: new Date().toISOString() };
      D._read = true;
      var keep = { scan: D._plateUrl };
      dialog(false); D._plateUrl = keep.scan; $('eq-scan').innerHTML = scanBox();
      if (p.note) { var m2 = $('eq-msg'); if (m2) { m2.style.color = '#b45309'; m2.textContent = p.note; } }
    }, function () { D._reading = false; $('eq-scan').innerHTML = scanBox(); var m = $('eq-msg'); if (m) { m.style.color = '#b91c1c'; m.textContent = 'No connection. Fill it in by hand, or try again.'; } });
  };
  A.save = function () {
    if (!D) return;
    var btn = $('eq-save'), msg = $('eq-msg');
    var say = function (t) { if (msg) { msg.style.color = '#b91c1c'; msg.textContent = t; } };
    if (!String(D.name || '').trim() && !D.make && !D.model) return say('Give it a name, or scan the nameplate.');
    var cat = D.category || 'other';
    var row = {
      name: String(D.name || '').trim() || [D.make, catName(cat)].filter(Boolean).join(' '), category: cat,
      make: String(D.make || '').trim(), model: String(D.model || '').trim(), serial: String(D.serial || '').trim().toUpperCase(),
      capacity: String(D.capacity || '').trim(), fuel: String(D.fuel || '').trim(), refrigerant: String(D.refrigerant || '').trim(), voltage: String(D.voltage || '').trim(),
      location: String(D.location || '').trim(), installed_on: D.installed_on || null, mfg_date: D.mfg_date || null,
      life_years: +D.life_years > 0 ? +D.life_years : catLife(cat), service_months: +D.service_months || 0,
      warranty_until: D.warranty_until || null, labor_warranty_until: D.labor_warranty_until || null,
      tags: D.tags, contact_id: D.contact_id || '', customer: String(D.customer || '').trim(), addr: String(D.addr || '').trim(), job_id: D.job_id || '',
      notes: String(D.notes || '').trim(), scan: D.scan || {}
    };
    btn.disabled = true; btn.textContent = 'Saving…';
    var ups = [];
    ups.push(D._plateBlob ? upload(D._plateBlob, 'nameplate', 'nameplate.jpg') : Promise.resolve(D.nameplate || ''));
    ups.push(D._photoBlob ? upload(D._photoBlob, 'photos', 'unit.jpg') : Promise.resolve(D.photo || ''));
    Promise.all(ups).then(function (refs) {
      row.nameplate = refs[0] || ''; row.photo = refs[1] || refs[0] || '';
      row.updated_at = new Date().toISOString();
      if (!live()) { var demo = Object.assign({ id: D.id || 'a' + Date.now() }, row); if (D.id) Object.assign(byId(D.id) || {}, row); else A.list.unshift(demo); return { data: [demo] }; }
      return D.id ? BP_SB.from('assets').update(row).eq('id', D.id).select() : BP_SB.from('assets').insert(row).select();
    }).then(function (r) {
      if (r && r.error) throw r.error;
      var saved = (r && r.data && r.data[0]) || null;
      if (saved) { var i = A.list.findIndex(function (x) { return x.id === saved.id; }); if (i > -1) A.list[i] = saved; else A.list.unshift(saved); }
      bpCloseModal(); toast(D.id ? 'Saved.' : 'Equipment added.', 'success');
      if (saved) remind(saved);
      var id = saved ? saved.id : D.id; D = null;
      if (A.onSaved) { var cb = A.onSaved; A.onSaved = null; cb(saved); return; }
      if (window._bpCurView === 'assets' && id) A.open(id); else if (id) A.open(id);
    }).catch(function (e) { btn.disabled = false; btn.textContent = D && D.id ? 'Save' : 'Add equipment'; say('Couldn’t save: ' + ((e && e.message) || 'try again')); });
  };
  A.remove = function () {
    var a = byId(D && D.id); if (!a || !confirm('Delete ' + (a.name || 'this equipment') + ' and its service history? This can’t be undone.')) return;
    Promise.resolve(live() ? BP_SB.from('assets').delete().eq('id', a.id) : null).then(function (r) {
      if (r && r.error) { toast('Couldn’t delete: ' + r.error.message, 'error'); return; }
      A.list = A.list.filter(function (x) { return x.id !== a.id; }); bpCloseModal(); D = null; A.back();
    });
  };
  /* the next service date goes on the customer in HighLevel, for the reminder workflow */
  function remind(a) {
    var x = facts(a);
    if (!x.next || !a.contact_id || !live() || !window.bpAuthApi) return;
    bpAuthApi(URL_FN(), { op: 'remind', contactId: a.contact_id, nextService: ymd(x.next) }).catch(function () {});
  }

  /* ================================================================
     Log a service visit
     ================================================================ */
  var S = null;
  A.service = function (id) {
    var a = byId(id || A.id); if (!a) return;
    var me = '';
    try { me = (window.bpCrewMe && bpCrewMe().employee && bpCrewMe().employee.name) || window._bpUserName || ''; } catch (e) {}
    S = { asset: a, at: ymd(new Date()), kind: 'maintenance', checklist: checksFor(a.category).map(function (t) { return { t: t, ok: false }; }), condition: '', summary: '', readings: '', blobs: [], by: me };
    var kinds = [['maintenance', 'Maintenance'], ['repair', 'Repair'], ['inspection', 'Inspection']];
    bpModal('<div class="eq-dlg"><h3>Service visit</h3><div class="bpx-sub">' + esc(a.name || catName(a.category)) + (a.customer ? ' · ' + esc(a.customer) : '') + '</div>'
      + '<div class="eq-g2"><label class="eq-f"><span>Date</span><input type="date" value="' + S.at + '" onchange="BPA.sf(\'at\',this.value)"></label>'
        + '<div class="eq-f"><span>Visit</span><div class="bpx-bulk-tabs eq-seg" id="eq-kinds">' + kinds.map(function (k) { return '<button type="button" class="' + (S.kind === k[0] ? 'on' : '') + '" onclick="BPA.skind(\'' + k[0] + '\',this)">' + k[1] + '</button>'; }).join('') + '</div></div></div>'
      + '<div class="eq-f"><span>Checklist</span><div class="eq-checks">' + S.checklist.map(function (k, i) { return '<label><input type="checkbox" onchange="BPA.scheck(' + i + ',this.checked)"><span>' + esc(k.t) + '</span></label>'; }).join('') + '</div></div>'
      + '<label class="eq-f"><span>Readings <small>optional</small></span><input placeholder="e.g. Suction 118 psi, superheat 10°F, 14.2 amps" oninput="BPA.sf(\'readings\',this.value)"></label>'
      + '<div class="eq-f"><span>Condition</span><div class="eq-conds">' + Object.keys(CONDS).map(function (k) { return '<label class="eq-cond c-' + k + '"><input type="radio" name="eqcond" value="' + k + '" onchange="BPA.sf(\'condition\',this.value)">' + CONDS[k][0] + '</label>'; }).join('') + '</div></div>'
      + '<label class="eq-f"><span>What was done</span><textarea rows="3" placeholder="Work done, parts used, anything the next tech should know" oninput="BPA.sf(\'summary\',this.value)"></textarea></label>'
      + '<label class="eq-f"><span>Photos <small>optional</small></span><input type="file" accept="image/*" multiple onchange="BPA.sphotos(this)"><em id="eq-sphmsg"></em></label>'
      + '<div class="bpx-mmsg" id="eq-smsg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" id="eq-ssave" onclick="BPA.ssave()">Save visit</button></div></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) mc.classList.add('eq-card');
  };
  A.sf = function (k, v) { if (S) S[k] = v; };
  A.skind = function (k, b) { if (!S) return; S.kind = k; Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.toggle('on', x === b); }); };
  A.scheck = function (i, on) { if (S && S.checklist[i]) S.checklist[i].ok = !!on; };
  A.sphotos = function (inp) {
    var fs = Array.prototype.slice.call(inp.files || []).slice(0, 8); if (!S) return;
    Promise.all(fs.map(function (f) { return shrink(f, 1600); })).then(function (os) { S.blobs = os.map(function (o) { return o.blob; }); var m = $('eq-sphmsg'); if (m) m.textContent = os.length + ' photo' + (os.length === 1 ? '' : 's') + ' ready.'; });
  };
  A.ssave = function () {
    if (!S) return;
    var btn = $('eq-ssave'), msg = $('eq-smsg'), a = S.asset;
    if (!S.summary.trim() && !S.checklist.some(function (k) { return k.ok; })) { msg.style.color = '#b91c1c'; msg.textContent = 'Tick what you checked, or write what was done.'; return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    Promise.all(S.blobs.map(function (b, i) { return upload(b, 'service', 'visit-' + (i + 1) + '.jpg'); })).then(function (refs) {
      var row = { asset_id: a.id, at: S.at || ymd(new Date()), kind: S.kind, summary: S.summary.trim(), checklist: S.checklist, readings: S.readings ? { text: S.readings.trim() } : {},
        photos: refs, condition: S.condition || '', by_name: S.by || '', job_id: a.job_id || '' };
      if (!live()) { row.id = 's' + Date.now(); return { data: [row] }; }
      return BP_SB.from('asset_services').insert(row).select();
    }).then(function (r) {
      if (r && r.error) throw r.error;
      var s = r && r.data && r.data[0];
      if (s) { (A.svc[a.id] = A.svc[a.id] || []).unshift(s); A.svc[a.id].sort(function (x, y) { return String(y.at).localeCompare(String(x.at)); }); }
      var at = s ? s.at : S.at; if (!a.last_service || String(at) > String(a.last_service)) a.last_service = at;
      a.updated_at = new Date().toISOString();
      bpCloseModal(); S = null; toast('Visit saved.', 'success'); remind(a);
      if (A.id === a.id) { A.tab = 'history'; drawRecord(); }
      if (A.onServiced) A.onServiced(a);
    }).catch(function (e) { btn.disabled = false; btn.textContent = 'Save visit'; msg.style.color = '#b91c1c'; msg.textContent = 'Couldn’t save: ' + ((e && e.message) || 'try again'); });
  };

  /* ================================================================
     Ask AI
     ================================================================ */
  var SUGGEST = ['Common problems with this model', 'Maintenance checklist for this unit', 'Is it worth repairing or replacing?', 'What should I check if it isn’t cooling or heating?'];
  A.ask = function () {
    var a = byId(A.id); if (!a) return;
    bpModal('<div class="eq-dlg eq-askd"><h3><span class="ms">auto_awesome</span>Ask AI</h3><div class="bpx-sub">About this ' + esc(a.name || catName(a.category)) + (a.model ? ' (' + esc(a.model) + ')' : '') + '</div>'
      + '<div class="eq-chat" id="eq-chat"></div>'
      + '<div class="eq-sugg" id="eq-sugg">' + SUGGEST.map(function (s) { return '<button class="eq-chip" onclick="BPA.askSend(this.textContent)">' + esc(s) + '</button>'; }).join('') + '</div>'
      + '<form class="eq-askf" onsubmit="event.preventDefault();BPA.askSend(this.q.value);this.q.value=\'\'"><input name="q" placeholder="Ask about faults, parts, specs or an error code" autocomplete="off"><button class="bpx-btn" aria-label="Ask"><span class="ms">send</span></button></form>'
      + '<p class="eq-fine">AI answers can be wrong. Check the manufacturer’s manual before you replace parts or work on gas or refrigerant.</p>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button></div></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) mc.classList.add('eq-card');
    drawChat();
  };
  function drawChat() {
    var el = $('eq-chat'); if (!el) return;
    el.innerHTML = A.chat.length ? A.chat.map(function (m) { return '<div class="eq-msg ' + m.role + '">' + (m.wait ? '<span class="eq-spin"></span>Thinking…' : esc(m.text).replace(/\n/g, '<br>')) + '</div>'; }).join('') : '<div class="eq-mut">Ask anything about this unit. The AI knows its make, model, age and service history.</div>';
    el.scrollTop = el.scrollHeight;
    var sg = $('eq-sugg'); if (sg) sg.style.display = A.chat.length ? 'none' : '';
  }
  A.askSend = function (q) {
    q = String(q || '').trim(); var a = byId(A.id); if (!q || !a) return;
    if (A.chat.some(function (m) { return m.wait; })) return;
    var x = facts(a), hist = (A.svc[a.id] || []).slice(0, 8).map(function (s) { return { at: s.at, kind: s.kind, summary: s.summary, condition: s.condition }; });
    var prior = A.chat.filter(function (m) { return !m.wait; }).map(function (m) { return { role: m.role === 'ai' ? 'model' : 'user', text: m.text }; });
    A.chat.push({ role: 'me', text: q }); A.chat.push({ role: 'ai', wait: true }); drawChat();
    var done = function (t) { A.chat = A.chat.filter(function (m) { return !m.wait; }); A.chat.push({ role: 'ai', text: t }); drawChat(); };
    if (!live() || !window.bpAuthApi) { done('Sign in to ask the AI about this unit.'); return; }
    bpAuthApi(URL_FN(), { op: 'ask', question: q, history: prior, asset: { name: a.name, category: catName(a.category), make: a.make, model: a.model, serial: a.serial, capacity: a.capacity, fuel: a.fuel,
      refrigerant: a.refrigerant, voltage: a.voltage, location: a.location, installed_on: a.installed_on, mfg_date: a.mfg_date, age: x.start ? since(x.start) : '', last_service: a.last_service, notes: a.notes, history: hist } })
      .then(function (r) { done(r && r.ok ? r.answer : ((r && (r.reason || r.error)) || 'No answer just now. Try again.')); }, function () { done('No connection. Try again.'); });
  };

  /* ================================================================
     Equipment inside a contact or a job (contact page, crew job sheet)
     ================================================================ */
  A.mount = function (el, o) {
    if (!el) return; o = o || {};
    el.innerHTML = '<div class="eq-load">Loading equipment…</div>';
    A.load().then(function () {
      var L = (A.list || []).filter(function (a) { return a.status !== 'removed' && ((o.contactId && a.contact_id === o.contactId) || (o.jobId && a.job_id === o.jobId)); });
      var args = JSON.stringify({ contactId: o.contactId || '', jobId: o.jobId || '', customer: o.name || '', addr: o.addr || '', tag: o.jobId ? 'installed' : '' }).replace(/"/g, '&quot;');
      el.innerHTML = '<div class="eq-mini">' + (L.length ? L.map(function (a) {
          var x = facts(a);
          return '<button class="eq-row sm" onclick="BPA.openFrom(\'' + a.id + '\')">' + thumb(a) + '<span class="eq-rt"><b>' + esc(a.name || catName(a.category)) + '</b><small>' + esc([a.make, a.model].filter(Boolean).join(' · ') || catName(a.category)) + (x.start ? ' · ' + since(x.start) + ' old' : '') + '</small></span>'
            + '<span class="eq-pill" style="color:' + x.svc.c + ';background:' + x.svc.c + '14">' + x.svc.t + '</span><span class="ms eq-chev">chevron_right</span></button>';
        }).join('') : '<p class="eq-mut">No equipment recorded' + (o.jobId ? ' on this job' : ' for this customer') + ' yet.</p>')
        + '<div class="eq-mini-acts"><button class="bpx-addbtn" onclick="BPA.addFrom(' + args + ',1)"><span class="ms">photo_camera</span>Scan a nameplate</button><button class="bpx-btn ghost" onclick="BPA.addFrom(' + args + ')">Add by hand</button></div></div>';
      paintRefs(el);
      A._mount = { el: el, o: o };
    });
  };
  A.addFrom = function (o, scan) {
    /* inside the crew's job sheet (a dialog) the add dialog takes its place, so the sheet comes back after */
    var inSheet = !!(A._mount && A._mount.el && A._mount.el.closest && A._mount.el.closest('.bpx-modal'));
    A.onSaved = function () {
      if (inSheet && o.jobId && window.bpCrewJob) { bpCrewJob(o.jobId); if (window.bpCrewJobTab) bpCrewJobTab('equip'); return; }
      if (A._mount && document.contains(A._mount.el)) A.mount(A._mount.el, A._mount.o);
    };
    A.add(Object.assign({}, o, { scan: !!scan, tag: o.tag || '' }));
  };
  A.openFrom = function (id) { if (window.bpNav) { A._pending = id; bpNav('assets'); } };

  /* ---------- the dashboard / AI brain can ask what's due ---------- */
  A.due = function () { return (A.list || []).filter(function (a) { var k = facts(a).svc.k; return k === 'over' || k === 'soon'; }); };
  A.facts = facts;
})();
