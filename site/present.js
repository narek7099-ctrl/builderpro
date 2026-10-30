/* ============================================================================
   Presentation scrolling (preview): the page moves one slide at a time.

   The page underneath is the normal homepage, so its scroll-driven pieces
   (the hero story, the highlighted text, the heading reveals) keep working:
   this file only decides WHERE the page goes and glides it there.

     stops     every section's top; a section taller than the screen gets a
               stop per screenful, so its content is read before moving on.
               Tiny sections (the logo wall) ride along with the one before.
     input     wheel / trackpad, swipe, arrow keys, Page Up/Down, Space,
               Home/End, and same-page links (#pricing). One gesture = one
               slide; a trackpad's long glide after a flick is ignored.
     standby   any overlay (menu, drawer, calculators, plan modal, portal),
               anything that scrolls on its own, and form fields keep their
               normal behaviour. "Reduce motion" turns the whole thing off.
     chrome    dots on the right (computers), the nav's section highlight and
               progress line, and a "scroll" hint on the first slide.
   ========================================================================== */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var root = document.documentElement;
  root.classList.add('bp-present');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var main = $('#main'); if (!main) return;

  var NAMES = { home: 'Home', simple: 'Why BuilderPro', grow: 'Grow with us', how: 'How it works', trades: 'Every trade', lisa: 'Lisa AI', aiteam: 'AI Team', pricing: 'Pricing', faq: 'FAQ' };
  var DUR = 900, NAV = 76;
  var groups = [], stops = [], cur = 0, busy = false, quietUntil = 0, lastWheel = 0, acc = 0;

  /* ---------- slides ---------- */
  function build() {
    var vh = window.innerHeight, y0 = window.scrollY;
    var secs = [].slice.call(main.children).filter(function (el) { return /^(SECTION|FOOTER)$/.test(el.tagName) && el.offsetHeight > 8; });
    groups = [];
    secs.forEach(function (el) {
      var r = el.getBoundingClientRect(), top = r.top + y0, bottom = r.bottom + y0;
      var small = el.offsetHeight < vh * 0.45 && groups.length && el.tagName !== 'FOOTER';
      if (small) { groups[groups.length - 1].bottom = bottom; groups[groups.length - 1].els.push(el); return; }
      groups.push({ id: el.id || (el.tagName === 'FOOTER' ? 'footer' : ''), el: el, els: [el], top: top, bottom: bottom });
    });
    stops = [];
    groups.forEach(function (g, gi) {
      var first = Math.max(0, gi === 0 ? 0 : g.top - NAV + 6), last = Math.max(first, g.bottom - vh), page = vh - NAV - 40;
      g.from = stops.length;
      stops.push({ y: first, g: gi });
      /* the hero tells its story in steps: stop where each step is fully on (site.js setStep) */
      var steps = g.id === 'home' && window.innerWidth > 767 ? $$('[data-hero-step]', g.el) : [];
      /* a step is on from its block's top reaching the bottom of the screen until its bottom
         does; stop 62% of the way in, past the hero's fade-in (done at top 40%) */
      if (steps.length) steps.forEach(function (b) { var r = b.getBoundingClientRect(); stops.push({ y: r.top + y0 + r.height * 0.62 - vh, g: gi }); });
      /* How it works: a pinned picture with features scrolling past; one stop per feature, centred */
      else if (g.id === 'how' && $$('.sol_block', g.el).length && window.innerWidth > 767) $$('.sol_block', g.el).forEach(function (b) { var r = b.getBoundingClientRect(); stops.push({ y: r.top + y0 + r.height / 2 - vh / 2, g: gi }); });
      else {
        /* a tall section: each screen starts at the top of a card, never halfway through one */
        var marks = [];
        g.els.forEach(function (el) { $$(':scope > .stack > *, :scope > .stack > * > *', el).forEach(function (c) { var t = c.getBoundingClientRect().top + y0 - NAV - 6; if (c.offsetHeight > 30) marks.push(t); }); });
        marks.sort(function (a, b) { return a - b; });
        var y = first;
        while (last - y > vh * 0.3) {
          var cand = marks.filter(function (m) { return m > y + vh * 0.35 && m <= y + page; });
          var ny = cand.length ? cand[cand.length - 1] : y + page;
          if (ny >= last) ny = last;
          stops.push({ y: ny, g: gi }); y = ny;
        }
      }
      g.to = stops.length - 1;
      g.els.forEach(function (el) { el.classList.add('pr-sec'); });
    });
    var max = document.documentElement.scrollHeight - vh;
    stops.forEach(function (s) { s.y = Math.min(s.y, max); });
    /* two stops at the same spot would make a flick do nothing: keep the later one */
    stops = stops.filter(function (s, i) { var n = stops[i + 1]; return !n || n.y - s.y > 40; });
    groups.forEach(function (g, gi) { g.from = -1; stops.forEach(function (s, i) { if (s.g === gi) { if (g.from < 0) g.from = i; g.to = i; } }); });
    dots();
  }
  function nearest(y) {
    var best = 0;
    stops.forEach(function (s, i) { if (s.y <= y + 4) best = i; });
    return best;
  }

  /* ---------- moving ---------- */
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  function go(i, instant) {
    if (!stops.length) build();
    i = Math.max(0, Math.min(stops.length - 1, i));
    var from = window.scrollY, to = stops[i].y, gi = stops[i].g, enterNew = stops[cur] && stops[cur].g !== gi;
    cur = i;
    reveal(gi, enterNew);
    paint();
    if (instant || Math.abs(to - from) < 2) { window.scrollTo(0, to); return; }
    busy = true;
    var t0 = performance.now(), d = Math.min(1300, DUR + Math.abs(to - from) / window.innerHeight * 60);
    (function step(now) {
      var p = Math.min(1, (now - t0) / d);
      window.scrollTo(0, from + (to - from) * ease(p));
      if (p < 1) requestAnimationFrame(step);
      else { busy = false; quietUntil = performance.now() + 120; }
    })(t0);
  }
  function next() { go(cur + 1); }
  function prev() { go(cur - 1); }
  function goSection(id) {
    build();
    var gi = -1;
    groups.forEach(function (g, k) { if (g.id === id || g.els.some(function (e) { return e.id === id; })) gi = k; });
    if (gi < 0) { var el = document.getElementById(id); if (el) { var y = el.getBoundingClientRect().top + window.scrollY - NAV; return go(nearest(y)); } return; }
    go(groups[gi].from);
  }
  window.bpPresent = { next: next, prev: prev, go: go, section: goSection, rebuild: build };

  /* slides that are not on screen wait just below, and rise in when they arrive */
  function reveal(gi, animate) {
    groups.forEach(function (g, k) {
      var on = k === gi;
      g.els.forEach(function (el) {
        if (on) { if (animate) { el.classList.add('pr-out'); void el.offsetWidth; } requestAnimationFrame(function () { el.classList.remove('pr-out'); }); }
        else if (Math.abs(k - gi) > 0) el.classList.add('pr-out');
      });
    });
  }

  /* ---------- when to stand aside ---------- */
  function standby(target) {
    if (document.body.classList.contains('is-locked') || document.body.style.overflow === 'hidden') return true;
    if ($('#bpx.open, .modal-ov.open, .pnav_sheet.open, .pnav_dd.open')) return true;
    if (target && target.closest && target.closest('input, textarea, select, [contenteditable], #bpx, .modal, .drawer, .calc, .pnav_sheet, .atlas-inline, .est-shell, iframe, [data-lenis-prevent]')) return true;
    /* something under the pointer scrolls by itself (a list, a chat): let it */
    for (var n = target; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return true;
    }
    return false;
  }

  /* ---------- input ---------- */
  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey || standby(e.target)) return;
    e.preventDefault();
    var now = performance.now(), gap = now - lastWheel; lastWheel = now;
    if (busy || now < quietUntil) { quietUntil = Math.max(quietUntil, now + 140); return; }   /* the tail of a trackpad flick */
    if (gap > 220) acc = 0;
    acc += e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
    if (Math.abs(acc) < 24) return;
    acc > 0 ? next() : prev(); acc = 0;
  }, { passive: false, capture: true });

  var tY = null, tX = 0, tT = 0;
  window.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || standby(e.target)) { tY = null; return; }
    tY = e.touches[0].clientY; tX = e.touches[0].clientX; tT = performance.now();
  }, { passive: true, capture: true });
  window.addEventListener('touchmove', function (e) {
    if (tY === null) return;
    var dy = tY - e.touches[0].clientY, dx = tX - e.touches[0].clientX;
    if (Math.abs(dy) > Math.abs(dx)) e.preventDefault();   /* sideways swipes (carousels) stay native */
  }, { passive: false, capture: true });
  window.addEventListener('touchend', function (e) {
    if (tY === null) return;
    var t = e.changedTouches[0], dy = tY - t.clientY, dx = tX - t.clientX; tY = null;
    if (busy || Math.abs(dy) < 36 || Math.abs(dy) < Math.abs(dx)) return;
    dy > 0 ? next() : prev();
  }, { capture: true });

  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || standby(e.target)) return;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); if (!busy) next(); }
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { e.preventDefault(); if (!busy) prev(); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(stops.length - 1); }
  });

  /* same-page links go by slide (runs before the site's own smooth-scroll handler) */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    var id = a.getAttribute('href').slice(1); if (!id || !document.getElementById(id)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    closeSheet(); closeDd();
    if (window.dlMenu) try { dlMenu(false); } catch (x) {}
    goSection(id);
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  }, true);

  /* the scrollbar (or anything else) moved the page: follow along */
  var idle = 0;
  window.addEventListener('scroll', function () {
    if (busy) return;
    clearTimeout(idle);
    idle = setTimeout(function () { var i = nearest(window.scrollY); if (i !== cur) { var g = stops[i].g; cur = i; reveal(g, false); paint(); } }, 120);
  }, { passive: true });
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { var g = stops[cur] ? stops[cur].g : 0; build(); go(groups[g] ? groups[g].from : 0, true); }, 200); });

  /* ---------- chrome: dots, nav highlight, progress, hint ---------- */
  var dotsEl = null;
  function dots() {
    if (!dotsEl) { dotsEl = document.createElement('nav'); dotsEl.className = 'pr-dots'; dotsEl.setAttribute('aria-label', 'Slides'); document.body.appendChild(dotsEl); }
    dotsEl.innerHTML = groups.map(function (g, k) {
      var name = NAMES[g.id] || (g.id === 'footer' ? 'Get started' : g.el.getAttribute('aria-label') || 'Section');
      return '<button type="button" data-g="' + k + '" aria-label="' + name + '"><i></i><span>' + name + '</span></button>';
    }).join('');
    $$('button', dotsEl).forEach(function (b) { b.onclick = function () { go(groups[+b.dataset.g].from); }; });
  }
  function paint() {
    var s = stops[cur]; if (!s) return;
    var g = groups[s.g], id = g ? g.id : '';
    if (dotsEl) $$('button', dotsEl).forEach(function (b) { b.classList.toggle('on', +b.dataset.g === s.g); });
    $$('.pnav [data-sec], .pnav_sheet [data-sec]').forEach(function (a) { a.classList.toggle('on', a.dataset.sec === id); });
    $$('.pnav_dd').forEach(function (d) { d.classList.toggle('on', !!d.querySelector('[data-sec="' + id + '"]')); });
    var bar = $('.pnav_progress i'); if (bar) bar.style.width = (stops.length > 1 ? cur / (stops.length - 1) * 100 : 0) + '%';
    var hint = $('.pr-hint'); if (hint) hint.classList.toggle('gone', cur > 0);
  }
  var hint = document.createElement('div'); hint.className = 'pr-hint'; hint.setAttribute('aria-hidden', 'true'); hint.innerHTML = '<i></i>Scroll';
  document.body.appendChild(hint);

  /* ---------- nav: dropdowns and the phone sheet ---------- */
  function closeDd() { $$('.pnav_dd.open').forEach(function (d) { d.classList.remove('open'); $('.pnav_link', d).setAttribute('aria-expanded', 'false'); }); }
  $$('.pnav_dd').forEach(function (d) {
    var btn = $('.pnav_link', d), t = 0;
    var open = function () { clearTimeout(t); closeDd(); d.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); };
    btn.addEventListener('click', function (e) { e.stopPropagation(); d.classList.contains('open') ? closeDd() : open(); });
    d.addEventListener('mouseenter', function () { if (matchMedia('(hover:hover)').matches) open(); });
    d.addEventListener('mouseleave', function () { t = setTimeout(closeDd, 180); });
    $$('.pnav_panel a', d).forEach(function (a) { a.addEventListener('click', function () { closeDd(); }); });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.pnav_dd')) closeDd(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDd(); closeSheet(); } });

  var sheet = $('#pnavSheet'), burger = $('.pnav_burger');
  function openSheet() { if (!sheet) return; sheet.hidden = false; requestAnimationFrame(function () { sheet.classList.add('open'); }); if (burger) burger.setAttribute('aria-expanded', 'true'); var c = $('.pnav_close', sheet); if (c) c.focus(); }
  function closeSheet() { if (!sheet || sheet.hidden) return; sheet.classList.remove('open'); if (burger) burger.setAttribute('aria-expanded', 'false'); setTimeout(function () { sheet.hidden = true; }, 250); }
  if (burger) burger.addEventListener('click', openSheet);
  if (sheet) {
    $('.pnav_close', sheet).addEventListener('click', closeSheet);
    $$('button[onclick*="dlCalc"], .js-open-drawer, a[href^="/"]', sheet).forEach(function (b) { b.addEventListener('click', closeSheet); });
  }

  /* ---------- start ---------- */
  function start() {
    build();
    var h = location.hash.slice(1);
    if (h && document.getElementById(h)) goSection(h); else { cur = nearest(window.scrollY); reveal(stops[cur] ? stops[cur].g : 0, false); paint(); }
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
  /* fonts, images and the FAQ change heights: keep the stops honest */
  setTimeout(build, 2500);
  document.addEventListener('toggle', function () { setTimeout(build, 50); }, true);
})();
