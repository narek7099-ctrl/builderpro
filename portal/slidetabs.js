/* Sliding tab highlight: one glassy pill behind the selected tab that glides
   to the next one when you switch, for the page tab row (#hlTabs) and the
   phone's bottom bar (#bpTabbar). The rows are rebuilt on every page change,
   so each remembers where its pill was and the new pill starts from there.
   Reduced motion: the pill just appears in place. */
(function () {
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DUR = 420;
  /* where the pill is right now, mid-glide included (the row can be redrawn
     while it is still moving, and the new pill has to carry on from there) */
  function now(st) {
    if (!st) return null;
    var k = Math.min(1, (Date.now() - st.t0) / DUR), e = 1 - Math.pow(1 - k, 3);
    return { x: st.x0 + (st.x1 - st.x0) * e, w: st.w0 + (st.w1 - st.w0) * e };
  }
  function slide(box, sel, ix, iy) {
    if (!box || box.hidden) return;
    var on = box.querySelector(sel), ind = box.querySelector(':scope > .bp-slide');
    if (!on || !on.offsetWidth) { if (ind) ind.style.opacity = '0'; return; }
    var fresh = false;
    if (!ind) { ind = document.createElement('span'); ind.className = 'bp-slide'; ind.setAttribute('aria-hidden', 'true'); box.insertBefore(ind, box.firstChild); fresh = true; }
    box.classList.add('has-slide');
    var x = on.offsetLeft + ix, w = on.offsetWidth - ix * 2;
    ind.style.top = (on.offsetTop + iy) + 'px'; ind.style.height = (on.offsetHeight - iy * 2) + 'px';
    var st = box._bpSl, cur = now(st);
    if (!fresh && st && st.x1 === x && st.w1 === w) return;   /* already there or on its way */
    if (fresh && cur && !RM) {
      ind.style.transition = 'none'; ind.style.transform = 'translateX(' + cur.x + 'px)'; ind.style.width = cur.w + 'px';
      void ind.offsetWidth; ind.style.transition = '';
    }
    ind.style.opacity = '1'; ind.style.transform = 'translateX(' + x + 'px)'; ind.style.width = w + 'px';
    box._bpSl = { x0: cur ? cur.x : x, w0: cur ? cur.w : w, x1: x, w1: w, t0: Date.now() };
  }
  window.bpSlideTabs = function () {
    requestAnimationFrame(function () {
      slide(document.getElementById('hlTabs'), '.hl-tab.on', 0, 6);
      slide(document.getElementById('bpTabbar'), '.bp-tab.on:not(.bp-tab-new)', 4, 2);
    });
  };
  window.addEventListener('resize', function () { window.bpSlideTabs(); });
})();
