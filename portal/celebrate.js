/* =====================================================================
   BuilderPro: finishing something feels good (2026-11-22)
   A green check that draws itself when a contractor completes something,
   with how far along the job now is.

     bpCelebrate(title, sub, opts)
       opts.big   true: a card in the middle of the screen (job done, deal
                  won, estimate or invoice sent, crew finished)
                  false: a small pill under the header (a phase ticked,
                  a to-do done, a payment marked)
       opts.pct   0-100: a ring that fills to this percent
       opts.of    "4 of 6 phases": shown under the ring

   Hooks (wrapped once the page's own functions exist): a phase ticked,
   a job marked complete, a to-do done, a deal won, a crew finishing,
   wages marked paid, and estimates / invoices sent (from their success
   toast). Phones get the celebration; computers keep the normal toast
   for sends and get the small pill for the rest.
   ===================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var phone = function () { var x = $('bpx'); return !!(x && x.classList.contains('bp-m')) || window.innerWidth <= 760; };
  var calm = function () { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var buzz = function (p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  function css() {
    if ($('bpCelCss')) return;
    var s = document.createElement('style'); s.id = 'bpCelCss';
    s.textContent = [
      '.bpcel-bg{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(0,21,48,.28);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:bpcelFade .18s ease-out both}',
      '.bpcel-bg.out{animation:bpcelFadeOut .22s ease-in both}',
      '.bpcel{position:relative;width:min(300px,82vw);padding:30px 22px 24px;border-radius:26px;background:#fff;color:#0b1526;text-align:center;box-shadow:0 30px 60px -20px rgba(0,21,48,.45);animation:bpcelPop .42s cubic-bezier(.2,1.4,.4,1) both;font-family:inherit}',
      '.bpcel-dark .bpcel{background:#1b1f27;color:#f1f5f9}',
      '.bpcel-ring{position:relative;width:96px;height:96px;margin:0 auto 14px}',
      '.bpcel-ring svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
      '.bpcel-ring .trk{fill:none;stroke:rgba(22,199,154,.16);stroke-width:7}',
      '.bpcel-ring .arc{fill:none;stroke:#16c79a;stroke-width:7;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%;transition:stroke-dashoffset .9s cubic-bezier(.3,.9,.3,1) .15s}',
      '.bpcel-ring .dot{fill:#16c79a;transform-origin:50% 50%;animation:bpcelDot .38s cubic-bezier(.2,1.5,.4,1) .05s both}',
      '.bpcel-ring .chk{fill:none;stroke:#fff;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:40;stroke-dashoffset:40;animation:bpcelDraw .36s ease-out .32s forwards}',
      '.bpcel h3{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em}',
      '.bpcel p{margin:6px 0 0;font-size:15px;color:#6b7280;line-height:1.35}',
      '.bpcel-dark .bpcel p{color:#aab3c2}',
      '.bpcel-of{display:inline-flex;align-items:center;gap:6px;margin-top:14px;padding:6px 12px;border-radius:999px;background:rgba(22,199,154,.12);color:#08775d;font-size:14px;font-weight:700}',
      '.bpcel-dark .bpcel-of{color:#5ee0bb}',
      '.bpcel-bits{position:absolute;left:50%;top:78px;width:0;height:0;pointer-events:none}',
      '.bpcel-bits i{position:absolute;width:8px;height:8px;border-radius:50%;opacity:0;animation:bpcelBit .9s cubic-bezier(.15,.7,.3,1) .25s forwards}',
      /* the small one, under the header */
      '.bpcel-pill{position:fixed;left:50%;top:calc(66px + env(safe-area-inset-top));z-index:2147483000;transform:translateX(-50%);display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:8px 16px 8px 8px;border-radius:999px;background:#fff;color:#0b1526;box-shadow:0 12px 30px -10px rgba(0,21,48,.35),0 0 0 .5px rgba(16,24,40,.08);font-size:15px;font-weight:600;animation:bpcelDrop .4s cubic-bezier(.2,1.4,.4,1) both;font-family:inherit}',
      '.bpcel-pill.out{animation:bpcelUp .25s ease-in both}',
      '.bpcel-dark.bpcel-pill{background:#1b1f27;color:#f1f5f9}',
      '.bpcel-pill .bpcel-ring{width:34px;height:34px;margin:0;flex:none}',
      '.bpcel-pill .bpcel-ring .trk,.bpcel-pill .bpcel-ring .arc{stroke-width:4}',
      '.bpcel-pill .bpcel-ring .chk{stroke-width:3.2}',
      '.bpcel-pill small{display:block;font-size:12.5px;font-weight:500;color:#6b7280;margin-top:1px}',
      '.bpcel-pill .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '@keyframes bpcelFade{from{opacity:0}to{opacity:1}}@keyframes bpcelFadeOut{to{opacity:0}}',
      '@keyframes bpcelPop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}',
      '@keyframes bpcelDot{from{transform:scale(0)}to{transform:scale(1)}}',
      '@keyframes bpcelDraw{to{stroke-dashoffset:0}}',
      '@keyframes bpcelBit{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(.4)}}',
      '@keyframes bpcelDrop{from{opacity:0;transform:translate(-50%,-14px) scale(.92)}to{opacity:1;transform:translate(-50%,0)}}',
      '@keyframes bpcelUp{to{opacity:0;transform:translate(-50%,-10px)}}',
      '@media (prefers-reduced-motion:reduce){.bpcel,.bpcel-pill,.bpcel-bg,.bpcel-ring .dot{animation:none!important}.bpcel-ring .chk{animation:none!important;stroke-dashoffset:0}.bpcel-bits{display:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* the ring: a filled green dot with a check, and an arc around it to pct */
  function ring(pct, big) {
    var r = 44, c = 2 * Math.PI * r, show = pct != null && isFinite(pct);
    var off = show ? c * (1 - Math.max(0, Math.min(100, pct)) / 100) : c;
    return '<div class="bpcel-ring"><svg viewBox="0 0 96 96" aria-hidden="true">'
      + (show ? '<circle class="trk" cx="48" cy="48" r="' + r + '"/><circle class="arc" cx="48" cy="48" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + c.toFixed(1) + '" data-off="' + off.toFixed(1) + '"/>' : '')
      + '<circle class="dot" cx="48" cy="48" r="' + (show ? 33 : 40) + '"/><path class="chk" d="M33 49l10 10 20-22"/></svg></div>';
  }
  function bits() {
    var cols = ['#16c79a', '#006fff', '#5ee0bb', '#7fb0ff', '#001530'], h = '';
    for (var i = 0; i < 16; i++) { var a = (i / 16) * Math.PI * 2 + Math.random() * .3, d = 70 + Math.random() * 50; h += '<i style="background:' + cols[i % cols.length] + ';--x:' + (Math.cos(a) * d).toFixed(0) + 'px;--y:' + (Math.sin(a) * d).toFixed(0) + 'px"></i>'; }
    return '<div class="bpcel-bits">' + h + '</div>';
  }
  function fill(el) { setTimeout(function () { var a = el.querySelector('.arc'); if (a) a.style.strokeDashoffset = a.getAttribute('data-off'); }, 30); }
  var dark = function () { var x = $('bpx'); return !!(x && x.classList.contains('bpx-dark')); };

  var openBig = null, openPill = null;
  window.bpCelebrate = function (title, sub, o) {
    o = o || {}; css();
    if (o.big) {
      if (openBig) openBig.remove();
      var bg = document.createElement('div'); bg.className = 'bpcel-bg' + (dark() ? ' bpcel-dark' : ''); bg.setAttribute('role', 'status'); bg.setAttribute('aria-live', 'polite');
      bg.innerHTML = '<div class="bpcel">' + (calm() ? '' : bits()) + ring(o.pct, true) + '<h3>' + esc(title) + '</h3>' + (sub ? '<p>' + esc(sub) + '</p>' : '')
        + (o.of ? '<div class="bpcel-of">' + esc(o.of) + '</div>' : '') + '</div>';
      document.body.appendChild(bg); openBig = bg; fill(bg); buzz([14, 60, 22]);
      var close = function () { if (!bg.parentNode) return; bg.classList.add('out'); setTimeout(function () { bg.remove(); }, 220); if (openBig === bg) openBig = null; };
      bg.onclick = close; setTimeout(close, o.ms || 2200);
      return;
    }
    if (openPill) openPill.remove();
    var p = document.createElement('div'); p.className = 'bpcel-pill' + (dark() ? ' bpcel-dark' : ''); p.setAttribute('role', 'status'); p.setAttribute('aria-live', 'polite');
    p.innerHTML = ring(o.pct) + '<div class="t">' + esc(title) + (sub || o.of ? '<small>' + esc(o.of || sub) + '</small>' : '') + '</div>';
    document.body.appendChild(p); openPill = p; fill(p); buzz(12);
    var shut = function () { if (!p.parentNode) return; p.classList.add('out'); setTimeout(function () { p.remove(); }, 250); if (openPill === p) openPill = null; };
    p.onclick = shut; setTimeout(shut, o.ms || 1900);
  };

  /* ---------------------------------------------------------------- hooks --- */
  var jobOf = function (id) { return ((window.bpJobsGet && bpJobsGet()) || []).filter(function (j) { return j.id === id; })[0]; };
  var phasesOf = function (j) { var p = j && j.plan && j.plan.phases; return p && p.length ? p : null; };
  var money = function (n) { return '$' + Math.round(+n || 0).toLocaleString(); };

  function wrap(name, fn) {
    var tries = 0;
    (function go() {
      var o = window[name];
      if (typeof o === 'function' && !o._bpcel) { var w = fn(o); w._bpcel = 1; window[name] = w; return; }
      if (typeof o === 'function') return;
      if (++tries < 40) setTimeout(go, 500);
    })();
  }

  /* a phase ticked off: how far the work is now */
  wrap('bpPlanToggle', function (o) {
    return function (jid, key) {
      var j = jobOf(jid), ph = phasesOf(j), p0 = ph && ph.filter(function (x) { return x.key === key; })[0], was = !!(p0 && p0.doneAt);
      var r = o.apply(this, arguments);
      try {
        if (was) return r;
        var j2 = jobOf(jid), ph2 = phasesOf(j2); if (!ph2) return r;
        var done = ph2.filter(function (x) { return x.doneAt; }).length, n = ph2.length, pc = Math.round(done / n * 100), p1 = ph2.filter(function (x) { return x.key === key; })[0];
        if (done === n) bpCelebrate('Every phase done', (j2.name || 'This job') + ' is built. Mark it complete once you are paid.', { big: true, pct: 100, of: n + ' of ' + n + ' phases' });
        else bpCelebrate((p1 && p1.name ? p1.name : 'Phase') + ' done', '', { pct: pc, of: done + ' of ' + n + ' phases · ' + pc + '%' });
      } catch (e) {}
      return r;
    };
  });

  /* a job marked complete */
  wrap('bpJobDoneSave', function (o) {
    return function (id) {
      var j = jobOf(id), was = !!(j && j.status === 'done');
      var r = o.apply(this, arguments);
      try {
        if (!was) {
          var j2 = jobOf(id) || j || {}, est = +j2.estimate || 0, got = +j2.collected || 0, pc = est ? Math.min(100, Math.round(got / est * 100)) : null;
          var left = ((window.bpJobsGet && bpJobsGet()) || []).filter(function (x) { return x.status === 'active'; }).length;
          bpCelebrate('Job complete', (j2.name || 'The job') + (j2.title ? ' · ' + j2.title : ''), { big: true, pct: pc == null ? 100 : pc, of: pc == null ? (left ? left + ' active ' + (left === 1 ? 'job' : 'jobs') + ' left' : 'All jobs done') : money(got) + ' of ' + money(est) + ' collected' });
        }
      } catch (e) {}
      return r;
    };
  });

  /* a to-do done */
  wrap('bpNoteToggle', function (o) {
    return function (id) {
      var get = window.bpNotesGet || function () { return []; }, n0 = get().filter(function (x) { return x.id === id; })[0], was = !!(n0 && n0.done);
      var r = o.apply(this, arguments);
      try {
        if (!was && n0) {
          var day = get().filter(function (x) { return x.day === n0.day; }), d = day.filter(function (x) { return x.done; }).length;
          bpCelebrate('To-do done', '', { pct: day.length ? Math.round(d / day.length * 100) : 100, of: d + ' of ' + day.length + ' done that day' });
        }
      } catch (e) {}
      return r;
    };
  });

  /* a deal won */
  ['bpMarkWon', 'bpMarkWonLive'].forEach(function (nm) {
    wrap(nm, function (o) {
      return function () {
        var r = o.apply(this, arguments);
        var cheer = function () { bpCelebrate('Deal won', 'Nice. It is on your jobs list now.', { big: true }); };
        try { if (r && typeof r.then === 'function') r.then(function (v) { if (v !== false) cheer(); }, function () {}); else if (r !== false) cheer(); } catch (e) {}
        return r;
      };
    });
  });

  /* the crew finishing a job */
  wrap('bpCrewFinish', function (o) {
    return function () {
      var r = o.apply(this, arguments);
      try { var go = function () { bpCelebrate('Nice work', 'Job finished. The office has been told.', { big: true }); }; if (r && typeof r.then === 'function') r.then(function (v) { if (v !== false) go(); }, function () {}); else if (r !== false) go(); } catch (e) {}
      return r;
    };
  });

  /* wages marked paid */
  wrap('bpPayMark', function (o) {
    return function (empId, from, on) {
      var r = o.apply(this, arguments);
      try { if (on) bpCelebrate('Marked paid', 'Booked in Finances.', {}); } catch (e) {}
      return r;
    };
  });

  /* estimates and invoices sent: their success toast becomes the celebration on a phone */
  var SEND = /^(Estimate sent to|Invoice sent to|Sent .+ options)/;
  wrap('bpToast', function (o) {
    return function (msg, type) {
      try {
        var m = String(msg == null ? '' : msg);
        if (type !== 'error' && SEND.test(m) && !/outbox/i.test(m)) {
          var inv = /^Invoice/.test(m);
          if (phone()) { bpCelebrate(inv ? 'Invoice sent' : 'Estimate sent', m.replace(/^(Estimate|Invoice) sent to /, 'To ').replace(/\.$/, ''), { big: true }); return null; }
        }
      } catch (e) {}
      return o.apply(this, arguments);
    };
  });
  /* the older send boxes (Estimates and Invoices pages) say it in the dialog instead of a toast */
  ['bpEstSend', 'bpInvSend'].forEach(function (nm) {
    wrap(nm, function (o) {
      return function () {
        var r = o.apply(this, arguments), inv = nm === 'bpInvSend';
        Promise.resolve(r).then(function () {
          var m = document.querySelector('.bpx-modal'); var t = m ? m.textContent : '';
          if (/(Estimate|Invoice) sent /.test(t)) bpCelebrate(inv ? 'Invoice sent' : 'Estimate sent', '', { big: true });
        }, function () {});
        return r;
      };
    });
  });
})();
