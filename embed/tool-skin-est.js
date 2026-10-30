/* BuilderPro tool skin, cost calculators (preview): two layout touches the stylesheet
   can't do alone. Nothing about the questions, answers or math changes.
   - a tag (+8%, Full estimate) moves under its answer's label instead of squeezing it
   - the "Step 2 of 10" eyebrow is hidden (the top bar already says it) */
(function () {
  function tidy() {
    var root = document.getElementById('est-embed'); if (!root) return;
    [].forEach.call(root.querySelectorAll('.e-oi > .e-oi-tag'), function (t) {
      var info = t.parentNode.querySelector('.e-oi-info'); if (info) info.appendChild(t);
    });
    [].forEach.call(root.querySelectorAll('.e-seye'), function (e) { e.classList.toggle('bps-hide', /^\s*step\s+\d/i.test(e.textContent)); });
  }
  var t = 0, mo = new MutationObserver(function () { clearTimeout(t); t = setTimeout(tidy, 30); });
  function start() { tidy(); var r = document.getElementById('est-embed-shell') || document.body; mo.observe(r, { childList: true, subtree: true, characterData: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
