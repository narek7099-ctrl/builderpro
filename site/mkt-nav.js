/* Nav for the marketing and compare pages: the Product and Tools menus, the
   phone sheet, the reading-progress line, and the live calculator's height. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function closeDd() { $$('.pnav_dd.open').forEach(function (d) { d.classList.remove('open'); $('.pnav_link', d).setAttribute('aria-expanded', 'false'); }); }
  $$('.pnav_dd').forEach(function (d) {
    var btn = $('.pnav_link', d), t = 0;
    var open = function () { clearTimeout(t); closeDd(); d.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); };
    btn.addEventListener('click', function (e) { e.stopPropagation(); d.classList.contains('open') ? closeDd() : open(); });
    d.addEventListener('mouseenter', function () { if (matchMedia('(hover:hover)').matches) open(); });
    d.addEventListener('mouseleave', function () { t = setTimeout(closeDd, 180); });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.pnav_dd')) closeDd(); });

  var sheet = $('#pnavSheet'), burger = $('.pnav_burger');
  function openSheet() { sheet.hidden = false; requestAnimationFrame(function () { sheet.classList.add('open'); }); burger.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; $('.pnav_close', sheet).focus(); }
  function closeSheet() { if (sheet.hidden) return; sheet.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; setTimeout(function () { sheet.hidden = true; }, 250); }
  if (sheet && burger) {
    burger.addEventListener('click', openSheet);
    $('.pnav_close', sheet).addEventListener('click', closeSheet);
    $$('a', sheet).forEach(function (a) { a.addEventListener('click', closeSheet); });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDd(); if (sheet) closeSheet(); } });

  var bar = $('.pnav_progress i');
  function prog() { var m = document.documentElement.scrollHeight - innerHeight; if (bar) bar.style.width = (m > 0 ? Math.min(1, scrollY / m) * 100 : 0) + '%'; }
  addEventListener('scroll', prog, { passive: true }); prog();

  /* cost calculator, damage check, health check: one frame, switched in place */
  var frame = $('.mk-frame'), NAMES = { cost: 'cost calculator', damage: 'damage check', health: 'health check' };
  function show(tool) {
    if (!frame || !NAMES[tool]) return;
    var f = $('iframe', frame), src = '/embed/' + (tool === 'cost' ? '' : tool + '-') + frame.dataset.trade + '.html';
    if (f.getAttribute('src') !== src) { f.setAttribute('src', src); f.style.height = ''; f.title = frame.dataset.word + ' ' + NAMES[tool]; }
    $$('.mk-tabs [data-tool]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tool === tool ? 'true' : 'false'); });
  }
  $$('[data-tool]').forEach(function (b) { b.addEventListener('click', function () { closeDd(); show(b.dataset.tool); }); });

  /* the calculator tells us how tall it is */
  addEventListener('message', function (e) {
    var d = e.data; if (!d || d.bp !== 'height' || !d.h) return;
    $$('.mk-frame iframe').forEach(function (f) { if (f.contentWindow === e.source) f.style.height = Math.max(520, Math.min(2400, d.h)) + 'px'; });
  });
})();
