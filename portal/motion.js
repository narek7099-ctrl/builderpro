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
