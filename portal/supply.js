/* ==================================================================
   Supply: the contractor's supply houses, their price books, parts lists
   built in the field, a sourcing engine (fastest vs cheapest), one-click
   split purchase orders with will-call barcodes, and invoice reconciliation
   that writes the expense onto the job in Finances.

   Data lives in four owner-scoped tables (see the supply migration) and is
   read directly through BP_SB under RLS. Without the SDK (the signed-out
   tour) an in-memory store with sample suppliers stands in.
   ================================================================== */
(function () {
  'use strict';
  var SP = window.SP = { sup: [], items: [], lists: [], pos: [], loaded: false, loading: false, err: '', tab: 'orders_open',
    list: null, plans: null, priority: 'fastest', q: '', cost: { stop: 60, min: 1.2 } };
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.bpEsc;
  var money = function (n) { n = +n || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var uid = function (p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var view = function (v) { return window._bpCurView === v; };
  var msg = function (id, t, bad) { var e = $(id); if (!e) return; e.textContent = t || ''; e.style.color = bad ? '#b3392f' : ''; };
  try { var c = JSON.parse(localStorage.getItem('bpSupplyCost') || 'null'); if (c) SP.cost = c; } catch (e) {}

  /* ---------- storage: Supabase when live, memory otherwise ---------- */
  var mem = { suppliers: [], supplier_items: [], parts_lists: [], purchase_orders: [] };
  var db = {
    all: function (t, order) {
      if (!live()) return Promise.resolve(mem[t].slice());
      var out = [], from = 0, page = 1000;
      var step = function () {
        var qy = window.BP_SB.from(t).select('*').range(from, from + page - 1);
        if (order) qy = qy.order(order, { ascending: false });
        return qy.then(function (r) {
          if (r.error) throw r.error;
          out = out.concat(r.data || []); from += page;
          return (r.data || []).length === page && from < 20000 ? step() : out;
        });
      };
      return step();
    },
    insert: function (t, row) {
      if (!live()) { row = Object.assign({ id: uid('m'), created_at: new Date().toISOString() }, row); mem[t].unshift(row); return Promise.resolve(row); }
      return window.bpSetUser().then(function (u) {
        if (!u) throw new Error('sign in required');
        row.owner = window.bpOwnerId ? bpOwnerId(u) : u.id;
        return window.BP_SB.from(t).insert(row).select('*').single().then(function (r) { if (r.error) throw r.error; return r.data; });
      });
    },
    update: function (t, id, patch) {
      if (!live()) { var r = mem[t].filter(function (x) { return x.id === id; })[0]; if (r) Object.assign(r, patch); return Promise.resolve(r); }
      return window.BP_SB.from(t).update(patch).eq('id', id).select('*').single().then(function (r) { if (r.error) throw r.error; return r.data; });
    },
    del: function (t, id) {
      if (!live()) { mem[t] = mem[t].filter(function (x) { return x.id !== id; }); if (t === 'suppliers') mem.supplier_items = mem.supplier_items.filter(function (x) { return x.supplier_id !== id; }); return Promise.resolve(); }
      return window.BP_SB.from(t).delete().eq('id', id).then(function (r) { if (r.error) throw r.error; });
    },
    upsertItems: function (rows) {
      if (!live()) {
        rows.forEach(function (r) {
          var ex = mem.supplier_items.filter(function (x) { return x.supplier_id === r.supplier_id && x.sku === r.sku; })[0];
          if (ex) Object.assign(ex, r); else mem.supplier_items.push(Object.assign({ id: uid('i') }, r));
        });
        return Promise.resolve(rows.length);
      }
      return window.bpSetUser().then(function (u) {
        if (!u) throw new Error('sign in required');
        var oid = window.bpOwnerId ? bpOwnerId(u) : u.id; rows.forEach(function (r) { r.owner = oid; });
        var i = 0, n = 0;
        var step = function () {
          if (i >= rows.length) return n;
          var chunk = rows.slice(i, i + 500); i += 500;
          return window.BP_SB.from('supplier_items').upsert(chunk, { onConflict: 'supplier_id,sku' }).then(function (r) { if (r.error) throw r.error; n += chunk.length; return step(); });
        };
        return step();
      });
    },
  };

  /* ---------- sample catalogs, one per trade ---------- */
  var CATALOG = {
    Roofing: [
      ['Architectural shingles, 3-bundle sq', 'bundle', 38.5, 'Shingles'], ['Synthetic underlayment, 10 sq roll', 'roll', 79, 'Underlayment'], ['Ice and water shield, 2 sq roll', 'roll', 92, 'Underlayment'],
      ['Ridge cap shingles, 20 lf bundle', 'bundle', 54, 'Shingles'], ['Starter strip, 100 lf', 'bundle', 41, 'Shingles'], ['Aluminum drip edge, 10 ft', 'ea', 8.4, 'Metal'],
      ['Roofing nails 1-1/4 in, 30 lb', 'box', 62, 'Fasteners'], ['Ridge vent, 4 ft', 'ea', 17.5, 'Ventilation'], ['Pipe boot flashing, 3 in', 'ea', 11.9, 'Flashing'],
      ['Step flashing 4x4x8, 100 ct', 'box', 44, 'Flashing'], ['Roof cement, 10 oz tube', 'ea', 5.6, 'Sealants'], ['Valley metal, 10 ft', 'ea', 24, 'Metal'],
    ],
    HVAC: [
      ['R-410A refrigerant, 25 lb', 'cyl', 265, 'Refrigerant'], ['Run capacitor 45/5 MFD', 'ea', 24, 'Electrical'], ['Contactor 2-pole 30A', 'ea', 19.5, 'Electrical'],
      ['Line set 3/4 x 3/8, 50 ft', 'ea', 189, 'Copper'], ['Smart thermostat', 'ea', 129, 'Controls'], ['Pleated filter 16x25x1, 12 pk', 'case', 48, 'Filters'],
      ['Condensate pump', 'ea', 62, 'Drainage'], ['Blower motor 1/2 HP', 'ea', 210, 'Motors'], ['Flex duct R8 8 in, 25 ft', 'ea', 54, 'Duct'],
      ['Duct tape foil, roll', 'ea', 9.8, 'Sealants'], ['Disconnect box 60A', 'ea', 27, 'Electrical'], ['Pad 36x36 in', 'ea', 68, 'Install'],
    ],
    Plumbing: [
      ['PEX-A 3/4 in, 100 ft', 'roll', 84, 'Pipe'], ['PEX-A 1/2 in, 100 ft', 'roll', 52, 'Pipe'], ['Expansion fitting 3/4 elbow, 10 pk', 'bag', 31, 'Fittings'],
      ['Water heater 50 gal gas', 'ea', 890, 'Equipment'], ['Ball valve 3/4 in', 'ea', 14.5, 'Valves'], ['P-trap 1-1/2 in PVC', 'ea', 6.2, 'Drainage'],
      ['Wax ring with flange', 'ea', 4.9, 'Fixtures'], ['Supply line 3/8 x 12 in braided', 'ea', 7.3, 'Fittings'], ['PVC 2 in sch 40, 10 ft', 'ea', 13.8, 'Pipe'],
      ['Solder lead-free, 1 lb', 'ea', 29, 'Sealants'], ['Pressure regulator 3/4 in', 'ea', 78, 'Valves'], ['Expansion tank 2 gal', 'ea', 46, 'Equipment'],
    ],
    Electrical: [
      ['Romex 12/2 NM-B, 250 ft', 'roll', 96, 'Wire'], ['Romex 14/2 NM-B, 250 ft', 'roll', 71, 'Wire'], ['Breaker 20A single pole', 'ea', 8.9, 'Breakers'],
      ['Breaker 50A double pole', 'ea', 22, 'Breakers'], ['Single gang box, 25 pk', 'box', 18, 'Boxes'], ['Duplex receptacle 20A TR, 10 pk', 'box', 31, 'Devices'],
      ['Decora switch, 10 pk', 'box', 27, 'Devices'], ['GFCI receptacle 20A', 'ea', 19.5, 'Devices'], ['EMT 3/4 in, 10 ft', 'ea', 9.4, 'Conduit'],
      ['Wire nuts assorted, 100 ct', 'box', 12, 'Connectors'], ['Panel 200A 40-space', 'ea', 240, 'Panels'], ['LED recessed 6 in, 6 pk', 'case', 58, 'Lighting'],
    ],
  };
  CATALOG.Painting = [['Interior paint eggshell, 5 gal', 'ea', 148, 'Paint'], ['Exterior paint satin, 5 gal', 'ea', 189, 'Paint'], ['Primer PVA, 5 gal', 'ea', 92, 'Paint'], ['Roller cover 9 in 3/8 nap, 6 pk', 'pk', 21, 'Tools'], ['Painter tape 1.5 in, 6 pk', 'pk', 34, 'Prep'], ['Drop cloth canvas 9x12', 'ea', 27, 'Prep'], ['Caulk paintable, 12 pk', 'case', 38, 'Sealants'], ['Sanding sponges, 12 pk', 'pk', 16, 'Prep'], ['Spray tip 517', 'ea', 29, 'Tools'], ['Joint compound, 4.5 gal', 'ea', 19, 'Prep']];
  CATALOG.Landscaping = [['Sod bermuda, pallet', 'pallet', 320, 'Turf'], ['Mulch hardwood, cu yd', 'yd', 42, 'Bulk'], ['Topsoil screened, cu yd', 'yd', 38, 'Bulk'], ['Paver 6x9 charcoal, sq ft', 'sqft', 4.1, 'Hardscape'], ['Edging steel 8 ft', 'ea', 24, 'Hardscape'], ['Drip tubing 1/2 in, 100 ft', 'roll', 22, 'Irrigation'], ['Sprinkler head 4 in pop-up, 25 pk', 'case', 68, 'Irrigation'], ['Landscape fabric 4x100 ft', 'roll', 44, 'Prep'], ['River rock 1 in, cu yd', 'yd', 110, 'Bulk'], ['Shrub 3 gal, boxwood', 'ea', 28, 'Plants']];
  CATALOG.Concrete = [['Ready mix 3000 psi, cu yd', 'yd', 165, 'Concrete'], ['Rebar #4 20 ft', 'ea', 14, 'Steel'], ['Wire mesh 6x6 sheet', 'ea', 11, 'Steel'], ['Form lumber 2x4x8', 'ea', 4.6, 'Forms'], ['Form stakes 24 in, 25 pk', 'bundle', 41, 'Forms'], ['Expansion joint 4 in x 50 ft', 'roll', 18, 'Joints'], ['Curing compound, 5 gal', 'ea', 79, 'Finish'], ['Sakrete 80 lb', 'bag', 7.2, 'Concrete'], ['Anchor bolt 1/2 x 10, 50 pk', 'box', 39, 'Hardware'], ['Vapor barrier 10 mil, 20x100', 'roll', 96, 'Prep']];
  function catalogFor(trade) {
    var t = String(trade || '').toLowerCase();
    var key = Object.keys(CATALOG).filter(function (k) { return t.indexOf(k.toLowerCase()) >= 0; })[0]
      || (t.indexOf('plumb') >= 0 ? 'Plumbing' : t.indexOf('electr') >= 0 ? 'Electrical' : t.indexOf('hvac') >= 0 || t.indexOf('air') >= 0 ? 'HVAC' : t.indexOf('paint') >= 0 ? 'Painting' : t.indexOf('land') >= 0 || t.indexOf('pool') >= 0 ? 'Landscaping' : t.indexOf('concrete') >= 0 ? 'Concrete' : 'Roofing');
    return CATALOG[key];
  }
  function sampleItems(supplier, seedShift) {
    var trade = ((window.bpSettingsGet && bpSettingsGet().company) || {}).trade || 'Roofing';
    var base = catalogFor(trade), pfx = (supplier.kind || 'sup').slice(0, 3).toUpperCase();
    return base.map(function (r, i) {
      var h = (i * 31 + seedShift * 17) % 100 / 100;                 /* deterministic per supplier */
      var price = Math.round(r[2] * (0.93 + h * 0.14) * 100) / 100;
      var stock = h < 0.1 ? 0 : h < 0.25 ? Math.floor(1 + h * 30) : Math.floor(20 + h * 300);
      return { supplier_id: supplier.id, sku: pfx + '-' + (1000 + i * 7 + seedShift), name: r[0], unit: r[1], category: r[3], price: price, list_price: Math.round(price * 1.28 * 100) / 100, stock: stock, stock_at: new Date().toISOString() };
    });
  }
  var SAMPLE_SUPPLIERS = [
    { name: 'ABC Supply', kind: 'abc', branch: 'North branch', drive_min: 9, tier: 'Contractor', account_no: '48210', will_call: true, delivery: true, delivery_fee: 75, delivery_min: 2500, hours: 'Mon to Fri 6:30a to 5p, Sat 7a to 12p' },
    { name: 'SRS Distribution', kind: 'srs', branch: 'East yard', drive_min: 16, tier: 'Pro', account_no: '7731', will_call: true, delivery: true, delivery_fee: 60, delivery_min: 1500, hours: 'Mon to Fri 6a to 5p' },
    { name: 'Home Depot Pro', kind: 'homedepot_pro', branch: 'South store', drive_min: 22, tier: 'Pro Xtra', account_no: '', will_call: true, delivery: false, delivery_fee: 0, delivery_min: 0, hours: 'Daily 6a to 10p' },
  ];

  /* ---------- load ---------- */
  function load(force) {
    if (SP.loading) return Promise.resolve();
    if (SP.loaded && !force) return Promise.resolve();
    SP.loading = true; SP.err = '';
    return Promise.all([db.all('suppliers'), db.all('supplier_items'), db.all('parts_lists', 'created_at'), db.all('purchase_orders', 'created_at')])
      .then(function (r) { SP.sup = r[0]; SP.items = r[1]; SP.lists = r[2]; SP.pos = r[3]; })
      .catch(function (e) { SP.err = 'Could not load Supply. ' + (e && e.message ? e.message : ''); })
      .then(function () { SP.loaded = true; SP.loading = false; redraw(); });
  }
  function redraw() {
    if (view('supply')) window.bpSupply();
    else if (view('supplyorders')) window.bpSupplyOrders();
    else if (view('suppliers')) window.bpSuppliers();
  }
  function supById(id) { return SP.sup.filter(function (s) { return s.id === id; })[0]; }
  function itemsOf(id) { return SP.items.filter(function (i) { return i.supplier_id === id; }); }
  function jobs() { try { return (window.bpJobsGet ? bpJobsGet() : []).filter(function (j) { return j.status !== 'done'; }); } catch (e) { return []; } }
  function kpis() {
    var open = SP.pos.filter(function (p) { return p.status === 'sent' || p.status === 'ready'; }).length;
    var unrec = SP.pos.filter(function (p) { return p.status === 'invoiced' || p.status === 'picked_up'; }).length;
    var t = function (l, v, blue) { return '<div class="bpx-stat"><div class="lbl">' + l + '</div><div class="val' + (blue ? ' blue' : '') + '">' + v + '</div></div>'; };
    var ex = SP.samples().length, mine = SP.sup.length - ex;
    return '<div class="bpx-stats">' + t('Places you buy', mine + (ex ? ' <small class="sp-ex">+' + ex + ' example</small>' : '')) + t('Prices we know', SP.items.length.toLocaleString()) + t('Ordered, not picked up', open, true) + t('Bills to check', unrec) + '</div>';
  }
  function tabs(active) {
    var t = [['supply', 'Order materials'], ['supplyorders', 'Orders'], ['suppliers', 'Where I buy']];
    return '<div class="bpx-jobtabs" style="margin-bottom:14px">' + t.map(function (x) { return '<button class="bpx-jt' + (x[0] === active ? ' on' : '') + '" onclick="bpNav(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div>';
  }
  /* The one line that makes the dependency visible: what we can price, and
     how to fix it. Every "why did it not find my item" question ends here. */
  function whereBar() {
    var mine = SP.sup.filter(function (s) { return !isSample(s); }), n = mine.length;
    if (!n) return '';
    var names = mine.slice(0, 3).map(function (s) { return esc(s.name); }).join(', ') + (n > 3 ? ' and ' + (n - 3) + ' more' : '');
    return '<div class="sp-where"><span>Prices from <b>' + names + '</b></span>'
      + '<span class="sp-where-a"><button class="bpx-linkbtn" onclick="SP.dirOpen()">Add supplier</button><button class="bpx-linkbtn" onclick="bpNav(\'suppliers\')">Where I buy</button></span></div>';
  }
  function state() {
    if (SP.err) return '<div class="sp-note bad"><span class=ms>error</span>' + esc(SP.err) + ' <button class="bpx-rowbtn" onclick="SP.reload()">Retry</button></div>';
    if (!live()) return '<div class="sp-note warn"><span class=ms>warning</span>These are example suppliers and made-up prices, so you can see how it works. Sign in to use your own.</div>';
    var ex = SP.samples();
    if (ex.length) return '<div class="sp-note warn"><span class=ms>science</span><b>' + ex.length + ' of these are examples, not your real suppliers.</b> Their prices are made up. Add a supply house you actually use, then clear these out. <button class="bpx-rowbtn" onclick="SP.clearSamples()">Remove the examples</button></div>';
    return '';
  }
  SP.reload = function () { SP.loaded = false; load(true); };
  function skel() { return '<div class="bpx-panel"><div class="bpx-skel" style="width:40%"></div><div class="bpx-skel"></div><div class="bpx-skel" style="width:70%"></div></div>'; }

  /* ================================================================
     SUPPLIERS
     ================================================================ */
  window.bpSuppliers = function () {
    if (!SP.loaded) { $('bpxViewArea').innerHTML = tabs('suppliers') + skel(); load(); return; }
    var h = tabs('suppliers') + state();
    h += '<div class="bpx-chead" style="margin-bottom:14px"><div class="bpx-mut" style="font-size:13px">' + (SP.sup.length ? SP.sup.length + (SP.sup.length === 1 ? ' supply house' : ' supply houses') : '') + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (SP.sup.length ? '' : '<button class="bpx-btn ghost sp-inline" onclick="SP.addSamples()">Add sample suppliers</button>') + '<button class="bpx-addbtn" onclick="SP.dirOpen()">+ Add supplier</button></div></div>';
    if (!SP.sup.length) h += firstRun();
    h += '<div class="sp-grid">' + SP.sup.map(supCard).join('') + '</div>';

    $('bpxViewArea').innerHTML = h;
  };
  function supCard(s) {
    var its = itemsOf(s.id), conn = s.connection || { type: 'pricebook' };
    var stocked = its.filter(function (i) { return i.stock != null; }).length;
    var latest = its.reduce(function (m, i) { return Math.max(m, Date.parse(i.stock_at || i.updated_at || 0) || 0); }, 0);
    var srcs = {}; its.forEach(function (i) { var k = i.source || 'manual'; srcs[k] = (srcs[k] || 0) + 1; });
    var learned = (srcs.invoice || 0) + (srcs.quote || 0);
    var connLine = conn.type === 'api'
      ? '<span class="bpx-badge">Live feed</span> ' + esc(conn.provider || '') + (conn.last_sync ? ', synced ' + ago(Date.parse(conn.last_sync)) : ', never synced')
      : (its.length ? '<b>' + its.length.toLocaleString() + ' prices</b>' + (latest ? '<span class="bpx-mut"> &middot; updated ' + ago(latest) + '</span>' : '') : '');
    return '<div class="bpx-panel sp-sup">'
      + '<div class="sp-sup-h"><div><b>' + esc(s.name) + '</b>' + (isSample(s) ? ' <span class="bpx-badge warn">Example</span>' : '') + '<span class="bpx-mut">' + esc([s.branch, s.address].filter(Boolean).join(', ')) + '</span></div>'
      + '<div class="sp-drive">' + (s.drive_min != null ? '<b>' + s.drive_min + '</b> min' : '<b>?</b> min') + '</div></div>'
      + '<div class="sp-sup-meta">' + connLine + (learned ? ' <span class="sp-learn"><span class="ms">auto_awesome</span>' + learned + ' from your paperwork</span>' : '') + '</div>'
      + '<div class="sp-sup-meta bpx-mut">' + [s.account_no ? 'Acct ' + esc(s.account_no) : '', s.will_call ? 'Will-call' : '', s.delivery ? 'Delivers' + (s.delivery_fee > 0 ? ' ' + money(s.delivery_fee) : ' free') : ''].filter(Boolean).join(' &middot; ') + '</div>'
      + (its.length ? '' : '<div class="bpx-mut sp-sup-empty">No prices yet. Ask for a quote, then photograph it.</div>')
      + '<div class="sp-sup-acts">'
      + (its.length
        ? '<button class="bpx-rowbtn primary" onclick="SP.scanOpen()">Photograph a bill</button><button class="bpx-rowbtn" onclick="SP.itemsOpen(\'' + s.id + '\')">See their prices</button>'
        : '<button class="bpx-rowbtn primary" onclick="SP.quoteAsk(\'' + s.id + '\')">Ask for their prices</button><button class="bpx-rowbtn" onclick="SP.scanOpen()">Photograph a bill</button>')
      + '</div><div class="sp-links">'
      + '<button class="bpx-linkbtn" onclick="SP.importOpen(\'' + s.id + '\')">Import a price file</button>'
      + (conn.type === 'api' ? '<button class="bpx-linkbtn" onclick="SP.sync(\'' + s.id + '\',this)">Sync stock</button>' : isSample(s) ? '<button class="bpx-linkbtn" onclick="SP.loadSample(\'' + s.id + '\')">' + (its.length ? 'Refresh example stock' : 'Load example prices') + '</button>' : '')
      + '<button class="bpx-linkbtn" onclick="SP.supOpen(\'' + s.id + '\')">Edit</button>'
      + '<button class="bpx-linkbtn sp-quiet-del" onclick="SP.supDel(\'' + s.id + '\')">Stop using them</button>'
      + '</div></div>';
  }
  function ago(ts) { if (!ts) return 'never'; var m = Math.round((Date.now() - ts) / 60000); if (m < 2) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + 'h ago'; var d = Math.round(h / 24); return d + 'd ago'; }

  /* Example suppliers carry a flag so they can always be told apart from the
     contractor's own, counted once, and removed in one go. */
  function isSample(s) { return !!(s && s.connection && s.connection.sample); }
  SP.samples = function () { return SP.sup.filter(isSample); };
  SP.addSamples = function () {
    /* adding them twice is how six suppliers appear where there are three */
    var have = {}; SP.samples().forEach(function (s) { have[String(s.name).toLowerCase()] = true; });
    var todo = SAMPLE_SUPPLIERS.filter(function (s) { return !have[s.name.toLowerCase()]; });
    if (!todo.length) { SP.reload(); return; }
    var seq = Promise.resolve();
    todo.forEach(function (s) {
      var k = SAMPLE_SUPPLIERS.indexOf(s);
      seq = seq.then(function () { return db.insert('suppliers', Object.assign({ connection: { type: 'pricebook', sample: true }, email: '' }, s)); })
        .then(function (row) { SP.sup.push(row); return db.upsertItems(sampleItems(row, k + 1)); });
    });
    seq.then(function () { SP.reload(); }).catch(function (e) { alert('Could not add the example suppliers. ' + (e.message || '')); });
  };
  SP.clearSamples = function () {
    var ex = SP.samples(); if (!ex.length) return;
    if (!confirm('Remove the ' + ex.length + ' example ' + (ex.length === 1 ? 'supplier' : 'suppliers') + ' and their prices? Anything you added yourself stays.')) return;
    var seq = Promise.resolve();
    ex.forEach(function (s) { seq = seq.then(function () { return db.del('suppliers', s.id); }); });
    seq.then(function () { SP.reload(); }).catch(function (e) { alert('Could not remove the examples. ' + (e.message || '')); });
  };
  SP.loadSample = function (id) {
    var s = supById(id); if (!s) return;
    db.upsertItems(sampleItems(s, SP.sup.indexOf(s) + 1)).then(function () { SP.reload(); }).catch(function (e) { alert('Could not load the sample catalog. ' + (e.message || '')); });
  };
  SP.supDel = function (id) {
    var s = supById(id); if (!s) return;
    if (!window.bpAskDel(s.name + ' and every price we learned from them')) return;
    db.del('suppliers', id).then(function () { SP.reload(); }).catch(function (e) { alert('Could not remove. ' + (e.message || '')); });
  };
  SP.supOpen = function (id) {
    var pre = !id && SP.dirPrefill ? SP.dirPrefill : null; SP.dirPrefill = null;
    var s = id ? supById(id) : (pre || { name: '', kind: 'custom', branch: '', address: '', drive_min: '', account_no: '', email: '', tier: '', hours: '', will_call: true, delivery: false, delivery_fee: 0, delivery_min: 0, connection: { type: 'pricebook' } });
    var conn = s.connection || { type: 'pricebook' };
    var kinds = [['abc', 'ABC Supply'], ['srs', 'SRS Distribution'], ['beacon', 'Beacon'], ['ferguson', 'Ferguson'], ['homedepot_pro', 'Home Depot Pro'], ['lowes_pro', 'Lowe\'s Pro'], ['winsupply', 'Winsupply'], ['ced', 'CED'], ['custom', 'Other']];
    var f = window.bpField;
    window.bpModal('<h3>' + (id ? 'Edit supplier' : pre ? 'Add ' + esc(pre.name) : 'Add a supplier') + '</h3><div class="bpx-sub">One entry per branch you buy from. Drive time is what the sourcing engine uses for "fastest".</div>'
      + (pre ? '<div class="sp-note"><span class="ms">lightbulb</span>' + esc(pre._hint) + '</div>' : '')
      + '<div class="sp-r2">' + f('sp-s-name', 'Name', s.name, 'ABC Supply') + '<div><label>Distributor</label><select id="sp-s-kind">' + kinds.map(function (k) { return '<option value="' + k[0] + '"' + (s.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></div></div>'
      + '<div class="sp-r2">' + f('sp-s-branch', 'Branch', s.branch, 'North branch') + f('sp-s-drive', 'Drive time from the shop, minutes', s.drive_min == null ? '' : s.drive_min, '12') + '</div>'
      + f('sp-s-addr', 'Address', s.address, '4120 Industrial Blvd')
      + '<div class="sp-r2">' + f('sp-s-acct', 'Account number', s.account_no, '48210') + f('sp-s-tier', 'Pricing tier', s.tier, 'Contractor') + '</div>'
      + '<div class="sp-r2">' + f('sp-s-email', 'Contractor desk email (where POs go)', s.email, 'prodesk@branch.com') + f('sp-s-hours', 'Hours', s.hours, 'Mon to Fri 6a to 5p') + '</div>'
      + '<div class="sp-r2"><label class="sp-check"><input type="checkbox" id="sp-s-wc"' + (s.will_call ? ' checked' : '') + '> Will-call pickup</label><label class="sp-check"><input type="checkbox" id="sp-s-del"' + (s.delivery ? ' checked' : '') + '> Delivers</label></div>'
      + '<div class="sp-r2">' + f('sp-s-fee', 'Delivery fee', s.delivery_fee || '', '75') + f('sp-s-min', 'Free delivery over', s.delivery_min || '', '2500') + '</div>'
      + '<label>Stock and pricing come from</label><select id="sp-s-conn" onchange="document.getElementById(\'sp-s-prov-w\').style.display=this.value===\'api\'?\'block\':\'none\'"><option value="pricebook"' + (conn.type !== 'api' ? ' selected' : '') + '>A price book I import (CSV) or type in</option><option value="api"' + (conn.type === 'api' ? ' selected' : '') + '>A live feed from the distributor (partner API)</option></select>'
      + '<div id="sp-s-prov-w" style="display:' + (conn.type === 'api' ? 'block' : 'none') + '">' + f('sp-s-prov', 'Feed provider key', conn.provider || 'demo', 'demo') + '<div class="bpx-mut" style="font-size:12px;margin-top:6px">Distributor feeds are partner-gated. "demo" is built in so you can see live stock refresh; real providers are added by BuilderPro once your distributor agreement exists.</div></div>'
      + '<div class="bpx-mmsg" id="sp-mmsg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" onclick="SP.supSave(' + (id ? '\'' + id + '\'' : 'null') + ')">' + (id ? 'Save' : 'Add supplier') + '</button></div>');
    document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '620px';
  };
  SP.supSave = function (id) {
    var v = function (i) { return ($( i) || {}).value || ''; };
    var name = v('sp-s-name').trim(); if (!name) { msg('sp-mmsg', 'Give the supplier a name.', true); return; }
    var connType = v('sp-s-conn'), prev = id ? (supById(id) || {}).connection || {} : {};
    var pre = SP.dirPrefill || {};
    var row = { name: name, kind: v('sp-s-kind') || 'custom', dir_id: (id ? (supById(id) || {}).dir_id : pre.dir_id) || '', branch: v('sp-s-branch').trim(), address: v('sp-s-addr').trim(), drive_min: v('sp-s-drive') === '' ? null : Math.max(0, parseInt(v('sp-s-drive'), 10) || 0),
      account_no: v('sp-s-acct').trim(), tier: v('sp-s-tier').trim(), email: v('sp-s-email').trim(), hours: v('sp-s-hours').trim(),
      will_call: !!($( 'sp-s-wc') || {}).checked, delivery: !!($( 'sp-s-del') || {}).checked, delivery_fee: +String(v('sp-s-fee')).replace(/[^0-9.]/g, '') || 0, delivery_min: +String(v('sp-s-min')).replace(/[^0-9.]/g, '') || 0,
      connection: connType === 'api' ? { type: 'api', provider: (v('sp-s-prov').trim() || 'demo'), last_sync: prev.last_sync || null } : { type: 'pricebook' } };
    (id ? db.update('suppliers', id, row) : db.insert('suppliers', row)).then(function () { window.bpCloseModal(); SP.reload(); }).catch(function (e) { msg('sp-mmsg', 'Could not save. ' + (e.message || ''), true); });
  };
  SP.sync = function (id, btn) {
    if (!live()) { SP.loadSample(id); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing'; }
    Promise.resolve(window.bpAuthApi(window.BP_URL + '/functions/v1/supply-sync', { op: 'sync', supplierId: id })).then(function (r) {
      if (!r || !r.ok) alert('Sync did not run. ' + ((r && (r.reason || r.error)) || 'The supply service did not answer.'));
      SP.reload();
    }).catch(function () { alert('Could not reach the supply service.'); if (btn) { btn.disabled = false; btn.textContent = 'Sync stock'; } });
  };
  SP.importOpen = function (id) {
    var s = supById(id); if (!s) return;
    window.bpModal('<h3>Import a price book</h3><div class="bpx-sub">' + esc(s.name) + '. Paste rows or choose a CSV your rep exported. Columns: <code>sku, name, price</code> required; <code>category, unit, list_price, stock</code> optional. Existing SKUs are updated.</div>'
      + '<input type="file" id="sp-imp-file" accept=".csv,text/csv" style="margin:6px 0 10px">'
      + '<label>Or paste</label><textarea id="sp-imp-text" style="width:100%;min-height:150px;font:12.5px ui-monospace,Menlo,monospace;padding:10px;border:1px solid var(--line);border-radius:10px" placeholder="sku,name,category,unit,price,list_price,stock\nABC-1001,Architectural shingles bundle,Shingles,bundle,38.50,49.99,240"></textarea>'
      + '<div class="bpx-mmsg" id="sp-mmsg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" onclick="SP.importRun(\'' + id + '\')">Import</button></div>');
    document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '620px';
    var fi = $('sp-imp-file'); if (fi) fi.onchange = function () { var f = fi.files && fi.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { $('sp-imp-text').value = String(rd.result || ''); }; rd.readAsText(f); };
  };
  function parseCsv(text) {
    var rows = [], row = [], cell = '', inq = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inq) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inq = false; } else cell += ch; }
      else if (ch === '"') inq = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }
  SP.importRun = function (id) {
    var rows = parseCsv(($('sp-imp-text') || {}).value || '');
    if (rows.length < 2) { msg('sp-mmsg', 'Nothing to import yet. Paste rows with a header line first.', true); return; }
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase().replace(/\s+/g, '_'); });
    var col = function (n) { var i = head.indexOf(n); return i < 0 ? -1 : i; };
    var iS = col('sku'), iN = col('name') >= 0 ? col('name') : col('description'), iP = col('price') >= 0 ? col('price') : col('contractor_price');
    if (iS < 0 || iN < 0 || iP < 0) { msg('sp-mmsg', 'The header needs sku, name and price columns.', true); return; }
    var iC = col('category'), iU = col('unit'), iL = col('list_price'), iK = col('stock');
    var now = new Date().toISOString(), out = [];
    rows.slice(1).forEach(function (r) {
      var sku = String(r[iS] || '').trim(), name = String(r[iN] || '').trim(); if (!sku || !name) return;
      var stock = iK >= 0 && String(r[iK]).trim() !== '' ? parseInt(String(r[iK]).replace(/[^0-9-]/g, ''), 10) : null;
      out.push({ supplier_id: id, sku: sku, name: name, category: iC >= 0 ? String(r[iC] || '').trim() : '', unit: iU >= 0 ? (String(r[iU] || '').trim() || 'ea') : 'ea',
        price: +String(r[iP]).replace(/[^0-9.]/g, '') || 0, list_price: iL >= 0 && String(r[iL]).trim() !== '' ? +String(r[iL]).replace(/[^0-9.]/g, '') || null : null, stock: isNaN(stock) ? null : stock, stock_at: stock == null ? null : now });
    });
    if (!out.length) { msg('sp-mmsg', 'No valid rows found.', true); return; }
    msg('sp-mmsg', 'Importing ' + out.length + ' items');
    db.upsertItems(out).then(function (n) { window.bpCloseModal(); SP.reload(); }).catch(function (e) { msg('sp-mmsg', 'Import failed. ' + (e.message || ''), true); });
  };
  SP.itemsOpen = function (id) {
    var s = supById(id); if (!s) return;
    var its = itemsOf(id).slice().sort(function (a, b) { return (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name); });
    window.bpModal('<h3>' + esc(s.name) + ' price book</h3><div class="bpx-sub">' + its.length + ' items. Your price, the shelf price, and stock where the supplier shares it.</div>'
      + '<div class="bpx-cwrap" style="max-height:52vh;overflow:auto"><table class="bpx-ctable"><thead><tr><th>SKU</th><th>Item</th><th class="bpx-r">Your price</th><th class="bpx-r">List</th><th class="bpx-r">Stock</th></tr></thead><tbody>'
      + (its.length ? its.map(function (i) { return '<tr><td class="bpx-mut">' + esc(i.sku) + '</td><td>' + esc(i.name) + ' <span class="bpx-mut">/ ' + esc(i.unit || 'ea') + '</span></td><td class="bpx-r bpx-num">' + money(i.price) + '</td><td class="bpx-r bpx-mut">' + (i.list_price ? money(i.list_price) : '') + '</td><td class="bpx-r">' + stockBadge(i) + '</td></tr>'; }).join('') : '<tr><td colspan=5 class="bpx-empty2">Empty. Import a price book or load the sample catalog.</td></tr>')
      + '</tbody></table></div><div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button></div>');
    document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '760px';
  };
  function stockBadge(i, need) {
    var age = i.stock_at ? Math.floor((Date.now() - Date.parse(i.stock_at)) / 86400000) : null;
    var stale = age != null && age >= 2;
    var when = age == null ? '' : ' <em>' + (age <= 0 ? 'today' : age === 1 ? 'yesterday' : age + 'd old') + '</em>';
    if (i.stock == null) return '<span class="sp-stk unk" title="No count on file. Call the branch or scan a counter receipt.">no count</span>';
    if (i.stock <= 0) return '<span class="sp-stk out" title="Last counted ' + esc(String(age)) + ' days ago">out' + when + '</span>';
    var cls = (need && i.stock < need) || i.stock < 10 ? 'low' : 'ok';
    var txt = need && i.stock < need ? i.stock + ' of ' + need : i.stock < 10 ? i.stock + ' left' : i.stock + ' in stock';
    return '<span class="sp-stk ' + cls + (stale ? ' stale' : '') + '">' + txt + when + '</span>';
  }

  /* ================================================================
     SOURCING
     ================================================================ */
  /* The cold start used to be a wall: no suppliers meant no price book,
     no price book meant nothing to search, so the first thing a contractor
     met was a chore. The catalog removed that — searching works before
     anyone has added anything — so this is now a banner over a working
     page rather than a gate in front of a dead one. */
  function firstRun() {
    return '<div class="sp-firstrun">'
      + '<div class="sp-firstrun-t"><span class="ms">storefront</span>'
        + '<div><b>You can order from the catalog right now.</b>'
        + '<span>Search any material below and we will tell you which chains stock it. Add the supply house you actually use and your own negotiated prices replace the ballparks everywhere.</span></div></div>'
      + '<div class="sp-firstrun-b">'
        + '<button class="bpx-btn sp-inline" onclick="SP.dirOpen()">Add a supplier</button>'
        + '<button class="bpx-linkbtn" onclick="SP.scanOpen()">I have a bill to photograph</button>'
        + '<button class="bpx-linkbtn" onclick="SP.addSamples()">Look around with example data</button>'
      + '</div></div>';
  }
  window.bpSupply = function () {
    if (!SP.loaded) { $('bpxViewArea').innerHTML = tabs('supply') + skel(); load(); return; }
    var L = SP.list;
    var h = tabs('supply') + state();
    if (!SP.sup.length) h += firstRun();
    h += whereBar();
    /* list picker + builder */
    var open = SP.lists.filter(function (l) { return l.status === 'draft' || l.status === 'sourced'; });
    h += '<div class="sp-two"><div class="bpx-panel">'
      + '<div class="bpx-chead"><div class="bpx-ptitle" style="margin:0">What the job needs<span class="lg2">search any material, or pick the whole job</span></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + (open.length ? '<select id="sp-list-pick" onchange="SP.pick(this.value)" class="sp-sel"><option value="">Open a list you started</option>' + open.map(function (l) { return '<option value="' + l.id + '"' + (L && L.id === l.id ? ' selected' : '') + '>' + esc(l.name) + (l.job_name ? ' (' + esc(l.job_name) + ')' : '') + '</option>'; }).join('') + '</select>' : '') + (L ? '<button class="bpx-addbtn" onclick="SP.kitOpen()">+ Pick the job</button>' : '') + '</div></div>';
    if (!L) h += '<div class="sp-kitcue"><span class="ms">auto_awesome_motion</span><div><b>Pick the job, put in the size.</b><span class="bpx-mut">Say "re-roof, 25 squares" and the shingles, underlayment, starter, ridge cap, drip edge and nails fill in at the right counts. Change any line before you order.</span></div><div class="sp-kitcue-b"><button class="bpx-btn sp-inline" onclick="SP.kitOpen()">Pick the job</button><button class="bpx-linkbtn" onclick="SP.newList(true)">or type it myself</button></div></div>';
    else {
      var js = jobs();
      h += '<div class="sp-r2" style="margin-top:12px"><div><label>List name</label><input id="sp-l-name" value="' + esc(L.name) + '" onchange="SP.listMeta()"></div><div><label>Job</label><select id="sp-l-job" onchange="SP.listMeta()"><option value="">No job (overhead)</option>' + js.map(function (j) { return '<option value="' + j.id + '"' + (L.job_id === j.id ? ' selected' : '') + '>' + esc(j.name + (j.title ? ', ' + j.title : '')) + '</option>'; }).join('') + '</select></div></div>'
        + pickerHtml()
        + '<div id="sp-items">' + itemsHtml() + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center"><button class="bpx-rowbtn" onclick="SP.itemAdd()">+ Type one in</button><button class="bpx-rowbtn" onclick="SP.kitSaveOpen()">Save as a kit</button></div>'
        + '<div class="sp-prio"><span class="bpx-mut">What matters today</span><div class="bpx-jobtabs"><button class="bpx-jt' + (SP.priority === 'fastest' ? ' on' : '') + '" onclick="SP.setPrio(\'fastest\')">Getting it today</button><button class="bpx-jt' + (SP.priority === 'cheapest' ? ' on' : '') + '" onclick="SP.setPrio(\'cheapest\')">Paying less</button></div>'
        + '<button class="bpx-btn sp-inline" onclick="SP.run()">Where do I buy this</button></div>'
        + '<div class="bpx-mut" style="font-size:12px;margin-top:8px">A second stop is not free, so we count what a trip costs you: ' + money(SP.cost.stop) + ' a stop plus ' + money(SP.cost.min) + ' a minute of driving. <a href="#" onclick="SP.costOpen();return false" style="color:var(--blue)">Change</a></div>';
    }
    h += '</div><div>' + plansHtml() + '</div></div>';
    $('bpxViewArea').innerHTML = h;
  };
  function uniqNames() { var seen = {}, out = []; SP.items.forEach(function (i) { var k = i.name.toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(i.name); } }); return out.sort(); }
  SP.pick = function (id) { SP.list = SP.lists.filter(function (l) { return l.id === id; })[0] || null; SP.plans = null; if (SP.list) SP.priority = SP.list.priority || 'fastest'; window.bpSupply(); };
  SP.newList = function () {
    window.bpCloseModal();
    var js = jobs(), j = js[0];
    db.insert('parts_lists', { name: 'Parts for ' + (j ? j.name : 'the next job'), job_id: j ? j.id : '', job_name: j ? j.name : '', priority: SP.priority, status: 'draft', items: [] })
      .then(function (row) { SP.lists.unshift(row); SP.list = row; SP.plans = null; window.bpSupply(); var f = document.getElementById('sp-pk-q'); if (f) f.focus(); })
      .catch(function (e) { alert('Could not start a list. ' + (e.message || '')); });
  };
  var saveT = null;
  function saveList() { var L = SP.list; if (!L) return; clearTimeout(saveT); saveT = setTimeout(function () { db.update('parts_lists', L.id, { name: L.name, job_id: L.job_id || '', job_name: L.job_name || '', priority: SP.priority, items: L.items }).catch(function () {}); }, 500); }
  SP.listMeta = function () { var L = SP.list; if (!L) return; L.name = ($('sp-l-name') || {}).value || L.name; var jid = ($('sp-l-job') || {}).value || ''; L.job_id = jid; var j = jobs().filter(function (x) { return x.id === jid; })[0]; L.job_name = j ? j.name : ''; saveList(); };
  SP.itemEdit = function (k, f, v) { var it = (SP.list.items || [])[k]; if (!it) return; it[f] = f === 'qty' ? (+String(v).replace(/[^0-9.]/g, '') || 0) : v; SP.plans = null; saveList(); };
  /* Typing one in is still here, for the thing no price book has a row for.
     Both of these redraw the list alone, so whatever is in the search box
     survives — the two halves are used together. */
  SP.itemAdd = function () { SP.list.items = SP.list.items || []; SP.list.items.push({ key: uid('k'), name: '', qty: 1, unit: 'ea' }); saveList(); pickRedraw(); var ins = document.querySelectorAll('.sp-item:not(.sp-head) input'); if (ins.length) ins[ins.length - 3].focus(); };
  SP.itemDel = function (k) { SP.list.items.splice(k, 1); SP.plans = null; saveList(); pickRedraw(); };
  SP.setPrio = function (p) { SP.priority = p; if (SP.list) { SP.list.priority = p; saveList(); } window.bpSupply(); };
  SP.costOpen = function () {
    window.bpModal('<h3>What a trip to the supply house costs you</h3><div class="bpx-sub">Used by "cheapest" so a $6 saving never sends a tech across town.</div><div class="sp-r2">' + window.bpField('sp-c-stop', 'Per stop (loading, counter, paperwork)', SP.cost.stop, '60') + window.bpField('sp-c-min', 'Per minute of driving (truck + tech)', SP.cost.min, '1.20') + '</div><div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" onclick="SP.costSave()">Save</button></div>');
  };
  SP.costSave = function () { SP.cost = { stop: +String(($('sp-c-stop') || {}).value).replace(/[^0-9.]/g, '') || 0, min: +String(($('sp-c-min') || {}).value).replace(/[^0-9.]/g, '') || 0 }; try { localStorage.setItem('bpSupplyCost', JSON.stringify(SP.cost)); } catch (e) {} window.bpCloseModal(); SP.plans = null; window.bpSupply(); };

  /* ================================================================
     WHAT A MATERIAL LOOKS LIKE

     A picker you search is only usable if the eye can skip most of it, and
     that means every line needs a picture. Real photographs are out: nothing
     in supplier_items carries an image, there is no catalogue feed behind a
     scanned price book, and buying art for every category of every trade we
     support costs more than it is worth. So these are drawn here — line
     icons, one per category, in currentColor, which cost nothing and extend
     to whatever trade gets added next.

     Categories come from the price book itself (`supplier_items.category`).
     A book scanned off a paper invoice usually has none, so when it is
     missing the item's own name is read instead — see catOf().
     ================================================================ */
  var I = {                                     /* inner SVG, 24x24, stroke currentColor */
    /* roofing */
    Shingles:    '<path d="M3 20V9l9-5 9 5v11z"/><path d="M3 13h18M3 16.5h18"/><path d="M7.5 9v4M12 9v4M16.5 9v4M5.2 13v3.5M9.7 13v3.5M14.3 13v3.5M18.8 13v3.5"/>',
    Underlayment:'<ellipse cx="7" cy="9" rx="4" ry="5"/><path d="M7 4h7v10H7"/><path d="M14 14c3 0 3 4 7 4"/><path d="M3 18h18"/>',
    Metal:       '<path d="M3 17V8l6-3v9zM9 14h12v3H9z"/>',
    Fasteners:   '<path d="M8 4h8l-3 3v10l-1 3-1-3V7z"/><path d="M8 4h8"/>',
    Ventilation: '<rect x="3" y="7" width="13" height="11" rx="1.5"/><path d="M6 10h7M6 13h7M6 16h7M18 9c2 1 2 2 0 3M20.5 8c3 1.5 3 4.5 0 6"/>',
    Flashing:    '<path d="M5 3v18M5 8h7v10"/><path d="M12 8l5-3v10l-5 3"/>',
    Sealants:    '<rect x="6" y="9" width="9" height="12" rx="1.5"/><path d="M15 11l4-4 1.5 1.5-4 4z"/><path d="M8.5 13h4"/>',
    /* hvac */
    Refrigerant: '<rect x="7" y="6" width="10" height="15" rx="3"/><path d="M10 6V4h4v2M12 10v7"/>',
    Electrical:  '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    Copper:      '<rect x="3" y="5" width="18" height="5" rx="2.5"/><rect x="3" y="14" width="18" height="5" rx="2.5"/><path d="M9 5v5M15 14v5"/>',
    Controls:    '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    Filters:     '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 5l-2 14M11 5L9 19M15 5l-2 14M19 5l-2 14"/>',
    Drainage:    '<path d="M7 3v10a4 4 0 0 0 8 0v-3"/><path d="M15 10h5"/><path d="M5 3h4"/><path d="M18 8v4"/>',
    Motors:      '<circle cx="12" cy="12" r="3"/><path d="M12 9c0-4 1-6 3-6s2 3-1 5M15 12c4 0 6 1 6 3s-3 2-5-1M12 15c0 4-1 6-3 6s-2-3 1-5M9 12c-4 0-6-1-6-3s3-2 5 1"/>',
    Duct:        '<path d="M3 8c2-2 3 2 5 0s3 2 5 0 3 2 5 0 2 0 3-1M3 16c2-2 3 2 5 0s3 2 5 0 3 2 5 0 2 0 3-1"/><path d="M3 8v8M21 7v8"/>',
    Install:     '<rect x="3" y="16" width="18" height="4" rx="1"/><rect x="7" y="5" width="10" height="11" rx="1.5"/><circle cx="12" cy="10" r="3"/>',
    /* plumbing */
    Pipe:        '<path d="M2 9h20M2 15h20"/><rect x="6" y="7" width="3" height="10" rx="1"/><rect x="15" y="7" width="3" height="10" rx="1"/>',
    Fittings:    '<path d="M4 8h9a7 7 0 0 1 7 7v5"/><path d="M4 5v6M17 20h6"/>',
    Equipment:   '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M9 8h6M12 13v5M10 21h4"/>',
    Valves:      '<path d="M4 9v6l8-3zM20 9v6l-8-3z"/><path d="M12 12V6M9 5h6"/>',
    Fixtures:    '<path d="M4 21h16"/><path d="M9 21v-5h6v5"/><path d="M12 16v-5a3 3 0 0 1 3-3h2"/><path d="M17 5v6M15 5h4"/>',
    /* electrical */
    Wire:        '<path d="M20 12a8 8 0 1 0-8 8h8"/><path d="M16 12a4 4 0 1 0-4 4h4"/>',
    Breakers:    '<rect x="6" y="3" width="12" height="18" rx="2"/><rect x="9" y="7" width="6" height="5" rx="1"/><path d="M9 16h6"/>',
    Boxes:       '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9h16M9 4v5M15 4v5"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>',
    Devices:     '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="8" r="2.5"/><circle cx="12" cy="16" r="2.5"/><path d="M12 6.5v3M12 14.5v3"/>',
    Conduit:     '<path d="M3 7h18M3 13h18"/><path d="M7 5v4M17 11v4"/><path d="M6 7v6M18 7v6"/>',
    Connectors:  '<path d="M9 21V9l3-6 3 6v12z"/><path d="M9 12h6M9 16h6"/>',
    Panels:      '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h3M13 7h3M8 11h3M13 11h3M8 15h3M13 15h3"/>',
    Lighting:    '<path d="M9 18h6M10 21h4"/><path d="M12 2a6 6 0 0 0-4 10.5c.7.8 1 1.6 1 2.5h6c0-.9.3-1.7 1-2.5A6 6 0 0 0 12 2z"/>',
    /* painting */
    Paint:       '<path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M5 8l2-4h10l2 4"/><path d="M9 4V2h6v2"/>',
    Tools:       '<rect x="4" y="4" width="14" height="5" rx="1.5"/><path d="M18 6.5h2v3h-9"/><path d="M11 9.5v3M9.5 12.5h3V21h-3z"/>',
    Prep:        '<circle cx="10" cy="14" r="7"/><circle cx="10" cy="14" r="2.5"/><path d="M15 9l6-5"/>',
    /* landscaping */
    Turf:        '<path d="M4 20c0-5 2-8 4-9M9 20c0-6 1-9 3-11M14 20c0-5 2-8 4-9M6.5 20c0-4 .5-6 1.5-7M11.5 20c0-4 .5-6 1.5-7M16.5 20c0-4 .5-6 1.5-7"/><path d="M2 20h20"/>',
    Bulk:        '<path d="M2 19h20L15 7h-6z"/><path d="M9 13h6"/>',
    Hardscape:   '<path d="M2 8h20v9H2z"/><path d="M2 12.5h20M8 8v4.5M15 8v4.5M5 12.5V17M11.5 12.5V17M18 12.5V17"/>',
    Irrigation:  '<path d="M12 21v-8"/><path d="M9 13h6"/><path d="M8 9a5 5 0 0 1 8 0M5 6a9 9 0 0 1 14 0"/>',
    Plants:      '<path d="M12 21v-7"/><path d="M12 14c0-4-2-6-5-6 0 4 2 6 5 6zM12 14c0-4 2-6 5-6 0 4-2 6-5 6z"/><path d="M8 21h8"/>',
    /* concrete */
    Concrete:    '<path d="M7 7c0-2 1-3 5-3s5 1 5 3v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M7 7h10M10 11h4"/>',
    Steel:       '<path d="M5 20 19 4"/><path d="M7 13l2 2M10 9.5l2 2M13 6l2 2M4 16.5l2 2M16 2.5l2 2"/>',
    Forms:       '<path d="M4 6h13v3H4zM4 6v14"/><path d="M17 9v8M20 12l-3 2"/>',
    Joints:      '<path d="M3 6h8v12H3zM13 6h8v12h-8z"/><path d="M12 4v16"/>',
    Finish:      '<path d="M3 13h13l2 3H5z"/><path d="M11 13V9h3v4"/><path d="M12.5 9V6"/>',
    Hardware:    '<path d="m9 4 3-2 3 2v3h-6z"/><path d="M11 7v11l1 3 1-3V7"/><path d="M10 11h4M10 14h4"/>',
    Other:       '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M12 7V4"/>',
  };

  /* A quiet colour per family, so the eye groups the results before it reads
     them. Chips only — never the sole carrier of meaning, the name is beside it. */
  var FAM = {
    roof:  ['Shingles', 'Underlayment', 'Metal', 'Fasteners', 'Ventilation', 'Flashing'],
    hvac:  ['Refrigerant', 'Copper', 'Controls', 'Filters', 'Motors', 'Duct', 'Install'],
    plumb: ['Pipe', 'Fittings', 'Equipment', 'Valves', 'Fixtures', 'Drainage'],
    elec:  ['Electrical', 'Wire', 'Breakers', 'Boxes', 'Devices', 'Conduit', 'Connectors', 'Panels', 'Lighting'],
    paint: ['Paint', 'Tools', 'Prep', 'Sealants'],
    land:  ['Turf', 'Bulk', 'Hardscape', 'Irrigation', 'Plants'],
    conc:  ['Concrete', 'Steel', 'Forms', 'Joints', 'Finish', 'Hardware'],
  };
  var FAM_OF = {}; Object.keys(FAM).forEach(function (f) { FAM[f].forEach(function (c) { FAM_OF[c] = f; }); });

  /* Scanned price books often have no category column at all, so the name is
     the fallback evidence.

     THE ORDER IS THE ALGORITHM: the first hit wins, so a phrase always sits
     above the word it contains. "Roofing nails" has to be read as Fasteners
     before Hardware sees "nail"; "drip edge" as Metal before Irrigation sees
     "drip"; "wire mesh" as Steel before Wire sees "wire"; "P-trap ... PVC" as
     Drainage before Pipe sees "pvc". Trailing spaces are load-bearing too —
     'tub ' so a tube of roof cement is not a bathtub. Reordering these rows
     changes what they classify; the harness in scratchpad/cat.js checks every
     sample item against the category its own catalog row declares. */
  var NAME_CAT = [
    /* phrases that would otherwise be eaten by a more general row below */
    ['Sealants', ['caulk', 'sealant', 'silicone', 'roof cement', 'solder', 'flux', 'adhesive', 'foil tape', 'duct tape']],
    ['Shingles', ['shingle', 'ridge cap', 'starter strip']],
    ['Underlayment', ['underlayment', 'ice and water', 'felt', 'synthetic roll']],
    ['Flashing', ['flashing', 'pipe boot', 'step flash', 'counterflash']],
    ['Ventilation', ['ridge vent', 'soffit vent', 'turbine', 'louver', 'exhaust vent']],
    ['Metal', ['drip edge', 'valley metal', 'coil stock', 'gutter', 'downspout']],
    ['Fasteners', ['roofing nail', 'staple', 'cap nail']],
    /* hvac */
    ['Refrigerant', ['refrigerant', 'r-410', 'r410', 'r-22', 'freon']],
    ['Filters', ['filter', 'pleated', 'merv']],
    ['Motors', ['blower', 'motor', 'fan blade', 'compressor']],
    ['Controls', ['thermostat', 'control board', 'sensor', 'zone panel']],
    ['Copper', ['line set', 'copper tube', 'copper pipe', 'copper coil']],
    ['Install', ['pad ', 'mount', 'stand', 'curb']],
    ['Duct', ['duct', 'plenum', 'register', 'grille']],
    /* painting: Prep above Paint, or painter's tape is read as paint */
    /* not a bare 'fabric': it catches "cricket, fabricated" */
    ['Prep', ['tape', 'drop cloth', 'sand', 'joint compound', 'landscape fabric', 'filter fabric', 'vapor barrier', 'plastic sheeting']],
    ['Paint', ['paint', 'primer', 'stain', 'lacquer', 'enamel']],
    ['Tools', ['roller', 'brush', 'spray tip', 'blade', 'knife', 'trowel', 'bucket']],
    /* electrical: the specific device above the material it is made of */
    ['Breakers', ['breaker', 'fuse']],
    ['Panels', ['load center', 'panel', 'meter base']],
    ['Devices', ['receptacle', 'gfci', 'switch', 'decora', 'outlet', 'dimmer']],
    ['Boxes', ['gang box', 'junction box', 'device box', 'old work box']],
    ['Connectors', ['wire nut', 'connector', 'lug', 'crimp', 'butt splice']],
    ['Conduit', ['emt', 'conduit', 'rigid', 'liquidtight', 'strut']],
    ['Lighting', ['light', 'led', 'recessed', 'bulb', 'lamp']],
    ['Electrical', ['capacitor', 'contactor', 'disconnect', 'transformer', 'relay']],
    /* landscaping sits above Steel and Pipe: "edging steel", "drip tubing" */
    ['Turf', ['sod', 'seed', 'turf', 'fescue', 'bermuda']],
    ['Plants', ['shrub', 'tree', 'plant', 'boxwood', 'perennial']],
    ['Hardscape', ['paver', 'edging', 'retaining', 'flagstone', 'block wall']],
    ['Irrigation', ['sprinkler', 'drip', 'emitter', 'irrigation', 'rotor']],
    ['Steel', ['rebar', 'wire mesh', 'steel', 'angle iron', 'channel']],
    ['Wire', ['romex', 'nm-b', 'thhn', 'wire', 'cable']],
    /* plumbing: what it does above what it is made of */
    ['Drainage', ['p-trap', 'trap ', 'drain', 'condensate', 'sump', 'cleanout']],
    ['Valves', ['valve', 'regulator', 'backflow', 'hose bibb']],
    ['Fittings', ['fitting', 'elbow', 'coupling', 'tee ', 'union', 'nipple', 'supply line', 'adapter']],
    ['Pipe', ['pex', 'pvc', 'cpvc', 'abs', 'pipe', 'tubing']],
    ['Fixtures', ['toilet', 'sink', 'faucet', 'wax ring', 'shower', 'bathtub', 'tub ', 'vanity']],
    ['Equipment', ['water heater', 'expansion tank', 'pump', 'furnace', 'condenser', 'air handler']],
    /* concrete: the mix above the yardage, Forms above the generic hardware */
    ['Concrete', ['ready mix', 'sakrete', 'quikrete', 'concrete', 'cement', 'mortar', 'grout']],
    ['Forms', ['form ', 'stake', 'snap tie', 'formwork']],
    ['Joints', ['expansion joint', 'control joint', 'backer rod']],
    ['Finish', ['curing compound', 'hardener', 'densifier', 'sealer']],
    ['Bulk', ['mulch', 'topsoil', 'gravel', 'river rock', 'cu yd', 'pallet']],
    /* last, because almost everything is fastened to something */
    ['Hardware', ['anchor', 'bolt', 'screw', 'nail', 'washer', 'bracket', 'hanger', 'strap']],
  ];

  /* The category of an item, however little the price book gave us. */
  function catOf(item) {
    if (!item) return 'Other';
    var c = String(item.category || '').trim();
    if (c) {
      if (I[c]) return c;                                   /* a name we already draw */
      var lc = c.toLowerCase();
      var hit = Object.keys(I).filter(function (k) { return k.toLowerCase() === lc; })[0];
      if (hit) return hit;
      /* someone else's wording for a category we know: "Pipe & Tube",
         "Rough Hardware", "ELECTRICAL MATERIAL". Our own names are tried
         first so "Rough Hardware" does not get read as a nail. */
      var own = Object.keys(I).filter(function (k) { return lc.indexOf(k.toLowerCase()) >= 0; })
        .sort(function (a, b) { return b.length - a.length; })[0];
      if (own) return own;
      var byWord = NAME_CAT.filter(function (r) { return r[1].some(function (w) { return lc.indexOf(w.trim()) >= 0; }); })[0];
      if (byWord) return byWord[0];
    }
    var n = ' ' + String(item.name || '').toLowerCase() + ' ';
    var m = NAME_CAT.filter(function (r) { return r[1].some(function (w) { return n.indexOf(w) >= 0; }); })[0];
    return m ? m[0] : 'Other';
  }
  /* A bare line the contractor typed has a name and nothing else. */
  function catOfName(name) { return catOf({ name: name }); }

  function icon(cat, cls) {
    var c = I[cat] ? cat : 'Other';
    return '<svg class="sp-ic ' + (cls || '') + '" data-fam="' + (FAM_OF[c] || 'other') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[c] + '</svg>';
  }
  /* the chip the picker and the list rows both use */
  function iconChip(item) {
    var c = catOf(item);
    return '<span class="sp-chip" data-fam="' + (FAM_OF[c] || 'other') + '" title="' + esc(c) + '">' + icon(c) + '</span>';
  }
  SP.catOf = catOf; SP.catOfName = catOfName; SP.icon = icon; SP.iconChip = iconChip;
  SP.categories = function () { return Object.keys(I); };

  /* ================================================================
     THE PICKER

     Tab one is "what do you need", and it searches a materials catalog
     that ships with the product (supply-catalog.js) joined to whatever
     price books the contractor has added. So it works on day one, before
     anyone has photographed anything.

     Every result says WHO SELLS IT. That is the question a contractor
     actually has, and the answer is stable enough to ship: roofing
     distributors carry shingles, Ferguson carries pipe, SiteOne carries
     irrigation, the big boxes carry the gap fill. Chains they have
     already added are marked; the rest are one tap from being added.

     Prices come in three tiers and the UI never blurs them:
       yours    a real negotiated price off their own price book. This is
                the only kind that is ever ordered or costed with.
       typical  a ballpark from the catalog, labelled as a ballpark, so a
                new account can size a job before adding a supplier.
       none     nobody has priced it; the supplier quotes it.

     A typical price deliberately does not travel onto the list as a cost:
     pickAdd only carries a SKU and price when the match came from the
     contractor's own book, so the sourcing engine and every purchase
     order downstream still run on real numbers only.
     ================================================================ */
  var PICK = { q: '', trade: '' };

  function norm(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' '); }

  /* which national chain a supplier of theirs actually is, so "who sells
     this" can say "you already buy there". dir_id is set when they add one
     from the directory; older rows are matched on the name they typed. */
  function chainOf(sup) {
    if (!sup) return '';
    if (sup.dir_id) return sup.dir_id;
    var n = norm(sup.name); if (!n) return '';
    var hit = (SP.dirAll || []).filter(function (d) {
      var dn = norm(d.name);
      return dn === n || n.indexOf(dn) >= 0 || dn.indexOf(n) >= 0;
    }).sort(function (a, b) { return b.name.length - a.name.length; })[0];
    return hit ? hit.id : '';
  }
  function chainMeta(id) { return (SP.dirAll || []).filter(function (d) { return d.id === id; })[0] || null; }
  /* Chip-sized names. The directory carries the full legal-ish name, which
     is right on a supplier card and far too long on a pill. */
  var SHORT = { homedepot_pro: 'Home Depot', lowes_pro: "Lowe's", ced: 'CED',
    fbm: 'Foundation BM', supplyhouse: 'SupplyHouse', beacon: 'Beacon',
    srs: 'SRS', siteone: 'SiteOne', bfs: 'Builders FirstSource', amazonbiz: 'Amazon Business',
    northerntool: 'Northern Tool', hvacdirect: 'HVACDirect', whitecap: 'White Cap' };
  function chainName(id) {
    if (SHORT[id]) return SHORT[id];
    var d = chainMeta(id); if (!d) return id;
    return d.name.replace(/\s*\(.*\)\s*/, '').trim();
  }
  /* the chains they have already added, so their own counter sorts first */
  function myChains() {
    var out = {};
    SP.sup.forEach(function (s) { if (!isSample(s)) { var c = chainOf(s); if (c) out[c] = s; } });
    return out;
  }

  /* One row per material: the catalog as the spine, the contractor's own
     price books laid over the top. Rebuilt only when either changes. */
  var _idx = null, _idxKey = '';
  function index() {
    var key = SP.items.length + ':' + SP.sup.length + ':' + ((SP.CATALOG || []).length);
    if (_idx && _idxKey === key) return _idx;
    var by = {};
    (SP.CATALOG || []).forEach(function (c) {
      var k = norm(c.name);
      by[k] = { key: k, name: c.name, cat: c.cat, unit: c.unit, lo: c.lo, hi: c.hi,
        car: c.car.slice(), offers: [], trade: c.trade, toks: toks(c.name) };
    });
    SP.items.forEach(function (it) {
      var k = norm(it.name); if (!k) return;
      var g = by[k];
      if (!g) {
        g = by[k] = { key: k, name: it.name, cat: catOf(it), unit: it.unit || 'ea', lo: 0, hi: 0,
          car: [], offers: [], trade: '', toks: toks(it.name) };
      }
      g.offers.push(it);
      var c = chainOf(supById(it.supplier_id));
      if (c && g.car.indexOf(c) < 0) g.car.push(c);
    });
    var list = Object.keys(by).map(function (k) { return by[k]; });
    list.forEach(function (g) {
      g.offers.sort(function (a, b) {
        var ap = a.price == null ? Infinity : +a.price, bp = b.price == null ? Infinity : +b.price;
        return ap - bp;
      });
    });
    _idx = { list: list, map: by }; _idxKey = key;
    return _idx;
  }
  function groupFor(key) { return index().map[norm(key)] || null; }

  /* Every query word has to be accounted for, so "pex 3/4" narrows rather
     than widens. Ranking puts what they literally typed at the top, and a
     word the name starts with beats the same letters buried inside another
     word — without that, "shing" offers flashing before shingles. */
  function search(q, n) {
    var ql = norm(q);
    if (ql.length < 2) return [];
    var qt = toks(ql), out = [], trade = PICK.trade;
    index().list.forEach(function (g) {
      var nl = g.name.toLowerCase();
      var ok = qt.every(function (t) {
        return g.toks.some(function (u) { return u.indexOf(t) === 0; }) || nl.indexOf(t) >= 0;
      });
      var sku = g.offers.some(function (o) { return String(o.sku || '').toLowerCase().indexOf(ql) === 0; });
      if (!ok && !sku) return;
      var s = nl.indexOf(ql) === 0 ? 5
        : g.toks.some(function (u) { return u.indexOf(ql) === 0; }) ? 4
        : sku ? 3
        : nl.indexOf(ql) >= 0 ? 2 : 1;
      /* their own trade and their own priced items float up; everything
         else is still reachable, because a roofer still buys plywood */
      if (g.offers.length) s += 2;
      if (trade && g.trade === trade) s += 1;
      out.push({ g: g, s: s });
    });
    out.sort(function (a, b) {
      return b.s - a.s || b.g.offers.length - a.g.offers.length || a.g.name.length - b.g.name.length
        || (a.g.name < b.g.name ? -1 : 1);
    });
    return out.slice(0, n || 30).map(function (x) { return x.g; });
  }

  /* What they actually buy, newest first, off recent orders and lists. */
  function recent(n) {
    var seen = {}, out = [], src = [];
    SP.pos.forEach(function (p) { src.push([Date.parse(p.created_at || p.sent_at || 0) || 0, p.lines || []]); });
    SP.lists.forEach(function (l) { src.push([Date.parse(l.created_at || 0) || 0, l.items || []]); });
    src.sort(function (a, b) { return b[0] - a[0]; });
    var onList = {};
    ((SP.list && SP.list.items) || []).forEach(function (it) { onList[norm(it.name)] = 1; });
    for (var i = 0; i < src.length && out.length < (n || 10); i++) {
      var lines = src[i][1];
      for (var j = 0; j < lines.length && out.length < (n || 10); j++) {
        var name = String(lines[j].name || '').trim(), k = norm(name);
        if (!k || seen[k] || onList[k]) continue;
        seen[k] = 1;
        out.push(groupFor(k) || { key: k, name: name, unit: lines[j].unit || 'ea', cat: catOfName(name), car: [], offers: [], lo: 0, hi: 0 });
      }
    }
    return out;
  }
  /* Before there is any history: the catalog's own staples for their trade,
     so tab one is never an empty box. */
  function starters(n) {
    var t = PICK.trade, onList = {};
    ((SP.list && SP.list.items) || []).forEach(function (it) { onList[norm(it.name)] = 1; });
    return index().list.filter(function (g) {
      return (!t || g.trade === t) && !onList[g.key];
    }).slice(0, n || 10);
  }

  /* ---------- who sells it ---------- */
  function storeChips(g) {
    if (!g.car || !g.car.length) return '';
    var mine = myChains();
    var ids = g.car.slice().sort(function (a, b) { return (mine[b] ? 1 : 0) - (mine[a] ? 1 : 0); });
    var shown = ids.slice(0, 4), rest = ids.length - shown.length;
    return '<span class="sp-pk-stores">' + shown.map(function (id) {
      var nm = chainName(id);
      return '<button class="sp-store' + (mine[id] ? ' mine' : '') + '" data-c="' + esc(id) + '"'
        + ' onclick="event.stopPropagation();SP.storeTap(this.dataset.c)"'
        + ' title="' + esc(mine[id] ? 'You buy here' : 'Add ' + nm + ' as a supplier') + '">'
        + (mine[id] ? '<span class="ms">check</span>' : '') + esc(nm) + '</button>';
    }).join('') + (rest > 0 ? '<span class="sp-store-more">+' + rest + '</span>' : '') + '</span>';
  }
  SP.storeTap = function (id) {
    var mine = myChains();
    if (mine[id]) { window.bpNav('suppliers'); return; }
    if (SP.dirAdd) SP.dirAdd(id);
  };

  /* ---------- what it costs ---------- */
  function priceLine(g) {
    if (g.offers.length) {
      var best = g.offers[0], s = supById(best.supplier_id);
      var stock = best.stock == null ? '' : best.stock > 0
        ? '<span class="sp-pk-stk ok">' + best.stock.toLocaleString() + ' on the shelf</span>'
        : '<span class="sp-pk-stk out">none on the shelf</span>';
      return '<b>' + (best.price == null ? '—' : money(best.price)) + '</b>'
        + '<span class="sp-pk-yours">your price</span>'
        + '<span class="sp-pk-sup">' + esc(s ? s.name : 'a supply house') + '</span>' + stock
        + (g.offers.length > 1 ? '<span class="sp-pk-more">+' + (g.offers.length - 1) + ' more</span>' : '');
    }
    if (g.lo > 0) {
      return '<b class="typ">' + money(g.lo).replace(/\.00$/, '') + ' to ' + money(g.hi).replace(/\.00$/, '') + '</b>'
        + '<span class="sp-pk-typ" title="A ballpark from our catalog, not a quote. Add the supplier you use and your own price replaces it.">typical</span>';
    }
    return '<span class="sp-pk-none">No price yet — the supplier will quote it</span>';
  }

  /* Deliberately a div, not a button: each row carries its own store
     buttons, and a button inside a button is invalid HTML that the parser
     silently hoists out — which is exactly how the store chips vanished
     the first time. Keyboard behaviour is put back by hand. */
  function pickRow(g, kind) {
    return '<div class="sp-pk-row" role="button" tabindex="0" data-k="' + esc(g.key) + '"'
      + ' onclick="SP.pickAdd(this.dataset.k)" onkeydown="SP.rowKey(event,this)">'
      + iconChip({ name: g.name, category: g.cat })
      + '<span class="sp-pk-txt"><b>' + esc(g.name) + '</b>'
      + '<span class="sp-pk-meta">' + priceLine(g) + '</span>'
      + storeChips(g) + '</span>'
      + '<span class="sp-pk-add">' + (kind === 'search' ? '+' : 'Add') + '</span></div>';
  }
  SP.rowKey = function (e, el) {
    if (!e || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); SP.pickAdd(el.dataset.k);
  };
  function resultsHtml() {
    var q = PICK.q;
    if (norm(q).length >= 2) {
      var res = search(q, 30);
      if (!res.length) {
        return '<div class="sp-pk-empty"><b>Nothing in the catalog or your price books matches that.</b>'
          + '<span>Add it anyway and whoever you order from will price it.</span>'
          + '<span class="sp-pk-empty-b"><button class="bpx-rowbtn" onclick="SP.pickAddRaw()">Add &ldquo;' + esc(String(q).trim()) + '&rdquo; anyway</button></span></div>';
      }
      return '<div class="sp-pk-list">' + res.map(function (g) { return pickRow(g, 'search'); }).join('') + '</div>';
    }
    var rec = recent(10), lbl = 'What you buy most';
    if (!rec.length) { rec = starters(10); lbl = 'Common on your kind of job'; }
    if (!rec.length) return '';
    return '<div class="sp-pk-lbl">' + lbl + '</div>'
      + '<div class="sp-pk-list recent">' + rec.map(function (g) { return pickRow(g, 'recent'); }).join('') + '</div>';
  }
  function pickerHtml() {
    if (PICK.trade === '' && window.bpSettingsGet) {
      var t = String(((bpSettingsGet().company) || {}).trade || '').toLowerCase();
      PICK.trade = ['roofing', 'plumbing', 'electrical', 'hvac', 'painting', 'landscaping', 'concrete', 'drywall', 'framing']
        .filter(function (k) { return t.indexOf(k.slice(0, 5)) >= 0; })[0]
        || (t.indexOf('air') >= 0 || t.indexOf('heat') >= 0 ? 'hvac'
          : t.indexOf('lawn') >= 0 || t.indexOf('pool') >= 0 ? 'landscaping'
          : t.indexOf('mason') >= 0 ? 'concrete' : null) || '';
    }
    var n = (SP.CATALOG || []).length;
    return '<div class="sp-pk">'
      + '<div class="sp-pk-box"><span class="ms">search</span>'
      + '<input id="sp-pk-q" value="' + esc(PICK.q) + '" placeholder="Search materials — shingles, PEX, 20A breaker, sod"'
      + ' autocomplete="off" oninput="SP.pickQ(this.value)" onkeydown="SP.pickKey(event)">'
      + (PICK.q ? '<button class="sp-pk-clr" onclick="SP.pickQ(\'\',true)" aria-label="Clear">&times;</button>' : '')
      + '</div>'
      + '<div class="sp-pk-cue">' + n.toLocaleString() + ' materials, and who stocks them. '
      + (SP.sup.filter(function (s) { return !isSample(s); }).length
        ? 'Prices marked <em>your price</em> come from your own price books.'
        : '<button class="bpx-linkbtn" onclick="SP.dirOpen()">Add a supplier</button> and your real prices replace the ballparks.')
      + '</div>'
      + '<div id="sp-pk-res">' + resultsHtml() + '</div>'
      + '<div id="sp-pk-flash" class="sp-pk-flash" role="status" aria-live="polite"></div></div>';
  }
  function itemsHtml() {
    var L = SP.list, items = (L && L.items) || [];
    var head = '<div class="sp-list-hd"><b>On the list</b>' + (items.length ? '<span>' + items.length + (items.length === 1 ? ' item' : ' items') + '</span>' : '') + '</div>';
    if (!items.length) return head + '<div class="sp-items-none">Nothing yet. Search above, or <button class="bpx-linkbtn" onclick="SP.itemAdd()">type one in</button>.</div>';
    return head + '<div class="sp-items"><div class="sp-item sp-head"><span></span><span>Item</span><span>Qty</span><span>Unit</span><span></span></div>'
      + items.map(function (it, k) {
        return '<div class="sp-item">' + iconChip({ name: it.name, category: it.cat }).replace('sp-chip', 'sp-chip sm')
          + '<input value="' + esc(it.name) + '" placeholder="What do you need" oninput="SP.itemEdit(' + k + ',\'name\',this.value)" list="sp-dl">'
          + '<input value="' + esc(it.qty) + '" inputmode="decimal" oninput="SP.itemEdit(' + k + ',\'qty\',this.value)">'
          + '<input value="' + esc(it.unit || '') + '" placeholder="ea" oninput="SP.itemEdit(' + k + ',\'unit\',this.value)">'
          + '<button class="sp-x" onclick="SP.itemDel(' + k + ')" aria-label="Remove">&times;</button></div>';
      }).join('')
      + '</div><datalist id="sp-dl">' + uniqNames().slice(0, 300).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  }
  /* Redraw the two halves without touching the search box, so the field
     keeps its value and the caret while the list fills up underneath. */
  function pickRedraw() {
    var r = $('sp-pk-res'); if (r) r.innerHTML = resultsHtml();
    var i = $('sp-items'); if (i) i.innerHTML = itemsHtml();
  }
  SP.pickQ = function (v, focus) {
    PICK.q = v || '';
    var box = $('sp-pk-q');
    if (box && box.value !== PICK.q) box.value = PICK.q;
    var clr = document.querySelector('.sp-pk-clr');
    if (PICK.q && !clr && box) box.insertAdjacentHTML('afterend', '<button class="sp-pk-clr" onclick="SP.pickQ(\'\',true)" aria-label="Clear">&times;</button>');
    if (!PICK.q && clr) clr.parentNode.removeChild(clr);
    pickRedraw();
    if (focus && box) box.focus();
  };
  SP.pickKey = function (e) {
    if (!e) return;
    if (e.key === 'Escape') { SP.pickQ('', true); return; }
    if (e.key === 'Enter') {
      var first = document.querySelector('#sp-pk-res .sp-pk-row');
      if (first) { e.preventDefault(); SP.pickAdd(first.dataset.k); }
    }
  };
  /* A line off the contractor's own price book carries its SKU across, so
     the sourcing engine matches it exactly. A catalog line deliberately
     does NOT carry the typical price: it goes on as a name to be quoted,
     because a ballpark must never end up on a purchase order. */
  SP.pickAdd = function (key) {
    var L = SP.list; if (!L) return;
    var g = groupFor(key);
    var name = g ? g.name : String(key || '').trim();
    if (!name) return;
    L.items = L.items || [];
    var on = L.items.filter(function (it) { return norm(it.name) === norm(name); })[0];
    if (on) { on.qty = (+on.qty || 0) + 1; }
    else {
      L.items.push({ key: uid('k'), name: name, qty: 1, unit: (g && g.unit) || 'ea',
        sku: g && g.offers[0] ? g.offers[0].sku : '', cat: g ? g.cat : catOfName(name) });
    }
    SP.plans = null; saveList(); pickRedraw();
    flash(on ? name + ' is now ' + on.qty : name + ' added');
  };
  SP.pickAddRaw = function () { var q = String(PICK.q || '').trim(); if (!q) return; SP.pickAdd(q); SP.pickQ('', true); };
  function flash(t) {
    var e = $('sp-pk-flash'); if (!e) return;
    e.textContent = t; e.className = 'sp-pk-flash on';
    clearTimeout(flash._t); flash._t = setTimeout(function () { e.className = 'sp-pk-flash'; }, 1800);
  }

  /* ---------- matching: a list line against a supplier's price book ---------- */
  var STOP = { the: 1, a: 1, of: 1, and: 1, in: 1, ft: 1, x: 1, per: 1, with: 1 };
  function toks(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9./ -]/g, ' ').split(/[\s,]+/).filter(function (t) { return t && !STOP[t]; }); }
  function match(line, item) {
    if (line.sku && item.sku && line.sku.toLowerCase() === item.sku.toLowerCase()) return 1;
    var a = toks(line.name), b = toks(item.name); if (!a.length || !b.length) return 0;
    var hit = 0; a.forEach(function (t) { if (b.some(function (u) { return u === t || (t.length > 3 && u.indexOf(t) === 0) || (u.length > 3 && t.indexOf(u) === 0); })) hit++; });
    var score = hit / a.length;
    if (String(item.name).toLowerCase() === String(line.name).toLowerCase()) score = 1;
    return score;
  }
  function bestAt(line, supplierId) {
    var best = null, bs = 0;
    itemsOf(supplierId).forEach(function (it) { var s = match(line, it); if (s > bs) { bs = s; best = it; } });
    /* a one- or two-word line has to match completely; longer lines can drop a word */
    var need = toks(line.name).length <= 2 ? 0.99 : 0.67;
    return bs >= need ? { item: best, score: bs } : null;
  }
  function inStock(m, qty) { return m && m.item.stock != null && m.item.stock >= qty; }
  function unknown(m) { return m && m.item.stock == null; }

  /* ---------- the engine ---------- */
  function plan(lines, mode) {
    var sups = SP.sup.slice(), C = SP.cost;
    var grid = {}; sups.forEach(function (s) { grid[s.id] = lines.map(function (l) { return bestAt(l, s.id); }); });
    var stopsCost = function (stops) { return stops.reduce(function (t, st) { return t + (st.fulfil === 'delivery' ? st.fees : C.stop + (st.drive || 0) * 2 * C.min); }, 0); };
    var DELIVERY_MIN = 480;                             /* a delivery is "tomorrow"; only cheapest may prefer it */
    var mkStop = function (s, ls) {
      var sub = ls.reduce(function (t, x) { return t + (x.tbc || x.price == null ? 0 : x.qty * x.price); }, 0);
      var free = s.delivery && s.delivery_min > 0 && sub >= s.delivery_min;
      var del = s.delivery && (!s.will_call || (mode === 'cheapest' && (free || (+s.delivery_fee || 0) < C.stop + (s.drive_min == null ? 25 : s.drive_min) * 2 * C.min)));
      var fees = del ? (free ? 0 : +s.delivery_fee || 0) : 0;
      return { supplier: s, lines: ls, subtotal: sub, fees: fees, fulfil: del ? 'delivery' : 'will_call', drive: s.drive_min == null ? 25 : s.drive_min };
    };
    var build = function (assign) {                       /* assign: lineIdx -> supplier id */
      var by = {}, missing = [];
      lines.forEach(function (l, i) {
        var sid = assign[i]; if (!sid) { missing.push(l); return; }
        var m = grid[sid][i]; (by[sid] = by[sid] || []).push({ line: l, item: m.item, sku: m.item.sku, name: m.item.name, qty: l.qty, unit: m.item.unit || l.unit || 'ea', price: +m.item.price, stock: m.item.stock, score: m.score });
      });
      var stops = Object.keys(by).map(function (sid) { return mkStop(supById(sid), by[sid]); });
      stops.sort(function (a, b) { return a.drive - b.drive; });
      var parts = stops.reduce(function (t, s) { return t + s.subtotal; }, 0), run = stopsCost(stops);
      var minutes = stops.reduce(function (t, s) { return t + (s.fulfil === 'delivery' ? DELIVERY_MIN : s.drive * 2); }, 0);
      return { stops: stops, missing: missing, parts: parts, run: run, total: parts + run, minutes: minutes, stopsN: stops.length };
    };
    var cands = [];
    /* an item nobody has priced yet still goes on the order: the branch
       prices it at the account rate and the next bill teaches us the number */
    var asTbc = function (l) { return { line: l, item: { sku: '', name: l.name, unit: l.unit || 'ea', price: null, stock: null }, sku: '', name: l.name, qty: l.qty, unit: l.unit || 'ea', price: null, tbc: true, score: 1 }; };
    var fold = function (c) {
      if (!c || !c.missing.length) return c;
      var host = c.stops[0];
      c.missing.forEach(function (l) { host.lines.push(asTbc(l)); });
      c.tbc = c.missing.length; c.missing = [];
      return c;
    };
    /* single-supplier plans */
    sups.forEach(function (s) {
      var a = lines.map(function (l, i) { var m = grid[s.id][i]; return m && (inStock(m, l.qty) || (mode === 'cheapest' && unknown(m))) ? s.id : null; });
      cands.push(build(a));
    });
    /* split plans */
    var byDrive = sups.slice().sort(function (a, b) { return (a.drive_min == null ? 99 : a.drive_min) - (b.drive_min == null ? 99 : b.drive_min); });
    cands.push(build(lines.map(function (l, i) {                    /* nearest stocked */
      var s = byDrive.filter(function (x) { return inStock(grid[x.id][i], l.qty); })[0] || byDrive.filter(function (x) { return unknown(grid[x.id][i]); })[0];
      return s ? s.id : null;
    })));
    cands.push(build(lines.map(function (l, i) {                    /* cheapest stocked */
      var best = null, bp = Infinity;
      sups.forEach(function (x) { var m = grid[x.id][i]; if (m && (inStock(m, l.qty) || unknown(m)) && m.item.price < bp) { bp = m.item.price; best = x; } });
      return best ? best.id : null;
    })));
    cands = cands.filter(function (c) { return c.stops.length; });
    if (!cands.length) {
      /* nothing priced anywhere: one stop at the nearest supply house, every line for them to price */
      var s0 = byDrive[0]; if (!s0) return null;
      var st0 = mkStop(s0, lines.map(asTbc));
      return { stops: [st0], missing: [], tbc: lines.length, parts: 0, run: stopsCost([st0]), total: stopsCost([st0]), minutes: st0.fulfil === 'delivery' ? DELIVERY_MIN : st0.drive * 2, stopsN: 1 };
    }
    var covered = function (c) { return lines.length - c.missing.length; };
    cands.sort(function (a, b) {
      if (covered(b) !== covered(a)) return covered(b) - covered(a);
      if (mode === 'fastest') return (a.minutes - b.minutes) || (a.stopsN - b.stopsN) || (a.total - b.total);
      return (a.total - b.total) || (a.minutes - b.minutes);
    });
    return fold(cands[0]);
  }
  SP.run = function () {
    var L = SP.list; if (!L) return;
    var lines = (L.items || []).filter(function (i) { return String(i.name).trim() && +i.qty > 0; }).map(function (i) { return { key: i.key, name: i.name, qty: +i.qty, unit: i.unit }; });
    if (!lines.length) { alert('Add at least one item with a quantity.'); return; }
    if (!SP.sup.length) { alert('Add a supply house first, on Where I buy. Then the order has somewhere to go.'); return; }
    SP.plans = { fastest: plan(lines, 'fastest'), cheapest: plan(lines, 'cheapest'), lines: lines };
    if (L.status === 'draft') { L.status = 'sourced'; db.update('parts_lists', L.id, { status: 'sourced' }).catch(function () {}); }
    window.bpSupply();
    var el = document.querySelector('.sp-plans'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  function plansHtml() {
    var P = SP.plans;
    if (!P) return '<div class="bpx-panel sp-plans"><div class="bpx-ptitle">Where to buy it<span class="lg2">closest and cheapest, side by side</span></div><div class="bpx-empty2">Put the list together on the left, then tap <b>Where do I buy this</b>. We check your price at every supply house you use and show you both answers.</div></div>';
    var F = P.fastest, C = P.cheapest;
    var gap = F && C ? Math.round(F.total - C.total) : 0;                 /* what cheapest saves in money */
    var mins = F && C ? Math.round(C.minutes - F.minutes) : 0;            /* what fastest saves in time */
    var card = function (key, label, p) {
      var sel = SP.priority === key;
      if (!p) return '<div class="sp-plan' + (sel ? ' sel' : '') + '"><div class="sp-plan-h"><b>' + label + '</b></div><div class="bpx-empty2">No supplier has these items priced yet.</div></div>';
      /* "saves 7 hours" against a delivery is true and reads like nonsense.
         What the contractor is actually choosing there is today or tomorrow. */
      var delivered = function (x) { return x && x.stops.some(function (st) { return st.fulfil === 'delivery'; }); };
      var win = key === 'cheapest'
        ? (gap > 0 ? 'Saves ' + money(gap) : '')
        : (delivered(C) && !delivered(p) ? 'Have it today'
          : mins >= 10 ? 'Saves ' + mins + ' min' + (C && C.stopsN > p.stopsN ? ' and a stop' : '')
          : C && C.stopsN > p.stopsN ? 'One stop, not ' + C.stopsN : '');
      return '<div class="sp-plan' + (sel ? ' sel' : '') + '">'
        + '<div class="sp-plan-h"><b>' + label + '</b>' + (win ? '<span class="sp-win">' + win + '</span>' : '') + (sel ? '<span class="bpx-badge">Your priority</span>' : '') + '</div>'
        + '<div class="sp-plan-big"><span>' + (p.parts || !p.tbc ? money(p.total) : 'Priced at the counter') + '</span><small>' + (p.stopsN === 1 ? '1 stop' : p.stopsN + ' stops') + (p.stops.every(function (st) { return st.fulfil === 'delivery'; }) ? ', delivered' : ', about ' + p.stops.reduce(function (t, st) { return t + (st.fulfil === 'delivery' ? 0 : st.drive * 2); }, 0) + ' min round trip') + '</small></div>'
        + '<div class="sp-plan-sub bpx-mut">Parts ' + money(p.parts) + (p.run ? ' + your time and truck ' + money(p.run) : '') + '</div>'
        + p.stops.map(function (st) {
          return '<div class="sp-stop"><div class="sp-stop-h"><b>' + esc(st.supplier.name) + '</b><span class="bpx-mut">' + (st.fulfil === 'delivery' ? 'Delivery' + (st.fees ? ' ' + money(st.fees) : ', free') : (st.supplier.drive_min != null ? st.supplier.drive_min + ' min away' : 'drive time unknown') + ', will-call') + '</span><span class="sp-stop-t">' + (st.lines.every(function (x) { return x.tbc; }) ? 'priced by them' : money(st.subtotal)) + '</span></div>'
            + '<div class="sp-lines">' + st.lines.map(function (x) { return '<div class="sp-line"><span>' + x.qty + ' &times; ' + esc(x.name) + (x.score < 0.85 ? ' <em class="bpx-mut">(matched from "' + esc(x.line.name) + '")</em>' : '') + '</span>' + (x.tbc ? '<span class="sp-tbc">branch prices it</span>' : stockBadge(x.item, x.qty)) + '<span class="bpx-num">' + (x.tbc ? '&mdash;' : money(x.qty * x.price)) + '</span></div>'; }).join('') + '</div></div>';
        }).join('')
        + (p.tbc ? '<div class="sp-note" style="margin-top:8px"><span class=ms>help</span><b>' + p.tbc + (p.tbc === 1 ? ' item has' : ' items have') + ' no price yet</b> because you have never bought ' + (p.tbc === 1 ? 'it' : 'them') + ' through here. ' + (p.tbc === 1 ? 'It goes' : 'They go') + ' on the order marked <i>price at our account rate</i>; the branch fills it in. Photograph that bill when it comes and ' + (p.tbc === 1 ? 'it is' : 'they are') + ' priced from then on.</div>' : '')
        + '<button class="bpx-btn sp-inline" style="margin-top:12px" onclick="SP.order(\'' + key + '\')">' + (p.stopsN === 1 ? 'Order it this way' : 'Order it this way, ' + p.stopsN + ' stops') + '</button>'
        + '</div>';
    };
    return '<div class="bpx-panel sp-plans"><div class="bpx-ptitle">Where to buy it<span class="lg2">' + P.lines.length + ' items, checked at ' + SP.sup.length + (SP.sup.length === 1 ? ' supply house' : ' supply houses') + '</span></div><div class="sp-plan-grid">' + card('fastest', 'Closest', P.fastest) + card('cheapest', 'Cheapest', P.cheapest) + '</div></div>';
  }

  /* ---------- purchase orders ---------- */
  function poNumber(n) { var d = new Date(); var ymd = String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); return 'PO-' + ymd + '-' + ('00' + n).slice(-3); }
  SP.order = function (key) {
    var P = SP.plans && SP.plans[key]; var L = SP.list; if (!P || !L) return;
    /* the one line that earns the second use: what this choice was worth */
    var other = SP.plans[key === 'cheapest' ? 'fastest' : 'cheapest'];
    SP.won = other && other !== P
      ? (key === 'cheapest'
        ? (other.total - P.total > 1 ? 'You bought it ' + money(other.total - P.total) + ' cheaper than the closest trip.' : '')
        : (other.stops.some(function (st) { return st.fulfil === 'delivery'; }) ? 'You will have it today instead of waiting on a delivery.'
          : other.minutes - P.minutes > 5 ? 'You saved about ' + Math.round(other.minutes - P.minutes) + ' minutes' + (other.stopsN > P.stopsN ? ' and a second stop' : '') + '.'
          : ''))
      : '';
    var n = SP.pos.length + 1, seq = Promise.resolve(), made = [];
    P.stops.forEach(function (st) {
      var row = { list_id: L.id, supplier_id: st.supplier.id, po_number: poNumber(n++), status: 'sent', fulfil: st.fulfil, eta_min: st.fulfil === 'delivery' ? null : st.drive,
        lines: st.lines.map(function (x) { return x.tbc ? { sku: '', name: x.name, qty: x.qty, unit: x.unit, price: null, tbc: true } : { sku: x.sku, name: x.name, qty: x.qty, unit: x.unit, price: x.price }; }),
        subtotal: Math.round(st.subtotal * 100) / 100, fees: Math.round(st.fees * 100) / 100, total: Math.round((st.subtotal + st.fees) * 100) / 100, job_id: L.job_id || '', job_name: L.job_name || '', sent_at: new Date().toISOString() };
      seq = seq.then(function () { return db.insert('purchase_orders', row); }).then(function (r) { made.push(r); });
    });
    seq.then(function () { return db.update('parts_lists', L.id, { status: 'ordered' }); })
      .then(function () { L.status = 'ordered'; SP.list = null; SP.plans = null; SP.tab = 'orders_open'; return load(true); })
      .then(function () { window.bpNav('supplyorders'); if (made[0]) setTimeout(function () { SP.poOpen(made[0].id); }, 200); })
      .catch(function (e) { alert('Could not send the order. ' + (e.message || '')); });
  };
  window.bpSupplyOrders = function () {
    if (!SP.loaded) { $('bpxViewArea').innerHTML = tabs('supplyorders') + skel(); load(); return; }
    var cnt = function (f) { return SP.pos.filter(f).length; };
    var nOpen = cnt(function (p) { return p.status === 'sent' || p.status === 'ready' || p.status === 'picked_up'; }), nInv = cnt(function (p) { return p.status === 'invoiced'; });
    var t = [['orders_open', 'Waiting on me' + (nOpen ? ' <i>' + nOpen + '</i>' : '')], ['orders_inv', 'Bill to check' + (nInv ? ' <i>' + nInv + '</i>' : '')], ['orders_done', 'Finished'], ['orders_all', 'Everything']];
    var rows = SP.pos.filter(function (p) {
      if (SP.tab === 'orders_open') return p.status === 'sent' || p.status === 'ready' || p.status === 'picked_up';
      if (SP.tab === 'orders_inv') return p.status === 'invoiced';
      if (SP.tab === 'orders_done') return p.status === 'reconciled';
      return true;
    });
    var h = tabs('supplyorders') + state()
      + '<div class="bpx-chead" style="margin-bottom:12px"><div class="bpx-jobtabs" style="flex-wrap:wrap">' + t.map(function (x) { return '<button class="bpx-jt' + (SP.tab === x[0] ? ' on' : '') + '" onclick="SP.tab=\'' + x[0] + '\';bpSupplyOrders()">' + x[1] + '</button>'; }).join('') + '</div>'
      + '<button class="bpx-addbtn" onclick="SP.scanOpen()">Photograph a bill</button></div>';
    var unsent = SP.pos.filter(function (p) { return p.status === 'sent' && !p.sent_to_supplier; });
    if (unsent.length) h += '<div class="sp-note warn"><span class="ms">outgoing_mail</span><b>' + (unsent.length === 1 ? 'One order has not been sent to the supply house.' : unsent.length + ' orders have not been sent to the supply house.') + '</b> Until you send it, nothing is picked and nobody is expecting you. <button class="bpx-rowbtn primary" onclick="SP.poOpen(\'' + unsent[0].id + '\')">' + (unsent.length === 1 ? 'Send it' : 'Send them') + '</button></div>';
    if (SP.won) { h += '<div class="sp-note good"><span class="ms">savings</span>' + esc(SP.won) + '</div>'; SP.won = ''; }
    if (!rows.length) h += '<div class="bpx-panel"><div class="bpx-empty2">' + (SP.pos.length ? 'Nothing in here right now.' : 'Nothing ordered yet. Order materials for a job and it lands here with a barcode you show at the counter.') + '</div></div>';
    h += '<div class="sp-grid">' + rows.map(poCard).join('') + '</div>';
    if (SP.pos.length) h += '<div class="sp-foot">' + window.bpCsvBtn('SP.csv()', 'Export CSV') + '</div>';
    $('bpxViewArea').innerHTML = h;
  };
  var STATUS = { sent: ['Not sent yet', 'warn'], ready: ['Ready to collect', ''], picked_up: ['Picked up', ''], invoiced: ['Bill needs checking', 'warn'], reconciled: ['Done', ''], cancelled: ['Cancelled', 'warn'] };
  function poCard(p) {
    var s = supById(p.supplier_id), st = STATUS[p.status] || [p.status, ''];
    if (p.status === 'sent' && p.sent_to_supplier) st = p.send_mode === 'walkin' ? ['Walking in', ''] : ['Sent to them', ''];
    var next = p.status === 'sent' ? (p.sent_to_supplier
        ? '<button class="bpx-rowbtn" onclick="SP.poStatus(\'' + p.id + '\',\'ready\')">They say it is ready</button>'
        : '<button class="bpx-rowbtn primary" onclick="SP.poOpen(\'' + p.id + '\')">Send it to them</button>')
      : p.status === 'ready' ? '<button class="bpx-rowbtn primary" onclick="SP.pickupOpen(\'' + p.id + '\')">Picked up</button>'
      : p.status === 'picked_up' ? '<button class="bpx-rowbtn primary" onclick="SP.scanOpen(\'' + p.id + '\')">Photograph the bill</button><button class="bpx-rowbtn" onclick="SP.invoiceOpen(\'' + p.id + '\')">Type it in</button>'
      : p.status === 'invoiced' ? '<button class="bpx-rowbtn primary" onclick="SP.reconcile(\'' + p.id + '\')">Put it on the job</button>' : '';
    var variance = p.invoice_total != null ? p.invoice_total - p.total : null;
    return '<div class="bpx-panel sp-po">'
      + '<div class="sp-po-h"><div><b>' + esc(p.po_number) + '</b><span class="bpx-mut">' + esc(s ? s.name : 'Supplier removed') + (p.job_name ? ' &middot; ' + esc(p.job_name) : '') + '</span></div><span class="bpx-badge' + (st[1] ? ' ' + st[1] : '') + '">' + st[0] + '</span></div>'
      + '<div class="sp-barcode" onclick="SP.poOpen(\'' + p.id + '\')" title="Open the will-call ticket">' + barcodeSvg(p.po_number, 220, 46) + '<span>' + esc(p.po_number) + '</span></div>'
      + '<div class="sp-po-meta bpx-mut">' + p.lines.length + ' line' + (p.lines.length === 1 ? '' : 's') + ' &middot; ' + (p.fulfil === 'delivery' ? 'Delivery' : 'Will-call') + ' &middot; made ' + ago(Date.parse(p.sent_at)) + '</div>'
      + '<div class="sp-po-tot"><span>What you ordered</span><b>' + money(p.total) + '</b></div>'
      + (variance != null ? '<div class="sp-po-tot"><span>What they billed ' + esc(p.invoice_ref || '') + '</span><b class="' + (Math.abs(variance) > Math.max(2, p.total * 0.02) ? 'bpx-neg' : '') + '">' + money(p.invoice_total) + (Math.abs(variance) >= 0.01 ? ' <small>(' + (variance > 0 ? '+' : '') + money(variance) + ')</small>' : '') + '</b></div>' : '')
      + '<div class="sp-sup-acts">' + next + '<button class="bpx-rowbtn" onclick="SP.poOpen(\'' + p.id + '\')">' + (p.fulfil === 'delivery' ? 'Delivery order' : 'Counter ticket') + '</button>' + (p.status !== 'reconciled' && p.status !== 'cancelled' ? window.bpDelBtn('SP.poStatus(\'' + p.id + '\',\'cancelled\')', 'Cancel this order') : '') + '</div>'
      + '</div>';
  }
  SP.poStatus = function (id, status) {
    if (status === 'cancelled' && !confirm('Cancel this order?')) return;
    var patch = { status: status }; if (status === 'picked_up') patch.picked_up_at = new Date().toISOString();
    db.update('purchase_orders', id, patch).then(function () { return load(true); }).catch(function (e) { alert('Could not update. ' + (e.message || '')); });
  };
  /* The ticket is two different documents. Will-call is something you carry
     to a counter, so it leads with the barcode and the PO number. A delivery
     is something you send, so the barcode is meaningless and the address is
     what matters. Showing "Will-call ticket" over a delivery was just wrong.

     It also has to say the thing the screen otherwise implies and never
     states: BuilderPro does not transmit anything to the supply house. The
     contractor sends it. */
  SP.poOpen = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var s = supById(p.supplier_id) || {}, co = ((window.bpSettingsGet && bpSettingsGet().company) || {});
    var deliver = p.fulfil === 'delivery';
    var isTbc = function (l) { return l.tbc || l.price == null; }, tbcN = p.lines.filter(isTbc).length;
    var where = deliver ? (co.address ? 'Deliver to: ' + co.address : 'Please deliver.') : 'Will-call pickup. Our tech will present this PO number.';
    var text = 'PURCHASE ORDER ' + p.po_number + '\nFrom: ' + (co.name || 'Our company') + (co.phone ? ', ' + co.phone : '')
      + '\nTo: ' + (s.name || '') + (s.branch ? ', ' + s.branch : '') + (s.account_no ? '\nAccount: ' + s.account_no : '') + (p.job_name ? '\nJob: ' + p.job_name : '') + '\n\n'
      + p.lines.map(function (l) { return l.qty + ' x ' + l.name + (l.sku ? ' [' + l.sku + ']' : '') + (isTbc(l) ? '  (price at our account rate)' : ' @ ' + money(l.price)); }).join('\n')
      + '\n\n' + (tbcN < p.lines.length ? 'Priced lines ' + money(p.subtotal) + (p.fees ? '\nDelivery ' + money(p.fees) : '') + '\n' : '')
      + (tbcN ? tbcN + (tbcN === 1 ? ' line' : ' lines') + ' marked "price at our account rate": please price at our contractor rate and put it on the invoice.\n' : '') + where
      + '\n\nPlease put PO ' + p.po_number + ' on the invoice.';
    var mail = s.email ? 'mailto:' + encodeURIComponent(s.email) + '?subject=' + encodeURIComponent('PO ' + p.po_number + ' from ' + (co.name || 'BuilderPro client')) + '&body=' + encodeURIComponent(text) : '';
    var sent = !!p.sent_to_supplier;
    var walkin = p.send_mode === 'walkin', emailed = p.send_mode === 'emailed';
    var note = SP._poNote || ''; SP._poNote = '';
    var queue = SP.pos.filter(function (x) { return x.status === 'sent' && !x.sent_to_supplier && x.id !== p.id; }).length;

    window.bpModal(
      (note ? '<div class="sp-note warn"><span class="ms">info</span>' + esc(note) + '</div>' : '')
      + (sent
        ? '<div class="sp-note good"><span class="ms">' + (walkin ? 'directions_car' : emailed ? 'mark_email_read' : 'check_circle') + '</span>' + (walkin
            ? 'You are showing this at the counter. Nothing was sent to ' + esc(s.name || 'them') + ', so they are not expecting you.'
            : emailed
            ? 'Emailed to <b>' + esc(p.sent_to || s.email || s.name) + '</b>' + (p.branch_sent_at ? ' ' + ago(Date.parse(p.branch_sent_at)) : '') + '. A copy is in your inbox; their reply comes to you. When the bill comes, photograph it and it lands on the job.'
            : 'Sent to ' + esc(s.name || 'the supplier') + '. When the bill comes, photograph it and it lands on the job.') + '</div>'
        : '<div class="sp-note warn"><span class="ms">outgoing_mail</span><b>' + esc(s.name || 'The supply house') + ' has not been told about this yet.</b> Nothing is waiting for you until it goes. '
          + (deliver ? 'Send it across so they can schedule the drop.' : 'Send it and it is picked before you arrive. Otherwise you are queueing at the counter like any other day.') + '</div>')
      + '<div class="sp-ticket" id="sp-ticket">'
      + '<div class="sp-ticket-h"><div><div class="bpx-mut" style="font-size:12px">' + (deliver ? 'Delivery order' : 'Will-call ticket') + '</div><b style="font-size:20px">' + esc(p.po_number) + '</b></div>'
        + '<div style="text-align:right"><b>' + esc(s.name || '') + '</b><div class="bpx-mut">' + esc(s.branch || '') + (s.account_no ? ' &middot; Acct ' + esc(s.account_no) : '') + '</div></div></div>'
      + (deliver
        ? '<div class="sp-ticket-del"><span class="ms">local_shipping</span><div><b>Deliver to ' + esc(co.address || 'the address on file') + '</b><span class="bpx-mut">' + (p.job_name ? 'Job: ' + esc(p.job_name) + ' &middot; ' : '') + (p.fees ? 'Delivery ' + money(p.fees) : 'Free delivery') + '</span></div></div>'
        : '<div class="sp-ticket-bar">' + barcodeSvg(p.po_number, 420, 90) + '<div class="sp-ticket-num">' + esc(p.po_number) + '</div></div>')
      + '<table class="bpx-ctable"><thead><tr><th>Qty</th><th>Item</th><th>SKU</th><th class="bpx-r">Each</th><th class="bpx-r">Total</th></tr></thead><tbody>' + p.lines.map(function (l) { return '<tr><td>' + l.qty + '</td><td>' + esc(l.name) + '</td><td class="bpx-mut">' + esc(l.sku || '') + '</td>' + (isTbc(l) ? '<td class="bpx-r" colspan="2"><span class="sp-tbc">at account rate</span></td>' : '<td class="bpx-r bpx-num">' + money(l.price) + '</td><td class="bpx-r bpx-num">' + money(l.qty * l.price) + '</td>') + '</tr>'; }).join('') + '</tbody></table>'
      + '<div class="sp-po-tot" style="margin-top:8px"><span>' + (tbcN ? (tbcN < p.lines.length ? 'Priced lines' + (p.fees ? ' + delivery ' + money(p.fees) : '') + ', plus ' + tbcN + ' the branch prices' : 'The branch prices all ' + tbcN + ' lines') : (p.fees ? 'Parts ' + money(p.subtotal) + ' + delivery ' + money(p.fees) : 'Total')) + '</span><b>' + (tbcN === p.lines.length ? '&mdash;' : money(p.total)) + '</b></div>'
      + '<div class="bpx-mut" style="font-size:12.5px;margin-top:8px">' + esc(co.name || '') + (p.job_name ? ' &middot; Job: ' + esc(p.job_name) : '') + ' &middot; ' + (deliver ? 'Delivery' : 'Will-call') + '</div>'
      + '<div class="sp-ticket-ask"><span class="ms">priority_high</span>Ask them to put <b>' + esc(p.po_number) + '</b> on the invoice. Then the bill matches itself back to this order and the job.</div>'
      + '</div>'
      + '<div id="sp-po-ask"></div>'
      + '<div class="row" style="flex-wrap:wrap">'
        + (sent ? '' : '<button class="bpx-btn sp-inline" id="sp-send-btn" onclick="SP.poSend(\'' + p.id + '\')">Send to ' + esc(s.name || 'the supplier') + '</button>')
        + '<button class="bpx-btn ghost sp-inline" onclick="SP.copy(this)' + (sent ? '' : ';SP.poSent(\'' + p.id + '\',\'sent\')') + '" data-text="' + esc(text) + '">Copy it' + (sent ? '' : ' to send') + '</button>'
        + '<button class="bpx-btn ghost sp-inline" onclick="SP.printTicket(' + (deliver ? 'true' : 'false') + ')">Print</button>'
        + (sent
          ? '<button class="bpx-btn ghost sp-inline" onclick="SP.poNext()">' + (queue ? 'Next order (' + queue + ' to go)' : 'Close') + '</button>'
          : '')
        + '</div>'
      /* the only way past an unsent order, and it is a decision, not a dismissal */
      + (sent ? '' : '<div class="sp-skip">Not sending it? <button class="bpx-linkbtn" onclick="SP.poWalkIn(\'' + p.id + '\')">I will just show this at the counter</button>'
          + (deliver ? ' &middot; a delivery really does have to be sent' : '') + '</div>'));
    document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '640px';
    SP._poMail = mail;
  };
  /* Send it: the branch's contractor desk gets the order by email from our
     mail service, the contractor is copied, replies come back to them. If
     the supplier has no desk email yet we ask for it right here. If this
     deployment has no mail service, the contractor's own mail app opens with
     the same text, and the order is still stamped as sent. */
  SP.poSend = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var s = supById(p.supplier_id) || {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s.email || '').trim())) { SP.poEmailAsk(id); return; }
    var btn = $('sp-send-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Sending\u2026'; }
    var st = (window.bpSettingsGet && bpSettingsGet()) || {}, co = st.company || {}, ow = st.owner || {};
    /* stamped here as well as by the server, so a reload in between never shows an emailed order as unsent */
    var stamp = function (to, at) { p.sent_to_supplier = true; p.send_mode = 'emailed'; p.sent_to = to; p.branch_sent_at = at || new Date().toISOString(); db.update('purchase_orders', id, { sent_to_supplier: true, send_mode: 'emailed', sent_to: p.sent_to, branch_sent_at: p.branch_sent_at }).catch(function () {}); };
    if (!live()) { setTimeout(function () { stamp(s.email); SP.poOpen(id); }, 600); return; }
    Promise.resolve(window.bpAuthApi(window.BP_URL + '/functions/v1/supply-send', { op: 'send', poId: id, company: { name: co.name || '', phone: co.phone || '', address: co.address || '', email: ow.email || '' } }))
      .then(function (r) {
        if (r && r.ok) { stamp(r.to || s.email, r.at); SP.poOpen(id); return; }
        var why = r && r.reason;
        if (why === 'no_mailer') { SP.poFallback(id, 'Email sending is not switched on for this account yet, so we opened the order in your mail app instead. Send it from there.'); return; }
        if (why === 'no_email') { SP.poEmailAsk(id); return; }
        SP.poMsg('Could not send it: ' + ((r && (r.detail || r.error)) || 'the mail service did not answer') + '. Try again, or copy it and send it yourself.');
        if (btn) { btn.disabled = false; btn.textContent = 'Send to ' + (s.name || 'the supplier'); }
      })
      .catch(function () {
        SP.poFallback(id, 'Could not reach the mail service, so we opened the order in your mail app instead. Send it from there.');
      });
  };
  SP.poFallback = function (id, note) {
    var mail = SP._poMail; if (mail) { try { window.location.href = mail; } catch (e) {} }
    SP._poNote = note; SP.poSent(id, 'sent');
  };
  SP.poMsg = function (t) { var el = $('sp-po-ask'); if (el) el.innerHTML = '<div class="sp-note warn"><span class="ms">error</span>' + esc(t) + '</div>'; };
  SP.poEmailAsk = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var s = supById(p.supplier_id) || {}; var el = $('sp-po-ask'); if (!el) return;
    el.innerHTML = '<div class="sp-ask"><div class="sp-ask-h"><span class="ms">alternate_email</span><div><b>Where does ' + esc(s.name || 'this branch') + ' take orders?</b><span class="bpx-mut">Their contractor desk or pro desk email. Ask at the counter once; we keep it.</span></div></div>'
      + '<div class="sp-ask-f"><input id="sp-ask-email" type="email" inputmode="email" placeholder="prodesk@branch.com" autocomplete="off"><button class="bpx-btn sp-inline" onclick="SP.poEmailSave(\'' + id + '\')">Save and send</button></div>'
      + '<div class="bpx-mut" style="font-size:12px;margin-top:6px">No email for them? <button class="bpx-linkbtn" onclick="SP.copy(document.querySelector(\'[data-text]\'));SP.poSent(\'' + id + '\',\'sent\')">Copy the order and text it to them</button></div></div>';
    var i = $('sp-ask-email'); if (i) { i.focus(); i.addEventListener('keydown', function (e) { if (e.key === 'Enter') SP.poEmailSave(id); }); }
  };
  SP.poEmailSave = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var s = supById(p.supplier_id); if (!s) return;
    var v = String(($('sp-ask-email') || {}).value || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { var i = $('sp-ask-email'); if (i) { i.style.borderColor = '#b3392f'; i.focus(); } return; }
    s.email = v;
    db.update('suppliers', s.id, { email: v }).catch(function () {}).then(function () { SP.poOpen(id); setTimeout(function () { SP.poSend(id); }, 120); });
  };
  /* copying or emailing it is the contractor saying "this is on its way".
     Walking in is a legitimate answer too, but it has to be chosen, because
     an order nobody was told about is the one that wastes an hour. */
  SP.poSent = function (id, mode) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p || p.sent_to_supplier) return;
    p.sent_to_supplier = true; p.send_mode = mode || 'sent';
    db.update('purchase_orders', id, { sent_to_supplier: true, send_mode: p.send_mode }).catch(function () {});
    setTimeout(function () { SP.poOpen(id); }, 350);
  };
  SP.poWalkIn = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (p.fulfil === 'delivery' && !confirm('This one is being delivered, so there is no counter to walk into. Mark it handled anyway?')) return;
    SP.poSent(id, 'walkin');
  };
  /* several stops means several orders; walk them rather than leaving the
     rest buried in a list */
  SP.poNext = function () {
    var back = SP._back; SP._back = null;
    var next = SP.pos.filter(function (x) { return x.status === 'sent' && !x.sent_to_supplier; })[0];
    window.bpCloseModal();
    if (back) { setTimeout(function () { if (window.bpProjOpen) bpProjOpen(back); }, 250); return; }
    if (next) setTimeout(function () { SP.poOpen(next.id); }, 250);
    else if (window._bpCurView === 'supplyorders') window.bpSupplyOrders();
  };
  SP.copy = function (btn) { var t = btn.getAttribute('data-text') || ''; try { navigator.clipboard.writeText(t).then(function () { btn.textContent = 'Copied'; }); } catch (e) { alert(t); } };
  SP.printTicket = function (deliver) {
    var t = $('sp-ticket'); if (!t) return;
    var w = window.open('', '_blank', 'width=720,height=900'); if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write('<!doctype html><title>' + (deliver ? 'Delivery order' : 'Will-call ticket') + '</title><style>body{font:14px Geist,system-ui,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child,th:nth-child(4),td:nth-child(4){text-align:right}.sp-ticket-bar{text-align:center;margin:18px 0}.sp-ticket-num{font:600 18px ui-monospace,monospace;letter-spacing:.14em;margin-top:6px}.sp-ticket-h{display:flex;justify-content:space-between;gap:16px}.bpx-mut{color:#666}</style>' + t.innerHTML);
    w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 250);
  };
  SP.invoiceOpen = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    window.bpModal('<h3>Enter the supplier invoice</h3><div class="bpx-sub">' + esc(p.po_number) + '. Type what the supplier billed; the match to the job happens next.</div>'
      + '<div class="sp-r2">' + window.bpField('sp-inv-ref', 'Invoice number', p.invoice_ref || '', 'INV-88213') + window.bpField('sp-inv-total', 'Invoice total', p.invoice_total != null ? p.invoice_total : p.total, money(p.total)) + '</div>'
      + '<div class="bpx-mut" style="font-size:12.5px">PO total was ' + money(p.total) + '. Anything more than 2% off is flagged so you can call the branch.</div>'
      + '<div class="bpx-mmsg" id="sp-mmsg"></div><div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" onclick="SP.invoiceSave(\'' + id + '\')">Save invoice</button></div>');
  };
  SP.invoiceSave = function (id) {
    var ref = (($('sp-inv-ref') || {}).value || '').trim(), tot = +String(($('sp-inv-total') || {}).value).replace(/[^0-9.]/g, '');
    if (!(tot > 0)) { msg('sp-mmsg', 'Enter the invoice total.', true); return; }
    /* it moves to "Bill to check", so follow it there rather than letting it
       vanish from the tab they are looking at */
    db.update('purchase_orders', id, { status: 'invoiced', invoice_ref: ref, invoice_total: tot, invoiced_at: new Date().toISOString() }).then(function () { window.bpCloseModal(); SP.tab = 'orders_inv'; return load(true); }).catch(function (e) { msg('sp-mmsg', 'Could not save. ' + (e.message || ''), true); });
  };
  /* reconciliation: the invoice becomes a Materials expense on the job (or a
     standalone expense when the PO has no job), and the PO is closed */
  SP.reconcile = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p || p.invoice_total == null) return;
    var s = supById(p.supplier_id), note = p.po_number + (s ? ' ' + s.name : '') + (p.invoice_ref ? ' inv ' + p.invoice_ref : '');
    var key = 'sp' + p.id.slice(0, 8);
    try {
      var js = window.bpJobsGet ? bpJobsGet() : [], j = js.filter(function (x) { return x.id === p.job_id; })[0];
      if (j) { j.expenses = (j.expenses || []).filter(function (e) { return e.key !== key; }); j.expenses.push({ cat: 'Materials', amt: +p.invoice_total, note: note, key: key, when: Date.now() }); window.bpJobsSet(js); }
      else { var fin = window.bpFinGet ? bpFinGet() : []; fin = fin.filter(function (e) { return e.id !== key; }); fin.unshift({ id: key, kind: 'expense', amount: +p.invoice_total, category: 'Materials', note: note, when: Date.now() }); window.bpFinSet(fin); }
    } catch (e) { alert('Could not write the expense to Finances. ' + (e.message || '')); return; }
    return db.update('purchase_orders', id, { status: 'reconciled', reconciled_at: new Date().toISOString(), expense_key: key }).then(function () { return load(true); }).catch(function (e) { alert('Expense written, but the PO did not close. ' + (e.message || '')); });
  };
  SP.csv = function () {
    var rows = SP.pos.map(function (p) { var s = supById(p.supplier_id); return [p.po_number, s ? s.name : '', p.job_name || '', p.status, p.fulfil, p.lines.length, p.subtotal, p.fees, p.total, p.invoice_ref || '', p.invoice_total == null ? '' : p.invoice_total, p.sent_at, p.reconciled_at || '']; });
    window.bpCsv('purchase-orders', ['PO', 'Supplier', 'Job', 'Status', 'Fulfilment', 'Lines', 'Subtotal', 'Fees', 'Total', 'Invoice', 'Invoice total', 'Sent', 'Reconciled'], rows);
  };

  /* ---------- Code 128 (subset B) as inline SVG ---------- */
  var C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
  function barcodeSvg(text, w, h) {
    var codes = [104], sum = 104;
    for (var i = 0; i < text.length; i++) { var c = text.charCodeAt(i) - 32; if (c < 0 || c > 94) c = 0; codes.push(c); sum += c * (i + 1); }
    codes.push(sum % 103); codes.push(106);
    var pattern = codes.map(function (c) { return C128[c]; }).join('');
    var units = 0; for (var k = 0; k < pattern.length; k++) units += +pattern[k];
    var quiet = 10, scale = w / (units + quiet * 2), x = quiet * scale, bars = '';
    for (var m = 0; m < pattern.length; m++) { var wd = +pattern[m] * scale; if (m % 2 === 0) bars += '<rect x="' + x.toFixed(2) + '" y="0" width="' + wd.toFixed(2) + '" height="' + h + '"/>'; x += wd; }
    return '<svg class="sp-bc" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="Barcode ' + esc(text) + '" shape-rendering="crispEdges"><rect width="' + w + '" height="' + h + '" fill="#fff"/><g fill="#0b1021">' + bars + '</g></svg>';
  }
  /* ---------- the Materials tab on a project ----------
     Everything bought for this job, and the way to buy more, without leaving
     the project card. Opening an order from here comes back here. */
  window.bpProjMaterials = function (jobId) {
    var el = $('bpx-pj-mat'); if (!el) return;
    if (!SP.loaded) { el.innerHTML = '<div class="bpx-skel" style="width:60%"></div>'; load().then(function () { window.bpProjMaterials(jobId); }); return; }
    var pos = SP.pos.filter(function (p) { return p.job_id === jobId && p.status !== 'cancelled'; });
    var drafts = SP.lists.filter(function (l) { return l.job_id === jobId && l.status !== 'ordered'; });
    var spent = pos.reduce(function (t, p) { return t + (p.invoice_total != null ? +p.invoice_total : +p.total || 0); }, 0);
    var open = pos.filter(function (p) { return !p.sent_to_supplier && p.status === 'sent'; }).length;
    var label = function (p) {
      if (p.status === 'reconciled') return ['Bill matched', 'good'];
      if (p.status === 'invoiced') return ['Bill to check', 'warn'];
      if (p.status === 'picked_up') return ['Picked up, bill to come', ''];
      if (p.status === 'ready') return ['Ready at the counter', 'good'];
      if (!p.sent_to_supplier) return ['Not sent yet', 'warn'];
      return [p.send_mode === 'walkin' ? 'Showing at the counter' : p.fulfil === 'delivery' ? 'Delivery on its way' : 'Sent, being picked', ''];
    };
    el.innerHTML =
      (pos.length
        ? '<div class="sp-mat-sum"><b>' + money(spent) + '</b><span>on materials so far, across ' + pos.length + (pos.length === 1 ? ' order' : ' orders') + (open ? ' &middot; <em>' + open + ' not sent yet</em>' : '') + '</span></div>'
        : '<div class="sp-mat-sum"><b>Nothing ordered for this job yet.</b><span>Order it from here and it lands on this project and in Finances when the bill comes.</span></div>')
      + pos.map(function (p) {
        var s = supById(p.supplier_id) || {}, lb = label(p), tbc = p.lines.filter(function (l) { return l.tbc || l.price == null; }).length;
        return '<div class="sp-mat-row" onclick="SP._back=\'' + jobId + '\';SP.poOpen(\'' + p.id + '\')"><div class="sp-mat-who"><b>' + esc(s.name || 'Supplier') + '</b><span>' + esc(p.po_number) + ' &middot; ' + p.lines.length + (p.lines.length === 1 ? ' line' : ' lines') + (tbc ? ', ' + tbc + ' priced by them' : '') + ' &middot; ' + ago(Date.parse(p.sent_at)) + '</span></div>'
          + '<span class="sp-mat-st ' + lb[1] + '">' + lb[0] + '</span><b class="bpx-num">' + (p.invoice_total != null ? money(p.invoice_total) : tbc === p.lines.length ? '&mdash;' : money(p.total)) + '</b><span class="ms">chevron_right</span></div>';
      }).join('')
      + drafts.map(function (l) {
        var n = (l.items || []).filter(function (i) { return String(i.name || '').trim(); }).length;
        return '<div class="sp-mat-row draft" onclick="bpCloseModal();bpNav(\'supply\');setTimeout(function(){SP.pick(\'' + l.id + '\')},60)"><div class="sp-mat-who"><b>' + esc(l.name || 'Parts list') + '</b><span>started, not ordered &middot; ' + n + (n === 1 ? ' item' : ' items') + '</span></div><span class="sp-mat-st">Continue</span><span class="ms">chevron_right</span></div>';
      }).join('')
      + '<div class="sp-mat-acts"><button class="bpx-btn sp-inline" onclick="SP.newListFor(\'' + jobId + '\')"><span class="ms">add_shopping_cart</span>Order materials for this job</button>'
      + '<button class="bpx-rowbtn" onclick="bpCloseModal();bpNav(\'supplyorders\')">All orders</button></div>';
  };
  SP.newListFor = function (jobId) {
    var j = (window.bpJobsGet ? bpJobsGet() : []).filter(function (x) { return x.id === jobId; })[0];
    db.insert('parts_lists', { name: 'Parts for ' + (j ? j.name : 'the job'), job_id: jobId, job_name: j ? j.name : '', priority: SP.priority, status: 'draft', items: [] })
      .then(function (row) { SP.lists.unshift(row); SP.list = row; SP.plans = null; window.bpCloseModal(); window.bpNav('supply'); setTimeout(function () { var f = document.getElementById('sp-pk-q'); if (f) f.focus(); }, 80); })
      .catch(function (e) { alert('Could not start a list. ' + (e.message || '')); });
  };
  SP.barcode = barcodeSvg;
  SP.plan = plan;
  /* used by supply-scan.js */
  SP.db = db; SP.supById = supById; SP.itemsOf = itemsOf; SP.load = load; SP.money = money; SP.stockBadge = stockBadge;

  /* seed the signed-out tour so the pages have something to show */
  if (!live()) {
    SAMPLE_SUPPLIERS.forEach(function (s, k) { var row = Object.assign({ id: 'demo-s' + k, connection: { type: 'pricebook', sample: true }, email: '' }, s); mem.suppliers.push(row); sampleItems(row, k + 1).forEach(function (it) { mem.supplier_items.push(Object.assign({ id: uid('i') }, it)); }); });
  }
})();
