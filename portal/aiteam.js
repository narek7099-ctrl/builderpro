/* ==================================================================
   AI Team: the $49/month add-on. Three assistants (Sales, Marketing,
   Office) that work on this contractor's own leads, CRM and marketing.
   Everything they want to send to a customer waits under "Waiting for
   you" until the owner approves it. Backend: supabase/functions/ai-team.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var A = window.BP_AITEAM = { st: null, agent: 'sales', thread: null, tab: 'ceo', busy: false };
  /* the AI CEO tab (portal/aiceo.js): owner and office, whether or not the add-on is on */
  var ceoOn = function () { return !!window.bpCeoRender && !(window.bpTeamIsCrew && bpTeamIsCrew()); };
  var AG = {
    sales: { n: 'Sales', ic: 'trending_up', d: 'Follows up on leads and quotes so jobs don’t slip away.',
      h: ['Who should I follow up with today?', 'Write a text for a quote that went quiet', 'Give me a call script for a new lead'] },
    marketing: { n: 'Marketing', ic: 'campaign', d: 'Writes your ads, posts and promotions.',
      h: ['Write 3 Facebook ads for this month', 'Plan a week of social posts', 'What are competitors near me offering?'] },
    office: { n: 'Office', ic: 'event_note', d: 'Your schedule, reminders, invoices and the 7am daily brief.',
      h: ['What’s on my schedule this week?', 'Which quotes and invoices need chasing?', 'Summarize yesterday for me'] }
  };

  function css() {
    if ($('bpAiCss')) return;
    var s = document.createElement('style'); s.id = 'bpAiCss';
    s.textContent = [
      '.ai-hero{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:stretch}',
      '.ai-hero .pitch h2{font-size:26px;letter-spacing:-.03em;margin:0 0 6px}',
      '.ai-hero .price{font-size:34px;font-weight:600;letter-spacing:-.03em;margin:14px 0 4px}.ai-hero .price small{font-size:14px;color:var(--mu,#788493);font-weight:500}',
      '.ai-cards{display:grid;gap:10px}',
      '.ai-card{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line,#dce3ec);border-radius:14px;padding:14px;background:#fff}',
      '.ai-card .ms,.ai-tab .ms{color:var(--a,#006fff)}',
      '.ai-card b{display:block;margin-bottom:2px}',
      '.ai-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}',
      '.ai-tab{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line,#dce3ec);background:#fff;border-radius:999px;padding:8px 14px;font-weight:500;cursor:pointer}',
      '.ai-tab.on{border-color:var(--a,#006fff);background:#e6f0ff;color:#003db8}',
      '.ai-tab .n{background:#e0574e;color:#fff;border-radius:9px;font-size:11px;padding:0 6px}',
      '.ai-use{margin-left:auto;font-size:13px;color:var(--mu,#788493);display:flex;align-items:center;gap:8px}',
      '.ai-use i{display:block;width:90px;height:6px;border-radius:6px;background:#e7ecf2;overflow:hidden}.ai-use i b{display:block;height:100%;background:var(--a,#006fff)}',
      '.ai-wrap{display:grid;grid-template-columns:230px 1fr;gap:14px;min-height:560px}',
      '.ai-side{display:flex;flex-direction:column;gap:4px;overflow:auto;max-height:640px}',
      '.ai-side button{background:none;border:0;text-align:left;padding:8px 10px;border-radius:10px;font-size:13.5px;color:var(--mu,#788493);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}',
      '.ai-side button.on,.ai-side button:hover{background:#eef3f8;color:var(--txt,#001530)}',
      '.ai-chat{display:flex;flex-direction:column;border:1px solid var(--line,#dce3ec);border-radius:16px;background:#fff;overflow:hidden;min-height:560px}',
      '.ai-msgs{flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:14px;max-height:600px}',
      '.ai-m{max-width:100%;line-height:1.6;font-size:14.5px}',
      '.ai-m.u{align-self:flex-end;max-width:80%;background:var(--a,#006fff);color:#fff;border-radius:14px;padding:9px 13px;white-space:pre-wrap}',
      '.ai-m.s{font-size:12.5px;color:var(--mu,#788493)}',
      '.ai-m p{margin:4px 0}.ai-m ul,.ai-m ol{padding-left:20px;margin:4px 0}.ai-m h4{margin:10px 0 4px;font-size:14.5px}',
      '.ai-tools{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}.ai-tools span{font-size:11.5px;color:var(--mu,#788493);background:#f3f6f9;border-radius:6px;padding:1px 7px}',
      '.ai-deep{font-size:11px;color:#003db8;background:#e6f0ff;border-radius:6px;padding:1px 7px;margin-left:4px}',
      '.ai-comp{display:flex;gap:8px;padding:12px;border-top:1px solid var(--line,#dce3ec)}',
      '.ai-comp textarea{flex:1;resize:none;height:46px;border:1px solid var(--line,#dce3ec);border-radius:12px;padding:10px 12px;font:inherit;outline:none}',
      '.ai-comp textarea:focus{border-color:var(--a,#006fff)}',
      '.ai-hint{display:flex;flex-direction:column;gap:6px;margin-top:10px}.ai-hint button{text-align:left;background:#f6f8fb;border:1px solid var(--line,#dce3ec);border-radius:10px;padding:9px 12px;cursor:pointer;font:inherit;font-size:13.5px}',
      '.ai-wait{animation:aiblink 1.2s ease-in-out infinite}@keyframes aiblink{50%{opacity:.4}}',
      '.ai-ap{border:1px solid var(--line,#dce3ec);border-radius:14px;padding:14px;background:#fff;display:grid;gap:8px}',
      '.ai-ap textarea{box-sizing:border-box;width:100%;min-height:80px;border:1px solid var(--line,#dce3ec);border-radius:10px;padding:10px;font:inherit}',
      '@media(max-width:860px){.ai-hero,.ai-wrap{grid-template-columns:1fr}.ai-side{flex-direction:row;overflow-x:auto;max-height:none}.ai-use{margin-left:0;width:100%}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function md(t) {
    var h = esc(t || '').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    var out = [], list = null;
    h.split('\n').forEach(function (l) {
      var m = l.match(/^\s*[-*] (.*)/) || null, n = !m && l.match(/^\s*\d+[.)] (.*)/);
      if (m || n) { var t = m ? 'ul' : 'ol'; if (list !== t) { if (list) out.push('</' + list + '>'); out.push('<' + t + '>'); list = t; } out.push('<li>' + (m || n)[1] + '</li>'); return; }
      if (list) { out.push('</' + list + '>'); list = null; }
      var hd = l.match(/^#{1,4} (.*)/); if (hd) out.push('<h4>' + hd[1] + '</h4>'); else if (l.trim()) out.push('<p>' + l + '</p>');
    });
    if (list) out.push('</' + list + '>');
    return out.join('');
  }
  async function api(body) {
    var tok = '';
    try { var s = await BP_SB.auth.getSession(); tok = s.data.session ? s.data.session.access_token : ''; } catch (e) {}
    var r = await fetch(BP_URL + '/functions/v1/ai-team', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: BP_ANON, Authorization: 'Bearer ' + (tok || BP_ANON) }, body: JSON.stringify(body) });
    return r.json().catch(function () { return { ok: false, error: 'Network error.' }; });
  }
  function area() { return $('bpxViewArea'); }

  window.bpAiTeam = async function () {
    css();
    if (!window.BP_LIVE) { area().innerHTML = '<div class="bpx-panel"><div class="bpx-mut">Sign in to use your AI Team.</div></div>'; if (window.bpSpin) bpSpin(false); return; }
    if (!ceoOn() && A.tab === 'ceo') A.tab = 'board';
    if (ceoOn() && A.tab === 'ceo') { draw(); }   /* the CEO shows at once; the add-on status fills the tabs in */
    A.st = await api({ op: 'status' });
    if (window.bpSpin) bpSpin(false);
    if (!A.st.ok && !ceoOn()) { area().innerHTML = '<div class="bpx-panel"><div class="bpx-mut">' + esc(A.st.error || 'Could not load.') + '</div></div>'; return; }
    if (A.st.addon !== 'active' && !ceoOn()) return pitch();
    if (A.tab === 'ceo') topBar(); else draw();
  };


  /* the team as an org board, like the owner's Command Center: you on top,
     three assistants under you, and what each one works with */
  var SVGI = {
    you: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    sales: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    marketing: '<path d="M3 11l14-6v14L3 13z"/><path d="M7 13v5a2 2 0 0 0 4 0v-3"/>',
    office: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    crm: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M16 11h5M18.5 8.5v5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>', web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', post: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 15l5-5 4 4 3-3 4 4"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/>', inv: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>', check: '<path d="M5 12.5l4.2 4.2L19 7"/>'
  };
  var ic = function (k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + SVGI[k] + '</svg>'; };
  var TOOLS = { sales: [['crm', 'CRM', 'contacts'], ['chat', 'Texts', 'follow-ups'], ['web', 'Web', 'search']],
    marketing: [['post', 'Posts', 'and ads'], ['star', 'Reviews', 'replies'], ['web', 'Web', 'competitors']],
    office: [['cal', 'Calendar', 'schedule'], ['inv', 'Invoices', 'and quotes'], ['sun', 'Brief', '7am daily']] };
  function boardHtml(live) {
    var W = 1000, H = 560, X = { sales: 190, marketing: 500, office: 810 }, topY = 80, midY = 270, toolY = 450;
    var biz = ''; try { biz = ((window.bpSettingsGet && bpSettingsGet().company) || {}).name || ''; } catch (e) {}
    var lines = '', nodes = '';
    Object.keys(X).forEach(function (k, i) {
      var x = X[k], d = 'M500,' + (topY + 34) + ' C500,' + (topY + 130) + ' ' + x + ',' + (midY - 130) + ' ' + x + ',' + (midY - 34);
      lines += '<path class="aib-ln" id="aibp' + k + '" d="' + d + '"/><circle r="2.4" class="aib-pk"><animateMotion dur="' + (4.5 + i * .7) + 's" begin="' + (i * .8) + 's" repeatCount="indefinite"><mpath href="#aibp' + k + '"/></animateMotion></circle>';
      nodes += '<button class="aib-n" style="left:' + (x / W * 100) + '%;top:' + (midY / H * 100) + '%" data-open="' + k + '"><span class="aib-i">' + ic(k) + '</span><span><b>' + AG[k].n + '</b><em>' + esc(AG[k].d.split('.')[0]) + '</em></span></button>';
      TOOLS[k].forEach(function (t, j) {
        var tx = x + (j - 1) * 92;
        lines += '<path class="aib-ln aib-t" d="M' + x + ',' + (midY + 34) + ' C' + x + ',' + (midY + 100) + ' ' + tx + ',' + (toolY - 80) + ' ' + tx + ',' + (toolY - 24) + '"/>';
        nodes += '<div class="aib-tl" style="left:' + (tx / W * 100) + '%;top:' + (toolY / H * 100) + '%"><span>' + ic(t[0]) + '</span>' + t[1] + '<small>' + t[2] + '</small></div>';
      });
    });
    [[250, 'spark', 'Claude', 'AI model'], [750, 'check', 'Approvals', 'you say yes']].forEach(function (s) {
      lines += '<path class="aib-ln aib-t" d="M' + (s[0] < 500 ? 380 : 620) + ',' + topY + ' L' + (s[0] + (s[0] < 500 ? 26 : -26)) + ',' + topY + '"/>';
      nodes += '<div class="aib-tl" style="left:' + (s[0] / W * 100) + '%;top:' + (topY / H * 100) + '%"><span>' + ic(s[1]) + '</span>' + s[2] + '<small>' + s[3] + '</small></div>';
    });
    nodes += '<div class="aib-n aib-you" style="left:50%;top:' + (topY / H * 100) + '%"><span class="aib-i">' + ic('you') + '</span><span><b>You</b><em>' + esc(biz || 'Owner') + '</em></span></div>';
    return '<div class="aib"><div class="aib-in"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + lines + '</svg>' + nodes + '</div>'
      + '<div class="aib-foot"><span class="aib-on">' + (live ? 'online' : 'preview') + '</span>' + (live ? '<span>' + A.st.used + ' of ' + A.st.cap + ' messages this month</span><span>' + (A.st.pending || 0) + ' waiting for you</span><span>daily brief 7am</span>' : '<span>3 assistants</span><span>approve before anything sends</span>') + '</div></div>';
  }
  function boardCss() {
    if (document.getElementById('aib-css')) return; var c = document.createElement('style'); c.id = 'aib-css';
    c.textContent = '.aib{background:#fff;border:1px solid #dce3ec;border-radius:18px;padding:10px 10px 0;overflow:hidden}.aib-in{position:relative;width:100%;aspect-ratio:1000/560;background-image:radial-gradient(#dfe5ec 1px,transparent 1px);background-size:18px 18px;border-radius:12px}'
      + '.aib-in>svg{position:absolute;inset:0;width:100%;height:100%}.aib-ln{fill:none;stroke:#c9d3df;stroke-width:1.6}.aib-t{stroke-dasharray:4 5}.aib-pk{fill:#006fff}'
      + '.aib-n{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #dce3ec;border-radius:14px;padding:10px 14px;text-align:left;font:inherit;cursor:pointer;min-width:190px;box-shadow:0 6px 18px -10px rgba(0,21,48,.25);transition:border-color .2s,transform .2s}.aib-n:hover{border-color:#006fff;transform:translate(-50%,-52%)}'
      + '.aib-you{cursor:default;min-width:200px}.aib-you:hover{transform:translate(-50%,-50%)}.aib-i{width:36px;height:36px;border-radius:10px;background:#e6f0ff;color:#006fff;display:grid;place-items:center;flex:none}.aib-you .aib-i{background:#006fff;color:#fff}.aib-i svg{width:19px;height:19px}'
      + '.aib-n b{display:block;font-size:14px;color:#001530}.aib-n em{display:block;font-style:normal;font-size:12px;color:#788493;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.aib-tl{position:absolute;transform:translate(-50%,-24px);display:flex;flex-direction:column;align-items:center;font-size:12px;color:#34435a;text-align:center}.aib-tl span{width:40px;height:40px;border-radius:50%;background:#fff;border:1px solid #dce3ec;display:grid;place-items:center;color:#5d6b7c;margin-bottom:5px}.aib-tl svg{width:17px;height:17px}.aib-tl small{font-size:11px;color:#9aa6b4}'
      + '.aib-foot{display:flex;flex-wrap:wrap;gap:18px;padding:12px 8px;font-size:13px;color:#788493}.aib-on{color:#15803d;font-weight:600}'
      + '@media(max-width:700px){.aib-in{aspect-ratio:auto;height:auto;display:flex;flex-direction:column;gap:8px;padding:8px;background:none}.aib-in>svg,.aib-tl{display:none}.aib-n{position:static;transform:none;width:100%}.aib-n:hover{transform:none}}';
    document.head.appendChild(c);
  }

  function pitch(host) {
    var st = A.st; boardCss(); host = host || area();
    if (!st || !st.ok) { host.innerHTML = '<div class="bpx-panel"><div class="bpx-mut">' + esc((st && st.error) || 'Could not load.') + '</div></div>'; return; }
    host.innerHTML = '<div class="bpx-panel"><div class="ai-hero"><div class="pitch">'
      + '<h2>Your AI Team</h2><div class="bpx-mut" style="max-width:52ch">Three assistants who know your business and work your leads, your marketing and your schedule. You approve anything before it goes to a customer.</div>'
      + '<div class="price">$' + st.price + '<small> / month</small></div><div class="bpx-mut" style="font-size:13px">Up to ' + st.cap + ' messages a month, plus a daily brief every morning. Cancel any time.</div>'
      + '<div style="margin-top:18px;display:flex;gap:10px;align-items:center"><button class="bpx-btn" id="aiAdd">' + (st.addon === 'checkout' ? 'Finish checkout' : st.addon === 'past_due' ? 'Update payment' : 'Add AI Team') + '</button><span class="bpx-mmsg" id="aiMsg"></span></div>'
      + (st.crm ? '' : '<div class="bpx-mut" style="font-size:12.5px;margin-top:10px">Your CRM is still being set up. Your assistants connect to it as soon as it is ready.</div>')
      + '</div><div style="flex:1;min-width:300px">' + boardHtml(false) + '</div><div class="ai-cards" style="display:none">'
      + Object.keys(AG).map(function (k) { return '<div class="ai-card"><span class="ms">' + AG[k].ic + '</span><div><b>' + AG[k].n + '</b><span class="bpx-mut" style="font-size:13.5px">' + AG[k].d + '</span></div></div>'; }).join('')
      + '</div></div></div>';
    $('aiAdd').onclick = async function () {
      var b = this; b.disabled = true; b.textContent = 'Opening checkout...';
      var r = await api({ op: 'subscribe' });
      if (r.url) { location.href = r.url; return; }
      if (r.already) return window.bpAiTeam();
      $('aiMsg').textContent = r.error || 'Could not open checkout.'; b.disabled = false; b.textContent = 'Add AI Team';
    };
  }

  /* the tab row: AI CEO first, then the add-on's own tabs (or its pitch) */
  function tabsHtml() {
    var st = A.st || {}, on = st.ok && st.addon === 'active', pct = on ? Math.min(100, Math.round(100 * st.used / Math.max(1, st.cap))) : 0;
    var ceo = ceoOn() ? '<button class="ai-tab' + (A.tab === 'ceo' ? ' on' : '') + '" data-ceo="1"><span class="ms">monitoring</span>AI CEO</button>' : '';
    if (!A.st) return ceo;
    if (!on) return ceo + '<button class="ai-tab' + (A.tab !== 'ceo' ? ' on' : '') + '" data-pitch="1"><span class="ms">diversity_3</span>AI Team</button>';
    return ceo + '<button class="ai-tab' + (A.tab === 'board' ? ' on' : '') + '" data-board="1"><span class="ms">account_tree</span>Your team</button>'
      + Object.keys(AG).map(function (k) { return '<button class="ai-tab' + (A.tab === 'chat' && A.agent === k ? ' on' : '') + '" data-ag="' + k + '"><span class="ms">' + AG[k].ic + '</span>' + AG[k].n + '</button>'; }).join('')
      + '<button class="ai-tab' + (A.tab === 'wait' ? ' on' : '') + '" data-wait="1"><span class="ms">task_alt</span>Waiting for you' + (st.pending ? '<span class="n">' + st.pending + '</span>' : '') + '</button>'
      + '<span class="ai-use" title="Messages you sent this month">' + st.used + ' of ' + st.cap + ' messages<i><b style="width:' + pct + '%"></b></i></span>';
  }
  function wire() {
    var a = area();
    var c = a.querySelector('[data-ceo]'); if (c) c.onclick = function () { A.tab = 'ceo'; draw(); };
    var p = a.querySelector('[data-pitch]'); if (p) p.onclick = function () { A.tab = 'pitch'; draw(); };
    a.querySelectorAll('[data-ag]').forEach(function (b) { b.onclick = function () { A.tab = 'chat'; A.agent = b.getAttribute('data-ag'); A.thread = null; draw(); }; });
    var w = a.querySelector('[data-wait]'); if (w) w.onclick = function () { A.tab = 'wait'; draw(); };
    var bd = a.querySelector('[data-board]'); if (bd) bd.onclick = function () { A.tab = 'board'; draw(); };
  }
  /* refresh just the tab row (the CEO body is already on screen) */
  function topBar() { var t = area().querySelector('.ai-top'); if (!t) return draw(); t.innerHTML = tabsHtml(); wire(); }
  function draw() {
    boardCss();
    var on = A.st && A.st.ok && A.st.addon === 'active';
    if (!ceoOn() && A.tab === 'ceo') A.tab = on ? 'board' : 'pitch';
    if (!on && A.tab !== 'ceo') A.tab = 'pitch';
    area().innerHTML = '<div class="ai-top">' + tabsHtml() + '</div><div id="aiBody"></div>';
    wire();
    if (A.tab === 'ceo') return window.bpCeoRender($('aiBody'));
    if (A.tab === 'pitch') return pitch($('aiBody'));
    if (A.tab === 'board') { $('aiBody').innerHTML = boardHtml(true); $('aiBody').querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { A.tab = 'chat'; A.agent = b.getAttribute('data-open'); A.thread = null; draw(); }; }); }
    else if (A.tab === 'wait') approvals(); else chat();
  }

  async function chat() {
    $('aiBody').innerHTML = '<div class="ai-wrap"><div class="ai-side" id="aiSide"><button class="on">+ New conversation</button></div><div class="ai-chat"><div class="ai-msgs" id="aiMsgs"></div>'
      + '<div class="ai-comp"><textarea id="aiIn" placeholder="Ask ' + AG[A.agent].n + '..."></textarea><button class="bpx-btn" id="aiSend">Send</button></div></div></div>';
    $('aiIn').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    $('aiSend').onclick = send;
    open(A.thread);
    var r = await api({ op: 'threads', agent: A.agent });
    var side = $('aiSide'); if (!side) return;
    side.innerHTML = '<button data-t="">+ New conversation</button>' + (r.data || []).map(function (t) { return '<button data-t="' + t.id + '" title="' + esc(t.title) + '">' + (t.kind === 'brief' ? 'Brief: ' : '') + esc(t.title) + '</button>'; }).join('');
    side.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', (b.getAttribute('data-t') || null) === A.thread); b.onclick = function () { open(b.getAttribute('data-t') || null); side.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
  }
  async function open(id) {
    A.thread = id; var box = $('aiMsgs'); if (!box) return;
    if (!id) {
      box.innerHTML = '<div class="bpx-mut">' + AG[A.agent].d + ' Ask anything, or start with one of these.</div><div class="ai-hint">' + AG[A.agent].h.map(function (x) { return '<button>' + esc(x) + '</button>'; }).join('') + '</div>';
      box.querySelectorAll('.ai-hint button').forEach(function (b) { b.onclick = function () { $('aiIn').value = b.textContent; send(); }; });
      return;
    }
    box.innerHTML = '<div class="ai-m s">Loading...</div>';
    var r = await api({ op: 'thread', id: id }); box.innerHTML = '';
    (r.data || []).forEach(add); box.scrollTop = box.scrollHeight;
  }
  function add(m) {
    var box = $('aiMsgs'); if (!box) return; var d = document.createElement('div');
    if (m.role === 'user' && /^\[The owner/.test(m.text || '')) { d.className = 'ai-m s'; d.textContent = m.text.replace(/^\[|\]$/g, '').slice(0, 160); }
    else if (m.role === 'user' && /^Write today's brief/.test(m.text || '')) { d.className = 'ai-m s'; d.textContent = 'Daily brief'; }
    else if (m.role === 'user') { d.className = 'ai-m u'; d.textContent = m.text; }
    else if (m.role === 's') { d.className = 'ai-m s' + (m.wait ? ' ai-wait' : ''); d.textContent = m.text; }
    else { d.className = 'ai-m'; d.innerHTML = (m.tools && m.tools.length ? '<div class="ai-tools">' + m.tools.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + (m.deep ? '<span class="ai-deep">Deep thinking</span>' : '') + '</div>' : (m.deep ? '<div class="ai-tools"><span class="ai-deep">Deep thinking</span></div>' : '')) + md(m.text); }
    box.appendChild(d); box.scrollTop = box.scrollHeight; return d;
  }
  async function send() {
    var inp = $('aiIn'), t = inp.value.trim(); if (!t || A.busy) return;
    A.busy = true; inp.value = ''; $('aiSend').disabled = true;
    if (!A.thread) $('aiMsgs').innerHTML = '';
    add({ role: 'user', text: t });
    var w = add({ role: 's', text: AG[A.agent].n + ' is working on it...', wait: 1 });
    var r = await api({ op: 'chat', agent: A.agent, thread_id: A.thread, message: t });
    A.busy = false; if ($('aiSend')) $('aiSend').disabled = false;
    if (w) w.remove();
    if (!r.ok) { add({ role: 's', text: r.error || 'Something went wrong.' }); return; }
    A.thread = r.thread_id; A.st.used++;
    await open(A.thread);
    if (r.approvals && r.approvals.length) { A.st.pending += r.approvals.length; add({ role: 's', text: r.approvals.length + ' draft' + (r.approvals.length > 1 ? 's are' : ' is') + ' waiting for your OK under "Waiting for you".' }); }
    var use = document.querySelector('.ai-use'); if (use) use.firstChild.textContent = A.st.used + ' of ' + A.st.cap + ' messages';
  }

  async function approvals() {
    $('aiBody').innerHTML = '<div class="bpx-mut">Loading...</div>';
    var r = await api({ op: 'approvals' }), rows = r.data || [];
    var p = rows.filter(function (x) { return x.status === 'pending'; }), done = rows.filter(function (x) { return x.status !== 'pending'; }).slice(0, 15);
    A.st.pending = p.length;
    $('aiBody').innerHTML = '<div style="display:grid;gap:10px">'
      + (p.length ? p.map(function (x) {
        var a = (x.input && x.input.args) || {}, isMsg = x.input && x.input.op === 'conversations.send';
        return '<div class="ai-ap" data-id="' + x.id + '"><div><span class="bpx-badge">' + esc((AG[x.agent] || {}).n || x.agent) + '</span> <b>' + esc(isMsg ? (a.type === 'Email' ? 'Send an email' : 'Send a text') : x.summary) + '</b></div>'
          + (isMsg ? '<div class="bpx-mut" style="font-size:13px">' + esc(String(x.summary).replace(/^[a-z]+ [a-z]+: /i, '')) + '</div><textarea>' + esc(a.message || '') + '</textarea>' : '<div class="bpx-mut" style="font-size:13px">' + esc(JSON.stringify(a)) + '</div>')
          + '<div style="display:flex;gap:8px"><button class="bpx-btn" data-ok>' + (isMsg ? 'Send' : 'Approve') + '</button><button class="bpx-rowbtn" data-no style="margin:0">Decline</button><span class="bpx-mmsg"></span></div></div>';
      }).join('') : '<div class="bpx-panel"><div class="bpx-mut">Nothing waiting. Drafts your assistants write for customers show up here for a one-tap OK.</div></div>')
      + (done.length ? '<div class="bpx-mut" style="margin-top:10px;font-size:13px">Recently</div>' + done.map(function (x) { return '<div class="bpx-mut" style="font-size:13px">' + (x.status === 'approved' ? 'Sent' : x.status === 'failed' ? 'Failed' : 'Declined') + ': ' + esc(x.summary) + '</div>'; }).join('') : '')
      + '</div>';
    $('aiBody').querySelectorAll('.ai-ap').forEach(function (card) {
      var id = card.getAttribute('data-id'), msg = card.querySelector('.bpx-mmsg');
      card.querySelector('[data-ok]').onclick = async function () { this.disabled = true; var ta = card.querySelector('textarea'); var r = await api({ op: 'approve', id: id, message: ta ? ta.value : undefined }); if (r.ok) { card.remove(); A.st.pending--; } else { msg.textContent = r.error || 'Failed.'; this.disabled = false; } };
      card.querySelector('[data-no]').onclick = async function () { await api({ op: 'reject', id: id }); card.remove(); A.st.pending--; };
    });
  }
})();
