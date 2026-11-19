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
    ceo: { n: 'AI CEO', ic: 'monitoring', d: 'Manages your team: hands out tasks, asks the others and pulls it together.',
      h: ['What should my team focus on this week?', 'Get Sales and Estimator to review my open quotes', 'Plan tomorrow: crews, jobs and follow-ups'] },
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
      h: ['Which projects are behind schedule?', 'Are any jobs over budget?', 'Which jobs have nobody assigned?'] },
    dispatch: { n: 'Dispatch', ic: 'route', d: 'Puts the right crew on each job and plans the day’s routes and weather.',
      h: ['Plan tomorrow: who goes where, in what order?', 'Which jobs have nobody on them?', 'Will the weather stop any roof jobs this week?'] },
    estimator: { n: 'Estimator', ic: 'request_quote', d: 'Prices jobs from your price list and catches estimates priced too low.',
      h: ['Build a good/better/best for a 28-square roof replacement', 'Which of my open estimates are priced too low?', 'Which estimates are worth following up today?'] }
  };
  /* the app pages each assistant can read (supabase/functions/ai-team ACCESS), on top of the CRM and projects */
  var PG = { leads: 'Leads', lead_sources: 'Lead sources', calculator_leads: 'Calculator leads', estimates: 'Estimates', contracts: 'Contracts', payments: 'Payments', money: 'Income & expenses',
    customer_messages: 'Customer messages', change_orders: 'Change orders', reviews: 'Reviews', calendar_notes: 'Calendar', team: 'Employees', hours: 'Timesheets',
    subcontractors: 'Subcontractors', materials: 'Material orders', inspections: 'Inspections', website: 'Website visits', social: 'Social posts', competitors: 'Competitors', storms: 'Storm alerts' };
  var SEE = {
    sales: ['leads', 'calculator_leads', 'estimates', 'contracts', 'lead_sources', 'website', 'storms'],
    marketing: ['website', 'social', 'reviews', 'competitors', 'lead_sources', 'leads', 'storms'],
    research: ['competitors', 'website', 'lead_sources', 'leads', 'reviews'],
    clients: ['customer_messages', 'change_orders', 'reviews', 'estimates', 'contracts', 'payments', 'storms'],
    office: ['calendar_notes', 'payments', 'money', 'estimates', 'contracts', 'hours', 'materials', 'customer_messages'],
    projects: ['team', 'hours', 'subcontractors', 'materials', 'change_orders', 'payments', 'money', 'inspections'],
    permits: ['inspections', 'calendar_notes', 'subcontractors', 'storms'],
    workflows: ['leads', 'calculator_leads', 'estimates', 'contracts', 'lead_sources', 'customer_messages', 'change_orders'],
    ceo: ['leads', 'estimates', 'contracts', 'payments', 'money', 'customer_messages', 'team', 'reviews', 'storms'],
    dispatch: ['team', 'hours', 'calendar_notes', 'subcontractors', 'inspections', 'storms'],
    estimator: ['estimates', 'contracts', 'change_orders', 'calculator_leads', 'materials', 'money'] };
  /* everything an assistant is connected to: the CRM, projects, its own tools, the web and the pages it can read */
  var TL = { ghl: 'CRM', projects: 'Projects', assign_task: 'Task board', ceo_snapshot: 'Business snapshot', crew_match: 'Crew match', price_list: 'Price list' };
  function conns(k) {
    var st = A.st && A.st.agents ? A.st.agents.filter(function (a) { return a.key === k; })[0] : null;
    var tools = (st && st.tools) || ['ghl', 'projects'], pages = (st && st.pages) || SEE[k] || [];
    var out = tools.filter(function (t) { return TL[t]; }).map(function (t) { return TL[t]; });
    if (st ? st.web : ['sales', 'marketing', 'research', 'permits', 'ceo', 'dispatch'].indexOf(k) >= 0) out.push('Web');
    return out.concat(pages.map(function (x) { return PG[x] || x; }));
  }
  function seeLine(k) {
    var st = A.st && A.st.agents ? A.st.agents.filter(function (a) { return a.key === k; })[0] : null;
    var c = conns(k);
    return c.length ? '<div class="ai-see"><span class="ms">hub</span><span>Connected to: ' + c.map(esc).join(', ') + '</span></div>' : '';
  }
  /* how the chart groups them */
  

  function css() {
    if ($('bpAiCss')) return;
    var s = document.createElement('style'); s.id = 'bpAiCss';
    s.textContent = [
      '.ai-hero{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:stretch}',
      '.ai-tkf{display:grid;grid-template-columns:170px minmax(0,1fr) 110px;gap:8px}.ai-tkf select,.ai-tkf input{min-width:0}',
      '@media(max-width:700px){.ai-tkf{grid-template-columns:1fr}}',
      '.ai-tk{background:var(--card,#fff);border:1px solid var(--line,#e3e8ef);border-radius:14px;padding:12px 14px;margin-bottom:8px}',
      '.ai-tk-h{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.ai-tk-h b{font-size:14px}',
      '.ai-tk-s{font-size:11.5px;font-weight:600;border:1px solid;border-radius:99px;padding:1px 8px}',
      '.ai-tk-r{margin-top:8px;padding:10px 12px;background:var(--soft,#f4f6fa);border-radius:10px;font-size:13.5px;white-space:pre-wrap;line-height:1.5}',
      '.ai-hero .pitch h2{font-size:26px;letter-spacing:-.03em;margin:0 0 6px}',
      '.ai-hero .price{font-size:34px;font-weight:600;letter-spacing:-.03em;margin:14px 0 4px}.ai-hero .price small{font-size:14px;color:var(--mu,#788493);font-weight:500}',
      '.ai-cards{display:grid;gap:10px}',
      '.ai-card{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line,#dce3ec);border-radius:14px;padding:14px;background:#fff}',
      '.ai-card .ms,.ai-tab .ms{color:var(--a,#006fff)}',
      '.ai-card b{display:block;margin-bottom:2px}',
      '.ai-top{display:flex;flex-wrap:nowrap;gap:6px;align-items:center;margin-bottom:14px;overflow-x:auto;scrollbar-width:none;padding:2px;-webkit-mask-image:linear-gradient(90deg,#000 92%,transparent);mask-image:linear-gradient(90deg,#000 92%,transparent)}.ai-top::-webkit-scrollbar{display:none}',
      '.ai-tab{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line,#dce3ec);background:#fff;border-radius:999px;padding:7px 13px;font-weight:500;cursor:pointer;flex:none;white-space:nowrap}',
      '.ai-tab.on{border-color:var(--a,#006fff);background:#e6f0ff;color:#003db8}',
      '@media(max-width:700px){.ai-top{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-left:-4px;padding:2px 4px}.ai-top::-webkit-scrollbar{display:none}.ai-tab{flex:none}.ai-use{flex:none;margin-left:8px}}',
      '.ai-see{display:flex;gap:6px;align-items:flex-start;justify-content:center;max-width:520px;margin:10px auto 0;font-size:12.5px;line-height:1.45;color:var(--mu,#788493);text-align:left}.ai-see .ms{font-size:16px;margin-top:1px}',
      '.ai-tab .n{background:#0970F7;color:#fff;border-radius:9px;font-size:11px;padding:0 6px}',
      '.ai-use{margin-left:auto;flex:none;padding-right:24px;font-size:13px;color:var(--mu,#788493);display:flex;align-items:center;gap:8px}',
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
      '.ai-av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#3a76ed);color:#fff;display:grid;place-items:center}.ai-av .ms{font-size:16px;color:#fff!important}',
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
      '@media(max-width:860px){.ai-hero,.ai-wrap{grid-template-columns:minmax(0,1fr)}.ai-wrap{height:calc(100vh - 230px);grid-template-rows:auto minmax(0,1fr)}.ai-side{flex-direction:row;align-items:center;overflow-x:auto;scrollbar-width:none;border-right:0;border-bottom:1px solid var(--line,#dce3ec);padding:8px}.ai-side::-webkit-scrollbar{display:none}.ai-side small{display:none}.ai-side .ai-new{margin:0}.ai-side button{max-width:180px}.ai-use{margin-left:0;width:100%}.ai-wrap .ai-m.u{max-width:88%}.ai-msgs{padding:16px 12px 8px}}',
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
    var r;
    try { r = await fetch(BP_URL + '/functions/v1/ai-team', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: BP_ANON, Authorization: 'Bearer ' + (tok || BP_ANON) }, body: JSON.stringify(body) }); }
    catch (e) { return { ok: false, error: navigator.onLine === false ? 'Your AI team needs a signal. What they’ve done so far shows here once you’re back online.' : 'Network error.' }; }
    return r.json().catch(function () { return { ok: false, error: 'Network error.' }; });
  }
  function area() { return $('bpxViewArea'); }

  window.bpAiTeam = async function () {
    css();
    if (!window.BP_LIVE) { area().innerHTML = '<div class="bpx-panel"><div class="bpx-mut">Sign in to use your AI Team.</div></div>'; if (window.bpSpin) bpSpin(false); return; }
    if (!ceoOn() && A.tab === 'ceo') A.tab = 'board';
    if (ceoOn() && A.tab === 'ceo') { draw(); }   /* the CEO shows at once; the add-on status fills the tabs in */
    /* never leave the page you came from on screen while the team's status loads: the map
       from last time at once (then brought up to date), or a short note the first time */
    else if (A.tab === 'board' && A.st && A.st.ok && A.st.addon === 'active') draw();
    else area().innerHTML = '<div class="bpx-panel"><div class="bpx-mut">Loading your AI team…</div></div>';
    var st = await api({ op: 'status' });
    if (window._bpCurView !== 'aiteam') return;   /* moved on to another page meanwhile */
    A.st = st;
    if (window.bpSpin) bpSpin(false);
    if (!A.st.ok && !ceoOn()) { area().innerHTML = '<div class="bpx-panel"><div class="bpx-mut">' + esc(A.st.error || 'Could not load.') + '</div></div>'; return; }
    if (A.st.addon !== 'active' && !ceoOn()) return pitch();
    if (A.tab === 'ceo') topBar(); else draw();
  };


  /* the team as a live board, like the owner's Command Center: the AI CEO in the
     middle managing ten assistants, each wired to it with a link a packet travels
     along, showing what it's connected to and the tasks it has on the board */
  var RING = ['sales', 'marketing', 'research', 'clients', 'estimator', 'projects', 'dispatch', 'permits', 'workflows', 'office'];
  function chipsOf(k) { var c = conns(k), sh = c.slice(0, 4); return '<span class="aib-ch">' + sh.map(function (x) { return '<i>' + esc(x) + '</i>'; }).join('') + (c.length > 4 ? '<i>+' + (c.length - 4) + '</i>' : '') + '</span>'; }
  function taskPill(k) { var t = A.st && A.st.tasks && A.st.tasks[k]; if (!t) return ''; var n = t.open + t.doing; return (n ? '<span class="aib-tk' + (t.doing ? ' on' : '') + '">' + n + ' task' + (n > 1 ? 's' : '') + '</span>' : '') + (t.blocked ? '<span class="aib-tk bl">' + t.blocked + ' blocked</span>' : ''); }
  function nodeHtml(k, cls, style) {
    return '<button type="button" class="aib-n' + cls + '" data-open="' + k + '"' + style + '><span class="aib-box"><span class="aib-i"><span class="ms">' + AG[k].ic + '</span></span><span class="aib-tx"><b>' + esc(AG[k].n) + '</b><em>' + esc(AG[k].d) + '</em>' + chipsOf(k) + (taskPill(k) ? '<span class="aib-tks">' + taskPill(k) + '</span>' : '') + '</span></span></button>';
  }
  function boardHtml(live) {
    var W = 1000, H = 860, cx = 500, cy = 430, rx = 380, ry = 345, svg = '', nodes = '', rails = '';
    RING.forEach(function (k, i) {
      var ang = (-90 + i * 360 / RING.length) * Math.PI / 180, x = cx + rx * Math.cos(ang), y = cy + ry * Math.sin(ang), id = 'aibl' + k;
      svg += '<path id="' + id + '" class="aib-ln" d="M' + cx + ',' + cy + ' L' + x + ',' + y + '"/>';
      /* the dot that runs out along the line: an HTML rail turned toward the assistant, and a dot slid along it
         with transform only, so the graphics card moves it and nothing gets repainted (the box keeps the
         1000:860 shape, so lengths and angles in that space hold at any size) */
      var len = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)), deg = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
      rails += '<i class="aib-rail" style="width:' + (len / W * 100).toFixed(2) + '%;transform:rotate(' + deg.toFixed(2) + 'deg)"><b style="animation-duration:' + (4.8 + (i % 4) * 0.7) + 's;animation-delay:' + (i * 0.55) + 's"></b></i>';
      nodes += nodeHtml(k, '', ' style="--dl:' + (0.12 + i * 0.05) + 's;left:' + (x / W * 100) + '%;top:' + (y / H * 100) + '%"');
    });
    nodes += nodeHtml('ceo', ' aib-ceo', ' style="--dl:0s;left:50%;top:50%"');
    var list = '<div class="aib-list">' + ['ceo'].concat(RING).map(function (k) { return nodeHtml(k, k === 'ceo' ? ' aib-ceo' : '', ''); }).join('') + '</div>';
    var nt = A.st && A.st.tasks ? Object.keys(A.st.tasks).reduce(function (s, k) { return s + A.st.tasks[k].open + A.st.tasks[k].doing; }, 0) : 0;
    return '<div class="aib"><div class="aib-wrap"><div class="aib-in"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + svg + '</svg>' + rails + nodes + '</div></div>' + list
      + '<div class="aib-foot"><span class="aib-on">' + (live ? 'online' : 'preview') + '</span>' + (live ? '<span>' + A.st.used + ' of ' + A.st.cap + ' messages this month</span><span>' + nt + ' on the task board</span><span>' + (A.st.pending || 0) + ' waiting for you</span><span>daily brief 7am</span>' : '<span>AI CEO + ' + RING.length + ' assistants</span><span>you approve before anything sends</span>') + '</div></div>';
  }
  function boardCss() {
    if (document.getElementById('aib-css')) return; var c = document.createElement('style'); c.id = 'aib-css';
    c.textContent = '.aib{position:relative;background:var(--card,#fff);border:1px solid var(--line,#dce3ec);border-radius:16px;overflow:hidden}'
      + '.aib:before{content:"";position:absolute;inset:0;background-image:radial-gradient(var(--line,#dce3ec) 1px,transparent 1px);background-size:20px 20px;pointer-events:none;-webkit-mask-image:radial-gradient(80% 70% at 50% 45%,#000,transparent);mask-image:radial-gradient(80% 70% at 50% 45%,#000,transparent)}'
      + '.aib-wrap{position:relative;width:100%}.aib-in{position:relative;width:100%;aspect-ratio:1000/860}'
      + '.aib-in>svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}'
      + '.aib-ln{fill:none;stroke:var(--line,#c9d3df);stroke-width:1.3}.aib-t{stroke-dasharray:3 4;stroke:#cfd8e3}.aib-pk{fill:#2457d6;opacity:.7}'
      + '.aib-rail{position:absolute;left:50%;top:50%;height:0;transform-origin:0 0;pointer-events:none}'
      + '.aib-rail b{position:absolute;left:0;top:0;width:100%;height:0;will-change:transform,opacity;animation:aibRun 5s cubic-bezier(.45,0,.25,1) infinite backwards}'
      + '.aib-rail b::after{content:"";position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:#006fff;box-shadow:0 0 0 4px rgba(0,111,255,.18)}'
      + '@keyframes aibRun{0%{transform:translateX(0);opacity:0}12%{opacity:1}85%{opacity:1}100%{transform:translateX(100%);opacity:0}}'
      + '@media (prefers-reduced-motion:reduce){.aib-rail{display:none}}'
      + '.aib-n{position:absolute;transform:translate(-50%,-50%);background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;opacity:0;animation:aibPop .6s cubic-bezier(.2,0,0,1) forwards;animation-delay:var(--dl,0s)}'
      + '@keyframes aibPop{from{opacity:0;transform:translate(-50%,-44%)}to{opacity:1;transform:translate(-50%,-50%)}}'
      + '.aib-box{display:flex;align-items:center;gap:10px;width:200px;background:var(--card,#fff);border:1px solid var(--line,#dce3ec);border-radius:12px;padding:10px 12px;text-align:left;box-shadow:0 4px 14px -10px rgba(0,21,48,.3);transition:border-color .2s,transform .2s,box-shadow .2s}'
      + '.aib-n:hover .aib-box{border-color:#2457d6;transform:translateY(-2px);box-shadow:0 10px 24px -12px rgba(0,21,48,.3)}'
      + '.aib-ceo .aib-box{width:224px;padding:13px 14px;border-color:#c7d7fe;background:linear-gradient(180deg,#f5f8ff,var(--card,#fff))}'
      + '.aib-i{width:34px;height:34px;border-radius:9px;background:#e8efff;color:#2457d6;display:grid;place-items:center;flex:none}.aib-i .ms{font-size:19px}'
      + '.aib-ceo .aib-i{width:38px;height:38px;background:linear-gradient(135deg,#2563eb,#3a76ed);color:#fff}'
      + '.aib-tx{min-width:0}.aib-n b{display:block;font-size:13.5px;color:var(--ink,#101828);white-space:nowrap}'
      + '.aib-n em{display:block;font-style:normal;font-size:11.5px;line-height:1.3;color:var(--mu,#667085);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.aib-ceo em{max-width:160px}'
      + '.aib-ch{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;max-width:150px}.aib-ch i{font-style:normal;font-size:10px;line-height:1.5;border:1px solid var(--line,#dce3ec);border-radius:99px;padding:0 6px;color:var(--mu,#667085);white-space:nowrap}'
      + '.aib-tks{display:flex;gap:4px;margin-top:4px}.aib-tk{font-size:10px;font-weight:700;line-height:1.6;background:#eef4ff;color:#2457d6;border-radius:99px;padding:0 7px}.aib-tk.on{background:#2457d6;color:#fff}.aib-tk.bl{background:#EBF4FF;color:#0853B5}'
      + '.aib-list .aib-ch{max-width:none}'
      + '.aib-tl{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:var(--ink,#344054);width:72px;text-align:center;opacity:0;animation:aibFade .6s ease forwards;animation-delay:var(--dl,0s)}'
      + '@keyframes aibFade{to{opacity:1}}'
      + '.aib-tl i{width:34px;height:34px;border-radius:50%;background:var(--card,#fff);border:1px solid var(--line,#dce3ec);display:grid;place-items:center;color:var(--mu,#667085);font-style:normal}.aib-tl i .ms{font-size:16px}'
      + '.aib-tl small{color:var(--mu,#98a2b3);font-size:10px;margin-top:-2px}'
      + '.aib-list{display:none;position:relative;padding:12px;gap:8px;flex-direction:column}.aib-list .aib-n{position:static;transform:none;opacity:1;animation:none;width:100%}.aib-list .aib-box{width:100%}.aib-list .aib-n em{max-width:none;white-space:normal}'
      + '.aib-foot{position:relative;display:flex;flex-wrap:wrap;gap:18px;padding:12px 16px;font-size:13px;color:var(--mu,#788493);border-top:1px solid var(--line,#eef1f6)}.aib-on{color:#087F61;font-weight:600}'
      /* the portal presses every button with transform:scale; these are placed by their transform, so keep it while pressed */
      + '#bpx#bpx#bpx .aib-wrap .aib-n:active{transform:translate(-50%,-50%) scale(.98) !important}#bpx#bpx#bpx .aib-list .aib-n:active{transform:scale(.99) !important}'
      + '@media(max-width:820px){.aib-wrap{display:none}.aib-list{display:flex}}';
    document.head.appendChild(c);
  }

  /* ================================================================
     Your team (2026-11-18, second take): the map is the page. The whole team on a white
     card in the app's own look: the AI CEO in the middle, the ten assistants around it,
     their status on the ring and their open tasks on a badge. Tap one and the map closes
     in on it: the AI CEO and you on one side, its tools, the pages it reads and the web on
     the other, a dot running along each link. Beside the map: that assistant's board,
     questions to ask it, Chat and Task. Under it: everyone as a list. Counts, groups and a
     search sit in one row above and dim whoever doesn't match.
     ================================================================ */
  var TLI = { ghl: ['CRM', 'contacts', 'tool'], projects: ['Projects', 'construction', 'tool'], assign_task: ['Task board', 'checklist', 'tool'], ceo_snapshot: ['Business snapshot', 'monitoring', 'tool'],
    crew_match: ['Crew match', 'groups', 'tool'], price_list: ['Price list', 'sell', 'tool'] };
  var PGI = { leads: 'person_add', lead_sources: 'call_split', calculator_leads: 'calculate', estimates: 'request_quote', contracts: 'draw', payments: 'payments', money: 'account_balance_wallet',
    customer_messages: 'forum', change_orders: 'swap_horiz', reviews: 'star', calendar_notes: 'calendar_month', team: 'badge', hours: 'schedule', subcontractors: 'engineering', materials: 'inventory_2',
    inspections: 'fact_check', website: 'language', social: 'share', competitors: 'storefront', storms: 'thunderstorm' };
  var GRP = [['all', 'Everyone', 'diversity_3', null], ['lead', 'Manager', 'monitoring', ['ceo']], ['grow', 'Sales & growth', 'trending_up', ['sales', 'marketing', 'research', 'clients']],
    ['jobs', 'Jobs & crews', 'construction', ['estimator', 'projects', 'dispatch', 'permits']], ['office', 'Office', 'event_note', ['office', 'workflows']]];
  var ORDER = ['ceo'].concat(RING);
  function groupOf(k) { for (var i = 1; i < GRP.length; i++) if (GRP[i][3].indexOf(k) >= 0) return GRP[i]; return GRP[0]; }
  function connList(k) {
    var st = A.st && A.st.agents ? A.st.agents.filter(function (a) { return a.key === k; })[0] : null;
    var tools = (st && st.tools) || ['ghl', 'projects'], pages = (st && st.pages) || SEE[k] || [], out = [];
    tools.forEach(function (t) { if (TLI[t]) out.push({ n: TLI[t][0], ic: TLI[t][1], kind: 'tool' }); });
    if (st ? st.web : ['sales', 'marketing', 'research', 'permits', 'ceo', 'dispatch'].indexOf(k) >= 0) out.push({ n: 'The web', ic: 'public', kind: 'web' });
    pages.forEach(function (p) { out.push({ n: PG[p] || p, ic: PGI[p] || 'description', kind: 'page' }); });
    return out;
  }
  function stateOf(k) {
    var t = (A.st && A.st.tasks && A.st.tasks[k]) || { open: 0, doing: 0, blocked: 0 };
    if (t.doing) return ['work', 'Working', t];
    if (t.blocked) return ['need', 'Needs you', t];
    if (t.open) return ['queue', 'Queued', t];
    return ['ready', 'Ready', t];
  }
  function ago(t) { var m = Math.round((Date.now() - Date.parse(t)) / 6e4); return !isFinite(m) ? '' : m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; }
  function aicCss() {
    if ($('aic-css')) return; var c = document.createElement('style'); c.id = 'aic-css';
    c.textContent = [
      '.aim{--ink:var(--txt,#001530);--mu:#788493;--mu2:#9aa6b6;--ln:#dce3ec;--ln2:#e8edf3;--card:#fff;--soft:#f5f8fc;--bl:#006fff;--mi:#16C79A;--mit:#087F61;--nv:#001530}',
      '#bpx.bpx-dark .aim{--ink:#e8eef7;--mu:#8ea3c0;--mu2:#62789a;--ln:#243049;--ln2:#1c263a;--card:#111827;--soft:#0d1422;--mit:#3FE0B6;--nv:#c9d6ea}',
      '.aim .ms{font-size:18px}.aim{scroll-margin-top:84px}',
      /* top: counts and filters, in one quiet row */
      '.aim-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-bottom:12px}',
      '.aim-k{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ln);background:var(--card);border-radius:12px;padding:7px 11px;font-size:12.5px;color:var(--mu);cursor:pointer}',
      '.aim-k b{font-size:15px;color:var(--ink);font-variant-numeric:tabular-nums}.aim-k .ms{font-size:16px;color:var(--bl)}',
      '.aim-k.on{border-color:var(--bl);box-shadow:0 0 0 3px rgba(0,111,255,.12)}',
      '.aim-sp{flex:1}',
      '.aim-q{display:flex;align-items:center;gap:6px;border:1px solid var(--ln);background:var(--card);border-radius:12px;padding:0 10px;min-width:220px}.aim-q .ms{font-size:17px;color:var(--mu)}',
      '#bpx#bpx#bpx#bpx#bpx#bpx .aim .aim-q input{flex:1;min-width:0;border:0!important;background:transparent!important;box-shadow:none!important;padding:8px 0!important;margin:0!important;font-size:13px!important;color:var(--ink)!important;outline:0!important;height:auto}',
      '.aim-q:focus-within{border-color:var(--bl);box-shadow:0 0 0 3px rgba(0,111,255,.12)}',
      '.aim-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-bottom:12px}.aim-chips::-webkit-scrollbar{display:none}',
      '.aim-chips button{flex:none;border:1px solid var(--ln);background:var(--card);border-radius:99px;padding:6px 12px;font:inherit;font-size:12.5px;color:var(--ink);cursor:pointer}',
      '.aim-chips button.on{background:var(--bl);border-color:var(--bl);color:#fff}',
      /* the map, the main part, and the picked assistant beside it */
      '.aim-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:14px;align-items:start}',
      '#bpx#bpx#bpx#bpx .aim-grid>.bpx-panel,#bpx#bpx#bpx#bpx .aim>.bpx-panel{margin:0!important}#bpx#bpx#bpx#bpx .aim>.aim-list{margin-top:14px!important}',
      '.aim-map{scroll-margin-top:84px;position:relative;padding:0!important;overflow:hidden;height:clamp(460px,calc(100vh - 200px),720px)}',
      '.aim-bar .aim-q{min-width:200px;padding:0 9px;border-radius:10px;box-shadow:0 2px 8px -6px rgba(0,21,48,.3)}',
      '.aim-pri{background:var(--bl);border-color:var(--bl);color:#fff}.aim-pri:hover{background:#0050c8;border-color:#0050c8}',
      '.aim-map:before{content:"";position:absolute;inset:0;background-image:radial-gradient(var(--ln) 1px,transparent 1px);background-size:22px 22px;-webkit-mask-image:radial-gradient(70% 70% at 50% 50%,#000,transparent);mask-image:radial-gradient(70% 70% at 50% 50%,#000,transparent);pointer-events:none;opacity:.8}',
      '.aim-map svg{position:absolute;inset:0;width:100%;height:100%}',
      '.aim-bar{position:absolute;left:14px;right:14px;top:12px;display:flex;align-items:center;gap:8px;z-index:2;pointer-events:none}',
      '.aim-bar>*{pointer-events:auto}',
      '.aim-crumb{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--mu)}.aim-crumb b{color:var(--ink)}',
      '.aim-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ln);background:var(--card);border-radius:10px;padding:6px 10px;font:inherit;font-size:12.5px;color:var(--ink);cursor:pointer;box-shadow:0 2px 8px -6px rgba(0,21,48,.3)}.aim-btn:hover{border-color:var(--bl)}.aim-btn .ms{font-size:16px}',
      '.aim-leg{position:absolute;left:14px;bottom:12px;display:flex;flex-wrap:wrap;gap:12px;font-size:11.5px;color:var(--mu);z-index:2}.aim-leg i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}',
      /* nodes */
      '.aim-n{cursor:pointer}.aim-n circle.b{fill:var(--card);stroke-width:2;transition:stroke-width .15s}',
      '.aim-n:hover circle.b,.aim-n:focus circle.b{stroke-width:3.2}.aim-n:focus{outline:none}',
      '.aim-n text{font-family:inherit;fill:var(--ink);font-size:12.5px;font-weight:600}.aim-n text.s{fill:var(--mu);font-size:10.5px;font-weight:500}',
      '.aim-n.dim{opacity:.22}.aim-n,.aim-l{transition:opacity .2s}.aim-l.dim{opacity:.12}',
      '.aim-l{fill:none;stroke-width:1.6}',
      '.aim-in{animation:aimIn .45s cubic-bezier(.2,0,0,1) both}@keyframes aimIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}',
      '.aim-in{transform-origin:50% 50%;transform-box:fill-box}',
      /* the picked assistant */
      '.aim-det{padding:0!important;overflow:hidden}',
      '.aim-dh{display:flex;align-items:center;gap:10px;padding:16px 16px 6px}',
      '.aim-av{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:#eaf2ff;color:var(--bl);flex:none}#bpx.bpx-dark .aim-av{background:rgba(0,111,255,.18);color:#8fb8ff}',
      '.aim-av.ceo{background:linear-gradient(135deg,#006fff,#16C79A);color:#fff}',
      '.aim-dh h3{margin:0;font-size:16px;color:var(--ink)}.aim-dh small{display:block;color:var(--mu);font-size:12px}',
      '.aim-nav{margin-left:auto;display:flex;gap:2px}.aim-nav button{width:28px;height:28px;border:0;border-radius:8px;background:none;display:grid;place-items:center;color:var(--mu);cursor:pointer}.aim-nav button:hover{background:var(--soft);color:var(--ink)}',
      '.aim-d{padding:0 16px 10px;color:var(--mu);font-size:13px;line-height:1.45}',
      '.aim-tabs{display:flex;gap:2px;padding:0 10px;border-bottom:1px solid var(--ln)}',
      '.aim-tabs button{border:0;background:none;padding:9px 8px;font:inherit;font-size:12.5px;color:var(--mu);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}.aim-tabs button.on{color:var(--ink);border-bottom-color:var(--bl);font-weight:600}',
      '.aim-pane{padding:12px 16px;display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 430px);min-height:120px;overflow:auto}',
      '.aim-sec{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mu2);margin-top:4px}',
      '.aim-it{display:flex;align-items:center;gap:10px;border:1px solid var(--ln);background:var(--card);border-radius:12px;padding:9px 11px;text-align:left;width:100%;font:inherit;color:inherit;cursor:pointer}',
      '.aim-it:hover{border-color:#b9d6ff}.aim-it>div{flex:1;min-width:0}.aim-it b{display:block;font-size:13px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aim-it small{display:block;font-size:11.5px;color:var(--mu)}',
      '.aim-hint{border:1px solid var(--ln);background:var(--soft);border-radius:10px;padding:8px 11px;text-align:left;font:inherit;font-size:12.5px;color:var(--ink);cursor:pointer}.aim-hint:hover{border-color:#b9d6ff}',
      '.aim-cn{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.aim-cn div{display:flex;align-items:center;gap:7px;border:1px solid var(--ln);border-radius:10px;padding:7px 9px;font-size:12.5px;color:var(--ink);min-width:0}',
      '.aim-cn div span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aim-cn .ms{font-size:16px}',
      '.aim-cta{display:flex;gap:8px;padding:12px 16px 16px;border-top:1px solid var(--ln)}.aim-cta .bpx-btn{flex:1;margin:0;display:inline-flex;align-items:center;justify-content:center;gap:6px}',
      '.aim-st{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;border-radius:99px;padding:2px 9px;white-space:nowrap}.aim-st i{width:6px;height:6px;border-radius:50%;background:currentColor}',
      '.aim-st.ready{color:var(--mit);background:#E8F9F4}.aim-st.work{color:#0853B5;background:#EBF4FF}.aim-st.queue{color:#475467;background:#f2f4f7}.aim-st.need{color:#fff;background:#0970F7}',
      '#bpx.bpx-dark .aim-st.ready{background:rgba(22,199,154,.14)}#bpx.bpx-dark .aim-st.work{background:rgba(0,111,255,.2);color:#9cc4ff}#bpx.bpx-dark .aim-st.queue{background:rgba(255,255,255,.08);color:#c4d2e6}',
      '.aim-pr{font-size:10.5px;font-weight:700;border-radius:6px;padding:1px 6px;margin-left:6px;background:#0970F7;color:#fff;vertical-align:1px}',
      /* everyone, as a list under the map */
      '.aim-list{margin-top:14px;padding:6px!important}',
      '.aim-r{display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(110px,.8fr) minmax(120px,1fr) 50px 96px;gap:10px;align-items:center;padding:9px 10px;border-radius:12px;cursor:pointer}',
      '.aim-r:hover{background:var(--soft)}.aim-r.on{background:#eef5ff}#bpx.bpx-dark .aim-r.on{background:rgba(0,111,255,.12)}',
      '.aim-r+.aim-r{box-shadow:inset 0 1px 0 var(--ln2)}',
      '.aim-rh{cursor:default;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mu2)}.aim-rh:hover{background:none}',
      '.aim-nm{display:flex;align-items:center;gap:10px;min-width:0}.aim-nm b{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aim-nm .aim-av{width:30px;height:30px;border-radius:9px}.aim-nm .aim-av .ms{font-size:17px}',
      '.aim-g{color:var(--mu);font-size:12.5px}',
      '.aim-ic{display:flex;gap:4px;align-items:center}.aim-ic i{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;background:var(--soft);font-style:normal}.aim-ic i .ms{font-size:13px}.aim-ic small{color:var(--mu);font-size:11.5px}',
      '.aim-tn{text-align:center;color:var(--ink);font-variant-numeric:tabular-nums}.aim-tn.z{color:var(--mu2)}',
      '.aim-empty{padding:18px;text-align:center;color:var(--mu)}',
      '@media(max-width:1200px){.aim-grid{grid-template-columns:minmax(0,1fr)}.aim-det{position:static}.aim-pane{max-height:none}.aim-r{grid-template-columns:minmax(140px,1.3fr) minmax(120px,1fr) 44px 96px}.aim-g{display:none}}',
      '@media(max-width:700px){.aim-map{height:660px}.aim-crumb span.t,.aim-btn .t2{display:none}.aim-bar .aim-q{min-width:0;flex:1}.aim-bar .aim-crumb{display:none}.aim-q{min-width:0;flex:1 1 100%}.aim-sp{display:none}.aim-r{grid-template-columns:minmax(0,1fr) auto}.aim-rh{display:none}.aim-r .aim-ic{grid-column:1;padding-left:40px}.aim-tn{display:none}.aim-r .aim-st{grid-row:1;grid-column:2}.aim-leg{display:none}}',
      '@media (prefers-reduced-motion:reduce){.aim-in{animation:none}}'
    ].join('\n');
    document.head.appendChild(c);
  }
  var KC = { tool: '#006fff', page: '#7fb0ff', web: '#16C79A', mgr: 'var(--nv)', you: '#16C79A' };
  var SC = { ready: '#16C79A', work: '#006fff', queue: '#9aa6b6', need: '#0970F7' };
  function matches(k) {
    var g = A.grp || 'all', q = String(A.q || '').toLowerCase().trim(), f = A.flt || 'all', t = stateOf(k)[2];
    if (g !== 'all' && groupOf(k)[0] !== g) return false;
    if (f === 'work' && !t.doing) return false;
    if (f === 'tasks' && !(t.open + t.doing + t.blocked)) return false;
    if (q && (AG[k].n + ' ' + AG[k].d + ' ' + connList(k).map(function (x) { return x.n; }).join(' ')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }
  function icon(x, y, ic, size, color) {
    return '<foreignObject x="' + (x - size / 2) + '" y="' + (y - size / 2) + '" width="' + size + '" height="' + size + '" style="pointer-events:none"><span class="ms" style="display:block;font-size:' + Math.round(size * 0.82) + 'px;line-height:' + size + 'px;text-align:center;color:' + color + '">' + ic + '</span></foreignObject>';
  }
  var MOTION = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function dot(id, i, color, back) {
    return MOTION ? '<circle r="3" style="fill:' + color + '"><animateMotion dur="' + (2.8 + (i % 4) * 0.45) + 's" begin="' + (i * 0.3) + 's" repeatCount="indefinite" keyPoints="' + (back ? '1;0' : '0;1') + '" keyTimes="0;1" calcMode="linear"><mpath href="#' + id + '"/></animateMotion></circle>' : '';
  }
  function cut(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  /* the whole team, as the same flow as one assistant up close: you on the left (you approve
     what goes out), the AI CEO in the middle, the ten assistants on the right, each on a curve
     with a dot running out along it (the CEO handing out work). The ring is the assistant's
     status, the badge its open tasks; tap one to close in on it. */
  function teamMap(W, H) {
    var small = W < 600, links = '', nodes = '', dots = '', i = 0;
    var cx = small ? W / 2 : W * 0.36, cy = small ? 176 : H / 2 + 8;
    var you = { x: small ? W / 2 : W * 0.08, y: small ? 74 : cy };
    var pts = [];
    if (small) {
      var cols = 3, top = 300, step = Math.min(86, (H - top - 34) / Math.ceil(RING.length / cols));
      RING.forEach(function (k, j) { pts.push({ x: W * (0.18 + 0.32 * (j % cols)), y: top + Math.floor(j / cols) * step, k: k }); });
    } else {
      var half = Math.ceil(RING.length / 2), stp = Math.min(92, (H - 120) / Math.max(1, half - 1 + 0.5)), y0 = cy - ((half - 1) * stp + stp / 2) / 2;
      RING.forEach(function (k, j) { var b = j >= half, jj = b ? j - half : j; pts.push({ x: W * (b ? 0.87 : 0.66), y: y0 + jj * stp + (b ? stp / 2 : 0), k: k }); });
    }
    /* you */
    var yd = small ? 'M' + cx + ' ' + cy + ' C' + cx + ' ' + (cy + you.y) / 2 + ' ' + you.x + ' ' + (cy + you.y) / 2 + ' ' + you.x + ' ' + you.y
      : 'M' + cx + ' ' + cy + ' C' + (cx + you.x) / 2 + ' ' + cy + ' ' + (cx + you.x) / 2 + ' ' + you.y + ' ' + you.x + ' ' + you.y;
    links += '<path id="aimty" class="aim-l" stroke="#16C79A" stroke-opacity=".55" d="' + yd + '"/>';
    dots += dot('aimty', 0, '#16C79A', true);
    var pend = (A.st && A.st.pending) || 0, ry = small ? 17 : 21;
    nodes += '<g class="aim-n" data-go="wait" tabindex="0" role="button" aria-label="Waiting for you"><circle class="b" cx="' + you.x + '" cy="' + you.y + '" r="' + ry + '" stroke="#16C79A"/>' + icon(you.x, you.y, 'person', small ? 15 : 18, '#16C79A')
      + (pend ? '<circle cx="' + (you.x + ry * .72) + '" cy="' + (you.y - ry * .72) + '" r="9" fill="#0970F7"/><text x="' + (you.x + ry * .72) + '" y="' + (you.y - ry * .72 + 3.5) + '" text-anchor="middle" style="fill:#fff;font-size:10px">' + pend + '</text>' : '')
      + '<text x="' + you.x + '" y="' + (you.y + ry + 15) + '" text-anchor="middle" style="font-size:12px">You</text>'
      + (small ? '' : '<text class="s" x="' + you.x + '" y="' + (you.y + ry + 28) + '" text-anchor="middle">' + (pend ? pend + ' waiting for your OK' : 'approve what goes out') + '</text>') + '</g>';
    /* the assistants */
    pts.forEach(function (p) {
      var k = p.k, s = stateOf(k), on = matches(k), id = 'aimt' + (i++), t = s[2], n = t.open + t.doing + t.blocked, col = s[0] === 'work' ? '#006fff' : '#7fb0ff';
      var mx = (cx + p.x) / 2, my = (cy + p.y) / 2;
      var d = small ? 'M' + cx + ' ' + cy + ' C' + cx + ' ' + my + ' ' + p.x + ' ' + my + ' ' + p.x + ' ' + p.y : 'M' + cx + ' ' + cy + ' C' + mx + ' ' + cy + ' ' + mx + ' ' + p.y + ' ' + p.x + ' ' + p.y;
      links += '<path id="' + id + '" class="aim-l' + (on ? '' : ' dim') + '" stroke="' + col + '" stroke-opacity="' + (s[0] === 'work' ? '.85' : '.5') + '" d="' + d + '"/>';
      if (on) dots += dot(id, i, col);
      var r = small ? 18 : 22;
      nodes += '<g class="aim-n' + (on ? '' : ' dim') + '" data-k="' + k + '" tabindex="0" role="button" aria-label="' + esc(AG[k].n) + '"><circle class="b" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '" stroke="' + SC[s[0]] + '"/>'
        + icon(p.x, p.y, AG[k].ic, small ? 15 : 18, '#006fff')
        + (n ? '<circle cx="' + (p.x + r * .72).toFixed(1) + '" cy="' + (p.y - r * .72).toFixed(1) + '" r="9" fill="#006fff"/><text x="' + (p.x + r * .72).toFixed(1) + '" y="' + (p.y - r * .72 + 3.5).toFixed(1) + '" text-anchor="middle" style="fill:#fff;font-size:10px">' + n + '</text>' : '')
        + '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + r + 15).toFixed(1) + '" text-anchor="middle" style="font-size:' + (small ? 11 : 12) + 'px">' + esc(AG[k].n) + '</text>'
        + (small ? '' : '<text class="s" x="' + p.x.toFixed(1) + '" y="' + (p.y + r + 28).toFixed(1) + '" text-anchor="middle">' + s[1] + '</text>') + '</g>';
    });
    /* the AI CEO */
    var R = small ? 32 : 42, con = matches('ceo');
    var ceo = '<g class="aim-n' + (con ? '' : ' dim') + '" data-k="ceo" tabindex="0" role="button" aria-label="AI CEO"><circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 12) + '" fill="rgba(0,111,255,.08)"/><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#aimG)"/>'
      + icon(cx, cy, AG.ceo.ic, small ? 24 : 28, '#fff') + '<text x="' + cx + '" y="' + (cy + R + 18) + '" text-anchor="middle" style="font-size:14px;font-weight:700">AI CEO</text>'
      + (small ? '' : '<text class="s" x="' + cx + '" y="' + (cy + R + 32) + '" text-anchor="middle">manages ' + RING.length + ' assistants</text>') + '</g>';
    return '<g class="aim-in">' + links + dots + nodes + '</g>' + ceo;
  }
  /* one assistant up close: the AI CEO and you on one side, everything it works from on the other */
  function focusMap(k, W, H) {
    var small = W < 600, c = connList(k), links = '', nodes = '', dots = '', i = 0;
    var cx = small ? W / 2 : W * 0.4, cy = small ? 170 : H / 2;
    var left = k === 'ceo' ? [{ n: 'You', ic: 'person', kind: 'you', s: 'approve what goes out' }] : [{ n: 'AI CEO', ic: 'monitoring', kind: 'mgr', s: 'hands out tasks', k: 'ceo' }, { n: 'You', ic: 'person', kind: 'you', s: 'approve what goes out' }];
    var pts = [];
    if (small) {
      left.forEach(function (d, j) { pts.push({ x: left.length === 1 ? W / 2 : (j ? W * 0.82 : W * 0.18), y: 78, d: d }); });
      var cols = 3, top = 292, step = Math.min(84, (H - top - 30) / Math.ceil(c.length / cols));
      c.forEach(function (d, j) { pts.push({ x: W * (0.18 + 0.32 * (j % cols)), y: top + Math.floor(j / cols) * step, d: d }); });
    } else {
      left.forEach(function (d, j) { pts.push({ x: W * 0.1, y: left.length === 1 ? cy : H * (0.3 + 0.4 * j), d: d }); });
      var half = Math.ceil(c.length / 2), stp = Math.min(78, (H - 110) / Math.max(1, half - 1 + 0.5));
      var y0 = cy - ((half - 1) * stp + stp / 2) / 2;
      c.forEach(function (d, j) { var b = j >= half, jj = b ? j - half : j; pts.push({ x: W * (b ? 0.88 : 0.7), y: y0 + jj * stp + (b ? stp / 2 : 0), d: d }); });
    }
    pts.forEach(function (p) {
      var col = KC[p.d.kind] || '#7fb0ff', id = 'aimf' + (i++), mx = (cx + p.x) / 2, my = (cy + p.y) / 2;
      var d = small ? 'M' + cx + ' ' + cy + ' C' + cx + ' ' + my + ' ' + p.x + ' ' + my + ' ' + p.x + ' ' + p.y : 'M' + cx + ' ' + cy + ' C' + mx + ' ' + cy + ' ' + mx + ' ' + p.y + ' ' + p.x + ' ' + p.y;
      links += '<path id="' + id + '" class="aim-l" style="stroke:' + col + '" stroke-opacity=".5" d="' + d + '"/>';
      dots += dot(id, i, col, p.x < cx || (small && p.y < cy));
      var r = small ? 17 : 20;
      nodes += '<g class="aim-n"' + (p.d.k ? ' data-k="' + p.d.k + '" tabindex="0" role="button"' : ' style="cursor:default"') + '><circle class="b" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '" style="stroke:' + col + '"/>' + icon(p.x, p.y, p.d.ic, small ? 15 : 17, col)
        + '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + r + 14).toFixed(1) + '" text-anchor="middle" style="font-size:' + (small ? 10.5 : 11.5) + 'px;font-weight:500">' + esc(cut(p.d.n, small ? 13 : 18)) + '</text>'
        + (p.d.s && !small ? '<text class="s" x="' + p.x.toFixed(1) + '" y="' + (p.y + r + 27).toFixed(1) + '" text-anchor="middle">' + p.d.s + '</text>' : '') + '</g>';
    });
    var R = small ? 32 : 40;
    var me = '<g class="aim-in"><circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 12) + '" fill="rgba(0,111,255,.08)"/><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#aimG)"/>' + icon(cx, cy, AG[k].ic, small ? 24 : 28, '#fff')
      + '<text x="' + cx + '" y="' + (cy + R + 18) + '" text-anchor="middle" style="font-family:inherit;font-size:14px;font-weight:700;fill:var(--ink)">' + esc(AG[k].n) + '</text></g>';
    return '<g class="aim-in">' + links + dots + nodes + '</g>' + me;
  }
  function mapHtml() {
    var f = !!A.focus, k = A.sel;
    return '<div class="aim-bar">' + (f ? '<button type="button" class="aim-btn" data-team="1"><span class="ms">arrow_back</span>Whole team</button><span class="aim-crumb">Team <span class="ms" style="font-size:15px">chevron_right</span><b>' + esc(AG[k].n) + '</b></span>'
      + '<span style="flex:1"></span><button type="button" class="aim-btn aim-pri" data-chat="1"><span class="ms">chat</span><span class="t2">Chat with ' + esc(AG[k].n) + '</span></button><button type="button" class="aim-btn" data-give="1"><span class="ms">add_task</span><span class="t2">Task</span></button>'
      + '<button type="button" class="aim-btn" data-step="-1" aria-label="Previous"><span class="ms">chevron_left</span></button><button type="button" class="aim-btn" data-step="1" aria-label="Next"><span class="ms">chevron_right</span></button>'
      : '<span class="aim-crumb"><b>Your team</b><span class="t">&nbsp;· tap anyone to see what they work from</span></span><span style="flex:1"></span>'
        + '<label class="aim-q"><span class="ms">search</span><input id="aimQ" placeholder="Search your team" value="' + esc(A.q || '') + '" autocomplete="off"></label>') + '</div>'
      + '<svg id="aimSvg" aria-label="' + (f ? 'What ' + esc(AG[k].n) + ' is connected to' : 'Your AI team') + '"></svg>'
      + '<div class="aim-leg">' + (f ? '<span><i style="background:#006fff"></i>Tools</span><span><i style="background:#7fb0ff"></i>Pages it reads</span><span><i style="background:#16C79A"></i>The web</span>'
        : '<span><i style="background:#16C79A"></i>Ready</span><span><i style="background:#006fff"></i>Working</span><span><i style="background:#9aa6b6"></i>Queued</span><span><i style="background:#0970F7"></i>Needs you</span>') + '</div>';
  }
  function drawSvg() {
    var host = $('aimMap'), svg = $('aimSvg'); if (!host || !svg) return;
    var W = Math.max(300, host.clientWidth), H = Math.max(360, host.clientHeight);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '<defs><linearGradient id="aimG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#006fff"/><stop offset="1" stop-color="#16C79A"/></linearGradient></defs>'
      + (A.focus ? focusMap(A.sel, W, H) : teamMap(W, H));
    svg.querySelectorAll('.aim-n[data-go]').forEach(function (g) { g.onclick = function () { A.tab = g.getAttribute('data-go'); draw(); }; g.onkeydown = function (e) { if (e.key === 'Enter') g.onclick(); }; });
    svg.querySelectorAll('.aim-n[data-k]').forEach(function (g) {
      var go = function () { pick(g.getAttribute('data-k'), true); };
      g.onclick = go; g.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
    host._w = W;
  }
  function aimItem(t) {
    var s = { doing: 'work', blocked: 'need', open: 'queue', done: 'ready', cancelled: 'queue' }[t.status] || 'queue';
    return '<button type="button" class="aim-it" data-task="' + t.id + '"><span class="aim-st ' + s + '"><i></i>' + (TS[t.status] || TS.open)[0] + '</span><div><b>' + esc(t.title) + (t.priority === 'high' ? '<span class="aim-pr">High</span>' : '') + '</b><small>'
      + esc(t.assigned_by === 'owner' ? 'From you' : 'From ' + ((AG[t.assigned_by] || {}).n || t.assigned_by)) + ' · ' + ago(t.updated_at || t.created_at) + '</small></div><span class="ms" style="color:var(--mu)">chevron_right</span></button>';
  }
  function detHtml() {
    var k = A.sel, s = stateOf(k), c = connList(k), mine = (A.tk || []).filter(function (t) { return t.assignee === k; }), tab = A.dtab || 'ov', body = '';
    var live = mine.filter(function (t) { return t.status === 'doing' || t.status === 'open' || t.status === 'blocked'; });
    if (tab === 'ov') body = '<div class="aim-sec">On the board</div>' + (live.length ? live.slice(0, 4).map(aimItem).join('') : '<div class="aim-it" style="cursor:default"><span class="ms" style="color:#16C79A">check_circle</span><div><b>Nothing waiting</b><small>' + (A.tk ? 'Give ' + esc(AG[k].n) + ' a task, or ask the AI CEO to plan the week.' : 'Loading the board…') + '</small></div></div>')
      + '<div class="aim-sec">Ask ' + esc(AG[k].n) + '</div>' + AG[k].h.map(function (h) { return '<button type="button" class="aim-hint" data-ask="' + esc(h) + '">' + esc(h) + '</button>'; }).join('');
    else if (tab === 'cn') body = '<div style="color:var(--mu);font-size:12.5px">What ' + esc(AG[k].n) + ' reads and works with. Anything for a customer waits for your OK.</div><div class="aim-cn">' + c.map(function (x) { return '<div><span class="ms" style="color:' + KC[x.kind] + '">' + x.ic + '</span><span>' + esc(x.n) + '</span></div>'; }).join('') + '</div>';
    else body = (mine.length ? mine.slice(0, 20).map(aimItem).join('') : '<div class="aim-empty">No tasks for ' + esc(AG[k].n) + ' yet.</div>');
    return '<div class="aim-dh"><span class="aim-av' + (k === 'ceo' ? ' ceo' : '') + '"><span class="ms">' + AG[k].ic + '</span></span><div><h3>' + esc(AG[k].n) + '</h3><small>' + esc(k === 'ceo' ? 'Manager' : groupOf(k)[1]) + '</small></div>'
      + '<span class="aim-st ' + s[0] + '" style="margin-left:auto"><i></i>' + s[1] + '</span></div>'
      + '<div class="aim-d">' + esc(AG[k].d) + '</div>'
      + '<div class="aim-tabs"><button type="button" data-dt="ov" class="' + (tab === 'ov' ? 'on' : '') + '">Overview</button><button type="button" data-dt="cn" class="' + (tab === 'cn' ? 'on' : '') + '">Connections (' + c.length + ')</button><button type="button" data-dt="tk" class="' + (tab === 'tk' ? 'on' : '') + '">Tasks (' + mine.length + ')</button></div>'
      + '<div class="aim-pane">' + body + '</div>'
      + '<div class="aim-cta"><button type="button" class="bpx-btn" data-chat="1"><span class="ms">chat</span>Chat with ' + esc(AG[k].n) + '</button><button type="button" class="bpx-btn ghost" data-give="1" style="flex:0 0 auto"><span class="ms">add_task</span>Task</button></div>';
  }
  function listHtml() {
    var rows = ORDER.filter(matches);
    if (!rows.length) return '<div class="aim-empty">No one on your team matches that.</div>';
    return '<div class="aim-r aim-rh"><span>Assistant</span><span class="aim-g">Group</span><span>Connected to</span><span style="text-align:center">Tasks</span><span>Status</span></div>' + rows.map(function (k) {
      var s = stateOf(k), t = s[2], n = t.open + t.doing + t.blocked, c = connList(k);
      return '<div class="aim-r' + (A.sel === k && A.focus ? ' on' : '') + '" data-k="' + k + '" role="button" tabindex="0"><span class="aim-nm"><span class="aim-av' + (k === 'ceo' ? ' ceo' : '') + '"><span class="ms">' + AG[k].ic + '</span></span><b>' + esc(AG[k].n) + '</b></span>'
        + '<span class="aim-g">' + esc(k === 'ceo' ? 'Manager' : groupOf(k)[1]) + '</span>'
        + '<span class="aim-ic">' + c.slice(0, 5).map(function (x) { return '<i title="' + esc(x.n) + '"><span class="ms" style="color:' + KC[x.kind] + '">' + x.ic + '</span></i>'; }).join('') + (c.length > 5 ? '<small>+' + (c.length - 5) + '</small>' : '') + '</span>'
        + '<span class="aim-tn' + (n ? '' : ' z') + '">' + (n || '·') + '</span><span class="aim-st ' + s[0] + '"><i></i>' + s[1] + '</span></div>';
    }).join('');
  }
  function topHtml() {
    var st = A.st || {}, w = ORDER.filter(function (k) { return stateOf(k)[2].doing; }).length, wt = ORDER.filter(function (k) { var t = stateOf(k)[2]; return t.open + t.doing + t.blocked; }).length;
    var k = function (id, ic, lbl, v, go) { return '<button type="button" class="aim-k' + (!go && (A.flt || 'all') === id ? ' on' : '') + '" ' + (go ? 'data-go="' + go + '"' : 'data-f="' + id + '"') + '><span class="ms">' + ic + '</span>' + lbl + ' <b>' + v + '</b></button>'; };
    return '<div class="aim-top">' + k('all', 'diversity_3', 'Everyone', ORDER.length) + k('work', 'bolt', 'Working now', w) + k('tasks', 'checklist', 'With tasks', wt) + k('', 'task_alt', 'Waiting for you', st.pending || 0, 'wait')
      + '<span class="aim-sp"></span><label class="aim-q"><span class="ms">search</span><input id="aimQ" placeholder="Search your team or what they’re connected to" value="' + esc(A.q || '') + '" autocomplete="off"></label></div>'
      + '<div class="aim-chips">' + GRP.map(function (g) { return '<button type="button" class="' + ((A.grp || 'all') === g[0] ? 'on' : '') + '" data-g="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</div>';
  }
  function pick(k, focus) {
    A.sel = k; if (focus) A.focus = true;
    var m = $('aimMap'); if (m) { m.innerHTML = mapHtml(); drawSvg(); wireMap(); if (focus && m.getBoundingClientRect().top < 0) m.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    var d = $('aimDet'); if (d) { d.innerHTML = detHtml(); wireDet(); }
    var l = $('aimList'); if (l) { l.innerHTML = listHtml(); wireList(); }
  }
  function chatWith(k, text) { A.tab = 'chat'; A.agent = k; A.thread = null; draw(); if (text) setTimeout(function () { var i = $('aiIn'); if (i) { i.value = text; if (i.bpFit) i.bpFit(); i.focus(); } }, 400); }
  function wireMap() {
    var m = $('aimMap'); if (!m) return;
    m.querySelectorAll('[data-chat]').forEach(function (b) { b.onclick = function () { chatWith(A.sel); }; });
    m.querySelectorAll('[data-give]').forEach(function (b) { b.onclick = function () { var k = A.sel; A.tab = 'tasks'; draw(); setTimeout(function () { var w = $('tkWho'); if (w && k !== 'ceo') w.value = k; var t = $('tkT'); if (t) t.focus(); }, 60); }; });
    var q = $('aimQ'); if (q) q.oninput = function () { A.q = q.value; refilter(); };
    m.querySelectorAll('[data-team]').forEach(function (b) { b.onclick = function () { A.focus = false; pick(A.sel, false); }; });
    m.querySelectorAll('[data-step]').forEach(function (b) { b.onclick = function () { var i = ORDER.indexOf(A.sel) + (+b.getAttribute('data-step')); pick(ORDER[(i + ORDER.length) % ORDER.length], true); }; });
  }
  function wireDet() {
    var d = $('aimDet'); if (!d) return;
    d.querySelectorAll('[data-dt]').forEach(function (b) { b.onclick = function () { A.dtab = b.getAttribute('data-dt'); d.innerHTML = detHtml(); wireDet(); }; });
    d.querySelectorAll('[data-ask]').forEach(function (b) { b.onclick = function () { chatWith(A.sel, b.getAttribute('data-ask')); }; });
    d.querySelectorAll('[data-chat]').forEach(function (b) { b.onclick = function () { chatWith(A.sel); }; });
    d.querySelectorAll('[data-give]').forEach(function (b) { b.onclick = function () { var k = A.sel; A.tab = 'tasks'; draw(); setTimeout(function () { var w = $('tkWho'); if (w && k !== 'ceo') w.value = k; var t = $('tkT'); if (t) t.focus(); }, 60); }; });
    d.querySelectorAll('[data-task]').forEach(function (b) { b.onclick = function () { var t = (A.tk || []).filter(function (x) { return x.id === b.getAttribute('data-task'); })[0]; if (t && t.thread_id) { A.tab = 'chat'; A.agent = t.assignee; A.thread = t.thread_id; lastThread(t.assignee, t.thread_id); draw(); } else { A.tab = 'tasks'; draw(); } }; });
  }
  function wireList() {
    var l = $('aimList'); if (!l) return;
    l.querySelectorAll('.aim-r[data-k]').forEach(function (r) {
      var go = function () { pick(r.getAttribute('data-k'), true); var m = $('aimMap'); if (m && m.getBoundingClientRect().top < 60) m.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      r.onclick = go; r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
  }
  function refilter() { drawSvg(); var l = $('aimList'); if (l) { l.innerHTML = listHtml(); wireList(); } }
  function consoleView() {
    aicCss(); boardCss();
    if (!A.sel || !AG[A.sel]) A.sel = 'ceo';
    var b = $('aiBody');
    /* the map is the page (2026-11-18): no counts row, no group buttons, no side card */
    A.flt = 'all'; A.grp = 'all';
    b.innerHTML = '<div class="aim" id="aim"><div class="bpx-panel aim-map" id="aimMap">' + mapHtml() + '</div>'
      + '<div class="bpx-panel aim-list" id="aimList">' + listHtml() + '</div></div>';
    drawSvg(); wireMap(); wireList();
    /* the map is drawn to its box: draw it again when the box changes size (rotation, sidebar) */
    if (!window.__aimRs) { window.__aimRs = 1; var t = 0; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { var m = $('aimMap'); if (m && Math.abs((m._w || 0) - m.clientWidth) > 8) drawSvg(); }, 150); }); }
    api({ op: 'tasks' }).then(function (r) { if (r && r.ok) A.tk = r.data || []; });
  }

  function pitch(host) {
    var st = A.st; boardCss(); host = host || area();
    if (!st || !st.ok) { host.innerHTML = '<div class="bpx-panel"><div class="bpx-mut">' + esc((st && st.error) || 'Could not load.') + '</div></div>'; return; }
    host.innerHTML = '<div class="bpx-panel"><div class="ai-hero"><div class="pitch">'
      + '<h2>Your AI Team</h2><div class="bpx-mut" style="max-width:52ch">An AI CEO who manages ten assistants that know your business: leads, customers, marketing, estimates, crews and routes, projects and permits. The CEO hands out tasks and the assistants ask each other. You approve anything before it goes to a customer.</div>'
      + '<div class="price">$' + (st.price || 49) + '<small> / month</small></div><div class="bpx-mut" style="font-size:13px">Up to ' + st.cap + ' messages a month, plus a daily brief every morning. Cancel any time.</div>'
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
    var ceo = ceoOn() ? '<button class="ai-tab' + (A.tab === 'ceo' ? ' on' : '') + '" data-ceo="1"><span class="ms">insights</span>Briefing &amp; map</button>' : '';
    if (!A.st) return ceo;
    /* Your team first, then the AI CEO, then each assistant */
    if (!on) return '<button class="ai-tab' + (A.tab !== 'ceo' ? ' on' : '') + '" data-pitch="1"><span class="ms">diversity_3</span>AI Team</button>' + ceo;
    var ntk = st.tasks ? Object.keys(st.tasks).reduce(function (s, k) { return s + st.tasks[k].open + st.tasks[k].doing + st.tasks[k].blocked; }, 0) : 0;
    return '<button class="ai-tab' + (A.tab === 'board' || A.tab === 'map' ? ' on' : '') + '" data-board="1"><span class="ms">account_tree</span>Your team</button>'
      + '<button class="ai-tab' + (A.tab === 'tasks' ? ' on' : '') + '" data-tasks="1"><span class="ms">checklist</span>Tasks' + (ntk ? '<span class="n">' + ntk + '</span>' : '') + '</button>' + ceo
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
    var tk = a.querySelector('[data-tasks]'); if (tk) tk.onclick = function () { A.tab = 'tasks'; draw(); };
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
    if (A.tab === 'board') return consoleView();
    if (A.tab === 'map') { $('aiBody').innerHTML = '<div style="margin-bottom:10px"><button type="button" class="ai-tab" id="aiBackC"><span class="ms">arrow_back</span>Back to the console</button></div>' + boardHtml(true); $('aiBackC').onclick = function () { A.tab = 'board'; draw(); }; $('aiBody').querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { A.tab = 'board'; A.sel = b.getAttribute('data-open'); A.dtab = 'ov'; draw(); }; });
      $('aiBody').querySelectorAll('[data-ceoopen]').forEach(function (ce) { ce.onclick = function () { if (ceoOn()) { A.tab = 'ceo'; draw(); } }; }); }
    else if (A.tab === 'wait') approvals(); else if (A.tab === 'tasks') tasks(); else chat();
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
  /* the task board: what the AI CEO (or you) assigned, who has it, and what came back */
  var TS = { open: ['Waiting', '#475467'], doing: ['Working', '#2457d6'], done: ['Done', '#087F61'], blocked: ['Blocked', '#0853B5'], cancelled: ['Cancelled', '#98a2b3'] };
  async function tasks() {
    var who = Object.keys(AG).filter(function (k) { return k !== 'ceo'; });
    $('aiBody').innerHTML = '<div class="bpx-panel" style="margin-bottom:12px"><b style="display:block;margin-bottom:4px">Give an assistant a task</b><div class="bpx-mut" style="font-size:13px;margin-bottom:10px">Or ask your AI CEO to plan the work and hand out tasks. Each task run counts as one message.</div>'
      + '<div class="ai-tkf"><select id="tkWho">' + who.map(function (k) { return '<option value="' + k + '">' + esc(AG[k].n) + '</option>'; }).join('') + '</select><input id="tkT" placeholder="What should they do? e.g. Follow up on every quote older than 5 days"><select id="tkP"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></div>'
      + '<textarea id="tkD" class="bpx-input" placeholder="Details (optional)" style="width:100%;margin-top:8px;min-height:50px"></textarea><div style="display:flex;gap:10px;align-items:center;margin-top:8px"><button class="bpx-btn" id="tkAdd">Add to the board</button><span class="bpx-mmsg" id="tkMsg"></span></div></div><div id="tkList"><div class="bpx-mut">Loading…</div></div>';
    $('tkAdd').onclick = async function () {
      var t = $('tkT').value.trim(); if (!t) { $('tkMsg').textContent = 'Write what they should do.'; return; }
      this.disabled = true; var r = await api({ op: 'task_create', assistant: $('tkWho').value, title: t, detail: $('tkD').value.trim(), priority: $('tkP').value }); this.disabled = false;
      if (!r.ok) { $('tkMsg').textContent = r.error || 'Could not add it.'; return; }
      $('tkT').value = ''; $('tkD').value = ''; $('tkMsg').textContent = 'Added. Start it now, or it runs with your 7am brief.'; tkLoad();
    };
    tkLoad();
  }
  async function tkLoad() {
    var r = await api({ op: 'tasks' }), rows = r.data || [], box = $('tkList'); if (!box) return;
    if (!rows.length) { box.innerHTML = '<div class="bpx-panel"><div class="bpx-mut">Nothing on the board yet. Ask your AI CEO to plan the week, or add a task above.</div></div>'; return; }
    box.innerHTML = ['doing', 'open', 'blocked', 'done', 'cancelled'].map(function (st) {
      var g = rows.filter(function (x) { return x.status === st; }); if (!g.length) return '';
      return '<div class="bpx-mut" style="margin:16px 0 8px;font-size:13px;font-weight:600">' + TS[st][0] + ' · ' + g.length + '</div>' + g.slice(0, st === 'done' || st === 'cancelled' ? 12 : 40).map(function (t) {
        var by = t.assigned_by === 'owner' ? 'You' : ((AG[t.assigned_by] || {}).n || t.assigned_by);
        return '<div class="ai-tk" data-id="' + t.id + '"><div class="ai-tk-h"><span class="ai-tk-s" style="color:' + TS[t.status][1] + ';border-color:' + TS[t.status][1] + '">' + TS[t.status][0] + '</span><b>' + esc(t.title) + '</b>'
          + (t.priority === 'high' ? '<span class="ai-tk-s" style="color:#001530;border-color:#001530">High</span>' : '') + '<span class="bpx-mut" style="font-size:12.5px;margin-left:auto">' + esc(by) + ' → <b>' + esc((AG[t.assignee] || {}).n || t.assignee) + '</b></span></div>'
          + (t.detail ? '<div class="bpx-mut" style="font-size:13px;margin-top:6px;white-space:pre-wrap">' + esc(t.detail) + '</div>' : '')
          + (t.result ? '<div class="ai-tk-r">' + esc(t.result) + '</div>' : '')
          + '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">'
          + (t.status === 'open' || t.status === 'blocked' ? '<button class="bpx-btn" data-run>Start now</button><button class="bpx-rowbtn" data-cancel style="margin:0">Cancel</button>' : '')
          + (t.status === 'cancelled' ? '<button class="bpx-rowbtn" data-reopen style="margin:0">Put back on the board</button>' : '')
          + (t.thread_id ? '<button class="bpx-rowbtn" data-th="' + t.thread_id + '" style="margin:0">Open the conversation</button>' : '') + '<span class="bpx-mmsg"></span></div></div>';
      }).join('');
    }).join('');
    box.querySelectorAll('.ai-tk').forEach(function (c) {
      var id = c.getAttribute('data-id'), row = rows.filter(function (x) { return x.id === id; })[0], msg = c.querySelector('.bpx-mmsg');
      var run = c.querySelector('[data-run]'); if (run) run.onclick = async function () {
        run.disabled = true; msg.textContent = ((AG[row.assignee] || {}).n || 'They') + ' is working on it…';
        var r = await api({ op: 'task_run', id: id }); if (!r.ok) { msg.textContent = r.error || 'Could not run it.'; run.disabled = false; return; }
        A.st.used++; if (r.approvals) A.st.pending += r.approvals; topBar(); tkLoad(); };
      var cn = c.querySelector('[data-cancel]'); if (cn) cn.onclick = async function () { await api({ op: 'task_set', id: id, status: 'cancelled' }); tkLoad(); };
      var ro = c.querySelector('[data-reopen]'); if (ro) ro.onclick = async function () { await api({ op: 'task_set', id: id, status: 'open' }); tkLoad(); };
      var th = c.querySelector('[data-th]'); if (th) th.onclick = function () { A.tab = 'chat'; A.agent = row.assignee; A.thread = th.getAttribute('data-th'); lastThread(row.assignee, A.thread); draw(); };
    });
  }

  async function chat() {
    $('aiBody').innerHTML = bpChatShell({ ph: 'Message ' + AG[A.agent].n + '…', fine: 'Anything for a customer waits for your OK first.' });
    bpChatWire(send);
    var col0 = col(); if (col0) col0.innerHTML = '<div class="ai-m s">Loading…</div>';
    var r = await api({ op: 'threads', agent: A.agent });
    /* come back to the conversation you had open last time with this assistant */
    if (!A.thread) { var keep = lastThread(A.agent); if (keep && (r.data || []).some(function (t) { return t.id === keep; })) A.thread = keep; }
    open(A.thread);
    var side = $('aiSide'); if (!side) return;
    side.innerHTML = '<button class="ai-new" data-t=""><span class="ms">edit_square</span>New chat</button>' + ((r.data || []).length ? '<small>Recent</small>' : '') + (r.data || []).map(function (t) { return '<button data-t="' + t.id + '" title="' + esc(t.title) + '">' + (t.kind === 'brief' ? 'Brief: ' : '') + esc(t.title) + '</button>'; }).join('');
    side.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', (b.getAttribute('data-t') || null) === A.thread); b.onclick = function () { open(b.getAttribute('data-t') || null); side.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
  }
  function col() { return $('aiCol'); }
  function lastThread(ag, id) {
    try { if (arguments.length > 1) localStorage.setItem('bp-ai-last-' + ag, id || ''); else return localStorage.getItem('bp-ai-last-' + ag) || null; } catch (e) { return null; }
  }
  function bottom() { var m = $('aiMsgs'); if (m) m.scrollTop = m.scrollHeight; }
  async function open(id) {
    A.thread = id; lastThread(A.agent, id); var box = col(); if (!box) return;
    if (!id) {
      box.innerHTML = '<div class="ai-hello">' + AV + '<h2>How can ' + AG[A.agent].n + ' help?</h2><div class="bpx-mut">' + AG[A.agent].d + '</div>' + seeLine(A.agent) + '</div><div class="ai-hint">' + AG[A.agent].h.map(function (x) { return '<button>' + esc(x) + '</button>'; }).join('') + '</div>';
      box.querySelectorAll('.ai-hint button').forEach(function (b) { b.onclick = function () { $('aiIn').value = b.textContent; send(); }; });
      return;
    }
    box.innerHTML = '<div class="ai-m s">Loading…</div>';
    var r = await api({ op: 'thread', id: id }); box.innerHTML = '';
    var list = r.data || [];
    list.forEach(add);
    /* a question whose answer never came back (the run failed) */
    var end = list[list.length - 1];
    if (end && end.role === 'user' && !/^\[The owner/.test(end.text || '')) add({ role: 's', text: 'No answer was saved for this one. Send it again.' });
    bottom();
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
    if (!r.ok) { if (r.thread_id) { A.thread = r.thread_id; lastThread(A.agent, r.thread_id); } add({ role: 's', text: r.error || 'Something went wrong.' }); return; }
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
