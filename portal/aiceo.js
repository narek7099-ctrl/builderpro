/* ==================================================================
   AI CEO: the first tab of the AI Team page, the "Recommended" panel on
   a project's Crew tab, and the morning-briefing card on the dashboard.
   Owner and office only. Backend: supabase/functions/ai-ceo (rules when
   no Claude key is set, Claude-written text when one is).

     bpCeoRender(host)   the AI CEO tab (briefing, numbers, needs
                         attention, ask, past reports)
     bpCeoReco(job)      ranked people for a project, one-tap Assign
                         (bpProjCrewSet), Assign crew (bpJobSetCrew: j.crew)
                         or Assign sub (bpSubAssign form).
                         Never assigns on its own.
     bpCeoDashCard(row)  the dashboard card for the latest ceo_reports row
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n) { n = Math.round(+n || 0); return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US'); };
  var C = window.BP_CEO = { st: null, cur: null, busy: false, route: {}, asks: [] };
  var allowed = function () { return !(window.bpTeamIsCrew && bpTeamIsCrew()); };

  function css() {
    if ($('bpCeoCss')) return;
    var s = document.createElement('style'); s.id = 'bpCeoCss';
    s.textContent = [
      '.ceo{display:grid;gap:14px;min-width:0}',
      '.ceo-card{background:var(--card,#fff);border:1px solid var(--line,#e3e8ef);border-radius:14px;padding:18px;min-width:0}',
      '.ceo-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;margin-bottom:14px}',
      '.ceo-ic{width:38px;height:38px;border-radius:10px;background:var(--blue-l,#eaf1ff);color:var(--blue,#2563eb);display:grid;place-items:center;flex:none}',
      '.ceo-ic .ms{font-size:21px}',
      '.ceo-head h2{margin:0;font-size:18px;letter-spacing:-.01em;line-height:1.25}',
      '.ceo-head .ceo-sub{font-size:12.5px;color:var(--mu,#6b7a90)}',
      '.ceo-head .ceo-act{margin-left:auto;display:flex;gap:8px;align-items:center}',
      '.ceo-src{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;border-radius:99px;padding:2px 9px;background:var(--soft,#f6f8fb);color:var(--mu,#6b7a90);border:1px solid var(--line,#e3e8ef);vertical-align:middle}',
      '.ceo-src.ai{background:var(--blue-l,#eaf1ff);color:var(--blue,#2563eb);border-color:transparent}',
      '.ceo-src .ms{font-size:14px}',
      '.ceo-btn{display:inline-flex;align-items:center;gap:6px;width:auto !important;margin:0 !important;padding:8px 14px !important;font-size:13px !important}',
      '.ceo-btn .ms{font-size:18px}',
      '.ceo-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}',
      '.ceo-tile{background:var(--soft,#f6f8fb);border:1px solid var(--line-2,#edf0f4);border-radius:12px;padding:12px 14px;min-width:0}',
      '.ceo-tile small{display:block;font-size:12px;color:var(--mu,#6b7a90);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ceo-tile b{display:block;font-size:21px;font-weight:600;letter-spacing:-.02em;margin-top:2px;font-variant-numeric:tabular-nums}',
      '.ceo-tile em{display:block;font-style:normal;font-size:11.5px;color:var(--mu,#6b7a90);margin-top:2px}',
      '.ceo-tile em.up{color:#15803d}.ceo-tile em.down{color:#b91c1c}',
      '.ceo-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;align-items:start}',
      '.ceo-rep{font-size:14px;line-height:1.6;min-width:0;overflow-wrap:anywhere}',
      '.ceo-rep h4{margin:14px 0 4px;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mu,#6b7a90)}',
      '.ceo-rep h4:first-child{margin-top:0}',
      '.ceo-rep p{margin:0 0 6px}.ceo-rep ul,.ceo-rep ol{margin:0;padding-left:18px}.ceo-rep li{margin:2px 0}',
      '.ceo-rep ol li{font-weight:500}',
      '.ceo-att h3,.ceo-card h3{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:8px}',
      '.ceo-att h3 .n{background:#fee2e2;color:#b91c1c;border-radius:99px;font-size:11.5px;padding:0 8px}',
      '.ceo-att ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}',
      '.ceo-it{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;background:var(--card,#fff);border:1px solid var(--line,#e3e8ef);border-radius:10px;padding:9px 11px;cursor:pointer;font:inherit;color:inherit}',
      '.ceo-it:hover{border-color:var(--blue,#2563eb)}',
      '.ceo-it .ms{font-size:19px;color:var(--mu,#6b7a90);margin-top:1px}',
      '.ceo-it.hi .ms{color:#b91c1c}',
      '.ceo-it b{display:block;font-size:13.5px;font-weight:600;line-height:1.35}',
      '.ceo-it span.d{display:block;font-size:12px;color:var(--mu,#6b7a90);line-height:1.4;overflow-wrap:anywhere}',
      '.ceo-it .go{margin-left:auto;font-size:17px;align-self:center}',
      '.ceo-row2{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px;align-items:start}',
      '.ceo-ask textarea{box-sizing:border-box;width:100%;min-height:64px;resize:vertical;border:1px solid var(--line,#e3e8ef);border-radius:10px;padding:10px 12px;font:inherit;font-size:14px;background:var(--card,#fff);color:inherit}',
      '.ceo-ask textarea:disabled{background:var(--soft,#f6f8fb);cursor:not-allowed}',
      '.ceo-ask .row{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}',
      '.ceo-note{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:var(--mu,#6b7a90);background:var(--soft,#f6f8fb);border-radius:10px;padding:9px 11px;margin-top:8px}',
      '.ceo-note .ms{font-size:17px}',
      '.ceo-qa{margin-top:10px;display:grid;gap:8px}',
      '.ceo-q{font-weight:600;font-size:13.5px}.ceo-a{font-size:14px;line-height:1.55;white-space:pre-wrap}',
      '.ceo-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
      '.ceo-chips button{border:1px solid var(--line,#e3e8ef);background:var(--soft,#f6f8fb);border-radius:99px;padding:5px 11px;font:inherit;font-size:12.5px;cursor:pointer;color:inherit}',
      '.ceo-chips button:disabled{opacity:.55;cursor:not-allowed}',
      '.ceo-past{list-style:none;margin:0;padding:0;display:grid;gap:2px}',
      '.ceo-past button{display:flex;justify-content:space-between;gap:8px;width:100%;border:0;background:none;text-align:left;padding:8px 10px;border-radius:8px;font:inherit;font-size:13.5px;cursor:pointer;color:inherit}',
      '.ceo-past button:hover,.ceo-past button.on{background:var(--soft,#f6f8fb)}',
      '.ceo-empty{text-align:center;padding:26px 10px}.ceo-empty .ms{font-size:34px;color:var(--blue,#2563eb)}.ceo-empty b{display:block;margin:6px 0 4px}',
      '.ceo-wait{animation:ceoblink 1.2s ease-in-out infinite}@keyframes ceoblink{50%{opacity:.45}}',
      /* recommended panel (project sheet) */
      '.rc-list{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:8px}',
      '.rc-row{border:1px solid var(--line,#e3e8ef);border-radius:12px;padding:11px 12px;background:var(--card,#fff);display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:4px 11px;align-items:center}',
      '.rc-av{width:36px;height:36px;border-radius:50%;background:var(--blue-l,#eaf1ff);color:var(--blue,#2563eb);display:grid;place-items:center;font-size:12.5px;font-weight:600}',
      '.rc-row.sub .rc-av{background:#f3e8ff;color:#7e22ce}',
      '.rc-n{min-width:0}.rc-n b{font-size:14px}.rc-n .t{font-size:12px;color:var(--mu,#6b7a90)}',
      '.rc-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}',
      '.rc-tag{font-size:11px;font-weight:600;border-radius:6px;padding:1px 6px;background:var(--soft,#f6f8fb);color:var(--mu,#6b7a90)}',
      '.rc-tag.ok{background:#ecfdf5;color:#15803d}.rc-tag.bad{background:#fee2e2;color:#b91c1c}.rc-tag.warn{background:#fff7ed;color:#b45309}',
      '.rc-sc{grid-column:2 / 4;display:flex;align-items:center;gap:8px}',
      '.rc-bar{display:block;flex:1;height:7px;border-radius:7px;background:var(--line-2,#edf0f4);overflow:hidden}.rc-bar i{display:block;height:100%;border-radius:7px;background:var(--blue,#2563eb)}',
      '.rc-sc b{font-size:12.5px;font-variant-numeric:tabular-nums;min-width:26px;text-align:right}',
      '.rc-bd{grid-column:2 / 4;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}',
      '.rc-bd div{font-size:10.5px;color:var(--mu,#6b7a90)}.rc-bd i{display:block;height:3px;border-radius:3px;background:var(--line-2,#edf0f4);margin-top:2px;overflow:hidden}.rc-bd i u{display:block;height:100%;background:#94a3b8;text-decoration:none}',
      '.rc-why{grid-column:2 / 4;font-size:12.5px;line-height:1.45;color:var(--ink-2,#1b2a41);overflow-wrap:anywhere}',
      '.rc-btn{grid-row:1;grid-column:3;white-space:nowrap}',
      '.rc-btn .bpx-btn{width:auto !important;margin:0 !important;padding:7px 12px !important;font-size:12.5px !important}',
      '.rc-btn .done{font-size:12.5px;font-weight:600;color:#15803d;display:inline-flex;align-items:center;gap:3px}',
      '.rc-row.crew .rc-av,.pjm-grp.crew .rc-av{background:var(--cc,#2563eb);color:#fff}',
      '.rc-row.crew .rc-av .ms,.pjm-grp.crew .rc-av .ms{font-size:18px}',
      '.rc-crew{display:flex;align-items:center;gap:8px;margin-top:4px;min-width:0}',
      '.rc-crew .pjc-av{display:inline-flex;flex:none}',
      '.rc-crew .pjc-av i{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:9.5px;font-weight:700;color:#fff;border:2px solid var(--card,#fff);margin-left:-6px}',
      '.rc-crew .pjc-av i:first-child{margin-left:0}',
      '.rc-crew small{font-size:11.5px;color:var(--mu,#6b7a90);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1 1 0}',
      '.rc-cdot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:0}',
      '.rc-foot{font-size:12px;color:var(--mu,#6b7a90);margin-top:8px;line-height:1.5}',
      /* dashboard card */
      '.ceo-dash{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:0 0 16px;cursor:pointer}',
      '.ceo-dash .t{flex:1;min-width:200px}.ceo-dash .t b{font-size:14.5px}.ceo-dash .t p{margin:2px 0 0;font-size:13px;color:var(--mu,#6b7a90);line-height:1.45}',
      '.ceo-dash .k{display:flex;gap:16px;flex-wrap:wrap}.ceo-dash .k div{font-size:11.5px;color:var(--mu,#6b7a90)}.ceo-dash .k div b{display:block;font-size:16px;color:var(--ink,#0f1a2b);font-variant-numeric:tabular-nums}',
      '#bpx.bpx-dark .ceo-it.hi .ms,#bpx.bpx-dark .rc-tag.bad{color:#fca5a5}#bpx.bpx-dark .rc-tag.bad,#bpx.bpx-dark .ceo-att h3 .n{background:#3b1717}',
      '#bpx.bpx-dark .rc-tag.ok{background:#0f2e1f;color:#86efac}#bpx.bpx-dark .rc-tag.warn{background:#3a2a0e;color:#f5c26b}#bpx.bpx-dark .rc-row.sub .rc-av{background:#2e1a47;color:#d8b4fe}',
      '@media(max-width:900px){.ceo-grid,.ceo-row2{grid-template-columns:minmax(0,1fr)}.ceo-head .ceo-act{margin-left:0;width:100%}}',
      '@media(max-width:520px){.ceo-card{padding:14px}.ceo-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.ceo-tile b{font-size:18px}.rc-bd{grid-template-columns:repeat(2,minmax(0,1fr))}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  async function api(body) {
    var tok = '';
    try { var s = await BP_SB.auth.getSession(); tok = s.data.session ? s.data.session.access_token : ''; } catch (e) {}
    try {
      var r = await fetch(BP_URL + '/functions/v1/ai-ceo', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: BP_ANON, Authorization: 'Bearer ' + (tok || BP_ANON) }, body: JSON.stringify(body) });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Network error. Check your connection.' }; }
  }
  C.api = api;

  function fmtDay(iso) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? esc(iso) : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function srcBadge(src) { return src === 'claude' ? '<span class="ceo-src ai" title="Written by Claude from your numbers"><span class="ms">auto_awesome</span>Claude</span>' : '<span class="ceo-src" title="Written by rules from your numbers"><span class="ms">rule</span>Rules</span>'; }
  /* the report is plain text: CAPS lines are headings, "- " bullets, "1. " the actions */
  function repHtml(t) {
    var out = [], list = null;
    String(t || '').split('\n').forEach(function (l) {
      var b = l.match(/^\s*[-•] (.*)/), n = !b && l.match(/^\s*\d+[.)] (.*)/);
      if (b || n) { var tg = b ? 'ul' : 'ol'; if (list !== tg) { if (list) out.push('</' + list + '>'); out.push('<' + tg + '>'); list = tg; } out.push('<li>' + esc((b || n)[1]) + '</li>'); return; }
      if (list) { out.push('</' + list + '>'); list = null; }
      var s = l.trim(); if (!s) return;
      if (/^[A-Z0-9 &'/,-]{4,40}:?$/.test(s) && /[A-Z]{3}/.test(s)) out.push('<h4>' + esc(s.replace(/:$/, '')) + '</h4>'); else out.push('<p>' + esc(s) + '</p>');
    });
    if (list) out.push('</' + list + '>');
    return out.join('');
  }
  function follow(link, job) {
    if (window.bpNotify && bpNotify.follow) return bpNotify.follow(link, job);
    if (job) { bpNav('activejobs'); setTimeout(function () { if (window.bpProjOpen) bpProjOpen(job); }, 80); }
  }

  /* ------------------------------------------------------- the AI CEO tab --- */
  window.bpCeoRender = async function (host) {
    css(); if (!host) return;
    if (!allowed()) { host.innerHTML = '<div class="ceo-card bpx-mut">The AI CEO is for the owner and office.</div>'; return; }
    C.host = host;
    host.innerHTML = '<div class="ceo"><div class="ceo-card"><div class="bpx-mut ceo-wait">Reading your business…</div></div></div>';
    C.st = await api({ op: 'status' });
    if (C.host !== host || !document.contains(host)) return;
    if (!C.st.ok) { host.innerHTML = '<div class="ceo"><div class="ceo-card"><div class="bpx-mut">' + esc(C.st.error || 'Could not load the AI CEO.') + '</div></div></div>'; return; }
    C.cur = C.st.latest || null;
    draw();
  };

  function tilesHtml(st) {
    var t = (st && st.tiles) || {};
    var ch = t.collected_last_month > 0 ? Math.round((t.collected_month - t.collected_last_month) / t.collected_last_month * 100) : null;
    var tile = function (l, v, note, cls) { return '<div class="ceo-tile"><small>' + l + '</small><b>' + v + '</b>' + (note ? '<em class="' + (cls || '') + '">' + note + '</em>' : '') + '</div>'; };
    return '<div class="ceo-tiles">'
      + tile('Collected this month', money(t.collected_month), ch == null ? (t.collected_last_month ? '' : 'nothing last month') : (ch >= 0 ? '▲ ' : '▼ ') + Math.abs(ch) + '% vs last month', ch == null ? '' : ch >= 0 ? 'up' : 'down')
      + tile('Spent this month', money(t.expenses_month), 'net ' + money((t.collected_month || 0) - (t.expenses_month || 0)))
      + tile('Still owed', money(t.outstanding), 'on active projects')
      + tile('Active projects', String(t.active_projects || 0), (st.critical ? st.critical + ' need you today' : 'nothing urgent'), st.critical ? 'down' : 'up')
      + tile('New leads', String(t.leads_7d || 0), (t.leads_24h || 0) + ' in the last 24h')
      + tile('Crew hours', String(Math.round((t.hours_week || 0) * 10) / 10), 'this week')
      + '</div>';
  }
  function attHtml(items) {
    items = items || [];
    var hi = items.filter(function (x) { return x.sev === 'high'; }).length;
    return '<div class="ceo-att"><h3><span class="ms">priority_high</span>Needs attention' + (hi ? '<span class="n">' + hi + ' urgent</span>' : '') + '</h3>'
      + (items.length ? '<ul>' + items.slice(0, 12).map(function (x, i) {
        return '<li><button type="button" class="ceo-it' + (x.sev === 'high' ? ' hi' : '') + '" data-att="' + i + '"><span class="ms">' + esc(x.icon || 'flag') + '</span><span><b>' + esc(x.title) + '</b><span class="d">' + esc(x.detail || '') + '</span></span><span class="ms go">chevron_right</span></button></li>';
      }).join('') + '</ul>' + (items.length > 12 ? '<div class="bpx-mut" style="font-size:12px;margin-top:6px">+' + (items.length - 12) + ' more in the briefing</div>' : '')
        : '<div class="ceo-note"><span class="ms">check_circle</span>Nothing is overdue, expiring or waiting on you.</div>')
      + '</div>';
  }
  function draw() {
    var host = C.host; if (!host) return;
    var r = C.cur, st = (r && r.stats) || {}, ai = !!(C.st && C.st.ai);
    var today = new Date(); var iso = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
    var head = '<div class="ceo-head"><span class="ceo-ic"><span class="ms">monitoring</span></span><div><h2>Morning briefing ' + (r ? srcBadge(r.source) : '') + '</h2>'
      + '<div class="ceo-sub">' + (r ? fmtDay(r.day) + (String(r.day) === iso ? ' · today' : '') + (r.kind === 'adhoc' ? ' · run by hand' : '') : 'Your AI CEO reads the whole business every morning') + '</div></div>'
      + '<div class="ceo-act"><button type="button" class="bpx-btn ceo-btn" id="ceoRun"><span class="ms">refresh</span>Run now</button></div></div>';
    var brief = r
      ? tilesHtml(st) + '<div class="ceo-grid"><div class="ceo-rep" id="ceoRep">' + repHtml(r.text) + '</div>' + attHtml(st.attention) + '</div>'
      : '<div class="ceo-empty"><span class="ms">wb_sunny</span><b>No briefing yet</b><div class="bpx-mut" style="font-size:13.5px;max-width:46ch;margin:0 auto">Every morning the AI CEO checks money, leads, projects, permits, inspections, contracts, messages and your team, then tells you the 3 things to do first. Run the first one now.</div></div>';
    var past = (C.st.reports || []);
    host.innerHTML = '<div class="ceo"><section class="ceo-card" aria-label="Morning briefing">' + head + brief + '</section>'
      + '<div class="ceo-row2"><section class="ceo-card ceo-ask" aria-label="Ask the CEO"><h3><span class="ms">forum</span>Ask the CEO</h3>'
      + '<textarea id="ceoQ" maxlength="1000" placeholder="' + (ai ? 'e.g. Which projects are at risk this week?' : 'Ask about your numbers, projects or team') + '"' + (ai ? '' : ' disabled') + '></textarea>'
      + '<div class="row"><button type="button" class="bpx-btn ceo-btn" id="ceoAsk"' + (ai ? '' : ' disabled') + '><span class="ms">send</span>Ask</button><span class="bpx-mmsg" id="ceoAskMsg"></span></div>'
      + (ai ? '<div class="ceo-chips">' + ['Which projects are at risk this week?', 'Who is my best roofer right now?', 'Where is money stuck?'].map(function (q) { return '<button type="button" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>'
        : '<div class="ceo-note" id="ceoKeyNote"><span class="ms">key</span><span>Connect Claude in Supabase to turn this on. Add <b>ANTHROPIC_API_KEY</b> under Edge Functions → Secrets. The briefing and recommendations already work without it.</span></div>')
      + '<div class="ceo-qa" id="ceoQA">' + C.asks.map(qaHtml).join('') + '</div></section>'
      + '<section class="ceo-card" aria-label="Past briefings"><h3><span class="ms">history</span>Past briefings</h3>'
      + (past.length ? '<ul class="ceo-past">' + past.map(function (p) { return '<li><button type="button" data-rep="' + esc(p.id) + '" class="' + (r && r.id === p.id ? 'on' : '') + '"><span>' + fmtDay(p.day) + (p.kind === 'adhoc' ? ' <span class="bpx-mut" style="font-size:12px">· by hand</span>' : '') + '</span>' + srcBadge(p.source) + '</button></li>'; }).join('') + '</ul>'
        : '<div class="bpx-mut" style="font-size:13px">Briefings you get show up here.</div>')
      + '</section></div></div>';
    $('ceoRun').onclick = run;
    host.querySelectorAll('[data-att]').forEach(function (b) { b.onclick = function () { var x = (st.attention || [])[+b.getAttribute('data-att')]; if (x) follow(x.link, x.job); }; });
    host.querySelectorAll('[data-rep]').forEach(function (b) { b.onclick = function () { openRep(b.getAttribute('data-rep')); }; });
    host.querySelectorAll('[data-q]').forEach(function (b) { b.onclick = function () { $('ceoQ').value = b.getAttribute('data-q'); ask(); }; });
    var q = $('ceoQ'); if (q) q.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } };
    $('ceoAsk').onclick = ask;
  }
  function qaHtml(x) { return '<div><div class="ceo-q">' + esc(x.q) + '</div><div class="ceo-a' + (x.wait ? ' ceo-wait bpx-mut' : '') + '">' + esc(x.a) + '</div></div>'; }
  async function run() {
    var b = $('ceoRun'); if (!b || C.busy) return;
    C.busy = true; b.disabled = true; b.innerHTML = '<span class="ms">hourglass_top</span>Working…';
    var r = await api({ op: 'daily' });
    C.busy = false;
    if (!r.ok) { b.disabled = false; b.innerHTML = '<span class="ms">refresh</span>Run now'; if (window.bpToast) bpToast(r.error || 'Could not run the briefing.'); return; }
    C.cur = r.report; if (typeof r.ai === 'boolean') C.st.ai = r.ai;
    C.st.reports = [{ id: r.report.id, day: r.report.day, kind: r.report.kind, source: r.report.source, created_at: r.report.created_at }]
      .concat((C.st.reports || []).filter(function (p) { return !(p.day === r.report.day && p.kind === r.report.kind) && p.id !== r.report.id; })).slice(0, 14);
    C.st.latest = C.cur; draw();
    if (window.bpToast) bpToast('Briefing updated.');
  }
  async function openRep(id) {
    if (C.cur && C.cur.id === id) return;
    var r = await api({ op: 'report', id: id });
    if (r.ok) { C.cur = r.report; draw(); var c = C.host && C.host.querySelector('.ceo-card'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }
  async function ask() {
    var q = $('ceoQ'), b = $('ceoAsk'), m = $('ceoAskMsg'); if (!q || q.disabled || C.busy) return;
    var t = q.value.trim(); if (!t) return;
    C.busy = true; b.disabled = true; q.value = ''; m.textContent = '';
    var item = { q: t, a: 'Thinking…', wait: true }; C.asks.unshift(item); C.asks = C.asks.slice(0, 6);
    $('ceoQA').innerHTML = C.asks.map(qaHtml).join('');
    var r = await api({ op: 'ask', question: t });
    C.busy = false;
    if (r.needsKey) { C.st.ai = false; C.asks.shift(); draw(); return; }
    item.wait = false; item.a = r.ok ? r.answer : (r.error || 'Could not answer.');
    if (!r.ok) C.asks.shift();
    if ($('ceoQA')) $('ceoQA').innerHTML = C.asks.map(qaHtml).join('');
    if (!r.ok && m) m.textContent = r.error || 'Could not answer.';
    if ($('ceoAsk')) $('ceoAsk').disabled = false;
  }

  /* ---------------------------------------- project sheet: Recommended --- */
  function initials(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function onJob(j, c) {
    if (!j) return false;
    if (c.kind === 'sub') return (Array.isArray(j.subs) ? j.subs : []).some(function (x) { return x.subId === c.id; });
    if (c.kind === 'crew') return typeof j.crew === 'string' && j.crew === c.id;
    return (window.bpJobAssignees ? bpJobAssignees(j) : (j.assignees || [])).some(function (a) { return a.employeeId === c.id; });
  }
  function curJob(id) { return ((window.bpJobsGet && bpJobsGet()) || []).filter(function (x) { return x.id === id; })[0]; }
  /* a crew candidate: colour dot avatar, member avatars, "Roofing crew · 3 people" */
  function crewAv(c) { return '<span class="rc-av" aria-hidden="true" style="--cc:' + esc(c.color || '#2563eb') + '"><span class="ms">groups</span></span>'; }
  function crewTrade(c) { var t = String(c.trade || ''); return (t ? t.charAt(0).toUpperCase() + t.slice(1) + ' crew' : 'Crew') + ' · ' + (+c.size || (c.members || []).length) + ' people'; }
  function crewMembers(c) {
    var m = c.members || [];
    var av = window.bpCrewAvatars ? bpCrewAvatars(m, c.color, 4)
      : '<span class="pjc-av">' + m.slice(0, 4).map(function (p) { return '<i style="background:' + esc(c.color || '#64748b') + '">' + esc(initials(p.name)) + '</i>'; }).join('') + '</span>';
    return '<div class="rc-crew">' + av + '<small>' + esc(m.map(function (p) { return p.name + (p.trade ? ' (' + p.trade + ')' : ''); }).join(', ')) + '</small></div>';
  }
  /* Assign crew: the Crew tab's own path (bpJobSetCrew sets j.crew and drops the cached ranking) */
  function assignCrew(jobId, crewId) {
    if (!window.bpJobSetCrew || !jobId || !crewId) return false;
    var okk = bpJobSetCrew(jobId, crewId);
    delete C.route[jobId];
    if (okk && window._bpProjId === jobId && window.bpProjCrewRender) bpProjCrewRender();
    return okk && onJob(curJob(jobId), { kind: 'crew', id: crewId });
  }
  function recoRow(c, j) {
    var fl = c.flags || [], tags = [];
    if (c.rating != null) tags.push('<span class="rc-tag">' + (+c.rating).toFixed(1) + '★ · ' + c.reviews + '</span>');
    if (c.years) tags.push('<span class="rc-tag">' + c.years + ' yrs</span>');
    if (fl.indexOf('busy') >= 0) tags.push('<span class="rc-tag bad">Busy those days</span>'); else if (j && j.dates && j.dates.length) tags.push('<span class="rc-tag ok">Free</span>');
    if (fl.indexOf('coi_expired') >= 0) tags.push('<span class="rc-tag bad">Insurance expired</span>');
    if (fl.indexOf('coi_missing') >= 0) tags.push('<span class="rc-tag bad">No insurance on file</span>');
    if (fl.indexOf('coi_expiring') >= 0) tags.push('<span class="rc-tag warn">Insurance expiring</span>');
    if (fl.indexOf('trade_mismatch') >= 0) tags.push('<span class="rc-tag warn">Other trade</span>');
    var bd = c.breakdown || {}, bar = function (l, v) { return '<div>' + l + '<i><u style="width:' + Math.round((+v || 0) * 100) + '%"></u></i></div>'; };
    var on = onJob(curJob(window._bpProjId), c);
    var crew = c.kind === 'crew';
    var btn = on ? '<span class="done"><span class="ms" style="font-size:16px">check</span>On the job</span>'
      : crew ? '<button type="button" class="bpx-btn" data-rc-crew="' + esc(c.id) + '"><span class="ms" style="font-size:16px;vertical-align:-3px;margin-right:4px">groups</span>Assign crew</button>'
      : c.kind === 'sub' ? '<button type="button" class="bpx-btn ghost" data-rc-sub="' + esc(c.id) + '">Assign sub</button>'
        : '<button type="button" class="bpx-btn" data-rc-emp="' + esc(c.id) + '">Assign</button>';
    return '<div class="rc-row' + (c.kind === 'sub' ? ' sub' : crew ? ' crew' : '') + '" data-rc="' + esc(c.id) + '">' + (crew ? crewAv(c) : '<span class="rc-av" aria-hidden="true">' + esc(initials(c.name)) + '</span>')
      + '<div class="rc-n"><b>' + (crew ? '<i class="rc-cdot" style="background:' + esc(c.color || '#2563eb') + '"></i>' : '') + esc(c.name) + '</b> <span class="t">' + esc(crew ? crewTrade(c) : (c.trade || '')) + (c.kind === 'sub' ? ' · Sub' : '') + '</span>'
      + (crew ? crewMembers(c) : '') + '<div class="rc-tags">' + tags.join('') + '</div></div>'
      + '<div class="rc-btn">' + btn + '</div>'
      + '<div class="rc-sc" title="Match score"><span class="rc-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + (+c.score || 0) + '" aria-label="Match score"><i style="width:' + Math.max(3, Math.min(100, +c.score || 0)) + '%"></i></span><b>' + (+c.score || 0) + '</b></div>'
      + '<div class="rc-bd">' + bar('Trade', bd.trade) + bar('Rating', bd.rating) + bar('Experience', bd.experience) + bar('Availability', bd.availability) + '</div>'
      + '<div class="rc-why">' + esc(c.explain || (c.reasons || []).join('; ')) + '</div></div>';
  }
  function recoDraw(host, d) {
    var j = d.job || {};
    host.innerHTML = '<div class="pjs-h" style="display:flex;align-items:center;gap:8px">Recommended ' + srcBadge(d.source) + '<button type="button" class="bpx-linkbtn" data-rc-refresh style="margin-left:auto">Refresh</button></div>'
      + '<div class="bpx-mut" style="font-size:12.5px;line-height:1.5">Ranked by the AI CEO for this ' + esc(j.trade || '') + ' job' + (j.estimate ? ' (' + money(j.estimate) + (j.weight >= 1.3 ? ', bigger than usual, so ratings and experience count more' : '') + ')' : '') + '. Nobody is put on the job until you tap Assign.</div>'
      + (d.candidates && d.candidates.length ? '<div class="rc-list">' + d.candidates.map(function (c) { return recoRow(c, j); }).join('') + '</div>'
        : '<div class="bpx-mut" style="font-size:13px;margin-top:8px">Add people under Employees or Subcontractors and they will be ranked here.</div>')
      + ((d.flagged || []).length ? '<div class="rc-foot"><span class="ms" style="font-size:15px;vertical-align:-3px;color:#b91c1c">shield</span> Ranked lower: ' + d.flagged.map(function (f) { return esc(f.name) + ' (' + ((f.flags || []).indexOf('coi_missing') >= 0 ? 'no insurance on file' : 'insurance expired') + ')'; }).join(', ') + '.</div>' : '')
      + ((d.on_job || []).length ? '<div class="rc-foot">Already on it: ' + d.on_job.map(function (x) { return esc(x.name); }).join(', ') + '.</div>' : '');
    host.querySelector('[data-rc-refresh]').onclick = function () { delete C.route[j.id || window._bpProjId]; window.bpCeoReco(curJob(window._bpProjId)); };
    host.querySelectorAll('[data-rc-emp]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-rc-emp'); if (!window.bpProjCrewSet) return;
        bpProjCrewSet(id, true);   /* the Crew tab's own checkbox path: j.assignees, saved with bpJobsSet */
        var c = (d.candidates || []).filter(function (x) { return x.id === id; })[0];
        if (window.bpToast) bpToast((c ? c.name : 'They') + ' is on this job.');
        recoDraw(host, d);
      };
    });
    host.querySelectorAll('[data-rc-crew]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-rc-crew'), jid = window._bpProjId;
        var c = (d.candidates || []).filter(function (x) { return x.kind === 'crew' && x.id === id; })[0];
        if (!assignCrew(jid, id)) { if (window.bpToast) bpToast('Could not assign the crew. Try from the Crew tab.'); return; }
        if (window.bpToast) bpToast((c ? c.name : 'The crew') + ' is on this job.');
        recoDraw(host, d);   /* the cached ranking is dropped; this list stays until Refresh */
      };
    });
    host.querySelectorAll('[data-rc-sub]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-rc-sub');
        if (window.bpProjTab) bpProjTab('subs');
        /* the Subs tab's own form, with this sub picked: price, scope and dates, then Assign */
        var S = window.BP_SUBS;
        Promise.all([S && S.load ? S.load() : null, window.bpSubsRefresh ? bpSubsRefresh() : null]).then(function () {
          if (window.bpSubsTab) bpSubsTab(curJob(window._bpProjId));
          if (window.bpSubAssign) bpSubAssign(id);
        });
      };
    });
  }
  window.bpCeoReco = async function (j) {
    css();
    var host = $('pjs-reco'); if (!host || !j || !allowed() || !window.BP_LIVE) { if (host) host.hidden = true; return; }
    host.hidden = false;
    if (C.route[j.id]) return recoDraw(host, C.route[j.id]);
    host.innerHTML = '<div class="pjs-h">Recommended</div><div class="bpx-mut ceo-wait" style="font-size:13px">Ranking your crew and subs for this job…</div>';
    var d = await api({ op: 'route', job: j.id });
    if (!document.contains(host) || window._bpProjId !== j.id) return;
    if (!d.ok) { host.innerHTML = '<div class="pjs-h">Recommended</div><div class="bpx-mut" style="font-size:13px">' + esc(d.error || 'No recommendation right now.') + '</div>'; return; }
    C.route[j.id] = d; recoDraw(host, d);
  };

  /* One-tap Assign for a job that is not open in the project sheet (the map's
     panel and Plan the day): the same bpProjCrewSet path the Crew tab uses,
     pointed at that job for the call. Drops the cached ranking for the job. */
  function assignEmp(jobId, empId) {
    if (!window.bpProjCrewSet || !jobId || !empId) return false;
    var was = window._bpProjId;
    window._bpProjId = jobId;
    try { bpProjCrewSet(empId, true); } finally { window._bpProjId = was; }
    delete C.route[jobId];
    return onJob(curJob(jobId), { kind: 'employee', id: empId });
  }
  /* shared with portal/aiceo-map.js */
  C.css = css; C.esc = esc; C.money = money; C.srcBadge = srcBadge; C.initials = initials;
  C.follow = follow; C.onJob = onJob; C.curJob = curJob; C.allowed = allowed; C.assignEmp = assignEmp;
  C.assignCrew = assignCrew; C.crewAv = crewAv; C.crewTrade = crewTrade; C.crewMembers = crewMembers;

  /* ------------------------------------------------------ dashboard card --- */
  window.bpCeoDashCard = function (row) {
    css();
    if (!allowed() || row === undefined) return '';
    if (!row) return '<div class="bpx-panel ceo-dash" role="link" tabindex="0" onclick="bpNav(\'aiteam\')"><span class="ceo-ic"><span class="ms">wb_sunny</span></span><div class="t"><b>Morning briefing</b><p>Your AI CEO can read the whole business each morning and tell you the 3 things to do first.</p></div><button type="button" class="bpx-linkbtn">Open AI CEO</button></div>';
    var st = row.stats || {}, t = st.tiles || {}, crit = +st.critical || 0;
    var first = (st.attention || [])[0];
    return '<div class="bpx-panel ceo-dash" role="link" tabindex="0" onclick="bpNav(\'aiteam\')" onkeydown="if(event.key===\'Enter\')bpNav(\'aiteam\')"><span class="ceo-ic"><span class="ms">monitoring</span></span>'
      + '<div class="t"><b>Morning briefing · ' + fmtDay(row.day) + '</b> ' + srcBadge(row.source)
      + '<p>' + (crit ? crit + ' thing' + (crit > 1 ? 's' : '') + ' need you today' + (first ? ': ' + esc(first.title) : '') : 'Nothing urgent today.') + '</p></div>'
      + '<div class="k"><div><b>' + money(t.collected_month) + '</b>collected</div><div><b>' + money(t.outstanding) + '</b>still owed</div><div><b>' + (t.active_projects || 0) + '</b>active</div></div>'
      + '<button type="button" class="bpx-linkbtn">Open AI CEO</button></div>';
  };
})();
