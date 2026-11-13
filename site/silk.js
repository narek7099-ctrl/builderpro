/* ===========================================================================
   SILK LIGHT (2026-11-13): the moving background, after the reference reel.
   One ribbon of fine threads that pinches to a bright waist on the left and
   fans out wide to the top-right and bottom-right, rolling slowly so the
   threads cross over each other like twisted silk, with a soft out-of-focus
   haze behind it. Blue and mint on white; on the dark theme the threads add
   up into light.

   It is drawn in a background thread (OffscreenCanvas in a Worker), so the
   page's own thread never draws a frame: the app and the site stay smooth
   while it moves. Browsers without that get one still frame, redrawn when
   the page is scrolled. Paused while the tab is hidden; one still frame for
   people who ask for less motion.

   bpSilk(host, { dark, waist }) puts a canvas at the back of host (waist: where
   across the screen the threads meet, 0 to 1) and returns
   { canvas, scroll(y), dark(on), active(on) }.
   ========================================================================= */
(function () {
  'use strict';

  /* the drawing, shared by the worker and the fallback: it only needs a 2D context */
  function SILK(ctx, small, wx0) {
    var W = 0, H = 0, D = 1, dark = false, scr = 0, WX = wx0 || 0.36;
    var N = small ? 70 : 160, S = small ? 50 : 70, CH = small ? 10 : 14;   /* threads, steps along each, depth chunks */
    var seed = []; for (var i = 0; i < N; i++) seed.push({ a: (i / N) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.35, r: 0.55 + 0.45 * Math.abs(Math.sin(i * 78.233)), w: 0.6 + Math.abs(Math.sin(i * 3.7)) * 0.7 });
    var dust = []; for (var d = 0; d < (small ? 22 : 46); d++) dust.push({ x: Math.abs(Math.sin(d * 91.7)), y: Math.abs(Math.sin(d * 47.3)), r: 0.6 + Math.abs(Math.sin(d * 13.1)) * 1.3, s: 0.3 + Math.abs(Math.sin(d * 5.3)) * 0.7 });
    var P = [0, 0], T = [0, 0];
    function bz(q, k, o) {
      var a = 1 - k, b0 = a * a * a, b1 = 3 * a * a * k, b2 = 3 * a * k * k, b3 = k * k * k;
      o[0] = b0 * q[0] + b1 * q[2] + b2 * q[4] + b3 * q[6]; o[1] = b0 * q[1] + b1 * q[3] + b2 * q[5] + b3 * q[7];
    }
    function size(w, h, dpr) { W = w; H = h; D = dpr; ctx.canvas.width = Math.round(w * dpr); ctx.canvas.height = Math.round(h * dpr); }
    /* the centre line: from off the top-right, in to the waist on the left, back out to the bottom-right */
    function spine(t) {
      var b = function (f, ph, amp) { return Math.sin(t * f + ph) * amp; };
      var sy = -Math.min(0.16, scr / Math.max(1, H) * 0.1);       /* scrolling lifts it a little */
      var c = (WX - 0.28) / 0.75;                                  /* puts the waist (the middle of the curve) at WX */
      return [
        (1.12 + b(0.00007, 0, 0.04)) * W, (-0.18 + sy + b(0.00006, 1, 0.05)) * H,
        (c + b(0.00009, 2, 0.04)) * W, (0.26 + sy + b(0.00008, 3, 0.05)) * H,
        (c + b(0.00008, 4, 0.04)) * W, (1.06 + sy + b(0.00007, 5, 0.04)) * H,
        (1.12 + b(0.00006, 6, 0.04)) * W, (1.18 + sy + b(0.00009, 7, 0.04)) * H];
    }
    function frame(t) {
      ctx.setTransform(D, 0, 0, D, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var q = spine(t), M = Math.min(W, H), roll = t * 0.00022 + scr * 0.0012;
      bz(q, 0.5, P);
      var wx = P[0], wy = P[1];
      /* colour runs from mint at the waist to blue out at the fans */
      var g = ctx.createRadialGradient(wx, wy, 0, wx, wy, Math.max(W, H) * 0.75);
      if (dark) { g.addColorStop(0, 'rgba(190,255,236,1)'); g.addColorStop(0.18, 'rgba(63,224,182,1)'); g.addColorStop(0.55, 'rgba(77,163,255,1)'); g.addColorStop(1, 'rgba(0,111,255,1)'); }
      else { g.addColorStop(0, 'rgba(22,199,154,1)'); g.addColorStop(0.2, 'rgba(18,180,150,1)'); g.addColorStop(0.55, 'rgba(0,111,255,1)'); g.addColorStop(1, 'rgba(0,90,220,1)'); }
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      /* 1. the haze: a few wide, faint strokes along the same path (the out-of-focus aurora) */
      ctx.strokeStyle = g;
      for (var hz = 0; hz < 7; hz++) {
        ctx.globalAlpha = (dark ? 0.016 : 0.013) * (hz < 2 ? 1.6 : 1);
        ctx.lineWidth = M * (0.05 + hz * 0.075);
        ctx.beginPath();
        for (var s0 = 0; s0 <= 40; s0++) { bz(q, s0 / 40, P); s0 ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
        ctx.stroke();
      }
      /* 2. the threads: each is an offset of the centre line by the band's width
         times the cosine of its angle; the angle turns along the ribbon and with
         time, so the band twists and the threads roll over each other. Threads
         in front (sine of the angle > 0) are brighter. */
      var wid = M * (small ? 0.42 : 0.36), pts = new Array((S + 1) * 3);
      for (var n = 0; n < N; n++) {
        var sd = seed[n];
        for (var s = 0; s <= S; s++) {
          var k = s / S; bz(q, k, P); bz(q, Math.min(1, k + 0.004), T);
          var dx = T[0] - P[0], dy = T[1] - P[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
          var u = Math.abs(k - 0.5) * 2, w = wid * (0.015 + 0.985 * Math.pow(u, 1.15)) * sd.r * (k < 0.5 ? 1.2 : 0.85);   /* pinched at the waist, the upper fan wider */
          var ang = sd.a + roll + k * 7.5 + Math.sin(k * 3 + t * 0.00015) * 0.7;
          var off = w * Math.cos(ang);
          pts[s * 3] = P[0] - dy / L * off; pts[s * 3 + 1] = P[1] + dx / L * off; pts[s * 3 + 2] = Math.sin(ang);
        }
        ctx.lineWidth = (small ? 0.75 : 0.85) * sd.w;
        var per = S / CH;
        var o = (n * 0.618 % 1) * per;   /* each thread changes shade at its own points, so no seam lines up across the ribbon */
        for (var c = -1; c < CH; c++) {
          var s1 = Math.max(0, Math.round(c * per + o)), s2 = Math.min(S, Math.round((c + 1) * per + o)), dep = 0;
          if (s2 <= s1) continue;
          for (var j = s1; j <= s2; j++) dep += pts[j * 3 + 2];
          dep /= (s2 - s1 + 1);
          var kk = (s1 + s2) / 2 / S, fade = Math.min(1, Math.min(kk, 1 - kk) * 7);   /* threads thin out off the ends */
          var lit = (dep + 1) / 2; lit = lit * lit;
          ctx.globalAlpha = (dark ? 0.07 + 0.5 * lit : 0.05 + 0.42 * lit) * fade;
          ctx.beginPath(); ctx.moveTo(pts[s1 * 3], pts[s1 * 3 + 1]);   /* chunks overlap by one step, so there is no seam */
          for (var j2 = s1 + 1; j2 <= s2; j2++) ctx.lineTo(pts[j2 * 3], pts[j2 * 3 + 1]);
          ctx.stroke();
        }
      }
      /* 3. the bright waist where the threads meet */
      var gl = ctx.createRadialGradient(wx, wy, 0, wx, wy, M * 0.22);
      if (dark) { gl.addColorStop(0, 'rgba(225,255,242,.7)'); gl.addColorStop(0.25, 'rgba(63,224,182,.26)'); gl.addColorStop(1, 'rgba(63,224,182,0)'); }
      else { gl.addColorStop(0, 'rgba(22,199,154,.32)'); gl.addColorStop(0.25, 'rgba(22,199,154,.13)'); gl.addColorStop(1, 'rgba(22,199,154,0)'); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      ctx.fillStyle = gl; ctx.fillRect(wx - M * 0.22, wy - M * 0.22, M * 0.44, M * 0.44);
      /* 4. a little floating dust */
      ctx.globalCompositeOperation = 'source-over';
      for (var e = 0; e < dust.length; e++) {
        var p = dust[e], y = ((p.y - t * 0.0000055 * p.s - scr * 0.00002) % 1 + 1) % 1;
        ctx.globalAlpha = dark ? 0.35 : 0.28; ctx.fillStyle = dark ? '#9fd8ff' : '#2f80ff';
        ctx.beginPath(); ctx.arc(p.x * W, y * H, p.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    return { size: size, frame: frame, set: function (o) { if ('dark' in o) dark = !!o.dark; if ('scroll' in o) scr = +o.scroll || 0; } };
  }

  /* the worker: owns the canvas, runs its own clock */
  var WORKER = 'var SILK=' + SILK.toString() + ';\n' + '(' + function () {
    var s = null, on = true, still = false, last = 0, fps = 30, need = true;
    var tick = function () {
      var now = performance.now();
      if (s && on && (need || (!still && now - last >= 1000 / fps - 2))) { last = now; need = false; s.frame(still ? 0 : now); }
      (self.requestAnimationFrame || function (f) { return setTimeout(function () { f(performance.now()); }, 16); })(tick);
    };
    self.onmessage = function (e) {
      var m = e.data;
      if (m.canvas) { s = SILK(m.canvas.getContext('2d'), m.small, m.waist); still = !!m.still; fps = m.small ? 24 : 30; tick(); }
      if (!s) return;
      if (m.w) s.size(m.w, m.h, m.dpr);
      if ('dark' in m || 'scroll' in m) s.set(m);
      if ('on' in m) on = !!m.on;
      need = true;
    };
  }.toString() + ')();';

  window.bpSilk = function (host, opt) {
    opt = opt || {};
    var mm = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
    var small = mm('(max-width: 767px)'), still = mm('(prefers-reduced-motion: reduce)');
    var cv = document.createElement('canvas'); cv.className = 'bp-silk'; cv.setAttribute('aria-hidden', 'true');
    host.insertBefore(cv, host.firstChild);
    var dpr = function () { return Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.25); };
    var state = { dark: !!opt.dark, scroll: 0, on: true }, worker = null, local = null, raf = 0;
    try {
      if (cv.transferControlToOffscreen && window.Worker && window.Blob && window.URL) {
        var off = cv.transferControlToOffscreen();
        worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));
        worker.postMessage({ canvas: off, small: small, still: still, waist: opt.waist }, [off]);
      }
    } catch (e) { worker = null; }
    if (!worker) {
      try { local = SILK(cv.getContext('2d'), small, opt.waist); } catch (e) { return null; }
    }
    var send = function (m) {
      if (worker) { worker.postMessage(m); return; }
      if (!local) return;
      if (m.w) local.size(m.w, m.h, m.dpr);
      local.set(m);
      /* no worker: one still frame, redrawn (at most once a frame) when something changes */
      if (!raf && state.on) raf = requestAnimationFrame(function () { raf = 0; local.frame(0); });
    };
    var sz = function () { send({ w: window.innerWidth, h: window.innerHeight, dpr: dpr() }); };
    sz(); send({ dark: state.dark, scroll: 0 });
    var rt = 0; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(sz, 120); }, { passive: true });
    document.addEventListener('visibilitychange', function () { send({ on: state.on && !document.hidden }); });
    var sp = 0, sv = 0;
    return {
      canvas: cv,
      scroll: function (y) { sv = y; if (!sp) sp = requestAnimationFrame(function () { sp = 0; send({ scroll: sv }); }); },
      dark: function (d) { if (state.dark !== !!d) { state.dark = !!d; send({ dark: state.dark }); } },
      active: function (a) { a = !!a; if (state.on !== a) { state.on = a; send({ on: a && !document.hidden }); } }
    };
  };
})();
