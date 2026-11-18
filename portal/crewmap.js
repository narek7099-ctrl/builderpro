/* PARKED (2026-11-18): not loaded by the app. The crew map was taken out for now, to come back in a
   later update: to turn it on again, add the Map tab back in portal/crew.js (tabs list and pane())
   and load this file and its partner (crewmap.js / crewmap.css) in app.html. */
/* Crew map (2026-11-18): where the crew are, Google Maps style.
   Employees → Map. A full map with a search-and-list panel (floating on the
   left on a computer, a sheet under the map on a phone):
     - each person is a round pin with their initials: mint = clocked in on site,
       blue = clocked in somewhere else, grey = off the clock (where they last
       clocked in or out)
     - each active job with an address is a pin, with a badge for how many are
       clocked in there
     - tap a person (pin or list) for when and where they clocked in, how far
       from the job, and Call / Directions / Open job
   Locations come only from clocking in and out (portal/crewapp.js records the
   phone's location then). Nothing tracks anyone between punches or off the
   clock, and the panel says so.
   Map: the app's own keyless map kit in app.html (bpEnsureLeaflet, bpTileLayer:
   OpenFreeMap vector tiles, Esri satellite); job points come from pjPoint (the
   same saved points Projects → Map & route uses). With no located clock-ins
   yet, "Show an example" draws three sample people, marked as samples. */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var M = { map: null, base: null, kind: 'street', crew: null, jobs: null, people: [], sites: [], mk: {}, filter: 'all', q: '', timer: 0, sample: false, fitted: false };
  var NOTE = 'Locations come from clocking in and out. Nobody is tracked between punches or off the clock.';

  /* ------------------------------------------------------------ words --- */
  function initials(n) { var p = String(n || '?').replace(/\(sample\)/i, '').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  function clock(t) { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function when(t) {
    var d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return clock(t);
    if (d.toDateString() === y.toDateString()) return 'yesterday ' + clock(t);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + clock(t);
  }
  function span(ms) { var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? h + 'h ' + (m % 60) + 'm' : m + 'm'; }
  function far(m) { if (m == null || !isFinite(m)) return ''; var mi = m / 1609.34; return mi >= 0.1 ? (mi < 10 ? mi.toFixed(1) : Math.round(mi)) + ' mi' : Math.round(m * 3.281) + ' ft'; }
  var STATUS = { on: 'On site', away: 'Clocked in, not at the job', in: 'Clocked in', off: 'Off the clock' };

  /* ------------------------------------------------------------- page --- */
  window.bpCrewMap = function (el) {
    clearInterval(M.timer); if (M.map) { try { M.map.remove(); } catch (e) {} M.map = null; }
    M.mk = {}; M.fitted = false;
    el.innerHTML = '<div class="cmx" id="cmWrap">'
      + '<div class="cmx-map" id="cmMap"><div class="cmx-loading">Loading the map…</div></div>'
      + '<aside class="cmx-side" aria-label="Crew">'
      +   '<label class="cmx-search"><span class="ms" aria-hidden="true">search</span><input id="cmQ" type="search" placeholder="Search crew or jobs" autocomplete="off" oninput="bpCmSearch(this.value)"></label>'
      +   '<div class="cmx-chips" role="group" aria-label="Show">'
      +     [['all', 'Everyone'], ['in', 'On the clock'], ['off', 'Off the clock']].map(function (c) { return '<button type="button" data-f="' + c[0] + '"' + (M.filter === c[0] ? ' class="on"' : '') + ' onclick="bpCmFilter(\'' + c[0] + '\')">' + c[1] + '</button>'; }).join('')
      +   '</div>'
      +   '<div class="cmx-list" id="cmList"><div class="cmx-empty">Loading your crew…</div></div>'
      +   '<div class="cmx-note"><span class="ms" aria-hidden="true">info</span>' + NOTE + '</div>'
      + '</aside>'
      + '<div class="cmx-ctrl">'
      +   '<div class="cmx-seg" role="group" aria-label="Map style"><button type="button" data-k="street" class="on" onclick="bpCmBase(\'street\')">Map</button><button type="button" data-k="satellite" onclick="bpCmBase(\'satellite\')">Satellite</button></div>'
      +   '<button type="button" class="cmx-btn" onclick="bpCmFit()" title="Show everyone" aria-label="Show everyone"><span class="ms">fit_screen</span></button>'
      + '</div>'
      + '</div>';
    if (!window.bpEnsureLeaflet) { $('cmMap').innerHTML = '<div class="cmx-loading">The map isn’t available here.</div>'; return; }
    bpEnsureLeaflet(function () { build(); load(); });
    M.timer = setInterval(function () { if (!$('cmMap')) { clearInterval(M.timer); return; } if (document.visibilityState === 'visible' && !M.sample) load(); }, 60000);
  };

  function build() {
    var el = $('cmMap'); if (!el || !window.L) return;
    el.innerHTML = '';
    M.map = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([34.05, -118.25], 10);
    L.control.zoom({ position: 'bottomright' }).addTo(M.map);
    M.kind = 'street'; M.base = bpTileLayer(M.map, 'street');
    M.jobs = L.layerGroup().addTo(M.map);
    M.crew = L.layerGroup().addTo(M.map);
    /* the panel floats over the map on a computer: keep it from eating clicks meant for the map */
    setTimeout(function () { try { M.map.invalidateSize(); } catch (e) {} }, 200);
  }

  /* ------------------------------------------------------------- data --- */
  function load() {
    var live = !!(window.BP_LIVE && window.BP_SB);
    var since = new Date(Date.now() - 14 * 864e5).toISOString();
    return Promise.resolve(window.bpCrewLoad ? bpCrewLoad() : null).catch(function () {}).then(function () {
      if (!live) return { data: [] };
      return Promise.resolve(BP_SB.from('time_clock').select('employee_id,user_id,kind,at,job_id,job_name,on_site,lat,lng,accuracy_m,distance_m,clocked_by_name')
        .gte('at', since).order('at', { ascending: false }).limit(1500)).catch(function () { return { data: [] }; });
    }).then(function (r) {
      if (M.sample) return;
      M.people = people((r && r.data) || []);
      return sites().then(function (s) { M.sites = s; draw(); });
    });
  }
  function emps() { try { return (window.bpEmpsActive ? bpEmpsActive() : []) || []; } catch (e) { return []; } }
  /* one entry per person: their latest punch (in or out) and the latest one that had a location */
  function people(rows) {
    var by = {}, list = [], E = {};
    emps().forEach(function (e) { E[e.id] = e; });
    rows.forEach(function (x) {
      var k = x.employee_id || x.user_id; if (!k) return;
      var p = by[k];
      if (!p) { p = by[k] = { key: k, emp: E[x.employee_id] || null, last: x, loc: null }; list.push(p); }
      if (!p.loc && x.lat != null && x.lng != null) p.loc = x;
    });
    list.forEach(function (p) {
      var x = p.last;
      p.name = (p.emp && p.emp.name) || (x.clocked_by_name && !x.clocked_by ? x.clocked_by_name : '') || 'Crew member';
      p.phone = (p.emp && p.emp.phone) || '';
      p.status = x.kind !== 'in' ? 'off' : x.on_site === true ? 'on' : x.on_site === false ? 'away' : 'in';
    });
    /* everyone on the books shows in the list, even before their first clock-in */
    emps().forEach(function (e) { if (!by[e.id]) list.push({ key: e.id, emp: e, name: e.name, phone: e.phone || '', last: null, loc: null, status: 'off' }); });
    return list;
  }
  function sites() {
    var jobs = (window.bpJobsGet ? bpJobsGet() : []).filter(function (j) { return j && j.status === 'active' && String(j.addr || '').trim(); }).slice(0, 40);
    var out = [], i = 0;
    /* saved points come back at once; a new address is looked up (one a second) and saved on the job */
    var next = function () {
      var j = jobs[i++]; if (!j) return Promise.resolve(out);
      var have = j.geo && j.geo.addr === j.addr && isFinite(j.geo.lat);
      return Promise.resolve(have ? j.geo : (window.pjPoint ? pjPoint(j) : null)).catch(function () { return null; }).then(function (g) {
        if (g && isFinite(g.lat)) out.push({ id: j.id, name: j.name || 'Job', title: j.title || '', addr: j.addr, lat: +g.lat, lng: +g.lng });
        if (!have && M.sites.length === 0 && out.length && $('cmMap')) { M.sites = out.slice(); draw(); }   /* show pins as they're found */
        return next();
      });
    };
    return next();
  }
  /* where a person's pin goes: their last located punch, or the job they clocked into */
  function spot(p) {
    if (p.loc) return { lat: +p.loc.lat, lng: +p.loc.lng, exact: true };
    var x = p.last; if (!x || !x.job_id) return null;
    var s = M.sites.filter(function (j) { return j.id === x.job_id; })[0];
    return s ? { lat: s.lat, lng: s.lng, exact: false } : null;
  }

  /* ------------------------------------------------------------- draw --- */
  function match(s) { return !M.q || String(s || '').toLowerCase().indexOf(M.q) >= 0; }
  function shown(p) {
    if (M.filter === 'in' && p.status === 'off') return false;
    if (M.filter === 'off' && p.status !== 'off') return false;
    return match(p.name) || (p.last && match(p.last.job_name));
  }
  function draw() {
    if (!M.map || !$('cmMap')) return;
    M.crew.clearLayers(); M.jobs.clearLayers(); M.mk = {};
    /* job pins, with how many are clocked in there */
    var here = {};
    M.people.forEach(function (p) { if (p.status !== 'off' && p.last && p.last.job_id) here[p.last.job_id] = (here[p.last.job_id] || 0) + 1; });
    M.sites.forEach(function (s) {
      if (M.q && !match(s.name) && !match(s.addr) && !M.people.some(function (p) { return p.last && p.last.job_id === s.id && shown(p); })) return;
      var n = here[s.id] || 0;
      var mk = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'cmx-jobi', html: '<div class="cmx-job' + (n ? ' busy' : '') + '"><span class="ms">home_repair_service</span>' + (n ? '<b>' + n + '</b>' : '') + '</div>', iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -36] }), zIndexOffset: 100, title: s.name })
        .bindPopup(jobCard(s, n), { className: 'cmx-pop', maxWidth: 280 }).addTo(M.jobs);
      M.mk['job:' + s.id] = mk;
    });
    /* people: several at one spot fan out a little so every face shows */
    /* everyone at the same job (within about 60 m of its pin) is one group, drawn as a row just
       under the job pin so the job stays visible; elsewhere, people at one spot make a small ring */
    var groups = {}, near = function (at) { return M.sites.filter(function (j) { return Math.abs(j.lat - at.lat) < 0.0006 && Math.abs(j.lng - at.lng) < 0.0007; })[0]; };
    M.people.forEach(function (p) {
      if (!shown(p)) return; var at = spot(p); if (!at) return;
      var site = near(at), g = site ? 'job:' + site.id : at.lat.toFixed(4) + ',' + at.lng.toFixed(4);
      if (site) at = { lat: site.lat, lng: site.lng, exact: at.exact };
      (groups[g] = groups[g] || []).push({ p: p, at: at });
    });
    Object.keys(groups).forEach(function (g) {
      var list = groups[g], n = list.length, atJob = g.indexOf('job:') === 0;
      list.forEach(function (it, i) {
        var dx = atJob ? Math.round((i - (n - 1) / 2) * 36) : n > 1 ? Math.round(Math.cos(i / n * 2 * Math.PI) * 20) : 0;
        var dy = atJob ? 28 : n > 1 ? Math.round(Math.sin(i / n * 2 * Math.PI) * 20) : 0;
        var p = it.p;
        var mk = L.marker([it.at.lat, it.at.lng], { icon: L.divIcon({ className: 'cmx-pini', html: '<div class="cmx-pin s-' + p.status + (it.at.exact ? '' : ' approx') + '"><span>' + esc(initials(p.name)) + '</span></div>', iconSize: [40, 40], iconAnchor: [20 - dx, 20 - dy], popupAnchor: [dx, dy - 18] }),
          zIndexOffset: p.status === 'off' ? 200 : 600, title: p.name, riseOnHover: true })
          .bindPopup(personCard(p, it.at), { className: 'cmx-pop', maxWidth: 290 }).addTo(M.crew);
        M.mk[p.key] = mk;
      });
    });
    list();
    if (!M.fitted) { M.fitted = true; fit(); }
  }
  function personCard(p, at) {
    var x = p.last, job = x && x.job_id ? M.sites.filter(function (s) { return s.id === x.job_id; })[0] : null;
    var line = !x ? 'Hasn’t clocked in yet'
      : p.status === 'off' ? 'Clocked out ' + when(x.at)
      : 'Clocked in ' + when(x.at) + ' · ' + span(Date.now() - Date.parse(x.at));
    var where = p.status === 'on' ? '<span class="ok">● On site</span>'
      : p.status === 'away' ? '<span class="warn">● ' + (x.distance_m != null ? far(x.distance_m) + ' from the job' : 'Not at the job') + '</span>'
      : p.status === 'in' ? '<span class="mu">● Clocked in, no job location to compare</span>' : '';
    var acts = (p.phone ? '<a href="tel:' + esc(String(p.phone).replace(/[^\d+]/g, '')) + '"><span class="ms">call</span>Call</a>' : '')
      + (at ? '<a href="https://www.google.com/maps/dir/?api=1&destination=' + at.lat + ',' + at.lng + '" target="_blank" rel="noopener"><span class="ms">directions</span>Directions</a>' : '')
      + (job && window.bpProjOpen && !M.sample ? '<a href="#" onclick="bpProjOpen(\'' + esc(job.id) + '\');return false"><span class="ms">work</span>Open job</a>' : '');
    return '<div class="cmx-card"><div class="cmx-ch"><div class="cmx-av s-' + p.status + '">' + esc(initials(p.name)) + '</div><div><b>' + esc(p.name) + '</b><small>' + esc(STATUS[p.status]) + '</small></div></div>'
      + '<div class="cmx-cl">' + esc(line) + '</div>'
      + (x && x.job_name ? '<div class="cmx-cl"><span class="ms">work</span>' + esc(x.job_name) + '</div>' : '')
      + (where ? '<div class="cmx-cl">' + where + '</div>' : '')
      + (at && !at.exact ? '<div class="cmx-cl mu">Shown at the job’s address: that punch had no location.</div>' : '')
      + (x && x.accuracy_m > 150 && at && at.exact ? '<div class="cmx-cl mu">Phone location was rough (about ' + far(x.accuracy_m) + ').</div>' : '')
      + (x && x.clocked_by && x.clocked_by_name ? '<div class="cmx-cl mu">Clocked by ' + esc(x.clocked_by_name) + '</div>' : '')
      + (acts ? '<div class="cmx-acts">' + acts + '</div>' : '') + '</div>';
  }
  function jobCard(s, n) {
    return '<div class="cmx-card"><div class="cmx-ch"><div class="cmx-av job"><span class="ms">home_repair_service</span></div><div><b>' + esc(s.name) + '</b><small>' + esc(s.title || 'Job site') + '</small></div></div>'
      + '<div class="cmx-cl mu">' + esc(s.addr) + '</div>'
      + '<div class="cmx-cl">' + (n ? '<span class="ok">● ' + n + (n === 1 ? ' person' : ' people') + ' clocked in here</span>' : '<span class="mu">Nobody clocked in here now</span>') + '</div>'
      + '<div class="cmx-acts"><a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(s.addr) + '" target="_blank" rel="noopener"><span class="ms">directions</span>Directions</a>'
      + (window.bpProjOpen && !M.sample ? '<a href="#" onclick="bpProjOpen(\'' + esc(s.id) + '\');return false"><span class="ms">work</span>Open job</a>' : '') + '</div></div>';
  }
  var ORDER = { on: 0, away: 1, in: 2, off: 3 };
  function list() {
    var el = $('cmList'); if (!el) return;
    var ppl = M.people.filter(shown).sort(function (a, b) { return ORDER[a.status] - ORDER[b.status] || (b.last ? Date.parse(b.last.at) : 0) - (a.last ? Date.parse(a.last.at) : 0); });
    var located = M.people.some(function (p) { return spot(p); });
    var h = '';
    if (M.sample) h += '<div class="cmx-sample"><span class="ms">science</span><span>Example crew, so you can see how it looks. <a href="#" onclick="bpCmSample(false);return false">Hide it</a></span></div>';
    if (!ppl.length) h += '<div class="cmx-empty">' + (M.q ? 'No one matches “' + esc(M.q) + '”.' : M.people.length ? 'No one here right now.' : 'No crew yet. Add your people under People, and give them a login so they can clock in.') + '</div>';
    h += ppl.map(function (p) {
      var x = p.last, at = spot(p);
      var sub = !x ? 'Hasn’t clocked in yet'
        : p.status === 'off' ? 'Clocked out ' + when(x.at)
        : (x.job_name ? x.job_name + ' · ' : '') + 'since ' + clock(x.at)
          + (p.status === 'away' && x.distance_m != null ? ' · ' + far(x.distance_m) + ' away' : '');
      return '<button type="button" class="cmx-row' + (at ? '' : ' noloc') + '" onclick="bpCmFocus(\'' + esc(p.key) + '\')"' + (at ? '' : ' title="No location for this person yet"') + '>'
        + '<span class="cmx-av s-' + p.status + '">' + esc(initials(p.name)) + '</span>'
        + '<span class="cmx-rt"><b>' + esc(p.name) + '</b><small>' + esc(sub) + '</small></span>'
        + '<span class="cmx-tag s-' + p.status + '">' + (p.status === 'on' ? 'On site' : p.status === 'away' ? 'Away' : p.status === 'in' ? 'In' : 'Off') + '</span></button>';
    }).join('');
    if (!located && !M.sample && M.people.length >= 0) h += '<div class="cmx-empty">No clock-ins with a location yet. When your crew clock in from their phones, they show up on the map. <button type="button" class="cmx-link" onclick="bpCmSample(true)">Show an example</button></div>';
    el.innerHTML = h;
  }
  function fit() {
    if (!M.map) return;
    var pts = [];
    M.people.forEach(function (p) { if (!shown(p)) return; var a = spot(p); if (a) pts.push([a.lat, a.lng]); });
    M.sites.forEach(function (s) { pts.push([s.lat, s.lng]); });
    if (!pts.length) {
      /* nothing to show yet: the shop's area if we know it */
      var addr = ((window.bpSettingsGet && bpSettingsGet().company) || {}).address;
      if (addr && window.pjGeocode) pjGeocode(addr).then(function (g) { if (g && M.map) M.map.setView([g.lat, g.lng], 11); });
      return;
    }
    if (pts.length === 1) M.map.setView(pts[0], 14);
    else M.map.fitBounds(pts, { padding: [60, 60], paddingTopLeft: [window.innerWidth > 820 ? 380 : 40, 60], maxZoom: 15 });
  }

  /* ---------------------------------------------------------- actions --- */
  window.bpCmFocus = function (key) {
    var mk = M.mk[key]; if (!mk || !M.map) return;
    M.map.flyTo(mk.getLatLng(), Math.max(M.map.getZoom(), 15), { duration: 0.8 });
    setTimeout(function () { mk.openPopup(); }, 850);
    if (window.innerWidth <= 820) { var m = $('cmMap'); if (m && m.scrollIntoView) m.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  window.bpCmSearch = function (v) { M.q = String(v || '').trim().toLowerCase(); draw(); };
  window.bpCmFilter = function (f) {
    M.filter = f;
    [].forEach.call(document.querySelectorAll('#cmWrap .cmx-chips button'), function (b) { b.classList.toggle('on', b.getAttribute('data-f') === f); });
    draw();
  };
  window.bpCmFit = fit;
  window.bpCmBase = function (k) {
    if (!M.map || k === M.kind) return;
    M.kind = k; if (M.base) M.base.remove();
    M.base = bpTileLayer(M.map, k);
    if (k === 'satellite') M.labels = bpTileLayer(M.map, 'labels'); else if (M.labels) { M.labels.remove(); M.labels = null; }
    $('cmWrap').classList.toggle('sat', k === 'satellite');
    [].forEach.call(document.querySelectorAll('#cmWrap .cmx-seg button'), function (b) { b.classList.toggle('on', b.getAttribute('data-k') === k); });
  };
  /* an example crew around the first job (or downtown LA), clearly marked */
  window.bpCmSample = function (on) {
    M.sample = !!on; M.fitted = false;
    if (!on) { load(); return; }
    var s = M.sites[0] || { id: 'sx', name: 'Example job', addr: '', lat: 34.0522, lng: -118.2437 };
    if (!M.sites.length) M.sites = [s];
    var t = Date.now();
    var mk = function (k, name, kind, mins, dlat, dlng, onSite, dist, job) {
      return { key: k, emp: null, name: name + ' (sample)', phone: '', status: kind === 'out' ? 'off' : onSite ? 'on' : 'away',
        last: { kind: kind, at: new Date(t - mins * 60000).toISOString(), job_id: job ? s.id : '', job_name: job ? s.name : '', on_site: onSite, distance_m: dist },
        loc: { lat: s.lat + dlat, lng: s.lng + dlng } };
    };
    M.people = [mk('s1', 'Alex Rivera', 'in', 135, 0.0002, -0.0001, true, 24, true), mk('s2', 'Jordan Lee', 'in', 52, 0.011, 0.009, false, 1450, true), mk('s3', 'Sam Patel', 'out', 900, -0.02, -0.018, null, null, false)];
    draw();
  };
})();
