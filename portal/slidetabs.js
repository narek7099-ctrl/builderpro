/* Tab pill that stretches: one pill behind the selected tab, for the page tab
   row (#hlTabs) and the phone's bottom bar (#bpTabbar). When you switch, the
   edge on the side it's heading leaves first (0.36s) and the other edge
   catches up (0.55s), so the pill stretches toward the new tab and settles,
   the way the kitchen-fitter reel does it (their GSAP lead/trail edges; ours
   is a small frame loop with the same timings and power3-out easing).
   The rows are redrawn on every page change; each row keeps its pill's
   current edges on the element, so a redraw mid-move carries on smoothly.
   Reduced motion: the pill just appears in place. */
(function () {
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LEAD = 360, TRAIL = 550;
  var ease = function (k) { return 1 - Math.pow(1 - k, 3); };   /* power3.out */
  function paint(ind, st) { ind.style.transform = 'translateX(' + st.l + 'px)'; ind.style.width = Math.max(0, st.r - st.l) + 'px'; }
  function slide(box, sel, ix, iy) {
    if (!box || box.hidden) return;
    var on = box.querySelector(sel), ind = box.querySelector(':scope > .bp-slide');
    if (!on || !on.offsetWidth) { if (ind) ind.style.opacity = '0'; return; }
    if (!ind) { ind = document.createElement('span'); ind.className = 'bp-slide'; ind.setAttribute('aria-hidden', 'true'); box.insertBefore(ind, box.firstChild); }
    box.classList.add('has-slide');
    ind.style.top = (on.offsetTop + iy) + 'px'; ind.style.height = (on.offsetHeight - iy * 2) + 'px';
    var to = { l: on.offsetLeft + ix, r: on.offsetLeft + on.offsetWidth - ix };
    var sl = box._bpSl;
    ind.style.opacity = '1';
    if (!sl || RM) { box._bpSl = { cur: { l: to.l, r: to.r }, to: to }; paint(ind, box._bpSl.cur); return; }
    if (sl.to.l === to.l && sl.to.r === to.r) { paint(ind, sl.cur); return; }   /* redrawn, same tab: stay put */
    if (sl.raf) cancelAnimationFrame(sl.raf);
    var from = { l: sl.cur.l, r: sl.cur.r }, fwd = to.l > from.l, t0 = performance.now();
    var lead = fwd ? 'r' : 'l', trail = fwd ? 'l' : 'r';
    sl.to = to;
    var step = function (t) {
      var a = Math.min(1, (t - t0) / LEAD), b = Math.min(1, (t - t0) / TRAIL);
      sl.cur[lead] = from[lead] + (to[lead] - from[lead]) * ease(a);
      sl.cur[trail] = from[trail] + (to[trail] - from[trail]) * ease(b);
      var live = box.querySelector(':scope > .bp-slide'); if (live) paint(live, sl.cur);
      sl.raf = b < 1 ? requestAnimationFrame(step) : 0;
    };
    sl.raf = requestAnimationFrame(step);
  }
  window.bpSlideTabs = function () {
    requestAnimationFrame(function () {
      slide(document.getElementById('hlTabs'), '.hl-tab.on', 0, 4);
      slide(document.getElementById('bpTabbar'), '.bp-tab.on:not(.bp-tab-new)', 4, 4);
    });
  };
  window.addEventListener('resize', function () {
    ['hlTabs', 'bpTabbar'].forEach(function (id) { var b = document.getElementById(id); if (b) b._bpSl = null; });
    window.bpSlideTabs();
  });
})();
