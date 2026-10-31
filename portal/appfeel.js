/* Small things that make the phone app feel like an app (phones only, via
   bpMobile.on()):
     - a light tap you can feel on tab changes and finished actions
       (Capacitor Haptics in the store app, navigator.vibrate on Android web)
     - pull down at the top of a screen to reload it
     - a short fade-up when a new screen opens
     - an offline notice, and "Back online" when the signal returns
   Nothing here changes data; reloading a screen just runs bpNav() again. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var on = function () { return !!(window.bpMobile && bpMobile.on && bpMobile.on()); };
  var calm = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  /* ------------------------------------------------------------ haptics --- */
  window.bpHaptic = function (kind) {
    try {
      var H = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Haptics;
      if (H) {
        if (kind === 'success' || kind === 'warning' || kind === 'error') return H.notification({ type: kind.toUpperCase() });
        return H.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
      }
      if (navigator.vibrate) navigator.vibrate(kind === 'success' ? [10, 40, 10] : kind === 'error' ? [30, 40, 30] : 8);
    } catch (e) {}
  };
  document.addEventListener('click', function (e) {
    if (!on()) return;
    var t = e.target.closest && e.target.closest('.bp-tabbar button, .ho-tabbar button, .hp-tabbar button, .pjs-tab');
    if (t && !t.classList.contains('on')) bpHaptic('light');
  }, true);

  /* ------------------------------------------------- new-screen fade-up --- */
  function hookNav() {
    var nav = window.bpNav; if (!nav || nav._feel) return !!(nav && nav._feel);
    var wrapped = function (v) {
      var before = window._bpCurView, r = nav.apply(this, arguments);
      if (on() && !calm() && v !== before) {
        var a = $('bpxViewArea');
        if (a) { a.classList.remove('bp-enter'); void a.offsetWidth; a.classList.add('bp-enter'); setTimeout(function () { a.classList.remove('bp-enter'); }, 320); }
      }
      return r;
    };
    wrapped._feel = true;
    window.bpNav = wrapped;
    return true;
  }
  if (!hookNav()) { var tries = 0, ti = setInterval(function () { if (hookNav() || ++tries > 40) clearInterval(ti); }, 250); }

  /* ------------------------------------------------------ pull to refresh --- */
  var P = { y0: 0, x0: 0, d: 0, live: false, busy: false, sc: null };
  function scroller(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 2) return n;
    }
    return document.scrollingElement;
  }
  function blocked(el) {
    /* not inside dialogs, sheets, sideways lists, text boxes or maps */
    return !!(el.closest && el.closest('#bpx-modal, .bp-sheet, [role="dialog"], input, textarea, select, iframe, .mh-apps, .pr-det, [data-no-ptr]'));
  }
  function ind() {
    var i = $('bpPtr');
    if (!i) { i = document.createElement('div'); i.id = 'bpPtr'; i.setAttribute('aria-hidden', 'true'); i.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>'; document.body.appendChild(i); }
    return i;
  }
  document.addEventListener('touchstart', function (e) {
    if (!on() || P.busy || e.touches.length !== 1) return;
    var app = $('bpxViewArea'); if (!app || !app.contains(e.target) || blocked(e.target)) return;
    P.sc = scroller(e.target);
    if (!P.sc || P.sc.scrollTop > 0) return;
    P.y0 = e.touches[0].clientY; P.x0 = e.touches[0].clientX; P.d = 0; P.live = true;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!P.live) return;
    var dy = e.touches[0].clientY - P.y0, dx = Math.abs(e.touches[0].clientX - P.x0);
    if (dy <= 0 || dx > dy || (P.sc && P.sc.scrollTop > 0)) { P.live = false; reset(); return; }
    P.d = Math.min(120, dy * 0.5);
    var i = ind(); i.classList.add('show'); i.classList.toggle('ready', P.d >= 64);
    i.style.transform = 'translate(-50%,' + (P.d - 40) + 'px) rotate(' + (P.d * 3) + 'deg)';
  }, { passive: true });
  document.addEventListener('touchend', function () {
    if (!P.live) return; P.live = false;
    if (P.d >= 64 && window._bpCurView && window.bpNav) {
      P.busy = true; bpHaptic('light');
      var i = ind(); i.classList.add('spin'); i.style.transform = 'translate(-50%,24px)';
      try { bpNav(window._bpCurView); } catch (e) {}
      setTimeout(function () { P.busy = false; reset(); }, 900);
    } else reset();
  }, { passive: true });
  function reset() { var i = $('bpPtr'); if (i) { i.classList.remove('show', 'ready', 'spin'); i.style.transform = ''; } P.d = 0; }

  /* ------------------------------------- swipe a bottom sheet down to close --- */
  var W = { card: null, y0: 0, d: 0 };
  document.addEventListener('touchstart', function (e) {
    if (!on() || e.touches.length !== 1) return;
    var card = e.target.closest && e.target.closest('.bpx-modal:not(.pjs)>.bpx-modalcard');
    if (!card || card.scrollTop > 0 || (e.target.closest('input, textarea, select, [contenteditable]'))) return;
    W.card = card; W.y0 = e.touches[0].clientY; W.d = 0;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!W.card) return;
    var dy = e.touches[0].clientY - W.y0;
    if (dy <= 0 || W.card.scrollTop > 0) { W.card.style.transform = ''; W.d = 0; return; }
    W.d = dy; W.card.style.transition = 'none'; W.card.style.transform = 'translateY(' + dy + 'px)';
  }, { passive: true });
  document.addEventListener('touchend', function () {
    var c = W.card; if (!c) return; W.card = null;
    c.style.transition = 'transform .2s cubic-bezier(.2,0,0,1)';
    if (W.d > Math.min(140, c.offsetHeight * 0.3)) { c.style.transform = 'translateY(100%)'; setTimeout(function () { if (window.bpCloseModal) bpCloseModal(); }, 180); }
    else c.style.transform = '';
  }, { passive: true });

  /* --------------------------------------------------------------- offline --- */
  function net(online) {
    var b = $('bpNet');
    if (!b) { b = document.createElement('div'); b.id = 'bpNet'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    clearTimeout(b._t);
    if (!online) { b.className = 'off show'; b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18"/><path d="M8.5 8.6A5 5 0 0 0 6 13a4 4 0 0 0 1 7.9h10.3M20.6 18.1A4 4 0 0 0 18 11h-.2A6 6 0 0 0 11 6.1"/></svg><span>You’re offline. Saving won’t work until you’re back online.</span>'; }
    else if (b.classList.contains('off')) {
      b.className = 'on show'; b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>Back online</span>';
      b._t = setTimeout(function () { b.className = 'on'; }, 2200);
    }
  }
  window.addEventListener('offline', function () { net(false); });
  window.addEventListener('online', function () { net(true); });
  if (navigator.onLine === false) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { net(false); }); else net(false); }
})();
