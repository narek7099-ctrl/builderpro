/* ==================================================================
   Charts, as one system.

   Every chart in the portal is drawn here, so a number means the same
   thing and wears the same colour wherever it appears. Plain inline SVG
   built as a string, because the portal renders views with innerHTML;
   the hover layer is delegated from the document, so a chart works the
   moment it lands in the DOM with nothing to mount or tear down.

   The form follows the job the numbers have to do, not the other way
   round (see the audit in the commit notes):
     trend over time ........ smooth line; area wash when it is one series
     a count per period ..... thin columns (grouped when two series)
     ranked magnitudes ...... horizontal bars, sorted, value at the tip
     part of a whole, <= 5 .. donut, total in the hole, legend with values
     a single % to a target . gauge
     ordered stages ......... funnel (stepped bars, rate against the stage before)
     dated milestones ....... timeline
     one headline number .... stat tile with a sparkline and a delta chip

   The palette is not a taste call. It was run through the data-viz
   validator against this portal's own chart surfaces — the soft blue
   panel (#f6f9ff) in light mode and #121826 in dark — and the
   categorical set passes the lightness band, chroma floor, CVD
   separation and normal-vision floor in both. Two light slots sit under
   3:1, which obliges relief, so every chart carries direct labels and
   a real table. The ordinal ramp (stages, bands, ages) is one blue,
   checked with --ordinal: monotone lightness, visible steps, pale end
   still clearing 2:1.

   Not negotiable, enforced here rather than remembered: one y-axis and
   never two; categorical hues in a fixed order, never cycled; colour
   follows the series, not its rank; 2px lines, 4px rounded bar ends,
   2px gaps; hairline solid grid; a legend whenever there are two or more
   series; text in text colours, never the series colour.
   ================================================================== */
(function () {
  'use strict';
  var C = window.bpChart = {};
  var uid = 0;

  var esc = window.bpEsc || function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  /* The slots, in order. Five, and the sixth folds to Other. */
  C.SLOTS = ['s1', 's2', 's3', 's4', 's5'];
  function slot(i) { return 'var(--bpc-' + (C.SLOTS[i] || 's5') + ')'; }
  /* The ordinal ramp: one blue, light to dark. n ordered steps pick evenly
     across the five validated stops, so three stages are pale / mid / deep
     rather than the three palest. */
  function ord(i, n) {
    if (n <= 1) return 'var(--bpc-o5)';
    var at = Math.round(i * 4 / (n - 1));
    return 'var(--bpc-o' + (Math.min(4, Math.max(0, at)) + 1) + ')';
  }
  C.ord = ord;

  var money = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : '$' + Math.round(+n || 0).toLocaleString(); };
  var plain = function (n) { return (+n || 0).toLocaleString(); };
  C.money = money; C.plain = plain;

  /* An axis tick is a ruler mark, not a figure to quote. */
  function axisFmt(fmt) {
    if (fmt !== money) return fmt;
    return function (n) {
      n = +n || 0;
      var s = n < 0 ? '−' : '', a = Math.abs(n);
      if (a >= 1000000) return s + '$' + (a / 1000000).toFixed(a % 1000000 ? 1 : 0) + 'm';
      if (a >= 1000) return s + '$' + (a / 1000).toFixed(a % 1000 && a < 10000 ? 1 : 0) + 'k';
      return s + '$' + Math.round(a);
    };
  }
  /* a big figure in a tile: 1,284 / 12.9K / $4.2M */
  function compact(n, isMoney) {
    n = +n || 0;
    var s = n < 0 ? '−' : '', a = Math.abs(n), p = isMoney ? '$' : '';
    if (a >= 1e6) return s + p + (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e4) return s + p + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return s + p + Math.round(a).toLocaleString();
  }
  C.compact = compact;

  /* ---------- scales ---------- */
  function niceStep(v) {
    if (!(v > 0)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v))), n = v / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  var niceMax = niceStep;
  var NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  function isNice(step) {
    if (!(step > 0)) return false;
    var mag = Math.pow(10, Math.floor(Math.log10(step))), m = step / mag;
    return NICE.some(function (k) { return Math.abs(m - k) < 1e-9; });
  }
  function ticks(max, prefer) {
    var counts = prefer || [4, 5, 3, 6], n = counts[0];
    for (var c = 0; c < counts.length; c++) {
      if (isNice(max / counts[c])) { n = counts[c]; break; }
    }
    var out = [];
    for (var i = 0; i <= n; i++) out.push(max / n * i);
    return out;
  }
  /* One y-scale. Zero-based unless the data goes negative (then it spans
     zero, and zero is drawn), or the caller fixes the range (a rating). */
  function yScale(series, o) {
    var lo = Infinity, hi = -Infinity;
    series.forEach(function (s) { s.values.forEach(function (v) { v = +v || 0; if (v < lo) lo = v; if (v > hi) hi = v; }); });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (o.yFrom != null || o.yTo != null) {
      var a = o.yFrom != null ? o.yFrom : 0, b = o.yTo != null ? o.yTo : niceMax(hi);
      return { lo: a, hi: b, t: ticks(b - a, (b - a) <= 2 ? [3, 4, 5, 6] : null).map(function (t) { return a + t; }) };
    }
    if (lo >= 0) { var m = niceMax(hi) || 1; return { lo: 0, hi: m, t: ticks(m) }; }
    var st = niceStep((Math.max(hi, 0) - lo) / 4);
    var l = Math.floor(lo / st) * st, h = Math.max(st, Math.ceil(Math.max(hi, 0) / st) * st), out = [];
    for (var v = l; v <= h + st / 2; v += st) out.push(Math.round(v / st) * st);
    return { lo: l, hi: h, t: out };
  }

  /* Monotone cubic (Fritsch–Carlson): a smooth line that never overshoots
     its points, so a curve never invents a peak or a dip below zero that
     is not in the data. */
  function smoothPath(p) {
    var n = p.length;
    if (!n) return '';
    if (n < 3) return p.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ');
    var dx = [], m = [], t = [];
    for (var i = 0; i < n - 1; i++) { dx.push(p[i + 1][0] - p[i][0]); m.push((p[i + 1][1] - p[i][1]) / (dx[i] || 1)); }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = (m[i - 1] * m[i] <= 0) ? 0 : 2 / (1 / m[i - 1] + 1 / m[i]);
    var d = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += ' C' + (p[i][0] + h).toFixed(1) + ' ' + (p[i][1] + t[i] * h).toFixed(1) + ' '
        + (p[i + 1][0] - h).toFixed(1) + ' ' + (p[i + 1][1] - t[i + 1] * h).toFixed(1) + ' '
        + p[i + 1][0].toFixed(1) + ' ' + p[i + 1][1].toFixed(1);
    }
    return d;
  }
  C.smoothPath = smoothPath;

  /* a column: 4px rounded at the data end, square on the baseline */
  function colPath(x, y, w, h) {
    var r = Math.min(4, w / 2, h);
    return 'M' + x.toFixed(1) + ' ' + (y + h).toFixed(1)
      + 'V' + (y + r).toFixed(1) + 'Q' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ' ' + y.toFixed(1)
      + 'H' + (x + w - r).toFixed(1) + 'Q' + (x + w).toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + w).toFixed(1) + ' ' + (y + r).toFixed(1)
      + 'V' + (y + h).toFixed(1) + 'Z';
  }

  /* ---------- the shared frame ---------- */
  function frame(o, plotHtml, legend, table, cls) {
    var id = 'bpc' + (++uid);
    return '<figure class="bpc' + (cls ? ' ' + cls : '') + '" id="' + id + '">'
      + (o.title || o.lead ? '<figcaption class="bpc-cap">'
        + (o.title ? '<span class="bpc-t">' + esc(o.title) + '</span>' : '')
        + (o.lead ? '<span class="bpc-lead">' + esc(o.lead) + '</span>' : '')
        + '</figcaption>' : '')
      + (legend || '')
      + '<div class="bpc-plot">' + plotHtml + '<div class="bpc-tip" hidden></div></div>'
      + (table ? '<details class="bpc-tbl"><summary>See the numbers</summary>' + table + '</details>' : '')
      + '</figure>';
  }
  /* the key mirrors the mark: a short line for lines, a swatch for bars */
  function legendOf(series, kind) {
    if (series.length < 2) return '';
    return '<div class="bpc-legend">' + series.map(function (s, i) {
      return '<span class="bpc-key' + (kind === 'line' ? ' ln' : '') + '"><i style="background:' + slot(i) + '"></i>' + esc(s.name) + '</span>';
    }).join('') + '</div>';
  }
  function tableOf(x, series, fmt) {
    return '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(x.label || '') + '</th>'
      + series.map(function (s) { return '<th>' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + x.values.map(function (lbl, i) {
        return '<tr><th scope="row">' + esc(lbl) + '</th>'
          + series.map(function (s) { return '<td>' + fmt(s.values[i]) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function rowsTable(o, rows, fmt, extra) {
    var total = rows.reduce(function (t, r) { return t + (+r.value || 0); }, 0) || 1;
    return '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(o.axis || 'Item') + '</th><th>'
      + esc(o.valueHead || 'Amount') + '</th>' + (extra === false ? '' : '<th>Share</th>') + '</tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r.label) + '</th><td>' + esc(fmt(r.value)) + '</td>'
          + (extra === false ? '' : '<td>' + Math.round(r.value / total * 100) + '%</td>') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------- drawn at the width it is actually given ----------
     The viewBox is the plot's real width in pixels, so type and corners
     are the size they were designed at in a full panel and a half one.
     W0 is only the first pass; the chart is redrawn at its true width the
     moment it is in the DOM, and whenever that width changes. */
  var W0 = 720;
  function heightFor(o, W) {
    var base = o.height || 210;
    return Math.round(Math.min(base * 1.3, Math.max(base, W / 3.4)));
  }
  function svgOpen(o, W, H) {
    return '<svg viewBox="0 0 ' + Math.round(W) + ' ' + H + '" style="height:' + H + 'px"'
      + ' role="img" aria-label="' + esc(o.title || 'chart') + '" preserveAspectRatio="xMidYMid meet">';
  }

  function plotted(o, kind, svg, legend, table, cls) {
    var spec = escAttr(JSON.stringify({
      k: kind, h: o.height || 210, t: o.title || '', xl: (o.x || {}).label || '',
      x: (o.x || {}).values || [], s: (o.series || []).map(function (s) { return { n: s.name, v: s.values }; }),
      f: (o.fmt || money) === money ? 'money' : 'plain',
      fk: o.fmtKind || '',
      p: o.points || null, r: o.rows || null, it: o.items || null, td: o.today || null,
      xn: o.xName || '', yn: o.yName || '', an: o.aName || '', bn: o.bName || '',
      xf: (o.xFmt || plain) === money ? 'money' : 'plain',
      yfk: o.yFmtKind || '', y0: o.yFrom, y1: o.yTo, mx: o.max,
      ar: o.area === false ? 0 : 1, nt: o.notes || null, gc: o.groupCaps || null, od: o.ordinal ? 1 : 0, cl: o.capLabels === false ? 0 : 1,
    }));
    return frame(o, svg, legend, table, cls)
      .replace('<div class="bpc-plot">', '<div class="bpc-plot" data-chart="' + spec + '">');
  }
  function specOf(plot) {
    var d = plot.getAttribute('data-chart'); if (!d) return null;
    try { return JSON.parse(d); } catch (e) { return null; }
  }
  var RATING = function (n) { return (Math.round(n * 10) / 10).toFixed(1) + '★'; };
  var PERCENT = function (n) { return (Math.round(n * 10) / 10) + '%'; };
  var COUNT = function (n) { return String(Math.round(+n || 0)); };
  var NAMED = C.NAMED = { rating: RATING, percent: PERCENT, count: COUNT };
  function fmtOf(k) { return k === 'money' ? money : plain; }
  function optsOf(d) {
    return {
      title: d.t, height: d.h, fmt: NAMED[d.fk] || fmtOf(d.f), fmtKind: d.fk,
      x: { label: d.xl, values: d.x },
      series: d.s.map(function (s) { return { name: s.n, values: s.v }; }),
      points: d.p, rows: d.r, items: d.it, today: d.td,
      xName: d.xn, yName: d.yn, aName: d.an, bName: d.bn,
      xFmt: fmtOf(d.xf), yFmt: NAMED[d.yfk] || fmtOf(d.f),
      yFrom: d.y0, yTo: d.y1, max: d.mx,
      area: d.ar !== 0, ordinal: !!d.od, notes: d.nt, groupCaps: d.gc, capLabels: d.cl !== 0,
    };
  }
  var DRAW = { line: lineSvg, cols: colsSvg, scatter: scatterSvg, dumbbell: dumbbellSvg, timeline: timelineSvg };
  function redraw(plot) {
    var w = Math.round(plot.clientWidth);
    if (!(w > 40)) return;
    if (+plot.getAttribute('data-w') === w) return;
    var d = specOf(plot); if (!d) return;
    var svg = (DRAW[d.k] || lineSvg)(optsOf(d), w);
    var old = plot.querySelector('svg');
    if (old) old.outerHTML = svg; else plot.insertAdjacentHTML('afterbegin', svg);
    plot.setAttribute('data-w', w);
  }
  C.redraw = redraw;

  var ro = window.ResizeObserver ? new ResizeObserver(function (es) {
    es.forEach(function (e) { redraw(e.target); });
  }) : null;
  function watch(root) {
    (root.querySelectorAll ? root.querySelectorAll('.bpc-plot[data-chart]') : []).forEach(function (plot) {
      redraw(plot);
      if (ro && !plot.__bpcRo) { plot.__bpcRo = 1; ro.observe(plot); }
    });
  }
  if (window.MutationObserver) {
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var added = ms[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) watch(added[j]);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { watch(document); });
  else watch(document);

  function gridAndAxis(sc, py, P, W, af) {
    return sc.t.map(function (t) {
      var y = py(t).toFixed(1);
      return '<line class="bpc-grid' + (t === 0 && sc.lo < 0 ? ' bpc-zero' : '') + '" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>'
        + '<text class="bpc-ax" x="' + (P.l - 8) + '" y="' + (+y + 4) + '" text-anchor="end">' + esc(af(t)) + '</text>';
    }).join('');
  }
  function gutterFor(sc, af) {
    var w = 0;
    sc.t.forEach(function (t) { w = Math.max(w, String(af(t)).length); });
    return Math.max(34, Math.min(64, w * 6.6 + 14));
  }

  /* ==================================================================
     LINE / AREA — change over time. Smooth, 2px, a dot on every point
     when there are few enough to count, and a soft gradient wash under a
     lone series. Two washes overlapping read as a third colour, so a
     multi-series chart is lines only.
     ================================================================== */
  function lineSvg(o, W) {
    var x = o.x || { values: [] }, series = o.series || [], fmt = o.fmt || money;
    var n = x.values.length, sc = yScale(series, o), af = axisFmt(fmt);
    var H = heightFor(o, W), P = { t: 18, r: 16, b: 26, l: gutterFor(sc, af) };
    var iw = Math.max(24, W - P.l - P.r), ih = H - P.t - P.b;
    /* inset the first and last point half a step, so the end dots and
       their labels are not sitting on the frame */
    var inset = n > 1 ? Math.min(18, iw / (n - 1) / 2) : 0;
    var px = function (i) { return P.l + inset + (n === 1 ? (iw - 2 * inset) / 2 : (iw - 2 * inset) * i / (n - 1)); };
    var py = function (v) { return P.t + ih - ih * (((+v || 0) - sc.lo) / ((sc.hi - sc.lo) || 1)); };
    var base = py(Math.max(sc.lo, Math.min(sc.hi, 0)));

    var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 58))));
    var xlab = x.values.map(function (lbl, i) {
      if (i % step && i !== n - 1) return '';
      return '<text class="bpc-ax" x="' + px(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lbl) + '</text>';
    }).join('');

    var gid = 'bpcg' + (++uid), dots = n <= 14;
    var defs = '';
    var paths = series.map(function (s, si) {
      var pts = s.values.map(function (v, i) { return [px(i), py(v)]; });
      var d = smoothPath(pts), out = '';
      if (series.length === 1 && o.area !== false) {
        defs = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">'
          + '<stop offset="0" stop-color="' + slot(si) + '" stop-opacity=".22"/>'
          + '<stop offset="1" stop-color="' + slot(si) + '" stop-opacity="0"/></linearGradient></defs>';
        out += '<path class="bpc-area" d="' + d + ' L' + px(n - 1).toFixed(1) + ' ' + base.toFixed(1) + ' L' + px(0).toFixed(1) + ' ' + base.toFixed(1) + ' Z" fill="url(#' + gid + ')"/>';
      }
      out += '<path class="bpc-line" d="' + d + '" stroke="' + slot(si) + '"/>';
      pts.forEach(function (p, i) {
        if (!dots && i !== n - 1) return;
        out += '<circle class="bpc-end" data-i="' + i + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="' + slot(si) + '"/>';
      });
      return out;
    }).join('');

    /* the current value, written at the end of a lone line — the one number
       the reader came for; the axis and the tooltip carry the rest */
    var endLab = '';
    if (series.length === 1 && n) {
      var lv = series[0].values[n - 1], ly = py(lv);
      var ty = ly - 12 < P.t + 2 ? ly + 20 : ly - 12;
      endLab = '<text class="bpc-endlab" x="' + (px(n - 1) - 2).toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="end">' + esc(fmt(lv)) + '</text>';
    }

    var hw = n > 1 ? (iw - 2 * inset) / (n - 1) : iw;
    var hot = x.values.map(function (lbl, i) {
      return '<rect class="bpc-hit" data-i="' + i + '" x="' + (px(i) - hw / 2).toFixed(1) + '" y="' + P.t
        + '" width="' + hw.toFixed(1) + '" height="' + ih + '"/>';
    }).join('');

    return svgOpen(o, W, H) + defs
      + gridAndAxis(sc, py, P, W, af) + xlab
      + '<line class="bpc-cross" x1="0" x2="0" y1="' + P.t + '" y2="' + (P.t + ih) + '" hidden/>'
      + paths + endLab
      + hot + '</svg>';
  }
  C.line = function (o) {
    var x = o.x || { values: [] }, series = o.series || [];
    if (!x.values.length || !series.length) return empty(o);
    return plotted(o, 'line', lineSvg(o, W0), legendOf(series, 'line'), tableOf(x, series, o.fmt || money));
  };
  C.area = function (o) { o.area = true; return C.line(o); };

  /* ==================================================================
     COLUMNS — a countable thing per bucket. Thin (<= 24px), 4px rounded
     at the data end, square on the baseline, 2px of surface between the
     bars of a group. A lone series with few enough columns carries its
     value on the cap; an ordered set of buckets (ages, score bands) can
     take the ordinal ramp so the order is in the colour too.
     ================================================================== */
  function colsSvg(o, W) {
    var x = o.x || { values: [] }, series = o.series || [], fmt = o.fmt || plain;
    var n = x.values.length, sc = yScale(series, o), af = axisFmt(fmt);
    var caps = series.length === 1 && n <= 8 && o.capLabels !== false;
    /* a grouped chart may carry one figure per group (a job's profit), set
       above the taller bar in ink, never in a series colour */
    var gcaps = series.length > 1 && o.groupCaps && n <= 10;
    var H = heightFor(o, W), P = { t: caps || gcaps ? 22 : 14, r: 14, b: 26, l: gutterFor(sc, af) };
    var iw = Math.max(24, W - P.l - P.r), ih = H - P.t - P.b;
    var band = iw / n;
    var bw = Math.max(3, Math.min(24, (band * 0.62 - 2 * (series.length - 1)) / series.length));
    var grpW = bw * series.length + 2 * (series.length - 1), pad = (band - grpW) / 2;
    var py = function (v) { return P.t + ih - ih * (((+v || 0) - sc.lo) / ((sc.hi - sc.lo) || 1)); };
    var y0 = py(0);

    var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
    var bars = '', xlab = '', hits = '';
    x.values.forEach(function (lbl, i) {
      var x0 = P.l + band * i + pad;
      series.forEach(function (s, si) {
        var v = Math.max(0, +s.values[i] || 0), y = py(v), h = y0 - y;
        var fill = o.ordinal && series.length === 1 ? ord(i, n) : slot(si);
        if (h > 0.5) bars += '<path class="bpc-bar" data-i="' + i + '" d="' + colPath(x0 + (bw + 2) * si, y, bw, h) + '" fill="' + fill + '"/>';
        if (caps && v > 0) bars += '<text class="bpc-cap-v" x="' + (x0 + bw / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle">' + esc(axisFmt(fmt)(v)) + '</text>';
      });
      if (gcaps && o.groupCaps[i] != null && o.groupCaps[i] !== '') {
        var top = Math.max.apply(null, series.map(function (s) { return Math.max(0, +s.values[i] || 0); }));
        bars += '<text class="bpc-cap-v" x="' + (x0 + grpW / 2).toFixed(1) + '" y="' + (py(top) - 6).toFixed(1) + '" text-anchor="middle">' + esc(o.groupCaps[i]) + '</text>';
      }
      if (!(i % step) || i === n - 1) {
        var t = String(lbl);
        var maxCh = Math.max(4, Math.floor(band * step / 6.4));
        if (t.length > maxCh) t = t.slice(0, maxCh - 1) + '…';
        xlab += '<text class="bpc-ax" x="' + (P.l + band * i + band / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(t) + '</text>';
      }
      hits += '<rect class="bpc-hit" data-i="' + i + '" x="' + (P.l + band * i).toFixed(1) + '" y="' + P.t + '" width="' + band.toFixed(1) + '" height="' + ih + '"/>';
    });

    return svgOpen(o, W, H)
      + gridAndAxis(sc, py, P, W, af) + xlab
      + '<line class="bpc-grid bpc-base" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '"/>'
      + bars + hits + '</svg>';
  }
  C.columns = function (o) {
    var x = o.x || { values: [] }, series = o.series || [];
    if (!x.values.length || !series.length) return empty(o);
    return plotted(o, 'cols', colsSvg(o, W0), legendOf(series), tableOf(x, series, o.fmt || plain));
  };

  /* ==================================================================
     RANKED BARS — how magnitudes compare. Horizontal, because the labels
     are words. Sorted, one hue (colour following rank would repaint a row
     the day it overtakes another). A fixed scale (1 to 5 stars) keeps its
     own order and may carry its own ramp.
     ================================================================== */
  C.ranked = function (o) {
    var rows = (o.rows || []).map(function (r, i) { return { label: r.label, value: +r.value || 0, mine: r.mine, other: r.other, k: i, color: r.color }; });
    if (!o.fixed) rows.sort(function (a, b) { return b.value - a.value; });
    var fmt = o.fmt || money;
    if (!rows.length) return empty(o);
    var cap = o.max || 8;
    if (!o.fixed && rows.length > cap) {
      var rest = rows.slice(cap - 1).reduce(function (t, r) { return t + r.value; }, 0);
      rows = rows.slice(0, cap - 1).concat([{ label: 'Everything else', value: rest, other: true }]);
    }
    var top = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([0])) || 1;
    var total = rows.reduce(function (t, r) { return t + r.value; }, 0) || 1;
    var body = rows.map(function (r, i) {
      var pct = Math.round(r.value / total * 100);
      var fill = r.color || (o.ramp ? o.ramp[Math.min(r.k, o.ramp.length - 1)] : r.other ? 'var(--bpc-other)' : r.mine ? 'var(--bpc-s2)' : o.ordinal ? ord(i, rows.length) : (o.hues ? slot(i) : 'var(--bpc-s1)'));
      return '<div class="bpc-row' + (r.mine ? ' mine' : '') + '" tabindex="0" data-tip="' + escAttr('<b>' + esc(fmt(r.value)) + '</b><span>' + esc(r.label) + '<em>' + pct + '% of the total</em></span>') + '">'
        + '<span class="bpc-rl">' + esc(r.label) + '</span>'
        + '<span class="bpc-rt">' + (r.value > 0 ? '<i style="width:' + Math.max(1.5, r.value / top * 100) + '%;background:' + fill + '"></i>' : '') + '</span>'
        + '<span class="bpc-rv">' + esc(fmt(r.value)) + '</span></div>';
    }).join('');
    return frame(o, '<div class="bpc-rows">' + body + '</div>', '', rowsTable(o, rows, fmt));
  };

  /* ==================================================================
     FUNNEL — ordered stages where each is a subset of the one before.
     Stepped bars on one baseline, the ordinal blue deepening toward the
     end, and the rate against the stage before written on every step:
     that rate, not the raw count, is what tells you where to work.
     ================================================================== */
  C.funnel = function (o) {
    var steps = (o.steps || []).map(function (s) { return { label: s.label, value: +s.value || 0 }; });
    if (!steps.length || !(steps[0].value > 0)) return empty(o);
    var fmt = o.fmt || plain, top = steps[0].value;
    var body = steps.map(function (s, i) {
      var prev = i ? steps[i - 1].value : 0;
      var rate = i ? (prev ? Math.round(s.value / prev * 100) + '%' : '—') : '';
      var w = Math.max(1.5, s.value / top * 100);
      return '<div class="bpc-row bpc-frow" tabindex="0" data-tip="' + escAttr('<b>' + esc(fmt(s.value)) + '</b><span>' + esc(s.label) + (i ? '<em>' + rate + ' of ' + esc(steps[i - 1].label.toLowerCase()) + '</em>' : '') + '</span>') + '">'
        + '<span class="bpc-rl">' + esc(s.label) + '</span>'
        + '<span class="bpc-rt"><i style="width:' + w + '%;background:' + ord(i, steps.length) + '"></i></span>'
        + '<span class="bpc-rv">' + esc(fmt(s.value)) + (i ? '<small>' + rate + '</small>' : '<small>&nbsp;</small>') + '</span></div>';
    }).join('');
    var table = '<div class="bpc-tblwrap"><table><thead><tr><th>Stage</th><th>Count</th><th>Of the stage before</th></tr></thead><tbody>'
      + steps.map(function (s, i) {
        return '<tr><th scope="row">' + esc(s.label) + '</th><td>' + esc(fmt(s.value)) + '</td><td>'
          + (i ? (steps[i - 1].value ? Math.round(s.value / steps[i - 1].value * 100) + '%' : '—') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return frame(o, '<div class="bpc-rows bpc-funnel">' + body + '</div>', '', table);
  };

  /* ==================================================================
     SCATTER — two measures per thing. Emphasis: the reader's own mark in
     the accent hue, larger and named; the rest are context in gray.
     ================================================================== */
  function scatterSvg(o, W) {
    var pts = o.points || [];
    var H = Math.round(Math.min(320, Math.max(220, W * 0.46))), P = { t: 16, r: 18, b: 34, l: 56 };
    var iw = W - P.l - P.r, ih = H - P.t - P.b;
    var xs = pts.map(function (p) { return +p.x || 0; }), ys = pts.map(function (p) { return +p.y || 0; });
    var xMax = niceMax(Math.max.apply(null, xs.concat([1])));
    var yLo = o.yFrom != null ? o.yFrom : 0, yHi = o.yTo != null ? o.yTo : niceMax(Math.max.apply(null, ys.concat([1])));
    var px = function (v) { return P.l + iw * (Math.max(0, +v || 0) / (xMax || 1)); };
    var py = function (v) { return P.t + ih - ih * ((Math.min(yHi, Math.max(yLo, +v || 0)) - yLo) / ((yHi - yLo) || 1)); };
    var xf = axisFmt(o.xFmt || plain), yf = o.yFmt || plain;
    var grid = ticks(yHi - yLo, (yHi - yLo) <= 2 ? [3, 4, 5, 6] : null).map(function (t) {
      var v = yLo + t, y = py(v);
      return '<line class="bpc-grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>'
        + '<text class="bpc-ax" x="' + (P.l - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + esc(yf(v)) + '</text>';
    }).join('');
    var xt = ticks(xMax), xlab = xt.map(function (t, i) {
      if (!i) return '';
      return '<text class="bpc-ax" x="' + px(t).toFixed(1) + '" y="' + (H - 16) + '" text-anchor="middle">' + esc(xf(t)) + '</text>';
    }).join('');
    var marks = pts.map(function (p) {
      var cx = px(p.x), cy = py(p.y), r = p.mine ? 7 : 5;
      var tip = escAttr('<b>' + esc(p.label) + '</b><span>' + esc(o.xName || 'x') + '<em>' + esc(xf(p.x)) + '</em></span>'
        + '<span>' + esc(o.yName || 'y') + '<em>' + esc(yf(p.y)) + '</em></span>');
      return { dot: '<circle class="bpc-dot' + (p.mine ? ' mine' : '') + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1)
          + '" r="' + r + '" fill="' + (p.mine ? 'var(--bpc-s1)' : 'var(--bpc-other)') + '"/>',
        hit: '<circle class="bpc-hit" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="14" data-tip="' + tip + '"/>' };
    });
    var mine = pts.filter(function (p) { return p.mine; })[0];
    var tag = '';
    if (mine) {
      var mx = px(mine.x), right = mx < W - P.r - 120;
      tag = '<text class="bpc-dotlab" x="' + (right ? mx + 12 : mx - 12).toFixed(1) + '" y="' + (py(mine.y) + 4).toFixed(1) + '" text-anchor="' + (right ? 'start' : 'end') + '">'
        + esc(mine.label) + '</text>';
    }
    return svgOpen(o, W, H) + grid + xlab
      + '<line class="bpc-grid bpc-base" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + (P.t + ih) + '" y2="' + (P.t + ih) + '"/>'
      + '<text class="bpc-ax bpc-axname" x="' + (P.l + iw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">'
      + esc(o.xName || '') + '</text>'
      + marks.map(function (m) { return m.dot; }).join('') + tag
      + marks.map(function (m) { return m.hit; }).join('') + '</svg>';
  }
  C.scatter = function (o) {
    if (!(o.points || []).length) return empty(o);
    var xf = o.xFmt || plain, yf = o.yFmt || plain;
    var table = '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(o.axis || 'Item') + '</th><th>'
      + esc(o.xName || 'x') + '</th><th>' + esc(o.yName || 'y') + '</th></tr></thead><tbody>'
      + o.points.map(function (p) {
        return '<tr><th scope="row">' + esc(p.label) + '</th><td>' + esc(xf(p.x)) + '</td><td>' + esc(yf(p.y)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return plotted(o, 'scatter', scatterSvg(o, W0), '', table);
  };

  /* ==================================================================
     DUMBBELL — two related numbers per row, the distance between them
     being the point (what a job cost against what it brought in).
     ================================================================== */
  function dumbbellSvg(o, W) {
    var rows = (o.rows || []).slice(0, o.max || 7);
    var lw = Math.min(170, Math.max(84, Math.round(W * 0.24)));
    var P = { t: 10, r: 70, b: 26, l: lw + 14 };
    var H = P.t + P.b + rows.length * 32;
    var iw = W - P.l - P.r;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return Math.max(+r.a || 0, +r.b || 0); }).concat([1])));
    var px = function (v) { return P.l + iw * (Math.max(0, +v || 0) / max); };
    var fmt = o.fmt || money, af = axisFmt(fmt);
    var tk = ticks(max, iw < 260 ? [2, 4, 3] : null);
    var grid = tk.map(function (t) {
      var x = px(t);
      return '<line class="bpc-grid" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + P.t + '" y2="' + (H - P.b) + '"/>'
        + '<text class="bpc-ax" x="' + x.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(af(t)) + '</text>';
    }).join('');
    var maxCh = Math.floor(lw / 6.6);
    var body = rows.map(function (r, i) {
      var y = P.t + 16 + i * 32, xa = px(r.a), xb = px(r.b), gap = (+r.b || 0) - (+r.a || 0);
      var name = String(r.label || '');
      if (name.length > maxCh) name = name.slice(0, maxCh - 1) + '…';
      return '<text class="bpc-ax bpc-dbl" x="' + lw + '" y="' + (y + 4) + '" text-anchor="end">' + esc(name) + '</text>'
        + '<line class="bpc-dbar" x1="' + Math.min(xa, xb).toFixed(1) + '" x2="' + Math.max(xa, xb).toFixed(1) + '" y1="' + y + '" y2="' + y + '"/>'
        + '<circle class="bpc-dend" cx="' + xa.toFixed(1) + '" cy="' + y + '" r="5" fill="var(--bpc-o2)"/>'
        + '<circle class="bpc-dend" cx="' + xb.toFixed(1) + '" cy="' + y + '" r="5" fill="var(--bpc-s1)"/>'
        + '<text class="bpc-dgap" x="' + (W - P.r + 10) + '" y="' + (y + 4) + '">'
        + (gap < 0 ? '−' : '+') + esc(axisFmt(fmt)(Math.abs(gap))) + '</text>'
        + '<rect class="bpc-hit" x="' + P.l + '" y="' + (y - 15) + '" width="' + iw.toFixed(1) + '" height="30"'
        + ' data-tip="' + escAttr('<b>' + esc(r.label) + '</b><span>' + esc(o.aName || 'a') + '<em>' + esc(fmt(r.a)) + '</em></span>'
          + '<span>' + esc(o.bName || 'b') + '<em>' + esc(fmt(r.b)) + '</em></span>'
          + '<span>Difference<em>' + (gap < 0 ? '−' : '+') + esc(fmt(Math.abs(gap))) + '</em></span>') + '"/>';
    }).join('');
    return svgOpen(o, W, H) + grid + body + '</svg>';
  }
  C.dumbbell = function (o) {
    var rows = (o.rows || []);
    if (!rows.length) return empty(o);
    var legend = '<div class="bpc-legend"><span class="bpc-key dot"><i style="background:var(--bpc-o2)"></i>'
      + esc(o.aName || '') + '</span><span class="bpc-key dot"><i style="background:var(--bpc-s1)"></i>' + esc(o.bName || '') + '</span></div>';
    var fmt = o.fmt || money;
    var table = '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(o.axis || 'Item') + '</th><th>'
      + esc(o.aName || 'a') + '</th><th>' + esc(o.bName || 'b') + '</th><th>Difference</th></tr></thead><tbody>'
      + rows.map(function (r) {
        var g = (+r.b || 0) - (+r.a || 0);
        return '<tr><th scope="row">' + esc(r.label) + '</th><td>' + fmt(r.a) + '</td><td>' + fmt(r.b) + '</td><td>'
          + (g < 0 ? '−' : '') + fmt(Math.abs(g)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return plotted(o, 'dumbbell', dumbbellSvg(o, W0), legend, table);
  };

  /* ==================================================================
     DONUT — a total and the few parts it is made of. The total lives in
     the hole; the legend beside it carries every value, so no slice has
     to be judged by angle alone. Earned only by 3 to 5 parts: two is a
     stat, and six or more is a ranked bar chart — the donut hands itself
     over to one rather than growing a tail of slivers.
     ================================================================== */
  function arc(cx, cy, rO, rI, a0, a1) {
    var p = function (r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    var big = (a1 - a0) > Math.PI ? 1 : 0;
    var o0 = p(rO, a0), o1 = p(rO, a1), i1 = p(rI, a1), i0 = p(rI, a0);
    return 'M' + o0[0].toFixed(2) + ' ' + o0[1].toFixed(2)
      + 'A' + rO + ' ' + rO + ' 0 ' + big + ' 1 ' + o1[0].toFixed(2) + ' ' + o1[1].toFixed(2)
      + 'L' + i1[0].toFixed(2) + ' ' + i1[1].toFixed(2)
      + 'A' + rI + ' ' + rI + ' 0 ' + big + ' 0 ' + i0[0].toFixed(2) + ' ' + i0[1].toFixed(2) + 'Z';
  }
  C.donut = function (o) {
    var rows = (o.rows || []).map(function (r, i) {
      return { label: r.label, value: +r.value || 0, other: r.other, k: i };
    }).filter(function (r) { return r.value > 0; });
    var fmt = o.fmt || money;
    if (!rows.length) return empty(o);
    /* past five parts, or under three, bars say it better */
    if (rows.length > 5 || (rows.length < 3 && !o.fixed)) {
      var r2 = {}; for (var k in o) r2[k] = o[k];
      r2.rows = o.rows; r2.lead = [o.lead, o.centre ? o.centre + ' ' + (o.centreNote || 'in total') : ''].filter(Boolean).join(' · ');
      return C.ranked(r2);
    }
    if (!o.fixed) rows = rows.sort(function (a, b) { return b.value - a.value; });
    var total = rows.reduce(function (t, r) { return t + r.value; }, 0) || 1;
    /* colour follows the name (alphabetical slot), not the size; a fixed,
       ordered set takes the ordinal ramp or its own */
    var ordNames = rows.map(function (r) { return r.label; }).sort();
    var nAll = (o.rows || []).length;
    var hue = function (r) {
      if (o.ramp) return o.ramp[Math.min(r.k, o.ramp.length - 1)];
      if (o.ordinal) return ord(r.k, nAll);
      return r.other ? 'var(--bpc-other)' : slot(ordNames.indexOf(r.label));
    };
    var S = 200, c = S / 2, rO = 94, rI = 68, GAP = 0.035;
    var a = -Math.PI / 2, paths = '', list = '';
    rows.forEach(function (r, i) {
      var frac = r.value / total, sweep = frac * Math.PI * 2, pct = Math.round(frac * 100);
      var hub = '<b>' + esc(fmt(r.value)) + '</b><span>' + esc(r.label) + ' · ' + pct + '%</span>';
      var tip = '<b>' + esc(fmt(r.value)) + '</b><span>' + esc(r.label) + '<em>' + pct + '%</em></span>';
      var g = rows.length > 1 ? Math.min(GAP, sweep / 3) : 0;
      var d = rows.length === 1 ? arc(c, c, rO, rI, a, a + Math.PI * 1.9999) : arc(c, c, rO, rI, a + g / 2, a + sweep - g / 2);
      paths += '<path class="bpc-slice" data-k="' + i + '" d="' + d
        + '" fill="' + hue(r) + '" data-hub="' + escAttr(hub) + '" data-tip="' + escAttr(tip) + '"></path>';
      list += '<div class="bpc-drow2" data-k="' + i + '" data-hub="' + escAttr(hub) + '">'
        + '<i style="background:' + hue(r) + '"></i>'
        + '<span class="bpc-dname">' + esc(r.label) + '</span>'
        + '<b>' + esc(fmt(r.value)) + '</b><em>' + pct + '%</em></div>';
      a += sweep;
    });
    var hub0 = '<b>' + esc(o.centre || fmt(total)) + '</b><span>' + esc(o.centreNote || 'in total') + '</span>';
    var plot = '<div class="bpc-donut" data-hub0="' + escAttr(hub0) + '">'
      + '<div class="bpc-ring"><svg viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="' + esc(o.title || 'chart') + '">'
      + '<circle class="bpc-ringbg" cx="' + c + '" cy="' + c + '" r="' + ((rO + rI) / 2) + '" stroke-width="' + (rO - rI) + '"/>'
      + paths + '</svg><div class="bpc-hub">' + hub0 + '</div></div>'
      + '<div class="bpc-dlist">' + list + '</div></div>';
    return frame(o, plot, '', rowsTable(o, rows, fmt));
  };
  function hubTo(el, html) {
    var wrap = el.closest ? el.closest('.bpc-donut') : null; if (!wrap) return;
    var hub = wrap.querySelector('.bpc-hub'); if (!hub) return;
    hub.innerHTML = html || wrap.getAttribute('data-hub0') || '';
  }
  document.addEventListener('pointerover', function (e) {
    var t = e.target.closest ? e.target.closest('.bpc-slice, .bpc-drow2') : null;
    if (!t) return;
    hubTo(t, t.getAttribute('data-hub'));
    var wrap = t.closest('.bpc-donut'), k = t.getAttribute('data-k');
    if (wrap) wrap.querySelectorAll('[data-k]').forEach(function (n) { n.classList.toggle('on', n.getAttribute('data-k') === k); });
  });
  document.addEventListener('pointerout', function (e) {
    var t = e.target.closest ? e.target.closest('.bpc-slice, .bpc-drow2') : null;
    if (!t) return;
    var wrap = t.closest('.bpc-donut'); if (!wrap) return;
    if (e.relatedTarget && wrap.contains(e.relatedTarget) && e.relatedTarget.closest('.bpc-slice, .bpc-drow2')) return;
    hubTo(t, '');
    wrap.querySelectorAll('[data-k]').forEach(function (n) { n.classList.remove('on'); });
  });

  /* ==================================================================
     DIVERGING — how far each row sits either side of a baseline.
     ================================================================== */
  C.diverging = function (o) {
    var rows = (o.rows || []).slice().sort(function (a, b) { return a.value - b.value; });
    if (!rows.length) return empty(o);
    var fmt = o.fmt || function (n) { return (Math.round(n * 10) / 10) + '%'; };
    var span = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); }).concat([1]));
    var body = rows.map(function (r) {
      var v = +r.value || 0, w = Math.abs(v) / span * 50;
      var good = o.lowIsGood === false ? v > 0 : v < 0;
      return '<div class="bpc-row bpc-drow" tabindex="0" data-tip="' + escAttr('<b>' + esc(fmt(Math.abs(v))) + '</b><span>' + esc(r.label) + '<em>'
        + esc(v < 0 ? o.underWord || 'under' : v > 0 ? o.overWord || 'over' : 'level') + '</em></span>') + '">'
        + '<span class="bpc-rl">' + esc(r.label) + '</span>'
        + '<span class="bpc-dt"><b class="bpc-axis0"></b><i class="' + (v < 0 ? 'l' : 'r') + '" style="' + (v < 0 ? 'right:50%' : 'left:50%')
        + ';width:' + Math.max(0.6, w).toFixed(2) + '%;background:' + (good ? 'var(--bpc-pos2)' : 'var(--bpc-neg2)') + '"></i></span>'
        + '<span class="bpc-rv">' + (v === 0 ? '—' : (v < 0 ? '−' : '+') + fmt(Math.abs(v))) + '</span></div>';
    }).join('');
    var table = '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(o.axis || 'Item') + '</th><th>Difference</th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r.label) + '</th><td>' + (r.value < 0 ? '−' : r.value > 0 ? '+' : '') + fmt(Math.abs(r.value)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return frame(o, '<div class="bpc-rows">' + body + '</div>'
      + '<div class="bpc-dfoot"><span>' + esc(o.leftWord || 'under') + '</span><span>' + esc(o.rightWord || 'over') + '</span></div>', '', table);
  };

  /* ==================================================================
     PROGRESS — one of several items measured against its own target
     (each project against its price). A thin track in a paler step of
     the same blue, so the whole bar reads as one thing.
     ================================================================== */
  C.progress = function (o) {
    var done = +o.value || 0, goal = +o.target || 0;
    var pct = goal > 0 ? Math.min(100, Math.round(done / goal * 100)) : 0;
    var fmt = o.fmt || money;
    return '<figure class="bpc bpc-prog">'
      + '<figcaption class="bpc-cap"><span class="bpc-t">' + esc(o.title || '') + '</span>'
      + '<span class="bpc-lead">' + esc(fmt(done)) + ' of ' + esc(fmt(goal)) + '</span></figcaption>'
      + '<div class="bpc-plot"><div class="bpc-ptrack bpc-row" data-tip="' + escAttr('<b>' + pct + '%</b><span>' + esc(fmt(done)) + ' of ' + esc(fmt(goal)) + '</span>') + '">'
      + '<i style="width:' + pct + '%;background:' + (o.tone === 'warn' ? 'var(--bpc-warn)' : 'var(--bpc-s1)') + '"></i></div><div class="bpc-tip" hidden></div></div>'
      + '<div class="bpc-pfoot"><span>' + pct + '%</span><span>' + esc(o.note || '') + '</span></div>'
      + '</figure>';
  };

  /* ==================================================================
     GAUGE — the one ratio a panel is about, against its target. A half
     ring: the track is a pale step of the same blue, the fill the full
     blue (or the warning tone when the ratio is the bad kind of low), and
     the percentage sits in the middle as the figure.
     ================================================================== */
  C.gauge = function (o) {
    var done = +o.value || 0, goal = +o.target || 0;
    var frac = goal > 0 ? Math.max(0, Math.min(1, done / goal)) : 0, pct = Math.round(frac * 100);
    var fmt = o.fmt || money;
    var W = 220, H = 136, cx = 110, cy = 110, r = 92, sw = 14;
    var pt = function (f) { var a = Math.PI * (1 - f); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    var p0 = pt(0), p1 = pt(1), pf = pt(frac);
    var track = 'M' + p0[0] + ' ' + p0[1] + ' A' + r + ' ' + r + ' 0 0 1 ' + p1[0] + ' ' + p1[1];
    var fill = frac > 0.001 ? 'M' + p0[0] + ' ' + p0[1] + ' A' + r + ' ' + r + ' 0 0 1 ' + pf[0].toFixed(2) + ' ' + pf[1].toFixed(2) : '';
    var tip = escAttr('<b>' + pct + '%</b><span>' + esc(fmt(done)) + ' of ' + esc(fmt(goal)) + '</span>');
    var svg = '<svg class="bpc-gsvg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc((o.title || '') + ': ' + pct + '%') + '">'
      + '<path class="bpc-gtrack" d="' + track + '" stroke-width="' + sw + '"/>'
      + (fill ? '<path class="bpc-gfill' + (o.tone === 'warn' ? ' warn' : '') + '" d="' + fill + '" stroke-width="' + sw + '"/>' : '')
      + '<path class="bpc-hit" d="' + track + '" stroke="transparent" stroke-width="34" fill="none" data-tip="' + tip + '"/>'
      + '<text class="bpc-gv" x="' + cx + '" y="' + (cy - 14) + '" text-anchor="middle">' + pct + '%</text>'
      + '<text class="bpc-ax" x="' + (p0[0]) + '" y="' + (H - 1) + '" text-anchor="middle">0</text>'
      + '<text class="bpc-ax" x="' + (p1[0]) + '" y="' + (H - 1) + '" text-anchor="middle">100</text>'
      + '</svg>';
    var body = '<div class="bpc-gauge">' + svg
      + '<div class="bpc-gside"><div class="bpc-gnum">' + esc(fmt(done)) + '<small> of ' + esc(fmt(goal)) + '</small></div>'
      + (o.note ? '<div class="bpc-gnote">' + esc(o.note) + '</div>' : '') + '</div></div>';
    return frame(o, body, '', '', 'bpc-g');
  };

  /* ==================================================================
     SPARKLINE — the trend behind one figure. No axes; a soft area under a
     smooth 2px line and the current point marked. Drawn in a fixed box
     stretched to the tile, so the dot is a zero-length round-capped
     stroke: it stays a circle however far the box is stretched.
     ================================================================== */
  C.spark = function (vals, o) {
    o = o || {};
    vals = (vals || []).map(function (v) { return +v || 0; });
    if (vals.length < 2) return '';
    var W = 200, H = 48, pad = 6;
    var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals.concat([0]));
    var pts = vals.map(function (v, i) { return [pad + i * (W - 2 * pad) / (vals.length - 1), H - pad - (v - mn) / ((mx - mn) || 1) * (H - pad * 2)]; });
    var d = smoothPath(pts), last = pts[pts.length - 1], gid = 'bpcs' + (++uid);
    var tone = o.tone === 'neg' ? 'var(--bpc-neg2)' : 'var(--bpc-s1)';
    var fmt = o.fmt || plain, labels = o.labels || [];
    var hits = vals.map(function (v, i) {
      var w = W / (vals.length - 1);
      return '<rect class="bpc-hit" x="' + Math.max(0, i * w - w / 2).toFixed(1) + '" y="0" width="' + w.toFixed(1) + '" height="' + H
        + '" data-tip="' + escAttr('<b>' + esc(fmt(v)) + '</b><span>' + esc(labels[i] || '') + '</span>') + '"/>';
    }).join('');
    return '<div class="bpc-plot bpc-sparkwrap"><svg class="bpc-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
      + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + tone + '" stop-opacity=".24"/>'
      + '<stop offset="1" stop-color="' + tone + '" stop-opacity="0"/></linearGradient></defs>'
      + '<path d="' + d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="url(#' + gid + ')"/>'
      + '<path class="bpc-sl" d="' + d + '" stroke="' + tone + '"/>'
      + '<path class="bpc-sdot-r" d="M' + last[0].toFixed(1) + ' ' + last[1].toFixed(1) + 'h0"/>'
      + '<path class="bpc-sdot" d="M' + last[0].toFixed(1) + ' ' + last[1].toFixed(1) + 'h0" stroke="' + tone + '"/>'
      + hits + '</svg><div class="bpc-tip" hidden></div></div>';
  };
  /* the delta chip: signed, against a named period, coloured by whether
     that direction is good — and it says which way with an arrow, so the
     colour is never carrying it alone */
  C.delta = function (prev, cur, o) {
    o = o || {};
    prev = +prev || 0; cur = +cur || 0;
    if (!prev) return '';
    var p = Math.round((cur - prev) / Math.abs(prev) * 100);
    var up = p >= 0, good = o.upIsGood === false ? !up : up;
    return '<span class="bpc-delta ' + (p === 0 ? 'flat' : good ? 'good' : 'bad') + '" title="against ' + esc(o.vs || 'last month') + '">'
      + (p === 0 ? '' : up ? '&#9650; ' : '&#9660; ') + Math.abs(p) + '%</span>';
  };

  /* ==================================================================
     TIMELINE — dated milestones along one horizontal line, today marked.
     Done ones are filled, the ones still ahead are rings, a late one
     wears the warning tone and says so in its tooltip. Labels alternate
     above and below and drop to the tooltip when they would collide.
     ================================================================== */
  function dayOf(s) { var t = Date.parse(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(t) ? null : t; }
  function timelineSvg(o, W) {
    var items = (o.items || []).filter(function (it) { return dayOf(it.date) != null; });
    var H = 118, P = { l: 16, r: 16 }, y = 60;
    var ts = items.map(function (it) { return dayOf(it.date); });
    var today = dayOf(o.today || new Date().toISOString().slice(0, 10));
    var t0 = Math.min.apply(null, ts.concat(o.start ? [dayOf(o.start)] : [])), t1 = Math.max.apply(null, ts);
    if (!(t1 > t0)) t1 = t0 + 864e5;
    var iw = W - P.l - P.r;
    var px = function (t) { return P.l + iw * ((t - t0) / (t1 - t0)); };
    var tx = Math.max(P.l, Math.min(W - P.r, px(today)));
    var doneTo = items.reduce(function (m, it, i) { return it.done ? Math.max(m, px(ts[i])) : m; }, P.l);
    var out = '<line class="bpc-tlline" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>'
      + (doneTo > P.l ? '<line class="bpc-tldone" x1="' + P.l + '" x2="' + doneTo.toFixed(1) + '" y1="' + y + '" y2="' + y + '"/>' : '');
    if (today >= t0 && today <= t1) {
      out += '<line class="bpc-tltoday" x1="' + tx.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y1="' + (y - 14) + '" y2="' + (y + 14) + '"/>';
    }
    var lastEnd = [-1e9, -1e9], fmtD = function (t) { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
    var labs = '', dots = '', hits = '';
    items.forEach(function (it, i) {
      var x = px(ts[i]), row = i % 2, maxCh = 18;
      var name = String(it.label || '');
      var short = name.length > maxCh ? name.slice(0, maxCh - 1) + '…' : name;
      var w = Math.max(short.length * 6.4, 44);
      var anchor = x - w / 2 < 2 ? 'start' : x + w / 2 > W - 2 ? 'end' : 'middle';
      var left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      if (left > lastEnd[row] + 8) {
        lastEnd[row] = left + w;
        var ly = row ? y + 30 : y - 26;
        labs += '<text class="bpc-tlname" x="' + x.toFixed(1) + '" y="' + ly + '" text-anchor="' + anchor + '">' + esc(short) + '</text>'
          + '<text class="bpc-ax" x="' + x.toFixed(1) + '" y="' + (ly + 14) + '" text-anchor="' + anchor + '">' + esc(fmtD(ts[i])) + '</text>';
      }
      var cls = it.done ? 'done' : it.late ? 'late' : 'todo';
      dots += '<circle class="bpc-tldot ' + cls + '" cx="' + x.toFixed(1) + '" cy="' + y + '" r="5"/>';
      hits += '<circle class="bpc-hit" cx="' + x.toFixed(1) + '" cy="' + y + '" r="13" data-tip="'
        + escAttr('<b>' + esc(name) + '</b><span>' + esc(it.done ? 'Done' : it.late ? 'Late — was due' : 'Due') + '<em>' + esc(fmtD(ts[i])) + '</em></span>') + '"/>';
    });
    return '<svg viewBox="0 0 ' + Math.round(W) + ' ' + H + '" style="height:' + H + 'px" role="img" aria-label="' + esc(o.title || 'timeline') + '">'
      + out + labs + dots + hits + '</svg>';
  }
  C.timeline = function (o) {
    var items = o.items || [];
    if (!items.length) return empty(o);
    var legend = '<div class="bpc-legend"><span class="bpc-key dot"><i class="tl-done"></i>Done</span>'
      + '<span class="bpc-key dot"><i class="tl-todo"></i>Coming up</span>'
      + (items.some(function (it) { return it.late && !it.done; }) ? '<span class="bpc-key dot"><i class="tl-late"></i>Late</span>' : '')
      + '<span class="bpc-key ln"><i class="tl-today"></i>Today</span></div>';
    var table = '<div class="bpc-tblwrap"><table><thead><tr><th>Milestone</th><th>Date</th><th>State</th></tr></thead><tbody>'
      + items.map(function (it) {
        return '<tr><th scope="row">' + esc(it.label) + '</th><td>' + esc(it.date) + '</td><td>' + (it.done ? 'Done' : it.late ? 'Late' : 'Coming up') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return plotted(o, 'timeline', timelineSvg(o, W0), legend, table);
  };

  /* A chart with nothing in it says what would fill it. */
  function empty(o) {
    return '<figure class="bpc bpc-empty">'
      + (o.title ? '<figcaption class="bpc-cap"><span class="bpc-t">' + esc(o.title) + '</span></figcaption>' : '')
      + '<div class="bpc-none">' + esc(o.empty || 'Nothing to chart yet.') + '</div></figure>';
  }
  C.empty = empty;

  /* ---------- the hover layer ----------
     Delegated once from the document. On a time series the crosshair
     finds the X and the tooltip lists every series there; on bars, rows,
     slices and dots the mark is the target and carries its own words. */
  function clearHover(plot) {
    var c = plot.querySelector('.bpc-cross'); if (c) c.setAttribute('hidden', '');
    plot.classList.remove('hov');
    plot.querySelectorAll('.on[data-i]').forEach(function (n) { n.classList.remove('on'); });
  }
  function showTip(plot, tip, html, cx, cy) {
    tip.innerHTML = html;
    tip.hidden = false;
    var pr = plot.getBoundingClientRect();
    var tx = cx - pr.left, ty = cy - pr.top;
    tip.style.left = Math.max(4, Math.min(pr.width - tip.offsetWidth - 4, tx - tip.offsetWidth / 2)) + 'px';
    var top = ty - tip.offsetHeight - 12;
    tip.style.top = (top < -8 ? ty + 18 : top) + 'px';
  }
  function hover(e) {
    var plot = e.target.closest ? e.target.closest('.bpc-plot') : null;
    if (!plot) return;
    var tip = plot.querySelector(':scope > .bpc-tip');
    var hit = e.target.closest('.bpc-hit, .bpc-row, .bpc-slice');
    if (!hit || !tip) { if (tip) tip.hidden = true; clearHover(plot); return; }
    var html;
    if (hit.getAttribute('data-tip')) {
      html = hit.getAttribute('data-tip');
      var c0 = plot.querySelector('.bpc-cross'); if (c0) c0.setAttribute('hidden', '');
    } else {
      var d = specOf(plot); if (!d) return;
      var i = +hit.getAttribute('data-i'), f = NAMED[d.fk] || fmtOf(d.f), line = d.k === 'line';
      html = '<b class="x">' + esc(d.x[i]) + '</b>' + d.s.map(function (s, si) {
        return '<span><i class="' + (line ? 'ln' : 'sw') + '" style="background:' + slot(si) + '"></i>' + esc(s.n) + '<em>' + esc(f(s.v[i])) + '</em></span>';
      }).join('') + (d.nt && d.nt[i] ? '<span class="note">' + esc(d.nt[i]) + '</span>' : '');
      var cross = plot.querySelector('.bpc-cross');
      if (cross) {
        var cx = +hit.getAttribute('x') + (+hit.getAttribute('width')) / 2;
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.removeAttribute('hidden');
      }
      plot.classList.add('hov');
      plot.querySelectorAll('[data-i]').forEach(function (n) {
        if (n.classList.contains('bpc-hit')) return;
        n.classList.toggle('on', n.getAttribute('data-i') === String(i));
      });
    }
    var r = e.clientX != null ? { x: e.clientX, y: e.clientY } : (function () { var b = hit.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top }; })();
    showTip(plot, tip, html, r.x, r.y);
  }
  document.addEventListener('pointermove', hover, { passive: true });
  document.addEventListener('focusin', function (e) {
    if (e.target.classList && e.target.classList.contains('bpc-row')) hover({ target: e.target });
  });
  document.addEventListener('focusout', function (e) {
    var plot = e.target.closest && e.target.closest('.bpc-plot'); if (!plot) return;
    var tip = plot.querySelector(':scope > .bpc-tip'); if (tip) tip.hidden = true;
  });
  document.addEventListener('pointerleave', function (e) {
    var plot = e.target.closest ? e.target.closest('.bpc-plot') : null;
    if (!plot || e.target !== plot) return;
    var tip = plot.querySelector(':scope > .bpc-tip'); if (tip) tip.hidden = true;
    clearHover(plot);
  }, true);

  /* ---------- helpers the views use ---------- */
  /* sum rows into caller-made buckets [{label, start, end}] (end exclusive) */
  C.byBuckets = function (rows, buckets, getWhen, getAmt) {
    var out = buckets.map(function () { return 0; });
    (rows || []).forEach(function (r) {
      var w = +getWhen(r); if (!w) return;
      for (var i = 0; i < buckets.length; i++) if (w >= buckets[i].start && w < buckets[i].end) { out[i] += (+getAmt(r) || 0); break; }
    });
    return { labels: buckets.map(function (b) { return b.label; }), values: out };
  };
  C.byMonth = function (rows, n, getWhen, getAmt) {
    n = n || 6;
    var now = new Date(), keys = [], labels = [], idx = {};
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var k = d.getFullYear() + '-' + d.getMonth();
      idx[k] = keys.length; keys.push(k);
      labels.push(d.toLocaleDateString('en-US', { month: 'short' }));
    }
    var out = keys.map(function () { return 0; });
    (rows || []).forEach(function (r) {
      var w = getWhen(r); if (!w) return;
      var t = new Date(w); if (isNaN(t)) return;
      var k = t.getFullYear() + '-' + t.getMonth();
      if (idx[k] != null) out[idx[k]] += (+getAmt(r) || 0);
    });
    return { labels: labels, values: out };
  };
})();
