/* ==================================================================
   The supplier directory: who sells your trade, nearby or online.

   Adding a supplier used to mean staring at an empty form and knowing
   the answers already. Most contractors buy from a handful of the same
   national branch networks, so this lists them, filtered to the trade,
   with what they carry and how they ship. One tap fills the form.

   Two honest notes, stated on the page:
   - Branch networks have hundreds of locations, so we cannot know which
     one is yours. "Find your branch" opens that company's own store
     locator with your zip, which is authoritative and always current.
   - Nothing here is a price. Prices come from your own paperwork: scan a
     quote and the price book fills in at your negotiated rate.

   Extends window.SP from supply.js.
   ================================================================== */
(function () {
  'use strict';
  var SP = window.SP; if (!SP) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.bpEsc;

  var TRADES = [
    ['all', 'All trades'], ['roofing', 'Roofing'], ['siding', 'Siding & gutters'], ['plumbing', 'Plumbing'],
    ['hvac', 'HVAC'], ['electrical', 'Electrical'], ['painting', 'Painting'], ['landscaping', 'Landscaping'],
    ['concrete', 'Concrete'], ['drywall', 'Drywall & insulation'], ['framing', 'Lumber & framing'], ['tools', 'Tools & fasteners'],
  ];

  /* A branch network is somewhere you drive to and pick up the same day.
     An online seller ships, which is slower but has no counter line and
     no minimum relationship. Both belong in a sourcing comparison, so
     both can be added as suppliers, with drive time left empty for the
     ones that ship. */
  var D = function (o) { return o; };
  var DIR = [
    /* ---- branch networks: roofing and exterior ---- */
    D({ id: 'abc', name: 'ABC Supply', kind: 'abc', type: 'branch', trades: ['roofing', 'siding'],
      carries: 'Shingles, metal panels, underlayment, siding, gutter coil, windows',
      note: 'The biggest roofing-only distributor in the country. Contractor accounts are the default, not an upgrade.',
      locator: 'https://www.abcsupply.com/store-locator/', delivery: true, drive: 20 }),
    D({ id: 'srs', name: 'SRS Distribution', kind: 'srs', type: 'branch', trades: ['roofing', 'siding', 'landscaping'],
      carries: 'Shingles, low-slope systems, siding, and through Heritage, landscape supply',
      note: 'Their Roof Hub app handles delivery scheduling and rooftop drops, which is worth having if you do tear-offs.',
      locator: 'https://www.srsdistribution.com/locations', delivery: true, drive: 22 }),
    D({ id: 'beacon', name: 'Beacon Building Products', kind: 'beacon', type: 'branch', trades: ['roofing', 'siding'],
      carries: 'Shingles, commercial roofing, siding, waterproofing, insulation',
      note: 'Beacon PRO+ shows your own pricing and past orders online, so your price book stays honest.',
      locator: 'https://www.beaconbuildingproducts.com/store-locator', delivery: true, drive: 24 }),
    D({ id: 'carter', name: 'Carter Lumber', kind: 'custom', type: 'branch', trades: ['roofing', 'framing', 'siding'],
      carries: 'Lumber, trusses, shingles, siding, windows and doors',
      note: 'Useful when one stop has to cover both the framing and the roof.',
      locator: 'https://www.carterlumber.com/store-locator', delivery: true, drive: 25 }),

    /* ---- branch networks: mechanical ---- */
    D({ id: 'ferguson', name: 'Ferguson', kind: 'ferguson', type: 'branch', trades: ['plumbing', 'hvac'],
      carries: 'Pipe, fittings, valves, fixtures, water heaters, HVAC equipment',
      note: 'Widest plumbing counter in the US, and the branch will hold a will-call under your job name.',
      locator: 'https://www.ferguson.com/find-a-branch', delivery: true, drive: 18 }),
    D({ id: 'winsupply', name: 'Winsupply', kind: 'winsupply', type: 'branch', trades: ['plumbing', 'hvac', 'electrical'],
      carries: 'Plumbing, HVAC, electrical, waterworks, depending on the local company',
      note: 'Each location is locally owned, so pricing is negotiated branch by branch. Ask for a bid on your usual list.',
      locator: 'https://www.winsupplyinc.com/locations', delivery: true, drive: 20 }),
    D({ id: 'johnstone', name: 'Johnstone Supply', kind: 'custom', type: 'branch', trades: ['hvac'],
      carries: 'Condensers, coils, furnaces, motors, controls, refrigerant, filters',
      note: 'Strong on the repair parts that strand a truck, not just whole systems.',
      locator: 'https://www.johnstonesupply.com/storefront/find-a-store.ep', delivery: true, drive: 20 }),

    /* ---- branch networks: electrical ---- */
    D({ id: 'ced', name: 'CED (Consolidated Electrical)', kind: 'ced', type: 'branch', trades: ['electrical'],
      carries: 'Wire, conduit, breakers, panels, fixtures, gear',
      note: 'Independent profit centers, so the counter has real authority to price a job.',
      locator: 'https://www.cednational.com/locations', delivery: true, drive: 22 }),
    D({ id: 'graybar', name: 'Graybar', kind: 'custom', type: 'branch', trades: ['electrical'],
      carries: 'Wire and cable, gear, lighting, datacomm',
      note: 'Better on commercial gear and lighting packages than on small residential runs.',
      locator: 'https://www.graybar.com/locations', delivery: true, drive: 25 }),

    /* ---- branch networks: finishes and site ---- */
    D({ id: 'sherwin', name: 'Sherwin-Williams', kind: 'custom', type: 'branch', trades: ['painting'],
      carries: 'Paint, primer, stain, caulk, sundries, sprayer parts',
      note: 'A PRO account is a fixed discount off list, and there is usually a store within ten minutes.',
      locator: 'https://www.sherwin-williams.com/store-locator', delivery: false, drive: 10 }),
    D({ id: 'benmoore', name: 'Benjamin Moore', kind: 'custom', type: 'branch', trades: ['painting'],
      carries: 'Paint and stain through independent dealers',
      note: 'Dealers are independent, so the discount is a conversation with that owner.',
      locator: 'https://www.benjaminmoore.com/en-us/store-locator', delivery: false, drive: 14 }),
    D({ id: 'siteone', name: 'SiteOne Landscape Supply', kind: 'custom', type: 'branch', trades: ['landscaping'],
      carries: 'Irrigation, hardscape, turf, fertilizer, lighting, tools',
      note: 'The only national landscape network. Bulk material still needs the yard, not the counter.',
      locator: 'https://www.siteone.com/en/store-locator', delivery: true, drive: 22 }),
    D({ id: 'whitecap', name: 'White Cap', kind: 'custom', type: 'branch', trades: ['concrete', 'tools'],
      carries: 'Forms, rebar, ties, curing compound, safety, power tools',
      note: 'Built for concrete and site work rather than homeowners, so the counter speaks your language.',
      locator: 'https://www.whitecap.com/store-finder', delivery: true, drive: 24 }),
    D({ id: 'lw', name: 'L&W Supply', kind: 'custom', type: 'branch', trades: ['drywall'],
      carries: 'Drywall, steel studs, insulation, ceiling grid, joint compound',
      note: 'They will boom-truck board through a window opening, which is the whole reason to use them.',
      locator: 'https://www.lwsupply.com/locations', delivery: true, drive: 26 }),
    D({ id: 'fbm', name: 'Foundation Building Materials', kind: 'custom', type: 'branch', trades: ['drywall'],
      carries: 'Drywall, metal framing, insulation, stucco, acoustics',
      note: 'Often the cheaper of the two drywall networks. Worth a second bid on the same list.',
      locator: 'https://www.fbmsales.com/locations', delivery: true, drive: 26 }),
    D({ id: 'bfs', name: 'Builders FirstSource', kind: 'custom', type: 'branch', trades: ['framing', 'roofing'],
      carries: 'Lumber, trusses, engineered wood, millwork, windows',
      note: 'Best when the job needs a truss or window package quoted rather than picked off a shelf.',
      locator: 'https://www.bldr.com/locations', delivery: true, drive: 28 }),
    D({ id: 'e84', name: '84 Lumber', kind: 'custom', type: 'branch', trades: ['framing'],
      carries: 'Framing lumber, sheathing, decking, doors and windows',
      note: 'Contractor-first yards with real credit terms.',
      locator: 'https://www.84lumber.com/locations/', delivery: true, drive: 25 }),
    D({ id: 'fastenal', name: 'Fastenal', kind: 'custom', type: 'branch', trades: ['tools'],
      carries: 'Fasteners, anchors, abrasives, safety, jobsite consumables',
      note: 'They will stock a bin on your shop wall and refill it, which kills a lot of small runs.',
      locator: 'https://www.fastenal.com/locations', delivery: true, drive: 18 }),

    /* ---- the big boxes: everyone uses them for the gap fill ---- */
    D({ id: 'homedepot_pro', name: 'Home Depot Pro', kind: 'homedepot_pro', type: 'branch', trades: ['all'],
      carries: 'A bit of everything, plus tool rental and same-day delivery',
      note: 'Rarely the cheapest on a full job, always the fastest when you are two bundles short at 4pm.',
      locator: 'https://www.homedepot.com/l/storeDirectory', delivery: true, drive: 12 }),
    D({ id: 'lowes_pro', name: "Lowe's Pro", kind: 'lowes_pro', type: 'branch', trades: ['all'],
      carries: 'General building materials, appliances, tool rental',
      note: 'MVPs Pro volume tiers are worth setting up if you already shop there weekly.',
      locator: 'https://www.lowes.com/store', delivery: true, drive: 14 }),
    D({ id: 'menards', name: 'Menards', kind: 'custom', type: 'branch', trades: ['all'],
      carries: 'General building materials, lumber, millwork', region: 'Midwest only',
      note: 'Often the cheapest shelf price where they exist, with an 11% rebate instead of a discount.',
      locator: 'https://www.menards.com/main/storeDetails.html', delivery: true, drive: 16 }),

    /* ---- online: ships to the shop, no counter line ---- */
    D({ id: 'supplyhouse', name: 'SupplyHouse.com', kind: 'custom', type: 'online', trades: ['plumbing', 'hvac', 'electrical'],
      carries: 'Pipe, fittings, boilers, radiant, controls, minisplits',
      note: 'Free shipping over a low threshold and an honest returns desk. Contractors use it as the price check on the local branch.',
      locator: 'https://www.supplyhouse.com', delivery: true, lead: 'ships in 1 to 3 days' }),
    D({ id: 'pexuniverse', name: 'PexUniverse', kind: 'custom', type: 'online', trades: ['plumbing', 'hvac'],
      carries: 'PEX, manifolds, boilers, pumps, radiant floor kits',
      note: 'Deep on hydronics, which most local counters are not.',
      locator: 'https://www.pexuniverse.com', delivery: true, lead: 'ships in 2 to 4 days' }),
    D({ id: 'hvacdirect', name: 'HVACDirect', kind: 'custom', type: 'online', trades: ['hvac'],
      carries: 'Complete systems, minisplits, air handlers, gas furnaces',
      note: 'Equipment only. Check that the brand can still be warrantied when you did not buy it locally.',
      locator: 'https://hvacdirect.com', delivery: true, lead: 'ships in 3 to 7 days' }),
    D({ id: 'grainger', name: 'Grainger', kind: 'custom', type: 'online', trades: ['tools', 'electrical', 'plumbing'],
      carries: 'Tools, safety, motors, electrical, MRO parts',
      note: 'Expensive per item, unbeatable when a job is stopped for one obscure part. Many cities have a will-call counter too.',
      locator: 'https://www.grainger.com/content/branch-locator', delivery: true, lead: 'next day on most items' }),
    D({ id: 'zoro', name: 'Zoro', kind: 'custom', type: 'online', trades: ['tools'],
      carries: 'Tools, abrasives, fasteners, shop supply',
      note: 'Same catalog family as Grainger at lower list prices, with no account required.',
      locator: 'https://www.zoro.com', delivery: true, lead: 'ships in 2 to 5 days' }),
    D({ id: 'amazonbiz', name: 'Amazon Business', kind: 'custom', type: 'online', trades: ['all'],
      carries: 'Consumables, hand tools, fasteners, anything small and boring',
      note: 'Worth it mainly for the tax exemption and the invoice trail on small stuff. Not for graded material.',
      locator: 'https://business.amazon.com', delivery: true, lead: 'often next day' }),
    D({ id: 'northerntool', name: 'Northern Tool', kind: 'custom', type: 'online', trades: ['tools', 'concrete'],
      carries: 'Generators, compressors, pressure washers, trailers, mixers',
      note: 'Good on the bigger powered equipment a supply house does not stock.',
      locator: 'https://www.northerntool.com', delivery: true, lead: 'ships in 2 to 5 days' }),
  ];
  SP.dirAll = DIR;

  function matches(d, trade, q) {
    if (trade !== 'all' && d.trades.indexOf(trade) < 0 && d.trades.indexOf('all') < 0) return false;
    if (!q) return true;
    var hay = (d.name + ' ' + d.carries + ' ' + d.note + ' ' + d.trades.join(' ')).toLowerCase();
    return q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  /* the trade the contractor already told us in Settings, so the list opens useful */
  function myTrade() {
    var t = String((((window.bpSettingsGet && window.bpSettingsGet().company) || {}).trade) || '').toLowerCase();
    if (!t) return 'all';
    var hit = TRADES.filter(function (p) { return p[0] !== 'all' && (t.indexOf(p[0]) >= 0 || p[0].indexOf(t) >= 0); })[0];
    if (hit) return hit[0];
    if (t.indexOf('roof') >= 0) return 'roofing';
    if (t.indexOf('plumb') >= 0) return 'plumbing';
    if (t.indexOf('electr') >= 0) return 'electrical';
    if (t.indexOf('air') >= 0 || t.indexOf('heat') >= 0) return 'hvac';
    if (t.indexOf('paint') >= 0) return 'painting';
    if (t.indexOf('land') >= 0 || t.indexOf('lawn') >= 0) return 'landscaping';
    if (t.indexOf('concrete') >= 0 || t.indexOf('mason') >= 0) return 'concrete';
    return 'all';
  }

  SP.dir = { trade: null, q: '' };
  SP.dirOpen = function () {
    if (SP.dir.trade == null) SP.dir.trade = myTrade();
    window.bpModal(
      '<h3>Find a supplier</h3><div class="bpx-sub">The companies that sell your trade. Pick one to add it, then scan a quote from them so the prices are yours and not a guess.</div>'
      + '<input id="sp-dir-q" class="sp-dir-q" type="search" placeholder="Search by name or material, for example minisplit or drywall" value="' + esc(SP.dir.q) + '" oninput="SP.dirFilter(this.value)">'
      + '<div class="sp-dir-trades" id="sp-dir-trades">' + TRADES.map(function (p) {
        return '<button class="bpx-jt' + (SP.dir.trade === p[0] ? ' on' : '') + '" onclick="SP.dirTrade(\'' + p[0] + '\')">' + p[1] + '</button>';
      }).join('') + '</div>'
      + '<div id="sp-dir-list" class="sp-dir-list"></div>'
      + '<div class="sp-dir-miss">Plenty of good suppliers are regional and independent. <button class="bpx-rowbtn" onclick="SP.dirManual()">Add one by hand</button></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button></div>');
    var card = document.querySelector('#bpx-modal .bpx-modalcard');
    if (card) card.style.maxWidth = '760px';
    SP.dirRender();
  };
  SP.dirTrade = function (t) {
    SP.dir.trade = t;
    var w = $('sp-dir-trades');
    if (w) Array.prototype.forEach.call(w.children, function (b, i) { b.classList.toggle('on', TRADES[i][0] === t); });
    SP.dirRender();
  };
  SP.dirFilter = function (v) { SP.dir.q = v || ''; SP.dirRender(); };
  SP.dirRender = function () {
    var el = $('sp-dir-list'); if (!el) return;
    var have = {}; (SP.sup || []).forEach(function (s) { have[String(s.name).toLowerCase()] = true; });
    var rows = DIR.filter(function (d) { return matches(d, SP.dir.trade, SP.dir.q); });
    if (!rows.length) {
      el.innerHTML = '<div class="sp-note"><span class="ms">search_off</span>Nothing here sells that. Plenty of good suppliers are regional, so add yours by hand and scan a quote from them.</div>';
      return;
    }
    var near = rows.filter(function (d) { return d.type === 'branch'; });
    var web = rows.filter(function (d) { return d.type === 'online'; });
    var group = function (title, sub, list) {
      if (!list.length) return '';
      return '<div class="sp-dir-h">' + title + '<span>' + sub + '</span></div>'
        + list.map(function (d) { return dirCard(d, have[d.name.toLowerCase()]); }).join('');
    };
    el.innerHTML = group('Drive there', 'branch networks, pick up the same day', near)
      + group('Ships to you', 'no counter line, no account needed', web);
  };
  function dirCard(d, added) {
    var zip = encodeURIComponent(myZip());
    return '<div class="sp-dir-c' + (added ? ' added' : '') + '">'
      + '<div class="sp-dir-t"><b>' + esc(d.name) + '</b>'
        + (d.region ? '<span class="bpx-badge warn">' + esc(d.region) + '</span>' : '')
        + (added ? '<span class="bpx-badge">Already yours</span>' : '')
        + '<span class="sp-dir-sh">' + (d.type === 'online' ? esc(d.lead || 'ships') : 'same-day will-call') + '</span></div>'
      + '<div class="sp-dir-car">' + esc(d.carries) + '</div>'
      + '<div class="sp-dir-n">' + esc(d.note) + '</div>'
      + '<div class="sp-dir-a">'
        + (added
          ? '<button class="bpx-rowbtn" onclick="SP.dirGo(\'' + d.id + '\')">Open their site</button>'
          : '<button class="bpx-rowbtn primary" onclick="SP.dirAdd(\'' + d.id + '\')">Add to my suppliers</button>')
        + '<a class="bpx-rowbtn" target="_blank" rel="noopener" href="' + esc(d.locator) + (d.type === 'branch' && zip ? (d.locator.indexOf('?') >= 0 ? '&' : '?') + 'q=' + zip : '') + '">'
        + (d.type === 'branch' ? 'Find your branch' : 'Open their site') + '</a>'
      + '</div></div>';
  }
  function myZip() {
    var c = (window.bpSettingsGet && window.bpSettingsGet().company) || {};
    var s = String(c.zip || c.postal || c.address || '');
    var m = s.match(/\b\d{5}\b/);
    return m ? m[0] : '';
  }
  SP.dirGo = function (id) {
    var d = DIR.filter(function (x) { return x.id === id; })[0];
    if (d) window.open(d.locator, '_blank', 'noopener');
  };
  SP.dirManual = function () { SP.dirPrefill = null; window.bpCloseModal(); SP.supOpen(); };

  /* Adding from the directory fills everything we can honestly know and
     leaves the two things only the contractor can answer: which branch,
     and how far it is. Online sellers have no drive time at all, so the
     field is left empty and the sourcing engine treats them as delivery. */
  SP.dirAdd = function (id) {
    var d = DIR.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    SP.dirPrefill = {
      name: d.name, kind: d.kind, branch: '', address: '', drive_min: d.type === 'online' ? '' : (d.drive || 20),
      account_no: '', email: '', tier: '', hours: '',
      will_call: d.type === 'branch', delivery: !!d.delivery, delivery_fee: 0, delivery_min: 0,
      notes: d.carries, connection: { type: 'pricebook' },
      _hint: d.type === 'online'
        ? 'They ship, so leave drive time empty. Add your account email if you have one and the POs will go straight there.'
        : 'Put in the branch you actually use and how long it takes you to get there. Drive time is what "fastest" is measured with, so a rough guess beats a blank.',
    };
    window.bpCloseModal();
    SP.supOpen();
  };
})();
