/* App motion polish (styles in portal/motion.css).
   - When a page opens, its cards rise in one after another. A page that
     redraws itself a moment later (fresh numbers arriving) is left still.
   - The bottom-bar tab you tap bounces once.
   - bpBurst(el): a small burst of colored pieces, for "Finish job".
   Reduced motion: none of it runs. */
(function () {
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Dark mode switch: the new theme spreads out in a circle from where you
     tapped (the sales-dashboard reel's View Transition, circle clip-path).
     Browsers without View Transitions, and reduced motion, just switch. */
  var tapX = innerWidth / 2, tapY = 40;
  document.addEventListener('pointerdown', function (e) { tapX = e.clientX; tapY = e.clientY; }, true);
  function wrapTheme() {
    var orig = window.bpToggleTheme;
    if (!orig || orig._mo) return;
    var w = function () {
      var args = arguments, self = this;
      if (RM || !document.startViewTransition) return orig.apply(self, args);
      var x = tapX, y = tapY, end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      var vt = document.startViewTransition(function () { orig.apply(self, args); });
      vt.ready.then(function () {
        document.documentElement.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + end + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 620, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(function () {});
    };
    w._mo = true; window.bpToggleTheme = w;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrapTheme); else wrapTheme();
  window.addEventListener('load', wrapTheme);
  if (RM) { window.bpBurst = function () {}; return; }
  var last = '', lastT = 0;
  var PICK = '.hl-grid > *, .db-grid > *, .mh2-body > section, .mh2-tiles > *, .pj-grid > *, .bpx-ceo, .dash-mini';
  function stagger(area) {
    var v = window._bpCurView || '', now = Date.now();
    if (v === last && now - lastT < 4000) return;
    last = v; lastT = now;
    var els = [].slice.call(area.querySelectorAll(PICK)).filter(function (el) { return el.offsetParent !== null; }).slice(0, 16);
    if (!els.length) els = [].slice.call(area.children).slice(0, 8);
    els.forEach(function (el, i) {
      el.style.setProperty('--i', i);
      el.classList.remove('mo-in'); void el.offsetWidth; el.classList.add('mo-in');
      setTimeout(function () { el.classList.remove('mo-in'); }, 700 + i * 35 + 200);
    });
  }
  function watch() {
    var area = document.getElementById('bpxViewArea');
    if (!area) return setTimeout(watch, 400);
    new MutationObserver(function () { requestAnimationFrame(function () { stagger(area); }); }).observe(area, { childList: true });
  }
  watch();
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('#bpTabbar .bp-tab:not(.bp-tab-new)');
    if (!t) return;
    t.classList.remove('mo-pop'); void t.offsetWidth; t.classList.add('mo-pop');
    setTimeout(function () { t.classList.remove('mo-pop'); }, 600);
  }, true);
  /* cursor spotlight: cards light up where the mouse is */
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var c = e.target.closest && e.target.closest('#bpxViewArea .bpx-panel, .ceo-dash'); if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
  /* small charts on the money cards: hover (or touch) reads out the value under the finger */
  function vizAt(viz, clientX) {
    var svg = viz.querySelector('.cb-svg'), tip = viz.querySelector('.cb-tip'); if (!svg || !tip) return;
    var pts; try { pts = JSON.parse(svg.getAttribute('data-pts') || '[]'); } catch (e) { pts = []; }
    if (!pts.length) return;
    var r = svg.getBoundingClientRect(), x = (clientX - r.left) / r.width * 96, k = 0, best = 1e9;
    pts.forEach(function (p, i) { var d = Math.abs(p[0] - x); if (d < best) { best = d; k = i; } });
    var p = pts[k], kind = svg.getAttribute('data-kind');
    viz.classList.add('hov');
    var g = svg.querySelector('.cb-guide'); g.setAttribute('x1', p[0]); g.setAttribute('x2', p[0]);
    [].forEach.call(svg.querySelectorAll('.cb-bar'), function (b) { b.classList.toggle('hot', +b.getAttribute('data-i') === k); });
    var dot = svg.querySelector('.cb-hdot');
    if (kind === 'line') { if (!dot) { dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('class', 'cb-hdot'); dot.setAttribute('r', '4'); svg.appendChild(dot); } dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); }
    tip.hidden = false; tip.innerHTML = '<b>' + p[3] + '</b><span>' + (p[2] || '') + '</span>';
    tip.style.left = (p[0] / 96 * r.width) + 'px';
  }
  function vizOut(viz) { viz.classList.remove('hov'); var d = viz.querySelector('.cb-hdot'); if (d) d.remove(); }
  document.addEventListener('pointermove', function (e) { var v = e.target.closest && e.target.closest('.cb-viz'); if (v) vizAt(v, e.clientX); }, { passive: true });
  document.addEventListener('pointerout', function (e) { var v = e.target.closest && e.target.closest('.cb-viz'); if (v && !v.contains(e.relatedTarget)) vizOut(v); }, true);
  document.addEventListener('pointerdown', function (e) { var v = e.target.closest && e.target.closest('.cb-viz'); if (v) vizAt(v, e.clientX); }, true);
  var COL = ['#2f80ff', '#f5a524', '#22a06b', '#ef6c4a', '#8b5cf6', '#14b8a6'];
  window.bpBurst = function (el) {
    if (!el) return;
    var host = el.parentNode; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var box = el.getBoundingClientRect(), hb = host.getBoundingClientRect();
    for (var i = 0; i < 18; i++) {
      var p = document.createElement('i'), a = (i / 18) * Math.PI * 2 + Math.random() * .4, d = 60 + Math.random() * 55;
      p.className = 'mo-burst';
      p.style.left = (box.left - hb.left + box.width / 2) + 'px'; p.style.top = (box.top - hb.top + box.height / 2) + 'px';
      p.style.background = COL[i % COL.length];
      p.style.setProperty('--dx', Math.cos(a) * d + 'px'); p.style.setProperty('--dy', Math.sin(a) * d + 'px'); p.style.setProperty('--r', (Math.random() * 360) + 'deg');
      host.appendChild(p);
      setTimeout(function (n) { n.remove(); }.bind(null, p), 1000);
    }
  };
})();

/* ---- every big number in the software counts up and rises in (2026-11) ----
   The dashboard already does this for its own numbers (portal/dash.js
   countUp); this does the same for the rest: any large figure on a page,
   money, a count or a percent, runs up from zero in 0.9s with a small rise
   the first time it appears after a page opens. It looks for numbers set in
   big type (20px and up) so labels, dates, phone numbers and table cells are
   left alone. Reduced motion: no animation. */
(function () {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var NUM = /^([$€£]?\s?-?\$?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?[%kKmM]?)$/;
  var SKIP = '[data-cu],input,textarea,select,table,svg,[contenteditable],.cal-grid,.cw-wrap,.cd-wrap,.leaflet-container';
  /* the dashboard counts its own numbers (portal/dash.js countUp); everywhere else the same styles are fair game */
  var DASH_OWN = '.db-kv,.hl-kv,.hl-mv,.wk-num';
  /* inside a stat card a number counts even in slightly smaller type */
  var STATBOX = '.bpx-stat,.db-st,.db-k,.pjk-stat,.rcp-stat,.cl-tile,.ws-st,.bpx-mk-card,.st-plan,.mh2-owed,[class*="stat"],[class*="kpi"],[class*="tile"]';
  var seen = {}, rising = new WeakSet();
  function view() { return window._bpCurView || ''; }
  function run(el) {
    if (rising.has(el) || el.children.length) return;
    var txt = el.textContent.trim(); if (!txt || txt.length > 16) return;
    var tm = /^(?:(\d+)m\s?)?(\d+)s$|^(\d+)m\s?$/.exec(txt);   /* a time like 1m 42s, 45s or 3m */
    if (tm) return runTime(el, txt, (+(tm[1] || tm[3] || 0)) * 60 + (+(tm[2] || 0)));
    var m = NUM.exec(txt); if (!m) return;
    var end = parseFloat((m[2] + (m[3] || '')).replace(/,/g, ''));
    if (!isFinite(end) || Math.abs(end) < 1) return;
    if (!m[1] && !m[4] && !m[3] && end >= 1900 && end <= 2100) return;   /* a year, not an amount */
    var fs = parseFloat(getComputedStyle(el).fontSize) || 0;
    if (fs < 15 || (fs < 20 && !el.closest(STATBOX))) return;
    if (el.closest(SKIP)) return;
    if (view() === 'dashboard' && el.closest(DASH_OWN)) return;
    var key = view() + '|' + txt + '|' + ((el.parentElement && el.parentElement.textContent.trim().slice(0, 40)) || '');
    var now = performance.now(), was = seen[key];
    if (was && now - was > 900) return;          /* already counted on this visit */
    if (!was) seen[key] = now;                    /* a redraw mid-count carries on from the same start */
    rising.add(el);
    var dec = m[3] ? m[3].length - 1 : 0, pre = m[1], post = m[4] || '', comma = m[2].indexOf(',') >= 0 || end >= 1000;
    var fmt = function (v) { var n = dec ? v.toFixed(dec) : String(Math.round(v)); if (comma) n = Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); return pre + n + post; };
    if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
    if (!was && el.animate) el.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' });
    var t0 = was || 0, dur = 900;
    el.textContent = fmt(was ? end * (1 - Math.pow(1 - Math.min(1, (now - was) / dur), 3)) : 0);
    var step = function (t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      if (!el.isConnected) { rising.delete(el); return; }
      el.textContent = k < 1 ? fmt(end * e) : txt;
      if (k < 1) requestAnimationFrame(step); else rising.delete(el);
    };
    requestAnimationFrame(step);
  }
  function runTime(el, txt, end) {
    if (end < 2) return;
    var fs = parseFloat(getComputedStyle(el).fontSize) || 0;
    if (fs < 15 || (fs < 20 && !el.closest(STATBOX)) || el.closest(SKIP) || (view() === 'dashboard' && el.closest(DASH_OWN))) return;
    var key = view() + '|' + txt + '|' + ((el.parentElement && el.parentElement.textContent.trim().slice(0, 40)) || '');
    var now = performance.now(), was = seen[key];
    if (was && now - was > 900) return; if (!was) seen[key] = now; rising.add(el);
    var fmt = function (v) { v = Math.round(v); return v < 60 ? v + 's' : Math.floor(v / 60) + 'm ' + (v % 60 ? (v % 60) + 's' : ''); };
    if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
    if (!was && el.animate) el.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' });
    var t0 = was || 0; el.textContent = fmt(was ? end * Math.min(1, (now - was) / 900) : 0);
    var step = function (t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3); if (!el.isConnected) { rising.delete(el); return; } el.textContent = k < 1 ? fmt(end * e) : txt; if (k < 1) requestAnimationFrame(step); else rising.delete(el); };
    requestAnimationFrame(step);
  }
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    var list = root.matches && !root.children.length ? [root] : root.querySelectorAll('b,strong,span,div,p,h1,h2,h3,h4,em');
    for (var i = 0; i < list.length && i < 400; i++) { if (!list[i].children.length) run(list[i]); }
  }
  var pend = [], tmr = 0;
  function flush() { tmr = 0; var a = pend; pend = []; a.forEach(function (n) { if (n.isConnected) scan(n); }); }
  function watch() {
    var area = document.getElementById('bpxViewArea'); if (!area) return setTimeout(watch, 600);
    new MutationObserver(function (ms) {
      ms.forEach(function (mu) {
        if (mu.type !== 'childList') return;
        var t = mu.target; if (t.nodeType === 3) t = t.parentElement;
        /* our own count-up writes text too: ignore those */
        if (t && rising.has(t)) return;
        if (mu.addedNodes.length) pend.push(t && t.nodeType === 1 && mu.addedNodes.length === 1 && mu.addedNodes[0].nodeType === 3 ? t : mu.addedNodes[0].nodeType === 1 ? mu.addedNodes[0] : t);
        for (var i = 1; i < mu.addedNodes.length; i++) if (mu.addedNodes[i].nodeType === 1) pend.push(mu.addedNodes[i]);
      });
      if (pend.length) flush();   /* before the browser paints, so the final number never flashes first */
    }).observe(area, { childList: true, subtree: true });
  }
  /* opening a page again plays its numbers again */
  function hookNav() {
    if (typeof window.bpNav !== 'function' || window.bpNav._cu) return setTimeout(hookNav, 500);
    var f = window.bpNav; window.bpNav = function (v) { seen = {}; return f.apply(this, arguments); }; window.bpNav._cu = 1;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { watch(); hookNav(); }); else { watch(); hookNav(); }
})();
