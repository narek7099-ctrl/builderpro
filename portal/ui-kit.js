/* ==================================================================
   UI kit for the portal (pairs with theme-hl.css)

   bpProgress.start() / .done()   slim 2px bar across the top
   bpToast(msg, type)             small toast, bottom right.
                                  type: 'success' | 'error' | 'warning' | 'info'
   bpSkel(kind, n)                skeleton HTML: 'table' | 'list' | 'panel' | 'cards'
   bpBtnBusy(btn, on)             spinner inside a button, disabled while on

   bpSpin() (the old centre spinner) now drives the progress bar, so every
   view that already calls it gets the new loading feedback for free.
   ================================================================== */
(function () {
  'use strict';

  /* ---------- top progress bar ---------- */
  var bar, val = 0, trickle = null, hideT = null;
  function el() {
    if (!bar) { bar = document.createElement('div'); bar.id = 'hlBar'; document.body.appendChild(bar); }
    return bar;
  }
  function set(n) { val = Math.max(0, Math.min(1, n)); el().style.width = (val * 100) + '%'; }
  var P = {
    start: function () {
      clearTimeout(hideT); clearInterval(trickle);
      var b = el(); b.style.transition = 'none'; set(0); void b.offsetWidth; b.style.transition = '';
      b.classList.add('on'); set(0.25);
      trickle = setInterval(function () { if (val < 0.9) set(val + (0.9 - val) * 0.12); }, 120);
    },
    done: function () {
      if (!bar || !bar.classList.contains('on')) return;
      clearInterval(trickle); set(1);
      hideT = setTimeout(function () { bar.classList.remove('on'); hideT = setTimeout(function () { set(0); }, 200); }, 180);
    }
  };
  window.bpProgress = P;

  /* the old spinner becomes the bar */
  var spinT = null;
  window.bpSpin = function (on) {
    clearTimeout(spinT);
    if (on === false) { P.done(); return; }
    P.start();
    spinT = setTimeout(P.done, 450);
  };

  /* ---------- toasts ---------- */
  function host() {
    var h = document.getElementById('hlToasts');
    if (!h) { h = document.createElement('div'); h.id = 'hlToasts'; h.setAttribute('role', 'status'); h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); }
    var px = document.getElementById('bpx');
    h.classList.toggle('dark', !!(px && px.classList.contains('bpx-dark')));
    return h;
  }
  window.bpToast = function (msg, type) {
    type = type || (/^(could ?n|couldn|not |error|failed|something went wrong|network)/i.test(String(msg)) ? 'error' : 'success');
    var h = host(), t = document.createElement('div');
    t.className = 'hl-toast ' + type;
    if (type === 'error') t.setAttribute('role', 'alert');
    var i = document.createElement('i'), s = document.createElement('span'), x = document.createElement('button');
    s.textContent = String(msg == null ? '' : msg);
    x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
    t.appendChild(i); t.appendChild(s); t.appendChild(x);
    h.appendChild(t);
    while (h.children.length > 4) h.removeChild(h.firstChild);
    var gone = false;
    function close() { if (gone) return; gone = true; t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 160); }
    x.onclick = close;
    setTimeout(close, type === 'error' ? 6000 : 3500);
    return t;
  };

  /* ---------- skeletons ---------- */
  function line(w, h) { return '<span class="hl-skel" style="width:' + w + ';' + (h ? 'height:' + h + 'px;' : '') + 'margin:0"></span>'; }
  window.bpSkel = function (kind, n) {
    n = n || 5; var i, h = '';
    if (kind === 'table') {
      for (i = 0; i < n; i++) h += '<div class="hl-skel-row">' + line('22%') + line('16%') + line('28%') + line('12%') + '</div>';
      return '<div class="hl-skel-card" style="padding:4px 20px" aria-busy="true" aria-label="Loading">' + h + '</div>';
    }
    if (kind === 'list') {
      for (i = 0; i < n; i++) h += '<div class="hl-skel-row" style="padding:0 16px">' + '<span class="hl-skel" style="width:32px;height:32px;border-radius:50%;margin:0;flex:0 0 32px"></span>'
        + '<div style="flex:1">' + line((60 - i * 5 % 25) + '%') + '<div style="height:6px"></div>' + line('40%', 10) + '</div></div>';
      return '<div aria-busy="true" aria-label="Loading">' + h + '</div>';
    }
    if (kind === 'cards') {
      for (i = 0; i < n; i++) h += '<div class="hl-skel-card">' + line('40%') + '<div style="height:12px"></div>' + line('60%', 24) + '</div>';
      return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px" aria-busy="true" aria-label="Loading">' + h + '</div>';
    }
    return '<div class="hl-skel-card" aria-busy="true" aria-label="Loading">' + line('35%', 16) + '<div style="height:16px"></div>' + line('100%') + '<div style="height:10px"></div>' + line('80%') + '<div style="height:10px"></div>' + line('60%') + '</div>';
  };

  /* ---------- button busy state ---------- */
  window.bpBtnBusy = function (btn, on) {
    if (!btn) return;
    if (on === false) { btn.classList.remove('hl-busy'); btn.disabled = !!btn._hlWas; btn.removeAttribute('aria-busy'); return; }
    btn._hlWas = btn.disabled; btn.classList.add('hl-busy'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  };
})();
