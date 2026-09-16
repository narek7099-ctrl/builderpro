/* Marketing site behaviour: preloader, menu, pinned story, reveals,
   stat carousel, flow diagram, timeline. No scroll listeners; everything
   that tracks scroll runs in a requestAnimationFrame loop gated by an
   IntersectionObserver so it only ticks while its section is on screen. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- preloader ---------- */
  (function () {
    var pre = $('.dl-pre'); if (!pre) return;
    var seen = false; try { seen = sessionStorage.getItem('bpPre') === '1'; } catch (e) {}
    if (seen || reduce) { pre.classList.add('gone'); return; }
    document.documentElement.classList.add('dl-hold');
    requestAnimationFrame(function () { pre.classList.add('in'); });
    setTimeout(function () { pre.classList.add('out'); document.documentElement.classList.remove('dl-hold'); }, 1250);
    setTimeout(function () { pre.classList.add('gone'); try { sessionStorage.setItem('bpPre', '1'); } catch (e) {} }, 2300);
  })();

  /* ---------- menu ---------- */
  window.dlMenu = function (force) {
    var open = typeof force === 'boolean' ? force : !document.body.classList.contains('dl-menu-open');
    document.body.classList.toggle('dl-menu-open', open);
    var b = $('.dl-menu-btn'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  $$('.dl-menu a').forEach(function (a) { a.addEventListener('click', function () { dlMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') dlMenu(false); });

  /* ---------- reveal ---------- */
  var rio = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } });
  }, { threshold: 0.18 });
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
      import('./hero3d.js').then(function (m) { api = m.mount(canvas); if (!api) stage.classList.add('nogl'); })
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
        /* words light up as the panel's text card crosses the lower half of the viewport */
        var t = clamp((vh * 0.92 - pr.bottom + pr.height * 0.6) / (vh * 0.45), 0, 1);
        var ws = words[i], n = ws.length;
        for (var k = 0; k < n; k++) { var on = k / n < t; if (ws[k].classList.contains('on') !== on) ws[k].classList.toggle('on', on); }
        if (nums[i]) nums[i].style.setProperty('--ring', Math.round(t * 270) + 'deg');
      });
      requestAnimationFrame(tick);
    }
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { if (!running) { running = true; requestAnimationFrame(tick); } } else running = false;
    }, { rootMargin: '10% 0px 10% 0px' });
    io.observe(hero);
  })();

  /* ---------- stat carousel ---------- */
  (function () {
    var tile = $('.dl-stat'); if (!tile) return;
    var slides = $$('.s', tile), dots = $$('.dl-dots button', tile), i = 0, timer;
    function go(n) { i = (n + slides.length) % slides.length; slides.forEach(function (s, k) { s.classList.toggle('on', k === i); }); dots.forEach(function (d, k) { d.classList.toggle('on', k === i); }); }
    dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); restart(); }); });
    function restart() { clearInterval(timer); if (!reduce) timer = setInterval(function () { go(i + 1); }, 3600); }
    go(0); restart();
  })();

  /* ---------- flow diagram: nodes light up in order ---------- */
  (function () {
    var flow = $('.dl-flow'); if (!flow) return;
    var nodes = $$('.dl-node', flow);
    var io = new IntersectionObserver(function (es) {
      if (!es.some(function (e) { return e.isIntersecting; })) return; io.disconnect();
      nodes.forEach(function (n, k) { setTimeout(function () { n.classList.add('on'); }, reduce ? 0 : 120 + k * 110); });
    }, { threshold: 0.15 });
    io.observe(flow);
  })();

  /* ---------- timeline: the marker rides the rail as you scroll past ---------- */
  (function () {
    var tl = $('.dl-tl'); if (!tl) return;
    var fill = $('.fill', tl), bolt = $('.bolt', tl), pts = $$('.pt', tl), running = false;
    function tick() {
      if (!running) return;
      var r = tl.getBoundingClientRect(), vh = innerHeight;
      var p = clamp((vh * 0.85 - r.top) / (vh * 0.9), 0, 1);
      fill.style.width = (p * 100) + '%';
      bolt.style.left = (4 + p * 92) + '%';
      pts.forEach(function (pt, k) { pt.classList.toggle('on', k / (pts.length - 1) <= p + 0.001); });
      requestAnimationFrame(tick);
    }
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { if (!running) { running = true; requestAnimationFrame(tick); } } else running = false;
    }, { rootMargin: '20% 0px 20% 0px' });
    io.observe(tl);
    if (reduce) { fill.style.width = '100%'; bolt.style.left = '96%'; pts.forEach(function (pt) { pt.classList.add('on'); }); running = false; io.disconnect(); }
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
