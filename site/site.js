/* Marketing site behaviour: smooth scroll, preloader, menu, masked line
   reveals, the pinned story, the flow diagram, the timeline, the form.
   No scroll listeners: everything that tracks scroll runs in a
   requestAnimationFrame loop gated by an IntersectionObserver, so it
   only ticks while its section is on screen. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  if (!reduce) document.documentElement.classList.add('dl-anim');

  /* ---------- smooth scroll ----------
     Lenis carries the page. It stands down whenever something else owns the
     screen: the loader, the menu, the portal (which sets body overflow
     hidden), the legal overlays. Anything inside those is left to scroll
     natively. */
  var lenis = null;
  if (!reduce && window.Lenis) {
    try {
      lenis = new Lenis({
        lerp: 0.09, wheelMultiplier: 1, smoothWheel: true,
        prevent: function (node) { return !!(node.closest && node.closest('#bpx, .atlas-inline, .legal-page, .modal, .est-shell, [data-lenis-prevent]')); },
      });
      var held = false;
      (function raf(t) {
        var lock = document.documentElement.classList.contains('dl-hold') || document.body.classList.contains('dl-menu-open') || document.body.style.overflow === 'hidden';
        if (lock !== held) { held = lock; held ? lenis.stop() : lenis.start(); }
        lenis.raf(t); requestAnimationFrame(raf);
      })(0);
      /* same-page links glide instead of jumping */
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
        var id = a.getAttribute('href'); if (!id || id === '#' || id.length < 2) return;
        var el = document.getElementById(id.slice(1)); if (!el) return;
        e.preventDefault(); lenis.scrollTo(el, { offset: -6, duration: 1.2 });
        if (history.pushState) history.pushState(null, '', id);
      });
    } catch (e) { lenis = null; }
  }

  /* ---------- preloader ---------- */
  (function () {
    var pre = $('.dl-pre'); if (!pre) return;
    var seen = false; try { seen = sessionStorage.getItem('bpPre') === '1'; } catch (e) {}
    if (seen || reduce) { pre.classList.add('gone'); return; }
    document.documentElement.classList.add('dl-hold');
    requestAnimationFrame(function () { pre.classList.add('in'); });
    setTimeout(function () { pre.classList.add('out'); document.documentElement.classList.remove('dl-hold'); }, 1150);
    setTimeout(function () { pre.classList.add('gone'); try { sessionStorage.setItem('bpPre', '1'); } catch (e) {} }, 2200);
  })();
  /* the page always opens at the top, so the scroll-driven hero starts in a known state */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });

  /* ---------- menu ---------- */
  window.dlMenu = function (force) {
    var open = typeof force === 'boolean' ? force : !document.body.classList.contains('dl-menu-open');
    document.body.classList.toggle('dl-menu-open', open);
    var b = $('.dl-menu-btn'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  $$('.dl-menu a').forEach(function (a, i) { a.style.setProperty('--i', i); a.addEventListener('click', function () { dlMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') dlMenu(false); });

  /* ---------- masked line reveals ----------
     A heading is split into words, the words are measured, and each run of
     words on one line is wrapped in a box that hides what is below it. The
     lines then rise into view, one after another. Split again on resize,
     because the lines change. */
  function splitLines(el) {
    if (!el._orig) el._orig = el.innerHTML;
    el.innerHTML = el._orig;
    var frag = document.createDocumentFragment();
    (function walk(node, into, em) {
      [].slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach(function (piece) {
            if (!piece) return;
            if (/^\s+$/.test(piece)) { into.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span'); w.className = 'w'; w.textContent = piece;
            if (em) { var e = document.createElement('em'); e.appendChild(w); into.appendChild(e); } else into.appendChild(w);
          });
        } else if (n.nodeName === 'BR') { into.appendChild(document.createElement('br')); }
        else if (n.nodeName === 'EM') { walk(n, into, true); }
        else { walk(n, into, em); }
      });
    })(el, frag, false);
    el.innerHTML = ''; el.appendChild(frag);
    var words = $$('.w', el), lines = [], cur = null, top = null;
    words.forEach(function (w) {
      var t = w.offsetTop;
      if (top === null || Math.abs(t - top) > 2) { cur = []; lines.push(cur); top = t; }
      cur.push(w.parentNode.nodeName === 'EM' ? w.parentNode : w);
    });
    var out = document.createDocumentFragment();
    lines.forEach(function (line) {
      var ln = document.createElement('span'); ln.className = 'ln';
      var inn = document.createElement('span'); inn.className = 'in';
      line.forEach(function (w, i) { if (i) inn.appendChild(document.createTextNode(' ')); inn.appendChild(w); });
      ln.appendChild(inn); out.appendChild(ln);
    });
    el.innerHTML = ''; el.appendChild(out);
  }
  var heads = reduce ? [] : $$('main .dl-h1, main .dl-h2, main .sec-head h2, .dl-big b');
  heads.forEach(function (h) { h.classList.add('dl-split'); splitLines(h); });
  var hio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return; hio.unobserve(e.target);
      e.target.classList.add('is-on');
      var host = e.target.closest('.dl-card, .dl-cta, .dl-stat, section') || e.target.parentElement;
      if (host) host.classList.add('is-on');
    });
  }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });
  heads.forEach(function (h) { hio.observe(h); });
  /* a kicker without a split heading beside it still gets its pill */
  $$('.dl-kicker').forEach(function (k) {
    var host = k.closest('.dl-card, .dl-cta, section'); if (!host || host.querySelector('.dl-split')) return;
    var o = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { host.classList.add('is-on'); o.disconnect(); } }, { threshold: 0.3 });
    o.observe(host);
  });
  var rw = innerWidth, rt;
  addEventListener('resize', function () {
    if (innerWidth === rw) return; rw = innerWidth; clearTimeout(rt);
    rt = setTimeout(function () {
      heads.forEach(function (h) { var on = h.classList.contains('is-on'); h.classList.add('no-anim'); splitLines(h); if (on) h.classList.add('is-on'); requestAnimationFrame(function () { h.classList.remove('no-anim'); }); });
    }, 160);
  }, { passive: true });

  /* ---------- card reveals ---------- */
  $$('main .dl-card, main .dl-photo, main .dl-stat, main .dl-acc, main .dl-plan, main .mw-card').forEach(function (el) {
    if (el.closest('.dl-hero')) return;
    el.classList.add('dl-rv');
  });
  $$('.dl-rv').forEach(function (el) {
    var i = 0, n = el; while ((n = n.previousElementSibling) && i < 8) i++;
    el.style.setProperty('--i', i);
  });
  var rio = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.dl-rv, .dl-row, .dl-flow').forEach(function (el) { rio.observe(el); });

  /* ---------- hero: pinned object + swapping panels ---------- */
  (function () {
    var hero = $('.dl-hero'), stage = $('.dl-stage'), canvas = $('.dl-stage canvas');
    if (!hero || !stage || !canvas) return;
    var api = null;
    var panels = $$('.dl-panel', hero);
    panels.forEach(function (p) {
      var body = $('.dl-panel-body', p); if (!body) return;
      body.innerHTML = body.textContent.trim().split(/\s+/).map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
    });
    var words = panels.map(function (p) { return $$('.w', p); });
    var nums = panels.map(function (p) { return $('.dl-num', p); });

    function mountGL() {
      if (!('WebGLRenderingContext' in window)) { stage.classList.add('nogl'); return; }
      import('./hero3d.js?v=20260919b').then(function (m) { api = m.mount(canvas); if (!api) stage.classList.add('nogl'); })
        .catch(function () { stage.classList.add('nogl'); });
    }
    mountGL();

    var running = false, last = -1;
    function tick() {
      if (!running) return;
      var vh = innerHeight, r = hero.getBoundingClientRect();
      var total = Math.max(1, r.height - vh);
      var p = clamp(-r.top / total, 0, 1);
      if (Math.abs(p - last) > 0.0005) { last = p; if (api) api.setProgress(p); }
      panels.forEach(function (pn, i) {
        var pr = pn.getBoundingClientRect();
        /* words ink in as the panel's text card crosses the lower half of the viewport */
        var t = clamp((vh * 0.92 - pr.bottom + pr.height * 0.6) / (vh * 0.45), 0, 1);
        var ws = words[i], n = ws.length;
        for (var k = 0; k < n; k++) { var on = k / n < t; if (ws[k].classList.contains('on') !== on) ws[k].classList.toggle('on', on); }
        if (nums[i]) nums[i].style.setProperty('--ring', Math.round(t * 360) + 'deg');
      });
      requestAnimationFrame(tick);
    }
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { if (!running) { running = true; requestAnimationFrame(tick); } } else running = false;
    }, { rootMargin: '10% 0px 10% 0px' });
    io.observe(hero);
  })();

  /* ---------- flow diagram: nodes light up in order ---------- */
  (function () {
    var flow = $('.dl-flow'); if (!flow) return;
    var nodes = $$('.dl-node', flow);
    var io = new IntersectionObserver(function (es) {
      if (!es.some(function (e) { return e.isIntersecting; })) return; io.disconnect();
      nodes.forEach(function (n, k) { setTimeout(function () { n.classList.add('on'); }, reduce ? 0 : 160 + k * 110); });
    }, { threshold: 0.15 });
    io.observe(flow);
  })();

  /* ---------- timeline: the bar grows with scroll, dots pop as it passes ---------- */
  (function () {
    var tl = $('.dl-tl'); if (!tl) return;
    var fill = $('.fill', tl), pts = $$('.pt', tl), running = false;
    function tick() {
      if (!running) return;
      var r = tl.getBoundingClientRect(), vh = innerHeight;
      var p = clamp((vh * 0.9 - r.top) / (vh * 0.8), 0, 1);
      fill.style.width = (p * 100) + '%';
      pts.forEach(function (pt, k) { pt.classList.toggle('on', k / (pts.length - 1) <= p + 0.001); });
      requestAnimationFrame(tick);
    }
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { if (!running) { running = true; requestAnimationFrame(tick); } } else running = false;
    }, { rootMargin: '20% 0px 20% 0px' });
    io.observe(tl);
    if (reduce) { fill.style.width = '100%'; pts.forEach(function (pt) { pt.classList.add('on'); }); running = false; io.disconnect(); }
  })();

  /* ---------- contact form ---------- */
  window.dlContactSend = function (btn) {
    var form = btn.closest('.dl-form'), msg = $('.msg', form);
    var name = $('#cfName', form), email = $('#cfEmail', form);
    var bad = [];
    if (name && !name.value.trim()) bad.push(name);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) bad.push(email);
    $$('input,textarea', form).forEach(function (i) { i.style.borderColor = ''; });
    if (bad.length) { bad.forEach(function (i) { i.style.borderColor = '#e0574e'; }); msg.textContent = 'Add your name and a valid email so we can reply.'; msg.style.color = '#b3392f'; bad[0].focus(); return; }
    btn.disabled = true; btn.textContent = 'Sent';
    msg.textContent = 'Thanks. We reply within one business day.'; msg.style.color = '';
  };

  /* ---------- footer year ---------- */
  $$('.dl-yr').forEach(function (e) { e.textContent = new Date().getFullYear(); });
})();
