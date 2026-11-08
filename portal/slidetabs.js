/* The stretchy pill behind the selected item, copied in behavior from the
   reels: the edge on the side it's heading leaves first (0.36s) and the other
   edge catches up (0.55s), power3-out, so it stretches toward the new item and
   settles. While it travels it turns to see-through glass (class "moving"),
   then lands solid, like the glassy-tabs reel.
     #hlTabs    page tabs        sideways
     #bpTabbar  phone bottom bar sideways
     #bpxNav    sidebar          up and down (the kitchen-fitter reel)
   Rows are redrawn on page changes; each row keeps its pill's live edges on
   the element, so a redraw mid-move carries on. Reduced motion: no glide. */
(function () {
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LEAD = 360, TRAIL = 550;
  var ease = function (k) { return 1 - Math.pow(1 - k, 3); };
  function paint(ind, st, v) {
    if (v) { ind.style.transform = 'translateY(' + st.a + 'px)'; ind.style.height = Math.max(0, st.b - st.a) + 'px'; }
    else { ind.style.transform = 'translateX(' + st.a + 'px)'; ind.style.width = Math.max(0, st.b - st.a) + 'px'; }
  }
  function slide(box, sel, ix, iy, v) {
    if (!box || box.hidden || !box.getClientRects().length) return;
    var on = box.querySelector(sel), ind = box.querySelector(':scope > .bp-slide');
    if (!on || !on.offsetWidth) { if (ind) ind.style.opacity = '0'; return; }
    if (!ind) { ind = document.createElement('span'); ind.className = 'bp-slide'; ind.setAttribute('aria-hidden', 'true'); box.insertBefore(ind, box.firstChild); }
    box.classList.add('has-slide');
    if (v) { ind.style.left = (on.offsetLeft + ix) + 'px'; ind.style.width = (on.offsetWidth - ix * 2) + 'px'; ind.style.top = '0'; }
    else { ind.style.top = (on.offsetTop + iy) + 'px'; ind.style.height = (on.offsetHeight - iy * 2) + 'px'; }
    var to = v ? { a: on.offsetTop + iy, b: on.offsetTop + on.offsetHeight - iy } : { a: on.offsetLeft + ix, b: on.offsetLeft + on.offsetWidth - ix };
    var sl = box._bpSl;
    ind.style.opacity = '1';
    if (!sl || RM) { box._bpSl = { cur: { a: to.a, b: to.b }, to: to }; paint(ind, box._bpSl.cur, v); return; }
    if (sl.to.a === to.a && sl.to.b === to.b) { paint(ind, sl.cur, v); if (!sl.raf) ind.classList.remove('moving'); return; }
    if (sl.raf) cancelAnimationFrame(sl.raf);
    var from = { a: sl.cur.a, b: sl.cur.b }, fwd = to.a > from.a, t0 = performance.now();
    var lead = fwd ? 'b' : 'a', trail = fwd ? 'a' : 'b';
    sl.to = to;
    ind.classList.add('moving');
    var step = function (t) {
      var p = Math.min(1, (t - t0) / LEAD), q = Math.min(1, (t - t0) / TRAIL);
      sl.cur[lead] = from[lead] + (to[lead] - from[lead]) * ease(p);
      sl.cur[trail] = from[trail] + (to[trail] - from[trail]) * ease(q);
      var live = box.querySelector(':scope > .bp-slide'); if (live) { paint(live, sl.cur, v); if (q > .82) live.classList.remove('moving'); else live.classList.add('moving'); }
      sl.raf = q < 1 ? requestAnimationFrame(step) : 0;
    };
    sl.raf = requestAnimationFrame(step);
  }
  window.bpSlideTabs = function () {
    requestAnimationFrame(function () {
      slide(document.getElementById('hlTabs'), '.hl-tab.on', 0, 4);
      slide(document.getElementById('bpTabbar'), '.bp-tab.on:not(.bp-tab-new)', 0, 4);
      slide(document.getElementById('bpxNav'), '.hl-ni.on', 0, 0, true);
    });
  };
  window.addEventListener('resize', function () {
    ['hlTabs', 'bpTabbar', 'bpxNav'].forEach(function (id) { var b = document.getElementById(id); if (b) b._bpSl = null; });
    window.bpSlideTabs();
  });
})();
