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
        row.owner = u.id;
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
        rows.forEach(function (r) { r.owner = u.id; });
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
    return '<div class="bpx-stats">' + t('Places you buy', SP.sup.length) + t('Prices we know', SP.items.length.toLocaleString()) + t('Ordered, not picked up', open, true) + t('Bills to check', unrec) + '</div>';
  }
  function tabs(active) {
    var t = [['supply', 'Order materials'], ['supplyorders', 'Orders']];
    if (active === 'suppliers') t.push(['suppliers', 'Where I buy']);
    return '<div class="bpx-jobtabs" style="margin-bottom:14px">' + t.map(function (x) { return '<button class="bpx-jt' + (x[0] === active ? ' on' : '') + '" onclick="bpNav(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div>';
  }
  /* The one line that makes the dependency visible: what we can price, and
     how to fix it. Every "why did it not find my item" question ends here. */
  function whereBar() {
    var n = SP.sup.length;
    if (!n) return '';
    var names = SP.sup.slice(0, 3).map(function (s) { return esc(s.name); }).join(', ') + (n > 3 ? ' and ' + (n - 3) + ' more' : '');
    return '<div class="sp-where"><span class="ms">storefront</span><div><b>We know prices at ' + names + '.</b>'
      + '<span class="bpx-mut">Buy somewhere else too? Photograph a bill from there and we will know their prices as well.</span></div>'
      + '<div class="sp-where-a"><button class="bpx-rowbtn primary" onclick="SP.scanOpen()">Photograph a bill</button>'
      + '<button class="bpx-rowbtn" onclick="bpNav(\'suppliers\')">See prices</button></div></div>';
  }
  function state() {
    if (SP.err) return '<div class="sp-note bad"><span class=ms>error</span>' + esc(SP.err) + ' <button class="bpx-rowbtn" onclick="SP.reload()">Retry</button></div>';
    if (!live()) return '<div class="sp-note warn"><span class=ms>warning</span>DEMO DATA. Sample suppliers and prices so you can try the flow. Sign in to use your own.</div>';
    return '';
  }
  SP.reload = function () { SP.loaded = false; load(true); };
  function skel() { return '<div class="bpx-panel"><div class="bpx-skel" style="width:40%"></div><div class="bpx-skel"></div><div class="bpx-skel" style="width:70%"></div></div>'; }

  /* ================================================================
     SUPPLIERS
     ================================================================ */
  window.bpSuppliers = function () {
    if (!SP.loaded) { $('bpxViewArea').innerHTML = tabs('suppliers') + skel(); load(); return; }
    var h = tabs('suppliers') + state() + kpis();
    h += '<div class="bpx-chead" style="margin-bottom:12px"><div class="bpx-ptitle" style="margin:0">Your supply houses<span class="lg2">contractor pricing and stock, per branch</span></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (SP.sup.length ? '' : '<button class="bpx-btn ghost sp-inline" onclick="SP.addSamples()">Add sample suppliers</button>') + '<button class="bpx-addbtn" onclick="SP.dirOpen()">+ Add supplier</button></div></div>';
    if (!SP.sup.length) h += firstRun();
    h += '<div class="sp-grid">' + SP.sup.map(supCard).join('') + '</div>';
    if (SP.sup.length) h += '<div class="sp-note"><span class="ms">storefront</span>Buying from somewhere else too? <b>Browse suppliers</b> lists the branch networks and online sellers that carry your trade, so a second bid on the same list is two taps. <button class="bpx-rowbtn" onclick="SP.dirOpen()">Browse suppliers</button></div>';
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
      : '<span class="bpx-badge">Price book</span> ' + (its.length ? its.length.toLocaleString() + ' items' + (stocked ? ', ' + stocked + ' with stock counts' : '') + (latest ? ', updated ' + ago(latest) : '') : 'empty');
    return '<div class="bpx-panel sp-sup">'
      + '<div class="sp-sup-h"><div><b>' + esc(s.name) + '</b><span class="bpx-mut">' + esc([s.branch, s.address].filter(Boolean).join(', ')) + '</span></div>'
      + '<div class="sp-drive">' + (s.drive_min != null ? '<b>' + s.drive_min + '</b> min' : '<b>?</b> min') + '</div></div>'
      + '<div class="sp-sup-meta">' + connLine + (learned ? ' <span class="sp-learn"><span class="ms">auto_awesome</span>' + learned + ' from your paperwork</span>' : '') + '</div>'
      + '<div class="sp-sup-meta bpx-mut">' + [s.tier ? esc(s.tier) + ' pricing' : '', s.account_no ? 'Acct ' + esc(s.account_no) : '', s.will_call ? 'Will-call' : '', s.delivery ? 'Delivery ' + (s.delivery_fee > 0 ? money(s.delivery_fee) + (s.delivery_min > 0 ? ', free over ' + money(s.delivery_min) : '') : 'free') : '', s.hours ? esc(s.hours) : ''].filter(Boolean).join(' &middot; ') + '</div>'
      + '<div class="sp-sup-acts">'
      + '<button class="bpx-rowbtn primary" onclick="SP.scanOpen()">Scan a quote</button>'
      + '<button class="bpx-rowbtn" onclick="SP.importOpen(\'' + s.id + '\')">Import CSV</button>'
      + (conn.type === 'api' ? '<button class="bpx-rowbtn primary" onclick="SP.sync(\'' + s.id + '\',this)">Sync stock</button>' : '<button class="bpx-rowbtn" onclick="SP.loadSample(\'' + s.id + '\')">' + (its.length ? 'Refresh sample stock' : 'Load sample catalog') + '</button>')
      + '<button class="bpx-rowbtn" onclick="SP.itemsOpen(\'' + s.id + '\')">View items</button>'
      + '<button class="bpx-rowbtn" onclick="SP.supOpen(\'' + s.id + '\')">Edit</button>'
      + window.bpDelBtn('SP.supDel(\'' + s.id + '\')', 'Remove supplier')
      + '</div></div>';
  }
  function ago(ts) { if (!ts) return 'never'; var m = Math.round((Date.now() - ts) / 60000); if (m < 2) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + 'h ago'; var d = Math.round(h / 24); return d + 'd ago'; }

  SP.addSamples = function () {
    var seq = Promise.resolve();
    SAMPLE_SUPPLIERS.forEach(function (s, k) {
      seq = seq.then(function () { return db.insert('suppliers', Object.assign({ connection: { type: 'pricebook', sample: true }, email: '' }, s)); })
        .then(function (row) { SP.sup.push(row); return db.upsertItems(sampleItems(row, k + 1)); });
    });
    seq.then(function () { SP.reload(); }).catch(function (e) { alert('Could not add sample suppliers. ' + (e.message || '')); });
  };
  SP.loadSample = function (id) {
    var s = supById(id); if (!s) return;
    db.upsertItems(sampleItems(s, SP.sup.indexOf(s) + 1)).then(function () { SP.reload(); }).catch(function (e) { alert('Could not load the sample catalog. ' + (e.message || '')); });
  };
  SP.supDel = function (id) {
    var s = supById(id); if (!s) return;
    if (!window.bpAskDel(s.name + ' and its price book')) return;
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
    var row = { name: name, kind: v('sp-s-kind') || 'custom', branch: v('sp-s-branch').trim(), address: v('sp-s-addr').trim(), drive_min: v('sp-s-drive') === '' ? null : Math.max(0, parseInt(v('sp-s-drive'), 10) || 0),
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
  /* The cold start decides whether any of this gets used. One instruction,
     one button, and the three steps drawn out so the point is visible before
     any work is done. Everything else is a grey link underneath. */
  function firstRun(where) {
    var step = function (n, t, sub) { return '<div class="sp-step"><span>' + n + '</span><div><b>' + t + '</b><small>' + sub + '</small></div></div>'; };
    return '<div class="bpx-panel sp-start">'
      + '<div class="sp-start-top"><span class="ms">photo_camera</span>'
        + '<h3>Photograph a bill from your supply house</h3>'
        + '<p>Any invoice or quote, however old. We read what they charge <b>you</b>, and from then on we can tell you where each job is cheapest to buy.</p>'
        + '<button class="bpx-btn sp-start-go" onclick="SP.scanOpen()">Take a photo</button>'
        + '<div class="sp-start-alt">Nothing to hand? <button class="bpx-linkbtn" onclick="SP.addSamples()">Look around with example data</button> or <button class="bpx-linkbtn" onclick="SP.dirOpen()">type a supply house in</button></div>'
      + '</div>'
      + '<div class="sp-steps">'
        + step(1, 'Photograph a bill', 'We learn your prices at that supply house')
        + step(2, 'Say what the job needs', 'Pick the job type and the size, the list fills itself in')
        + step(3, 'We tell you where to buy', 'Cheapest, or closest. Then send the order from your phone')
      + '</div></div>';
  }
  window.bpSupply = function () {
    if (!SP.loaded) { $('bpxViewArea').innerHTML = tabs('supply') + skel(); load(); return; }
    var L = SP.list;
    var h = tabs('supply') + state() + kpis();
    if (!SP.sup.length) {
      $('bpxViewArea').innerHTML = tabs('supply') + state() + firstRun(); return;
    }
    h += whereBar();
    /* list picker + builder */
    var open = SP.lists.filter(function (l) { return l.status === 'draft' || l.status === 'sourced'; });
    h += '<div class="sp-two"><div class="bpx-panel">'
      + '<div class="bpx-chead"><div class="bpx-ptitle" style="margin:0">What the job needs<span class="lg2">pick the job type, put in the size</span></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap"><select id="sp-list-pick" onchange="SP.pick(this.value)" class="sp-sel"><option value="">' + (open.length ? 'Open a list you started' : 'Nothing started yet') + '</option>' + open.map(function (l) { return '<option value="' + l.id + '"' + (L && L.id === l.id ? ' selected' : '') + '>' + esc(l.name) + (l.job_name ? ' (' + esc(l.job_name) + ')' : '') + '</option>'; }).join('') + '</select><button class="bpx-btn ghost sp-inline" onclick="SP.newList(true)">Type it myself</button><button class="bpx-addbtn" onclick="SP.kitOpen()">+ Pick the job</button></div></div>';
    if (!L) h += '<div class="sp-kitcue"><span class="ms">auto_awesome_motion</span><div><b>Pick the job, put in the size.</b><span class="bpx-mut">Say "re-roof, 25 squares" and the shingles, underlayment, starter, ridge cap, drip edge and nails fill in at the right counts. Change any line before you order.</span></div><button class="bpx-btn sp-inline" onclick="SP.kitOpen()">Pick the job</button></div>';
    else {
      var js = jobs();
      h += '<div class="sp-r2" style="margin-top:12px"><div><label>List name</label><input id="sp-l-name" value="' + esc(L.name) + '" onchange="SP.listMeta()"></div><div><label>Job</label><select id="sp-l-job" onchange="SP.listMeta()"><option value="">No job (overhead)</option>' + js.map(function (j) { return '<option value="' + j.id + '"' + (L.job_id === j.id ? ' selected' : '') + '>' + esc(j.name + (j.title ? ', ' + j.title : '')) + '</option>'; }).join('') + '</select></div></div>'
        + '<div class="sp-items"><div class="sp-item sp-head"><span>Item</span><span>Qty</span><span>Unit</span><span></span></div>'
        + (L.items || []).map(function (it, k) { return '<div class="sp-item"><input value="' + esc(it.name) + '" placeholder="What do you need" oninput="SP.itemEdit(' + k + ',\'name\',this.value)" list="sp-dl"><input value="' + esc(it.qty) + '" inputmode="decimal" oninput="SP.itemEdit(' + k + ',\'qty\',this.value)"><input value="' + esc(it.unit || '') + '" placeholder="ea" oninput="SP.itemEdit(' + k + ',\'unit\',this.value)"><button class="sp-x" onclick="SP.itemDel(' + k + ')" aria-label="Remove">&times;</button></div>'; }).join('')
        + '</div><datalist id="sp-dl">' + uniqNames().slice(0, 300).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center"><button class="bpx-rowbtn" onclick="SP.itemAdd()">+ Add item</button><button class="bpx-rowbtn" onclick="SP.kitSaveOpen()">Save as a kit</button><span class="bpx-mut" style="font-size:12.5px">Start typing and we suggest what your supply houses carry.</span></div>'
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
    db.insert('parts_lists', { name: 'Parts for ' + (j ? j.name : 'the next job'), job_id: j ? j.id : '', job_name: j ? j.name : '', priority: SP.priority, status: 'draft', items: [{ key: uid('k'), name: '', qty: 1, unit: 'ea' }] })
      .then(function (row) { SP.lists.unshift(row); SP.list = row; SP.plans = null; window.bpSupply(); var f = document.querySelector('.sp-item:not(.sp-head) input'); if (f) f.focus(); })
      .catch(function (e) { alert('Could not start a list. ' + (e.message || '')); });
  };
  var saveT = null;
  function saveList() { var L = SP.list; if (!L) return; clearTimeout(saveT); saveT = setTimeout(function () { db.update('parts_lists', L.id, { name: L.name, job_id: L.job_id || '', job_name: L.job_name || '', priority: SP.priority, items: L.items }).catch(function () {}); }, 500); }
  SP.listMeta = function () { var L = SP.list; if (!L) return; L.name = ($('sp-l-name') || {}).value || L.name; var jid = ($('sp-l-job') || {}).value || ''; L.job_id = jid; var j = jobs().filter(function (x) { return x.id === jid; })[0]; L.job_name = j ? j.name : ''; saveList(); };
  SP.itemEdit = function (k, f, v) { var it = (SP.list.items || [])[k]; if (!it) return; it[f] = f === 'qty' ? (+String(v).replace(/[^0-9.]/g, '') || 0) : v; SP.plans = null; saveList(); };
  SP.itemAdd = function () { SP.list.items = SP.list.items || []; SP.list.items.push({ key: uid('k'), name: '', qty: 1, unit: 'ea' }); saveList(); window.bpSupply(); var ins = document.querySelectorAll('.sp-item:not(.sp-head) input'); if (ins.length) ins[ins.length - 3].focus(); };
  SP.itemDel = function (k) { SP.list.items.splice(k, 1); SP.plans = null; saveList(); window.bpSupply(); };
  SP.setPrio = function (p) { SP.priority = p; if (SP.list) { SP.list.priority = p; saveList(); } window.bpSupply(); };
  SP.costOpen = function () {
    window.bpModal('<h3>What a trip to the supply house costs you</h3><div class="bpx-sub">Used by "cheapest" so a $6 saving never sends a tech across town.</div><div class="sp-r2">' + window.bpField('sp-c-stop', 'Per stop (loading, counter, paperwork)', SP.cost.stop, '60') + window.bpField('sp-c-min', 'Per minute of driving (truck + tech)', SP.cost.min, '1.20') + '</div><div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" onclick="SP.costSave()">Save</button></div>');
  };
  SP.costSave = function () { SP.cost = { stop: +String(($('sp-c-stop') || {}).value).replace(/[^0-9.]/g, '') || 0, min: +String(($('sp-c-min') || {}).value).replace(/[^0-9.]/g, '') || 0 }; try { localStorage.setItem('bpSupplyCost', JSON.stringify(SP.cost)); } catch (e) {} window.bpCloseModal(); SP.plans = null; window.bpSupply(); };

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
      var sub = ls.reduce(function (t, x) { return t + x.qty * x.price; }, 0);
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
    if (!cands.length) return null;
    var covered = function (c) { return lines.length - c.missing.length; };
    cands.sort(function (a, b) {
      if (covered(b) !== covered(a)) return covered(b) - covered(a);
      if (mode === 'fastest') return (a.minutes - b.minutes) || (a.stopsN - b.stopsN) || (a.total - b.total);
      return (a.total - b.total) || (a.minutes - b.minutes);
    });
    return cands[0];
  }
  SP.run = function () {
    var L = SP.list; if (!L) return;
    var lines = (L.items || []).filter(function (i) { return String(i.name).trim() && +i.qty > 0; }).map(function (i) { return { key: i.key, name: i.name, qty: +i.qty, unit: i.unit }; });
    if (!lines.length) { alert('Add at least one item with a quantity.'); return; }
    if (!SP.items.length) { alert('We do not know any prices yet. Photograph a bill from your supply house and we will learn them off it.'); return; }
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
        + '<div class="sp-plan-big"><span>' + money(p.total) + '</span><small>' + (p.stopsN === 1 ? '1 stop' : p.stopsN + ' stops') + (p.stops.every(function (st) { return st.fulfil === 'delivery'; }) ? ', delivered' : ', about ' + p.stops.reduce(function (t, st) { return t + (st.fulfil === 'delivery' ? 0 : st.drive * 2); }, 0) + ' min round trip') + '</small></div>'
        + '<div class="sp-plan-sub bpx-mut">Parts ' + money(p.parts) + (p.run ? ' + your time and truck ' + money(p.run) : '') + '</div>'
        + p.stops.map(function (st) {
          return '<div class="sp-stop"><div class="sp-stop-h"><b>' + esc(st.supplier.name) + '</b><span class="bpx-mut">' + (st.fulfil === 'delivery' ? 'Delivery' + (st.fees ? ' ' + money(st.fees) : ', free') : (st.supplier.drive_min != null ? st.supplier.drive_min + ' min away' : 'drive time unknown') + ', will-call') + '</span><span class="sp-stop-t">' + money(st.subtotal) + '</span></div>'
            + '<div class="sp-lines">' + st.lines.map(function (x) { return '<div class="sp-line"><span>' + x.qty + ' &times; ' + esc(x.name) + (x.score < 0.85 ? ' <em class="bpx-mut">(matched from "' + esc(x.line.name) + '")</em>' : '') + '</span>' + stockBadge(x.item, x.qty) + '<span class="bpx-num">' + money(x.qty * x.price) + '</span></div>'; }).join('') + '</div></div>';
        }).join('')
        + (p.missing.length ? '<div class="sp-note warn" style="margin-top:8px"><span class=ms>help</span>We have no price for <b>' + p.missing.map(function (m) { return esc(m.name); }).join('</b>, <b>') + '</b>. That just means we have never seen a bill with it on. Photograph one from wherever you buy it and it will be priced from now on. <button class="bpx-rowbtn" onclick="SP.scanOpen()">Photograph a bill</button></div>' : '')
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
        lines: st.lines.map(function (x) { return { sku: x.sku, name: x.name, qty: x.qty, unit: x.unit, price: x.price }; }),
        subtotal: Math.round(st.subtotal * 100) / 100, fees: Math.round(st.fees * 100) / 100, total: Math.round((st.subtotal + st.fees) * 100) / 100, job_id: L.job_id || '', job_name: L.job_name || '', sent_at: new Date().toISOString() };
      seq = seq.then(function () { return db.insert('purchase_orders', row); }).then(function (r) { made.push(r); });
    });
    seq.then(function () { return db.update('parts_lists', L.id, { status: 'ordered' }); })
      .then(function () { L.status = 'ordered'; SP.list = null; SP.plans = null; SP.tab = 'orders_open'; return load(true); })
      .then(function () { window.bpNav('supplyorders'); if (made[0]) SP.poOpen(made[0].id); })
      .catch(function (e) { alert('Could not send the order. ' + (e.message || '')); });
  };
  window.bpSupplyOrders = function () {
    if (!SP.loaded) { $('bpxViewArea').innerHTML = tabs('supplyorders') + skel(); load(); return; }
    var t = [['orders_open', 'Waiting on me'], ['orders_inv', 'Bill to check'], ['orders_done', 'Finished'], ['orders_all', 'Everything']];
    var rows = SP.pos.filter(function (p) {
      if (SP.tab === 'orders_open') return p.status === 'sent' || p.status === 'ready' || p.status === 'picked_up';
      if (SP.tab === 'orders_inv') return p.status === 'invoiced';
      if (SP.tab === 'orders_done') return p.status === 'reconciled';
      return true;
    });
    var h = tabs('supplyorders') + state() + kpis()
      + '<div class="bpx-chead" style="margin-bottom:12px"><div class="bpx-jobtabs" style="flex-wrap:wrap">' + t.map(function (x) { return '<button class="bpx-jt' + (SP.tab === x[0] ? ' on' : '') + '" onclick="SP.tab=\'' + x[0] + '\';bpSupplyOrders()">' + x[1] + '</button>'; }).join('') + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">' + window.bpCsvBtn('SP.csv()', 'Export CSV') + '<button class="bpx-btn ghost sp-inline" onclick="SP.scanOpen()">Photograph a bill</button><button class="bpx-addbtn" onclick="bpNav(\'supply\')">+ Order materials</button></div></div>';
    if (SP.won) { h += '<div class="sp-note good"><span class="ms">savings</span>' + esc(SP.won) + ' Show the barcode at the counter, then photograph the bill when you get it so it lands on the job.</div>'; SP.won = ''; }
    if (!rows.length) h += '<div class="bpx-panel"><div class="bpx-empty2">' + (SP.pos.length ? 'Nothing in here right now.' : 'Nothing ordered yet. Order materials for a job and it lands here with a barcode you show at the counter.') + '</div></div>';
    h += '<div class="sp-grid">' + rows.map(poCard).join('') + '</div>';
    $('bpxViewArea').innerHTML = h;
  };
  var STATUS = { sent: ['Ordered', ''], ready: ['Ready to collect', ''], picked_up: ['Picked up', ''], invoiced: ['Bill needs checking', 'warn'], reconciled: ['Done', ''], cancelled: ['Cancelled', 'warn'] };
  function poCard(p) {
    var s = supById(p.supplier_id), st = STATUS[p.status] || [p.status, ''];
    var next = p.status === 'sent' ? '<button class="bpx-rowbtn" onclick="SP.poStatus(\'' + p.id + '\',\'ready\')">They say it is ready</button>'
      : p.status === 'ready' ? '<button class="bpx-rowbtn primary" onclick="SP.pickupOpen(\'' + p.id + '\')">Picked up</button>'
      : p.status === 'picked_up' ? '<button class="bpx-rowbtn primary" onclick="SP.scanOpen(\'' + p.id + '\')">Photograph the bill</button><button class="bpx-rowbtn" onclick="SP.invoiceOpen(\'' + p.id + '\')">Type it in</button>'
      : p.status === 'invoiced' ? '<button class="bpx-rowbtn primary" onclick="SP.reconcile(\'' + p.id + '\')">Put it on the job</button>' : '';
    var variance = p.invoice_total != null ? p.invoice_total - p.total : null;
    return '<div class="bpx-panel sp-po">'
      + '<div class="sp-po-h"><div><b>' + esc(p.po_number) + '</b><span class="bpx-mut">' + esc(s ? s.name : 'Supplier removed') + (p.job_name ? ' &middot; ' + esc(p.job_name) : '') + '</span></div><span class="bpx-badge' + (st[1] ? ' ' + st[1] : '') + '">' + st[0] + '</span></div>'
      + '<div class="sp-barcode" onclick="SP.poOpen(\'' + p.id + '\')" title="Open the will-call ticket">' + barcodeSvg(p.po_number, 220, 46) + '<span>' + esc(p.po_number) + '</span></div>'
      + '<div class="sp-po-meta bpx-mut">' + p.lines.length + ' line' + (p.lines.length === 1 ? '' : 's') + ' &middot; ' + (p.fulfil === 'delivery' ? 'Delivery' : 'Will-call') + ' &middot; sent ' + ago(Date.parse(p.sent_at)) + '</div>'
      + '<div class="sp-po-tot"><span>What you ordered</span><b>' + money(p.total) + '</b></div>'
      + (variance != null ? '<div class="sp-po-tot"><span>What they billed ' + esc(p.invoice_ref || '') + '</span><b class="' + (Math.abs(variance) > Math.max(2, p.total * 0.02) ? 'bpx-neg' : '') + '">' + money(p.invoice_total) + (Math.abs(variance) >= 0.01 ? ' <small>(' + (variance > 0 ? '+' : '') + money(variance) + ')</small>' : '') + '</b></div>' : '')
      + '<div class="sp-sup-acts">' + next + '<button class="bpx-rowbtn" onclick="SP.poOpen(\'' + p.id + '\')">Counter ticket</button>' + (p.status !== 'reconciled' && p.status !== 'cancelled' ? window.bpDelBtn('SP.poStatus(\'' + p.id + '\',\'cancelled\')', 'Cancel this order') : '') + '</div>'
      + '</div>';
  }
  SP.poStatus = function (id, status) {
    if (status === 'cancelled' && !confirm('Cancel this order?')) return;
    var patch = { status: status }; if (status === 'picked_up') patch.picked_up_at = new Date().toISOString();
    db.update('purchase_orders', id, patch).then(function () { return load(true); }).catch(function (e) { alert('Could not update. ' + (e.message || '')); });
  };
  SP.poOpen = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var s = supById(p.supplier_id) || {}, co = ((window.bpSettingsGet && bpSettingsGet().company) || {});
    var text = 'PURCHASE ORDER ' + p.po_number + '\nFrom: ' + (co.name || 'Our company') + (co.phone ? ', ' + co.phone : '') + '\nTo: ' + (s.name || '') + (s.branch ? ', ' + s.branch : '') + (s.account_no ? '\nAccount: ' + s.account_no : '') + (p.job_name ? '\nJob: ' + p.job_name : '') + '\n\n' + p.lines.map(function (l) { return l.qty + ' x ' + l.name + ' [' + l.sku + '] @ ' + money(l.price); }).join('\n') + '\n\nSubtotal ' + money(p.subtotal) + (p.fees ? '\nDelivery ' + money(p.fees) : '') + '\nTotal ' + money(p.total) + '\n' + (p.fulfil === 'delivery' ? 'Please deliver.' : 'Will-call pickup. Tech will present this PO number.');
    var mail = s.email ? 'mailto:' + encodeURIComponent(s.email) + '?subject=' + encodeURIComponent('PO ' + p.po_number + ' from ' + (co.name || 'BuilderPro client')) + '&body=' + encodeURIComponent(text) : '';
    window.bpModal('<div class="sp-ticket" id="sp-ticket">'
      + '<div class="sp-ticket-h"><div><div class="bpx-mut" style="font-size:12px">Will-call ticket</div><b style="font-size:20px">' + esc(p.po_number) + '</b></div><div style="text-align:right"><b>' + esc(s.name || '') + '</b><div class="bpx-mut">' + esc(s.branch || '') + (s.account_no ? ' &middot; Acct ' + esc(s.account_no) : '') + '</div></div></div>'
      + '<div class="sp-ticket-bar">' + barcodeSvg(p.po_number, 420, 90) + '<div class="sp-ticket-num">' + esc(p.po_number) + '</div></div>'
      + '<table class="bpx-ctable"><thead><tr><th>Qty</th><th>Item</th><th>SKU</th><th class="bpx-r">Each</th><th class="bpx-r">Total</th></tr></thead><tbody>' + p.lines.map(function (l) { return '<tr><td>' + l.qty + '</td><td>' + esc(l.name) + '</td><td class="bpx-mut">' + esc(l.sku) + '</td><td class="bpx-r bpx-num">' + money(l.price) + '</td><td class="bpx-r bpx-num">' + money(l.qty * l.price) + '</td></tr>'; }).join('') + '</tbody></table>'
      + '<div class="sp-po-tot" style="margin-top:8px"><span>' + (p.fees ? 'Parts ' + money(p.subtotal) + ' + delivery ' + money(p.fees) : 'Total') + '</span><b>' + money(p.total) + '</b></div>'
      + '<div class="bpx-mut" style="font-size:12.5px;margin-top:8px">' + esc(co.name || '') + (p.job_name ? ' &middot; Job: ' + esc(p.job_name) : '') + ' &middot; ' + (p.fulfil === 'delivery' ? 'Delivery' : 'Will-call: the counter scans this code or keys the PO number') + '</div>'
      + '</div>'
      + '<div class="row" style="flex-wrap:wrap">' + (mail ? '<a class="bpx-btn sp-inline" href="' + mail + '">Email to ' + esc(s.name || 'supplier') + '</a>' : '<button class="bpx-btn sp-inline" onclick="SP.copy(this)" data-text="' + esc(text) + '">Copy PO text</button>') + '<button class="bpx-btn ghost sp-inline" onclick="SP.printTicket()">Print</button>' + (mail ? '<button class="bpx-btn ghost sp-inline" onclick="SP.copy(this)" data-text="' + esc(text) + '">Copy</button>' : '') + '<button class="bpx-btn ghost sp-inline" onclick="bpCloseModal()">Close</button></div>');
    document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '640px';
  };
  SP.copy = function (btn) { var t = btn.getAttribute('data-text') || ''; try { navigator.clipboard.writeText(t).then(function () { btn.textContent = 'Copied'; }); } catch (e) { alert(t); } };
  SP.printTicket = function () {
    var t = $('sp-ticket'); if (!t) return;
    var w = window.open('', '_blank', 'width=720,height=900'); if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write('<!doctype html><title>Will-call ticket</title><style>body{font:14px Geist,system-ui,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child,th:nth-child(4),td:nth-child(4){text-align:right}.sp-ticket-bar{text-align:center;margin:18px 0}.sp-ticket-num{font:600 18px ui-monospace,monospace;letter-spacing:.14em;margin-top:6px}.sp-ticket-h{display:flex;justify-content:space-between;gap:16px}.bpx-mut{color:#666}</style>' + t.innerHTML);
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
    db.update('purchase_orders', id, { status: 'invoiced', invoice_ref: ref, invoice_total: tot, invoiced_at: new Date().toISOString() }).then(function () { window.bpCloseModal(); return load(true); }).catch(function (e) { msg('sp-mmsg', 'Could not save. ' + (e.message || ''), true); });
  };
  /* reconciliation: the invoice becomes a Materials expense on the job (or a
     standalone expense when the PO has no job), and the PO is closed */
  SP.reconcile = function (id) {
    var p = SP.pos.filter(function (x) { return x.id === id; })[0]; if (!p || p.invoice_total == null) return;
    var s = supById(p.supplier_id), note = p.po_number + (s ? ' ' + s.name : '') + (p.invoice_ref ? ' inv ' + p.invoice_ref : '');
    var key = 'sp' + p.id.slice(0, 8);
    try {
      var js = window.bpJobsGet ? bpJobsGet() : [], j = js.filter(function (x) { return x.id === p.job_id; })[0];
      if (j) { j.expenses = (j.expenses || []).filter(function (e) { return e.key !== key; }); j.expenses.push({ cat: 'Materials', amt: +p.invoice_total, note: note, key: key }); window.bpJobsSet(js); }
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
  SP.barcode = barcodeSvg;
  SP.plan = plan;
  /* used by supply-scan.js */
  SP.db = db; SP.supById = supById; SP.itemsOf = itemsOf; SP.load = load; SP.money = money; SP.stockBadge = stockBadge;

  /* seed the signed-out tour so the pages have something to show */
  if (!live()) {
    SAMPLE_SUPPLIERS.forEach(function (s, k) { var row = Object.assign({ id: 'demo-s' + k, connection: { type: 'pricebook', sample: true }, email: '' }, s); mem.suppliers.push(row); sampleItems(row, k + 1).forEach(function (it) { mem.supplier_items.push(Object.assign({ id: uid('i') }, it)); }); });
  }
})();
