/* ==================================================================
   Finances › QuickBooks

   Connect a QuickBooks Online company, say which account each kind of
   money goes to, and send. Everything runs through the quickbooks-sync
   edge function; the Intuit tokens never reach the browser. Coming back
   from Intuit lands on builderpro-os.com/#qb=<result>, which is turned
   into a toast and this page.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var money = function (n) { n = +n || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var api = function (p) { return window.bpAuthApi(window.BP_URL + '/functions/v1/quickbooks-sync', p); };
  var QB = window.QB = { st: null, acc: null, busy: '', err: '', map: null };

  var LBL = {
    bank: ['Pay expenses from', 'The bank or card account you buy materials with', ['Bank', 'Credit Card']],
    deposit: ['Deposit payments into', 'Where customer payments land', ['Bank', 'Other Current Asset']],
    income: ['Job income account', 'What payments count as', ['Income', 'Other Income']]
  };
  var CATTYPES = ['Expense', 'Cost of Goods Sold', 'Other Expense'];

  function load() {
    if (!live()) { QB.st = { ok: false, demo: true }; render(); return; }
    api({ op: 'status' }).then(function (d) {
      QB.st = d || { ok: false, error: 'No answer' };
      QB.map = JSON.parse(JSON.stringify((d && d.map) || {})); if (!QB.map.cats) QB.map.cats = {};
      render();
      if (d && d.connected && !QB.acc) api({ op: 'accounts' }).then(function (a) { QB.acc = (a && a.accounts) || []; if (a && !a.ok) QB.err = a.error || ''; render(); });
    }, function () { QB.st = { ok: false, error: 'Could not reach the server.' }; render(); });
  }
  window.bpQuickBooks = function () { css(); QB.acc = null; QB.st = null; render(); load(); };

  QB.connect = function () {
    QB.busy = 'connect'; render();
    api({ op: 'connect_url' }).then(function (d) {
      if (d && d.url) { location.href = d.url; return; }
      QB.busy = ''; QB.err = (d && d.error) || 'Could not start the connection.'; render();
    });
  };
  QB.disconnect = function () {
    if (!confirm('Disconnect QuickBooks? Nothing already sent is removed from QuickBooks.')) return;
    QB.busy = 'disc'; render();
    api({ op: 'disconnect' }).then(function () { QB.busy = ''; QB.acc = null; load(); });
  };
  QB.set = function (k, v, cat) { if (cat) QB.map.cats[k] = v; else QB.map[k] = v; };
  QB.save = function () {
    QB.busy = 'save'; QB.err = ''; render();
    api({ op: 'save_map', map: QB.map }).then(function (d) {
      QB.busy = '';
      if (d && d.ok) { QB.st.map = d.map; QB.map = JSON.parse(JSON.stringify(d.map)); window.bpToast && bpToast('Saved. You can send to QuickBooks now.'); }
      else QB.err = (d && d.error) || 'Could not save.';
      render();
    });
  };
  QB.sync = function () {
    QB.busy = 'sync'; QB.err = ''; render();
    api({ op: 'sync' }).then(function (d) {
      QB.busy = '';
      if (d && d.ok) {
        window.bpToast && bpToast(d.sent ? d.sent + ' item' + (d.sent === 1 ? '' : 's') + ' sent to QuickBooks' + (d.failed ? ', ' + d.failed + ' refused (see the log)' : '') + '.' : d.failed ? 'QuickBooks refused ' + d.failed + ' item' + (d.failed === 1 ? '' : 's') + '. See the log.' : 'Everything is already in QuickBooks.', d.failed ? 'warning' : undefined);
        if (d.more) window.bpToast && bpToast('There is more to send. Press Send again.', 'warning');
      } else QB.err = (d && d.error) || 'Send failed.';
      load();
    }, function () { QB.busy = ''; QB.err = 'Send failed.'; render(); });
  };

  function ready(m) { return !!(m && m.bank && m.income && m.cats && (m.cats.Materials || m.cats.Other)); }
  function sel(id, val, types, onch) {
    var list = (QB.acc || []).filter(function (a) { return types.indexOf(a.type) >= 0; });
    return '<select id="' + id + '" onchange="' + onch + '"><option value="">Choose…</option>'
      + list.map(function (a) { return '<option value="' + esc(a.id) + '"' + (String(val) === String(a.id) ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('')
      + '</select>';
  }
  function ago(t) { if (!t) return 'never'; var m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  var KIND = { customer: 'Customer', job: 'Job', vendor: 'Vendor', expense: 'Expense', payment: 'Payment', item: 'Setup' };

  function render() {
    var a = $('bpxViewArea'); if (!a || window._bpCurView !== 'quickbooks') return;
    var s = QB.st, h = '';
    var logo = '<span class="qb-logo">qb</span>';
    if (!s) { a.innerHTML = '<div class="bpx-panel"><div class="bpx-skel" style="width:40%"></div><div class="bpx-skel"></div></div>'; return; }
    if (s.demo) { a.innerHTML = '<div class="bpx-panel qb-hero">' + logo + '<div><b>QuickBooks</b><span>Sign in to connect your QuickBooks company.</span></div></div>'; return; }
    if (s.configured === false) { a.innerHTML = '<div class="bpx-panel qb-hero">' + logo + '<div><b>QuickBooks isn’t switched on yet</b><span>' + esc(s.error || '') + '</span></div></div>'; return; }
    if (!s.ok) { a.innerHTML = '<div class="sp-note bad"><span class="ms">error</span>' + esc(s.error || 'Something went wrong.') + ' <button class="bpx-rowbtn" onclick="bpQuickBooks()">Retry</button></div>'; return; }
    var err = QB.err ? '<div class="sp-note bad" style="margin-bottom:12px"><span class="ms">error</span>' + esc(QB.err) + '</div>' : '';

    if (!s.connected) {
      a.innerHTML = err + '<div class="bpx-panel qb-hero">' + logo
        + '<div><b>Send your books to QuickBooks</b><span>Customers, jobs, receipts and the payments you collect go across on their own, tagged to each job, so your accountant sees real job profit. Nothing in QuickBooks is changed or deleted, and nothing comes back the other way.</span></div>'
        + '<button class="bpx-addbtn" onclick="QB.connect()"' + (QB.busy ? ' disabled' : '') + '>' + (QB.busy === 'connect' ? 'Opening Intuit…' : 'Connect QuickBooks') + '</button></div>'
        + '<div class="qb-how">'
        + step(1, 'Connect', 'Sign in to Intuit and press Allow. BuilderPro only asks for access to your accounting.')
        + step(2, 'Pick your accounts', 'Choose the bank you pay from, where payments land, and an account for each kind of cost.')
        + step(3, 'Send', 'Press Send whenever you like. Each item goes once; anything QuickBooks refuses shows in the log with the reason.')
        + '</div>';
      return;
    }

    var m = QB.map || {}, saved = ready(s.map);
    h += err + '<div class="bpx-panel qb-conn">' + logo
      + '<div><b>' + esc(s.company || 'QuickBooks company') + (s.sandbox ? ' <span class="qb-test">Test company</span>' : '') + '</b>'
      + '<span>Connected ' + ago(s.connected_at) + ' · last sent ' + ago(s.last_sync) + '</span></div>'
      + '<button class="bpx-rowbtn" onclick="QB.disconnect()"' + (QB.busy ? ' disabled' : '') + '>Disconnect</button></div>';

    h += '<div class="bpx-panel qb-map"><div class="qb-h"><b>1. Where things go</b><span>Match BuilderPro to your chart of accounts. Ask your accountant if you are not sure.</span></div>';
    if (!QB.acc) h += '<div class="bpx-skel" style="width:60%"></div><div class="bpx-skel"></div>';
    else {
      h += '<div class="qb-grid">';
      Object.keys(LBL).forEach(function (k) { h += '<label><span>' + LBL[k][0] + '</span><small>' + LBL[k][1] + '</small>' + sel('qb-' + k, m[k], LBL[k][2], "QB.set('" + k + "',this.value)") + '</label>'; });
      (s.cats || []).forEach(function (c) { h += '<label><span>' + esc(c) + ' costs</span><small>Expenses filed as ' + esc(c) + '</small>' + sel('qb-c-' + c.replace(/\W/g, ''), (m.cats || {})[c], CATTYPES, "QB.set('" + c.replace(/'/g, "\\'") + "',this.value,1)") + '</label>'; });
      h += '</div><div class="qb-row"><button class="bpx-btn" style="width:auto" onclick="QB.save()"' + (QB.busy ? ' disabled' : '') + '>' + (QB.busy === 'save' ? 'Saving…' : 'Save accounts') + '</button>'
        + '<span class="bpx-mut">Costs without their own account go to Other, then Materials.</span></div>';
    }
    h += '</div>';

    h += '<div class="bpx-panel qb-send"><div class="qb-h"><b>2. Send to QuickBooks</b><span>' + (saved ? 'New customers, jobs, expenses and payments since the last send.' : 'Save your accounts first.') + '</span></div>'
      + '<button class="bpx-addbtn" onclick="QB.sync()"' + (!saved || QB.busy ? ' disabled' : '') + '>' + (QB.busy === 'sync' ? 'Sending…' : 'Send now') + '</button></div>';

    var log = s.log || [];
    h += '<div class="bpx-chead" style="margin:18px 0 8px"><div class="bpx-ptitle" style="margin:0">Sync log<span class="lg2">the last 40 things sent</span></div></div>'
      + '<div class="bpx-panel qb-log">' + (log.length ? log.map(function (r) {
        return '<div class="qb-lr"><span class="qb-dot ' + (r.ok ? 'ok' : 'bad') + '"></span><div class="qb-lm"><b>' + esc(KIND[r.kind] || r.kind) + ' · ' + esc(r.label || '') + '</b>'
          + (r.ok ? '' : '<span class="qb-why">' + esc(r.error || 'Refused') + '</span>') + '</div>'
          + (r.amount != null ? '<span class="qb-amt">' + money(r.amount) + '</span>' : '') + '<span class="bpx-mut qb-at">' + ago(r.at) + '</span></div>';
      }).join('') : '<div class="bpx-mut" style="padding:16px;text-align:center;font-size:13px">Nothing sent yet.</div>') + '</div>';
    a.innerHTML = h;
  }
  function step(n, t, d) { return '<div class="qb-step"><i>' + n + '</i><b>' + t + '</b><span>' + d + '</span></div>'; }

  /* back from Intuit: builderpro-os.com/#qb=connected|cancelled|expired|error */
  (function () {
    var m = /^#qb=(\w+)/.exec(location.hash || ''); if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    var msg = { connected: ['QuickBooks is connected. Pick your accounts next.', ''], cancelled: ['QuickBooks was not connected.', 'warning'], expired: ['That took too long. Press Connect QuickBooks again.', 'warning'], error: ['QuickBooks could not be connected. Try again.', 'error'] }[m[1]] || ['', ''];
    var n = 0, t = setInterval(function () {
      if (++n > 120) { clearInterval(t); return; }
      if (!window.bpNav || !$('bpxViewArea') || !window._bpCurView) return;
      clearInterval(t); bpNav('quickbooks'); if (msg[0] && window.bpToast) bpToast(msg[0], msg[1] || undefined);
    }, 500);
  })();

  function css() {
    if ($('qb-css')) return;
    var st = document.createElement('style'); st.id = 'qb-css';
    st.textContent = '#bpx .qb-logo{width:44px;height:44px;border-radius:50%;background:#2ca01c;color:#fff;font-weight:800;font-size:17px;line-height:1;display:flex;align-items:center;justify-content:center;flex:0 0 auto;letter-spacing:-.5px}'
      + '#bpx .qb-hero,#bpx .qb-conn,#bpx .qb-send{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:18px 20px}'
      + '#bpx .qb-hero>div,#bpx .qb-conn>div,#bpx .qb-h{flex:1 1 280px;display:flex;flex-direction:column;gap:4px;min-width:0}'
      + '#bpx .qb-hero b,#bpx .qb-conn b,#bpx .qb-h b{font-size:15.5px}#bpx .qb-hero span,#bpx .qb-conn span,#bpx .qb-h span{font-size:13px;color:#6b7280;line-height:1.5}'
      + '#bpx .qb-test{display:inline-block;margin-left:6px;font-size:11px;font-weight:650;padding:2px 8px;border-radius:999px;background:#fff4e6;color:#b45309;vertical-align:2px}'
      + '#bpx .qb-how{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}'
      + '#bpx .qb-step{background:#fff;border:1px solid #e6e9f0;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}'
      + '#bpx .qb-step i{width:24px;height:24px;border-radius:50%;background:#eef3ff;color:#1b56ee;font:700 12px/24px system-ui;text-align:center;font-style:normal;margin-bottom:4px}'
      + '#bpx .qb-step span{font-size:12.5px;color:#6b7280;line-height:1.5}'
      + '#bpx .qb-conn,#bpx .qb-map,#bpx .qb-send{margin-top:12px}#bpx .qb-map{padding:18px 20px}'
      + '#bpx .qb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin:14px 0}'
      + '#bpx .qb-grid label{display:flex;flex-direction:column;gap:2px;margin:0}#bpx .qb-grid label>span{font-size:13px;font-weight:650}#bpx .qb-grid small{font-size:11.5px;color:#6b7280;margin-bottom:4px}'
      + '#bpx .qb-grid select{width:100%}'
      + '#bpx .qb-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}#bpx .qb-row .bpx-mut{font-size:12.5px}'
      + '#bpx .qb-log{padding:4px 16px}#bpx .qb-lr{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line-2,#eef0f4)}#bpx .qb-lr:last-child{border-bottom:0}'
      + '#bpx .qb-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}#bpx .qb-dot.ok{background:#16a34a}#bpx .qb-dot.bad{background:#dc2626}'
      + '#bpx .qb-lm{flex:1;min-width:0;display:flex;flex-direction:column}#bpx .qb-lm b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '#bpx .qb-why{font-size:12px;color:#b91c1c}#bpx .qb-amt{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}#bpx .qb-at{font-size:12px;white-space:nowrap}'
      + '#bpx.bpx-dark .qb-step{background:#141b2b;border-color:#262f45}'
      + '@media(max-width:700px){#bpx .qb-how{grid-template-columns:1fr}}';
    document.head.appendChild(st);
  }
})();
