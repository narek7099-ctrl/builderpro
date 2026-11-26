/* Phone calendar, 2026-11-26 (the owner's ask, after Apple's Calendar):
   the phone shows the month only. Tapping a day slides in a day screen:
   back to the month at the top left, the week as a strip of dates, and the
   day laid out hour by hour (the same day view the computer has, drawn by
   bpDrawDay in app.html). Swipe the hours sideways for the next or the
   previous day, swipe the strip for the next or the previous week.
   The computer works the same way (the owner's ask, same day): month only,
   and a clicked day opens the same screen as a panel from the right, over
   a dimmed month, with arrows and the arrow keys for the next day. */
(function () {
  'use strict';
  var MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var cur = '';
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  window.bpCalIsPhone = function () { return (window.innerWidth || 1000) <= 760; };

  function wrapPick() {
    var orig = window.bpDayPick;
    if (!orig || orig._cds) return;
    var w = function (d) { cur = d; orig(d); after(); };
    w._cds = 1; window.bpDayPick = w;
  }
  function after() {
    var el = document.getElementById('bpDayScr'); if (!el || !cur) return;
    var d = new Date(cur + 'T12:00:00');
    var m = el.querySelector('.cds-mon'); if (m) m.textContent = MN[d.getMonth()];
    var t = el.querySelector('.cds-today'); if (t) t.disabled = cur === iso(new Date());
    var tab = document.querySelector('#bpxViewArea .cal-tabs .bpx-jt.on');
    var h = el.querySelector('.cds-hint');
    if (h) h.textContent = bpCalIsPhone() ? 'Hold a block, then drag it to a new time, or onto a date up top to move it to that day.' : 'Drag a block to a new time, or onto a date up top to move it to that day.';
    var k = el.querySelector('.cds-kind');
    if (k) k.innerHTML = (tab && /Inspections/.test(tab.textContent) && window.bpCalDayTap)
      ? '<button type="button" class="bpx-rowbtn" onclick="bpCalDayTap(\'' + cur + '\')"><span class="ms">event_busy</span> Close or reopen this day for inspections</button>' : '';
  }
  function slide(el, dir) {
    var b = el.querySelector('.cds-body'); if (!b) return;
    b.classList.remove('cds-l', 'cds-r'); void b.offsetWidth; b.classList.add(dir > 0 ? 'cds-l' : 'cds-r');
  }
  function swipe(el) {
    var x0 = 0, y0 = 0, onStrip = false, on = false;
    el.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; on = true;
      onStrip = !!(e.target.closest && e.target.closest('.cd-strip'));
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (!on) return; on = false;
      if (window._bpDayDragAt && Date.now() - window._bpDayDragAt < 600) return;   /* that was a drag, not a swipe */
      if (e.target.closest && e.target.closest('.cd-ev')) return;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (x0 < 24) return;                         /* the phone's own edge-swipe */
      var n = dx < 0 ? 1 : -1;
      if (window.bpHaptic) bpHaptic('light');
      slide(el, n);
      if (window.bpDayMove) bpDayMove(onStrip ? n * 7 : n);
    }, { passive: true });
  }
  function key(e) {
    if (!document.getElementById('bpDayScr') || document.querySelector('.bpx-modal')) return;
    var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
    if (e.key === 'Escape') { e.preventDefault(); window.bpCalDayClose(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); window.bpCalDayStep(e.key === 'ArrowRight' ? 1 : -1); }
  }
  window.bpCalDayStep = function (n) { var el = document.getElementById('bpDayScr'); if (!el || !window.bpDayMove) return; slide(el, n); bpDayMove(n); };
  function drop() { var b = document.getElementById('bpDayScrBg'); if (b) b.remove(); }

  window.bpCalDayOpen = function (day) {
    if (!window.bpDayPick) return;
    wrapPick();
    var el = document.getElementById('bpDayScr');
    if (!el) {
      el = document.createElement('div'); el.id = 'bpDayScr'; el.className = 'cds';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Day');
      el.innerHTML = '<div class="cds-bar">'
        + '<button type="button" class="cds-back" onclick="bpCalDayClose()" aria-label="Back to the month"><span class="ms">chevron_left</span><b class="cds-mon"></b></button>'
        + '<span class="cds-sp"></span>'
        + '<button type="button" class="cds-arr" onclick="bpCalDayStep(-1)" aria-label="Previous day"><span class="ms">chevron_left</span></button>'
        + '<button type="button" class="cds-arr" onclick="bpCalDayStep(1)" aria-label="Next day"><span class="ms">chevron_right</span></button>'
        + '<button type="button" class="cds-today" onclick="bpCalDayToday()">Today</button>'
        + '<button type="button" class="cds-add" onclick="bpCalDayAdd()" aria-label="Add to this day"><span class="ms">add</span></button></div>'
        + '<div class="cds-body"><div id="bpx-dayview" class="cd-wrap"></div><p class="cds-hint"></p><div class="cds-kind"></div></div>';
      var host = document.getElementById('bpx') || document.body;
      var bg = document.createElement('div'); bg.id = 'bpDayScrBg'; bg.className = 'cds-bg'; bg.onclick = function () { window.bpCalDayClose(); };
      host.appendChild(bg);
      host.appendChild(el);
      swipe(el);
      document.addEventListener('keydown', key, true);
      if (window.bpHaptic) bpHaptic('light');
    }
    window.bpDayPick(day);
  };
  window.bpCalDayClose = function () {
    var el = document.getElementById('bpDayScr'); if (!el) return;
    document.removeEventListener('keydown', key, true);
    el.classList.add('cds-out');
    var b = document.getElementById('bpDayScrBg'); if (b) b.classList.add('cds-out');
    setTimeout(function () { el.remove(); drop(); }, 200);
    /* the month underneath follows the day you were on */
    if (document.getElementById('bpx-calgrid') && window.bpCalRedrawMonth) bpCalRedrawMonth();
  };
  window.bpCalDayToday = function () { var t = iso(new Date()); if (t !== cur) { slide(document.getElementById('bpDayScr'), t > cur ? 1 : -1); window.bpDayPick(t); } };
  window.bpCalDayAdd = function () { if (cur && window.bpDaySheet) bpDaySheet(cur, true); };
  /* data came back or something was booked: redraw the open day */
  window.bpCalDayRedraw = function () { if (cur && document.getElementById('bpDayScr') && window.bpDayPick) window.bpDayPick(cur); };
  /* leaving the calendar closes the day screen */
  var nav0 = null;
  function hookNav() {
    if (!window.bpNav || window.bpNav._cds) return;
    nav0 = window.bpNav;
    var w = function () { var el = document.getElementById('bpDayScr'); if (el) { document.removeEventListener('keydown', key, true); el.remove(); drop(); } return nav0.apply(this, arguments); };
    w._cds = 1; window.bpNav = w;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookNav); else hookNav();
})();
