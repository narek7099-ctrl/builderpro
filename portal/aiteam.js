/* ==================================================================
   AI Team: the $49/month add-on. Eight assistants (Sales, Marketing,
   Research, Client Care, Office, Projects, Permits, Workflows) under the
   AI CEO,
   working on this contractor's own leads, CRM, projects and marketing.
   Everything they want to send to a customer waits under "Waiting for
   you" until the owner approves it. Backend: supabase/functions/ai-team.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var A = window.BP_AITEAM = { st: null, agent: 'sales', thread: null, tab: 'board', busy: false };
  /* the AI CEO tab (portal/aiceo.js): owner and office, whether or not the add-on is on */
  var ceoOn = function () { return !!window.bpCeoRender && !(window.bpTeamIsCrew && bpTeamIsCrew()); };
  var AG = {
    sales: { n: 'Sales', ic: 'trending_up', d: 'Follows up on leads and quotes so jobs don’t slip away.',
      h: ['Who should I follow up with today?', 'Write a text for a quote that went quiet', 'Give me a call script for a new lead'] },
    marketing: { n: 'Marketing', ic: 'campaign', d: 'Writes your ads, posts and promotions.',
      h: ['Write 3 Facebook ads for this month', 'Plan a week of social posts', 'What are competitors near me offering?'] },
    office: { n: 'Office', ic: 'event_note', d: 'Your schedule, reminders, invoices and the 7am daily brief.',
      h: ['What’s on my schedule this week?', 'Which quotes and invoices need chasing?', 'Summarize yesterday for me'] },
    clients: { n: 'Client Care', ic: 'handshake', d: 'Keeps customers updated, answered and happy, and asks for reviews.',
      h: ['Which customers need a progress update?', 'Draft a reply to an upset customer', 'Who should I ask for a review this week?'] },
    research: { n: 'Research', ic: 'travel_explore', d: 'Finds the marketing tactics and prices that work in your area.',
      h: ['What are competitors near me charging?', 'Which ads work best for contractors right now?', 'Give me a 30-day marketing plan'] },
    workflows: { n: 'Workflows', ic: 'account_tree', d: 'Finds leads and quotes stuck in your pipeline and automations.',
      h: ['Which leads are stuck and why?', 'Which quotes never got a follow-up?', 'What did my automations miss this week?'] },
    permits: { n: 'Permits', ic: 'assignment', d: 'Tracks permits, inspections and what each permit office needs.',
      h: ['Which permits are pending or expiring?', 'What inspections are coming up?', 'What does my city need for a roofing permit?'] },
    projects: { n: 'Projects', ic: 'construction', d: 'Watches jobs for overdue phases, overruns and missing crew.',
      h: ['Which projects are behind schedule?', 'Are any jobs over budget?', 'Which jobs have nobody assigned?'] }
  };
  /* how the chart groups them */
  

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
      '@media(max-width:700px){.ai-top{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-left:-4px;padding:2px 4px}.ai-top::-webkit-scrollbar{display:none}.ai-tab{flex:none}.ai-use{flex:none;margin-left:8px}}',
      '.ai-tab .n{background:#e0574e;color:#fff;border-radius:9px;font-size:11px;padding:0 6px}',
      '.ai-use{margin-left:auto;font-size:13px;color:var(--mu,#788493);display:flex;align-items:center;gap:8px}',
      '.ai-use i{display:block;width:90px;height:6px;border-radius:6px;background:#e7ecf2;overflow:hidden}.ai-use i b{display:block;height:100%;background:var(--a,#006fff)}',
      '.ai-wrap{display:grid;grid-template-columns:240px minmax(0,1fr);gap:0;border:1px solid var(--line,#dce3ec);border-radius:16px;background:#fff;overflow:hidden;height:calc(100vh - 190px);min-height:480px}',
      '.ai-side{display:flex;flex-direction:column;gap:2px;overflow:auto;padding:10px;background:#f7f8fa;border-right:1px solid var(--line,#dce3ec)}',
      '.ai-side button{background:none;border:0;text-align:left;padding:8px 10px;border-radius:8px;font:inherit;font-size:13.5px;color:#34435a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;flex:none}',
      '.ai-side button.on,.ai-side button:hover{background:#e9edf2;color:var(--txt,#001530)}',
      '.ai-side .ai-new{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--txt,#001530);border:1px solid var(--line,#dce3ec);background:#fff;margin-bottom:8px}',
      '.ai-side small{font-size:11.5px;color:var(--mu,#788493);padding:8px 10px 2px}',
      '.ai-chat{display:flex;flex-direction:column;min-width:0;min-height:0}',
      '.ai-msgs{flex:1;overflow:auto;padding:24px 16px 8px}',
      '.ai-col{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:22px}',
      '.ai-m{line-height:1.65;font-size:15px;color:var(--txt,#001530)}',
      '.ai-m.a{display:grid;grid-template-columns:30px minmax(0,1fr);gap:12px}',
      '.ai-av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;display:grid;place-items:center}.ai-av .ms{font-size:16px;color:#fff!important}',
      '.ai-m.u{align-self:flex-end;max-width:75%;background:#f0f2f5;border-radius:18px;padding:10px 16px;white-space:pre-wrap}',
      '.ai-m.s{font-size:13px;color:var(--mu,#788493);text-align:center}',
      '.ai-m p{margin:0 0 10px}.ai-m p:last-child{margin-bottom:0}.ai-m ul,.ai-m ol{padding-left:22px;margin:0 0 10px}.ai-m h4{margin:14px 0 6px;font-size:15px}',
      '.ai-tools{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}.ai-tools span{font-size:11.5px;color:var(--mu,#788493);background:#f3f6f9;border-radius:6px;padding:1px 7px}',
      '.ai-deep{font-size:11px;color:#003db8;background:#e6f0ff;border-radius:6px;padding:1px 7px;margin-left:4px}',
      '.ai-comp{padding:8px 16px 16px}',
      '.ai-box{max-width:760px;margin:0 auto;display:flex;align-items:flex-end;gap:8px;border:1px solid var(--line,#dce3ec);border-radius:24px;padding:8px 8px 8px 18px;background:#fff;box-shadow:0 4px 18px -8px rgba(0,21,48,.18)}',
      '.ai-box:focus-within{border-color:#b9c6d6}',
      '#bpx#bpx#bpx#bpx .ai-box textarea{flex:1;resize:none;border:0!important;outline:0;box-shadow:none!important;background:transparent!important;padding:7px 0!important;min-height:22px!important;max-height:200px;font:inherit;font-size:15px!important;line-height:1.5}',
      '.ai-send{width:36px;height:36px;border-radius:50%;border:0;background:var(--txt,#001530);color:#fff;display:grid;place-items:center;cursor:pointer;flex:none}.ai-send:disabled{opacity:.35;cursor:default}.ai-send .ms{font-size:20px;color:#fff!important}',
      '.ai-fine{max-width:760px;margin:6px auto 0;text-align:center;font-size:11.5px;color:var(--mu,#788493)}',
      '.ai-hello{text-align:center;padding:8vh 0 18px}.ai-hello .ai-av{width:48px;height:48px;margin:0 auto 14px}.ai-hello .ai-av .ms{font-size:24px}.ai-hello h2{margin:0 0 6px;font-size:24px;letter-spacing:-.02em}',
      '.ai-hint{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}.ai-hint button{text-align:left;background:#fff;border:1px solid var(--line,#dce3ec);border-radius:14px;padding:12px 14px;cursor:pointer;font:inherit;font-size:13.5px;color:#34435a}.ai-hint button:hover{background:#f6f8fb}',
      '.ai-wrap .ai-msgs{display:block;max-height:none;min-height:0;text-align:left}.ai-wrap .ai-m{display:block;max-width:none;gap:0}.ai-wrap .ai-m.a{display:grid}.ai-wrap .ai-m.u{max-width:75%}',
      '.ai-wait{animation:aiblink 1.2s ease-in-out infinite}@keyframes aiblink{50%{opacity:.4}}',
      '.ai-ap{border:1px solid var(--line,#dce3ec);border-radius:14px;padding:14px;background:#fff;display:grid;gap:8px}',
      '.ai-ap textarea{box-sizing:border-box;width:100%;min-height:80px;border:1px solid var(--line,#dce3ec);border-radius:10px;padding:10px;font:inherit}',
      '@media(max-width:860px){.ai-hero,.ai-wrap{grid-template-columns:minmax(0,1fr)}.ai-wrap{height:calc(100vh - 230px);grid-template-rows:auto minmax(0,1fr)}.ai-side{flex-direction:row;align-items:center;overflow-x:auto;border-right:0;border-bottom:1px solid var(--line,#dce3ec);padding:8px}.ai-side small{display:none}.ai-side .ai-new{margin:0}.ai-side button{max-width:180px}.ai-use{margin-left:0;width:100%}.ai-wrap .ai-m.u{max-width:88%}.ai-msgs{padding:16px 12px 8px}}',
      '#bpx.bpx-dark .ai-wrap,#bpx.bpx-dark .ai-box,#bpx.bpx-dark .ai-hint button,#bpx.bpx-dark .ai-side .ai-new{background:#111827;border-color:#262f45}#bpx.bpx-dark .ai-side{background:#0d1320;border-color:#262f45}#bpx.bpx-dark .ai-m.u{background:#1e2738}#bpx.bpx-dark .ai-m,#bpx.bpx-dark .ai-side button.on{color:#e5e9f0}#bpx.bpx-dark .ai-side button.on,#bpx.bpx-dark .ai-side button:hover{background:#1e2738}#bpx.bpx-dark .ai-send{background:#e5e9f0;color:#111827}#bpx.bpx-dark .ai-send .ms{color:#111827!important}'
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


  /* the team as a live board, like the owner's Command Center: the AI CEO
     in the middle, the eight assistants around it, each wired to the CEO
     with a link a packet travels along, and the tools each one uses */
  var KIT = { sales: [['contacts', 'CRM'], ['sms', 'Texts'], ['travel_explore', 'Web']], marketing: [['campaign', 'Ads'], ['star', 'Reviews'], ['travel_explore', 'Web']],
    research: [['travel_explore', 'Web'], ['query_stats', 'Prices']], clients: [['construction', 'Projects'], ['sms', 'Texts']], office: [['calendar_month', 'Calendar'], ['receipt_long', 'Invoices']],
    projects: [['construction', 'Projects'], ['payments', 'Budgets']], permits: [['assignment', 'Permits'], ['travel_explore', 'Web']], workflows: [['account_tree', 'Pipeline'], ['label', 'Tags']] };
  var RING = ['sales', 'marketing', 'research', 'clients', 'projects', 'permits', 'workflows', 'office'];
  function boardHtml(live) {
    var W = 1000, H = 800, cx = 500, cy = 400, rx = 375, ry = 265, svg = '', nodes = '';
    RING.forEach(function (k, i) {
      var ang = (-90 + 22.5 + i * 45) * Math.PI / 180, x = cx + rx * Math.cos(ang), y = cy + ry * Math.sin(ang);
      var mx = (cx + x) / 2, d = 'M' + cx + ',' + cy + ' C' + mx + ',' + cy + ' ' + mx + ',' + y + ' ' + x + ',' + y, id = 'aibl' + k;
      svg += '<path id="' + id + '" class="aib-ln" d="' + d + '"/><circle r="2.4" class="aib-pk"><animateMotion dur="' + (4.8 + (i % 4) * 0.7) + 's" begin="' + (i * 0.55) + 's" repeatCount="indefinite" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".45 0 .25 1"><mpath href="#' + id + '"/></animateMotion></circle>';
      /* its tools, fanned out on the far side from the CEO */
      var kit = KIT[k] || [], out = x < cx ? -1 : 1, below = y > cy;
      kit.forEach(function (t, j) {
        var tx = x + out * (0) + (j - (kit.length - 1) / 2) * 66, ty = y + (below ? 92 : -92);
        svg += '<path class="aib-ln aib-t" d="M' + x + ',' + (y + (below ? 30 : -30)) + ' L' + tx + ',' + (ty + (below ? -20 : 20)) + '"/>';
        nodes += '<div class="aib-tl" style="--dl:' + (0.35 + i * 0.06) + 's;left:' + (tx / W * 100) + '%;top:' + (ty / H * 100) + '%"><i><span class="ms">' + t[0] + '</span></i>' + t[1] + '</div>';
      });
      nodes += '<button type="button" class="aib-n" data-open="' + k + '" style="--dl:' + (0.12 + i * 0.06) + 's;left:' + (x / W * 100) + '%;top:' + (y / H * 100) + '%"><span class="aib-box"><span class="aib-i"><span class="ms">' + AG[k].ic + '</span></span><span class="aib-tx"><b>' + esc(AG[k].n) + '</b><em>' + esc(AG[k].d) + '</em></span></span></button>';
    });
    /* the CEO's own wiring: the model it thinks with, and you, who approve */
    [[-1, 'spark', 'Claude', 'AI model'], [1, 'task_alt', 'Approvals', 'you say yes']].forEach(function (t) {
      var tx = cx + t[0] * 205;
      svg += '<path class="aib-ln aib-t" d="M' + (cx + t[0] * 112) + ',' + cy + ' L' + (tx - t[0] * 24) + ',' + cy + '"/>';
      nodes += '<div class="aib-tl" style="--dl:.3s;left:' + (tx / W * 100) + '%;top:' + (cy / H * 100) + '%"><i><span class="ms">' + (t[1] === 'spark' ? 'auto_awesome' : t[1]) + '</span></i>' + t[2] + '<small>' + t[3] + '</small></div>';
    });
    nodes += '<button type="button" class="aib-n aib-ceo" data-ceoopen="1" style="--dl:0s;left:50%;top:50%"><span class="aib-box"><span class="aib-i"><span class="ms">monitoring</span></span><span class="aib-tx"><b>AI CEO</b><em>Watches the whole business and routes work</em></span></span></button>';
    var list = '<div class="aib-list">' + ['ceo'].concat(RING).map(function (k) {
      var c = k === 'ceo';
      return '<button type="button" class="aib-n' + (c ? ' aib-ceo' : '') + '" ' + (c ? 'data-ceoopen="1"' : 'data-open="' + k + '"') + '><span class="aib-box"><span class="aib-i"><span class="ms">' + (c ? 'monitoring' : AG[k].ic) + '</span></span><span class="aib-tx"><b>' + (c ? 'AI CEO' : esc(AG[k].n)) + '</b><em>' + (c ? 'Watches the whole business and routes work' : esc(AG[k].d)) + '</em></span></span></button>';
    }).join('') + '</div>';
    return '<div class="aib"><div class="aib-wrap"><div class="aib-in"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + svg + '</svg>' + nodes + '</div></div>' + list
      + '<div class="aib-foot"><span class="aib-on">' + (live ? 'online' : 'preview') + '</span>' + (live ? '<span>' + A.st.used + ' of ' + A.st.cap + ' messages this month</span><span>' + (A.st.pending || 0) + ' waiting for you</span><span>daily brief 7am</span>' : '<span>AI CEO + ' + RING.length + ' assistants</span><span>you approve before anything sends</span>') + '</div></div>';
  }
  function boardCss() {
    if (document.getElementById('aib-css')) return; var c = document.createElement('style'); c.id = 'aib-css';
    c.textContent = '.aib{position:relative;background:var(--card,#fff);border:1px solid var(--line,#dce3ec);border-radius:16px;overflow:hidden}'
      + '.aib:before{content:"";position:absolute;inset:0;background-image:radial-gradient(var(--line,#dce3ec) 1px,transparent 1px);background-size:20px 20px;pointer-events:none;-webkit-mask-image:radial-gradient(80% 70% at 50% 45%,#000,transparent);mask-image:radial-gradient(80% 70% at 50% 45%,#000,transparent)}'
      + '.aib-wrap{position:relative;width:100%}.aib-in{position:relative;width:100%;aspect-ratio:1000/800}'
      + '.aib-in>svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}'
      + '.aib-ln{fill:none;stroke:var(--line,#c9d3df);stroke-width:1.3}.aib-t{stroke-dasharray:3 4;stroke:#cfd8e3}.aib-pk{fill:#2457d6;opacity:.7}'
      + '.aib-n{position:absolute;transform:translate(-50%,-50%);background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;opacity:0;animation:aibPop .6s cubic-bezier(.2,0,0,1) forwards;animation-delay:var(--dl,0s)}'
      + '@keyframes aibPop{from{opacity:0;transform:translate(-50%,-44%)}to{opacity:1;transform:translate(-50%,-50%)}}'
      + '.aib-box{display:flex;align-items:center;gap:10px;width:200px;background:var(--card,#fff);border:1px solid var(--line,#dce3ec);border-radius:12px;padding:10px 12px;text-align:left;box-shadow:0 4px 14px -10px rgba(0,21,48,.3);transition:border-color .2s,transform .2s,box-shadow .2s}'
      + '.aib-n:hover .aib-box{border-color:#2457d6;transform:translateY(-2px);box-shadow:0 10px 24px -12px rgba(0,21,48,.3)}'
      + '.aib-ceo .aib-box{width:224px;padding:13px 14px;border-color:#c7d7fe;background:linear-gradient(180deg,#f5f8ff,var(--card,#fff))}'
      + '.aib-i{width:34px;height:34px;border-radius:9px;background:#e8efff;color:#2457d6;display:grid;place-items:center;flex:none}.aib-i .ms{font-size:19px}'
      + '.aib-ceo .aib-i{width:38px;height:38px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff}'
      + '.aib-tx{min-width:0}.aib-n b{display:block;font-size:13.5px;color:var(--ink,#101828);white-space:nowrap}'
      + '.aib-n em{display:block;font-style:normal;font-size:11.5px;line-height:1.3;color:var(--mu,#667085);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.aib-ceo em{max-width:160px}'
      + '.aib-tl{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:var(--ink,#344054);width:72px;text-align:center;opacity:0;animation:aibFade .6s ease forwards;animation-delay:var(--dl,0s)}'
      + '@keyframes aibFade{to{opacity:1}}'
      + '.aib-tl i{width:34px;height:34px;border-radius:50%;background:var(--card,#fff);border:1px solid var(--line,#dce3ec);display:grid;place-items:center;color:var(--mu,#667085);font-style:normal}.aib-tl i .ms{font-size:16px}'
      + '.aib-tl small{color:var(--mu,#98a2b3);font-size:10px;margin-top:-2px}'
      + '.aib-list{display:none;position:relative;padding:12px;gap:8px;flex-direction:column}.aib-list .aib-n{position:static;transform:none;opacity:1;animation:none;width:100%}.aib-list .aib-box{width:100%}.aib-list .aib-n em{max-width:none;white-space:normal}'
      + '.aib-foot{position:relative;display:flex;flex-wrap:wrap;gap:18px;padding:12px 16px;font-size:13px;color:var(--mu,#788493);border-top:1px solid var(--line,#eef1f6)}.aib-on{color:#15803d;font-weight:600}'
      /* the portal presses every button with transform:scale; these are placed by their transform, so keep it while pressed */
      + '#bpx#bpx#bpx .aib-wrap .aib-n:active{transform:translate(-50%,-50%) scale(.98) !important}#bpx#bpx#bpx .aib-list .aib-n:active{transform:scale(.99) !important}'
      + '@media(max-width:820px){.aib-wrap{display:none}.aib-list{display:flex}}';
    document.head.appendChild(c);
  }

  function pitch(host) {
    var st = A.st; boardCss(); host = host || area();
    if (!st || !st.ok) { host.innerHTML = '<div class="bpx-panel"><div class="bpx-mut">' + esc((st && st.error) || 'Could not load.') + '</div></div>'; return; }
    host.innerHTML = '<div class="bpx-panel"><div class="ai-hero"><div class="pitch">'
      + '<h2>Your AI Team</h2><div class="bpx-mut" style="max-width:52ch">An AI CEO and eight assistants who know your business: they work your leads, customers, marketing, projects and permits. You approve anything before it goes to a customer.</div>'
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
    /* Your team first, then the AI CEO, then each assistant */
    if (!on) return '<button class="ai-tab' + (A.tab !== 'ceo' ? ' on' : '') + '" data-pitch="1"><span class="ms">diversity_3</span>AI Team</button>' + ceo;
    return '<button class="ai-tab' + (A.tab === 'board' ? ' on' : '') + '" data-board="1"><span class="ms">account_tree</span>Your team</button>' + ceo
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
    if (A.tab === 'board') { $('aiBody').innerHTML = boardHtml(true); $('aiBody').querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { A.tab = 'chat'; A.agent = b.getAttribute('data-open'); A.thread = null; draw(); }; });
      var ce = $('aiBody').querySelector('[data-ceoopen]'); if (ce) ce.onclick = function () { if (ceoOn()) { A.tab = 'ceo'; draw(); } }; }
    else if (A.tab === 'wait') approvals(); else chat();
  }

  var AV = '<span class="ai-av"><span class="ms">auto_awesome</span></span>';
  /* a ChatGPT/Claude-style screen: conversations on the left, one centered column, a rounded composer at the bottom */
  window.bpChatShell = function (opts) {
    return '<div class="ai-wrap"><div class="ai-side" id="aiSide"><button class="ai-new on" data-t=""><span class="ms">edit_square</span>New chat</button></div>'
      + '<div class="ai-chat"><div class="ai-msgs" id="aiMsgs"><div class="ai-col" id="aiCol"></div></div>'
      + '<div class="ai-comp"><div class="ai-box"><textarea id="aiIn" rows="1" maxlength="4000" placeholder="' + esc(opts.ph) + '"' + (opts.off ? ' disabled' : '') + '></textarea><button class="ai-send" id="aiSend" aria-label="Send" disabled><span class="ms">arrow_upward</span></button></div>'
      + '<div class="ai-fine">' + esc(opts.fine || '') + '</div></div></div></div>';
  };
  window.bpChatWire = function (send) {
    var i = $('aiIn'), b = $('aiSend'); if (!i) return;
    var fit = function () { i.style.height = 'auto'; i.style.height = Math.min(200, i.scrollHeight) + 'px'; b.disabled = !i.value.trim() || i.disabled; };
    i.oninput = fit; i.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (i.value.trim()) send(); } };
    b.onclick = function () { if (i.value.trim()) send(); };
    i.bpFit = fit; fit();
  };
  async function chat() {
    $('aiBody').innerHTML = bpChatShell({ ph: 'Message ' + AG[A.agent].n + '…', fine: 'Anything for a customer waits for your OK first.' });
    bpChatWire(send);
    open(A.thread);
    var r = await api({ op: 'threads', agent: A.agent });
    var side = $('aiSide'); if (!side) return;
    side.innerHTML = '<button class="ai-new" data-t=""><span class="ms">edit_square</span>New chat</button>' + ((r.data || []).length ? '<small>Recent</small>' : '') + (r.data || []).map(function (t) { return '<button data-t="' + t.id + '" title="' + esc(t.title) + '">' + (t.kind === 'brief' ? 'Brief: ' : '') + esc(t.title) + '</button>'; }).join('');
    side.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', (b.getAttribute('data-t') || null) === A.thread); b.onclick = function () { open(b.getAttribute('data-t') || null); side.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
  }
  function col() { return $('aiCol'); }
  function bottom() { var m = $('aiMsgs'); if (m) m.scrollTop = m.scrollHeight; }
  async function open(id) {
    A.thread = id; var box = col(); if (!box) return;
    if (!id) {
      box.innerHTML = '<div class="ai-hello">' + AV + '<h2>How can ' + AG[A.agent].n + ' help?</h2><div class="bpx-mut">' + AG[A.agent].d + '</div></div><div class="ai-hint">' + AG[A.agent].h.map(function (x) { return '<button>' + esc(x) + '</button>'; }).join('') + '</div>';
      box.querySelectorAll('.ai-hint button').forEach(function (b) { b.onclick = function () { $('aiIn').value = b.textContent; send(); }; });
      return;
    }
    box.innerHTML = '<div class="ai-m s">Loading…</div>';
    var r = await api({ op: 'thread', id: id }); box.innerHTML = '';
    (r.data || []).forEach(add); bottom();
  }
  function add(m) {
    var box = col(); if (!box) return; var d = document.createElement('div');
    if (m.role === 'user' && /^\[The owner/.test(m.text || '')) { d.className = 'ai-m s'; d.textContent = m.text.replace(/^\[|\]$/g, '').slice(0, 160); }
    else if (m.role === 'user' && /^Write today's brief/.test(m.text || '')) { d.className = 'ai-m s'; d.textContent = 'Daily brief'; }
    else if (m.role === 'user') { d.className = 'ai-m u'; d.textContent = m.text; }
    else if (m.role === 's') { d.className = 'ai-m s' + (m.wait ? ' ai-wait' : ''); d.textContent = m.text; }
    else { d.className = 'ai-m a'; d.innerHTML = AV + '<div>' + (m.tools && m.tools.length ? '<div class="ai-tools">' + m.tools.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + (m.deep ? '<span class="ai-deep">Deep thinking</span>' : '') + '</div>' : (m.deep ? '<div class="ai-tools"><span class="ai-deep">Deep thinking</span></div>' : '')) + md(m.text) + '</div>'; }
    box.appendChild(d); bottom(); return d;
  }
  async function send() {
    var inp = $('aiIn'), t = inp.value.trim(); if (!t || A.busy) return;
    A.busy = true; inp.value = ''; if (inp.bpFit) inp.bpFit(); $('aiSend').disabled = true;
    if (!A.thread) col().innerHTML = '';
    add({ role: 'user', text: t });
    var w = add({ role: 's', text: AG[A.agent].n + ' is working on it...', wait: 1 });
    var r = await api({ op: 'chat', agent: A.agent, thread_id: A.thread, message: t });
    A.busy = false; if ($('aiIn') && $('aiIn').bpFit) $('aiIn').bpFit();
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
