/* The pilot program: the first 20 sign-ups get their first month free (a 30-day
   trial instead of 14). This asks the database how many seats are left
   (pilot_seats(), public, numbers only), then:
     - fills every [data-pilot-left] / [data-pilot-total] with the count
     - sets <html data-pilot="on|off">, so .pilot-on text shows while seats are
       left and .pilot-off text (the normal 14 days) once they're gone
     - keeps the result on window.BP_PILOT and fires a "bp:pilot" event.
   With no answer, the page keeps showing the pilot wording (the launch state). */
(function () {
  'use strict';
  var URL = 'https://ttzwzouhiwdwamuimhpo.supabase.co/rest/v1/rpc/pilot_seats';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0end6b3VoaXdkd2FtdWltaHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTc2NjgsImV4cCI6MjA5ODY5MzY2OH0.oVqdHZlZLWJd_8nkgPRA9VgAqY4ytg51N1mT3Hqekso';
  function apply(d) {
    window.BP_PILOT = d;
    var on = !!(d && d.left > 0);
    document.documentElement.setAttribute('data-pilot', on ? 'on' : 'off');
    Array.prototype.forEach.call(document.querySelectorAll('[data-pilot-left]'), function (e) { e.textContent = d.left; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pilot-total]'), function (e) { e.textContent = d.total; });
    /* marketing pages: the pilot badge above the headline while seats are left */
    var h1 = document.querySelector('header.hero h1');
    if (on && h1 && !document.querySelector('.pilot-pill')) {
      var a = document.createElement('a');
      a.className = 'pilot-pill pilot-on'; a.href = '/signup.html';
      a.innerHTML = '<i aria-hidden="true"></i><b>Pilot program</b><span>First month free &middot; <em>' + d.left + '</em> of <em>' + d.total + '</em> seats left</span>';
      var k = h1.parentNode.querySelector('.kicker');   /* above the small label, on its own line */
      h1.parentNode.insertBefore(a, k || h1);
    }
    try { document.dispatchEvent(new CustomEvent('bp:pilot', { detail: d })); } catch (e) {}
  }
  fetch(URL, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: '{}' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && typeof d.left === 'number') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(d); }); else apply(d); } })
    .catch(function () {});
})();
