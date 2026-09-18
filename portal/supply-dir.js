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
      locator: 'https://www.google.com/search?q=Consolidated+Electrical+Distributors+CED+locations', delivery: true, drive: 22 }),
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

  SP.dir = { trade: null, q: '', mode: 'near' };
  SP.dirOpen = function (mode) {
    if (SP.dir.trade == null) SP.dir.trade = myTrade();
    if (mode) SP.dir.mode = mode;
    if (!SP.near.q) SP.near.q = myPlace();
    var m = SP.dir.mode;
    window.bpModal(
      '<h3>Find a supplier</h3><div class="bpx-sub">Nothing here is a price. Add one, then ask them for a quote or photograph a bill, and their prices are yours.</div>'
      + '<div class="bpx-jobtabs" style="margin-bottom:12px">'
        + '<button class="bpx-jt' + (m === 'near' ? ' on' : '') + '" onclick="SP.dirOpen(\'near\')"><span class="ms">near_me</span> Near me</button>'
        + '<button class="bpx-jt' + (m === 'dir' ? ' on' : '') + '" onclick="SP.dirOpen(\'dir\')"><span class="ms">storefront</span> Chains and online</button></div>'
      + (m === 'near'
        ? '<div class="sp-near-bar"><input id="sp-near-q" class="sp-dir-q" type="search" placeholder="Zip, city or the shop address" value="' + esc(SP.near.q) + '" onkeydown="if(event.key===\'Enter\')SP.nearFind()">'
          + '<button class="bpx-btn sp-inline" id="sp-near-go" onclick="SP.nearFind()">Find supply houses</button></div>'
          + '<div id="sp-near-list" class="sp-dir-list"></div>'
        : '<input id="sp-dir-q" class="sp-dir-q" type="search" placeholder="Search by name or material, for example minisplit or drywall" value="' + esc(SP.dir.q) + '" oninput="SP.dirFilter(this.value)">'
          + '<div class="sp-dir-trades" id="sp-dir-trades">' + TRADES.map(function (p) {
            return '<button class="bpx-jt' + (SP.dir.trade === p[0] ? ' on' : '') + '" onclick="SP.dirTrade(\'' + p[0] + '\')">' + p[1] + '</button>';
          }).join('') + '</div>'
          + '<div id="sp-dir-list" class="sp-dir-list"></div>')
      + '<div class="sp-dir-miss">Know one we could not find? <button class="bpx-rowbtn" onclick="SP.dirManual()">Add it by hand</button></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button></div>');
    var card = document.querySelector('#bpx-modal .bpx-modalcard');
    if (card) card.style.maxWidth = '760px';
    if (m === 'near') SP.nearRender(); else SP.dirRender();
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
  /* Vendor locator paths change without notice and 404, and none can be
     checked from here. The homepage is the one URL a company keeps, so the
     site button goes there and the contractor taps their own Locations link.
     A map search is the second link, because it shows which branch is near. */
  function mapUrl(d) {
    var where = myZip() || ((window.bpSettingsGet && (window.bpSettingsGet().company || {}).address) || '');
    return 'https://www.google.com/maps/search/' + encodeURIComponent(d.name + (where ? ' near ' + where : ''));
  }
  function homeUrl(d) { var u = String(d.locator || ''); return /google\.com\/search/.test(u) ? u : u.replace(/^(https?:\/\/[^\/]+).*$/, '$1'); }
  /* A chain's own locator, with the zip already in it. Only set from a URL
     seen working in a real browser, never guessed: {zip} is replaced. With
     no verified URL the button falls back to a map search, which never 404s. */
  var FIND = {
    /* each one confirmed as the chain's indexed locator page, Sep 2026.
       Most locators take the zip in the form, not the URL, so only the ones
       known to read it from the address carry {zip}. */
    abc: 'https://www.abcsupply.com/locations/',
    srs: 'https://www.srsdistribution.com/en/markets/find-a-branch/',
    beacon: 'https://locations.becn.com/',
    carter: 'https://www.carterlumber.com/locations',
    ferguson: 'https://www.ferguson.com/searchBranch',
    winsupply: 'https://www.winsupplyinc.com/location-finder',
    johnstone: 'https://www.johnstonesupply.com/',
    graybar: 'https://www.graybar.com/store-finder?q={zip}',
    sherwin: 'https://www.sherwin-williams.com/store-locator',
    benmoore: 'https://www.benjaminmoore.com/en-us/store-locator',
    siteone: 'https://www.siteone.com/en/store-finder',
    whitecap: 'https://www.whitecap.com/locationfinder',
    lw: 'https://lwsupply.com/locations/',
    fbm: 'https://www.fbmsales.com/location/',
    bfs: 'https://www.bldr.com/location-finder',
    e84: 'https://www.84lumber.com/store-locator/',
    fastenal: 'https://www.fastenal.com/locations',
    homedepot_pro: 'https://www.homedepot.com/l/store-locator',
    lowes_pro: 'https://www.lowes.com/store/',
    menards: 'https://www.menards.com/store-details/locator.html',
    /* CED is run as regional companies with no national locator; a search is the honest link */
    ced: 'https://www.google.com/search?q=CED+Consolidated+Electrical+Distributors+locations+near+{zip}',
  };
  function findUrl(d) {
    var t = FIND[d.id], zip = myZip();
    if (t && zip) return t.replace('{zip}', encodeURIComponent(zip));
    if (t) return t.replace(/[?&][^?&]*\{zip\}[^?&]*/, '').replace(/\{zip\}/, '');
    return mapUrl(d);
  }
  function dirCard(d, added) {
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
        + '<a class="bpx-rowbtn" target="_blank" rel="noopener" href="' + esc(homeUrl(d)) + '">Their website</a>'
        + (d.type === 'branch' ? '<a class="bpx-rowbtn" target="_blank" rel="noopener" href="' + esc(findUrl(d)) + '">Branches near me</a>' : '')
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
    if (d) window.open(homeUrl(d), '_blank', 'noopener');
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

  /* ================================================================
     NEAR ME: the supply houses that actually exist around the shop.

     Real map data, not a list we typed. Nominatim turns the zip into a
     point, Overpass returns every building-supply shop around it, and
     the chains we know get their directory notes attached. Distance is
     measured; drive time is an estimate the contractor corrects once.
     Same two services Neighbor Farming already runs on.
     ================================================================ */
  SP.near = { q: '', busy: false, rows: [], err: '', at: null };
  function myPlace() {
    var c = (window.bpSettingsGet && window.bpSettingsGet().company) || {};
    return String(c.address || c.city || c.zip || myZip() || '');
  }
  /* OSM shop tags that mean "sells building material to the trade" */
  var SHOP_KINDS = { hardware: 'Hardware', doityourself: 'Home improvement', trade: 'Trade supply', building_materials: 'Building supply', paint: 'Paint', electrical: 'Electrical supply', plumbing: 'Plumbing supply', hvac: 'HVAC supply', garden_centre: 'Landscape supply', lumber: 'Lumber yard', roofing: 'Roofing supply' };
  /* a roofer does not want the garden centre; a landscaper does */
  var ALWAYS = ['hardware', 'doityourself', 'trade', 'building_materials', 'lumber'];
  var BY_TRADE = { roofing: ['roofing'], siding: ['roofing'], painting: ['paint'], electrical: ['electrical'], plumbing: ['plumbing', 'hvac'], hvac: ['hvac', 'plumbing'], landscaping: ['garden_centre'], concrete: [], drywall: [], framing: [], tools: [] };
  function shopKindsFor(trade) { return trade === 'all' ? Object.keys(SHOP_KINDS) : ALWAYS.concat(BY_TRADE[trade] || []); }
  var CHAIN_RX = 'ABC Supply|SRS|Beacon|Ferguson|Winsupply|Johnstone|Consolidated Electrical|\\bCED\\b|Graybar|Sherwin|Benjamin Moore|SiteOne|White Cap|L ?& ?W Supply|Foundation Building|Builders FirstSource|84 Lumber|Fastenal|Home Depot|Lowe|Menards|Carter Lumber|Grainger|Roofing Supply|Building Supply|Roofing|Lumber|Drywall|Insulation|Electric Supply|Plumbing Supply';
  function chainFor(name) {
    var n = String(name || '').toLowerCase();
    return DIR.filter(function (d) {
      var key = d.name.toLowerCase().replace(/ \(.*\)$/, '').split(' ')[0];
      return key.length > 2 && n.indexOf(key) >= 0 && (key !== 'home' || n.indexOf('home depot') >= 0);
    })[0] || null;
  }
  function miles(a, b) {
    var R = 3958.8, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  /* around town a truck averages about 25 mph door to door */
  function driveMin(mi) { return Math.max(5, Math.round(mi * 2.4)); }
  function osmAddress(t) {
    var line = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    return [line, t['addr:city']].filter(Boolean).join(', ');
  }
  /* Overpass has public mirrors and they get busy independently, so ask
     them all at once and take the first good answer. On a slow evening the
     main server can sit in a queue for twenty seconds while the mirror
     answers in two. Never spin forever: 25 seconds and it stops. */
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  function overpassOne(url, qy, signal) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(qy), signal: signal })
      .then(function (r) {
        if (r.ok) return r.json();
        /* a rejected query comes back as HTML with the reason in it; keep the reason */
        return r.text().then(function (t) {
          var m = t.match(/Error<\/strong>:\s*([^<]{5,160})/i) || t.match(/error[^<]{5,160}/i);
          throw new Error('HTTP ' + r.status + (m ? ': ' + (m[1] || m[0]).trim() : ''));
        });
      })
      .then(function (d) {
        /* a server-side timeout is a 200 with no elements and a remark */
        if (d && d.remark && /timed? ?out|runtime error/i.test(d.remark) && !((d.elements || []).length)) throw new Error('timed out on the server');
        return d;
      });
  }
  function overpass(qy) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
    var reasons = [], failed = 0;
    return new Promise(function (resolve, reject) {
      OVERPASS.forEach(function (url) {
        overpassOne(url, qy, ctl ? ctl.signal : undefined).then(function (d) {
          clearTimeout(timer); if (ctl) ctl.abort(); resolve(d);
        }).catch(function (e) {
          var why = e && e.name === 'AbortError' ? '' : (e && /Failed to fetch|NetworkError|Load failed/i.test(e.message || '') ? 'blocked before it reached the map' : (e && e.message) || '');
          if (why) reasons.push(why);
          if (++failed === OVERPASS.length) {
            clearTimeout(timer);
            var said = reasons.length ? reasons[0] : 'no answer in 25 seconds';
            reject(new Error(/timed out/.test(said)
              ? 'The map took too long to answer. Try again in a minute, or a zip a little closer to the shop.'
              : 'The map service is busy right now. Give it a minute and try again, or add the supplier by hand. (' + said + ')'));
          }
        });
      });
    });
  }
  SP.nearFind = function () {
    var q = ($('sp-near-q') || {}).value || SP.near.q; q = String(q || '').trim();
    if (!q) { SP.near.err = 'Type a zip or a city first.'; SP.nearRender(); return; }
    SP.near.q = q; SP.near.busy = true; SP.near.err = ''; SP.near.rows = []; SP.nearRender();
    var geocode = window.bpFmGeocode || function (addr) {
      return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(addr)).then(function (r) { return r.ok ? r.json() : []; })
        .then(function (a) { if (!a || !a.length) throw new Error('We could not find that on the map. Try the zip on its own.'); return { lat: +a[0].lat, lng: +a[0].lon }; });
    };
    geocode(q).then(function (at) {
      SP.near.at = at;
      /* 15 miles. In a metro, 25 was a query the map could not finish, and past
         15 it is a delivery anyway. Only shops are scanned, never buildings:
         a name search over every building in Los Angeles never returns. */
      var R = 24000, here = 'around:' + R + ',' + at.lat + ',' + at.lng;
      /* one exact-match clause per shop type. A regex on the value cannot use
         the index, and in a city that scan hit the server's own time limit
         and came back as an empty answer that looked like "nothing here". */
      /* exact matches only. The chains all carry one of these shop tags, so a
         name search adds nothing and its regex was one more thing to reject. */
      var qy = '[out:json][timeout:20];('
        + shopKindsFor(SP.dir.trade || myTrade()).map(function (k) { return 'nwr(' + here + ')["shop"="' + k + '"];'; }).join('')
        + ');out center 200;';
      return overpass(qy);
    }).then(function (d) {
      var seen = {}, out = [];
      ((d && d.elements) || []).forEach(function (el) {
        var t = el.tags || {}; if (!t.name) return;
        var la = el.lat != null ? el.lat : (el.center && el.center.lat), ln = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (la == null || ln == null) return;
        var key = t.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + la.toFixed(3) + '|' + ln.toFixed(3);
        if (seen[key]) return; seen[key] = 1;
        /* a garden centre or a tile shop is real but not what a roofer drives to */
        var chain = chainFor(t.name), shop = t.shop || '';
        if (!chain && shopKindsFor(SP.dir.trade || myTrade()).indexOf(shop) < 0) return;
        var mi = miles(SP.near.at, { lat: la, lng: ln });
        out.push({ name: t.name, kind: shop, label: chain ? chain.carries : (SHOP_KINDS[shop] || 'Supply'), chain: chain, address: osmAddress(t), phone: t.phone || t['contact:phone'] || '', site: t.website || t['contact:website'] || '', hours: t.opening_hours || '', lat: la, lng: ln, mi: mi, drive: driveMin(mi) });
      });
      out.sort(function (a, b) { return a.mi - b.mi; });
      SP.near.rows = out.slice(0, 40); SP.near.busy = false; SP.nearRender();
    }).catch(function (e) { SP.near.busy = false; SP.near.err = (e && e.message) || 'Something went wrong. Try again.'; SP.nearRender(); });
  };
  SP.nearRender = function () {
    var el = $('sp-near-list'); if (!el) return;
    var go = $('sp-near-go'); if (go) { go.disabled = SP.near.busy; go.textContent = SP.near.busy ? 'Looking' : 'Find supply houses'; }
    if (SP.near.err) { el.innerHTML = '<div class="sp-note bad"><span class="ms">error</span>' + esc(SP.near.err) + '</div>'; return; }
    if (SP.near.busy) { el.innerHTML = '<div class="bpx-panel"><div class="bpx-skel" style="width:40%"></div><div class="bpx-skel"></div><div class="bpx-skel" style="width:70%"></div></div>'; return; }
    if (!SP.near.rows.length) {
      el.innerHTML = '<div class="sp-note"><span class="ms">near_me</span>' + (SP.near.at ? 'No supply houses on the map within 15 miles of there. Try a bigger town nearby, or check the chains tab.' : 'Put in your zip and we list every supply house around it, closest first, with a guess at the drive.') + '</div>';
      return;
    }
    var have = {}; (SP.sup || []).forEach(function (s) { have[String(s.name).toLowerCase() + '|' + String(s.address || '').toLowerCase()] = true; });
    el.innerHTML = '<div class="sp-dir-h">Closest first<span>' + SP.near.rows.length + ' within 15 miles of ' + esc(SP.near.q) + '</span></div>'
      + SP.near.rows.map(function (r, i) {
        var added = have[r.name.toLowerCase() + '|' + r.address.toLowerCase()];
        return '<div class="sp-dir-c' + (added ? ' added' : '') + '">'
          + '<div class="sp-dir-t"><b>' + esc(r.name) + '</b>' + (added ? '<span class="bpx-badge">Already yours</span>' : '') + '<span class="sp-dir-sh">' + r.mi.toFixed(1) + ' mi &middot; about ' + r.drive + ' min</span></div>'
          + '<div class="sp-dir-car">' + esc(r.label) + (r.address ? ' &middot; ' + esc(r.address) : '') + '</div>'
          + (r.chain ? '<div class="sp-dir-n">' + esc(r.chain.note) + '</div>' : '')
          + '<div class="sp-dir-a">'
            + (added ? '' : '<button class="bpx-rowbtn primary" onclick="SP.nearAdd(' + i + ')">Add to my suppliers</button>')
            + (r.phone ? '<a class="bpx-rowbtn" href="tel:' + esc(r.phone.replace(/[^0-9+]/g, '')) + '">Call ' + esc(r.phone) + '</a>' : '')
            + '<a class="bpx-rowbtn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + r.lat + ',' + r.lng + '">Directions</a>'
          + '</div></div>';
      }).join('');
  };
  SP.nearAdd = function (i) {
    var r = SP.near.rows[i]; if (!r) return;
    SP.dirPrefill = {
      name: r.name, kind: r.chain ? r.chain.kind : 'custom', branch: r.address.split(',')[0] || '', address: r.address, drive_min: r.drive,
      account_no: '', email: '', tier: '', hours: r.hours, will_call: true, delivery: !!(r.chain && r.chain.delivery), delivery_fee: 0, delivery_min: 0,
      notes: r.label, connection: { type: 'pricebook' },
      _hint: 'Drive time is our guess from the map, ' + r.drive + ' minutes. Fix it if you know better. Then ask them for a quote so we have their prices.',
    };
    window.bpCloseModal();
    SP.supOpen();
  };

  /* ================================================================
     ASK FOR THEIR PRICES: the only honest way to see what a new supply
     house would charge. Nobody publishes contractor pricing; it lives on
     a quote with your name on it. So we write the request from the list
     the contractor actually buys, they send it, and when the quote comes
     back the camera turns it into prices.
     ================================================================ */
  function usualItems() {
    var kits = (SP.kitsAll && SP.kitsAll()) || [];
    var k = kits[0];
    if (k && k.items && k.items.length) {
      return k.items.map(function (it) { return { name: it.n || it.name, qty: SP.kitQty ? SP.kitQty(it, k.size) : (it.fixed || 1), unit: it.u || it.unit || 'ea' }; });
    }
    /* no kits for this trade: whatever they have ordered most */
    var tally = {};
    (SP.pos || []).forEach(function (p) { (p.lines || []).forEach(function (l) { var key = l.name; tally[key] = tally[key] || { name: l.name, qty: 0, unit: l.unit || 'ea' }; tally[key].qty += +l.qty || 0; }); });
    return Object.keys(tally).map(function (k) { return tally[k]; }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 15);
  }
  SP.quoteAsk = function (supplierId) {
    var s = SP.supById ? SP.supById(supplierId) : null; if (!s) return;
    var co = (window.bpSettingsGet && window.bpSettingsGet().company) || {};
    var items = usualItems();
    var lines = items.length ? items.map(function (it) { return '  ' + it.qty + ' ' + it.unit + '  ' + it.name; }).join('\n') : '  (list the materials you buy most)';
    var town = String(co.address || '').split(',').slice(1).join(',').replace(/\b\d{5}(-\d{4})?\b/, '').replace(/\s+/g, ' ').trim();
    var text = 'Hi ' + (s.name || 'there') + ',\n\n'
      + 'I run ' + (co.name || 'a contracting company') + (town ? ' in ' + town : '') + ' and I am looking at buying from you. '
      + 'Could you quote me contractor pricing on a typical job, and let me know what it takes to set up an account?\n\n'
      + lines + '\n\n'
      + 'Please put your item numbers on the quote. Will-call and delivery pricing both help if you offer both.\n\n'
      + 'Thanks,\n' + (co.owner || co.name || '') + (co.phone ? '\n' + co.phone : '') + (co.email ? '\n' + co.email : '');
    var mail = s.email ? 'mailto:' + encodeURIComponent(s.email) + '?subject=' + encodeURIComponent('Quote request from ' + (co.name || 'a contractor')) + '&body=' + encodeURIComponent(text) : '';
    window.bpModal('<h3>Ask ' + esc(s.name) + ' for their prices</h3>'
      + '<div class="bpx-sub">Nobody publishes contractor pricing. It lives on a quote with your name on it, so this asks for one using the list you buy most. Change anything before you send it.</div>'
      + '<textarea id="sp-qa-text" class="sp-qa">' + esc(text) + '</textarea>'
      + '<div class="sp-note"><span class="ms">photo_camera</span><b>When the quote comes back, photograph it.</b> Every price on it goes into ' + esc(s.name) + '\'s price book, and from then on they are in every comparison.</div>'
      + '<div class="row" style="flex-wrap:wrap">'
        + (mail ? '<a class="bpx-btn sp-inline" href="' + mail + '">Email it to them</a>' : '')
        + '<button class="bpx-btn' + (mail ? ' ghost' : '') + ' sp-inline" onclick="SP.quoteCopy(this)">Copy it to send</button>'
        + (s.email ? '' : '<button class="bpx-btn ghost sp-inline" onclick="bpCloseModal();SP.supOpen(\'' + s.id + '\')">Add their email</button>')
        + '<button class="bpx-btn ghost sp-inline" onclick="bpCloseModal()">Close</button></div>');
    document.querySelector('#bpx-modal .bpx-modalcard').style.maxWidth = '620px';
  };
  SP.quoteCopy = function (btn) {
    var t = ($('sp-qa-text') || {}).value || '';
    try { navigator.clipboard.writeText(t).then(function () { btn.textContent = 'Copied'; }); } catch (e) { alert(t); }
  };
})();
