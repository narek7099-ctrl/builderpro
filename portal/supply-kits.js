/* ==================================================================
   Job kits: a contractor thinks in squares, not in twelve line items.

   Pick the job and the size, and the materials list fills itself with
   quantities scaled to that size. The built-in kits are typical rules of
   thumb, editable on the spot, and saveable so the second job uses the
   contractor's own numbers instead of ours.

   Extends window.SP from supply.js.
   ================================================================== */
(function () {
  'use strict';
  var SP = window.SP; if (!SP) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.bpEsc;
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var uid = function (p) { return (p || 'k') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

  /* An item is either a fixed count or a rate per unit of job size.
     qty = fixed, or ceil(size * per), never below 1. */
  var K = function (n, u, per, fixed) { return { n: n, u: u, per: per || 0, fixed: fixed || 0 }; };

  var BUILTIN = {
    Roofing: [
      { id: 'reroof', name: 'Re-roof, architectural', blurb: 'Tear-off and lay new architectural shingles', unitLabel: 'squares', size: 25, items: [
        K('Architectural shingles, 3-bundle sq', 'bundle', 3),
        K('Synthetic underlayment, 10 sq roll', 'roll', 0.1),
        K('Ice and water shield, 2 sq roll', 'roll', 0.06),
        K('Starter strip, 100 lf', 'bundle', 0.12),
        K('Ridge cap shingles, 20 lf bundle', 'bundle', 0.14),
        K('Aluminum drip edge, 10 ft', 'ea', 0.9),
        K('Roofing nails 1-1/4 in, 30 lb', 'box', 0.05),
        K('Pipe boot flashing, 3 in', 'ea', 0, 3),
        K('Step flashing 4x4x8, 100 ct', 'box', 0, 1),
        K('Roof cement, 10 oz tube', 'ea', 0, 2),
      ] },
      { id: 'ridgevent', name: 'Ridge vent run', blurb: 'Cut in and cap a ridge', unitLabel: 'linear feet', size: 40, items: [
        K('Ridge vent, 4 ft', 'ea', 0.25),
        K('Ridge cap shingles, 20 lf bundle', 'bundle', 0.05),
        K('Roofing nails 1-1/4 in, 30 lb', 'box', 0, 1),
        K('Roof cement, 10 oz tube', 'ea', 0, 2),
      ] },
      { id: 'repair', name: 'Repair call', blurb: 'Patch, a few squares and the sundries', unitLabel: 'squares', size: 3, items: [
        K('Architectural shingles, 3-bundle sq', 'bundle', 3),
        K('Synthetic underlayment, 10 sq roll', 'roll', 0, 1),
        K('Roof cement, 10 oz tube', 'ea', 0, 2),
        K('Pipe boot flashing, 3 in', 'ea', 0, 1),
        K('Roofing nails 1-1/4 in, 30 lb', 'box', 0, 1),
      ] },
    ],
    HVAC: [
      { id: 'changeout', name: 'Condenser changeout', blurb: 'Swap the outdoor unit and tie it back in', unitLabel: 'tons', size: 3, items: [
        K('R-410A refrigerant, 25 lb', 'cyl', 0, 1),
        K('Line set 3/4 x 3/8, 50 ft', 'ea', 0, 1),
        K('Contactor 2-pole 30A', 'ea', 0, 1),
        K('Run capacitor 45/5 MFD', 'ea', 0, 1),
        K('Disconnect box 60A', 'ea', 0, 1),
        K('Pad 36x36 in', 'ea', 0, 1),
      ] },
      { id: 'ducting', name: 'Duct run', blurb: 'Flex duct, boots and sealing', unitLabel: 'runs', size: 6, items: [
        K('Flex duct R8 8 in, 25 ft', 'ea', 1),
        K('Duct tape foil, roll', 'ea', 0.5),
      ] },
      { id: 'servicetruck', name: 'Service truck restock', blurb: 'The parts that always run out', unitLabel: 'trucks', size: 1, items: [
        K('Run capacitor 45/5 MFD', 'ea', 4),
        K('Contactor 2-pole 30A', 'ea', 3),
        K('Condensate pump', 'ea', 2),
        K('Pleated filter 16x25x1, 12 pk', 'case', 1),
        K('Smart thermostat', 'ea', 2),
      ] },
    ],
    Plumbing: [
      { id: 'wh', name: 'Water heater swap', blurb: 'Pull the old tank, set and connect the new one', unitLabel: 'heaters', size: 1, items: [
        K('Water heater 50 gal gas', 'ea', 1),
        K('Ball valve 3/4 in', 'ea', 2),
        K('Supply line 3/8 x 12 in braided', 'ea', 2),
        K('Expansion tank 2 gal', 'ea', 1),
        K('Pressure regulator 3/4 in', 'ea', 0, 1),
        K('Solder lead-free, 1 lb', 'ea', 0, 1),
      ] },
      { id: 'repipe', name: 'Repipe', blurb: 'PEX through the house, by fixture count', unitLabel: 'fixtures', size: 8, items: [
        K('PEX-A 1/2 in, 100 ft', 'roll', 0.3),
        K('PEX-A 3/4 in, 100 ft', 'roll', 0.15),
        K('Expansion fitting 3/4 elbow, 10 pk', 'bag', 0.3),
        K('Ball valve 3/4 in', 'ea', 0.5),
      ] },
      { id: 'bath', name: 'Bathroom rough-in', blurb: 'Supply and drain for one bath', unitLabel: 'baths', size: 1, items: [
        K('P-trap 1-1/2 in PVC', 'ea', 2), K('PVC 2 in sch 40, 10 ft', 'ea', 3),
        K('Wax ring with flange', 'ea', 1), K('Supply line 3/8 x 12 in braided', 'ea', 3),
        K('PEX-A 1/2 in, 100 ft', 'roll', 0, 1),
      ] },
    ],
    Electrical: [
      { id: 'panel', name: 'Panel upgrade', blurb: 'Service panel and the breakers to fill it', unitLabel: 'panels', size: 1, items: [
        K('Panel 200A 40-space', 'ea', 1),
        K('Breaker 20A single pole', 'ea', 12), K('Breaker 50A double pole', 'ea', 2),
        K('Romex 12/2 NM-B, 250 ft', 'roll', 0, 1), K('Wire nuts assorted, 100 ct', 'box', 0, 1),
      ] },
      { id: 'circuits', name: 'New circuits', blurb: 'Rough-in by circuit count', unitLabel: 'circuits', size: 6, items: [
        K('Romex 12/2 NM-B, 250 ft', 'roll', 0.34), K('Single gang box, 25 pk', 'box', 0.15),
        K('Duplex receptacle 20A TR, 10 pk', 'box', 0.25), K('Breaker 20A single pole', 'ea', 1),
        K('Wire nuts assorted, 100 ct', 'box', 0, 1),
      ] },
      { id: 'lighting', name: 'Recessed lighting', blurb: 'Cans, switches and the wire between', unitLabel: 'fixtures', size: 12, items: [
        K('LED recessed 6 in, 6 pk', 'case', 0.17), K('Romex 14/2 NM-B, 250 ft', 'roll', 0.1),
        K('Decora switch, 10 pk', 'box', 0.1), K('Wire nuts assorted, 100 ct', 'box', 0, 1),
      ] },
    ],
    Painting: [
      { id: 'interior', name: 'Interior repaint', blurb: 'Walls and ceilings, two coats', unitLabel: 'sq ft of wall', size: 1800, items: [
        K('Interior paint eggshell, 5 gal', 'ea', 0.0024), K('Primer PVA, 5 gal', 'ea', 0.0012),
        K('Painter tape 1.5 in, 6 pk', 'pk', 0.0008), K('Drop cloth canvas 9x12', 'ea', 0.002),
        K('Roller cover 9 in 3/8 nap, 6 pk', 'pk', 0, 1), K('Joint compound, 4.5 gal', 'ea', 0, 1),
      ] },
      { id: 'exterior', name: 'Exterior repaint', blurb: 'Body and trim, prep included', unitLabel: 'sq ft of wall', size: 2400, items: [
        K('Exterior paint satin, 5 gal', 'ea', 0.0026), K('Primer PVA, 5 gal', 'ea', 0.001),
        K('Caulk paintable, 12 pk', 'case', 0.0006), K('Painter tape 1.5 in, 6 pk', 'pk', 0.0006),
        K('Sanding sponges, 12 pk', 'pk', 0, 1),
      ] },
    ],
    Landscaping: [
      { id: 'sod', name: 'Sod and prep', blurb: 'Strip, topsoil and lay turf', unitLabel: 'sq ft', size: 2000, items: [
        K('Sod bermuda, pallet', 'pallet', 0.002), K('Topsoil screened, cu yd', 'yd', 0.004),
        K('Landscape fabric 4x100 ft', 'roll', 0, 1),
      ] },
      { id: 'beds', name: 'Beds and mulch', blurb: 'Edge, plant and mulch the beds', unitLabel: 'sq ft of bed', size: 600, items: [
        K('Mulch hardwood, cu yd', 'yd', 0.006), K('Edging steel 8 ft', 'ea', 0.04),
        K('Shrub 3 gal, boxwood', 'ea', 0.02), K('Landscape fabric 4x100 ft', 'roll', 0.0025),
      ] },
      { id: 'irrigation', name: 'Irrigation zone', blurb: 'Heads and tubing per zone', unitLabel: 'zones', size: 4, items: [
        K('Sprinkler head 4 in pop-up, 25 pk', 'case', 0.3), K('Drip tubing 1/2 in, 100 ft', 'roll', 1),
      ] },
    ],
    Concrete: [
      { id: 'flatwork', name: 'Flatwork pour', blurb: 'Drive, patio or walk at 4 inches', unitLabel: 'sq ft', size: 600, items: [
        K('Ready mix 3000 psi, cu yd', 'yd', 0.0124), K('Rebar #4 20 ft', 'ea', 0.02),
        K('Wire mesh 6x6 sheet', 'ea', 0.02), K('Form lumber 2x4x8', 'ea', 0.05),
        K('Form stakes 24 in, 25 pk', 'bundle', 0.006), K('Expansion joint 4 in x 50 ft', 'roll', 0.004),
        K('Vapor barrier 10 mil, 20x100', 'roll', 0.0005), K('Curing compound, 5 gal', 'ea', 0.001),
      ] },
      { id: 'footing', name: 'Footings', blurb: 'Trench pour by linear foot', unitLabel: 'linear feet', size: 120, items: [
        K('Ready mix 3000 psi, cu yd', 'yd', 0.017), K('Rebar #4 20 ft', 'ea', 0.15),
        K('Anchor bolt 1/2 x 10, 50 pk', 'box', 0.01), K('Form lumber 2x4x8', 'ea', 0.2),
      ] },
    ],
  };

  function tradeKey() {
    var t = String((((window.bpSettingsGet && bpSettingsGet().company) || {}).trade) || 'Roofing').toLowerCase();
    var k = Object.keys(BUILTIN).filter(function (x) { return t.indexOf(x.toLowerCase()) >= 0; })[0];
    if (k) return k;
    if (t.indexOf('plumb') >= 0) return 'Plumbing';
    if (t.indexOf('electr') >= 0) return 'Electrical';
    if (t.indexOf('hvac') >= 0 || t.indexOf('air') >= 0 || t.indexOf('heat') >= 0) return 'HVAC';
    if (t.indexOf('paint') >= 0) return 'Painting';
    if (t.indexOf('land') >= 0 || t.indexOf('pool') >= 0 || t.indexOf('lawn') >= 0) return 'Landscaping';
    if (t.indexOf('concrete') >= 0 || t.indexOf('mason') >= 0) return 'Concrete';
    return 'Roofing';
  }
  function qtyFor(it, size) {
    if (it.fixed) return it.fixed;
    var q = Math.ceil((+size || 0) * (+it.per || 0));
    return Math.max(1, q);
  }
  SP.kitQty = qtyFor;

  /* built-ins for this trade, plus anything the contractor saved */
  function allKits() {
    var mine = (SP.kits || []).map(function (r) {
      return { id: r.id, saved: true, name: r.name, blurb: 'Your kit', unitLabel: r.size_label || 'units', size: +r.size_default || 10, items: r.items || [] };
    });
    return mine.concat(BUILTIN[tradeKey()] || []);
  }
  SP.kits = [];
  SP.kitsLoad = function () {
    if (!live()) return Promise.resolve();
    return window.BP_SB.from('job_kits').select('*').order('created_at', { ascending: false })
      .then(function (r) { if (!r.error) SP.kits = r.data || []; })
      .catch(function () { /* table not migrated yet: built-ins still work */ });
  };

  /* ---------- picker ---------- */
  SP.kitOpen = function () {
    SP.kitsLoad().then(function () {
      var kits = allKits();
      window.bpModal('<h3>Start from a kit</h3>'
        + '<div class="bpx-sub">Pick the job and put in the size. The list fills itself, and you can change any line afterwards.</div>'
        + '<div class="sp-kits">' + kits.map(kitCard).join('') + '</div>'
        + '<div class="row"><button class="bpx-btn ghost sp-inline" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn ghost sp-inline" onclick="SP.newList(true)">Start blank instead</button></div>');
      document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '640px';
      kits.forEach(function (k) { SP.kitPreview(k.id); });
    });
  };
  function kitCard(k) {
    return '<div class="sp-kit" id="sp-kit-' + k.id + '">'
      + '<div class="sp-kit-h"><div><b>' + esc(k.name) + '</b><span class="bpx-mut">' + esc(k.blurb) + '</span></div>'
      + (k.saved ? '<span class="bpx-badge">Yours</span>' : '') + '</div>'
      + '<div class="sp-kit-size"><label for="sp-kz-' + k.id + '">How many ' + esc(k.unitLabel) + '?</label>'
      + '<input id="sp-kz-' + k.id + '" value="' + k.size + '" inputmode="decimal" oninput="SP.kitPreview(\'' + k.id + '\')">'
      + '<button class="bpx-btn sp-inline" onclick="SP.kitUse(\'' + k.id + '\')">Use this</button></div>'
      + '<div class="sp-kit-prev" id="sp-kp-' + k.id + '"></div>'
      + '</div>';
  }
  SP.kitPreview = function (id) {
    var k = allKits().filter(function (x) { return x.id === id; })[0]; if (!k) return;
    var el = $('sp-kp-' + id); if (!el) return;
    var size = +String(($('sp-kz-' + id) || {}).value || k.size).replace(/[^0-9.]/g, '') || 0;
    el.innerHTML = k.items.map(function (it) {
      return '<span class="sp-kit-pill"><b>' + qtyFor(it, size) + '</b> ' + esc(shortName(it.n)) + '</span>';
    }).join('');
  };
  function shortName(n) { return String(n).split(',')[0]; }

  SP.kitUse = function (id) {
    var k = allKits().filter(function (x) { return x.id === id; })[0]; if (!k) return;
    var size = +String(($('sp-kz-' + id) || {}).value || k.size).replace(/[^0-9.]/g, '') || k.size;
    var jobs = [];
    try { jobs = (window.bpJobsGet ? bpJobsGet() : []).filter(function (j) { return j.status !== 'done'; }); } catch (e) {}
    var j = jobs[0];
    var items = k.items.map(function (it) { return { key: uid(), name: it.n, qty: qtyFor(it, size), unit: it.u }; });
    SP.db.insert('parts_lists', {
      name: k.name + ', ' + size + ' ' + k.unitLabel,
      job_id: j ? j.id : '', job_name: j ? j.name : '', priority: SP.priority || 'fastest', status: 'draft', items: items,
    }).then(function (row) {
      SP.lists.unshift(row); SP.list = row; SP.plans = null;
      window.bpCloseModal(); window.bpSupply();
      var el = document.querySelector('.sp-items'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }).catch(function (e) { alert('Could not start the list. ' + (e.message || '')); });
  };

  /* ---------- save the current list as a kit ---------- */
  SP.kitSaveOpen = function () {
    var L = SP.list; if (!L || !(L.items || []).length) { alert('Add some items first.'); return; }
    var units = ['squares', 'sq ft', 'linear feet', 'fixtures', 'circuits', 'tons', 'runs', 'zones', 'each'];
    window.bpModal('<h3>Save as a kit</h3><div class="bpx-sub">Next time you pick this kit and put in the size, these quantities scale to match. Anything you leave fixed stays the same on every job.</div>'
      + '<div class="sp-r2">' + window.bpField('sp-kn', 'Kit name', L.name.replace(/,\s*[\d.]+\s.*$/, ''), 'Re-roof, architectural')
      + '<div><label>Measured in</label><select id="sp-ku">' + units.map(function (u) { return '<option' + (u === 'squares' ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></div></div>'
      + window.bpField('sp-ks', 'What size was this job?', '', '25')
      + '<div class="bpx-mut" style="font-size:12.5px;margin-top:6px">Every quantity is divided by that size to get a rate. Tick anything that should not scale.</div>'
      + '<div class="sp-kit-fix">' + (L.items || []).filter(function (i) { return String(i.name).trim(); }).map(function (i, k) {
        return '<label class="sp-check"><input type="checkbox" id="sp-kf-' + k + '"> <span>' + esc(i.name) + ' <em class="bpx-mut">' + i.qty + ' ' + esc(i.unit || 'ea') + ' every time</em></span></label>';
      }).join('') + '</div>'
      + '<div class="bpx-mmsg" id="sp-mmsg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" onclick="SP.kitSave()">Save kit</button></div>');
    document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '600px';
  };
  SP.kitSave = function () {
    var L = SP.list; if (!L) return;
    var name = (($('sp-kn') || {}).value || '').trim();
    var unit = ($('sp-ku') || {}).value || 'units';
    var size = +String((($('sp-ks') || {}).value || '')).replace(/[^0-9.]/g, '');
    if (!name) { m('Give the kit a name.'); return; }
    if (!(size > 0)) { m('Put in the size of this job so the quantities can scale.'); return; }
    var src = (L.items || []).filter(function (i) { return String(i.name).trim(); });
    var items = src.map(function (i, k) {
      var fixed = !!(($('sp-kf-' + k) || {}).checked);
      return fixed ? K(i.name, i.unit || 'ea', 0, +i.qty || 1) : K(i.name, i.unit || 'ea', Math.round((+i.qty || 0) / size * 10000) / 10000, 0);
    });
    SP.db.insert('job_kits', { name: name, trade: tradeKey(), size_label: unit, size_default: size, items: items, builtin: '' })
      .then(function (row) { SP.kits.unshift(row); window.bpCloseModal(); window.bpSupply(); })
      .catch(function (e) { m('Could not save the kit. ' + (/job_kits/.test(e.message || '') ? 'Run the job kits SQL first.' : (e.message || ''))); });
    function m(t) { var e = $('sp-mmsg'); if (e) { e.textContent = t; e.style.color = '#b3392f'; } }
  };
  SP.kitDel = function (id) {
    var k = (SP.kits || []).filter(function (x) { return x.id === id; })[0]; if (!k) return;
    if (!window.bpAskDel('the kit ' + k.name)) return;
    SP.db.del('job_kits', id).then(function () { SP.kits = SP.kits.filter(function (x) { return x.id !== id; }); SP.kitOpen(); }).catch(function () {});
  };
  SP.kitsLoad();
})();
