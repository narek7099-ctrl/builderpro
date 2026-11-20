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
    jobs: ['dashboard', 'activejobs', 'installations', 'finances', 'finincome', 'finexpenses', 'invoices', 'estimates', 'ledger', 'finarchive', 'payouts', 'calendar', 'closedeals', 'routing', 'employees', 'subs', 'supplyorders', 'matlists', 'receipts', 'quickbooks'],
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
    window.__bpQuiet = true; L.redrawAt = Date.now();
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

  /* ---- after a save, the open screen reloads itself (2026-11-18) ----
     Some saves said "Saved" while the page behind them still showed the old version (the
     page wasn't drawn again, or the server answered the reload with its copy from a moment
     before). So after anything the person saves (portal/offline.js 'bp-saved'):
       1. once the pop-up is closed and they aren't typing, the open page is drawn again,
          unless the app already redrew it after the save;
       2. pages whose data lives on the server (contacts, calendar, estimates...) are drawn
          again a few seconds later as well, for a server that is slow to show the change.
     Quiet like the live updates: no fade, same scroll position. Only saves that follow a tap
     or a key press count, so the app's own background syncing never sets this off. */
  var S = { touched: 0, savedAt: 0, drawnAt: 0, t1: 0, t2: 0, tries: 0 };
  var LOCAL = { dashboard: 1, activejobs: 1, installations: 1, finances: 1, finincome: 1, finexpenses: 1, ledger: 1, finarchive: 1, payouts: 1, routing: 1, supplyorders: 1, matlists: 1, receipts: 1, quickbooks: 1 };
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { S.touched = Date.now(); }, true); });
  (function watchArea() {
    var a = document.getElementById('bpxViewArea'); if (!a) return setTimeout(watchArea, 500);
    new MutationObserver(function (ms) { for (var i = 0; i < ms.length; i++) if (ms[i].target === a && ms[i].addedNodes.length) { S.drawnAt = Date.now(); return; } }).observe(a, { childList: true });
  })();
  function idle() { return !busy() && Date.now() - S.touched > 700; }
  function afterSave() {
    clearTimeout(S.t1);
    if (!idle()) { if (++S.tries < 150) S.t1 = setTimeout(afterSave, 400); return; }   /* up to a minute for the pop-up to close */
    S.tries = 0;
    var v = window._bpCurView || ''; if (!v) return;
    if (S.drawnAt <= S.savedAt || busyClosedRecently()) redraw();
    clearTimeout(S.t2);
    if (!LOCAL[v] && !/^crew/.test(v)) S.t2 = setTimeout(function later(n) {
      n = n || 0;
      if (window._bpCurView !== v) return;
      if (!idle()) { if (n < 40) S.t2 = setTimeout(function () { later(n + 1); }, 500); return; }
      redraw();
    }, 4000);
  }
  /* the pop-up was open when the app redrew the page: what's behind it may be from before the save */
  var modalShut = 0, modalWas = false;
  (function watchModal() {
    var bx = document.getElementById('bpx'); if (!bx) return setTimeout(watchModal, 500);
    new MutationObserver(function () { var on = !!document.getElementById('bpx-modal'); if (modalWas && !on) modalShut = Date.now(); modalWas = on; })
      .observe(bx, { childList: true });
  })();
  function busyClosedRecently() { return modalShut >= S.savedAt && S.drawnAt < modalShut; }
  window.addEventListener('bp-saved', function () {
    /* a save made by a redraw itself (no tap since it started) never starts another: no loops */
    if (!document.querySelector('#bpx.open') || (window.__bpQuiet && S.touched < (L.redrawAt || 0))) return;
    if (Date.now() - S.touched > 15000) return;   /* not something the person just did */
    S.savedAt = Date.now(); S.tries = 0;
    clearTimeout(S.t1); S.t1 = setTimeout(afterSave, 600);
  });
  window.bpLive = { state: function () { return { on: !!L.ch, owner: L.owner, lost: L.lost }; }, now: function (k) { due(k || '*'); } };
})();
