/* App motion polish (styles in portal/motion.css).
   - When a page opens, its cards rise in one after another. A page that
     redraws itself a moment later (fresh numbers arriving) is left still.
   - The bottom-bar tab you tap bounces once.
   - bpBurst(el): a small burst of colored pieces, for "Finish job".
   Reduced motion: none of it runs. */
(function () {
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
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
