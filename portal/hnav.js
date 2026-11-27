/* ==================================================================
   Homeowner screens change in place, like the contractor app (2026-11-27).

   bpGo used to set the hash and reload the whole page for every tap
   between Home (#my), a project page (#home=<token>) and Find a pro
   (#pros): a blank flash and the app starting over each time. Between
   those screens the page now swaps in place and slides, the way the
   contractor app pushes a page: forward slides in from the right, back
   from the left, a tab switch fades. The phone's back button and the
   iPhone back swipe (history) do the same. Anything else (an estimate,
   a contract, a pay link, the contractor app) still loads the old way.
   ================================================================== */
(function () {
  'use strict';
  var HO = /^#(my\b|home=|pros\b|find-a-pro\b)/i;
  var reload = function (hash) { location.href = location.pathname + hash; location.reload(); };
  function onHomeownerPage() { return document.body.classList.contains('bp-home') && !!document.getElementById('bpSign'); }
  function kind(h) { h = h || ''; return /^#home=/i.test(h) ? 'project' : /^#(pros|find-a-pro)/i.test(h) ? 'pros' : 'my'; }

  /* which way the new screen comes in */
  function dirOf(from, to) {
    var a = kind(from), b = kind(to);
    if (a === b) return 'fade';
    if (b === 'project') return 'fwd';
    if (a === 'project') return 'back';
    return 'fade';                                     /* Home <-> Find a pro: tabs */
  }

  /* screens already seen stay in memory, scrolled where they were, like an app's back stack */
  var cache = {};
  function keyOf(h) { h = h || '#my'; var m = /^#home=([a-f0-9]+)/i.exec(h); return m ? 'p:' + m[1].toLowerCase() : /^#(pros|find-a-pro)/i.test(h) ? 'pros:' + h : 'my:' + (/tab=account/.test(h) ? 'a' : 'h'); }
  function keep(fromHash, el, tabs) {
    if (!el) return;
    cache[keyOf(fromHash)] = { el: el, at: Date.now(), y: window.scrollY || 0, title: document.title, hp: /^p:/.test(keyOf(fromHash)) ? window._bpHp : null, tabs: !!tabs };
    var ks = Object.keys(cache); if (ks.length > 6) delete cache[ks[0]];
  }
  function restore(toHash) {
    var c = cache[keyOf(toHash)];
    if (!c || Date.now() - c.at > 10 * 60e3) return false;
    delete cache[keyOf(toHash)];
    c.el.id = 'bpSign'; document.body.appendChild(c.el);
    document.body.classList.add('bp-signing', 'bp-home'); document.body.classList.toggle('ho-has-tabs', c.tabs);
    document.title = c.title;
    if (c.hp) window._bpHp = c.hp;
    setTimeout(function () { try { window.scrollTo(0, c.y); } catch (e) {} }, 0);
    /* then bring it up to date quietly */
    if (c.hp && window.bpHpLoad) bpHpLoad();
    else if (/^my/.test(keyOf(toHash)) && Date.now() - c.at > 60e3 && window.bpMeLoad && window.bpMyEnter) bpMeLoad().then(function (s) { if (s) bpMyEnter(s); });
    return true;
  }

  function swap(dir, fromHash, toHash) {
    var old = document.getElementById('bpSign'), hadTabs = document.body.classList.contains('ho-has-tabs');
    /* things these screens put on <body>: the review sheet, photo viewer, sign-up sheets */
    ['hrv', 'bpApps'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
    document.querySelectorAll('body > .hp-view, body > [id^="bpcl"]').forEach(function (e) { e.remove(); });
    document.documentElement.classList.remove('hrv-lock');
    document.body.classList.remove('ho-has-tabs');
    if (old) { old.id = 'bpSignOld'; old.remove(); old.classList.remove('nav-fwd', 'nav-back', 'nav-fade'); keep(fromHash, old, hadTabs); }
    if (restore(toHash)) { var h0 = document.getElementById('bpSign'); if (h0 && dir) { h0.classList.add('nav-' + dir); setTimeout(function () { h0.classList.remove('nav-' + dir); }, 420); } return; }
    /* a fresh start for the screen being opened */
    if (window._bpHp) window._bpHp = { token: '', d: null, tab: 'overview', co: null, req: false, reqSent: false, anim: false };
    if (window._bpMy) { _bpMy.tab = ''; _bpMy.add = ''; }
    if (window._bpPr) { _bpPr.open = ''; _bpPr.res = null; }
    try { window.scrollTo(0, 0); } catch (e) {}
    var ok = false;
    try { ok = (window.bpHomeRoute && bpHomeRoute()) || (window.bpProsRoute && bpProsRoute()) || (window.bpMyRoute && bpMyRoute()); } catch (e) { ok = false; }
    if (!ok) { location.reload(); return; }
    var host = document.getElementById('bpSign');
    if (host && dir) {
      host.classList.add('nav-' + dir);
      setTimeout(function () { host.classList.remove('nav-' + dir); }, 420);
    }
  }

  window.bpGo = function (hash) {
    hash = String(hash || '');
    if (!HO.test(hash) || !onHomeownerPage() || !window.history || !history.pushState) return reload(hash);
    var from = location.hash || '#my';
    if (hash === from) return;
    /* "back to My projects" when that's where they came from: step back, so the history stays in order */
    if (stack.length > 1 && stack[stack.length - 2] === hash) { history.back(); return; }
    try { history.pushState({ bpho: 1 }, '', location.pathname + location.search + hash); } catch (e) { return reload(hash); }
    stack.push(hash); last = hash;
    swap(dirOf(from, hash), from, hash);
  };

  /* back and forward (the button, the swipe) */
  var last = location.hash, stack = [location.hash || '#my'];
  window.addEventListener('popstate', function () {
    var h = location.hash || '';
    if (!HO.test(h) || !onHomeownerPage()) { if (HO.test(last) && !HO.test(h)) location.reload(); last = h; return; }
    if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop(); else stack.push(h);
    var d = dirOf(last, h), f = last; last = h; swap(d, f, h);
  });
  window.addEventListener('hashchange', function () { last = location.hash; });

  /* ---- pull down to refresh, like the contractor app (portal/appfeel.js) ---- */
  var P = { y0: 0, x0: 0, d: 0, live: false, busy: false };
  var phone = function () { return window.matchMedia && matchMedia('(max-width: 899px)').matches; };
  function ind() {
    var i = document.getElementById('hoPtr');
    if (!i) { i = document.createElement('div'); i.id = 'hoPtr'; i.setAttribute('aria-hidden', 'true');
      i.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
      document.body.appendChild(i); }
    return i;
  }
  function resetP() { var i = document.getElementById('hoPtr'); if (i) { i.classList.remove('show', 'ready', 'spin'); i.style.transform = ''; } P.d = 0; }
  document.addEventListener('touchstart', function (e) {
    if (!phone() || P.busy || e.touches.length !== 1 || !onHomeownerPage()) return;
    var t = e.target; if (!t.closest || !t.closest('#bpSign') || t.closest('input, textarea, select, .hrv, .hp-view, .hd-photos, .hx-strip-row, .pr-det, [role="dialog"], .hp-thread')) return;
    if ((window.scrollY || 0) > 0) return;
    P.y0 = e.touches[0].clientY; P.x0 = e.touches[0].clientX; P.d = 0; P.live = true;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!P.live) return;
    var dy = e.touches[0].clientY - P.y0, dx = Math.abs(e.touches[0].clientX - P.x0);
    if (dy <= 0 || dx > dy || (window.scrollY || 0) > 0) { P.live = false; resetP(); return; }
    P.d = Math.min(120, dy * 0.5);
    var i = ind(); i.classList.add('show'); i.classList.toggle('ready', P.d >= 64);
    i.style.transform = 'translate(-50%,' + (P.d - 40) + 'px) rotate(' + (P.d * 3) + 'deg)';
  }, { passive: true });
  document.addEventListener('touchend', function () {
    if (!P.live) return; P.live = false;
    if (P.d < 64) { resetP(); return; }
    P.busy = true; var i = ind(); i.classList.add('spin'); i.style.transform = 'translate(-50%,24px)';
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
    var t0 = Date.now(), k = kind(location.hash), job;
    if (k === 'project' && window.bpHpLoad) job = bpHpLoad();
    else if (k === 'my' && window.bpMeLoad && window.bpMyEnter) job = bpMeLoad().then(function (s) { if (s) bpMyEnter(s); });
    Promise.resolve(job).catch(function () {}).then(function () { setTimeout(function () { P.busy = false; resetP(); }, Math.max(0, 700 - (Date.now() - t0))); });
  }, { passive: true });

  /* ---- the small title in the top bar once the big one scrolls away ---- */
  function barTitle() {
    var bar = document.querySelector('#bpSign .pr-pbar'); if (!bar) return;
    var k = kind(location.hash), h1 = document.querySelector('#bpSign .ho-hi h1, #bpSign .pr-hero-t h1');
    bar.setAttribute('data-t', k === 'pros' ? 'Find a pro' : /tab=account/.test(location.hash) || (window._bpMy && _bpMy.tab === 'account') ? 'Account' : 'Home');
    document.body.classList.toggle('ho-up', !!h1 && h1.getBoundingClientRect().bottom < 60);
  }
  window.addEventListener('scroll', barTitle, { passive: true });
})();
