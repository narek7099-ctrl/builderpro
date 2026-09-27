/* ==================================================================
   Installations: what was installed, when, and when it needs service.

   Finishing a job now ends with a sign-off: the install date, what was
   put in, how often it needs maintenance (or that it needs none), and the
   contractor's signature. That record lives on the job (j.install), so it
   syncs with the rest of the job data. The Installations page lists every
   signed-off job and tracks the next service date; logging a service moves
   the clock forward.
   ================================================================== */
(function () {
  'use strict';
  var esc = function (x) { return window.bpEsc ? bpEsc(x) : String(x == null ? '' : x); };
  var $ = function (id) { return document.getElementById(id); };
  var jobs = function () { return window.bpJobsGet ? bpJobsGet() : []; };
  var DAY = 864e5;

  var PERIODS = [[0, 'No maintenance needed'], [3, 'Every 3 months'], [6, 'Every 6 months'], [12, 'Every year'], [24, 'Every 2 years'], [36, 'Every 3 years'], [60, 'Every 5 years']];
  var periodName = function (m) { var p = PERIODS.filter(function (x) { return x[0] === +m; })[0]; return p ? p[1] : (m ? 'Every ' + m + ' months' : 'None'); };

  /* sensible default by what the job was: HVAC and anything mechanical gets serviced */
  function guessPeriod(j) {
    var t = ((j.title || '') + ' ' + (j.trade || '') + ' ' + (j.name || '')).toLowerCase();
    if (/hvac|ac |a\/c|air cond|furnace|heat pump|mini.?split|boiler|duct/.test(t)) return 6;
    if (/water heater|tankless|generator|pool|spa|sprinkler|irrigation|septic|sump/.test(t)) return 12;
    if (/roof|gutter|solar|chimney/.test(t)) return 24;
    return 0;
  }
  var ymd = function (d) { d = new Date(d); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var nice = function (d) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
  var addMonths = function (t, m) { var d = new Date(t); var day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + m); var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return d.getTime(); };
  window.bpInstallNext = function (ins) {
    if (!ins || !+ins.period) return null;
    var from = ins.lastService || ins.date; return addMonths(from, +ins.period);
  };
  function state(ins) {
    var n = bpInstallNext(ins); if (!n) return { k: 'none', t: 'No maintenance', c: '#788493' };
    var left = Math.ceil((n - Date.now()) / DAY);
    if (left < 0) return { k: 'over', t: 'Overdue ' + (-left) + 'd', c: '#b91c1c', left: left };
    if (left <= 30) return { k: 'soon', t: 'Due in ' + left + 'd', c: '#b45309', left: left };
    return { k: 'ok', t: 'On schedule', c: '#15803d', left: left };
  }

  /* ---------- the signature pad ---------- */
  var SG = { drew: false, pad: null };
  function pad() {
    var cv = $('bpi-sig'); if (!cv) return; SG.drew = false;
    var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    var x = cv.getContext('2d'); x.scale(dpr, dpr); x.lineWidth = 2.2; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#0f172a'; SG.pad = x;
    var on = false, last = null, pt = function (e) { var b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    cv.addEventListener('pointerdown', function (e) { on = true; last = pt(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
    cv.addEventListener('pointermove', function (e) { if (!on) return; var p = pt(e); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p;
      if (!SG.drew) { SG.drew = true; var h = $('bpi-sighint'); if (h) h.style.opacity = '0'; } e.preventDefault(); });
    var stop = function () { on = false; }; cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
  }
  window.bpInstallSigClear = function () { var cv = $('bpi-sig'); if (!cv || !SG.pad) return; SG.pad.clearRect(0, 0, cv.width, cv.height); SG.drew = false; var h = $('bpi-sighint'); if (h) h.style.opacity = '1'; };

  function signoffHtml(j) {
    var ins = j.install || {}, per = ins.period != null ? +ins.period : guessPeriod(j);
    return '<div class="bpi-sign" id="bpi-sign"><div class="bpi-sign_h"><span class="ms">verified</span><b>Installation sign-off</b><em>Required</em></div>'
      + '<div class="bpi-grid"><div><label>Date installed</label><input type="date" id="bpi-date" value="' + ymd(ins.date || Date.now()) + '"></div>'
      + '<div><label>Maintenance</label><select id="bpi-per">' + PERIODS.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === per ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></div></div>'
      + '<label>What was installed <span class="bpx-mut">(optional)</span></label><input id="bpi-item" placeholder="e.g. Carrier 3-ton heat pump, model 25HCB6" value="' + esc(ins.item || '') + '">'
      + '<label>Your signature</label><div class="bpi-sigwrap"><canvas id="bpi-sig"></canvas><span id="bpi-sighint">Sign here with your finger or mouse</span>'
      + '<button type="button" class="bpi-sigclr" onclick="bpInstallSigClear()">Clear</button></div>'
      + (ins.sig ? '<div class="bpx-mut" style="font-size:12px;margin-top:6px">Signed ' + nice(ins.at) + '. Sign again to replace it, or leave blank to keep it.</div>' : '')
      + '<div class="bpi-err" id="bpi-err"></div></div>';
  }

  /* wrap "Mark job done": the sign-off goes into the same dialog */
  function wire() {
    if (typeof window.bpJobDoneOpen !== 'function' || typeof window.bpJobDoneSave !== 'function' || window.bpJobDoneOpen._bpi) return false;
    var open = window.bpJobDoneOpen, save = window.bpJobDoneSave;
    window.bpJobDoneOpen = function (id) {
      var r = open.apply(this, arguments);
      var j = jobs().filter(function (x) { return x.id === id; })[0]; var card = document.querySelector('#bpx-modal .bpx-modalcard');
      if (j && card) {
        var rows = card.querySelectorAll('.row'), row = rows[rows.length - 1] || card.lastElementChild;
        row.insertAdjacentHTML('beforebegin', signoffHtml(j)); setTimeout(pad, 30);
        var sk = card.querySelector('.bpx-skip'); if (sk && j.status !== 'done') sk.textContent = 'Skip the money — just sign off';
      }
      return r;
    };
    window.bpJobDoneOpen._bpi = 1;
    window.bpJobDoneSave = function (id) {
      var all = jobs(), j = all.filter(function (x) { return x.id === id; })[0]; if (!j) return save.apply(this, arguments);
      var err = $('bpi-err'), d = ($('bpi-date') || {}).value, prev = j.install || {};
      if (!$('bpi-sign')) return save.apply(this, arguments);
      if (!d) { if (err) err.textContent = 'Add the install date.'; return; }
      if (!SG.drew && !prev.sig) { if (err) err.textContent = 'Sign to finish the job.'; var w = document.querySelector('.bpi-sigwrap'); if (w) w.classList.add('bpi-need'); return; }
      j.install = {
        date: new Date(d + 'T12:00:00').getTime(), period: +($('bpi-per') || {}).value || 0, item: (($('bpi-item') || {}).value || '').trim(),
        sig: SG.drew ? $('bpi-sig').toDataURL('image/png') : prev.sig, at: SG.drew ? Date.now() : (prev.at || Date.now()),
        by: (window.BP_TEAM && BP_TEAM.name) || window._bpEmail || '', lastService: prev.lastService || null, services: prev.services || []
      };
      return save.apply(this, arguments);
    };
    return true;
  }
  if (!wire()) document.addEventListener('DOMContentLoaded', wire);

  /* ---------- the Installations page ---------- */
  var F = 'due';
  window.bpInstallFilter = function (f) { F = f; window.bpInstalls(); };
  window.bpInstalls = function () {
    var area = $('bpxViewArea'); if (!area) return;
    var list = jobs().filter(function (j) { return j.install; }).map(function (j) { return { j: j, s: state(j.install), n: bpInstallNext(j.install) }; });
    var unsigned = jobs().filter(function (j) { return j.status === 'done' && !j.install; });
    var cnt = { over: 0, soon: 0, ok: 0, none: 0 }; list.forEach(function (x) { cnt[x.s.k]++; });
    var show = list.filter(function (x) { return F === 'all' || (F === 'due' ? (x.s.k === 'over' || x.s.k === 'soon' || x.s.k === 'ok') : x.s.k === F); })
      .sort(function (a, b) { return (a.n || 9e15) - (b.n || 9e15); });
    var tile = function (k, n, t, c) { return '<button class="bpi-tile' + (F === k ? ' on' : '') + '" onclick="bpInstallFilter(\'' + k + '\')"><b style="color:' + c + '">' + n + '</b><span>' + t + '</span></button>'; };
    var h = '<div class="bpi-tiles">' + tile('over', cnt.over, 'Overdue', '#b91c1c') + tile('soon', cnt.soon, 'Due in 30 days', '#b45309') + tile('due', cnt.over + cnt.soon + cnt.ok, 'Need maintenance', '#006fff') + tile('all', list.length, 'All installations', '#001530') + '</div>';
    if (!list.length) h += '<div class="bpx-card bpi-empty"><span class="ms">construction</span><b>No installations yet</b><p>When you mark a job done you sign it off with the install date and how often it needs service. Signed-off jobs show up here with their next maintenance date.</p></div>';
    else h += '<div class="bpi-list">' + (show.length ? show.map(function (x) {
      var j = x.j, i = j.install;
      return '<div class="bpi-row"><div class="bpi-who"><b>' + esc(j.name || 'Customer') + '</b><span>' + esc(i.item || j.title || 'Installation') + '</span></div>'
        + '<div class="bpi-c"><em>Installed</em>' + nice(i.date) + '</div><div class="bpi-c"><em>Maintenance</em>' + periodName(i.period) + '</div>'
        + '<div class="bpi-c"><em>' + (i.lastService ? 'Last service ' + nice(i.lastService) : 'Next service') + '</em>' + (x.n ? nice(x.n) : '—') + '</div>'
        + '<div class="bpi-c"><span class="bpi-pill" style="color:' + x.s.c + ';background:' + x.s.c + '14">' + x.s.t + '</span></div>'
        + '<div class="bpi-act">' + (+i.period ? '<button class="bpx-rowbtn" onclick="bpInstallService(\'' + j.id + '\')">Log service</button>' : '')
        + '<button class="bpx-rowbtn" onclick="bpInstallView(\'' + j.id + '\')">Details</button></div></div>';
    }).join('') : '<div class="bpi-none">Nothing here right now.</div>') + '</div>';
    if (unsigned.length) h += '<div class="bpx-card bpi-uns"><b>' + unsigned.length + ' finished job' + (unsigned.length > 1 ? 's' : '') + ' without a sign-off</b><p>Finished before sign-offs existed. Add one to track their maintenance.</p><div class="bpi-unl">'
      + unsigned.slice(0, 12).map(function (j) { return '<button class="bpx-rowbtn" onclick="bpJobDoneOpen(\'' + j.id + '\')">' + esc(j.name || j.title || 'Job') + '</button>'; }).join('') + '</div></div>';
    area.innerHTML = h;
    if (window.bpSpin) bpSpin(false);
  };
  function refresh() { if (window._bpCurView === 'installations') window.bpInstalls(); }
  window.bpInstallService = function (id) {
    var all = jobs(), j = all.filter(function (x) { return x.id === id; })[0]; if (!j || !j.install) return;
    var d = prompt('Date of this service (YYYY-MM-DD):', ymd(Date.now())); if (!d) return;
    var t = new Date(d + 'T12:00:00').getTime(); if (isNaN(t)) { alert('That date did not look right.'); return; }
    j.install.lastService = t; (j.install.services = j.install.services || []).push(t);
    bpJobsSet(all); refresh();
  };
  window.bpInstallView = function (id) {
    var j = jobs().filter(function (x) { return x.id === id; })[0]; if (!j || !j.install) return; var i = j.install, n = bpInstallNext(i);
    bpModal('<h3>' + esc(j.name || 'Installation') + '</h3><div class="bpx-sub">' + esc(i.item || j.title || '') + '</div>'
      + '<div class="bpi-det"><div><em>Installed</em>' + nice(i.date) + '</div><div><em>Maintenance</em>' + periodName(i.period) + '</div><div><em>Next service</em>' + (n ? nice(n) : '—') + '</div><div><em>Services logged</em>' + ((i.services || []).length ? i.services.map(nice).join(', ') : 'None yet') + '</div></div>'
      + (i.sig ? '<label>Signed off' + (i.by ? ' by ' + esc(i.by) : '') + ' · ' + nice(i.at) + '</label><img class="bpi-sigimg" src="' + i.sig + '" alt="Signature">' : '')
      + '<div class="row" style="justify-content:flex-end;gap:10px"><button class="bpx-btn ghost" onclick="bpCloseModal();bpJobDoneOpen(\'' + j.id + '\')">Edit sign-off</button><button class="bpx-btn" onclick="bpCloseModal()">Done</button></div>');
  };

  var css = document.createElement('style');
  css.textContent = '.bpi-sign{margin:18px 0 6px;padding:16px;border:1px solid #dce3ec;border-radius:14px;background:#f8fafc}'
    + '.bpi-sign_h{display:flex;align-items:center;gap:8px;margin-bottom:6px}.bpi-sign_h .ms{color:#006fff}.bpi-sign_h b{font-size:15px}.bpi-sign_h em{margin-left:auto;font-style:normal;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#006fff;background:#e6f0ff;padding:3px 8px;border-radius:99px}'
    + '.bpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.bpi-sigwrap{position:relative;height:130px;border:1.5px dashed #c8d3df;border-radius:12px;background:#fff;touch-action:none}.bpi-sigwrap.bpi-need{border-color:#b91c1c}'
    + '.bpi-sigwrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair}#bpi-sighint{position:absolute;inset:0;display:grid;place-items:center;color:#9aa6b4;font-size:13px;pointer-events:none;transition:opacity .2s}'
    + '.bpi-sigclr{position:absolute;right:8px;top:8px;border:0;background:#eef3f8;border-radius:99px;padding:4px 10px;font-size:12px;cursor:pointer}.bpi-err{color:#b91c1c;font-size:13px;margin-top:6px;min-height:1em}'
    + '.bpi-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}.bpi-tile{background:#fff;border:1px solid #dce3ec;border-radius:16px;padding:16px 18px;text-align:left;cursor:pointer;font:inherit}.bpi-tile.on{border-color:#006fff;box-shadow:0 0 0 3px #e6f0ff}.bpi-tile b{display:block;font-size:28px;font-weight:600;letter-spacing:-.03em}.bpi-tile span{font-size:13px;color:#788493}'
    + '.bpi-list{background:#fff;border:1px solid #dce3ec;border-radius:16px;overflow:hidden}.bpi-row{display:grid;grid-template-columns:1.6fr 1fr 1.1fr 1.2fr 1fr auto;gap:12px;align-items:center;padding:14px 18px;border-top:1px solid #eef1f6}.bpi-row:first-child{border-top:0}'
    + '.bpi-who b{display:block;font-size:15px}.bpi-who span,.bpi-c em{display:block;font-size:12.5px;color:#788493;font-style:normal}.bpi-c{font-size:14px}.bpi-pill{display:inline-block;font-size:12px;font-weight:600;padding:5px 10px;border-radius:99px}.bpi-act{display:flex;gap:6px;justify-content:flex-end}'
    + '.bpi-none{padding:22px;text-align:center;color:#788493}.bpi-empty{text-align:center;padding:40px 28px}.bpi-empty .ms{font-size:34px;color:#006fff}.bpi-empty b{display:block;font-size:18px;margin:8px 0}.bpi-empty p,.bpi-uns p{color:#788493;max-width:520px;margin:0 auto}'
    + '.bpi-uns{margin-top:14px;padding:20px 22px}.bpi-uns p{margin:4px 0 12px}.bpi-unl{display:flex;flex-wrap:wrap;gap:6px}.bpi-det{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}.bpi-det em{display:block;font-style:normal;font-size:12px;color:#788493}.bpi-sigimg{display:block;max-width:100%;height:110px;object-fit:contain;border:1px solid #dce3ec;border-radius:12px;background:#fff;margin:6px 0 14px}'
    + '@media(max-width:820px){.bpi-tiles{grid-template-columns:1fr 1fr}.bpi-row{grid-template-columns:1fr 1fr}.bpi-who,.bpi-act{grid-column:1/-1}.bpi-act{justify-content:flex-start}.bpi-grid{grid-template-columns:1fr}}';
  document.head.appendChild(css);
})();
