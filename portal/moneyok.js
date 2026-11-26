/* Double confirmation for anything that moves money (2026-11-26, the owner's rule):
   sending an estimate or an invoice, marking pay as paid, paying or printing a check.
   The first tap opens this sheet; it says exactly who, how much and what happens, and
   only the second tap ("Yes, send $720.00") goes ahead.

   bpMoneyOk({ title, amount, who, how, lines: [..], cta, kind }) -> Promise<boolean>

   It sits on its own layer above any open pop-up, so the estimate or invoice form
   underneath stays as it was if the owner goes back. */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var m2 = function (n) { n = Math.round((+n || 0) * 100) / 100; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  function css() {
    if (document.getElementById('mok-css')) return;
    var c = document.createElement('style'); c.id = 'mok-css';
    c.textContent = '.mok{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,21,48,.5);animation:mokIn .18s ease both}'
      + '.mok-card{width:100%;max-width:420px;padding:24px 22px 18px;border-radius:22px;background:var(--card,#fff);color:var(--ink,#001530);box-shadow:0 30px 80px rgba(0,21,48,.35);text-align:center;font-family:var(--sans,inherit);animation:mokUp .22s cubic-bezier(.2,.8,.2,1) both}'
      + '.mok-ic{display:grid;place-items:center;width:52px;height:52px;margin:0 auto 12px;border-radius:50%;background:var(--blue-l,#e6f0ff);color:var(--blue,#006fff);font-size:26px}'
      + '.mok-t{margin:0;font-size:18px;font-weight:750;letter-spacing:-.01em}'
      + '.mok-amt{margin:10px 0 2px;font-size:34px;font-weight:800;letter-spacing:-.025em}'
      + '.mok-who{font-size:15px;font-weight:600}.mok-how{margin-top:2px;font-size:13.5px;color:var(--grey,#788493)}'
      + '.mok-ls{margin:14px 0 0;padding:10px 12px;border-radius:12px;background:var(--soft,#f4f7fa);text-align:left;font-size:13.5px;line-height:1.5;color:var(--ink,#001530);list-style:none}'
      + '.mok-ls li{display:flex;gap:8px}.mok-ls li::before{content:"\\2022";color:var(--grey,#788493)}'
      + '.mok-b{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:18px}'
      + '.mok-b button{height:48px;margin:0;border-radius:14px;font:650 15px/1 var(--sans,inherit);cursor:pointer;border:1px solid var(--line,rgba(0,0,0,.1));background:var(--card,#fff);color:var(--ink,#001530)}'
      + '.mok-b .go{border-color:#16c79a;background:#16c79a;color:#001530}.mok-b .go:hover{background:#12b38a}'
      + '@keyframes mokIn{from{background:rgba(0,21,48,0)}}@keyframes mokUp{from{transform:translateY(16px) scale(.98);opacity:0}}'
      + '@media (prefers-reduced-motion:reduce){.mok,.mok-card{animation:none}}';
    document.head.appendChild(c);
  }
  window.bpMoneyOk = function (o) {
    o = o || {}; css();
    return new Promise(function (res) {
      var old = document.getElementById('bpMoneyOk'); if (old) old.remove();
      var el = document.createElement('div'); el.id = 'bpMoneyOk'; el.className = 'mok'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'mokT');
      var ic = { estimate: 'request_quote', invoice: 'receipt_long', pay: 'payments', check: 'payments' }[o.kind] || 'payments';
      el.innerHTML = '<div class="mok-card"><div class="mok-ic"><span class="ms">' + ic + '</span></div>'
        + '<h3 class="mok-t" id="mokT">' + esc(o.title || 'Are you sure?') + '</h3>'
        + (o.amount != null ? '<div class="mok-amt">' + (typeof o.amount === 'string' ? esc(o.amount) : m2(o.amount)) + '</div>' : '')
        + (o.who ? '<div class="mok-who">' + esc(o.who) + '</div>' : '') + (o.how ? '<div class="mok-how">' + esc(o.how) + '</div>' : '')
        + (o.lines && o.lines.length ? '<ul class="mok-ls">' + o.lines.filter(Boolean).map(function (l) { return '<li><span>' + esc(l) + '</span></li>'; }).join('') + '</ul>' : '')
        + '<div class="mok-b"><button type="button" class="no">Go back</button><button type="button" class="go">' + esc(o.cta || 'Yes, go ahead') + '</button></div></div>';
      var done = function (v) { document.removeEventListener('keydown', key, true); el.remove(); res(v); };
      var key = function (e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } };
      el.addEventListener('click', function (e) { if (e.target === el) done(false); });
      el.querySelector('.no').onclick = function () { done(false); };
      el.querySelector('.go').onclick = function () { if (window.bpHaptic) bpHaptic('medium'); done(true); };
      document.addEventListener('keydown', key, true);
      (document.getElementById('bpx') || document.body).appendChild(el);
      setTimeout(function () { var b = el.querySelector('.no'); if (b) b.focus(); }, 30);
    });
  };
  window.bpMoneyFmt2 = m2;
})();
