/* The moving silk-light background behind the app (2026-11-13), the same one
   as the website (site/silk.js, after the reference reel). It is drawn in a
   background thread, so the app's own thread never spends a frame on it.
   It sits on a fixed canvas at the very back of the app (#bpxRib, z-index -1
   inside #bpx); the app's white (or dark) wash moves onto #bpx behind it
   (portal/glass.css, .bp-rib). The glass cards keep their look without a live
   blur. It follows the page's scrolling and the theme, and rests while the
   app is closed or a popup covers the page. */
(function () {
  'use strict';
  var host = document.getElementById('bpx');
  if (!host || !window.bpSilk || document.getElementById('bpxRib')) return;
  var dark = function () { return host.classList.contains('bpx-dark'); };
  /* the threads meet just past the sidebar on a computer, further left on a phone */
  var silk = window.bpSilk(host, { dark: dark(), waist: window.innerWidth > 900 ? 0.46 : 0.3 });
  if (!silk) return;
  silk.canvas.id = 'bpxRib';
  host.classList.add('bp-rib');
  var popup = function () {
    var md = document.getElementById('bpx-modal');
    return !!(md && md.offsetParent !== null && getComputedStyle(md).display !== 'none');
  };
  var sync = function () { silk.dark(dark()); silk.active(host.classList.contains('open') && !popup()); };
  new MutationObserver(sync).observe(host, { attributes: true, attributeFilter: ['class'] });
  setInterval(sync, 1000);   /* popups come and go from many places: a cheap look once a second */
  sync();
  document.addEventListener('scroll', function (e) {
    var m = e.target; if (m && m.classList && m.classList.contains('bpx-main')) silk.scroll(m.scrollTop);
  }, { capture: true, passive: true });
})();
