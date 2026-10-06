/* ==================================================================
   Blueprint editor: mark up a plan sheet over the drawing itself.

   Opened from a project's Blueprints tab (bpBpEdit(i)). The sheet is the
   background (an image, or page 1 of a PDF rendered with pdf.js loaded on
   demand from cdnjs); markups sit on top as vector objects in the sheet's
   own pixel space, so they stay re-editable and zoom without blurring:

     job.blueprintMarks[blueprint.id] = { v:1, w, h, objs:[...], at }

   saved with the job (bpJobsSet -> cloud). Objects:
     pen      {t,pts:[x,y,...],c,w}
     line / arrow / rect / ellipse / measure   {t,x1,y1,x2,y2,c,w[,label]}
     text     {t,x,y,text,c,fs}
     note     {t,x,y,w,h,text,c}

   Measuring (v2): a sheet carries a scale, set by tracing a known
   dimension or (PDF sheets) by picking the drawing scale, 1/4" = 1'-0".
   With it, measure lines label themselves, and three takeoff tools work:
     area    {t,pts,c,w,pitch?}   polygon; sq ft, and roof squares with pitch
     run     {t,pts,c,w}          polyline; total linear feet
     count   {t,x,y,c,r}          numbered markers, counted per colour
   Points snap to existing corners and ends. The Takeoff panel totals it
   all, exports CSV, and the PDF export adds a takeoff page.
     blueprintMarks[id] = { v:2, w, h, objs, scale:{ppf,label}, units:'ft'|'m', at }

   Tools: select/move (drag empty space to pan), pen, line, arrow,
   rectangle, circle, text, sticky note, measurement, eraser; colour, width,
   undo/redo, zoom (wheel, pinch, buttons), clear. Export flattens to PNG,
   to PDF (jsPDF from cdnjs; the button disables itself if that cannot
   load), or saves the flattened PNG back as a new blueprint through the
   project-files helper. Pointer events throughout, so a finger, a pencil
   and a mouse all work.
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var COLORS = [['#e5484d', 'Red'], ['#f08c00', 'Orange'], ['#1f9e5a', 'Green'], ['#4e6ef2', 'Blue'], ['#8b5cf6', 'Violet'], ['#111827', 'Black']];
  var NOTE_BG = { '#e5484d': '#ffe1e1', '#f08c00': '#fff1c2', '#1f9e5a': '#d9f5e4', '#4e6ef2': '#e1e7fe', '#8b5cf6': '#ece3ff', '#111827': '#eef0f3' };
  var WIDTHS = [['S', 1], ['M', 2.2], ['L', 4.5]];
  var TOOLS = [
    ['select', 'arrow_selector_tool', 'Select & move', 'V'], ['pen', 'draw', 'Pen', 'P'], ['line', 'horizontal_rule', 'Line', 'L'],
    ['arrow', 'north_east', 'Arrow', 'A'], ['rect', 'crop_square', 'Rectangle', 'R'], ['ellipse', 'circle', 'Circle', 'O'],
    ['text', 'title', 'Text', 'T'], ['note', 'sticky_note_2', 'Sticky note', 'N'],
    ['measure', 'straighten', 'Measure', 'M'], ['run', 'polyline', 'Length run', 'U'], ['area', 'pentagon', 'Area', 'G'], ['count', 'pin_drop', 'Count', 'C'],
    ['scale', 'square_foot', 'Scale', 'K'], ['eraser', 'ink_eraser', 'Eraser', 'E']
  ];
  var MEASURE_TOOLS = { measure: 1, run: 1, area: 1, count: 1, scale: 1 };
  /* drawing scales: inches on paper per foot; metric ones as 1:N */
  var PRESETS = [['1/16" = 1\'-0"', 1 / 16], ['3/32" = 1\'-0"', 3 / 32], ['1/8" = 1\'-0"', 1 / 8], ['3/16" = 1\'-0"', 3 / 16], ['1/4" = 1\'-0"', 1 / 4], ['3/8" = 1\'-0"', 3 / 8],
    ['1/2" = 1\'-0"', 1 / 2], ['3/4" = 1\'-0"', 3 / 4], ['1" = 1\'-0"', 1], ['1-1/2" = 1\'-0"', 1.5], ['1" = 10\'', 1 / 10], ['1" = 20\'', 1 / 20], ['1" = 30\'', 1 / 30], ['1" = 40\'', 1 / 40], ['1" = 50\'', 1 / 50],
    ['1:20', -20], ['1:50', -50], ['1:100', -100], ['1:200', -200]];
  var PITCHES = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18];
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_W = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  var S = null;   /* the open editor */

  /* ------------------------------------------------------------ loaders --- */
  var loading = {};
  function loadScript(src, ok, ms) {
    if (ok()) return Promise.resolve();
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'), t = setTimeout(function () { rej(new Error('timeout')); }, ms || 10000);
      s.src = src; s.async = true;
      s.onload = function () { clearTimeout(t); ok() ? res() : rej(new Error('missing')); };
      s.onerror = function () { clearTimeout(t); rej(new Error('load')); };
      document.head.appendChild(s);
    }).catch(function (e) { delete loading[src]; throw e; });
    return loading[src];
  }
  var hasJsPDF = function () { return !!(window.jspdf && window.jspdf.jsPDF); };
  var hasPdfJs = function () { return !!window.pdfjsLib; };

  /* ------------------------------------------------------------- helpers --- */
  function job() { return (window.bpJobsGet ? bpJobsGet() : []).filter(function (x) { return x.id === window._bpProjId; })[0]; }
  function rid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
    t = Math.max(0, Math.min(1, t)); return dist(px, py, ax + t * dx, ay + t * dy);
  }
  function unit() { return Math.max(1, Math.max(S.W, S.H) / 1000); }
  function strokeW() { return WIDTHS[S.wi][1] * unit(); }
  function fontPx() { return [16, 22, 34][S.wi] * unit(); }
  function noteText(c) { return '#1f2937'; }

  /* ---------------------------------------------------------- measuring --- */
  function ppf() { return S && S.scale && S.scale.ppf > 0 ? S.scale.ppf : 0; }
  function polyLen(p, closed) {
    var L = 0; for (var i = 0; i < p.length - 2; i += 2) L += dist(p[i], p[i + 1], p[i + 2], p[i + 3]);
    if (closed && p.length >= 6) L += dist(p[p.length - 2], p[p.length - 1], p[0], p[1]); return L;
  }
  function polyArea(p) { var a = 0, n = p.length; for (var i = 0; i < n; i += 2) { var j = (i + 2) % n; a += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(a) / 2; }
  function pitchK(pitch) { return pitch ? Math.sqrt(1 + pitch * pitch / 144) : 1; }
  function feet(px) { return ppf() ? px / ppf() : 0; }
  function fmtFt(f) {
    if (S && S.units === 'm') return (f * 0.3048).toFixed(2) + ' m';
    var inch = Math.round(f * 12 * 2) / 2, ft = Math.floor(inch / 12), i = inch - ft * 12;
    return ft + "' " + (i % 1 ? i.toFixed(1) : i) + '"';
  }
  function fmtLen(px) { return ppf() ? fmtFt(feet(px)) : ''; }
  function sqft(o) { var f = ppf(); return f ? polyArea(o.pts) / (f * f) * pitchK(o.pitch) : 0; }
  function fmtArea(sf) { return S && S.units === 'm' ? (sf * 0.09290304).toFixed(1) + ' m²' : Math.round(sf).toLocaleString() + ' sq ft'; }
  function lenOf(o) { return o.t === 'run' ? polyLen(o.pts) : dist(o.x1, o.y1, o.x2, o.y2); }
  function measureLabel(o) { return o.label || fmtLen(lenOf(o)); }
  function pill(ctx, text, x, y, c, fs, rot) {
    ctx.save(); ctx.font = '600 ' + fs + 'px system-ui, -apple-system, Segoe UI, sans-serif';
    var tw = ctx.measureText(text).width, ph = fs * 0.45, bh = fs + ph;
    ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, fs / 12);
    rr(ctx, -tw / 2 - ph, -bh / 2, tw + ph * 2, bh, bh / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, fs * 0.05);
    ctx.restore();
  }
  function centroid(p) {
    var a = 0, cx = 0, cy = 0, n = p.length;
    for (var i = 0; i < n; i += 2) { var j = (i + 2) % n, f = p[i] * p[j + 1] - p[j] * p[i + 1]; a += f; cx += (p[i] + p[j]) * f; cy += (p[i + 1] + p[j + 1]) * f; }
    if (Math.abs(a) < 1e-6) { var sx = 0, sy = 0; for (var k = 0; k < n; k += 2) { sx += p[k]; sy += p[k + 1]; } return { x: sx / (n / 2), y: sy / (n / 2) }; }
    return { x: cx / (3 * a), y: cy / (3 * a) };
  }
  /* corners and ends of what is already drawn: new points snap to them */
  function snapPts() {
    var out = [];
    S.objs.forEach(function (o) {
      if (o.t === 'line' || o.t === 'arrow' || o.t === 'measure') out.push(o.x1, o.y1, o.x2, o.y2);
      else if (o.t === 'rect') out.push(o.x1, o.y1, o.x2, o.y2, o.x1, o.y2, o.x2, o.y1);
      else if (o.t === 'area' || o.t === 'run') out.push.apply(out, o.pts);
    });
    if (S.poly) out.push.apply(out, S.poly.pts.slice(0, -2));
    if (S.poly && S.poly.pts.length >= 2 && S.poly.t === 'area') out.push(S.poly.pts[0], S.poly.pts[1]);
    return out;
  }
  function snapPt(p, e) {
    S.snapHit = null;
    if (e && e.altKey) return p;
    var a = snapPts(), best = 12 / S.view.s, hit = null;
    for (var i = 0; i < a.length; i += 2) { var d = dist(p.x, p.y, a[i], a[i + 1]); if (d < best) { best = d; hit = { x: a[i], y: a[i + 1] }; } }
    if (hit) { S.snapHit = hit; return { x: hit.x, y: hit.y }; }
    return p;
  }

  /* ------------------------------------------------------------ drawing --- */
  function wrap(ctx, text, maxW) {
    var out = [];
    String(text || '').split('\n').forEach(function (para) {
      var words = para.split(/\s+/), line = '';
      if (!para) { out.push(''); return; }
      words.forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
      });
      out.push(line);
    });
    return out;
  }
  function arrowHead(ctx, x1, y1, x2, y2, w) {
    var a = Math.atan2(y2 - y1, x2 - x1), L = Math.max(10, w * 4.5);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45));
    ctx.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill();
  }
  function drawObj(ctx, o, u) {
    ctx.save();
    ctx.strokeStyle = o.c; ctx.fillStyle = o.c; ctx.lineWidth = o.w || 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var t = o.t;
    if (t === 'pen') {
      var p = o.pts; if (p.length < 2) { ctx.restore(); return; }
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      if (p.length === 2) ctx.lineTo(p[0] + 0.01, p[1]);
      for (var i = 2; i < p.length - 2; i += 2) { var mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2; ctx.quadraticCurveTo(p[i], p[i + 1], mx, my); }
      if (p.length > 2) ctx.lineTo(p[p.length - 2], p[p.length - 1]);
      ctx.stroke();
    } else if (t === 'line' || t === 'arrow') {
      ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
      if (t === 'arrow') arrowHead(ctx, o.x1, o.y1, o.x2, o.y2, o.w);
    } else if (t === 'measure') {
      var a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), tk = Math.max(8, o.w * 4), nx = -Math.sin(a) * tk, ny = Math.cos(a) * tk;
      ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2);
      ctx.moveTo(o.x1 + nx, o.y1 + ny); ctx.lineTo(o.x1 - nx, o.y1 - ny);
      ctx.moveTo(o.x2 + nx, o.y2 + ny); ctx.lineTo(o.x2 - nx, o.y2 - ny); ctx.stroke();
      arrowHead(ctx, o.x2 - Math.cos(a), o.y2 - Math.sin(a), o.x2, o.y2, o.w * 0.8);
      arrowHead(ctx, o.x1 + Math.cos(a), o.y1 + Math.sin(a), o.x1, o.y1, o.w * 0.8);
      var lbl = measureLabel(o);
      if (lbl) {
        var fs = Math.max(12, o.w * 6, (u || 1) * 15);
        ctx.font = '600 ' + fs + 'px system-ui, -apple-system, Segoe UI, sans-serif';
        var tw = ctx.measureText(lbl).width, mx2 = (o.x1 + o.x2) / 2, my2 = (o.y1 + o.y2) / 2, ra = a;
        if (ra > Math.PI / 2 || ra < -Math.PI / 2) ra += Math.PI;
        ctx.translate(mx2, my2); ctx.rotate(ra);
        var ph = fs * 0.4, bh = fs + ph, cy = -(fs * 0.55 + o.w + bh / 2);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = o.c; ctx.lineWidth = Math.max(1, o.w * 0.5);
        rr(ctx, -tw / 2 - ph, cy - bh / 2, tw + ph * 2, bh, bh / 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = o.c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, 0, cy + fs * 0.05);
      }
    } else if (t === 'area' || t === 'run' || t === 'scale') {
      var q = o.pts || [o.x1, o.y1, o.x2, o.y2], uu = u || 1, closed = t === 'area' && !o.open;
      if (q.length < 2) { ctx.restore(); return; }
      ctx.beginPath(); ctx.moveTo(q[0], q[1]);
      for (var k = 2; k < q.length; k += 2) ctx.lineTo(q[k], q[k + 1]);
      if (closed) { ctx.closePath(); ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1; }
      if (t === 'scale') ctx.setLineDash([o.w * 3, o.w * 2]);
      ctx.stroke(); ctx.setLineDash([]);
      for (var v = 0; v < q.length; v += 2) { ctx.beginPath(); ctx.arc(q[v], q[v + 1], Math.max(2.5, o.w * 1.1), 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = Math.max(1, o.w * 0.6); ctx.stroke(); }
      var fs2 = Math.max(12, o.w * 6, uu * 15);
      if (t === 'area' && q.length >= 6 && !o.open) {
        var cc = centroid(q), sf = sqft(o);
        pill(ctx, sf ? fmtArea(sf) + (o.pitch ? ' · ' + o.pitch + '/12' : '') : 'Set the scale to measure', cc.x, cc.y, o.c, fs2);
        if (sf && o.pitch && (!S || S.units !== 'm')) pill(ctx, (sf / 100).toFixed(1) + ' squares', cc.x, cc.y + fs2 * 1.7, o.c, fs2 * 0.8);
      } else if (t === 'run' && q.length >= 4) {
        var L = polyLen(q), half = L / 2, acc = 0;
        for (var g = 0; g < q.length - 2; g += 2) {
          var sl = dist(q[g], q[g + 1], q[g + 2], q[g + 3]);
          if (acc + sl >= half) { var f2 = sl ? (half - acc) / sl : 0, mx3 = q[g] + (q[g + 2] - q[g]) * f2, my3 = q[g + 1] + (q[g + 3] - q[g + 1]) * f2;
            var lab = fmtLen(L); if (lab) pill(ctx, lab, mx3, my3 - fs2 * 1.1, o.c, fs2); break; }
          acc += sl;
        }
      }
    } else if (t === 'count') {
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1.5, o.r * 0.18); ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 ' + (o.r * 1.05) + 'px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(o._n || ''), o.x, o.y + o.r * 0.05);
    } else if (t === 'rect') {
      ctx.strokeRect(Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1));
    } else if (t === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, Math.abs(o.x2 - o.x1) / 2 || 0.5, Math.abs(o.y2 - o.y1) / 2 || 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (t === 'text') {
      ctx.font = '600 ' + o.fs + 'px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.textBaseline = 'top';
      String(o.text || '').split('\n').forEach(function (ln, k) {
        ctx.lineWidth = Math.max(2, o.fs / 6); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(ln, o.x, o.y + k * o.fs * 1.25);
        ctx.fillText(ln, o.x, o.y + k * o.fs * 1.25);
      });
    } else if (t === 'note') {
      var r = Math.min(o.w, o.h) * 0.06;
      ctx.shadowColor = 'rgba(15,23,42,.18)'; ctx.shadowBlur = o.w * 0.05; ctx.shadowOffsetY = o.w * 0.015;
      ctx.fillStyle = NOTE_BG[o.c] || '#fff1c2'; rr(ctx, o.x, o.y, o.w, o.h, r); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = o.c; rr(ctx, o.x, o.y, o.w, Math.max(4, o.h * 0.06), r); ctx.fill();
      ctx.fillRect(o.x, o.y + Math.max(4, o.h * 0.06) - r, o.w, r);
      var nfs = Math.max(10, o.w * 0.085), pad = o.w * 0.07;
      ctx.fillStyle = noteText(o.c); ctx.font = '500 ' + nfs + 'px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.textBaseline = 'top';
      ctx.save(); ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
      wrap(ctx, o.text || '', o.w - pad * 2).forEach(function (ln, k) { ctx.fillText(ln, o.x + pad, o.y + pad + o.h * 0.06 + k * nfs * 1.3); });
      ctx.restore();
    }
    ctx.restore();
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function bbox(o) {
    if (o.t === 'count') return { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 };
    if (o.t === 'pen' || o.t === 'area' || o.t === 'run') { var xs = [], ys = []; for (var i = 0; i < o.pts.length; i += 2) { xs.push(o.pts[i]); ys.push(o.pts[i + 1]); } return { x: Math.min.apply(0, xs), y: Math.min.apply(0, ys), w: Math.max.apply(0, xs) - Math.min.apply(0, xs), h: Math.max.apply(0, ys) - Math.min.apply(0, ys) }; }
    if (o.t === 'note') return { x: o.x, y: o.y, w: o.w, h: o.h };
    if (o.t === 'text') {
      var c = S.ctx; c.save(); c.font = '600 ' + o.fs + 'px system-ui, -apple-system, Segoe UI, sans-serif';
      var ls = String(o.text || ' ').split('\n'), w = Math.max.apply(0, ls.map(function (l) { return c.measureText(l).width; })); c.restore();
      return { x: o.x, y: o.y, w: Math.max(w, o.fs), h: ls.length * o.fs * 1.25 };
    }
    return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
  }
  function hit(o, x, y, tol) {
    var t = o.t;
    if (t === 'pen') { var p = o.pts; if (p.length === 2) return dist(x, y, p[0], p[1]) < tol + o.w; for (var i = 0; i < p.length - 2; i += 2) if (segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) < tol + o.w / 2) return true; return false; }
    if (t === 'count') return dist(x, y, o.x, o.y) < o.r + tol;
    if (t === 'run' || t === 'area') {
      var q = o.pts; for (var k = 0; k < q.length - 2; k += 2) if (segDist(x, y, q[k], q[k + 1], q[k + 2], q[k + 3]) < tol + o.w / 2) return true;
      if (t === 'run') return false;
      if (segDist(x, y, q[q.length - 2], q[q.length - 1], q[0], q[1]) < tol + o.w / 2) return true;
      var ins = false; for (var a2 = 0, b2 = q.length - 2; a2 < q.length; b2 = a2, a2 += 2) { if ((q[a2 + 1] > y) !== (q[b2 + 1] > y) && x < (q[b2] - q[a2]) * (y - q[a2 + 1]) / (q[b2 + 1] - q[a2 + 1]) + q[a2]) ins = !ins; }
      return ins;
    }
    if (t === 'line' || t === 'arrow' || t === 'measure') return segDist(x, y, o.x1, o.y1, o.x2, o.y2) < tol + o.w / 2;
    if (t === 'ellipse') {
      var cx = (o.x1 + o.x2) / 2, cy = (o.y1 + o.y2) / 2, rx = Math.abs(o.x2 - o.x1) / 2 + tol, ry = Math.abs(o.y2 - o.y1) / 2 + tol;
      return ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) <= 1;
    }
    var b = bbox(o); return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
  }
  function handles(o) {
    if (!o) return [];
    if (o.t === 'line' || o.t === 'arrow' || o.t === 'measure' || o.t === 'rect' || o.t === 'ellipse') return [{ k: 1, x: o.x1, y: o.y1 }, { k: 2, x: o.x2, y: o.y2 }];
    if (o.t === 'note') return [{ k: 'se', x: o.x + o.w, y: o.y + o.h }];
    if (o.t === 'area' || o.t === 'run') { var hs = []; for (var i = 0; i < o.pts.length; i += 2) hs.push({ k: 'v' + (i / 2), x: o.pts[i], y: o.pts[i + 1] }); return hs; }
    return [];
  }

  function render() {
    if (!S) return;
    var c = S.cv, ctx = S.ctx, d = S.dpr, v = S.view;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, c.width / d, c.height / d);
    if (!S.bg) return;
    ctx.save(); ctx.translate(v.tx, v.ty); ctx.scale(v.s, v.s);
    ctx.shadowColor = 'rgba(15,23,42,.25)'; ctx.shadowBlur = 24 / v.s * 0 + 18; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S.W, S.H); ctx.shadowColor = 'transparent';
    ctx.drawImage(S.bg, 0, 0, S.W, S.H);
    number();
    S.objs.forEach(function (o, i) { if (S.editing && S.editing.o === o && o.t !== 'measure') return; drawObj(ctx, o, unit()); });
    if (S.temp) drawObj(ctx, S.temp, unit());
    if (S.poly) { var tp = clone(S.poly); if (S.cursor) tp.pts.push(S.cursor.x, S.cursor.y); tp.open = true; drawObj(ctx, tp, unit());
      if (tp.pts.length >= 4) { var lp = tp.pts.length, sl = dist(tp.pts[lp - 4], tp.pts[lp - 3], tp.pts[lp - 2], tp.pts[lp - 1]), lab = fmtLen(sl);
        if (lab && S.cursor) pill(ctx, lab + (S.poly.t === 'run' && tp.pts.length > 4 ? '  ·  ' + fmtLen(polyLen(tp.pts)) + ' total' : ''), S.cursor.x, S.cursor.y - 26 / v.s, S.poly.c, 13 / v.s); } }
    if (S.snapHit && S.tool !== 'select') { var sh = 7 / v.s; ctx.lineWidth = 2 / v.s; ctx.strokeStyle = '#4e6ef2'; ctx.strokeRect(S.snapHit.x - sh, S.snapHit.y - sh, sh * 2, sh * 2); }
    var sel = S.objs[S.sel];
    if (sel && S.tool === 'select') {
      var b = bbox(sel), p = 6 / v.s + (sel.t === 'note' || sel.t === 'text' ? 0 : sel.w / 2);
      ctx.setLineDash([6 / v.s, 4 / v.s]); ctx.strokeStyle = '#4e6ef2'; ctx.lineWidth = 1.5 / v.s;
      ctx.strokeRect(b.x - p, b.y - p, b.w + 2 * p, b.h + 2 * p);
      ctx.setLineDash([]);
      handles(sel).forEach(function (h) {
        ctx.beginPath(); ctx.arc(h.x, h.y, 7 / v.s, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2 / v.s; ctx.strokeStyle = '#4e6ef2'; ctx.stroke();
      });
    }
    ctx.restore();
    var z = S.root.querySelector('.bpe-zoomv'); if (z) z.textContent = Math.round(v.s / S.fitS * 100) + '%';
  }

  function number() { var n = {}; S.objs.forEach(function (o) { if (o.t === 'count') { n[o.c] = (n[o.c] || 0) + 1; o._n = n[o.c]; } }); }

  /* ---------------------------------------------------------- view math --- */
  function toImg(e) { var r = S.cv.getBoundingClientRect(), v = S.view; return { x: (e.clientX - r.left - v.tx) / v.s, y: (e.clientY - r.top - v.ty) / v.s }; }
  function size() {
    var st = S.stage, w = st.clientWidth, h = st.clientHeight, d = window.devicePixelRatio || 1;
    S.dpr = d; S.cv.width = Math.max(1, Math.round(w * d)); S.cv.height = Math.max(1, Math.round(h * d));
    S.cv.style.width = w + 'px'; S.cv.style.height = h + 'px';
    S.vw = w; S.vh = h;
  }
  function fit() {
    if (!S.bg) return;
    var pad = S.vw < 600 ? 12 : 32, s = Math.min((S.vw - pad * 2) / S.W, (S.vh - pad * 2) / S.H);
    S.fitS = s; S.view = { s: s, tx: (S.vw - S.W * s) / 2, ty: (S.vh - S.H * s) / 2 }; render();
  }
  function zoomAt(f, cx, cy) {
    var v = S.view, ns = Math.max(S.fitS * 0.25, Math.min(S.fitS * 12, v.s * f));
    f = ns / v.s; v.tx = cx - (cx - v.tx) * f; v.ty = cy - (cy - v.ty) * f; v.s = ns; render(); placeEditor();
  }

  /* ------------------------------------------------------------- history --- */
  function snap() { S.hist.push(JSON.stringify(S.objs)); if (S.hist.length > 100) S.hist.shift(); S.fut = []; setDirty(); }
  function setDirty() { S.dirty = true; ui(); setTimeout(function () { if (S) takeoff(); }, 0); }
  function undo() { if (!S.hist.length) return; commitEdit(); S.fut.push(JSON.stringify(S.objs)); S.objs = JSON.parse(S.hist.pop()); S.sel = -1; S.dirty = true; ui(); render(); takeoff(); }
  function redo() { if (!S.fut.length) return; commitEdit(); S.hist.push(JSON.stringify(S.objs)); S.objs = JSON.parse(S.fut.pop()); S.sel = -1; S.dirty = true; ui(); render(); takeoff(); }

  /* ------------------------------------------------------- inline editor --- */
  function editText(o, isNew) {
    commitEdit();
    var ta = S.ta; S.editing = { o: o, isNew: isNew, before: isNew ? null : JSON.stringify(S.objs) };
    ta.value = o.t === 'measure' ? (o.label || '') : (o.text || '');
    ta.className = 'bpe-ta ' + o.t;
    ta.placeholder = o.t === 'measure' ? 'Length, e.g. 12\' 6"' : o.t === 'note' ? 'Note…' : 'Text';
    ta.hidden = false; placeEditor(); render();
    setTimeout(function () { ta.focus(); ta.select(); }, 0);
  }
  function placeEditor() {
    if (!S || !S.editing) return;
    var o = S.editing.o, v = S.view, ta = S.ta, st = ta.style;
    if (o.t === 'note') {
      var nfs = Math.max(10, o.w * 0.085) * v.s, pad = o.w * 0.07 * v.s;
      st.left = (v.tx + o.x * v.s) + 'px'; st.top = (v.ty + o.y * v.s) + 'px'; st.width = o.w * v.s + 'px'; st.height = o.h * v.s + 'px';
      st.fontSize = nfs + 'px'; st.padding = (pad + o.h * 0.06 * v.s) + 'px ' + pad + 'px ' + pad + 'px'; st.background = NOTE_BG[o.c] || '#fff1c2'; st.color = '#1f2937';
    } else if (o.t === 'text') {
      var fs = o.fs * v.s; st.left = (v.tx + o.x * v.s - 4) + 'px'; st.top = (v.ty + o.y * v.s - 4) + 'px';
      st.width = Math.max(160, (bbox(o).w + o.fs * 4) * v.s) + 'px'; st.height = Math.max(fs * 1.6, (String(ta.value).split('\n').length) * fs * 1.25 + 12) + 'px';
      st.fontSize = fs + 'px'; st.padding = '4px'; st.background = 'rgba(255,255,255,.92)'; st.color = o.c;
    } else {
      var mx = v.tx + (o.x1 + o.x2) / 2 * v.s, my = v.ty + (o.y1 + o.y2) / 2 * v.s;
      st.left = (mx - 90) + 'px'; st.top = (my - 44) + 'px'; st.width = '180px'; st.height = '38px'; st.fontSize = '15px';
      st.padding = '8px 10px'; st.background = '#fff'; st.color = '#111827';
    }
  }
  function commitEdit(cancel) {
    if (!S || !S.editing) return;
    var ed = S.editing, o = ed.o, val = S.ta.value; S.editing = null; S.ta.hidden = true;
    if (cancel) { if (ed.isNew && o.t !== 'measure') { S.objs.splice(S.objs.indexOf(o), 1); S.hist.pop(); } render(); return; }
    if (o.t === 'measure') { if ((o.label || '') !== val) { if (!ed.isNew) S.hist.push(ed.before); o.label = val.trim(); setDirty(); } }
    else if (!val.trim() && o.t === 'text') { var k = S.objs.indexOf(o); if (k >= 0) S.objs.splice(k, 1); if (ed.isNew) S.hist.pop(); else S.hist.push(ed.before); S.sel = -1; }
    else if ((o.text || '') !== val) { if (!ed.isNew) S.hist.push(ed.before); o.text = val; setDirty(); }
    render(); ui();
  }

  /* ------------------------------------------------------------ pointers --- */
  var pts = {};
  function onDown(e) {
    if (!S || !S.bg) return;
    e.preventDefault();
    try { S.cv.setPointerCapture(e.pointerId); } catch (x) {}
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);
    if (ids.length === 2) {           /* second finger: pinch / pan, drop what the first started */
      if (S.drag && S.drag.mode === 'draw' && S.temp) S.temp = null;
      if (S.drag && S.drag.snapped) { S.objs = JSON.parse(S.hist.pop()); }
      var a = pts[ids[0]], b = pts[ids[1]];
      S.drag = { mode: 'pinch', d: dist(a.x, a.y, b.x, b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; render(); return;
    }
    if (ids.length > 2) return;
    if (S.editing) { commitEdit(); }
    var p = toImg(e), tol = 10 / S.view.s, tool = S.tool;
    if (e.button === 1 || S.space || tool === 'pan') { S.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: S.view.tx, ty: S.view.ty }; return; }
    if (tool === 'select') {
      var sel = S.objs[S.sel];
      var h = handles(sel).filter(function (hh) { return dist(p.x, p.y, hh.x, hh.y) < 14 / S.view.s; })[0];
      if (h) { S.drag = { mode: 'handle', h: h.k, o: sel, base: clone(sel), p: p, snapped: false }; return; }
      var idx = topHit(p, tol);
      if (idx >= 0) {
        var now = Date.now(), o = S.objs[idx];
        if (S.lastTap && S.lastTap.i === idx && now - S.lastTap.t < 400 && (o.t === 'text' || o.t === 'note' || o.t === 'measure')) { S.lastTap = null; S.sel = idx; editText(o, false); return; }
        S.lastTap = { i: idx, t: now };
        S.sel = idx; S.drag = { mode: 'move', o: o, base: clone(o), p: p, snapped: false }; render(); ui(); return;
      }
      S.sel = -1; ui(); render();
      S.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: S.view.tx, ty: S.view.ty }; return;
    }
    if (tool === 'eraser') { S.drag = { mode: 'erase', snapped: false }; eraseAt(p); return; }
    var c = S.color, w = strokeW();
    if (tool === 'count') { snap(); S.objs.push({ id: rid('o'), t: 'count', x: p.x, y: p.y, c: c, r: 13 * unit() }); render(); ui(); return; }
    if (tool === 'area' || tool === 'run') {
      p = snapPt(p, e);
      var now2 = Date.now(), P = S.poly;
      if (!P) { S.poly = { id: rid('o'), t: tool, pts: [r1(p.x), r1(p.y)], c: c, w: w }; S.lastPt = now2; polyBar(); render(); return; }
      var lx = P.pts[P.pts.length - 2], ly = P.pts[P.pts.length - 1], near = 10 / S.view.s;
      /* double-tap / double-click, or tapping the first corner again, finishes */
      if ((now2 - S.lastPt < 380 && dist(p.x, p.y, lx, ly) < near * 2) || (tool === 'area' && P.pts.length >= 6 && dist(p.x, p.y, P.pts[0], P.pts[1]) < near * 1.5)) { finishPoly(); return; }
      P.pts.push(r1(p.x), r1(p.y)); S.lastPt = now2; polyBar(); render(); return;
    }
    if (tool !== 'pen') p = snapPt(p, e);
    if (tool === 'text') { snap(); var t = { id: rid('o'), t: 'text', x: p.x, y: p.y, text: '', c: c, fs: fontPx() }; S.objs.push(t); S.sel = S.objs.length - 1; editText(t, true); return; }
    if (tool === 'note') {
      snap(); var u = unit(), nw = 200 * u, nh = 150 * u;
      var n = { id: rid('o'), t: 'note', x: Math.min(p.x, S.W - nw), y: Math.min(p.y, S.H - nh), w: nw, h: nh, text: '', c: c };
      S.objs.push(n); S.sel = S.objs.length - 1; editText(n, true); return;
    }
    if (tool === 'pen') S.temp = { id: rid('o'), t: 'pen', pts: [r1(p.x), r1(p.y)], c: c, w: w };
    else if (tool === 'scale') S.temp = { id: rid('o'), t: 'scale', x1: p.x, y1: p.y, x2: p.x, y2: p.y, c: '#4e6ef2', w: w };
    else S.temp = { id: rid('o'), t: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, c: c, w: w };
    S.drag = { mode: 'draw' }; render();
  }
  function r1(n) { return Math.round(n * 10) / 10; }
  function topHit(p, tol) { for (var i = S.objs.length - 1; i >= 0; i--) if (hit(S.objs[i], p.x, p.y, tol)) return i; return -1; }
  function eraseAt(p) {
    var i = topHit(p, 10 / S.view.s); if (i < 0) return;
    if (!S.drag.snapped) { snap(); S.drag.snapped = true; }
    S.objs.splice(i, 1); S.sel = -1; render();
  }
  function onMove(e) {
    if (!S) return;
    if (pts[e.pointerId]) pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var d = S.drag; if (!d) { hover(e); return; }
    e.preventDefault();
    if (d.mode === 'pinch') {
      var ids = Object.keys(pts); if (ids.length < 2) return;
      var a = pts[ids[0]], b = pts[ids[1]], nd = dist(a.x, a.y, b.x, b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      var r = S.cv.getBoundingClientRect();
      S.view.tx += cx - d.cx; S.view.ty += cy - d.cy;
      if (d.d > 0) zoomAt(nd / d.d, cx - r.left, cy - r.top);
      d.d = nd; d.cx = cx; d.cy = cy; render(); placeEditor(); return;
    }
    if (d.mode === 'pan') { S.view.tx = d.tx + e.clientX - d.sx; S.view.ty = d.ty + e.clientY - d.sy; render(); placeEditor(); return; }
    var p = toImg(e);
    if (d.mode === 'erase') { eraseAt(p); return; }
    if (d.mode === 'draw' && S.temp) {
      var t = S.temp;
      if (t.t === 'pen') { var L = t.pts.length; if (dist(p.x, p.y, t.pts[L - 2], t.pts[L - 1]) * S.view.s > 1.5) t.pts.push(r1(p.x), r1(p.y)); }
      else {
        if (t.t !== 'rect' && t.t !== 'ellipse') p = snapPt(p, e);
        var x2 = p.x, y2 = p.y;
        if (e.shiftKey && (t.t === 'line' || t.t === 'arrow' || t.t === 'measure' || t.t === 'scale')) { var ang = Math.round(Math.atan2(y2 - t.y1, x2 - t.x1) / (Math.PI / 4)) * Math.PI / 4, len = dist(t.x1, t.y1, x2, y2); x2 = t.x1 + Math.cos(ang) * len; y2 = t.y1 + Math.sin(ang) * len; }
        if (e.shiftKey && (t.t === 'rect' || t.t === 'ellipse')) { var m = Math.max(Math.abs(x2 - t.x1), Math.abs(y2 - t.y1)); x2 = t.x1 + m * Math.sign(x2 - t.x1 || 1); y2 = t.y1 + m * Math.sign(y2 - t.y1 || 1); }
        t.x2 = x2; t.y2 = y2;
      }
      render(); return;
    }
    if (d.mode === 'move' || d.mode === 'handle') {
      var dx = p.x - d.p.x, dy = p.y - d.p.y;
      if (!d.snapped) { if (Math.hypot(dx, dy) * S.view.s < 3) return; S.hist.push(JSON.stringify(replaceIn(S.objs, d.o, d.base))); S.fut = []; d.snapped = true; S.dirty = true; ui(); }
      var o = d.o, B = d.base;
      if (d.mode === 'move') {
        if (o.t === 'pen' || o.t === 'area' || o.t === 'run') o.pts = B.pts.map(function (v, i) { return r1(v + (i % 2 ? dy : dx)); });
        else if (o.t === 'count') { o.x = B.x + dx; o.y = B.y + dy; }
        else if (o.t === 'text' || o.t === 'note') { o.x = B.x + dx; o.y = B.y + dy; }
        else { o.x1 = B.x1 + dx; o.y1 = B.y1 + dy; o.x2 = B.x2 + dx; o.y2 = B.y2 + dy; }
      } else if (typeof d.h === 'string' && d.h.charAt(0) === 'v') {
        var vi = +d.h.slice(1) * 2, sp = snapPtExcept(p, e, o, vi); o.pts[vi] = r1(sp.x); o.pts[vi + 1] = r1(sp.y);
      } else if (d.h === 'se') { var mn = 60 * unit() * 0.6; o.w = Math.max(mn, B.w + dx); o.h = Math.max(mn * 0.7, B.h + dy); }
      else if (d.h === 1) { o.x1 = B.x1 + dx; o.y1 = B.y1 + dy; }
      else { o.x2 = B.x2 + dx; o.y2 = B.y2 + dy; }
      render(); return;
    }
  }
  function snapPtExcept(p, e, o, vi) { var keep = o.pts.splice(vi, 2); var r = snapPt(p, e); o.pts.splice(vi, 0, keep[0], keep[1]); return r; }
  function replaceIn(list, o, base) { return list.map(function (x) { return x === o ? base : x; }); }
  function onUp(e) {
    delete pts[e.pointerId];
    if (!S) return;
    var d = S.drag; if (!d) return;
    if (d.mode === 'pinch') { if (Object.keys(pts).length === 0) S.drag = null; return; }
    S.drag = null;
    if (d.mode === 'draw' && S.temp) {
      var t = S.temp; S.temp = null;
      var small = t.t === 'pen' ? false : dist(t.x1, t.y1, t.x2, t.y2) * S.view.s < 4;
      if (t.t === 'pen' && t.pts.length === 2) t.pts.push(t.pts[0] + 0.1, t.pts[1]);
      if (!small && t.t === 'scale') { S.snapHit = null; render(); scalePanel(dist(t.x1, t.y1, t.x2, t.y2)); return; }
      if (!small) {
        snap(); S.objs.push(t);
        if (t.t === 'measure' && !ppf()) { S.sel = S.objs.length - 1; editText(t, true); }
      }
      S.snapHit = null;
      render(); ui();
    }
  }
  function hover(e) {
    if (S.bg && (MEASURE_TOOLS[S.tool] || S.tool === 'line' || S.tool === 'arrow' || S.tool === 'rect')) {
      var hp = snapPt(toImg(e), e); if (S.poly) S.cursor = hp; render();
    }
    if (S.tool !== 'select' || !S.bg) { S.cv.style.cursor = S.tool === 'eraser' ? 'cell' : S.tool === 'text' ? 'text' : 'crosshair'; return; }
    var p = toImg(e), sel = S.objs[S.sel];
    if (handles(sel).some(function (h) { return dist(p.x, p.y, h.x, h.y) < 14 / S.view.s; })) { S.cv.style.cursor = 'nwse-resize'; return; }
    S.cv.style.cursor = topHit(p, 10 / S.view.s) >= 0 ? 'move' : 'grab';
  }
  function onWheel(e) {
    if (!S || !S.bg) return; e.preventDefault();
    var r = S.cv.getBoundingClientRect();
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) { S.view.tx -= e.deltaX; render(); placeEditor(); return; }
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
  }

  /* ------------------------------------------------------ area / length --- */
  function finishPoly() {
    var P = S.poly; if (!P) return;
    var need = P.t === 'area' ? 6 : 4;
    S.poly = null; S.cursor = null; S.snapHit = null;
    if (P.pts.length >= need) { snap(); S.objs.push(P); if (P.t === 'area' && /roof/i.test(trade())) P.pitch = S.lastPitch || 0; S.sel = -1; }
    else status(P.t === 'area' ? 'An area needs at least 3 corners.' : 'A run needs at least 2 points.', true);
    polyBar(); render(); ui(); takeoff();
  }
  function cancelPoly() { S.poly = null; S.cursor = null; S.snapHit = null; polyBar(); render(); }
  function polyBar() {
    var b = S.root.querySelector('.bpe-polybar'); if (!b) return;
    var P = S.poly; b.hidden = !P; if (!P) return;
    var n = P.pts.length / 2;
    b.querySelector('.bpe-pb-t').textContent = P.t === 'area'
      ? (n < 3 ? 'Tap each corner of the area (' + n + ' so far)' : n + ' corners · tap the first corner or Finish')
      : (n < 2 ? 'Tap along the run' : n + ' points · ' + (fmtLen(polyLen(P.pts)) || 'set the scale to see length'));
    b.querySelector('[data-act=polydone]').disabled = n < (P.t === 'area' ? 3 : 2);
  }
  function trade() { return (((window.bpSettingsGet && bpSettingsGet().company) || {}).trade) || ''; }

  /* ------------------------------------------------------------- scale --- */
  function scaleLabel() { return S.scale && S.scale.ppf ? (S.scale.label || 'Calibrated') : 'Set scale'; }
  function scalePanel(px) {
    var pnl = S.root.querySelector('.bpe-scalep'); if (!pnl) return;
    var m = S.units === 'm';
    var pre = S.ppi ? PRESETS.map(function (x, i) { return '<option value="' + i + '"' + (S.scale && S.scale.label === x[0] ? ' selected' : '') + '>' + esc(x[0]) + '</option>'; }).join('') : '';
    pnl.innerHTML = '<div class="bpe-sp-h"><b>' + (px ? 'How long is this line?' : 'Drawing scale') + '</b><button type="button" class="bpe-ib" data-act="scaleclose" aria-label="Close"><span class="ms">close</span></button></div>'
      + (px ? '<p>Enter the real length of the dimension you traced. Every measurement on this sheet uses it.</p>'
        + '<div class="bpe-sp-in">' + (m ? '<label><input type="number" inputmode="decimal" min="0" step="0.01" id="bpe-sm" placeholder="0.00"><span>m</span></label>'
          : '<label><input type="number" inputmode="decimal" min="0" step="1" id="bpe-sft" placeholder="0"><span>ft</span></label><label><input type="number" inputmode="decimal" min="0" max="11.99" step="0.5" id="bpe-sin" placeholder="0"><span>in</span></label>')
        + '</div><button type="button" class="bpe-btn" data-act="scaleset">Set scale</button>'
        : (S.ppi ? '<p>Pick the scale printed on the sheet (in the title block or under the drawing title).</p><select id="bpe-spre"><option value="">Choose a scale…</option>' + pre + '</select>' : '<p>This sheet is a photo or scan, so its scale has to be traced: draw a line over a dimension you know, like a wall marked 12\'-0", and type its length.</p>')
          + '<button type="button" class="bpe-btn ' + (S.ppi ? 'ghost' : '') + '" data-act="scaletrace"><span class="ms">straighten</span>Trace a known dimension</button>'
          + '<p class="bpe-sp-tip">Tracing the longest dimension you can find is the most accurate.</p>')
      + '<div class="bpe-sp-u"><span>Units</span><button type="button" data-act="unitft" class="' + (m ? '' : 'on') + '">Feet</button><button type="button" data-act="unitm" class="' + (m ? 'on' : '') + '">Meters</button></div>'
      + (S.scale && S.scale.ppf ? '<div class="bpe-sp-cur">Now: <b>' + esc(scaleLabel()) + '</b> <button type="button" data-act="scaleclear">Remove</button></div>' : '');
    pnl.hidden = false; pnl._px = px || 0;
    var sel = pnl.querySelector('#bpe-spre'); if (sel) sel.addEventListener('change', function () { var x = PRESETS[+sel.value]; if (!sel.value || !x) return; setScale(x[1] > 0 ? S.ppi * x[1] : S.ppi * 12 / -x[1], x[0]); });
    var f = pnl.querySelector('input'); if (f) setTimeout(function () { f.focus(); }, 30);
    pnl.querySelectorAll('input').forEach(function (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); act('scaleset'); } }); });
  }
  function setScale(ppfv, label) {
    S.scale = { ppf: ppfv, label: label }; S.dirty = true;
    S.root.querySelector('.bpe-scalep').hidden = true;
    if (S.tool === 'scale') S.tool = 'measure';
    status('Scale set: ' + label); render(); ui(); takeoff();
  }
  function scaleFromInput() {
    var pnl = S.root.querySelector('.bpe-scalep'), px = pnl._px, ft = 0, lbl;
    if (S.units === 'm') { var mv = parseFloat((pnl.querySelector('#bpe-sm') || {}).value) || 0; ft = mv / 0.3048; lbl = mv + ' m traced'; }
    else { var a = parseFloat((pnl.querySelector('#bpe-sft') || {}).value) || 0, b = parseFloat((pnl.querySelector('#bpe-sin') || {}).value) || 0; ft = a + b / 12; lbl = fmtFt(ft) + ' traced'; }
    if (!(ft > 0) || !px) { status('Type the real length first.', true); return; }
    setScale(px / ft, lbl);
  }

  /* ----------------------------------------------------------- takeoff --- */
  function items() {
    number();
    var A = [], L = [], C = {}, tot = { sf: 0, sq: 0, lf: 0 };
    S.objs.forEach(function (o, i) {
      if (o.t === 'area' && o.pts.length >= 6) { var sf = sqft(o); A.push({ i: i, o: o, sf: sf }); tot.sf += sf; if (o.pitch) tot.sq += sf / 100; }
      else if (o.t === 'measure' || o.t === 'run') { var f = feet(lenOf(o)); L.push({ i: i, o: o, ft: f, n: (L.filter(function (x) { return x.o.t === o.t; }).length + 1) }); tot.lf += f; }
      else if (o.t === 'count') { C[o.c] = (C[o.c] || 0) + 1; }
    });
    return { A: A, L: L, C: C, tot: tot };
  }
  function cname(c) { var x = COLORS.filter(function (k) { return k[0] === c; })[0]; return x ? x[1] : 'Marker'; }
  function takeoff() {
    var side = S && S.root.querySelector('.bpe-side'); if (!side || side.hidden) return;
    var it = items(), has = ppf(), m = S.units === 'm';
    var dot = function (c) { return '<i class="bpe-dot" style="background:' + c + '"></i>'; };
    var h = '<div class="bpe-side-h"><b>Takeoff</b><button type="button" class="bpe-ib" data-act="side" aria-label="Close takeoff"><span class="ms">close</span></button></div>'
      + '<button type="button" class="bpe-scalechip' + (has ? '' : ' warn') + '" data-act="scale"><span class="ms">square_foot</span>' + esc(scaleLabel()) + '</button>'
      + (has ? '' : '<p class="bpe-side-note">Set the scale first. Until then areas and lengths can be drawn, but not measured.</p>');
    h += '<div class="bpe-sec"><div class="bpe-sec-h">Areas<span>' + (has ? fmtArea(it.tot.sf) : '') + '</span></div>'
      + (it.A.length ? it.A.map(function (a, k) {
        return '<div class="bpe-row" data-pick="' + a.i + '">' + dot(a.o.c) + '<span class="bpe-rn">Area ' + (k + 1) + '</span>'
          + '<select data-pitch="' + a.i + '" aria-label="Roof pitch for area ' + (k + 1) + '" title="Roof pitch: adds the slope to the flat area">'
          + PITCHES.map(function (p) { return '<option value="' + p + '"' + ((a.o.pitch || 0) === p ? ' selected' : '') + '>' + (p ? p + '/12' : 'Flat') + '</option>'; }).join('') + '</select>'
          + '<b>' + (has ? fmtArea(a.sf) : '—') + '</b></div>';
      }).join('') + (it.tot.sq && !m ? '<div class="bpe-row tot"><span class="bpe-rn">Roof squares (with pitch)</span><b>' + it.tot.sq.toFixed(1) + '</b></div>' : '')
        : '<p class="bpe-empty">Use <b>Area</b> to outline a roof plane, a room or a slab.</p>') + '</div>';
    h += '<div class="bpe-sec"><div class="bpe-sec-h">Lengths<span>' + (has ? fmtFt(it.tot.lf) : '') + '</span></div>'
      + (it.L.length ? it.L.map(function (l, k) { return '<div class="bpe-row" data-pick="' + l.i + '">' + dot(l.o.c) + '<span class="bpe-rn">' + (l.o.t === 'run' ? 'Run ' : 'Dimension ') + l.n + (l.o.label ? ' · ' + esc(l.o.label) : '') + '</span><b>' + (has ? fmtFt(l.ft) : '—') + '</b></div>'; }).join('')
        : '<p class="bpe-empty">Use <b>Measure</b> for one dimension, <b>Length run</b> for gutters, trim, pipe or wire.</p>') + '</div>';
    var ck = Object.keys(it.C);
    h += '<div class="bpe-sec"><div class="bpe-sec-h">Counts<span>' + (ck.length ? ck.reduce(function (s2, c) { return s2 + it.C[c]; }, 0) : '') + '</span></div>'
      + (ck.length ? ck.map(function (c) { return '<div class="bpe-row">' + dot(c) + '<span class="bpe-rn">' + esc(cname(c)) + ' markers</span><b>' + it.C[c] + '</b></div>'; }).join('')
        : '<p class="bpe-empty">Use <b>Count</b> to tally vents, outlets, fixtures or windows. Each colour is its own count.</p>') + '</div>';
    h += '<button type="button" class="bpe-btn ghost bpe-csv" data-act="csv"><span class="ms">table_view</span>Export takeoff (CSV)</button>';
    side.innerHTML = h;
    side.querySelectorAll('[data-pitch]').forEach(function (sel) {
      sel.addEventListener('change', function () { var o = S.objs[+sel.getAttribute('data-pitch')]; if (!o) return; snap(); o.pitch = +sel.value; S.lastPitch = o.pitch; render(); takeoff(); });
      sel.addEventListener('click', function (e) { e.stopPropagation(); });
    });
  }
  function rowsCsv() {
    var it = items(), u = S.units === 'm', out = [['Type', 'Item', 'Colour', 'Pitch', 'Quantity', 'Unit']];
    var num = function (n, d) { return (+n).toFixed(d); };
    it.A.forEach(function (a, k) { out.push(['Area', 'Area ' + (k + 1), cname(a.o.c), a.o.pitch ? a.o.pitch + '/12' : 'Flat', num(u ? a.sf * 0.09290304 : a.sf, 1), u ? 'm2' : 'sq ft']); });
    if (it.tot.sq && !u) out.push(['Area', 'Roof squares', '', '', num(it.tot.sq, 2), 'squares']);
    it.L.forEach(function (l, k) { out.push(['Length', (l.o.t === 'run' ? 'Run ' : 'Dimension ') + l.n + (l.o.label ? ' (' + l.o.label + ')' : ''), cname(l.o.c), '', num(u ? l.ft * 0.3048 : l.ft, 2), u ? 'm' : 'ft']); });
    Object.keys(it.C).forEach(function (c) { out.push(['Count', cname(c) + ' markers', cname(c), '', it.C[c], 'each']); });
    return out;
  }
  function exportCsv() {
    if (!ppf()) { status('Set the scale before exporting the takeoff.', true); return; }
    var csv = rowsCsv().map(function (r) { return r.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    download(URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), baseName() + ' takeoff.csv'); status('Takeoff downloaded');
  }

  /* ---------------------------------------------------------------- UI --- */
  function ui() {
    if (!S) return;
    var R = S.root;
    R.querySelectorAll('[data-tool]').forEach(function (b) { var on = b.getAttribute('data-tool') === S.tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    R.querySelectorAll('[data-color]').forEach(function (b) { var on = b.getAttribute('data-color') === S.color; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    R.querySelectorAll('[data-wi]').forEach(function (b) { var on = +b.getAttribute('data-wi') === S.wi; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    var q = function (s) { return R.querySelector(s); };
    q('[data-act=undo]').disabled = !S.hist.length; q('[data-act=redo]').disabled = !S.fut.length;
    q('[data-act=del]').disabled = !(S.objs[S.sel]); q('[data-act=clear]').disabled = !S.objs.length;
    q('[data-act=save]').disabled = !S.dirty || !S.bg;
    q('.bpe-count').textContent = S.objs.length + (S.objs.length === 1 ? ' markup' : ' markups') + (S.dirty ? ' · unsaved' : '');
    var pdf = q('[data-act=pdf]');
    pdf.disabled = !S.bg || S.pdfState === 'failed' || S.pdfState === 'loading';
    pdf.title = S.pdfState === 'failed' ? 'PDF export needs the jsPDF library, which could not load. Download a PNG instead.' : 'Download as PDF';
    var pn = q('.bpe-pdfnote'); pn.hidden = S.pdfState !== 'failed';
    ['png', 'copy'].forEach(function (k) { q('[data-act=' + k + ']').disabled = !S.bg; });
    var chip = q('.bpe-top [data-act=scale]'); if (chip) { chip.classList.toggle('warn', !ppf()); chip.querySelector('.bpe-sc-t').textContent = scaleLabel(); }
    var tk = q('.bpe-top [data-act=side]'); if (tk) tk.classList.toggle('on', !q('.bpe-side').hidden);
  }
  function status(t, bad) { var el = S && S.root.querySelector('.bpe-status'); if (!el) return; el.textContent = t; el.classList.toggle('bad', !!bad); clearTimeout(S.stT); if (t && !bad) S.stT = setTimeout(function () { if (el) el.textContent = ''; }, 3500); }

  function shell(name) {
    var tools = TOOLS.map(function (t) { return (t[0] === 'measure' ? '<span class="bpe-sep"></span>' : '') + '<button type="button" class="bpe-tool" data-tool="' + t[0] + '" title="' + t[2] + ' (' + t[3] + ')" aria-label="' + t[2] + '"><span class="ms">' + t[1] + '</span><span class="bpe-tl">' + t[2].split(' ')[0] + '</span></button>'; }).join('');
    var sw = COLORS.map(function (c) { return '<button type="button" class="bpe-sw" data-color="' + c[0] + '" style="--c:' + c[0] + '" title="' + c[1] + '" aria-label="' + c[1] + '"></button>'; }).join('');
    var wd = WIDTHS.map(function (w, i) { return '<button type="button" class="bpe-wd" data-wi="' + i + '" title="Stroke ' + w[0] + '" aria-label="Stroke width ' + w[0] + '"><i style="height:' + (2 + i * 3) + 'px"></i></button>'; }).join('');
    return '<div class="bpe-top">'
      + '<button type="button" class="bpe-ib" data-act="close" aria-label="Close editor" title="Close (Esc)"><span class="ms">close</span></button>'
      + '<div class="bpe-name"><b>' + esc(name || 'Blueprint') + '</b><small><span class="bpe-count"></span> <span class="bpe-status" role="status" aria-live="polite"></span></small></div>'
      + '<div class="bpe-grp">'
      + '<button type="button" class="bpe-ib" data-act="undo" aria-label="Undo" title="Undo (Ctrl+Z)"><span class="ms">undo</span></button>'
      + '<button type="button" class="bpe-ib" data-act="redo" aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><span class="ms">redo</span></button></div>'
      + '<div class="bpe-grp bpe-zoom">'
      + '<button type="button" class="bpe-ib" data-act="zout" aria-label="Zoom out"><span class="ms">remove</span></button>'
      + '<button type="button" class="bpe-zoomv" data-act="fit" title="Fit to screen" aria-label="Fit to screen">100%</button>'
      + '<button type="button" class="bpe-ib" data-act="zin" aria-label="Zoom in"><span class="ms">add</span></button></div>'
      + '<button type="button" class="bpe-btn ghost bpe-scbtn" data-act="scale" title="Drawing scale"><span class="ms">square_foot</span><span class="bpe-sc-t">Set scale</span></button>'
      + '<button type="button" class="bpe-btn ghost" data-act="side" title="Takeoff: areas, lengths and counts"><span class="ms">calculate</span><span class="bpe-hide">Takeoff</span></button>'
      + '<div class="bpe-exp"><button type="button" class="bpe-btn ghost" data-act="menu" aria-haspopup="true" aria-expanded="false"><span class="ms">ios_share</span><span class="bpe-hide">Export</span></button>'
      + '<div class="bpe-menu" hidden role="menu">'
      + '<button type="button" role="menuitem" data-act="png"><span class="ms">image</span>Download PNG</button>'
      + '<button type="button" role="menuitem" data-act="pdf"><span class="ms">picture_as_pdf</span>Download PDF</button>'
      + '<div class="bpe-pdfnote" hidden>PDF export is unavailable: the PDF library could not load (offline?). Use PNG.</div>'
      + '<button type="button" role="menuitem" data-act="copy"><span class="ms">library_add</span>Save copy to blueprints</button></div></div>'
      + '<button type="button" class="bpe-btn" data-act="save"><span class="ms">save</span><span class="bpe-hide">Save</span></button>'
      + '</div>'
      + '<div class="bpe-main">'
      + '<div class="bpe-rail" role="toolbar" aria-label="Markup tools">' + tools + '<span class="bpe-sep"></span>'
      + '<div class="bpe-sws">' + sw + '</div><span class="bpe-sep"></span><div class="bpe-wds">' + wd + '</div><span class="bpe-sep"></span>'
      + '<button type="button" class="bpe-tool" data-act="del" title="Delete selected (Del)" aria-label="Delete selected"><span class="ms">delete</span><span class="bpe-tl">Delete</span></button>'
      + '<button type="button" class="bpe-tool" data-act="clear" title="Clear all markups" aria-label="Clear all"><span class="ms">layers_clear</span><span class="bpe-tl">Clear</span></button>'
      + '</div>'
      + '<div class="bpe-stage"><canvas aria-label="Blueprint with markups"></canvas><textarea class="bpe-ta" hidden aria-label="Edit text"></textarea>'
      + '<div class="bpe-polybar" hidden><span class="bpe-pb-t"></span><button type="button" class="bpe-ib" data-act="polyundo" title="Remove last point (Backspace)" aria-label="Remove last point"><span class="ms">undo</span></button>'
      + '<button type="button" class="bpe-btn ghost" data-act="polycancel">Cancel</button><button type="button" class="bpe-btn" data-act="polydone">Finish</button></div>'
      + '<div class="bpe-scalep" hidden role="dialog" aria-label="Drawing scale"></div>'
      + '<div class="bpe-load"><span class="bpe-spin"></span>Loading the drawing…</div>'
      + '<div class="bpe-hint">Set the scale, then measure · points snap to corners (hold Alt to stop) · pinch or scroll to zoom</div></div>'
      + '<aside class="bpe-side" hidden aria-label="Takeoff"></aside>'
      + '</div>';
  }

  function act(a) {
    if (!S) return;
    var menu = S.root.querySelector('.bpe-menu'), mb = S.root.querySelector('[data-act=menu]');
    if (a !== 'menu') { menu.hidden = true; mb.setAttribute('aria-expanded', 'false'); }
    if (a === 'close') return close();
    if (a === 'undo') return undo();
    if (a === 'redo') return redo();
    if (a === 'zin' || a === 'zout') return zoomAt(a === 'zin' ? 1.25 : 0.8, S.vw / 2, S.vh / 2);
    if (a === 'fit') return fit();
    if (a === 'menu') { menu.hidden = !menu.hidden; mb.setAttribute('aria-expanded', String(!menu.hidden)); return; }
    if (a === 'del') { if (S.objs[S.sel]) { commitEdit(); snap(); S.objs.splice(S.sel, 1); S.sel = -1; render(); ui(); } return; }
    if (a === 'clear') { if (!S.objs.length || !confirm('Clear all ' + S.objs.length + ' markups from this sheet? You can undo this.')) return; commitEdit(); snap(); S.objs = []; S.sel = -1; render(); ui(); return; }
    if (a === 'save') return save();
    if (a === 'png') return exportPng();
    if (a === 'pdf') return exportPdf();
    if (a === 'copy') return saveCopy();
    if (a === 'scale') { var sp = S.root.querySelector('.bpe-scalep'); if (!sp.hidden && !sp._px) { sp.hidden = true; return; } return scalePanel(0); }
    if (a === 'scaleclose') { S.root.querySelector('.bpe-scalep').hidden = true; return; }
    if (a === 'scaletrace') { S.root.querySelector('.bpe-scalep').hidden = true; setTool('scale'); status('Draw a line over a dimension you know'); return; }
    if (a === 'scaleset') return scaleFromInput();
    if (a === 'scaleclear') { S.scale = null; S.dirty = true; S.root.querySelector('.bpe-scalep').hidden = true; render(); ui(); takeoff(); return; }
    if (a === 'unitft' || a === 'unitm') { S.units = a === 'unitm' ? 'm' : 'ft'; S.dirty = true; var p2 = S.root.querySelector('.bpe-scalep'); scalePanel(p2._px); render(); ui(); takeoff(); return; }
    if (a === 'side') { var sd = S.root.querySelector('.bpe-side'); sd.hidden = !sd.hidden; S.root.classList.toggle('bpe-sideon', !sd.hidden); takeoff(); ui(); setTimeout(resize, 0); return; }
    if (a === 'csv') return exportCsv();
    if (a === 'polydone') return finishPoly();
    if (a === 'polycancel') return cancelPoly();
    if (a === 'polyundo') { if (S.poly) { S.poly.pts.splice(-2, 2); if (!S.poly.pts.length) cancelPoly(); else { polyBar(); render(); } } return; }
  }

  /* ------------------------------------------------------- save & export --- */
  function save() {
    commitEdit();
    var j = S.job; j.blueprintMarks = j.blueprintMarks || {};
    j.blueprintMarks[S.bp.id] = { v: 2, w: S.W, h: S.H, objs: clone(S.objs).map(function (o) { delete o._n; return o; }), scale: S.scale || null, units: S.units, at: Date.now() };
    try { bpJobsSet(bpJobsGet()); } catch (e) {}
    S.dirty = false; ui(); status('Saved');
    try { if (window.bpPF) bpPF.bpRender(j); } catch (e) {}
  }
  function flatten(type) {
    commitEdit();
    var max = 6000, k = Math.min(1, max / Math.max(S.W, S.H));
    var c = document.createElement('canvas'); c.width = Math.round(S.W * k); c.height = Math.round(S.H * k);
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.scale(k, k);
    x.drawImage(S.bg, 0, 0, S.W, S.H);
    number(); S.objs.forEach(function (o) { drawObj(x, o, unit()); });
    return c.toDataURL(type || 'image/png', 0.92);
  }
  function baseName() { return String(S.bp.n || 'blueprint').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w\- ]+/g, '').trim() || 'blueprint'; }
  function download(href, name) {
    var a = document.createElement('a'); a.href = href; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 100);
  }
  function safeFlatten(type) {
    try { return flatten(type); } catch (e) { status('This sheet could not be exported (the image host does not allow it). Try again after signing in.', true); return null; }
  }
  function exportPng() { var d = safeFlatten('image/png'); if (!d) return; download(d, baseName() + ' (marked up).png'); status('PNG downloaded'); }
  function exportPdf() {
    if (!hasJsPDF()) { status('PDF library not loaded. Use PNG.', true); return; }
    var d = safeFlatten('image/jpeg'); if (!d) return;
    try {
      var J = window.jspdf.jsPDF, land = S.W >= S.H;
      var doc = new J({ orientation: land ? 'landscape' : 'portrait', unit: 'pt', format: [S.W * 0.75, S.H * 0.75].sort(function (a, b) { return land ? b - a : a - b; }) });
      var pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      doc.addImage(d, 'JPEG', 0, 0, pw, ph);
      if (ppf() && rowsCsv().length > 1) {
        doc.addPage([612, 792], 'portrait');
        var y = 54, rows = rowsCsv();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Takeoff: ' + baseName(), 48, y); y += 18;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(100); doc.text('Scale ' + scaleLabel() + ' · ' + new Date().toLocaleDateString(), 48, y); y += 22; doc.setTextColor(0);
        var X = [48, 110, 300, 380, 440, 520];
        rows.forEach(function (r, k) {
          if (y > 740) { doc.addPage([612, 792], 'portrait'); y = 54; }
          doc.setFont('helvetica', k ? 'normal' : 'bold'); doc.setFontSize(10);
          r.forEach(function (v, c) { doc.text(String(v).slice(0, c === 1 ? 34 : 16), X[c], y); });
          if (!k) { doc.setDrawColor(200); doc.line(48, y + 5, 564, y + 5); }
          y += 17;
        });
      }
      doc.save(baseName() + ' (marked up).pdf'); status('PDF downloaded');
    } catch (e) { status('The PDF could not be made: ' + (e.message || e), true); }
  }
  function saveCopy() {
    var j = S.job, max = (window.bpPF && bpPF.MAX && bpPF.MAX.blueprints) || 8;
    j.blueprints = j.blueprints || [];
    if (j.blueprints.length >= max) { status('This project already has ' + max + ' blueprints. Remove one first.', true); return; }
    var d = safeFlatten('image/png'); if (!d) return;
    var entry = { id: rid('bp'), n: baseName() + ' (marked up).png', t: 'image/png', d: d };
    j.blueprints.push(entry);
    try { bpJobsSet(bpJobsGet()); } catch (e) {}
    if (window.bpPF) {
      bpPF.adopt(j, 'blueprints', d, entry.n, function () { return entry.d; }, function (_, ref) { entry.d = ref; });
      try { bpPF.bpRender(j); } catch (e) {}
    }
    status('Copy saved to blueprints');
  }

  /* -------------------------------------------------------- background --- */
  function loadBg(b) {
    var isPdf = /pdf/i.test(b.t || '') || /^data:application\/pdf/.test(b.d || '');
    var getUrl = window.bpPF ? bpPF.url(b.d) : Promise.resolve(b.d);
    return getUrl.then(function (u) {
      if (!u) throw new Error('Sign in to open this blueprint.');
      if (!isPdf) return new Promise(function (res, rej) {
        var im = new Image(); if (!/^data:|^blob:/.test(u)) im.crossOrigin = 'anonymous';
        im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('The image could not be loaded.')); }; im.src = u;
      });
      return loadScript(PDFJS, hasPdfJs, 12000).catch(function () {
        throw new Error('PDF sheets need the PDF viewer, which could not load (offline?). Convert the sheet to a PNG or JPG, add it as a blueprint, and mark that up.');
      }).then(function () {
        try { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_W; } catch (e) {}
        return fetch(u).then(function (r) { return r.arrayBuffer(); });
      }).then(function (buf) {
        return pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      }).then(function (pdf) { return pdf.getPage(1); }).then(function (pg) {
        var v1 = pg.getViewport({ scale: 1 }), sc = Math.min(4, 3000 / Math.max(v1.width, v1.height)), vp = pg.getViewport({ scale: sc });
        var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () { c._ppi = 72 * sc; return c; });
      });
    });
  }

  /* -------------------------------------------------------- open / close --- */
  function keydown(e) {
    if (!S) return;
    var inText = e.target === S.ta;
    if (S.poly && !inText && !/^(INPUT|SELECT)$/.test(e.target.tagName) && /^(Enter|Escape|Backspace)$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); act(e.key === 'Enter' ? 'polydone' : e.key === 'Escape' ? 'polycancel' : 'polyundo'); return; }
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (inText) { commitEdit(true); return; }
      var spn = S.root.querySelector('.bpe-scalep'); if (!spn.hidden) { spn.hidden = true; return; }
      var m = S.root.querySelector('.bpe-menu'); if (!m.hidden) { act('x'); return; }
      close(); return;
    }
    if (inText) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || S.editing && S.editing.o.t === 'measure')) { e.preventDefault(); commitEdit(); } e.stopPropagation(); return; }
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(S.root.querySelectorAll('button:not([disabled]),textarea:not([hidden])'), function (x) { return x.offsetParent !== null; });
      if (f.length) { var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } else if (!S.root.contains(document.activeElement)) { e.preventDefault(); a.focus(); } }
      return;
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); save(); return; }
    if ((k === 'delete' || k === 'backspace') && S.objs[S.sel]) { e.preventDefault(); act('del'); return; }
    if (k === ' ') { S.space = true; e.preventDefault(); return; }
    if (mod) return;
    var t = TOOLS.filter(function (x) { return x[3].toLowerCase() === k; })[0];
    if (t) { setTool(t[0]); return; }
    if (k === '+' || k === '=') act('zin'); else if (k === '-') act('zout'); else if (k === '0') act('fit');
  }
  function keyup(e) { if (S && e.key === ' ') S.space = false; }
  function setTool(t) { commitEdit(); if (S.poly && S.poly.t !== t) cancelPoly(); S.snapHit = null; S.tool = t; if (t !== 'select') S.sel = -1; ui(); render(); }
  function resize() { if (!S) return; var keep = S.bg && S.view && S.fitS ? S.view.s / S.fitS : 1; size(); if (S.bg) { var v = S.view; fit(); if (Math.abs(keep - 1) > 0.01) zoomAt(keep, S.vw / 2, S.vh / 2); } }

  function close(force) {
    if (!S) return;
    commitEdit();
    if (S.dirty && !force && !confirm('You have unsaved markups. Close without saving?')) return;
    var R = S.root, lf = S.lastFocus;
    document.removeEventListener('keydown', keydown, true); document.removeEventListener('keyup', keyup, true);
    window.removeEventListener('resize', resize);
    R.classList.add('out'); S = null; pts = {};
    setTimeout(function () { R.remove(); }, 200);
    if (lf && lf.focus) try { lf.focus({ preventScroll: true }); } catch (e) {}
  }

  window.bpBpEdit = function (i) {
    var j = job(), b = j && (j.blueprints || [])[i]; if (!b) return;
    if (S) close(true);
    if (!b.id) { b.id = rid('bp'); try { bpJobsSet(bpJobsGet()); } catch (e) {} }
    var host = document.getElementById('bpx') || document.body;
    var R = document.createElement('div'); R.className = 'bpe'; R.setAttribute('role', 'dialog'); R.setAttribute('aria-modal', 'true'); R.setAttribute('aria-label', 'Blueprint editor: ' + (b.n || 'Blueprint'));
    R.innerHTML = shell(b.n); host.appendChild(R);
    var saved = (j.blueprintMarks || {})[b.id];
    S = { job: j, bp: b, idx: i, root: R, stage: R.querySelector('.bpe-stage'), cv: R.querySelector('canvas'), ta: R.querySelector('.bpe-ta'),
      objs: saved ? clone(saved.objs || []) : [], hist: [], fut: [], sel: -1, tool: 'select', color: COLORS[0][0], wi: 1,
      scale: saved && saved.scale ? clone(saved.scale) : null, units: (saved && saved.units) || 'ft', poly: null, ppi: 0,
      view: { s: 1, tx: 0, ty: 0 }, fitS: 1, bg: null, dirty: false, pdfState: hasJsPDF() ? 'ready' : 'loading', lastFocus: document.activeElement };
    S.ctx = S.cv.getContext('2d');
    R.addEventListener('click', function (e) {
      var pk = e.target.closest('[data-pick]');
      if (pk && S && !e.target.closest('select')) { setTool('select'); S.sel = +pk.getAttribute('data-pick'); render(); ui(); return; }
      var t = e.target.closest('[data-act],[data-tool],[data-color],[data-wi]'); if (!t || !S) return;
      if (t.hasAttribute('data-act')) return act(t.getAttribute('data-act'));
      if (t.hasAttribute('data-tool')) return setTool(t.getAttribute('data-tool'));
      if (t.hasAttribute('data-color')) { S.color = t.getAttribute('data-color'); var o = S.objs[S.sel]; if (o) { snap(); o.c = S.color; render(); } ui(); return; }
      if (t.hasAttribute('data-wi')) {
        S.wi = +t.getAttribute('data-wi'); var o2 = S.objs[S.sel];
        if (o2 && o2.t !== 'note') { snap(); if (o2.t === 'text') o2.fs = fontPx(); else o2.w = strokeW(); render(); }
        ui();
      }
    });
    S.cv.addEventListener('pointerdown', onDown);
    S.cv.addEventListener('pointermove', onMove);
    S.cv.addEventListener('pointerup', onUp);
    S.cv.addEventListener('pointercancel', onUp);
    S.cv.addEventListener('wheel', onWheel, { passive: false });
    S.cv.addEventListener('dblclick', function (e) { if (!S || S.tool !== 'select') return; var i2 = topHit(toImg(e), 10 / S.view.s), o = S.objs[i2]; if (o && (o.t === 'text' || o.t === 'note' || o.t === 'measure')) { S.sel = i2; editText(o, false); } });
    S.ta.addEventListener('blur', function () { setTimeout(function () { if (S && S.editing && document.activeElement !== S.ta) commitEdit(); }, 0); });
    S.ta.addEventListener('input', function () { placeEditor(); });
    document.addEventListener('keydown', keydown, true); document.addEventListener('keyup', keyup, true);
    window.addEventListener('resize', resize);
    size(); ui();
    setTimeout(function () { var c = R.querySelector('[data-act=close]'); if (c) c.focus({ preventScroll: true }); }, 30);

    var me = S;
    if (!hasJsPDF()) loadScript(JSPDF, hasJsPDF, 10000).then(function () { if (S === me) { S.pdfState = 'ready'; ui(); } }).catch(function () { if (S === me) { S.pdfState = 'failed'; ui(); } });
    loadBg(b).then(function (img) {
      if (S !== me) return;
      S.bg = img; S.W = img.naturalWidth || img.width; S.H = img.naturalHeight || img.height;
      if (saved && saved.w && saved.w !== S.W) {   /* the sheet was re-rendered at another size: scale the markups to it */
        var k = S.W / saved.w; S.objs.forEach(function (o) { scaleObj(o, k); });
        if (S.scale && S.scale.ppf) S.scale.ppf *= k;
      }
      S.ppi = img._ppi || 0;
      R.querySelector('.bpe-load').remove(); size(); fit(); ui();
    }).catch(function (err) {
      if (S !== me) return;
      var l = R.querySelector('.bpe-load');
      l.classList.add('err'); l.innerHTML = '<span class="ms">error</span><b>This sheet can\'t be marked up here</b><p>' + esc(err.message || 'It could not be loaded.') + '</p><button type="button" class="bpe-btn" data-act="close">Close</button>';
    });
  };
  function scaleObj(o, k) {
    ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'fs', 'r'].forEach(function (p) { if (typeof o[p] === 'number') o[p] *= k; });
    if (o.pts) o.pts = o.pts.map(function (v) { return v * k; });
  }
  /* for tests and debugging */
  window.bpBpEditorState = function () { return S ? { tool: S.tool, objs: clone(S.objs), dirty: S.dirty, W: S.W, H: S.H, view: clone(S.view), pdf: S.pdfState, scale: S.scale, units: S.units, takeoff: ppf() ? rowsCsv() : null } : null; };
})();
