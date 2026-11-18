/* Live updates (2026-11-18): an edit made on one device, or by someone else on the team,
   shows on every other device of the company in about a second, with no refresh.

   How: the database keeps one tiny row per company and kind of data (public.bp_live,
   supabase/migrations/20261118000000_live_updates.sql) and touches it on every change.
   This file listens to those rows over Supabase Realtime. When a kind changes it fetches
   just that kind again and redraws the screen that's open:
     jobs      jobs and money (merged job by job with anything changed here: bpFinPull)
     contacts, calendar, clock, employees, inspections, equipment, checks, settings
   The crew app reloads its own data for the kinds that matter to it.

   Manners:
     - this device's own saves coming back are ignored (it already shows them)
     - a pop-up open or a field being typed in: the redraw waits until it's closed / left
     - the redraw keeps the scroll position and skips the cards' rise-in animation
     - after the connection drops (phone asleep, no signal) everything is fetched once
       when it comes back, so nothing missed while away stays missing */
(function () {
  'use strict';
  /* which screens show which kind of data */
  var VIEWS = {
    jobs: ['dashboard', 'activejobs', 'installations', 'finances', 'invoices', 'estimates', 'ledger', 'finarchive', 'payouts', 'calendar', 'closedeals', 'routing', 'employees', 'subs', 'supplyorders', 'matlists', 'receipts', 'quickbooks'],
    contacts: ['contacts', 'dashboard', 'calendar', 'closedeals'],
    calendar: ['calendar', 'dashboard'],
    clock: ['employees', 'dashboard', 'activejobs'],
    employees: ['employees', 'activejobs', 'dashboard', 'routing'],
    inspections: ['contacts'],
    equipment: ['assets'],
    checks: ['checks'],
    settings: ['settings', 'employees', 'dashboard']
  };
  var CREW_KINDS = { jobs: 1, clock: 1, employees: 1, settings: 1, calendar: 1 };
  var L = { ch: null, owner: '', me: '', due: {}, t: 0, waitT: 0, lost: false, hiddenAt: 0 };

  function sessionUser() {
    try { var s = JSON.parse(localStorage.getItem('sb-ttzwzouhiwdwamuimhpo-auth-token') || 'null'); return (s && s.user && s.user.id) || ''; } catch (e) { return ''; }
  }
  function busy() {
    /* a pop-up (job sheet, a form) or a field being typed in: don't pull the page out from under it */
    if (document.getElementById('bpx-modal')) return true;
    var a = document.activeElement;
    if (a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && a.closest && a.closest('#bpx')) return true;
    return false;
  }
  function scroller() {
    var area = document.getElementById('bpxViewArea'); if (!area) return null;
    for (var el = area; el && el !== document.body; el = el.parentElement) {
      var cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) return el;
    }
    return document.scrollingElement || document.documentElement;
  }
  /* redraw the open screen, quietly, where it was */
  function redraw() {
    var v = window._bpCurView || ''; if (!v || typeof window.bpNav !== 'function') return;
    if (/^crew/.test(v)) { if (window.bpCrewLiveReload) bpCrewLiveReload(); return; }
    var sc = scroller(), y = sc ? sc.scrollTop : 0;
    window.__bpQuiet = true;
    try { bpNav(v); } catch (e) {}
    /* the page may fill in over the next moment: put the scroll back after it has */
    var put = function () { if (sc) sc.scrollTop = y; };
    put(); requestAnimationFrame(put); setTimeout(put, 250); setTimeout(put, 900);
    setTimeout(function () { window.__bpQuiet = false; }, 1200);
  }
  /* fetch what changed, then redraw if the open screen shows it */
  function run() {
    L.t = 0;
    if (busy()) { clearTimeout(L.waitT); L.waitT = setTimeout(run, 1500); return; }
    var kinds = Object.keys(L.due); L.due = {};
    if (!kinds.length) return;
    var v = window._bpCurView || '', crew = !!(window.bpTeamIsCrew && bpTeamIsCrew());
    var jobs = kinds.indexOf('jobs') >= 0 || kinds.indexOf('*') >= 0;
    var steps = [];
    if (jobs && !crew && window.bpFinPull) steps.push(Promise.resolve(bpFinPull()).then(function (changed) { return changed ? 'jobs' : null; }));
    if ((kinds.indexOf('settings') >= 0 || kinds.indexOf('*') >= 0) && window.bpSettingsPull) steps.push(Promise.resolve(bpSettingsPull()).then(function () { return 'settings'; }, function () { return null; }));
    if ((kinds.indexOf('employees') >= 0 || kinds.indexOf('clock') >= 0 || kinds.indexOf('*') >= 0) && window.bpCrewLoad && !crew) steps.push(Promise.resolve(bpCrewLoad(true)).then(function () { return 'employees'; }, function () { return null; }));
    Promise.all(steps).then(function (done) {
      if (busy()) { kinds.forEach(function (k) { L.due[k] = 1; }); clearTimeout(L.waitT); L.waitT = setTimeout(run, 1500); return; }
      if (/^crew/.test(v)) { if (kinds.some(function (k) { return k === '*' || CREW_KINDS[k]; })) redraw(); return; }
      var show = kinds.some(function (k) {
        if (k === '*') return true;
        if (k === 'jobs') return done.indexOf('jobs') >= 0 && VIEWS.jobs.indexOf(v) >= 0;   /* nothing new after the merge: leave the page */
        return (VIEWS[k] || []).indexOf(v) >= 0;
      });
      if (show) redraw();
      try { window.dispatchEvent(new CustomEvent('bp-live', { detail: { kinds: kinds } })); } catch (e) {}
    });
  }
  function due(kind) { L.due[kind] = 1; if (!L.t) L.t = setTimeout(run, 700); }
  function onRow(p) {
    var r = p && (p.new || p.record) || {}; if (!r.kind) return;
    /* this device's own save coming back: it already shows it */
    if (r.by && r.by === L.me && Date.now() - (window.__bpLastWrite || 0) < 6000) return;
    due(r.kind);
  }

  function stop() { if (L.ch) { try { BP_SB.removeChannel(L.ch); } catch (e) {} } L.ch = null; L.owner = ''; }
  function start() {
    if (!window.BP_LIVE || !window.BP_SB || !BP_SB.channel || !window.bpOwnerId) return;
    if (!document.querySelector('#bpx.open') || !document.getElementById('bpxViewArea')) return;
    var me = sessionUser(), owner = bpOwnerId(); if (!me || !owner) return;
    if (L.ch && L.owner === owner && L.me === me) return;
    stop(); L.owner = owner; L.me = me;
    L.ch = BP_SB.channel('bp-live-' + owner)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bp_live', filter: 'owner=eq.' + owner }, onRow)
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') { if (L.lost) { L.lost = false; due('*'); } }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') L.lost = true;
      });
  }
  /* the app signs in and out on its own schedule: look every couple of seconds (cheap) */
  setInterval(function () {
    if (!window.BP_LIVE || !window.BP_SB) return;
    if (!sessionUser() || !document.querySelector('#bpx.open')) { if (L.ch) stop(); return; }
    start();
  }, 2000);
  /* a phone back from sleep may have missed changes while the connection slept */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { L.hiddenAt = Date.now(); return; }
    if (L.ch && L.hiddenAt && Date.now() - L.hiddenAt > 30000) due('*');
  });
  window.addEventListener('online', function () { if (L.ch) due('*'); });
  window.bpLive = { state: function () { return { on: !!L.ch, owner: L.owner, lost: L.lost }; }, now: function (k) { due(k || '*'); } };
})();
