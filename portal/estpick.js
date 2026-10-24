/* ==================================================================
   The customer's Good / Better / Best page: #est=<token>

   No login, like the signing page: the token in the link is the
   credential, and everything goes through the estimate-options function.
   They see the three options side by side, pick one, sign with a finger,
   and that's their yes. The contractor is told at once, and the pick
   becomes the accepted estimate in their HighLevel, so the deposit and the
   rest follow on their own.
   ================================================================== */
(function () {
  'use strict';
  var m = /[#&]est=([a-f0-9]{24,64})/i.exec(location.hash || '');
  if (!m) return;
  var TOKEN = m[1], URL_FN = (window.BP_URL || 'https://ttzwzouhiwdwamuimhpo.supabase.co') + '/functions/v1/estimate-options';
  var S = { o: null, pick: '', drew: false, pad: null, busy: false };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n) { return '$' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var date = function (s) { var d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };
  var api = function (body) {
    var k = window.BP_ANON || '';
    var go = function () { return fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: k, Authorization: 'Bearer ' + k }, body: JSON.stringify(body) }); };
    /* a dropped connection (phone switching networks, a server waking up) gets one quiet retry */
    return go().catch(function () { return new Promise(function (r) { setTimeout(r, 1500); }).then(go); }).then(function (r) { return r.json(); });
  };

  function host() {
    var h = document.getElementById('bpSign');
    if (!h) { h = document.createElement('div'); h.id = 'bpSign'; document.body.appendChild(h); }
    return h;
  }
  function start() {
    document.documentElement.classList.add('bp-signing-boot');
    document.body.classList.add('bp-signing');
    var h = host();
    h.innerHTML = '<div class="sg-wrap"><div class="sg-card ep-card"><div class="sg-load">Loading your options…</div></div></div>';
    api({ op: 'get', token: TOKEN }).then(function (d) {
      if (!d || !d.ok) { fail(d && d.error === 'void' ? 'These options were replaced or withdrawn. Check your messages for a newer link, or ask your contractor to send it again.' : 'We couldn’t find these options. Check the link, or ask your contractor to send it again.'); return; }
      S.o = d.options;
      /* one option sent on its own is a plain estimate: nothing to pick */
      if ((S.o.tiers || []).length === 1 && S.o.status !== 'chosen') S.pick = S.o.tiers[0].key;
      brand(); draw();
      if (window.bpCustLink) bpCustLink.seen('est', TOKEN, { title: S.o.title, biz: (S.o.company || {}).name, name: S.o.customer, email: S.o.email });
    }, function () { fail('We couldn’t load your options just now. Check your connection and reload the page.'); });
  }
  function brand() {
    var co = (S.o && S.o.company) || {}, h = host();
    var st = window.bpBrandVars ? bpBrandVars(co.color) : '';
    if (st) { h.setAttribute('style', st); h.classList.add('br'); }
    document.title = (co.name ? co.name + ' · ' : '') + ((S.o.tiers || []).length === 1 ? 'Your estimate' : 'Your estimate options');
  }
  function head() {
    var co = (S.o && S.o.company) || {};
    if (co.logo) return '<div class="sg-brand"><img class="sg-logo" src="' + esc(co.logo) + '" alt="' + esc(co.name || 'Contractor logo') + '"></div>';
    return co.name ? '<div class="sg-brand"><span class="sg-mono" aria-hidden="true">' + esc(co.name.charAt(0).toUpperCase()) + '</span><b class="sg-co">' + esc(co.name) + '</b></div>' : '';
  }
  var pow = function () { return window.bpPoweredBy ? bpPoweredBy() : ''; };
  function fail(msg) {
    host().innerHTML = '<div class="sg-wrap"><div class="sg-card">' + (S.o ? head() : '') + '<h1 class="sg-h">Options unavailable</h1><p class="sg-p">' + esc(msg) + '</p></div>' + pow() + '</div>';
  }
  var solo = function (o) { return (o.tiers || []).length === 1; };
  function card(t, o) {
    if (solo(o)) return soloCard(t, o);
    var rec = o.recommended === t.key, on = S.pick === t.key, done = o.status === 'chosen', mine = done && o.chosen === t.key;
    return '<div class="ep-opt k-' + esc(t.key) + (rec ? ' rec' : '') + (on || mine ? ' on' : '') + (done && !mine ? ' dim' : '') + '"' + (done ? '' : ' role="button" tabindex="0" onclick="bpEpPick(\'' + esc(t.key) + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();bpEpPick(\'' + esc(t.key) + '\')}"') + '>'
      + (rec && !done ? '<span class="ep-badge">Most popular</span>' : '') + (mine ? '<span class="ep-badge ok">Your pick</span>' : '')
      + '<span class="ep-k">' + esc(t.name) + '</span><h2>' + esc(t.title || t.name) + '</h2>' + (t.summary ? '<p class="ep-sum">' + esc(t.summary) + '</p>' : '')
      + '<div class="ep-price">' + money(t.total) + '</div>' + (t.tax ? '<div class="ep-tax">Includes ' + money(t.tax) + ' sales tax</div>' : '<div class="ep-tax">Total price</div>')
      + ((t.bullets || []).length ? '<ul>' + t.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '')
      + (t.warranty ? '<div class="ep-w"><b>Warranty</b>' + esc(t.warranty) + '</div>' : '')
      + ((t.lines || []).length && o.show !== 'total' ? '<details onclick="event.stopPropagation()"><summary>What’s in the price</summary>' + t.lines.map(function (l) { return '<div class="ep-l"><span>' + esc(l.name) + ((+l.qty || 1) !== 1 ? ' <small>× ' + (+l.qty) + '</small>' : '') + '</span><b>' + money((+l.qty || 0) * (+l.price || 0)) + '</b></div>'; }).join('')
        + (t.tax ? '<div class="ep-l"><span>Sales tax</span><b>' + money(t.tax) + '</b></div>' : '') + (t.disc ? '<div class="ep-l"><span>Discount</span><b>&minus;' + money(t.disc) + '</b></div>' : '') + '</details>' : '')
      + (done ? '' : '<span class="ep-choose">' + (on ? '<span class="ep-tick">✓</span>Selected' : 'Choose ' + esc(t.name)) + '</span>')
      + '</div>';
  }
  /* the estimate itself, every line showing, when there is only the one */
  function soloCard(t, o) {
    var lines = (t.lines || []);
    return '<div class="ep-opt ep-solo">'
      + (t.title && t.title !== t.name ? '<span class="ep-k">' + esc(t.title) + '</span>' : '')
      + (t.summary ? '<p class="ep-sum">' + esc(t.summary) + '</p>' : '')
      + ((t.bullets || []).length ? '<ul>' + t.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '')
      + (lines.length && o.show !== 'total' ? '<div class="ep-lines">' + lines.map(function (l) { return '<div class="ep-l"><span>' + esc(l.name) + ((+l.qty || 1) !== 1 ? ' <small>× ' + (+l.qty) + '</small>' : '') + (l.desc ? '<small class="ep-ld">' + esc(l.desc) + '</small>' : '') + '</span><b>' + money((+l.qty || 0) * (+l.price || 0)) + '</b></div>'; }).join('')
        + (t.tax ? '<div class="ep-l"><span>Sales tax</span><b>' + money(t.tax) + '</b></div>' : '') + (t.disc ? '<div class="ep-l"><span>Discount</span><b>&minus;' + money(t.disc) + '</b></div>' : '') + '</div>' : '')
      + '<div class="ep-tot"><span>Total' + (t.tax && o.show === 'total' ? ' <small>incl. ' + money(t.tax) + ' tax</small>' : '') + '</span><b>' + money(t.total) + '</b></div>'
      + (t.warranty ? '<div class="ep-w"><b>Warranty</b>' + esc(t.warranty) + '</div>' : '')
      + '</div>';
  }
  function draw() {
    var o = S.o, h = host(); if (!o) return;
    var first = String(o.customer || '').split(/\s+/)[0];
    if (o.status === 'chosen') return doneView();
    if (o.status === 'declined') { h.innerHTML = '<div class="sg-wrap"><div class="sg-card">' + head() + '<h1 class="sg-h">You passed on ' + (solo(o) ? 'this estimate' : 'these options') + '</h1><p class="sg-p">Your contractor has been told. If you change your mind or want something different, just reply to their message and they can send new options.</p></div>' + pow() + '</div>'; return; }
    if (o.expired) { var ph = (o.company || {}).phone; h.innerHTML = '<div class="sg-wrap"><div class="sg-card">' + head() + '<h1 class="sg-h">These prices have expired</h1><p class="sg-p">Prices were good until ' + esc(date(o.expires_at)) + '. Ask your contractor for an updated estimate' + (ph ? ': <a href="tel:' + esc(ph) + '">' + esc(ph) + '</a>' : '') + '.</p></div>' + pow() + '</div>'; return; }
    var t = (o.tiers || []).filter(function (x) { return x.key === S.pick; })[0];
    h.innerHTML = '<div class="sg-wrap"><div class="sg-card ep-card">' + head()
      + (solo(o) ? '<h1 class="sg-h">' + esc(o.title || 'Your estimate') + '</h1>'
          + '<p class="sg-p">' + (first ? 'Prepared for ' + esc(first) + (o.addr ? ' at ' + esc(o.addr) : '') + '. ' : o.addr ? esc(o.addr) + '. ' : '') + 'Good until ' + esc(date(o.expires_at)) + '. Look it over, then sign below to approve.</p>'
        : '<h1 class="sg-h">' + (first ? esc(first) + ', pick the option that fits' : 'Pick the option that fits') + '</h1>'
          + '<p class="sg-p">' + esc(o.title || 'Your estimate') + (o.addr ? ' at ' + esc(o.addr) : '') + '. Each option is a complete job; they differ in materials, extras and warranty. Prices are good until ' + esc(date(o.expires_at)) + '.</p>')
      + (o.scope ? '<div class="ep-scope"><b>Scope of work</b><p>' + esc(o.scope) + '</p></div>' : '')
      + '<div class="ep-grid n' + (o.tiers || []).length + '">' + (o.tiers || []).map(function (x) { return card(x, o); }).join('') + '</div>'
      + '<div class="ep-signbox" id="epSign"' + (t ? '' : ' hidden') + '>'
        + (t && !solo(o) ? '<div class="ep-sel"><span>You picked</span><b>' + esc(t.name) + ': ' + esc(t.title || '') + '</b><strong>' + money(t.total) + '</strong></div>' : '')
        + '<div class="sg-lbl">Sign to approve</div>'
        + '<div class="sg-padwrap"><canvas id="epPad" class="sg-pad"></canvas><button class="sg-clear" onclick="bpEpClear()">Clear</button><span class="sg-hint" id="epHint">Draw your signature with your finger</span></div>'
        + '<label class="sg-f"><span>Your full name</span><input id="epName" autocomplete="name" placeholder="Type your name" oninput="bpEpCheck()"></label>'
        + '<label class="sg-consent"><input type="checkbox" id="epOk" onchange="bpEpCheck()"><span>I approve ' + (solo(o) ? 'this estimate' : 'this option') + ' at the price shown and agree to sign electronically. My electronic signature is as binding as one on paper.</span></label>'
        + '<div class="sg-msg" id="epMsg"></div>'
        + '<button class="sg-btn" id="epGo" disabled onclick="bpEpSubmit()">Approve ' + (t ? (solo(o) ? '' : esc(t.name) + ' · ') + money(t.total) : '') + '</button>'
      + '</div>'
      + '<button class="sg-decline" onclick="bpEpDecline()">' + (solo(o) ? 'This doesn’t work for me' : 'None of these work for me') + '</button>'
      + '<div class="sg-foot">Your name, the time you signed and your IP address are recorded with your approval, as required for electronic signatures in the US. Questions? Reply to the message this link came in.</div>'
      + '</div>' + pow() + '</div>';
    if (t) pad();
  }
  window.bpEpPick = function (k) {
    if (S.busy || !S.o || S.o.status === 'chosen') return;
    var keep = { name: ((document.getElementById('epName') || {}).value || ''), ok: !!(document.getElementById('epOk') || {}).checked };
    S.pick = k; S.drew = false; draw();
    var n = document.getElementById('epName'); if (n) n.value = keep.name;
    var c = document.getElementById('epOk'); if (c) c.checked = keep.ok;
    var box = document.getElementById('epSign'); if (box && box.scrollIntoView) setTimeout(function () { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 40);
    bpEpCheck();
  };
  function pad() {
    var cv = document.getElementById('epPad'); if (!cv) return;
    var fit = function () {
      if (!document.contains(cv)) return;
      var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      var x = cv.getContext('2d'); x.scale(dpr, dpr); x.lineWidth = 2.2; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#0f172a';
      S.pad = x; S.drew = false; var hint = document.getElementById('epHint'); if (hint) hint.style.opacity = ''; bpEpCheck();
    };
    fit();
    var drawing = false, last = null;
    var pt = function (e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', function (e) { drawing = true; last = pt(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
    cv.addEventListener('pointermove', function (e) {
      if (!drawing) return; var p = pt(e), x = S.pad;
      x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p;
      if (!S.drew) { S.drew = true; var hint = document.getElementById('epHint'); if (hint) hint.style.opacity = '0'; bpEpCheck(); }
      e.preventDefault();
    });
    var stop = function () { drawing = false; };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop); cv.addEventListener('pointerleave', stop);
  }
  window.bpEpClear = function () {
    var cv = document.getElementById('epPad'); if (!cv || !S.pad) return;
    S.pad.clearRect(0, 0, cv.width, cv.height); S.drew = false;
    var hint = document.getElementById('epHint'); if (hint) hint.style.opacity = ''; bpEpCheck();
  };
  window.bpEpCheck = function () {
    var n = ((document.getElementById('epName') || {}).value || '').trim();
    var ok = !!S.pick && n.length >= 2 && S.drew && (document.getElementById('epOk') || {}).checked;
    var b = document.getElementById('epGo'); if (b) b.disabled = !ok;
  };
  window.bpEpSubmit = function () {
    var b = document.getElementById('epGo'), msg = document.getElementById('epMsg'), cv = document.getElementById('epPad');
    var name = ((document.getElementById('epName') || {}).value || '').trim();
    if (!S.pick || !name || !S.drew) { if (msg) msg.textContent = 'Pick an option, then sign and type your name.'; return; }
    S.busy = true; b.disabled = true; b.textContent = 'Approving…';
    api({ op: 'choose', token: TOKEN, key: S.pick, name: name, signature: cv.toDataURL('image/png'), consent: true }).then(function (d) {
      S.busy = false;
      if (!d || !d.ok) { b.disabled = false; b.textContent = 'Try again'; if (msg) msg.textContent = (d && d.error) || 'Something went wrong. Please try again.'; return; }
      S.o = d.options || S.o; if (S.o.status !== 'chosen') { S.o.status = 'chosen'; S.o.chosen = S.pick; S.o.signer_name = name; }
      doneView(); window.scrollTo(0, 0);
      if (window.bpCustLink) bpCustLink.after('est');
    }, function () { S.busy = false; b.disabled = false; b.textContent = 'Try again'; if (msg) msg.textContent = 'Couldn’t reach the server. Check your connection and try again.'; });
  };
  window.bpEpDecline = function () {
    var note = prompt((solo(S.o) ? 'Sorry it doesn’t fit.' : 'Sorry these don’t fit.') + ' What would work better? (Optional, your contractor will see this.)', '');
    if (note === null) return;
    api({ op: 'decline', token: TOKEN, note: note }).then(function () { S.o.status = 'declined'; draw(); }, function () {});
  };
  function doneView() {
    var o = S.o, t = (o.tiers || []).filter(function (x) { return x.key === o.chosen; })[0] || {}, co = o.company || {};
    var first = String(o.signer_name || o.customer || '').split(/\s+/)[0];
    host().innerHTML = '<div class="sg-wrap"><div class="sg-card ep-card ep-done">' + head()
      + '<div class="sg-tick">✓</div><h1 class="sg-h" style="text-align:center">You’re all set' + (first ? ', ' + esc(first) : '') + '</h1>'
      + '<p class="sg-p" style="text-align:center">' + esc(co.name || 'Your contractor') + ' has your approval' + (solo(o) ? '' : ' for the <b>' + esc(t.name || '') + '</b> option') + '. They’ll be in touch with the next step, usually a deposit to get you on the schedule.</p>'
      + '<div class="ep-grid one">' + card(t, o) + '</div>'
      + '<div class="sg-signed"><div class="sg-lbl">Approved by</div><span class="nm">' + esc(o.signer_name || '') + '</span>' + (o.chosen_at ? '<div class="sg-when">' + esc(new Date(o.chosen_at).toLocaleString('en-US')) + '</div>' : '') + '</div>'
      + '<button class="sg-btn" style="margin-top:18px" onclick="window.print()">Print / save a copy</button>'
      + '</div>' + pow() + '</div>';
  }

  var css = document.createElement('style');
  css.textContent = '#bpSign .sg-card.ep-card{max-width:1080px}'
    + '#bpSign .ep-scope{background:#f6f8fb;border:1px solid #e4e9f0;border-radius:12px;padding:12px 14px;margin:0 0 18px}#bpSign .ep-scope b{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280}#bpSign .ep-scope p{margin:4px 0 0;font-size:14px;line-height:1.6;color:#26262a;white-space:pre-line}'
    + '#bpSign .ep-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:22px 0 8px;align-items:stretch}#bpSign .ep-grid.one{grid-template-columns:minmax(0,420px);justify-content:center}'
    + '#bpSign .ep-opt{position:relative;display:flex;flex-direction:column;border:1.5px solid #e4e9f0;border-radius:18px;padding:24px 20px 18px;background:#fff;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .15s;text-align:left}'
    + '#bpSign .ep-opt:hover{border-color:#b9c6d8;transform:translateY(-2px)}#bpSign .ep-opt:focus-visible{outline:3px solid var(--hp-ring,rgba(47,107,255,.25));outline-offset:2px}'
    + '#bpSign .ep-opt.rec{border-color:var(--hp-blue,#2f6bff)}#bpSign .ep-opt.on{border:2.5px solid var(--hp-blue,#2f6bff);box-shadow:0 10px 30px rgba(16,24,40,.12)}#bpSign .ep-opt.dim{opacity:.5;cursor:default}#bpSign .ep-done .ep-opt{cursor:default}'
    + '#bpSign .ep-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--hp-blue,#2f6bff);color:var(--hp-on,#fff);font-size:11.5px;font-weight:700;padding:4px 12px;border-radius:99px;white-space:nowrap}#bpSign .ep-badge.ok{background:#15803d;color:#fff}'
    + '#bpSign .ep-k{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--hp-blue2,#1d4ed8)}'
    + '#bpSign .ep-opt h2{margin:6px 0 4px;font-size:19px;line-height:1.25;letter-spacing:-.02em;color:#0c0c0d}#bpSign .ep-sum{margin:0;font-size:13.5px;line-height:1.5;color:#4b5563}'
    + '#bpSign .ep-price{font-size:32px;font-weight:700;letter-spacing:-.04em;color:#0c0c0d;margin:14px 0 0}#bpSign .ep-tax{font-size:12px;color:#8b93a1;margin-bottom:14px}'
    + '#bpSign .ep-opt ul{list-style:none;margin:0 0 12px;padding:0;flex:1}#bpSign .ep-opt li{position:relative;padding-left:24px;margin:8px 0;font-size:14px;line-height:1.45;color:#26262a}'
    + '#bpSign .ep-opt li::before{content:"";position:absolute;left:4px;top:5px;width:9px;height:5px;border-left:2.2px solid #15803d;border-bottom:2.2px solid #15803d;transform:rotate(-45deg)}'
    + '#bpSign .ep-w{font-size:13px;color:#4b5563;background:#f6f8fb;border-radius:10px;padding:9px 11px;margin-bottom:12px}#bpSign .ep-w b{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280}'
    + '#bpSign .ep-opt details{margin-bottom:12px;font-size:13px}#bpSign .ep-opt summary{cursor:pointer;color:var(--hp-blue2,#1d4ed8);font-weight:600}#bpSign .ep-l{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px dashed #e4e9f0}#bpSign .ep-l small{color:#8b93a1}'
    + '#bpSign .ep-choose{display:block;text-align:center;margin-top:auto;padding:12px;border-radius:12px;font-weight:700;font-size:15px;border:1.5px solid var(--hp-blue,#2f6bff);color:var(--hp-blue2,#1d4ed8)}#bpSign .ep-opt.on .ep-choose{background:var(--hp-blue,#2f6bff);color:var(--hp-on,#fff)}#bpSign .ep-tick{margin-right:6px}'
    + '#bpSign .ep-signbox{margin-top:22px;padding:20px;border:1px solid #e4e9f0;border-radius:16px;background:#fcfdfe;max-width:560px;margin-left:auto;margin-right:auto}#bpSign .ep-signbox[hidden]{display:none}'
    + '#bpSign .ep-sel{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:16px}#bpSign .ep-sel span{width:100%;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;font-weight:600}#bpSign .ep-sel b{font-size:16px;color:#0c0c0d}#bpSign .ep-sel strong{margin-left:auto;font-size:20px;color:#0c0c0d}'
    + '#bpSign .ep-grid.n2{grid-template-columns:repeat(2,minmax(0,1fr));max-width:760px;margin-left:auto;margin-right:auto}'
    + '@media(max-width:820px){#bpSign .ep-grid,#bpSign .ep-grid.n2{grid-template-columns:1fr;gap:20px}#bpSign .ep-opt{padding:22px 18px 16px}}'
    + '#bpSign .ep-solo{cursor:default;padding:18px 20px}#bpSign .ep-solo:hover{transform:none;border-color:#e4e9f0}#bpSign .ep-lines{margin:4px 0 6px}#bpSign .ep-l span{min-width:0}#bpSign .ep-ld{display:block;color:#8b93a1;font-size:12px;margin-top:1px}'
    + '#bpSign .ep-tot{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:14px 0 6px;font-weight:700;color:#0c0c0d}#bpSign .ep-tot span{font-size:15px}#bpSign .ep-tot small{font-weight:500;color:#8b93a1;font-size:12px}#bpSign .ep-tot b{font-size:28px;letter-spacing:-.03em}'
    + '#bpSign .ep-grid.n1{grid-template-columns:minmax(0,640px);justify-content:center}'
    + '@media print{#bpSign .ep-opt{break-inside:avoid}}';
  document.head.appendChild(css);
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
