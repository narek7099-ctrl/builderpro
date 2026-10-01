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
    ['text', 'title', 'Text', 'T'], ['note', 'sticky_note_2', 'Sticky note', 'N'], ['measure', 'straighten', 'Measure', 'M'],
    ['eraser', 'ink_eraser', 'Eraser', 'E']
  ];
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
      var lbl = o.label || '';
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
    if (o.t === 'pen') { var xs = [], ys = []; for (var i = 0; i < o.pts.length; i += 2) { xs.push(o.pts[i]); ys.push(o.pts[i + 1]); } return { x: Math.min.apply(0, xs), y: Math.min.apply(0, ys), w: Math.max.apply(0, xs) - Math.min.apply(0, xs), h: Math.max.apply(0, ys) - Math.min.apply(0, ys) }; }
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
    S.objs.forEach(function (o, i) { if (S.editing && S.editing.o === o && o.t !== 'measure') return; drawObj(ctx, o, unit()); });
    if (S.temp) drawObj(ctx, S.temp, unit());
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
  function setDirty() { S.dirty = true; ui(); }
  function undo() { if (!S.hist.length) return; commitEdit(); S.fut.push(JSON.stringify(S.objs)); S.objs = JSON.parse(S.hist.pop()); S.sel = -1; S.dirty = true; ui(); render(); }
  function redo() { if (!S.fut.length) return; commitEdit(); S.hist.push(JSON.stringify(S.objs)); S.objs = JSON.parse(S.fut.pop()); S.sel = -1; S.dirty = true; ui(); render(); }

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
    if (tool === 'text') { snap(); var t = { id: rid('o'), t: 'text', x: p.x, y: p.y, text: '', c: c, fs: fontPx() }; S.objs.push(t); S.sel = S.objs.length - 1; editText(t, true); return; }
    if (tool === 'note') {
      snap(); var u = unit(), nw = 200 * u, nh = 150 * u;
      var n = { id: rid('o'), t: 'note', x: Math.min(p.x, S.W - nw), y: Math.min(p.y, S.H - nh), w: nw, h: nh, text: '', c: c };
      S.objs.push(n); S.sel = S.objs.length - 1; editText(n, true); return;
    }
    if (tool === 'pen') S.temp = { id: rid('o'), t: 'pen', pts: [r1(p.x), r1(p.y)], c: c, w: w };
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
        var x2 = p.x, y2 = p.y;
        if (e.shiftKey && (t.t === 'line' || t.t === 'arrow' || t.t === 'measure')) { var ang = Math.round(Math.atan2(y2 - t.y1, x2 - t.x1) / (Math.PI / 4)) * Math.PI / 4, len = dist(t.x1, t.y1, x2, y2); x2 = t.x1 + Math.cos(ang) * len; y2 = t.y1 + Math.sin(ang) * len; }
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
        if (o.t === 'pen') o.pts = B.pts.map(function (v, i) { return r1(v + (i % 2 ? dy : dx)); });
        else if (o.t === 'text' || o.t === 'note') { o.x = B.x + dx; o.y = B.y + dy; }
        else { o.x1 = B.x1 + dx; o.y1 = B.y1 + dy; o.x2 = B.x2 + dx; o.y2 = B.y2 + dy; }
      } else if (d.h === 'se') { var mn = 60 * unit() * 0.6; o.w = Math.max(mn, B.w + dx); o.h = Math.max(mn * 0.7, B.h + dy); }
      else if (d.h === 1) { o.x1 = B.x1 + dx; o.y1 = B.y1 + dy; }
      else { o.x2 = B.x2 + dx; o.y2 = B.y2 + dy; }
      render(); return;
    }
  }
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
      if (!small) {
        snap(); S.objs.push(t);
        if (t.t === 'measure') { S.sel = S.objs.length - 1; editText(t, true); }
      }
      render(); ui();
    }
  }
  function hover(e) {
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
  }
  function status(t, bad) { var el = S && S.root.querySelector('.bpe-status'); if (!el) return; el.textContent = t; el.classList.toggle('bad', !!bad); clearTimeout(S.stT); if (t && !bad) S.stT = setTimeout(function () { if (el) el.textContent = ''; }, 3500); }

  function shell(name) {
    var tools = TOOLS.map(function (t) { return '<button type="button" class="bpe-tool" data-tool="' + t[0] + '" title="' + t[2] + ' (' + t[3] + ')" aria-label="' + t[2] + '"><span class="ms">' + t[1] + '</span><span class="bpe-tl">' + t[2].split(' ')[0] + '</span></button>'; }).join('');
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
      + '<div class="bpe-load"><span class="bpe-spin"></span>Loading the drawing…</div>'
      + '<div class="bpe-hint">Drag to draw · double-tap text, a note or a measurement to edit · pinch or scroll to zoom</div></div>'
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
  }

  /* ------------------------------------------------------- save & export --- */
  function save() {
    commitEdit();
    var j = S.job; j.blueprintMarks = j.blueprintMarks || {};
    j.blueprintMarks[S.bp.id] = { v: 1, w: S.W, h: S.H, objs: clone(S.objs), at: Date.now() };
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
    S.objs.forEach(function (o) { drawObj(x, o, unit()); });
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
        return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () { return c; });
      });
    });
  }

  /* -------------------------------------------------------- open / close --- */
  function keydown(e) {
    if (!S) return;
    var inText = e.target === S.ta;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (inText) { commitEdit(true); return; }
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
  function setTool(t) { commitEdit(); S.tool = t; if (t !== 'select') S.sel = -1; ui(); render(); }
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
      view: { s: 1, tx: 0, ty: 0 }, fitS: 1, bg: null, dirty: false, pdfState: hasJsPDF() ? 'ready' : 'loading', lastFocus: document.activeElement };
    S.ctx = S.cv.getContext('2d');
    R.addEventListener('click', function (e) {
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
      }
      R.querySelector('.bpe-load').remove(); size(); fit(); ui();
    }).catch(function (err) {
      if (S !== me) return;
      var l = R.querySelector('.bpe-load');
      l.classList.add('err'); l.innerHTML = '<span class="ms">error</span><b>This sheet can\'t be marked up here</b><p>' + esc(err.message || 'It could not be loaded.') + '</p><button type="button" class="bpe-btn" data-act="close">Close</button>';
    });
  };
  function scaleObj(o, k) {
    ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'fs'].forEach(function (p) { if (typeof o[p] === 'number') o[p] *= k; });
    if (o.pts) o.pts = o.pts.map(function (v) { return v * k; });
  }
  /* for tests and debugging */
  window.bpBpEditorState = function () { return S ? { tool: S.tool, objs: clone(S.objs), dirty: S.dirty, W: S.W, H: S.H, view: clone(S.view), pdf: S.pdfState } : null; };
})();
