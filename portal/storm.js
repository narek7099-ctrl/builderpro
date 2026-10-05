/* ==================================================================
   Storm alerts (owner side). The ghl-events function finds hail and wind
   reports near past customers and writes a storm_alerts row; the owner
   is notified and decides here:
     - a card on the dashboard while an alert is waiting
     - bpStormOpen(id): who is in it, why, the line added to the text,
       Send (workflow 36, bp-storm-followup) or Not now
   Storms only matter for some trades (roofing, siding, gutters, windows,
   solar, HVAC outdoor units, fencing, landscaping, exterior paint);
   bpStormTrade() says whether this company is one of them.
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var S = window.BP_STORM = { rows: null, at: 0 };

  /* the same trade rule the server uses (supabase/functions/ghl-events) */
  var STORM = /(roof|shingle|gutter|soffit|fascia|siding|window|skylight|solar|hvac|heat pump|air cond|fence|fencing|tree|landscap|lawn|yard|deck|exterior paint|general|contract)/i;
  window.bpStormTrade = function () {
    var s = (window.bpSettingsGet && bpSettingsGet()) || {}, t = String((s.company && s.company.trade) || (window._bpAcct && _bpAcct.trade) || '');
    return !t || STORM.test(t);   /* trade not set yet: keep it on */
  };
  window.bpStormTradeName = function () {
    var s = (window.bpSettingsGet && bpSettingsGet()) || {};
    return String((s.company && s.company.trade) || (window._bpAcct && _bpAcct.trade) || 'your trade');
  };
  function auto() { var s = (window.bpSettingsGet && bpSettingsGet()) || {}; return s.automation || {}; }
  window.bpStormSetting = function (k, v) {
    if (!window.bpSettingsGet) return;
    var s = bpSettingsGet(); s.automation = Object.assign({}, s.automation || {}); s.automation[k] = v;
    bpSettingsSet(s); if (window.bpSettingsPush) bpSettingsPush(s);
  };

  function load(force) {
    if (!(window.BP_LIVE && window.BP_SB) || (window.bpTeamIsCrew && bpTeamIsCrew())) return Promise.resolve([]);
    if (!force && S.rows && Date.now() - S.at < 60000) return Promise.resolve(S.rows);
    return Promise.resolve(BP_SB.from('storm_alerts').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(5))
      .then(function (r) { S.rows = (r && r.data) || []; S.at = Date.now(); return S.rows; }, function () { return []; });
  }
  var nice = function (d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
  var left = function (a) { var h = 72 - (Date.now() - Date.parse(a.created_at)) / 36e5; return h <= 1 ? 'less than an hour' : h < 24 ? Math.round(h) + ' hours' : Math.round(h / 24) + ' day' + (Math.round(h / 24) === 1 ? '' : 's'); };

  /* ---------- dashboard card ---------- */
  window.bpStormDash = function () {
    css();
    setTimeout(function () {
      load().then(function (rows) {
        var h = $('stormDash'); if (!h) return;
        h.innerHTML = rows.map(function (a) {
          var n = (a.jobs || []).length;
          return '<button type="button" class="st-dash" onclick="bpStormOpen(\'' + esc(a.id) + '\')"><span class="st-ic"><span class="ms">thunderstorm</span></span>'
            + '<span class="st-tx"><b>Storm near ' + n + ' past customer' + (n === 1 ? '' : 's') + '</b><small>' + esc(a.summary) + ' · ' + nice(a.day) + '</small></span>'
            + '<span class="st-go">Review<span class="ms">chevron_right</span></span></button>';
        }).join('');
      });
    }, 0);
    return '<div id="stormDash"></div>';
  };

  /* ---------- the decision ---------- */
  window.bpStormOpen = function (id) {
    css();
    load(true).then(function () {
      return Promise.resolve(BP_SB.from('storm_alerts').select('*').eq('id', id).limit(1));
    }).then(function (r) {
      var a = r && r.data && r.data[0];
      if (!a) { if (window.bpToast) bpToast('That storm alert is gone.'); return; }
      if (a.status !== 'pending') {
        window.bpModal('<h3>Storm on ' + nice(a.day) + '</h3><div class="bpx-sub">' + esc(a.summary) + '</div><p class="st-done">'
          + (a.status === 'sent' ? 'Sent to ' + a.sent_count + ' past customer' + (a.sent_count === 1 ? '' : 's') + '.' : a.status === 'dismissed' ? 'You chose not to send this one.' : 'This one lapsed without being sent. You can still send a storm follow-up from Automations → Storm Follow-up.')
          + '</p><div class="row"><button class="bpx-btn" onclick="bpCloseModal()">Close</button></div>');
        return;
      }
      var jobs = a.jobs || [];
      window.bpModal('<h3><span class="ms st-h">thunderstorm</span>Storm near ' + jobs.length + ' past customer' + (jobs.length === 1 ? '' : 's') + '</h3>'
        + '<div class="bpx-sub">' + esc(a.summary) + ' on ' + nice(a.day) + '. Send them the free storm check text? Anyone who replies YES lands in your New Lead pipeline.</div>'
        + '<div class="st-list">' + jobs.map(function (j, i) {
          return '<label class="st-row"><input type="checkbox" checked data-sj="' + esc(j.id) + '"><span><b>' + esc(j.name || 'Customer') + '</b><small>' + esc(j.addr || '') + '</small></span><em>' + esc(j.why) + ' · ' + j.miles + ' mi</em></label>';
        }).join('') + '</div>'
        + '<label class="st-lbl">Line added to the text<input id="st-note" maxlength="200" value="' + esc(a.summary + ' on ' + nice(a.day) + '.') + '"></label>'
        + '<div class="bpx-mut st-fine">Customers marked do-not-contact are skipped by the CRM. If you don’t decide, this lapses in ' + left(a) + (auto().stormAutoSend ? ' (it sends itself at 48 hours, as your setting says)' : '') + '.</div>'
        + '<div class="row"><button class="bpx-btn ghost" id="st-no">Not now</button><button class="bpx-btn" id="st-go">Send to ' + jobs.length + '</button></div><div class="bpx-mmsg" id="st-msg"></div>');
      var go = $('st-go'), boxes = document.querySelectorAll('[data-sj]');
      var count = function () { var k = [].filter.call(boxes, function (b) { return b.checked; }).length; go.textContent = 'Send to ' + k; go.disabled = !k; };
      boxes.forEach(function (b) { b.onchange = count; });
      $('st-no').onclick = function () {
        Promise.resolve(BP_SB.rpc('storm_alert_dismiss', { p_id: a.id })).then(function () { S.rows = null; window.bpCloseModal(); refresh(); });
      };
      go.onclick = function () {
        var pick = [].filter.call(boxes, function (b) { return b.checked; }).map(function (b) { return b.getAttribute('data-sj'); });
        go.disabled = true; go.textContent = 'Sending…';
        Promise.resolve(BP_SB.rpc('storm_alert_send', { p_id: a.id, p_jobs: pick.length === jobs.length ? null : pick, p_note: $('st-note').value })).then(function (r) {
          var d = r && r.data;
          if (!d || !d.ok) { $('st-msg').textContent = (d && d.error) || (r && r.error && r.error.message) || 'Could not send.'; count(); return; }
          S.rows = null; window.bpCloseModal(); refresh();
          if (window.bpToast) bpToast('Storm check text going to ' + d.queued + ' past customer' + (d.queued === 1 ? '' : 's') + ' in the next couple of minutes.');
        }, function () { $('st-msg').textContent = 'Could not send.'; count(); });
      };
    });
  };
  function refresh() { if (window._bpCurView === 'dashboard' && $('stormDash')) { var w = document.createElement('div'); w.innerHTML = bpStormDash(); $('stormDash').replaceWith(w.firstChild); } }

  /* ---------- settings block for Automations → Storm Follow-up ---------- */
  window.bpStormSettingsHtml = function () {
    var a = auto(), mi = +a.stormMiles || 5;
    return '<div class="st-set"><b>Automatic storm watch</b><span>Every morning BuilderPro checks the National Weather Service storm reports. When hail (1 in. or bigger) or damaging wind (58 mph+) hits within your radius of a past customer whose job a storm can damage, you get a notice to approve the text.</span>'
      + '<label>Radius<select onchange="bpStormSetting(\'stormMiles\',+this.value)">' + [2, 5, 10, 15].map(function (m) { return '<option value="' + m + '"' + (m === mi ? ' selected' : '') + '>' + m + ' miles</option>'; }).join('') + '</select></label>'
      + '<label class="st-chk"><input type="checkbox"' + (a.stormAutoSend ? ' checked' : '') + ' onchange="bpStormSetting(\'stormAutoSend\',this.checked)">If I don’t answer within 48 hours, send it anyway</label>'
      + '<small>Otherwise you get one reminder after a day, and it lapses after 3 days.</small></div>';
  };

  function css() {
    if ($('bpStormCss')) return;
    var s = document.createElement('style'); s.id = 'bpStormCss';
    s.textContent = '#bpx .st-dash{display:flex;align-items:center;gap:12px;width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px 14px;margin:0 0 12px}'
      + '#bpx .st-dash:hover{border-color:#fb923c}#bpx .st-ic{width:36px;height:36px;border-radius:50%;background:#f97316;color:#fff;display:grid;place-items:center;flex:none}#bpx .st-ic .ms{color:#fff;font-size:20px}'
      + '#bpx .st-tx{flex:1;min-width:0}#bpx .st-tx b{display:block;font-size:14px}#bpx .st-tx small{display:block;font-size:12.5px;color:#9a3412;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '#bpx .st-go{display:inline-flex;align-items:center;font-size:13px;font-weight:600;color:#c2410c}'
      + '#bpx .st-h{color:#f97316;vertical-align:-4px;margin-right:6px}'
      + '#bpx .st-list{display:flex;flex-direction:column;gap:6px;margin:12px 0;max-height:300px;overflow:auto}'
      + '#bpx#bpx .bpx-modalcard .st-row{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:2px 10px;align-items:center;border:1px solid var(--line,#e3e8ef);border-radius:10px;padding:8px 12px;margin:0;cursor:pointer;font-weight:400;width:auto}'
      + '#bpx#bpx .bpx-modalcard .st-row input{width:16px;height:16px;min-height:0!important;margin:0;padding:0;grid-row:1/3}#bpx#bpx .bpx-modalcard .st-row>span{grid-column:2}'
      + '#bpx .st-row b{display:block;font-size:13.5px}#bpx .st-row small{display:block;font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#bpx#bpx .bpx-modalcard .st-row em{font-style:normal;font-size:12px;color:#c2410c;text-align:right}'
      + '#bpx .st-lbl{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:600}#bpx .st-fine{font-size:12px;margin:8px 0 0}#bpx .st-done{font-size:14px}'
      + '#bpx .st-set{display:flex;flex-direction:column;gap:8px;background:#fff;border:1px solid #dce3ec;border-radius:12px;padding:12px 14px;margin-top:10px}#bpx .st-set b{font-size:14px}#bpx .st-set span,#bpx .st-set small{font-size:12.5px;color:#56657a}'
      + '#bpx .st-set label{display:flex;align-items:center;gap:8px;font-size:13px}#bpx .st-set select{width:auto}'
      + '@media(max-width:600px){#bpx#bpx .bpx-modalcard .st-row{grid-template-columns:18px minmax(0,1fr)}#bpx#bpx .bpx-modalcard .st-row em{grid-column:2;text-align:left}}'
      + '#bpx.bpx-dark .st-dash{background:#2a1a0e;border-color:#7c2d12}#bpx.bpx-dark .st-tx small{color:#fdba74}#bpx.bpx-dark .st-set{background:#111827;border-color:#262f45}';
    document.head.appendChild(s);
  }
})();
