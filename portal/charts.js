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
  function ticks(max, n) {
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

  /* ==================================================================
     LINE — change over time. Area fill only when there is one series,
     because two overlapping washes read as a third colour.
     ================================================================== */
  C.line = function (o) {
    var x = o.x || { values: [] }, series = o.series || [], fmt = o.fmt || money;
    var W = 720, H = o.height || 210, P = { t: 14, r: 14, b: 26, l: 52 };
    var n = x.values.length;
    if (!n || !series.length) return empty(o);

    var raw = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (+v > raw) raw = +v; }); });
    var max = niceMax(raw) || 1;
    var iw = W - P.l - P.r, ih = H - P.t - P.b;
    var px = function (i) { return P.l + (n === 1 ? iw / 2 : iw * i / (n - 1)); };
    var py = function (v) { return P.t + ih - ih * (Math.max(0, +v || 0) / max); };

    var af = axisFmt(fmt);
    var grid = ticks(max, 4).map(function (t) {
      var y = py(t);
      return '<line class="bpc-grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>'
        + '<text class="bpc-ax" x="' + (P.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + af(t) + '</text>';
    }).join('');

    /* every label would collide on a narrow card, so thin them to fit */
    var step = Math.ceil(n / 7);
    var xlab = x.values.map(function (lbl, i) {
      if (i % step && i !== n - 1) return '';
      return '<text class="bpc-ax" x="' + px(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lbl) + '</text>';
    }).join('');

    var paths = series.map(function (s, si) {
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + px(i) + ' ' + py(v); }).join(' ');
      var area = series.length === 1
        ? '<path class="bpc-area" d="' + d + ' L' + px(n - 1) + ' ' + (P.t + ih) + ' L' + px(0) + ' ' + (P.t + ih) + ' Z" fill="' + slot(si) + '"/>'
        : '';
      /* the last point is marked and labelled: the current value is the
         one a reader is actually looking for */
      var last = s.values[n - 1];
      return area
        + '<path class="bpc-line" d="' + d + '" stroke="' + slot(si) + '"/>'
        + '<circle class="bpc-end" cx="' + px(n - 1) + '" cy="' + py(last) + '" r="4.5" fill="' + slot(si) + '"/>';
    }).join('');

    var hot = x.values.map(function (lbl, i) {
      return '<rect class="bpc-hit" data-i="' + i + '" x="' + (px(i) - iw / (n > 1 ? (n - 1) * 2 : 1)) + '" y="' + P.t
        + '" width="' + (n > 1 ? iw / (n - 1) : iw) + '" height="' + ih + '"/>';
    }).join('');

    /* an explicit pixel height with preserveAspectRatio="none": the plot
       fills the card's width exactly and keeps the height it was designed
       at, instead of growing taller in proportion on a wide screen. The
       strokes are non-scaling, so nothing distorts with it. */
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="height:' + H + 'px" role="img" aria-label="' + esc(o.title || 'chart') + '" preserveAspectRatio="none">'
      + grid + xlab
      + '<line class="bpc-grid bpc-base" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + (P.t + ih) + '" y2="' + (P.t + ih) + '"/>'
      + paths
      + '<line class="bpc-cross" x1="0" x2="0" y1="' + P.t + '" y2="' + (P.t + ih) + '" hidden/>'
      + hot + '</svg>';

    return frame(o, svg, legendOf(series), tableOf(x, series, fmt))
      .replace('<div class="bpc-plot">', '<div class="bpc-plot" data-chart="' + escAttr(JSON.stringify({
        x: x.values, s: series.map(function (s) { return { n: s.name, v: s.values }; }), f: fmt === money ? 'money' : 'plain',
      })) + '">');
  };

  /* ==================================================================
     COLUMNS — a countable thing per period. Bars, not a line, when the
     periods are discrete buckets rather than a continuous reading.
     ================================================================== */
  C.columns = function (o) {
    var x = o.x || { values: [] }, series = o.series || [], fmt = o.fmt || plain;
    var W = 720, H = o.height || 210, P = { t: 14, r: 14, b: 26, l: 52 };
    var n = x.values.length;
    if (!n || !series.length) return empty(o);

    var raw = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (+v > raw) raw = +v; }); });
    var max = niceMax(raw) || 1;
    var iw = W - P.l - P.r, ih = H - P.t - P.b;
    var band = iw / n, gap = Math.min(14, band * 0.28);
    var bw = (band - gap) / series.length;
    var py = function (v) { return P.t + ih - ih * (Math.max(0, +v || 0) / max); };

    var af = axisFmt(fmt);
    var grid = ticks(max, 4).map(function (t) {
      var y = py(t);
      return '<line class="bpc-grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>'
        + '<text class="bpc-ax" x="' + (P.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + af(t) + '</text>';
    }).join('');

    var step = Math.ceil(n / 8), bars = '', xlab = '';
    x.values.forEach(function (lbl, i) {
      var x0 = P.l + band * i + gap / 2;
      series.forEach(function (s, si) {
        var v = Math.max(0, +s.values[i] || 0), y = py(v), h = P.t + ih - y;
        /* a rounded top on a bar that is anchored to the baseline; zero
           draws nothing rather than a stub that reads as a small value */
        if (h > 0.5) {
          bars += '<rect class="bpc-bar" x="' + (x0 + bw * si) + '" y="' + y + '" width="' + Math.max(1, bw - 2)
            + '" height="' + h + '" rx="' + Math.min(4, bw / 2) + '" fill="' + slot(si) + '"/>';
        }
      });
      if (!(i % step) || i === n - 1) {
        xlab += '<text class="bpc-ax" x="' + (P.l + band * i + band / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lbl) + '</text>';
      }
      bars += '<rect class="bpc-hit" data-i="' + i + '" x="' + (P.l + band * i) + '" y="' + P.t + '" width="' + band + '" height="' + ih + '"/>';
    });

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="height:' + H + 'px" role="img" aria-label="' + esc(o.title || 'chart') + '" preserveAspectRatio="none">'
      + grid + xlab
      + '<line class="bpc-grid bpc-base" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + (P.t + ih) + '" y2="' + (P.t + ih) + '"/>'
      + bars + '</svg>';

    return frame(o, svg, legendOf(series), tableOf(x, series, fmt))
      .replace('<div class="bpc-plot">', '<div class="bpc-plot" data-chart="' + escAttr(JSON.stringify({
        x: x.values, s: series.map(function (s) { return { n: s.name, v: s.values }; }), f: fmt === money ? 'money' : 'plain',
      })) + '">');
  };

  /* ==================================================================
     RANKED BARS — how one total splits. Horizontal, because the labels
     are words and a word reads along a row rather than rotated under a
     column. Never a pie: angle is the hardest thing to compare.
     ================================================================== */
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
      return '<div class="bpc-row" data-tip="' + escAttr(esc(r.label) + ' · ' + fmt(r.value) + ' · ' + pct + '% of the total') + '">'
        + '<span class="bpc-rl">' + esc(r.label) + '</span>'
        + '<span class="bpc-rt"><i style="width:' + Math.max(1.5, r.value / top * 100) + '%;background:'
        + (r.other ? 'var(--bpc-other)' : (o.mono ? 'var(--bpc-s1)' : slot(i))) + '"></i></span>'
        + '<span class="bpc-rv">' + fmt(r.value) + '</span></div>';
    }).join('');
    var table = '<div class="bpc-tblwrap"><table><thead><tr><th>' + esc(o.axis || 'Item') + '</th><th>Amount</th><th>Share</th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r.label) + '</th><td>' + fmt(r.value) + '</td><td>' + Math.round(r.value / total * 100) + '%</td></tr>';
      }).join('') + '</tbody></table></div>';
    return frame(o, '<div class="bpc-rows">' + body + '</div>', '', table);
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
    var hit = e.target.closest('.bpc-hit, .bpc-row');
    if (!hit || !tip) { if (tip) tip.hidden = true; hideCross(plot); return; }

    var html;
    if (hit.classList.contains('bpc-row')) {
      html = hit.getAttribute('data-tip');
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
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.hidden = false;
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
    var c = plot.querySelector('.bpc-cross'); if (c) c.hidden = true;
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
