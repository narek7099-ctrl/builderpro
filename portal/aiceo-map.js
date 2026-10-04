/* ==================================================================
   AI CEO on Projects → Map & route. Loads after portal/aiceo.js and reuses
   its API helper, ranking cache (BP_CEO.route), styles and Assign path.

     pins        coloured by what the latest briefing says about each job:
                 red = overdue / past its end date, amber = due soon,
                 inspection or permit (or another urgent item), purple
                 ring = nobody assigned. Legend chips filter them.
     panel       tap a pin (or the AI CEO button on a stop) for the job's
                 attention items and the top 3 recommended people, each
                 with a one-tap Assign. Never assigns on its own.
     Plan the day for the day picked in the route planner: who goes where,
                 with the best free person suggested for each unassigned
                 job, grouped by person, and "Route this" feeds that
                 person's stops into the existing planner (OSRM times).

   With no briefing yet (or the AI CEO unreachable) the pins fall back to a
   basic check of the project data: overdue phases, end dates, no crew.
   ================================================================== */
(function () {
  'use strict';
  var C = window.BP_CEO; if (!C || !C.api) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = C.esc;
  var M = C.map = { f: 'all', sel: null, st: null, src: '', load: null, day: null, routeP: {}, keep: {}, rerr: {} };
  var RED = { overdue: 1, past_end: 1 }, AMBER = { due: 1, inspection: 1, permit: 1 };
  var RANK = { ok: 0, info: 1, amber: 2, red: 3 };

  function css() {
    C.css();
    if ($('bpCeoMapCss')) return;
    var s = document.createElement('style'); s.id = 'bpCeoMapCss';
    s.textContent = [
      /* legend + filter chips */
      '#bpx .pjm-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-top:10px;min-width:0}',
      '#bpx .pjm-bar:empty{display:none}',
      '#bpx .pjm-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '#bpx .pjm-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#e3e8ef);background:var(--card,#fff);color:inherit;border-radius:99px;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;min-height:32px}',
      '#bpx .pjm-chip b{font-variant-numeric:tabular-nums;font-weight:600;color:var(--mu,#6b7a90)}',
      '#bpx .pjm-chip.on{background:var(--ink,#0f1a2b);border-color:var(--ink,#0f1a2b);color:#fff}#bpx .pjm-chip.on b{color:rgba(255,255,255,.75)}',
      '#bpx .pjm-chip .ms{font-size:16px}',
      '#bpx .pjm-key{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--mu,#6b7a90);align-items:center}',
      '#bpx .pjm-key i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px;box-sizing:border-box}',
      '#bpx .pjm-src{margin-left:auto;font-size:12px;color:var(--mu,#6b7a90);display:inline-flex;align-items:center;gap:6px;min-width:0}',
      '#bpx .pjm-src .ms{font-size:16px}',
      '.pjm-dot-red{background:#dc2626}.pjm-dot-amber{background:#f59e0b}.pjm-dot-nc{background:#fff;border:2.5px solid #7c3aed}.pjm-dot-ok{background:#2f6bff}',
      /* pins */
      '.pjm-pin span{position:relative;display:block;width:22px;height:22px;border-radius:50%;background:#2f6bff;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);box-sizing:border-box}',
      '.pjm-pin.s-red span{background:#dc2626}.pjm-pin.s-amber span{background:#f59e0b}',
      '.pjm-pin.nc span{border-color:#7c3aed;border-width:4px}',
      '.pjm-pin.sel span{transform:scale(1.3);box-shadow:0 0 0 4px rgba(47,107,255,.35),0 2px 6px rgba(0,0,0,.35)}',
      '.pjm-pin u{position:absolute;top:-9px;right:-10px;min-width:15px;height:15px;border-radius:8px;background:#fff;color:#b91c1c;font:700 10px/15px system-ui;text-align:center;text-decoration:none;box-shadow:0 1px 3px rgba(0,0,0,.35);padding:0 3px;box-sizing:border-box}',
      '.pjm-pin.s-amber u{color:#b45309}',
      /* map column + job panel */
      '#bpx .pjm-col{position:relative;min-width:0}',
      '#bpx .pjm-panel{position:absolute;top:12px;right:12px;bottom:12px;width:340px;max-width:calc(100% - 24px);z-index:800;background:var(--card,#fff);border:1px solid var(--line,#e3e8ef);border-radius:14px;box-shadow:0 18px 40px -18px rgba(15,26,43,.45);overflow-y:auto;overscroll-behavior:contain;padding:14px 14px 16px;box-sizing:border-box}',
      '#bpx .pjm-panel[hidden]{display:none}',
      '#bpx .pjm-ph{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}',
      '#bpx .pjm-ph>div{flex:1;min-width:0}',
      '#bpx .pjm-ph b{display:block;font-size:15px;letter-spacing:-.01em;line-height:1.3;overflow-wrap:anywhere}',
      '#bpx .pjm-ph small{display:block;font-size:12.5px;color:var(--mu,#6b7a90);line-height:1.4;overflow-wrap:anywhere}',
      '#bpx .pjm-x{flex:none;width:32px;height:32px;border-radius:50%;border:0;background:var(--soft,#f6f8fb);color:inherit;cursor:pointer;display:grid;place-items:center}',
      '#bpx .pjm-x .ms{font-size:19px}',
      '#bpx .pjm-st{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;border-radius:99px;padding:2px 9px;margin-top:5px}',
      '#bpx .pjm-st.s-red{background:#fee2e2;color:#b91c1c}#bpx .pjm-st.s-amber{background:#fff7ed;color:#b45309}#bpx .pjm-st.s-ok,#bpx .pjm-st.s-info{background:#ecfdf5;color:#15803d}#bpx .pjm-st.nc{background:#f3e8ff;color:#7e22ce}',
      '#bpx .pjm-h{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mu,#6b7a90);margin:14px 0 6px}',
      '#bpx .pjm-h .ceo-src{text-transform:none;letter-spacing:0}',
      '#bpx .pjm-panel .ceo-att ul{gap:5px}',
      '#bpx .pjm-panel .ceo-it{padding:8px 10px}',
      '#bpx .pjm-panel .ceo-it.am .ms{color:#b45309}',
      '#bpx .pjm-rc{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:3px 10px;align-items:center;border:1px solid var(--line,#e3e8ef);border-radius:12px;padding:10px 11px;margin-top:6px}',
      '#bpx .pjm-rc .rc-av{width:32px;height:32px;font-size:12px}',
      '#bpx .pjm-rc .rc-n b{font-size:13.5px}',
      '#bpx .pjm-sc{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:20px;border-radius:6px;background:var(--blue-l,#eaf1ff);color:var(--blue,#2563eb);font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;padding:0 5px;margin-left:4px;vertical-align:1px}',
      '#bpx .pjm-rc .rc-why{grid-column:1 / 4;font-size:12px;color:var(--mu,#6b7a90)}',
      '#bpx .pjm-rc .rc-btn{grid-row:1;grid-column:3}',
      '#bpx .pjm-more{display:inline-flex;align-items:center;gap:4px;margin-top:10px;font-size:12.5px}',
      /* the AI CEO button on a stop row */
      '#bpx .pjm-sb{flex:none;align-self:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--line,#e3e8ef);background:var(--card,#fff);color:var(--mu,#6b7a90);cursor:pointer;display:grid;place-items:center;position:relative;padding:0}',
      '#bpx .pjm-sb .ms{font-size:17px}',
      '#bpx .pjm-sb i{position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;border:2px solid var(--card,#fff)}',
      '#bpx .pj-stop .pjm-sb .ms{display:block;opacity:1;font-size:17px;overflow:visible;white-space:normal}',
      '#bpx .pjm-sb:hover{border-color:var(--blue,#2563eb);color:var(--blue,#2563eb)}',
      /* plan the day */
      '#bpx .pjm-day{margin-top:16px;padding-top:14px;border-top:1px solid var(--line,#e3e8ef)}',
      '#bpx .pjm-day .pjm-dh{display:flex;align-items:center;gap:8px}',
      '#bpx .pjm-day .pjm-dh b{font-size:15px}',
      '#bpx .pjm-day .pjm-dh .ms{font-size:20px;color:var(--blue,#2563eb)}',
      '#bpx .pjm-day p{font-size:12.5px;color:var(--mu,#6b7a90);margin:4px 0 10px;line-height:1.45}',
      '#bpx .pjm-grp{border:1px solid var(--line,#e3e8ef);border-radius:12px;padding:10px 11px;margin-top:8px}',
      '#bpx .pjm-gh{display:flex;align-items:center;gap:9px}',
      '#bpx .pjm-gh .rc-av{width:30px;height:30px;font-size:11.5px;flex:none}',
      '#bpx .pjm-gh>div{flex:1;min-width:0}#bpx .pjm-gh b{font-size:13.5px}#bpx .pjm-gh small{display:block;font-size:11.5px;color:var(--mu,#6b7a90)}',
      '#bpx .pjm-gs{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}',
      '#bpx .pjm-gs li{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;border-top:1px dashed var(--line,#e3e8ef);padding-top:6px}',
      '#bpx .pjm-gs li>div{flex:1;min-width:0}',
      '#bpx .pjm-gs li b{display:block;font-size:13px;overflow-wrap:anywhere}',
      '#bpx .pjm-gs li small{display:block;color:var(--mu,#6b7a90);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#bpx .pjm-gs .bpx-btn{width:auto !important;margin:0 !important;padding:6px 11px !important;font-size:12px !important;flex:none}',
      '#bpx .pjm-gf{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}',
      '#bpx .pjm-gf .bpx-btn{width:auto !important;margin:0 !important;padding:7px 13px !important;font-size:12.5px !important;display:inline-flex;align-items:center;gap:5px}',
      '#bpx .pjm-gf .bpx-btn .ms{font-size:17px}',
      '#bpx .pjm-drive{font-size:12px;font-weight:600;color:var(--blue,#2563eb)}',
      '#bpx .pjm-rfor{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;margin-top:12px;color:var(--blue,#2563eb)}',
      '#bpx .pjm-rfor .ms{font-size:17px}',
      '#bpx.bpx-dark .pjm-st.s-red{background:#3b1717;color:#fca5a5}#bpx.bpx-dark .pjm-st.s-amber{background:#3a2a0e;color:#f5c26b}#bpx.bpx-dark .pjm-st.s-ok,#bpx.bpx-dark .pjm-st.s-info{background:#0f2e1f;color:#86efac}#bpx.bpx-dark .pjm-st.nc{background:#2e1a47;color:#d8b4fe}',
      '#bpx.bpx-dark .pjm-chip.on{background:#e8edf5;border-color:#e8edf5;color:#0f1a2b}#bpx.bpx-dark .pjm-chip.on b{color:#4b5563}',
      '#bpx.bpx-dark .pjm-panel .ceo-it.am .ms{color:#f5c26b}',
      /* phone: the panel is a bottom sheet */
      '@media(max-width:700px){#bpx .pjm-panel{position:fixed;top:auto;left:0;right:0;bottom:0;width:auto;max-width:none;max-height:72vh;border-radius:18px 18px 0 0;z-index:1200;padding:8px 16px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -14px 40px -12px rgba(15,26,43,.45)}',
      '#bpxViewArea.pjm-sheet,#bpx #bpxViewArea.pjm-sheet>*{transform:none !important;animation:none !important}',
      '#bpx .pjm-panel::before{content:"";display:block;width:40px;height:4px;border-radius:4px;background:var(--line,#e3e8ef);margin:0 auto 10px}',
      '#bpx .pjm-src{margin-left:0;width:100%}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ----------------------------------------------------------- status --- */
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dayDiff(a, b) { return Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5); }
  function fmtShort(iso) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? esc(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function jobs() { return ((window.bpJobsGet && bpJobsGet()) || []).filter(function (j) { return j.status === 'active'; }); }
  function jobLbl(j) { return (j.title ? j.title + ' · ' : '') + (j.name || 'Project'); }
  function people(j) {
    var out = (window.bpJobAssignees ? bpJobAssignees(j) : (j.assignees || [])).map(function (a) { var e = window.bpEmpById && bpEmpById(a.employeeId); return { id: a.employeeId, name: (e && e.name) || a.name || 'Crew member' }; });
    var cr = typeof j.crew === 'string' && j.crew && window.pjCrew ? pjCrew(j.crew) : null;
    if (cr) (cr.members || []).forEach(function (id) { if (!out.some(function (p) { return p.id === id; })) { var e = window.bpEmpById && bpEmpById(id); if (e) out.push({ id: id, name: e.name }); } });
    return out;
  }
  function noCrew(j) { return !people(j).length && !(typeof j.crew === 'string' && j.crew) && !(Array.isArray(j.subs) && j.subs.length); }
  /* the basic check when there is no briefing to read from */
  function basicItems(j, t) {
    var out = [], lbl = jobLbl(j);
    (j.phases || []).forEach(function (p) {
      if (p.done || !p.due) return;
      var d = dayDiff(p.due, t), nm = p.name || 'A phase';
      if (d < 0) out.push({ kind: 'overdue', icon: 'event_busy', title: nm + ' is overdue', detail: lbl + ' · ' + (-d) + ' day' + (d === -1 ? '' : 's') + ' late', job: j.id, sev: 'high' });
      else if (d <= 7) out.push({ kind: 'due', icon: 'event_upcoming', title: nm + ' due ' + (d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'), detail: lbl, job: j.id, sev: 'normal' });
    });
    var s = j.sched || {}, ds = (s.dates || []).slice().sort(), end = s.target || ds[ds.length - 1] || j.end || '';
    if (end && end < t) out.push({ kind: 'past_end', icon: 'running_with_errors', title: 'Past its end date', detail: 'Was due to finish ' + fmtShort(end) + ', still active', job: j.id, sev: 'high' });
    return out;
  }
  function lvlOf(x) { return RED[x.kind] ? 'red' : AMBER[x.kind] || x.sev === 'high' ? 'amber' : 'info'; }
  function compute() {
    var t = today(), rep = C.st && C.st.ok && C.st.latest, att = rep && rep.stats && Array.isArray(rep.stats.attention) ? rep.stats.attention : null;
    var by = {};
    jobs().forEach(function (j) {
      var items = att ? att.filter(function (x) { return x.job === j.id && x.kind !== 'no_crew'; }) : M.load ? [] : basicItems(j, t);
      var lvl = 'ok'; items.forEach(function (x) { var l = lvlOf(x); if (RANK[l] > RANK[lvl]) lvl = l; });
      by[j.id] = { lvl: lvl, items: items, nc: noCrew(j) };
    });
    M.st = by; M.src = att ? 'report' : 'basic';
    return by;
  }
  function stOf(id) { return (M.st || compute())[id] || { lvl: 'ok', items: [], nc: false }; }
  function pass(s) { return M.f === 'att' ? (s.lvl === 'red' || s.lvl === 'amber') : M.f === 'nc' ? s.nc : true; }
  function badge(s) { var n = s.items.filter(function (x) { var l = lvlOf(x); return l === 'red' || l === 'amber'; }).length; return n && (s.lvl === 'red' || s.lvl === 'amber') ? '<u>' + (n > 9 ? '9+' : n) + '</u>' : ''; }

  window.bpCeoPinIcon = function (j, cr) {
    if (!window.L || !C.allowed()) return null;
    var s = stOf(j.id), lvl = s.lvl === 'info' ? 'ok' : s.lvl;
    var fill = lvl === 'ok' && cr ? ' style="background:' + esc(cr.color) + '"' : '';
    return L.divIcon({ className: 'pjm-pin s-' + lvl + (s.nc ? ' nc' : '') + (M.sel === j.id ? ' sel' : ''), html: '<span' + fill + '>' + badge(s) + '</span>', iconSize: [22, 22], iconAnchor: [11, 11] });
  };
  window.bpCeoMapPins = function () {
    var P = window.bpPjMarkers && bpPjMarkers(); if (!P) return;
    compute();
    jobs().forEach(function (j) {
      var mk = P.mk[j.id]; if (!mk) return;
      var cr = window.pjCrew ? pjCrew(j.crew) : null;
      var ic = window.bpCeoPinIcon(j, cr); if (ic) mk.setIcon(ic);
      var on = pass(stOf(j.id)), has = P.layer.hasLayer(mk);
      if (on && !has) P.layer.addLayer(mk); else if (!on && has) P.layer.removeLayer(mk);
    });
  };
  window.bpCeoStopBtn = function (j) {
    if (!C.allowed() || !M.st) return '';
    var s = stOf(j.id), col = s.lvl === 'red' ? '#dc2626' : s.lvl === 'amber' ? '#f59e0b' : s.nc ? '#7c3aed' : '';
    return '<button type="button" class="pjm-sb" data-ceo-stop="' + esc(j.id) + '" onclick="event.preventDefault();event.stopPropagation();bpCeoMapSel(\'' + esc(j.id) + '\')" aria-label="AI CEO on ' + esc(j.name || 'this project') + '" title="AI CEO on this job"><span class="ms">monitoring</span>' + (col ? '<i style="background:' + col + '"></i>' : '') + '</button>';
  };

  function barDraw() {
    var el = $('pjCeoBar'); if (!el) return;
    if (!C.allowed()) { el.innerHTML = ''; return; }
    if (M.load) { el.innerHTML = '<span class="pjm-src ceo-wait" style="margin-left:0"><span class="ms">monitoring</span>AI CEO is checking your projects…</span>'; return; }
    var by = M.st || compute(), all = jobs().filter(function (j) { return (j.addr || '').trim(); });
    var n = { all: all.length, att: 0, nc: 0 };
    all.forEach(function (j) { var s = by[j.id]; if (!s) return; if (s.lvl === 'red' || s.lvl === 'amber') n.att++; if (s.nc) n.nc++; });
    var chip = function (k, icon, l) { return '<button type="button" class="pjm-chip' + (M.f === k ? ' on' : '') + '" data-pjf="' + k + '" aria-pressed="' + (M.f === k) + '"><span class="ms">' + icon + '</span>' + l + ' <b>' + n[k] + '</b></button>'; };
    var rep = C.st && C.st.ok && C.st.latest;
    el.innerHTML = '<div class="pjm-chips" role="group" aria-label="Show on the map">' + chip('att', 'priority_high', 'Needs attention') + chip('nc', 'group_off', 'No crew') + chip('all', 'location_on', 'All') + '</div>'
      + '<div class="pjm-key" aria-hidden="true"><span><i class="pjm-dot-red"></i>Overdue</span><span><i class="pjm-dot-amber"></i>Due soon</span><span><i class="pjm-dot-nc"></i>No crew</span><span><i class="pjm-dot-ok"></i>On track</span></div>'
      + '<span class="pjm-src"><span class="ms">monitoring</span>' + (M.src === 'report' ? 'From the AI CEO briefing · ' + fmtShort(rep.day) : (M.err ? 'AI CEO unavailable, showing a basic check of dates and crews' : 'No AI CEO briefing yet, showing a basic check of dates and crews')) + '</span>';
    el.querySelectorAll('[data-pjf]').forEach(function (b) { b.onclick = function () { M.f = b.getAttribute('data-pjf'); barDraw(); window.bpCeoMapPins(); }; });
  }
  function refreshAll() { compute(); barDraw(); window.bpCeoMapPins(); if (window.bpPjStopsRedraw) bpPjStopsRedraw(); }

  /* ----------------------------------------------------- rankings (cached) */
  function getRoute(id) {
    if (C.route[id]) return Promise.resolve(C.route[id]);
    if (M.routeP[id]) return M.routeP[id];
    delete M.rerr[id];
    M.routeP[id] = C.api({ op: 'route', job: id }).then(function (d) {
      delete M.routeP[id]; d = d || { ok: false };
      if (d.ok) { C.route[id] = d; delete M.keep[id]; } else M.rerr[id] = d;   /* errors are not cached: Try again refetches */
      return d;
    });
    return M.routeP[id];
  }
  function canRank() { return C.allowed() && !!window.BP_LIVE; }

  /* -------------------------------------------------------- job panel --- */
  window.bpCeoMapSel = function (id) {
    var j = C.curJob(id), el = $('pjCeoPanel'); if (!j || !el || !C.allowed()) return;
    var prev = M.sel; M.sel = id;
    if (prev !== id) window.bpCeoMapPins();
    var P = window.bpPjMarkers && bpPjMarkers();
    /* the panel replaces the pin's popup, which would sit on top of it */
    if (P && P.mk[id] && P.map) { var mk = P.mk[id]; try { P.map.panTo(mk.getLatLng()); } catch (e) {} setTimeout(function () { try { mk.closePopup(); } catch (e) {} }, 0); }
    el.hidden = false; sheet(true); panelDraw();
    if (canRank() && !C.route[id] && !M.rerr[id]) getRoute(id).then(function () { if (M.sel === id) panelDraw(); });
  };
  /* the view area carries a transform (its entry animation), which would pin a
     position:fixed bottom sheet to it instead of the screen; drop it while open */
  function sheet(on) { var v = $('bpxViewArea'); if (v) v.classList.toggle('pjm-sheet', !!on); }
  function closePanel() { sheet(false); var el = $('pjCeoPanel'); if (el) el.hidden = true; M.sel = null; window.bpCeoMapPins(); }
  function tags(c, sub) {
    var fl = c.flags || [], t = [];
    if (fl.indexOf('busy') >= 0 || c.free === false) t.push('<span class="rc-tag bad">Busy</span>'); else t.push('<span class="rc-tag ok">Free</span>');
    if (fl.indexOf('coi_expired') >= 0) t.push('<span class="rc-tag bad">Insurance expired</span>');
    if (fl.indexOf('coi_missing') >= 0) t.push('<span class="rc-tag bad">No insurance on file</span>');
    if (fl.indexOf('coi_expiring') >= 0) t.push('<span class="rc-tag warn">Insurance expiring</span>');
    if (sub && !fl.some(function (f) { return /^coi_/.test(f); })) t.push('<span class="rc-tag ok">Insured</span>');
    if (fl.indexOf('trade_mismatch') >= 0) t.push('<span class="rc-tag warn">Other trade</span>');
    if (c.rating != null) t.push('<span class="rc-tag">' + (+c.rating).toFixed(1) + '★</span>');
    return t.join('');
  }
  function panelDraw() {
    var el = $('pjCeoPanel'), id = M.sel, j = id && C.curJob(id); if (!el || !j) return;
    var s = stOf(id), d = C.route[id] || M.keep[id] || M.rerr[id];
    var stLbl = s.lvl === 'red' ? 'Overdue' : s.lvl === 'amber' ? 'Needs attention' : s.lvl === 'info' ? 'Worth a look' : 'On track';
    var att = s.items.slice();
    if (s.nc) att.push({ icon: 'group_off', title: 'Nobody assigned', detail: 'No crew, person or sub on this job yet', kind: 'no_crew' });
    var h = '<div class="pjm-ph"><div><b>' + esc(j.name || 'Project') + '</b><small>' + esc([j.title, j.addr].filter(Boolean).join(' · ')) + '</small>'
      + '<span class="pjm-st s-' + s.lvl + '">' + stLbl + '</span>' + (s.nc ? ' <span class="pjm-st nc">No crew</span>' : '') + '</div>'
      + '<button type="button" class="pjm-x" data-pjm-close aria-label="Close"><span class="ms">close</span></button></div>';
    h += '<div class="pjm-h"><span class="ms" style="font-size:15px">monitoring</span>AI CEO' + (M.src === 'basic' ? ' · basic check' : '') + '</div>'
      + '<div class="ceo-att">' + (att.length ? '<ul>' + att.map(function (x, i) {
        var l = x.kind === 'no_crew' ? 'amber' : lvlOf(x);
        return '<li><button type="button" class="ceo-it' + (l === 'red' ? ' hi' : l === 'amber' ? ' am' : '') + '" data-pjm-att="' + i + '"><span class="ms">' + esc(x.icon || 'flag') + '</span><span><b>' + esc(x.title) + '</b><span class="d">' + esc(x.detail || '') + '</span></span><span class="ms go">chevron_right</span></button></li>';
      }).join('') + '</ul>' : '<div class="ceo-note" style="margin-top:0"><span class="ms">check_circle</span>Nothing overdue or waiting on this job.</div>') + '</div>';
    h += '<div class="pjm-h">Recommended crew' + (d && d.ok ? ' ' + C.srcBadge(d.source) : '') + '</div>';
    if (!canRank()) h += '<div class="bpx-mut" style="font-size:12.5px">Sign in to see who the AI CEO recommends.</div>';
    else if (!d) h += '<div class="bpx-mut ceo-wait" style="font-size:12.5px" data-pjm-wait>Ranking your crew and subs for this job…</div>';
    else if (!d.ok) h += '<div class="bpx-mut" style="font-size:12.5px">' + esc(d.error || 'No recommendation right now.') + ' <button type="button" class="bpx-linkbtn" data-pjm-retry>Try again</button></div>';
    else {
      var top = (d.candidates || []).slice(0, 3);
      /* the best crew always shows, even when three people outscore it */
      var bc = d.best_crew || (d.candidates || []).filter(function (c) { return c.kind === 'crew'; })[0];
      if (bc && !top.some(function (c) { return c.kind === 'crew' && c.id === bc.id; })) top.push(bc);
      h += top.length ? top.map(function (c) {
        var sub = c.kind === 'sub', crew = c.kind === 'crew', on = C.onJob(C.curJob(id), c);
        if (crew) return '<div class="pjm-rc rc-row crew" style="display:grid" data-pjm-c="' + esc(c.id) + '">' + C.crewAv(c)
          + '<div class="rc-n"><b><i class="rc-cdot" style="background:' + esc(c.color || '#2563eb') + '"></i>' + esc(c.name) + '</b><span class="pjm-sc" title="Match score">' + (+c.score || 0) + '</span> <span class="t">' + esc(C.crewTrade(c)) + '</span>'
          + C.crewMembers(c) + '<div class="rc-tags">' + tags(c, false) + '</div></div>'
          + '<div class="rc-btn">' + (on ? '<span class="done"><span class="ms" style="font-size:16px">check</span>On it</span>' : '<button type="button" class="bpx-btn" data-pjm-crew="' + esc(c.id) + '">Assign crew</button>') + '</div>'
          + '<div class="rc-why">' + esc(c.explain || (c.reasons || []).join('; ')) + '</div></div>';
        var btn = on ? '<span class="done"><span class="ms" style="font-size:16px">check</span>On it</span>'
          : sub ? '<button type="button" class="bpx-btn ghost" data-pjm-sub="' + esc(c.id) + '">Assign sub</button>'
            : '<button type="button" class="bpx-btn" data-pjm-emp="' + esc(c.id) + '">Assign</button>';
        return '<div class="pjm-rc rc-row' + (sub ? ' sub' : '') + '" style="display:grid" data-pjm-c="' + esc(c.id) + '"><span class="rc-av" aria-hidden="true">' + esc(C.initials(c.name)) + '</span>'
          + '<div class="rc-n"><b>' + esc(c.name) + '</b><span class="pjm-sc" title="Match score">' + (+c.score || 0) + '</span> <span class="t">' + esc(c.trade || '') + (sub ? ' · Sub' : '') + '</span><div class="rc-tags">' + tags(c, sub) + '</div></div>'
          + '<div class="rc-btn">' + btn + '</div>'
          + '<div class="rc-why">' + esc(c.explain || (c.reasons || []).join('; ')) + '</div></div>';
      }).join('') : '<div class="bpx-mut" style="font-size:12.5px">Add people under Employees or Subcontractors and they will be ranked here.</div>';
      h += '<div class="rc-foot" style="margin-top:6px">Nobody is put on the job until you tap Assign.</div>';
    }
    h += '<button type="button" class="bpx-linkbtn pjm-more" data-pjm-open>Open project<span class="ms" style="font-size:16px">arrow_forward</span></button>';
    el.innerHTML = h;
    el.querySelector('[data-pjm-close]').onclick = closePanel;
    el.querySelector('[data-pjm-open]').onclick = function () { if (window.bpProjOpen) bpProjOpen(id); };
    el.querySelectorAll('[data-pjm-att]').forEach(function (b) { b.onclick = function () { var x = att[+b.getAttribute('data-pjm-att')]; if (!x) return; if (x.link) C.follow(x.link, x.job || id); else if (window.bpProjOpen) bpProjOpen(id); }; });
    var r = el.querySelector('[data-pjm-retry]'); if (r) r.onclick = function () { delete C.route[id]; delete M.rerr[id]; delete M.keep[id]; panelDraw(); getRoute(id).then(function () { if (M.sel === id) panelDraw(); }); };
    el.querySelectorAll('[data-pjm-emp]').forEach(function (b) {
      b.onclick = function () {
        var eid = b.getAttribute('data-pjm-emp'), c = (d.candidates || []).filter(function (x) { return x.id === eid; })[0];
        /* assignEmp drops the cached ranking; this list stays on screen until the next open refetches it */
        if (!C.assignEmp(id, eid)) { if (window.bpToast) bpToast('Could not assign. Try from the project.'); return; }
        M.keep[id] = d;
        if (window.bpToast) bpToast((c ? c.name : 'They') + ' is on ' + (j.name || 'this job') + '.');
        refreshAll(); panelDraw(); if (M.day && M.day.shown) dayRun();
      };
    });
    el.querySelectorAll('[data-pjm-crew]').forEach(function (b) {
      b.onclick = function () {
        var cid = b.getAttribute('data-pjm-crew'), c = (d.candidates || []).concat(d.best_crew ? [d.best_crew] : []).filter(function (x) { return x.kind === 'crew' && x.id === cid; })[0];
        if (!C.assignCrew(id, cid)) { if (window.bpToast) bpToast('Could not assign the crew. Try from the project.'); return; }
        M.keep[id] = d;
        if (window.bpToast) bpToast((c ? c.name : 'The crew') + ' is on ' + (j.name || 'this job') + '.');
        refreshAll(); panelDraw(); if (M.day && M.day.shown) dayRun();
      };
    });
    el.querySelectorAll('[data-pjm-sub]').forEach(function (b) { b.onclick = function () { subAssign(id, b.getAttribute('data-pjm-sub')); }; });
  }
  /* subs need a price, scope and dates: the project's own Subs form, with this sub picked */
  function subAssign(jobId, subId) {
    if (!window.bpProjOpen) return;
    bpProjOpen(jobId);
    setTimeout(function () {
      if (window.bpProjTab) bpProjTab('subs');
      var S = window.BP_SUBS;
      Promise.all([S && S.load ? S.load() : null, window.bpSubsRefresh ? bpSubsRefresh() : null]).then(function () {
        if (window.bpSubsTab) bpSubsTab(C.curJob(jobId));
        if (window.bpSubAssign) bpSubAssign(subId);
        delete C.route[jobId];
      });
    }, 80);
  }

  /* ----------------------------------------------------- plan the day --- */
  function dayIso() { var R = window.bpPjRouteState && bpPjRouteState(); return (R && R.date) || today(); }
  function dayLbl(iso) { var d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function dayDraw() {
    var el = $('pjCeoDay'); if (!el) return;
    if (!C.allowed()) { el.innerHTML = ''; return; }
    var iso = dayIso();
    if (!M.day || M.day.iso !== iso) M.day = { iso: iso, shown: false };
    var head = '<div class="pjm-dh"><span class="ms">auto_awesome</span><b>Plan the day</b></div>'
      + '<p>Who goes where on <b>' + dayLbl(iso) + '</b>. The AI CEO suggests the best free person for each job with nobody on it, then you route each person’s stops.</p>';
    if (!M.day.shown) { el.innerHTML = head + '<button type="button" class="bpx-btn ghost" style="width:100%" data-pjm-plan><span class="ms" style="font-size:18px;vertical-align:-4px;margin-right:6px">group</span>Suggest who goes where</button>'; el.querySelector('[data-pjm-plan]').onclick = dayRun; return; }
    var D = M.day;
    if (D.wait) { el.innerHTML = head + '<div class="bpx-mut ceo-wait" style="font-size:13px">Looking at ' + D.n + ' job' + (D.n === 1 ? '' : 's') + ' and who is free…</div>'; return; }
    if (!D.n) { el.innerHTML = head + '<div class="ceo-note" style="margin-top:0"><span class="ms">event_available</span>Nothing is scheduled that day. Pick another day above, or book jobs on the Calendar.</div>'; return; }
    var gs = D.groups, needs = D.need;
    var html = head + '<div class="bpx-mut" style="font-size:12.5px;margin-bottom:2px">' + D.n + ' job' + (D.n === 1 ? '' : 's') + ' scheduled' + (needs ? ' · ' + needs + ' with nobody on ' + (needs === 1 ? 'it' : 'them') : ' · everyone has a crew') + '</div>';
    html += gs.map(function (g, gi) {
      var routable = g.stops.filter(function (s) { return (s.j.addr || '').trim(); }).length;
      return '<div class="pjm-grp' + (g.crew ? ' crew' : '') + '" data-pjm-grp="' + esc(g.id) + '"><div class="pjm-gh">' + (g.crew ? C.crewAv(g.crew) : '<span class="rc-av" aria-hidden="true">' + esc(C.initials(g.name)) + '</span>') + '<div><b>' + esc(g.name) + '</b><small>' + (g.crew ? esc(C.crewTrade(g.crew)) + ' · ' : '') + g.stops.length + ' stop' + (g.stops.length === 1 ? '' : 's') + (g.stops.some(function (s) { return s.sugg; }) ? ' · ' + g.stops.filter(function (s) { return s.sugg; }).length + ' suggested' : '') + '</small></div></div>'
        + '<ul class="pjm-gs">' + g.stops.map(function (s) {
          var on = s.sugg && C.onJob(C.curJob(s.j.id), { kind: g.crew ? 'crew' : 'employee', id: g.id });
          var tg = (s.sugg ? (on ? '<span class="rc-tag ok">Assigned</span>' : '<span class="rc-tag">Suggested · ' + (+s.c.score || 0) + '</span>') : '<span class="rc-tag ok">On the job</span>')
            + (s.busy ? '<span class="rc-tag bad">Busy that day</span>' : '') + (s.mis ? '<span class="rc-tag warn">Other trade</span>' : '')
            + ((s.j.addr || '').trim() ? '' : '<span class="rc-tag warn">No address</span>');
          return '<li><div><b>' + esc(s.j.name || 'Project') + '</b><small>' + esc(s.j.addr || s.j.title || '') + '</small><div class="rc-tags">' + tg + '</div>'
            + (s.warn ? '<div class="pj-warn" style="margin-top:5px">' + esc(s.warn) + '</div>' : '') + '</div>'
            + (s.sugg && !on ? '<button type="button" class="bpx-btn" data-pjm-da="' + esc(s.j.id) + '" data-emp="' + esc(g.id) + '"' + (g.crew ? ' data-crew="1">Assign crew' : '>Assign') + '</button>' : '') + '</li>';
        }).join('') + '</ul>'
        + (g.crew ? '<div class="rc-crew" style="margin:6px 0 0">' + (window.bpCrewAvatars ? bpCrewAvatars(g.crew.members || [], g.crew.color, 5) : '') + '<small>' + esc((g.crew.members || []).map(function (p) { return p.name; }).join(', ')) + '</small></div>' : '')
        + '<div class="pjm-gf"><button type="button" class="bpx-btn" data-pjm-route="' + gi + '"' + (routable ? '' : ' disabled') + '><span class="ms">route</span>Route this</button><span class="pjm-drive" data-pjm-drive="' + esc(g.id) + '">' + esc(D.drive[g.id] || '') + '</span></div></div>';
    }).join('');
    if (D.left.length) html += '<div class="pjm-grp"><div class="pjm-gh"><span class="rc-av" aria-hidden="true" style="background:var(--soft,#f6f8fb);color:var(--mu,#6b7a90)"><span class="ms" style="font-size:17px">help</span></span><div><b>Nobody to suggest</b><small>Open the job to pick someone</small></div></div><ul class="pjm-gs">'
      + D.left.map(function (x) { return '<li><div><b>' + esc(x.j.name || 'Project') + '</b><small>' + esc(x.why) + '</small></div><button type="button" class="bpx-btn ghost" data-pjm-openj="' + esc(x.j.id) + '">Open</button></li>'; }).join('') + '</ul></div>';
    html += '<button type="button" class="bpx-linkbtn" style="margin-top:10px" data-pjm-replan>Refresh suggestions</button>';
    el.innerHTML = html;
    el.querySelector('[data-pjm-replan]').onclick = function () { D.ids.forEach(function (id) { delete C.route[id]; delete M.rerr[id]; }); dayRun(); };
    el.querySelectorAll('[data-pjm-da]').forEach(function (b) {
      b.onclick = function () {
        var jid = b.getAttribute('data-pjm-da'), eid = b.getAttribute('data-emp'), j = C.curJob(jid), g = gs.filter(function (x) { return x.id === eid; })[0];
        if (b.getAttribute('data-crew') ? !C.assignCrew(jid, eid) : !C.assignEmp(jid, eid)) { if (window.bpToast) bpToast('Could not assign. Try from the project.'); return; }
        if (window.bpToast) bpToast((g ? g.name : 'They') + ' is on ' + ((j && j.name) || 'the job') + '.');
        refreshAll(); dayDraw(); if (M.sel === jid) panelDraw();
      };
    });
    el.querySelectorAll('[data-pjm-route]').forEach(function (b) { b.onclick = function () { routeGroup(gs[+b.getAttribute('data-pjm-route')]); }; });
    el.querySelectorAll('[data-pjm-openj]').forEach(function (b) { b.onclick = function () { if (window.bpProjOpen) bpProjOpen(b.getAttribute('data-pjm-openj')); }; });
  }
  async function dayRun() {
    var iso = dayIso(), D = M.day = { iso: iso, shown: true, wait: true, drive: (M.day && M.day.iso === iso && M.day.drive) || {} };
    var ids = typeof pjOnDay === 'function' ? pjOnDay(iso) : [];
    var list = ids.map(C.curJob).filter(function (j) { return j && j.status === 'active'; });
    D.ids = list.map(function (j) { return j.id; }); D.n = list.length;
    dayDraw();
    var groups = {}, order = [], left = [], need = 0;
    var put = function (p, stop) { if (!groups[p.id]) { groups[p.id] = { id: p.id, name: p.name, crew: p.crew || null, stops: [] }; order.push(p.id); } groups[p.id].stops.push(stop); };
    var unassigned = list.filter(function (j) { return !people(j).length; }), takenCrew = {};
    need = unassigned.length;
    var ranks = canRank() ? await Promise.all(unassigned.map(function (j) { return getRoute(j.id); })) : unassigned.map(function () { return { ok: false, error: 'Sign in to get suggestions.' }; });
    if (M.day !== D) return;
    list.forEach(function (j) {
      var pp = people(j);
      if (pp.length) { pp.forEach(function (p) { put(p, { j: j, sugg: false }); }); return; }
      var d = ranks[unassigned.indexOf(j)] || {};
      if (!d.ok) { left.push({ j: j, why: d.error || 'No ranking right now' }); return; }
      var emps = (d.candidates || []).filter(function (c) { return c.kind !== 'sub'; });
      var isBusy = function (c) { return (c.flags || []).indexOf('busy') >= 0 || c.free === false; };
      var isMis = function (c) { return (c.flags || []).indexOf('trade_mismatch') >= 0; };
      /* people only: a crew is suggested on its own when it is free, matches the trade and scores at least as well */
      var crews = emps.filter(function (c) { return c.kind === 'crew'; }).concat(d.best_crew ? [d.best_crew] : []);
      emps = emps.filter(function (c) { return c.kind !== 'crew'; });
      var best = emps.filter(function (c) { return !isBusy(c) && !isMis(c); })[0] || emps.filter(function (c) { return !isBusy(c); })[0] || emps[0];
      var bc = crews.filter(function (c) { return !isBusy(c) && !isMis(c) && !takenCrew[c.id]; })[0];
      if (bc && (!best || isBusy(best) || isMis(best) || (+bc.score || 0) >= (+best.score || 0))) {
        takenCrew[bc.id] = 1;
        put({ id: bc.id, name: bc.name, crew: bc }, { j: j, sugg: true, c: bc, busy: false, mis: false, warn: '' }); return;
      }
      if (!best) { var sub = (d.candidates || [])[0]; left.push({ j: j, why: sub ? 'Best fit is a sub: ' + sub.name + '. Assign them on the project.' : 'Nobody to rank yet' }); return; }
      var busy = isBusy(best), mis = isMis(best);
      var warn = busy ? best.name + ' is the best match but is busy that day. Check their other job before you assign.' : mis ? best.name + ' is free but works a different trade (' + (best.trade || 'other') + '). Nobody free in ' + ((d.job && d.job.trade) || 'this trade') + '.' : '';
      put({ id: best.id, name: best.name }, { j: j, sugg: true, c: best, busy: busy, mis: mis, warn: warn });
    });
    D.groups = order.map(function (k) { return groups[k]; }); D.left = left; D.need = need; D.wait = false;
    dayDraw();
  }
  async function routeGroup(g) {
    if (!g || !window.bpPjPlan || !window.bpPjRouteState) return;
    var R = bpPjRouteState(); R.crew = ''; var cs = $('pj-crew'); if (cs) cs.value = '';
    R.sel = {}; g.stops.forEach(function (s) { if ((s.j.addr || '').trim()) R.sel[s.j.id] = 1; });
    if (window.bpPjStopsRedraw) bpPjStopsRedraw();
    var D = M.day; D.drive[g.id] = 'Working it out…'; dayDraw();
    await bpPjPlan();
    var out = $('pj-plan'), tot = $('pj-total');
    if (out) {
      out.insertAdjacentHTML('afterbegin', '<div class="pjm-rfor"><span class="ms">person_pin_circle</span>Route for ' + esc(g.name) + '</div>');
      if (out.scrollIntoView) out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    var copy = function () { if (M.day !== D) return; var t = tot ? tot.textContent : ''; D.drive[g.id] = t; var s = document.querySelector('[data-pjm-drive="' + g.id + '"]'); if (s) s.textContent = t; };
    copy();
    if (tot && window.MutationObserver) { var mo = new MutationObserver(function () { copy(); }); mo.observe(tot, { childList: true, characterData: true, subtree: true }); setTimeout(function () { mo.disconnect(); }, 20000); }
  }

  /* --------------------------------------------------------------- init --- */
  window.bpCeoMapInit = function () {
    css();
    if (!C.allowed()) return;
    M.sel = null; M.st = null; sheet(false);
    if (!M.wrapped && window.bpPjDay) {
      var od = window.bpPjDay; M.wrapped = true;
      window.bpPjDay = function () { var r = od.apply(this, arguments); if (M.day) M.day.shown = false; dayDraw(); return r; };
    }
    dayDraw();
    if (C.st && C.st.ok) { refreshAll(); return; }
    if (!window.BP_LIVE) { M.err = false; refreshAll(); return; }
    M.load = M.load || C.api({ op: 'status' }).then(function (r) {
      M.load = null;
      if (r && r.ok) { C.st = r; M.err = false; } else M.err = true;
      return r;
    });
    barDraw();
    M.load.then(function () { refreshAll(); if (M.sel) panelDraw(); });
  };
})();
