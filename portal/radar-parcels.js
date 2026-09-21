/* ==================================================================
   Parcels: the second source.

   Permits only describe houses that pulled one, which is a small
   minority — so the radar has been working from the exception rather
   than the rule. Assessor and parcel records describe every house in
   the county, and they carry four things the permit feed cannot:

     year built     the age of the ORIGINAL roof, on the majority of
                    homes that have never permitted a replacement
     last sale      a new owner spends on the house in the first year,
                    which is the strongest intent signal in this trade
     assessed value what the place is actually worth — a real number,
                    where "what neighbours declared on their permits"
                    was a proxy standing in for one
     size           how big the job is, which is not the same question
                    as how likely it is

   Every county and every vendor names its columns differently, so
   nothing here is hard-wired to one of them. A source is a field map;
   adding a county is adding a row, not writing code.

   INERT UNTIL CONFIGURED. With no source set this module loads, does
   nothing, and the radar behaves exactly as it does today. That is
   deliberate: it can ship before a provider is chosen.

   The field maps below are written from how these providers document
   themselves and have NOT been run against a live response — there is
   no outbound network where this was built. Treat each map as a first
   draft to check against one real row before switching a county on.
   RDP.probe() prints what arrived next to what was understood, which
   is the fastest way to correct one.
   ================================================================== */
(function (root) {
  'use strict';
  var RDP = root.RDP = {};

  /* ---------- the shape everything is reduced to ---------- */
  /* addr lat lng builtYear lastSaleAt lastSalePrice value sqft roofMat
     landUse ownerOccupied source                                      */

  function num(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }
  function year(v) {
    var n = num(v);
    /* a "year built" of 0, 1 or 20250101 is a null wearing a disguise */
    if (n == null) return null;
    if (n > 17000000) n = Math.floor(n / 10000);
    return (n >= 1800 && n <= new Date().getFullYear() + 1) ? n : null;
  }
  function when(v) {
    if (!v) return null;
    var t = Date.parse(v);
    return isFinite(t) ? t : null;
  }
  function pick(row, names) {
    for (var i = 0; i < names.length; i++) {
      var v = row[names[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }

  /* ---------- the sources ----------
     `f` is the field map: our name -> the candidate column names, tried
     in order. Several are listed per field on purpose, because the same
     vendor exposes different spellings across counties. */
  RDP.SOURCES = {
    /* A county's own open-data portal. Free, and the columns vary wildly
       — this map is a starting point, not a promise. */
    socrata: {
      label: 'County open data (Socrata)',
      kind: 'socrata',
      f: {
        addr: ['situs_address', 'property_address', 'site_address', 'address', 'full_address'],
        lat: ['latitude', 'lat', 'y'],
        lng: ['longitude', 'lon', 'lng', 'x'],
        builtYear: ['year_built', 'yr_built', 'yearbuilt', 'actual_year_built', 'eff_year_built'],
        lastSaleAt: ['sale_date', 'last_sale_date', 'deed_date', 'transfer_date'],
        lastSalePrice: ['sale_price', 'last_sale_price', 'sale_amount', 'consideration'],
        value: ['total_value', 'assessed_value', 'market_value', 'total_assessed_value', 'appraised_value'],
        sqft: ['living_area', 'building_sqft', 'sq_ft', 'total_living_area', 'finished_area'],
        roofMat: ['roof_cover', 'roof_material', 'roof_type'],
        landUse: ['land_use', 'property_class', 'use_code', 'property_type'],
      },
    },
    /* Regrid — nationwide parcels, schema is consistent across counties,
       which is most of what you are paying for. */
    regrid: {
      label: 'Regrid parcels',
      kind: 'rest',
      f: {
        addr: ['saddno_saddstr', 'address', 'szip_address', 'parcel_address'],
        lat: ['lat', 'latitude'], lng: ['lon', 'longitude'],
        builtYear: ['yearbuilt', 'year_built'],
        lastSaleAt: ['saledate', 'last_sale_date'],
        lastSalePrice: ['saleprice', 'last_sale_price'],
        value: ['parval', 'improvval', 'total_value'],
        sqft: ['ll_bldg_footprint_sqft', 'sqft', 'livingarea'],
        landUse: ['usedesc', 'zoning_description', 'lbcs_function_desc'],
      },
    },
    /* ATTOM — the deepest property attributes of the lot, priced to match. */
    attom: {
      label: 'ATTOM property data',
      kind: 'rest',
      f: {
        addr: ['address.line1', 'address.oneLine'],
        lat: ['location.latitude'], lng: ['location.longitude'],
        builtYear: ['summary.yearbuilt', 'summary.yearBuilt'],
        lastSaleAt: ['sale.saleTransDate', 'sale.salesearchdate'],
        lastSalePrice: ['sale.amount.saleamt'],
        value: ['assessment.assessed.assdttlvalue', 'assessment.market.mktttlvalue'],
        sqft: ['building.size.livingsize', 'building.size.universalsize'],
        roofMat: ['building.construction.roofcover'],
        landUse: ['summary.proptype', 'summary.propclass'],
      },
    },
    /* Estated — cheaper, flatter, good enough for age and sale. */
    estated: {
      label: 'Estated',
      kind: 'rest',
      f: {
        addr: ['address.formatted_street_address'],
        lat: ['address.latitude'], lng: ['address.longitude'],
        builtYear: ['structure.year_built'],
        lastSaleAt: ['deeds.0.recording_date', 'sale.date'],
        lastSalePrice: ['deeds.0.sale_price', 'sale.amount'],
        value: ['assessments.0.total_value', 'market_assessment.total_value'],
        sqft: ['structure.total_area_sq_ft', 'structure.finished_area_sq_ft'],
        roofMat: ['structure.roof_material_type'],
        landUse: ['parcel.standardized_land_use_category'],
      },
    },
    /* PropertyRadar — built for exactly this job, so its fields are
       already named after the questions a contractor asks. */
    propertyradar: {
      label: 'PropertyRadar',
      kind: 'rest',
      f: {
        addr: ['Address', 'SiteAddress'],
        lat: ['Latitude'], lng: ['Longitude'],
        builtYear: ['YearBuilt'],
        lastSaleAt: ['LastTransferDate', 'PurchaseDate'],
        lastSalePrice: ['LastTransferValue', 'PurchasePrice'],
        value: ['AVM', 'AssessedValue', 'EstimatedValue'],
        sqft: ['SqFt', 'BuildingSqFt'],
        landUse: ['PropertyType', 'UseCodeDescription'],
        ownerOccupied: ['OwnerOccupied'],
      },
    },
  };

  /* a.b.0.c — vendors nest, and a flat field map would need a second
     mechanism the moment one of them does */
  function deep(row, path) {
    if (path.indexOf('.') < 0) return row[path];
    var cur = row, parts = path.split('.');
    for (var i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return cur;
  }
  function pickDeep(row, names) {
    for (var i = 0; i < names.length; i++) {
      var v = deep(row, names[i]);
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }

  /* ---------- one raw row -> one parcel ---------- */
  RDP.normalise = function (row, srcKey) {
    var src = RDP.SOURCES[srcKey];
    if (!src || !row) return null;
    var f = src.f, get = function (k) { return pickDeep(row, f[k] || []); };

    var lat = num(get('lat')), lng = num(get('lng'));
    var addr = get('addr');
    if (addr && typeof addr === 'object') addr = addr.line1 || addr.oneLine || '';
    addr = String(addr || '').trim();
    if (!addr || !isFinite(lat) || !isFinite(lng)) return null;

    return {
      addr: addr, lat: lat, lng: lng,
      builtYear: year(get('builtYear')),
      lastSaleAt: when(get('lastSaleAt')),
      lastSalePrice: num(get('lastSalePrice')),
      value: num(get('value')),
      sqft: num(get('sqft')),
      roofMat: (get('roofMat') || '') + '' || null,
      landUse: (get('landUse') || '') + '' || null,
      ownerOccupied: get('ownerOccupied'),
      source: srcKey,
      raw: row,
    };
  };

  /* Homes only. A parcel file is mostly not houses — vacant land, car
     parks, churches, the county's own depot — and a roofer knocking a
     substation is how a contractor decides the product is rubbish. */
  var NOT_A_HOME = /(vacant|commercial|industrial|agricult|church|school|government|utility|parking|storage|warehouse|mineral|common area|right of way)/i;
  var IS_A_HOME = /(single family|sfr|residential|duplex|townhouse|condo|mobile home|manufactured|apartment)/i;
  RDP.isHome = function (p) {
    var u = String((p && p.landUse) || '');
    if (!u) return p && p.builtYear != null;   /* no class given: age is the only evidence */
    if (NOT_A_HOME.test(u) && !IS_A_HOME.test(u)) return false;
    return true;
  };

  /* ==================================================================
     The precedence rule, which is the whole reason this is not just a
     second list bolted on.

     A house built in 1998 that never permitted a re-roof is running a
     27-year-old original roof — an excellent lead the permit feed
     cannot see at all. The SAME house with a 2015 re-roof permit has a
     10-year-old roof and is not a lead for years.

     So where both sources describe one door, the permit wins on age,
     because it is the more recent fact about the roof. The parcel is
     still merged in for everything the permit does not know: what the
     place is worth, how big it is, when it last changed hands.
     ================================================================== */
  RDP.merge = function (permitLeads, parcels, t, keyOf) {
    keyOf = keyOf || root.rdDoorKey || function (a) { return String(a || ''); };
    var out = [], byDoor = {};

    (permitLeads || []).forEach(function (p) {
      var d = p.door || keyOf(p.addr);
      p.door = d; byDoor[d] = p; out.push(p);
    });

    (parcels || []).forEach(function (pc) {
      if (!RDP.isHome(pc)) return;
      var d = keyOf(pc.addr);
      var existing = byDoor[d];

      if (existing) {
        /* enrich only — the permit keeps the age it established */
        existing.parcel = pc;
        if (existing.value == null) existing.value = pc.value;
        if (existing.sqft == null) existing.sqft = pc.sqft;
        if (existing.lastSaleAt == null) existing.lastSaleAt = pc.lastSaleAt;
        return;
      }

      /* no permit for this door: the original roof is as old as the house */
      if (pc.builtYear == null) return;
      var age = (Date.now() - new Date(pc.builtYear, 6, 1).getTime()) / 31557600000;
      var inWindow = t && age >= t.lo && age <= t.hi;
      var freshSale = pc.lastSaleAt && (Date.now() - pc.lastSaleAt) < 365 * 864e5;
      if (!inWindow && !freshSale) return;

      var lead = {
        lat: pc.lat, lng: pc.lng, addr: pc.addr, door: d,
        kind: inWindow ? 'due' : 'newowner',
        ageExact: age, age: Math.round(age), year: pc.builtYear,
        base: inWindow && root.rdScore ? root.rdScore(age, t) : 45,
        score: 0,
        value: pc.value, sqft: pc.sqft, lastSaleAt: pc.lastSaleAt,
        parcel: pc, fromParcel: true,
        signalAt: freshSale ? pc.lastSaleAt : null,
        why: inWindow
          ? 'Built ' + pc.builtYear + ' — ' + Math.round(age) + ' yrs, and no ' + ((t && t.unit) || 'replacement')
            + ' permit has ever been filed, so it is likely still the original'
          : 'Changed hands ' + new Date(pc.lastSaleAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            + ' — new owners spend on the house in the first year',
        desc: [pc.roofMat, pc.sqft ? Math.round(pc.sqft).toLocaleString() + ' sq ft' : '',
          pc.value ? '$' + Math.round(pc.value).toLocaleString() + ' assessed' : ''].filter(Boolean).join(' · '),
      };
      byDoor[d] = lead; out.push(lead);
    });

    return out;
  };

  /* ---------- checking a field map against one real row ----------
     The maps above were written from documentation, not from a live
     response. This prints what arrived beside what was understood, so
     a wrong column name takes a minute to find rather than an evening. */
  RDP.probe = function (row, srcKey) {
    var p = RDP.normalise(row, srcKey);
    var f = (RDP.SOURCES[srcKey] || {}).f || {};
    var report = Object.keys(f).map(function (k) {
      return { field: k, tried: f[k].join(', '), got: p ? p[k] : null };
    });
    if (root.console && console.table) console.table(report);
    return { parcel: p, report: report, columnsSeen: row ? Object.keys(row) : [] };
  };

  RDP.configured = function () { return !!(RDP.source && RDP.SOURCES[RDP.source]); };
  RDP.source = null;        /* set when a provider is chosen; inert until then */
})(typeof window !== 'undefined' ? window : globalThis);
