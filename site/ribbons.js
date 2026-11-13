/* The website's moving background on the other pages (marketing, calculators,
   compare, sign-up, help, legal): the silk-light ribbon from site/silk.js, the
   same one the homepage and the app use. Drawn in a background thread. */
(function () {
  'use strict';
  if (!document.body || document.getElementById('dlRibbons')) return;
  function go() {
    var s = window.bpSilk && window.bpSilk(document.body, { waist: 0.36 });
    if (!s) return;
    s.canvas.id = 'dlRibbons';
    window.addEventListener('scroll', function () { s.scroll(window.scrollY || 0); }, { passive: true });
  }
  if (window.bpSilk) go();
  else { var sc = document.createElement('script'); sc.src = '/site/silk.js?v=20261113b'; sc.onload = go; document.head.appendChild(sc); }
})();
