/* The website's blue and mint light ribbons, behind the app (2026-11-13).
   Same drawing as site/ribbons.js, so the app and the site look like one
   product. Drawn on a fixed canvas at the very back of the app (#bpxRib,
   z-index -1 inside #bpx); the app's white (or dark) wash moves onto #bpx
   behind it (portal/glass.css, .bp-rib). The cards keep their glass but drop
   the live blur, because re-blurring moving lines every frame is what made
   the website lag. 20 frames a second at most (15 on phones), paused while
   the tab is hidden, the app is closed or a popup is open, and one still
   frame for people who ask for less motion. */
(function () {
  'use strict';
  var host = document.getElementById('bpx');
  if (!host || document.getElementById('bpxRib')) return;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SMALL = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
  var cv = document.createElement('canvas'); cv.id = 'bpxRib'; cv.setAttribute('aria-hidden', 'true');
  host.insertBefore(cv, host.firstChild); host.classList.add('bp-rib');
  var ctx = cv.getContext('2d'); if (!ctx) return;
  var W = 0, H = 0, DPR = 1;
  function size() {
    /* the ribbons are soft light, so a low-resolution canvas stretched to the
       screen looks the same and costs a fraction to draw */
    DPR = SMALL ? 0.75 : 0.6;
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  /* each bundle: four control points (fractions of the screen), how far the
     strands fan out, how many strands, and its colours (start → end) */
  var B = [
    { p: [[-0.15, 1.05], [0.25, 0.55], [0.55, 0.95], [1.15, 0.1]], spread: 0.16, n: SMALL ? 14 : 34, c0: [0, 111, 255], c1: [22, 199, 154], sp: 0.00011, ph: 0 },
    { p: [[-0.1, 0.35], [0.35, 0.05], [0.7, 0.75], [1.12, 0.45]], spread: 0.1, n: SMALL ? 10 : 26, c0: [22, 199, 154], c1: [0, 111, 255], sp: 0.00008, ph: 2.1 },
    { p: [[0.15, 1.12], [0.55, 0.7], [0.8, 0.55], [1.1, 0.85]], spread: 0.08, n: SMALL ? 8 : 20, c0: [77, 163, 255], c1: [63, 224, 182], sp: 0.00013, ph: 4.2 }
  ];
  var dust = []; for (var d = 0; d < (SMALL ? 26 : 50); d++) dust.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.4, s: 0.2 + Math.random() * 0.8, a: 0.15 + Math.random() * 0.35 });
  function bez(p, k, o) {
    var a = 1 - k, b0 = a * a * a, b1 = 3 * a * a * k, b2 = 3 * a * k * k, b3 = k * k * k;
    o[0] = b0 * p[0][0] + b1 * p[1][0] + b2 * p[2][0] + b3 * p[3][0];
    o[1] = b0 * p[0][1] + b1 * p[1][1] + b2 * p[2][1] + b3 * p[3][1];
  }
  var pt = [0, 0], pn = [0, 0], S = SMALL ? 26 : 46;
  function bundle(b, t) {
    /* the control points breathe a little, so the sweep is never still */
    var q = b.p.map(function (c, i) { return [(c[0] + Math.sin(t * b.sp * 6 + b.ph + i * 1.7) * 0.04) * W, (c[1] + Math.cos(t * b.sp * 5 + b.ph + i * 1.3) * 0.05) * H]; });
    var g = ctx.createLinearGradient(q[0][0], q[0][1], q[3][0], q[3][1]);
    g.addColorStop(0, 'rgba(' + b.c0 + ',0)'); g.addColorStop(0.25, 'rgba(' + b.c0 + ',1)'); g.addColorStop(0.7, 'rgba(' + b.c1 + ',1)'); g.addColorStop(1, 'rgba(' + b.c1 + ',0)');
    var sp = b.spread * Math.min(W, H) * (SMALL ? 1.4 : 1), ts = t * b.sp;
    /* the glow under the strands */
    ctx.strokeStyle = g; ctx.lineCap = 'round';
    for (var gl = 0; gl < 2; gl++) {
      ctx.globalAlpha = gl ? 0.07 : 0.045; ctx.lineWidth = sp * (gl ? 0.35 : 0.9);
      ctx.beginPath();
      for (var s = 0; s <= S; s++) { bez(q, s / S, pt); s ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); }
      ctx.stroke();
    }
    ctx.lineWidth = SMALL ? 1 : 1.15;
    for (var i = 0; i < b.n; i++) {
      var u = i / (b.n - 1) - 0.5;
      ctx.globalAlpha = 0.16 + 0.42 * (1 - Math.abs(u) * 2);
      ctx.beginPath();
      for (var s2 = 0; s2 <= S; s2++) {
        var k = s2 / S;
        bez(q, k, pt); bez(q, Math.min(1, k + 0.01), pn);
        var dx = pn[0] - pt[0], dy = pn[1] - pt[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
        var w = sp * Math.pow(Math.sin(Math.PI * k), 0.8) * (1 + 0.35 * Math.sin(k * 6 + ts * 9 + i * 0.12));
        var off = u * w * Math.cos(k * 3.2 + ts * 7 + b.ph);
        var x = pt[0] - dy / L * off, y = pt[1] + dx / L * off;
        s2 ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    var m = host.querySelector('.bpx-main'), st = ((m && m.scrollTop) || 0) * 2.2;   /* scrolling the page turns the ribbons a little */
    for (var i = 0; i < B.length; i++) bundle(B[i], t + st);
    ctx.globalAlpha = 1;
    for (var d2 = 0; d2 < dust.length; d2++) {
      var p = dust[d2], y = ((p.y - t * 0.000006 * p.s - st * 0.00002) % 1 + 1) % 1;
      ctx.fillStyle = 'rgba(0,111,255,' + p.a + ')';
      ctx.beginPath(); ctx.arc(p.x * W, y * H, p.r, 0, 6.283); ctx.fill();
    }
  }
  var last = 0, raf = 0;
  function idle() {
    if (document.hidden || !host.classList.contains('open')) return true;
    var md = document.getElementById('bpx-modal');   /* a popup covers the page: no need to move what is under it */
    return !!(md && md.offsetParent !== null && getComputedStyle(md).display !== 'none');
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < (SMALL ? 66 : 50) || idle()) return;   /* 20 a second (15 on phones) is plenty for a slow drift */
    last = now; frame(now);
  }
  size(); frame(performance.now());
  window.addEventListener('resize', function () { size(); frame(performance.now()); }, { passive: true });
  if (!REDUCED) raf = requestAnimationFrame(loop);
  
})();
