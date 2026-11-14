/* The AI Team board, alive (2026-11-14). portal/aiteam.js lays out the AI CEO
   in the middle and its ten assistants around it; this file brings it to life
   on one canvas behind the cards:
     - each assistant hangs off the CEO on a soft curve that sways a little,
       glowing from blue at the CEO to mint at the assistant
     - light runs out along every curve, all the time
     - every second or two the CEO hands one assistant a task: a brighter pulse
       runs out, the assistant lights up when it lands, and a mint answer runs back
     - point at an assistant and its line brightens and speeds up while the
       others dim; the cards float gently and lean toward the mouse
   It replaces the old straight lines and dashed rings (hidden once this runs).
   Drawn only while the board is on screen; reduced motion gets a still board. */
(function () {
  'use strict';
  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function attach(inEl) {
    if (inEl._live || !inEl.isConnected) return;
    var ceo = inEl.querySelector('.aib-ceo');
    var nodes = [].slice.call(inEl.querySelectorAll('.aib-n:not(.aib-ceo)')).filter(function (n) { return n.style.left; });
    if (!ceo || !nodes.length) return;
    inEl._live = true;
    inEl.classList.add('aib-live');
    var cv = document.createElement('canvas'); cv.className = 'aib-cv'; cv.setAttribute('aria-hidden', 'true');
    inEl.insertBefore(cv, inEl.firstChild);
    var glow = document.createElement('i'); glow.className = 'aib-glow'; inEl.insertBefore(glow, inEl.firstChild);
    var ctx = cv.getContext('2d'), W = 0, H = 0, D = 1, grads = null, gDark = null;
    var size = function () {
      var r = inEl.getBoundingClientRect(); W = r.width; H = r.height; D = Math.min(window.devicePixelRatio || 1, 1.5); grads = null;
      cv.width = Math.round(W * D); cv.height = Math.round(H * D);
    };
    size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(inEl);

    var dark = function () { var b = document.getElementById('bpx'); return !!(b && b.classList.contains('bpx-dark')); };
    var L = nodes.map(function (n, i) {
      n.style.setProperty('--fd', (-i * 0.73).toFixed(2) + 's');
      return { el: n, x: parseFloat(n.style.left) / 100, y: parseFloat(n.style.top) / 100, bend: (i % 2 ? 1 : -1) * (0.13 + 0.07 * Math.abs(Math.sin(i * 2.3))), ph: i * 1.7,
        pulses: [{ s: Math.random(), v: 0.16 + Math.random() * 0.06, dir: 1 }, { s: Math.random() * 0.5, v: 0.13 + Math.random() * 0.05, dir: 1 }], heat: 0 };
    });
    var hover = -1, ceoHover = false;
    nodes.forEach(function (n, i) {
      n.addEventListener('pointerenter', function () { hover = i; });
      n.addEventListener('pointerleave', function () { if (hover === i) hover = -1; });
    });
    ceo.addEventListener('pointerenter', function () { ceoHover = true; });
    ceo.addEventListener('pointerleave', function () { ceoHover = false; });
    /* the cards lean a few pixels toward the mouse (CSS reads --lx/--ly) */
    inEl.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = inEl.getBoundingClientRect();
      inEl.style.setProperty('--lx', (((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(1) + 'px');
      inEl.style.setProperty('--ly', (((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(1) + 'px');
    }, { passive: true });
    inEl.addEventListener('pointerleave', function () { inEl.style.setProperty('--lx', '0px'); inEl.style.setProperty('--ly', '0px'); });

    /* drifting motes that circle the CEO slowly */
    var motes = []; for (var m = 0; m < 32; m++) motes.push({ a: Math.random() * 6.283, r: 0.12 + Math.random() * 0.4, s: (0.00004 + Math.random() * 0.00008) * (m % 2 ? 1 : -1), z: 0.6 + Math.random() * 1.4, o: 0.25 + Math.random() * 0.5 });

    var P = [0, 0];
    function ctl(l, t) {
      var x0 = W * 0.5, y0 = H * 0.5, x1 = l.x * W, y1 = l.y * H, dx = x1 - x0, dy = y1 - y0;
      var b = l.bend + Math.sin(t * 0.0005 + l.ph) * 0.045;            /* the curve sways */
      return [x0, y0, (x0 + x1) / 2 - dy * b, (y0 + y1) / 2 + dx * b, x1, y1];
    }
    function at(c, s, o) { var a = 1 - s; o[0] = a * a * c[0] + 2 * a * s * c[2] + s * s * c[4]; o[1] = a * a * c[1] + 2 * a * s * c[3] + s * s * c[5]; }
    function ping(l) {
      l.el.classList.remove('aib-ping'); void l.el.offsetWidth; l.el.classList.add('aib-ping');
      setTimeout(function () { l.el.classList.remove('aib-ping'); }, 1100);
    }
    var nextTask = 900, lastT = 0, lastDraw = 0, onScreen = true, raf = 0;
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; }).observe(inEl);

    function frame(t) {
      var dt = lastT ? Math.min(60, t - lastT) : 16; lastT = t;
      var dk = dark();
      ctx.setTransform(D, 0, 0, D, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = dk ? 'lighter' : 'source-over';
      var M = Math.min(W, H), cx = W / 2, cy = H / 2;
      /* motes */
      for (var i = 0; i < motes.length; i++) {
        var mo = motes[i]; mo.a += mo.s * dt;
        var rr = mo.r * M * (1 + Math.sin(t * 0.0004 + i) * 0.04);
        ctx.globalAlpha = mo.o * (dk ? 0.7 : 0.45); ctx.fillStyle = i % 3 ? (dk ? '#7fb6ff' : '#4d97ff') : (dk ? '#3fe0b6' : '#16C79A');
        ctx.fillRect(cx + Math.cos(mo.a) * rr * 1.15 - mo.z / 2, cy + Math.sin(mo.a) * rr * 0.95 - mo.z / 2, mo.z * 1.4, mo.z * 1.4);
      }
      /* the links */
      nextTask -= dt;
      if (nextTask <= 0) { var pick = L[Math.floor(Math.random() * L.length)]; pick.pulses.push({ s: 0, v: 0.55, dir: 1, task: true }); nextTask = 1300 + Math.random() * 1400; }
      for (var k = 0; k < L.length; k++) {
        var l = L[k], hot = hover === k || ceoHover, dim = hover >= 0 && hover !== k;
        l.heat += ((hot ? 1 : 0) - l.heat) * Math.min(1, dt / 160);
        var c = ctl(l, t);
        if (!grads || gDark !== dk) {   /* a link's ends never move, so its colour ramp is made once */
          gDark = dk; grads = L.map(function (ll) { var cc = ctl(ll, 0), g = ctx.createLinearGradient(cc[0], cc[1], cc[4], cc[5]);
            g.addColorStop(0, dk ? '#4d97ff' : '#006fff'); g.addColorStop(1, dk ? '#3fe0b6' : '#16C79A'); return g; });
        }
        ctx.strokeStyle = grads[k]; ctx.lineCap = 'round';
        /* soft glow under the line, then the line */
        ctx.globalAlpha = (0.06 + 0.16 * l.heat) * (dim ? 0.5 : 1); ctx.lineWidth = 7 + 5 * l.heat;
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.quadraticCurveTo(c[2], c[3], c[4], c[5]); ctx.stroke();
        ctx.globalAlpha = (0.32 + 0.6 * l.heat) * (dim ? 0.45 : 1); ctx.lineWidth = 1.3 + 1.2 * l.heat;
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.quadraticCurveTo(c[2], c[3], c[4], c[5]); ctx.stroke();
        /* pulses, each a bright head with a fading tail */
        for (var q = l.pulses.length - 1; q >= 0; q--) {
          var p = l.pulses[q];
          p.s += p.v * (1 + 1.4 * l.heat) * dt / 1000;
          if (p.s >= 1) {
            if (p.task) { ping(l); l.pulses.splice(q, 1); l.pulses.push({ s: 0, v: 0.5, dir: -1, task: true, back: true }); continue; }
            if (p.back) { ceo.classList.remove('aib-ping'); void ceo.offsetWidth; ceo.classList.add('aib-ping'); setTimeout(function () { ceo.classList.remove('aib-ping'); }, 900); l.pulses.splice(q, 1); continue; }
            p.s = -Math.random() * 0.6; continue;    /* the steady pulses loop, after a short rest */
          }
          if (p.s < 0) continue;
          var big = p.task ? 1 : 0, col = p.back ? (dk ? '63,224,182' : '22,199,154') : (dk ? '120,180,255' : '0,111,255');
          for (var tl = 5; tl >= 0; tl--) {
            var ss = p.s - tl * (0.024 + 0.012 * big); if (ss < 0) continue;
            at(c, p.dir > 0 ? ss : 1 - ss, P);
            ctx.globalAlpha = (1 - tl / 6) * (dim ? 0.35 : 1) * (0.55 + 0.45 * big);
            ctx.fillStyle = 'rgb(' + col + ')';
            ctx.beginPath(); ctx.arc(P[0], P[1], (tl ? 1.6 : 2.6 + 1.6 * big) * (1 - tl / 10), 0, 6.283); ctx.fill();
          }
          if (big) {   /* a halo on the task pulse */
            at(c, p.dir > 0 ? p.s : 1 - p.s, P);
            var hg = ctx.createRadialGradient(P[0], P[1], 0, P[0], P[1], 14);
            hg.addColorStop(0, 'rgba(' + col + ',.35)'); hg.addColorStop(1, 'rgba(' + col + ',0)');
            ctx.globalAlpha = 1; ctx.fillStyle = hg; ctx.fillRect(P[0] - 14, P[1] - 14, 28, 28);
          }
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    function loop(t) {
      if (!inEl.isConnected) { cancelAnimationFrame(raf); return; }   /* the board was replaced: stop */
      raf = requestAnimationFrame(loop);
      if (!onScreen || document.hidden || t - lastDraw < 25) return;   /* about 40 frames a second is plenty */
      lastDraw = t; frame(t);
    }
    if (RM) frame(0); else raf = requestAnimationFrame(loop);
  }

  function scan(root) { [].forEach.call((root || document).querySelectorAll('.aib-in'), attach); }
  function watch() {
    var area = document.getElementById('bpxViewArea') || document.body;
    var q = 0; new MutationObserver(function () { if (!q) q = requestAnimationFrame(function () { q = 0; scan(area); }); }).observe(area, { childList: true, subtree: true });
    scan(area);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
