/* ==================================================================
   Charts, as one system.

   Every chart in the portal is drawn here, so a number means the same
   thing and wears the same colour wherever it appears. Plain inline SVG
   built as a string, because the portal renders views with innerHTML;
   the hover layer is delegated from the document, so a chart works the
   moment it lands in the DOM with nothing to mount or tear down.

   The palette is not a taste call. It was run through the data-viz
   validator against this portal's own surfaces — white in light mode,
   #121826 in dark — and passes the lightness band, chroma floor, CVD
   separation and normal-vision floor in both. Two light-mode slots sit
   under 3:1 against white, which the method says obliges relief, so
   every chart carries direct labels and a real table underneath it.

   Rules that are not negotiable and are enforced here rather than
   remembered: one y-axis and never two, categorical hues assigned in a
   fixed order and never cycled, colour that follows the series rather
   than its rank, thin marks over a recessive grid, a legend whenever
   there is more than one series, and text in text colours rather than
   the series colour.
   ================================================================== */
(function () {
  'use strict';
  var C = window.bpChart = {};
  var uid = 0;

  var esc = window.bpEsc || function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  /* The slots, in order. A fifth series is a design smell long before it
     is a colour problem, so there are five and the sixth folds to Other. */
  C.SLOTS = ['s1', 's2', 's3', 's4', 's5'];
  function slot(i) { return 'var(--bpc-' + (C.SLOTS[i] || 's5') + ')'; }

  var money = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : '$' + Math.round(+n || 0).toLocaleString(); };
  var plain = function (n) { return (+n || 0).toLocaleString(); };
  C.money = money; C.plain = plain;

  /* An axis tick is a ruler mark, not a figure to quote: cents on it are
     noise, and "$21,000.00" is wide enough to get clipped by the gutter.
     Tooltips and the table keep the full number. */
  function axisFmt(fmt) {
    if (fmt !== money) return fmt;
    return function (n) {
      n = +n || 0;
      if (n >= 1000000) return '$' + (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'm';
      if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 && n < 10000 ? 1 : 0) + 'k';
      return '$' + Math.round(n);
    };
  }

  /* ---------- scales ----------
     One axis. Ticks land on round numbers so the reader can do mental
     arithmetic against the gridlines instead of decoding them. */
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v))), n = v / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  /* Four gridlines is the default, but four into some maxima gives $1.3k as a
     ruler mark, which nobody reads off. So try a few counts and take the first
     whose step lands on a number a person would have chosen themselves. */
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

  /* ---------- the shared frame ----------
     Title, the one-line read, the plot, a legend when it is earned, and
     the table. Everything below just fills the plot. */
  function frame(o, plotSvg, legend, table) {
    var id = 'bpc' + (++uid);
    return '<figure class="bpc" id="' + id + '">'
      + (o.title || o.lead ? '<figcaption class="bpc-cap">'
        + (o.title ? '<span class="bpc-t">' + esc(o.title) + '</span>' : '')
        + (o.lead ? '<span class="bpc-lead">' + esc(o.lead) + '</span>' : '')
        + '</figcaption>' : '')
      + (legend || '')
      + '<div class="bpc-plot">' + plotSvg + '<div class="bpc-tip" hidden></div></div>'
      + (table ? '<details class="bpc-tbl"><summary>See the numbers</summary>' + table + '</details>' : '')
      + '</figure>';
  }
  function legendOf(series) {
    if (series.length < 2) return '';                 /* the title names a lone series */
    return '<div class="bpc-legend">' + series.map(function (s, i) {
      return '<span class="bpc-key"><i style="background:' + slot(i) + '"></i>' + esc(s.name) + '</span>';
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

  /* ---------- drawn at the width it is actually given ----------
     An SVG scaled from a fixed grid to whatever width the panel happens to
     be does not scale its type with it: the same axis label came out 18.7px
     wide in a full panel and 8.8px in a half one, stretched in one place and
     squashed in the other, and the bar corners and gutters went with it. So
     the drawing takes a width and the viewBox is that width in real pixels —
     one unit is one pixel, in both directions, everywhere.

     W0 is only what the string is built at before it has been measured. The
     moment the chart is in the DOM it is redrawn at its true width, and
     again whenever that width changes. */
  var W0 = 720;

  /* A six-month line stretched across 1090px and held at 200 tall is a 5:1
     letterbox — the trend flattens into a straight line and the chart stops
     saying anything. So a wide plot is allowed to grow a little taller, to a
     ceiling, instead of either staying flat or scaling up without limit. */
  function heightFor(o, W) {
    var base = o.height || 210;
    return Math.round(Math.min(base * 1.35, Math.max(base, W / 3.4)));
  }

  function svgOpen(o, W, H) {
    return '<svg viewBox="0 0 ' + Math.round(W) + ' ' + H + '" style="height:' + H + 'px"'
      + ' role="img" aria-label="' + esc(o.title || 'chart') + '" preserveAspectRatio="xMidYMid meet">';
  }

  /* Everything the redraw needs, parked on the plot: the same blob the
     tooltip already reads, so there is one description of a chart, not two. */
  function plotted(o, kind, svg, legend, table) {
    var spec = escAttr(JSON.stringify({
      k: kind, h: o.height || 210, t: o.title || '', xl: (o.x || {}).label || '',
      x: (o.x || {}).values || [], s: (o.series || []).map(function (s) { return { n: s.name, v: s.values }; }),
      f: (o.fmt || money) === money ? 'money' : 'plain',
      /* A formatter is a function and a spec is JSON, so a chart drawn with
         one of its own — stars, percentages — would come back from a redraw
         formatted as a bare number. Named kinds survive the round trip. */
      fk: o.fmtKind || '',
      /* the forms that are not a time series carry their own shape */
      p: o.points || null, r: o.rows || null,
      xn: o.xName || '', yn: o.yName || '', an: o.aName || '', bn: o.bName || '',
      xf: (o.xFmt || plain) === money ? 'money' : 'plain',
      yfk: o.yFmtKind || '', y0: o.yFrom, y1: o.yTo, mx: o.max,
    }));
    return frame(o, svg, legend, table)
      .replace('<div class="bpc-plot">', '<div class="bpc-plot" data-chart="' + spec + '">');
  }
  function specOf(plot) {
    var d = plot.getAttribute('data-chart'); if (!d) return null;
    try { return JSON.parse(d); } catch (e) { return null; }
  }
  /* a spec is not a chart options object, so turn it back into one */
  var RATING = function (n) { return (Math.round(n * 10) / 10).toFixed(1) + '\u2605'; };
  var PERCENT = function (n) { return (Math.round(n * 10) / 10) + '%'; };
  var NAMED = C.NAMED = { rating: RATING, percent: PERCENT };
  function optsOf(d) {
    return {
      title: d.t, height: d.h, fmt: NAMED[d.fk] || fmtOf(d.f), fmtKind: d.fk,
      x: { label: d.xl, values: d.x },
      series: d.s.map(function (s) { return { name: s.n, values: s.v }; }),
      points: d.p, rows: d.r,
      xName: d.xn, yName: d.yn, aName: d.an, bName: d.bn,
      xFmt: fmtOf(d.xf), yFmt: NAMED[d.yfk] || fmtOf(d.f),
      yFrom: d.y0, yTo: d.y1, max: d.mx,
    };
  }
  var DRAW = { line: lineSvg, cols: colsSvg, scatter: scatterSvg, dumbbell: dumbbellSvg };
  function redraw(plot) {
    var w = Math.round(plot.clientWidth);
    /* a pane that is hidden has no width to draw at; the observer brings it
       back the moment it is shown */
    if (!(w > 40)) return;
    if (+plot.getAttribute('data-w') === w) return;
    var d = specOf(plot); if (!d) return;
    var o = optsOf(d);
    var svg = (DRAW[d.k] || lineSvg)(o, w);
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
  /* Views render with innerHTML, so nothing calls us when a chart lands.
     Watching the document catches every one of them without every caller
     having to remember to mount it. */
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

  /* ==================================================================
     LINE — change over time. Area fill only when there is one series,
     because two overlapping washes read as a third colour.
     ================================================================== */
  function lineSvg(o, W) {
    var x = o.x || { values: [] }, series = o.series || [], fmt = o.fmt || money;
    var H = heightFor(o, W), P = { t: 14, r: 14, b: 26, l: 52 };
    var n = x.values.length;

    var raw = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (+v > raw) raw = +v; }); });
    var max = niceMax(raw) || 1;
    var iw = W - P.l - P.r, ih = H - P.t - P.b;
    var px = function (i) { return P.l + (n === 1 ? iw / 2 : iw * i / (n - 1)); };
    var py = function (v) { return P.t + ih - ih * (Math.max(0, +v || 0) / max); };

    var af = axisFmt(fmt);
    var grid = ticks(max).map(function (t) {
      var y = py(t);
      return '<line class="bpc-grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>'
        + '<text class="bpc-ax" x="' + (P.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + af(t) + '</text>';
    }).join('');

    /* labels are thinned to whatever the real width can hold, so a narrow
       card drops some rather than overlapping them */
    var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 58))));
    var xlab = x.values.map(function (lbl, i) {
      if (i % step && i !== n - 1) return '';
      return '<text class="bpc-ax" x="' + px(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lbl) + '</text>';
    }).join('');

    var paths = series.map(function (s, si) {
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1); }).join(' ');
      var area = series.length === 1
        ? '<path class="bpc-area" d="' + d + ' L' + px(n - 1).toFixed(1) + ' ' + (P.t + ih) + ' L' + px(0).toFixed(1) + ' ' + (P.t + ih) + ' Z" fill="' + slot(si) + '"/>'
        : '';
      /* the last point is marked: the current value is the one a reader is
         actually looking for */
      var last = s.values[n - 1];
      return area
        + '<path class="bpc-line" d="' + d + '" stroke="' + slot(si) + '"/>'
        + '<circle class="bpc-end" cx="' + px(n - 1).toFixed(1) + '" cy="' + py(last).toFixed(1) + '" r="4.5" fill="' + slot(si) + '"/>';
    }).join('');

    var hw = n > 1 ? iw / (n - 1) : iw;
    var hot = x.values.map(function (lbl, i) {
      return '<rect class="bpc-hit" data-i="' + i + '" x="' + (px(i) - hw / 2).toFixed(1) + '" y="' + P.t
        + '" width="' + hw.toFixed(1) + '" height="' + ih + '"/>';
    }).join('');

    return svgOpen(o, W, H)
      + grid + xlab
      + '<line class="bpc-grid bpc-base" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + (P.t + ih) + '" y2="' + (P.t + ih) + '"/>'
      + paths
      + '<line class="bpc-cross" x1="0" x2="0" y1="' + P.t + '" y2="' + (P.t + ih) + '" hidden/>'
      + hot + '</svg>';
  }
  C.line = function (o) {
    var x = o.x || { values: [] }, series = o.series || [];
    if (!x.values.length || !series.length) return empty(o);
    return plotted(o, 'line', lineSvg(o, W0), legendOf(series), tableOf(x, series, o.fmt || money));
  };

  /* ==================================================================
     COLUMNS — a countable thing per period. Bars, not a line, when the
     periods are discrete buckets rather than a continuous reading.
     ================================================================== */
  function colsSvg(o, W) {
    var x = o.x || { values: [] }, series = o.series || [], fmt = o.fmt || plain;
    var H = heightFor(o, W), P = { t: 14, r: 14, b: 26, l: 52 };
    var n = x.values.length;

    var raw = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (+v > raw) raw = +v; }); });
    var max = niceMax(raw) || 1;
    var iw = W - P.l - P.r, ih = H - P.t - P.b;
    /* Thin marks. Left to itself a single series over six months draws
       54px slabs, which is a lot of ink for one number — so the bar has a
       ceiling and the group sits centred in its band rather than stretched
       across it. */
    var band = iw / n, gap = Math.min(18, band * 0.28);
    var bw = Math.min((band - gap) / series.length, series.length > 1 ? 26 : 34);
    var grpW = bw * series.length, pad = (band - grpW) / 2;
    var py = function (v) { return P.t + ih - ih * (Math.max(0, +v || 0) / max); };

    var af = axisFmt(fmt);
    var grid = ticks(max).map(function (t) {
      var y = py(t);
      return '<line class="bpc-grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>'
        + '<text class="bpc-ax" x="' + (P.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + af(t) + '</text>';
    }).join('');

    /* how many labels the real width can hold without them touching */
    var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 72))));
    var bars = '', xlab = '';
    x.values.forEach(function (lbl, i) {
      var x0 = P.l + band * i + pad;
      series.forEach(function (s, si) {
        var v = Math.max(0, +s.values[i] || 0), y = py(v), h = P.t + ih - y;
        /* a rounded top on a bar anchored to the baseline; zero draws
           nothing rather than a stub that reads as a small value */
        if (h > 0.5) {
          bars += '<rect class="bpc-bar" x="' + (x0 + bw * si).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1)
            + '" height="' + h.toFixed(1) + '" rx="' + Math.min(4, bw / 2).toFixed(1) + '" fill="' + slot(si) + '"/>';
        }
      });
      if (!(i % step) || i === n - 1) {
        xlab += '<text class="bpc-ax" x="' + (P.l + band * i + band / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lbl) + '</text>';
      }
      bars += '<rect class="bpc-hit" data-i="' + i + '" x="' + (P.l + band * i).toFixed(1) + '" y="' + P.t + '" width="' + band.toFixed(1) + '" height="' + ih + '"/>';
    });

    return svgOpen(o, W, H)
      + grid + xlab
      + '<line class="bpc-grid bpc-base" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + (P.t + ih) + '" y2="' + (P.t + ih) + '"/>'
      + bars + '</svg>';
  }
  C.columns = function (o) {
    var x = o.x || { values: [] }, series = o.series || [];
    if (!x.values.length || !series.length) return empty(o);
    return plotted(o, 'cols', colsSvg(o, W0), legendOf(series), tableOf(x, series, o.fmt || plain));
  };

  /* ==================================================================
     RANKED BARS — how one total splits. Horizontal, because the labels
     are words and a word reads along a row rather than rotated under a
     column. Never a pie: angle is the hardest thing to compare.
     ================================================================== */
  /* One hue by default. A ranked chart sorts by value, so a per-bar hue would
     be colour following rank rather than the thing it names — the row above
     you turns green the moment it overtakes you. The label and the value are
     already written on every row, so the hue was never carrying identity.
     Pass hues:true only where the bars are a fixed set that never re-sorts. */
  C.ranked = function (o) {
    var rows = (o.rows || []).slice().sort(function (a, b) { return b.value - a.value; });
    var fmt = o.fmt || money;
    if (!rows.length) return empty(o);
    var cap = o.max || 8;
    if (rows.length > cap) {
      var rest = rows.slice(cap - 1).reduce(function (t, r) { return t + r.value; }, 0);
      rows = rows.slice(0, cap - 1).concat([{ label: 'Everything else', value: rest, other: true }]);
    }
    var top = rows[0].value || 1, total = rows.reduce(function (t, r) { return t + r.value; }, 0) || 1;
    var body = rows.map(function (r, i) {
      var pct = Math.round(r.value / total * 100);
      /* one row can be marked as the reader's own — it wears the second hue
         AND says so in its label, so the mark is never colour alone */
      return '<div class="bpc-row' + (r.mine ? ' mine' : '') + '" data-tip="' + escAttr(esc(r.label) + ' · ' + fmt(r.value) + ' · ' + pct + '% of the total') + '">'
        + '<span class="bpc-rl">' + esc(r.label) + '</span>'
        + '<span class="bpc-rt"><i style="width:' + Math.max(1.5, r.value / top * 100) + '%;background:'
        + (r.other ? 'var(--bpc-other)' : r.mine ? 'var(--bpc-s2)' : (o.hues ? slot(i) : 'var(--bpc-s1)')) + '"></i></span>'
        + '<span class="bpc-rv">' + fmt(r.value) + '</span></div>';
    }).join('');
    var table = '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(o.axis || 'Item') + '</th><th>Amount</th><th>Share</th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r.label) + '</th><td>' + fmt(r.value) + '</td><td>' + Math.round(r.value / total * 100) + '%</td></tr>';
      }).join('') + '</tbody></table></div>';
    return frame(o, '<div class="bpc-rows">' + body + '</div>', '', table);
  };

  /* ==================================================================
     SCATTER — two measures per thing, plotted against each other. This is
     the form that answers "who is actually ahead", which two separate bar
     charts cannot: a 4.9 on nine reviews and a 4.3 on four hundred sit in
     different places here and in the same place on a ranked list.

     Emphasis rather than categorical: one mark is the reader's own, in the
     accent hue and labelled; the rest are context in gray. Colour is never
     doing the work alone — the reader's mark is also larger and named.
     ================================================================== */
  function scatterSvg(o, W) {
    var pts = o.points || [];
    var H = Math.round(Math.min(320, Math.max(220, W * 0.46))), P = { t: 16, r: 18, b: 34, l: 56 };
    var iw = W - P.l - P.r, ih = H - P.t - P.b;
    var xs = pts.map(function (p) { return +p.x || 0; }), ys = pts.map(function (p) { return +p.y || 0; });
    var xMax = niceMax(Math.max.apply(null, xs.concat([1])));
    /* a rating axis that starts at zero wastes four fifths of the plot, so a
       y range that never reaches its floor is allowed to start above it —
       and the axis says so rather than leaving the reader to assume zero */
    var yLo = o.yFrom != null ? o.yFrom : 0, yHi = o.yTo != null ? o.yTo : niceMax(Math.max.apply(null, ys.concat([1])));
    var px = function (v) { return P.l + iw * (Math.max(0, +v || 0) / (xMax || 1)); };
    var py = function (v) { return P.t + ih - ih * ((Math.min(yHi, Math.max(yLo, +v || 0)) - yLo) / ((yHi - yLo) || 1)); };
    var xf = axisFmt(o.xFmt || plain), yf = o.yFmt || plain;

    /* a rating spans a star and a half; five steps of 0.3 is a stranger
       ruler than three of 0.5 */
    var grid = ticks(yHi - yLo, (yHi - yLo) <= 2 ? [3, 4, 5, 6] : null).map(function (t) {
      var v = yLo + t, y = py(v);
      return '<line class="bpc-grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>'
        + '<text class="bpc-ax" x="' + (P.l - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + esc(yf(v)) + '</text>';
    }).join('');
    var xt = ticks(xMax), xlab = xt.map(function (t, i) {
      if (!i) return '';
      return '<text class="bpc-ax" x="' + px(t).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(xf(t)) + '</text>';
    }).join('');

    var marks = pts.map(function (p) {
      var cx = px(p.x), cy = py(p.y), r = p.mine ? 8 : 6;
      var tip = escAttr('<b>' + esc(p.label) + '</b><span>' + esc(o.xName || 'x') + '<em>' + esc(xf(p.x)) + '</em></span>'
        + '<span>' + esc(o.yName || 'y') + '<em>' + esc(yf(p.y)) + '</em></span>');
      /* the mark is 12px; the thing you have to hit is 28, because nobody
         lands a pointer on a dot dead-centre and a phone never could */
      return { dot: '<circle class="bpc-dot' + (p.mine ? ' mine' : '') + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1)
          + '" r="' + r + '" fill="' + (p.mine ? 'var(--bpc-s2)' : 'var(--bpc-other)') + '"/>',
        hit: '<circle class="bpc-hit" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="14" data-tip="' + tip + '"/>' };
    });
    /* only the reader's own mark is labelled on the plot; labelling every
       point is how a scatter turns into a wall of overlapping words */
    var mine = pts.filter(function (p) { return p.mine; })[0];
    var tag = mine ? '<text class="bpc-dotlab" x="' + (px(mine.x) + 12).toFixed(1) + '" y="' + (py(mine.y) + 4).toFixed(1) + '">'
      + esc(mine.label) + '</text>' : '';

    return svgOpen(o, W, H) + grid + xlab
      + '<line class="bpc-grid bpc-base" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + (P.t + ih) + '" y2="' + (P.t + ih) + '"/>'
      + '<text class="bpc-ax bpc-axname" x="' + (P.l + iw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">'
      + esc(o.xName || '') + '</text>'
      + marks.map(function (m) { return m.dot; }).join('') + tag
      /* every hit ring last, so one sits above its own mark and above its
         neighbours' marks too — otherwise the dots punch holes in the targets */
      + marks.map(function (m) { return m.hit; }).join('') + '</svg>';
  }
  C.scatter = function (o) {
    if (!(o.points || []).length) return empty(o);
    return plotted(o, 'scatter', scatterSvg(o, W0), '', scatterTable(o));
  };
  function scatterTable(o) {
    var xf = o.xFmt || plain, yf = o.yFmt || plain;
    return '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(o.axis || 'Item') + '</th><th>'
      + esc(o.xName || 'x') + '</th><th>' + esc(o.yName || 'y') + '</th></tr></thead><tbody>'
      + (o.points || []).map(function (p) {
        return '<tr><th scope="row">' + esc(p.label) + '</th><td>' + esc(xf(p.x)) + '</td><td>' + esc(yf(p.y)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ==================================================================
     DUMBBELL — two related numbers per row, and the distance between them
     is the point. What a job cost and what it brought in are one story,
     and a bar of the difference alone hides whether a thin margin came off
     a big job or a small one.
     ================================================================== */
  function dumbbellSvg(o, W) {
    var rows = (o.rows || []).slice(0, o.max || 7);
    var lw = Math.min(190, Math.max(96, Math.round(W * 0.26)));
    var P = { t: 12, r: 74, b: 26, l: lw + 12 };
    var H = P.t + P.b + rows.length * 30;
    var iw = W - P.l - P.r;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return Math.max(+r.a || 0, +r.b || 0); }).concat([1])));
    var px = function (v) { return P.l + iw * (Math.max(0, +v || 0) / max); };
    var fmt = o.fmt || money, af = axisFmt(fmt);

    var grid = ticks(max).map(function (t) {
      var x = px(t);
      return '<line class="bpc-grid" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + P.t + '" y2="' + (H - P.b) + '"/>'
        + '<text class="bpc-ax" x="' + x.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(af(t)) + '</text>';
    }).join('');

    var body = rows.map(function (r, i) {
      var y = P.t + 15 + i * 30, xa = px(r.a), xb = px(r.b), gap = (+r.b || 0) - (+r.a || 0);
      var name = String(r.label || '');
      if (name.length > 22) name = name.slice(0, 21) + '…';
      return '<text class="bpc-ax bpc-dbl" x="' + (lw + 4) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(name) + '</text>'
        + '<line class="bpc-dbar" x1="' + Math.min(xa, xb).toFixed(1) + '" x2="' + Math.max(xa, xb).toFixed(1) + '" y1="' + y + '" y2="' + y + '"/>'
        + '<circle class="bpc-dend" cx="' + xa.toFixed(1) + '" cy="' + y + '" r="5" fill="var(--bpc-pos1)"/>'
        + '<circle class="bpc-dend" cx="' + xb.toFixed(1) + '" cy="' + y + '" r="5" fill="var(--bpc-pos2)"/>'
        + '<text class="bpc-dgap' + (gap < 0 ? ' neg' : '') + '" x="' + (W - P.r + 8) + '" y="' + (y + 4) + '">'
        + (gap < 0 ? '−' : '+') + esc(fmt(Math.abs(gap))) + '</text>'
        + '<rect class="bpc-hit" x="' + P.l + '" y="' + (y - 14) + '" width="' + iw.toFixed(1) + '" height="28"'
        + ' data-tip="' + escAttr('<b>' + esc(r.label) + '</b><span>' + esc(o.aName || 'a') + '<em>' + esc(fmt(r.a)) + '</em></span>'
          + '<span>' + esc(o.bName || 'b') + '<em>' + esc(fmt(r.b)) + '</em></span>') + '"/>';
    }).join('');

    return svgOpen(o, W, H) + grid + body + '</svg>';
  }
  C.dumbbell = function (o) {
    var rows = (o.rows || []);
    if (!rows.length) return empty(o);
    var legend = '<div class="bpc-legend"><span class="bpc-key"><i style="background:var(--bpc-pos1)"></i>'
      + esc(o.aName || '') + '</span><span class="bpc-key"><i style="background:var(--bpc-pos2)"></i>' + esc(o.bName || '') + '</span></div>';
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
     SPLIT — one total, and how it divides. A stacked bar rather than a
     ranked list: the reader's question is "how much of the whole", and a
     length against a full-width track answers it without arithmetic. Laid
     out horizontally because the categories are words.
     ================================================================== */
  C.split = function (o) {
    var rows = (o.rows || []).filter(function (r) { return +r.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
    var fmt = o.fmt || money;
    if (!rows.length) return empty(o);
    /* past five slices the tail is thinner than its own label, so it folds */
    if (rows.length > 5) {
      var rest = rows.slice(4).reduce(function (t, r) { return t + r.value; }, 0);
      rows = rows.slice(0, 4).concat([{ label: 'Everything else', value: rest, other: true }]);
    }
    var total = rows.reduce(function (t, r) { return t + r.value; }, 0) || 1;
    /* Laid out largest-first, but coloured by name. Assigning the hue by
       position would repaint every category the month one of them overtakes
       another, and a reader who learned that Materials is blue would be told
       something false. Alphabetical is arbitrary but it is stable, which is
       the only property that matters here. */
    var ord = rows.map(function (r) { return r.label; }).sort();
    var hue = function (r) { return r.other ? 'var(--bpc-other)' : slot(ord.indexOf(r.label)); };
    var seg = rows.map(function (r) {
      var pct = r.value / total * 100;
      return '<i class="bpc-seg" style="flex:' + pct.toFixed(3) + ';background:'
        + hue(r) + '" data-tip="'
        + escAttr('<b>' + esc(r.label) + '</b><span>' + fmt(r.value) + '<em>' + Math.round(pct) + '%</em></span>') + '"></i>';
    }).join('');
    /* the legend carries the number too, so identity and size are both in
       text and neither depends on telling two colours apart */
    var keys = rows.map(function (r) {
      return '<span class="bpc-key"><i style="background:' + hue(r) + '"></i>'
        + esc(r.label) + ' <b>' + fmt(r.value) + '</b></span>';
    }).join('');
    var table = '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(o.axis || 'Item') + '</th><th>Amount</th><th>Share</th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r.label) + '</th><td>' + fmt(r.value) + '</td><td>' + Math.round(r.value / total * 100) + '%</td></tr>';
      }).join('') + '</tbody></table></div>';
    return frame(o, '<div class="bpc-stack">' + seg + '</div>', '<div class="bpc-legend bpc-legend-v">' + keys + '</div>', table);
  };

  /* ==================================================================
     LIKERT — an ordered scale, split either side of its middle. Star
     ratings are not a ranking: five through one is the order, and sorting
     them by count throws away the thing that makes them a scale. So the
     order is fixed, and the bar is pinned at the neutral step so the good
     and the bad read as two directions from a common line.
     ================================================================== */
  var DIV5 = ['var(--bpc-pos2)', 'var(--bpc-pos1)', 'var(--bpc-mid)', 'var(--bpc-neg1)', 'var(--bpc-neg2)'];
  C.likert = function (o) {
    var steps = o.steps || [];                      /* best → worst, fixed */
    var total = steps.reduce(function (t, s) { return t + (+s.value || 0); }, 0);
    if (!total) return empty(o);
    var mid = o.neutral == null ? Math.floor(steps.length / 2) : o.neutral;
    var pct = steps.map(function (s) { return (+s.value || 0) / total * 100; });
    /* the zero line sits where the neutral step's own middle falls, so the
       two arms are measured from the same place on every chart */
    var before = pct.slice(0, mid).reduce(function (t, v) { return t + v; }, 0) + pct[mid] / 2;
    var tip = function (s, p) {
      return escAttr('<b>' + esc(s.label) + '</b><span>' + (+s.value || 0).toLocaleString()
        + (s.value === 1 ? ' review' : ' reviews') + '<em>' + Math.round(p) + '%</em></span>');
    };
    var seg = steps.map(function (s, i) {
      if (!(pct[i] > 0)) return '';
      return '<i class="bpc-seg" style="flex:' + pct[i].toFixed(3) + ';background:' + DIV5[Math.min(i, 4)] + '"'
        + ' data-tip="' + tip(s, pct[i]) + '"></i>';
    }).join('');
    var good = pct.slice(0, mid).reduce(function (t, v) { return t + v; }, 0);
    var bad = pct.slice(mid + 1).reduce(function (t, v) { return t + v; }, 0);
    var keys = steps.filter(function (s) { return +s.value > 0; }).map(function (s) {
      var i = steps.indexOf(s);
      return '<span class="bpc-key"><i style="background:' + DIV5[Math.min(i, 4)] + '"></i>'
        + esc(s.label) + ' <b>' + (+s.value || 0).toLocaleString() + '</b></span>';
    }).join('');
    var table = '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(o.axis || 'Rating') + '</th><th>Count</th><th>Share</th></tr></thead><tbody>'
      + steps.map(function (s, i) {
        return '<tr><th scope="row">' + esc(s.label) + '</th><td>' + (+s.value || 0).toLocaleString() + '</td><td>' + Math.round(pct[i]) + '%</td></tr>';
      }).join('') + '</tbody></table></div>';
    return frame(o,
      '<div class="bpc-lik"><div class="bpc-stack">' + seg + '</div>'
      + '<span class="bpc-zero" style="left:' + before.toFixed(2) + '%"></span></div>'
      + '<div class="bpc-lik-foot"><span>' + Math.round(good) + '% above the middle</span>'
      + '<span>' + Math.round(bad) + '% below</span></div>',
      '<div class="bpc-legend bpc-legend-v">' + keys + '</div>', table);
  };

  /* ==================================================================
     DIVERGING — how far each row sits either side of a baseline, with the
     side carrying the meaning. A ranked bar cannot show this: it has no
     negative direction, so "9% under" and "9% over" draw the same length.
     ================================================================== */
  C.diverging = function (o) {
    var rows = (o.rows || []).slice().sort(function (a, b) { return a.value - b.value; });
    if (!rows.length) return empty(o);
    var fmt = o.fmt || function (n) { return (Math.round(n * 10) / 10) + '%'; };
    var span = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); }).concat([1]));
    var body = rows.map(function (r) {
      var v = +r.value || 0, w = Math.abs(v) / span * 50;    /* half the track each way */
      var good = o.lowIsGood === false ? v > 0 : v < 0;
      return '<div class="bpc-row bpc-drow" data-tip="' + escAttr('<b>' + esc(r.label) + '</b><span>'
        + esc(v < 0 ? o.underWord || 'under' : v > 0 ? o.overWord || 'over' : 'level') + '<em>' + fmt(Math.abs(v)) + '</em></span>') + '">'
        + '<span class="bpc-rl">' + esc(r.label) + '</span>'
        + '<span class="bpc-dt"><b class="bpc-axis0"></b><i style="' + (v < 0 ? 'right:50%' : 'left:50%')
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
     PROGRESS — one number against its target. A bar, not a donut: the
     comparison is length against a known end, which a line does better
     than an arc.
     ================================================================== */
  C.progress = function (o) {
    var done = +o.value || 0, goal = +o.target || 0;
    var pct = goal > 0 ? Math.min(100, Math.round(done / goal * 100)) : 0;
    var fmt = o.fmt || money;
    return '<figure class="bpc bpc-prog">'
      + '<figcaption class="bpc-cap"><span class="bpc-t">' + esc(o.title || '') + '</span>'
      + '<span class="bpc-lead">' + fmt(done) + ' of ' + fmt(goal) + '</span></figcaption>'
      + '<div class="bpc-ptrack"><i style="width:' + pct + '%;background:' + (o.tone === 'warn' ? 'var(--bpc-warn)' : 'var(--bpc-s1)') + '"></i></div>'
      + '<div class="bpc-pfoot"><span>' + pct + '%</span><span>' + esc(o.note || '') + '</span></div>'
      + '</figure>';
  };

  /* A chart with nothing in it says what would fill it, rather than
     drawing empty axes that look like a loading failure. */
  function empty(o) {
    return '<figure class="bpc bpc-empty">'
      + (o.title ? '<figcaption class="bpc-cap"><span class="bpc-t">' + esc(o.title) + '</span></figcaption>' : '')
      + '<div class="bpc-none">' + esc(o.empty || 'Nothing to chart yet.') + '</div></figure>';
  }
  C.empty = empty;

  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  /* ---------- the hover layer ----------
     Delegated once from the document, so every chart the portal renders
     is interactive without being mounted, and none of them leak a
     listener when the view is replaced. */
  function fmtOf(k) { return k === 'money' ? money : plain; }

  document.addEventListener('pointermove', function (e) {
    var plot = e.target.closest ? e.target.closest('.bpc-plot') : null;
    if (!plot) return;
    var tip = plot.querySelector('.bpc-tip');
    var hit = e.target.closest('.bpc-hit, .bpc-row, .bpc-seg, .bpc-dot');
    if (!hit || !tip) { if (tip) tip.hidden = true; hideCross(plot); return; }

    var html;
    /* a mark that brought its own words uses them — that is every form
       except the time series, where the text depends on which column the
       pointer is over */
    if (hit.getAttribute('data-tip')) {
      html = hit.getAttribute('data-tip');
      hideCross(plot);
    } else {
      var data = plot.getAttribute('data-chart');
      if (!data) return;
      var d; try { d = JSON.parse(data); } catch (err) { return; }
      var i = +hit.getAttribute('data-i'), f = fmtOf(d.f);
      html = '<b>' + esc(d.x[i]) + '</b>' + d.s.map(function (s, si) {
        return '<span><i style="background:' + slot(si) + '"></i>' + esc(s.n) + '<em>' + f(s.v[i]) + '</em></span>';
      }).join('');
      var svg = plot.querySelector('svg'), cross = plot.querySelector('.bpc-cross');
      if (cross && svg) {
        var cx = +hit.getAttribute('x') + (+hit.getAttribute('width')) / 2;
        /* `hidden` is an HTMLElement property; assigning it on an SVG node
           sets a field nobody reads. The attribute is the real switch. */
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.removeAttribute('hidden');
      }
    }
    tip.innerHTML = html;
    tip.hidden = false;
    var pr = plot.getBoundingClientRect();
    var tx = e.clientX - pr.left, ty = e.clientY - pr.top;
    tip.style.left = Math.max(4, Math.min(pr.width - tip.offsetWidth - 4, tx - tip.offsetWidth / 2)) + 'px';
    tip.style.top = Math.max(0, ty - tip.offsetHeight - 12) + 'px';
  }, { passive: true });

  function hideCross(plot) {
    var c = plot.querySelector('.bpc-cross'); if (c) c.setAttribute('hidden', '');
  }
  document.addEventListener('pointerleave', function (e) {
    var plot = e.target.closest ? e.target.closest('.bpc-plot') : null;
    if (!plot) return;
    var tip = plot.querySelector('.bpc-tip'); if (tip) tip.hidden = true;
    hideCross(plot);
  }, true);

  /* ---------- helpers the views use ---------- */
  /* Bucket dated rows into the last n months, oldest first. Months with
     nothing in them stay in the series: a gap is information. */
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
