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
    A.st = await api({ op: 'status' });
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
     The team console (2026-11-18): the AI team laid out like an operations console.
     Left: the team by group, and this month's messages. Middle: the counts, a search and
     every assistant in a table (what it's connected to, its tasks, how it's doing).
     Right: the one picked, with a map of what it's wired to (the AI CEO over it, the
     tools, pages and the web it works from), what's on its board, and a way in to chat.
     Deep navy like the app's sidebar; blue for work, mint for ready. The old team map
     is one tap away (Team map).
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
      '.aic{--n0:#04101f;--n1:#071a33;--n2:#0b2343;--n3:#10305a;--ln:rgba(148,178,220,.13);--ln2:rgba(148,178,220,.22);--tx:#e8eef7;--mu:#8ea3c0;--mu2:#62789a;--bl:#3d8bff;--bl2:#006fff;--mi:#16C79A;--mi2:#3FE0B6;',
      '  display:grid;grid-template-columns:200px minmax(0,1fr) minmax(360px,420px);height:calc(100vh - 176px);min-height:600px;border-radius:20px;overflow:hidden;color:var(--tx);',
      '  background:radial-gradient(120% 90% at 100% 0%,rgba(0,111,255,.16),transparent 55%),radial-gradient(90% 70% at 0% 100%,rgba(22,199,154,.08),transparent 60%),linear-gradient(180deg,var(--n1),var(--n0));',
      '  border:1px solid rgba(0,21,48,.5);box-shadow:0 24px 60px -30px rgba(0,21,48,.55),inset 0 1px 0 rgba(255,255,255,.05);font-size:13.5px}',
      '.aic .ms{font-size:18px}.aic{scroll-margin-top:84px}',
      '.aic button{font:inherit;color:inherit}',
      /* left rail */
      '.aic-rail{display:flex;flex-direction:column;gap:2px;padding:14px 10px;border-right:1px solid var(--ln);min-height:0;overflow:auto}',
      '.aic-org{display:flex;align-items:center;gap:10px;padding:4px 6px 14px}',
      '.aic-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,#006fff,#16C79A);box-shadow:0 6px 16px -6px rgba(0,111,255,.6);flex:none}.aic-logo .ms{color:#fff;font-size:19px}',
      '.aic-org b{display:block;font-size:13.5px;line-height:1.2}.aic-org small{display:block;color:var(--mu);font-size:11.5px}',
      '.aic-cap{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mu2);padding:12px 8px 6px}',
      '.aic-g{display:flex;align-items:center;gap:9px;width:100%;padding:8px 9px;border:0;border-radius:10px;background:none;text-align:left;cursor:pointer;color:#c4d2e6;transition:background .15s,color .15s}',
      '.aic-g:hover{background:rgba(255,255,255,.05);color:var(--tx)}',
      '.aic-g.on{background:linear-gradient(90deg,rgba(0,111,255,.28),rgba(0,111,255,.1));color:#fff;box-shadow:inset 0 0 0 1px rgba(61,139,255,.35)}',
      '.aic-g .ms{color:var(--mu)}.aic-g.on .ms{color:#8fb8ff}',
      '.aic-g em{margin-left:auto;font-style:normal;font-size:11px;color:var(--mu);background:rgba(255,255,255,.06);border-radius:99px;padding:0 7px;line-height:18px}',
      '.aic-g.on em{background:rgba(255,255,255,.14);color:#fff}',
      '.aic-use{margin-top:auto;padding:12px 10px;border:1px solid var(--ln);border-radius:14px;background:rgba(255,255,255,.03)}',
      '.aic-use b{font-size:13px}.aic-use small{display:block;color:var(--mu);font-size:11.5px;margin-top:2px}',
      '.aic-bar{height:6px;border-radius:6px;background:rgba(255,255,255,.08);margin-top:9px;overflow:hidden}.aic-bar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#006fff,#16C79A)}',
      /* middle */
      '.aic-mid{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid var(--ln)}',
      '.aic-head{display:flex;align-items:flex-end;gap:12px;padding:18px 20px 12px}',
      '.aic-head h2{margin:0;font-size:20px;letter-spacing:-.02em;color:#fff}.aic-head p{margin:3px 0 0;color:var(--mu);font-size:12.5px}',
      '.aic-mapb{margin-left:auto;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ln2);background:rgba(255,255,255,.04);border-radius:10px;padding:7px 11px;cursor:pointer;font-size:12.5px;flex:none}.aic-mapb:hover{background:rgba(255,255,255,.08)}',
      '.aic-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:0 20px 14px}',
      '.aic-tile{border:1px solid var(--ln);border-radius:14px;padding:11px 12px;background:rgba(255,255,255,.03);text-align:left;cursor:pointer;transition:border-color .15s,background .15s}',
      '.aic-tile:hover{background:rgba(255,255,255,.06)}.aic-tile.on{border-color:rgba(61,139,255,.75);background:rgba(0,111,255,.12);box-shadow:0 0 0 3px rgba(0,111,255,.12)}',
      '.aic-tile .ms{font-size:16px;color:#8fb8ff}.aic-tile span{display:block;color:var(--mu);font-size:12px;margin-top:5px}.aic-tile b{display:block;font-size:20px;letter-spacing:-.02em;color:#fff;margin-top:1px;font-variant-numeric:tabular-nums}',
      '.aic-bar2{display:flex;gap:8px;padding:0 20px 10px}',
      '.aic-q{flex:1;display:flex;align-items:center;gap:8px;border:1px solid var(--ln);background:rgba(255,255,255,.04);border-radius:10px;padding:0 10px}.aic-q .ms{color:var(--mu);font-size:17px}',
      '#bpx#bpx#bpx#bpx#bpx#bpx .aic .aic-q input,#bpx#bpx#bpx#bpx#bpx#bpx .aic .aic-q input:focus{flex:1;min-width:0;width:auto;height:auto;border:0!important;border-radius:0!important;background:transparent!important;background-color:transparent!important;box-shadow:none!important;color:var(--tx)!important;-webkit-text-fill-color:var(--tx);padding:8px 0!important;margin:0!important;font-size:13px!important;outline:0!important}',
      '.aic-q:focus-within{border-color:rgba(61,139,255,.6);box-shadow:0 0 0 3px rgba(0,111,255,.18)}',
      '.aic-q input::placeholder{color:var(--mu2)}',
      '.aic-tbl{flex:1;min-height:0;overflow:auto;padding:0 8px 10px}',
      '.aic-tr{display:grid;grid-template-columns:minmax(130px,1.3fr) minmax(90px,.8fr) minmax(110px,1fr) 44px 92px;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;cursor:pointer;border:1px solid transparent}',
      '.aic-th{cursor:default;color:var(--mu2);font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:6px 12px;position:sticky;top:0;background:linear-gradient(180deg,var(--n1) 70%,transparent);z-index:1}',
      '.aic-tr:not(.aic-th):hover{background:rgba(255,255,255,.04)}',
      '.aic-tr.on{background:rgba(0,111,255,.13);border-color:rgba(61,139,255,.35)}',
      '.aic-tr+.aic-tr:not(.on){box-shadow:inset 0 1px 0 var(--ln)}',
      '.aic-nm{display:flex;align-items:center;gap:10px;min-width:0}.aic-nm b{font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.aic-av{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:rgba(61,139,255,.16);color:#8fb8ff;flex:none;box-shadow:inset 0 0 0 1px rgba(61,139,255,.25)}.aic-av .ms{font-size:17px}',
      '.aic-av.ceo{background:linear-gradient(135deg,#006fff,#16C79A);color:#fff;box-shadow:0 6px 14px -6px rgba(0,111,255,.6)}',
      '.aic-role{color:var(--mu);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.aic-icons{display:flex;align-items:center;gap:4px;min-width:0}.aic-icons i{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;background:rgba(255,255,255,.06);font-style:normal;flex:none}.aic-icons i .ms{font-size:13px;color:#b9cbe4}.aic-icons i.web .ms{color:var(--mi2)}.aic-icons i.tool .ms{color:#8fb8ff}',
      '.aic-icons small{color:var(--mu);font-size:11.5px;margin-left:2px;white-space:nowrap}',
      '.aic-n{font-variant-numeric:tabular-nums;color:#c4d2e6;text-align:center}.aic-n.z{color:var(--mu2)}',
      '.aic-st{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;border-radius:99px;padding:3px 9px;white-space:nowrap;justify-self:start}',
      '.aic-st i{width:6px;height:6px;border-radius:50%;background:currentColor}',
      '.aic-st.ready{color:var(--mi2);background:rgba(22,199,154,.12)}.aic-st.work{color:#9cc4ff;background:rgba(0,111,255,.2)}.aic-st.work i{animation:aicPulse 1.4s ease-in-out infinite}',
      '.aic-st.queue{color:#c4d2e6;background:rgba(255,255,255,.08)}.aic-st.need{color:#fff;background:#0970F7}',
      '@keyframes aicPulse{50%{opacity:.35}}',
      '.aic-empty{padding:30px 16px;text-align:center;color:var(--mu)}',
      /* right */
      '.aic-det{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto}',
      '.aic-dh{display:flex;align-items:center;gap:10px;padding:16px 18px 10px}',
      '.aic-nav{display:flex;gap:2px}.aic-nav button{width:28px;height:28px;border-radius:8px;border:0;background:none;display:grid;place-items:center;cursor:pointer;color:var(--mu)}.aic-nav button:hover{background:rgba(255,255,255,.07);color:#fff}.aic-nav .ms{font-size:18px}',
      '.aic-dh h3{margin:0;font-size:16px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.aic-dsub{display:flex;align-items:center;gap:8px;padding:0 18px 12px;color:var(--mu);font-size:12.5px}.aic-dsub .ms{font-size:15px;color:#8fb8ff}',
      '.aic-tabs{display:flex;gap:4px;padding:0 14px;border-bottom:1px solid var(--ln)}',
      '.aic-tabs button{border:0;background:none;padding:10px 8px;color:var(--mu);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-size:12.5px}',
      '.aic-tabs button.on{color:#fff;border-bottom-color:var(--bl)}',
      '.aic-pane{padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px}',
      '.aic-graph{position:relative;border:1px solid var(--ln);border-radius:16px;background:radial-gradient(70% 60% at 50% 50%,rgba(0,111,255,.12),transparent 70%),rgba(255,255,255,.02);overflow:hidden}',
      '.aic-graph:before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(148,178,220,.16) 1px,transparent 1px);background-size:18px 18px;-webkit-mask-image:radial-gradient(75% 70% at 50% 50%,#000,transparent);mask-image:radial-gradient(75% 70% at 50% 50%,#000,transparent);pointer-events:none}',
      '.aic-graph svg{position:relative;display:block;width:100%;height:auto}',
      '.aic-graph text{font-family:inherit;font-size:10.5px;fill:#b9cbe4}.aic-graph text.c{font-size:12px;fill:#fff;font-weight:600}.aic-graph text.s{font-size:9.5px;fill:#62789a}',
      '.aic-lnk{fill:none;stroke-width:1.4;opacity:.85}',
      '.aic-node circle.r{fill:#0b2343;stroke-width:1.4}',
      '.aic-node:hover circle.r{fill:#10305a}',
      '.aic-gfoot{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 12px;border-top:1px solid var(--ln);color:var(--mu);font-size:11.5px}.aic-gfoot i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:0}',
      '.aic-more{margin-left:auto;color:#e8eef7;border:1px solid var(--ln2);background:rgba(4,16,31,.6);border-radius:9px;padding:5px 9px;font-size:11.5px;cursor:pointer;display:inline-flex;gap:5px;align-items:center}.aic-more .ms{font-size:14px}',
      '.aic-item{display:flex;align-items:center;gap:10px;border:1px solid var(--ln);background:rgba(255,255,255,.03);border-radius:12px;padding:10px 12px;cursor:pointer;text-align:left;width:100%}',
      '.aic-item:hover{background:rgba(255,255,255,.06)}.aic-item>div{flex:1;min-width:0}.aic-item b{display:block;font-weight:600;color:#fff;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.aic-item small{display:block;color:var(--mu);font-size:11.5px;margin-top:2px}.aic-item>.ms{color:var(--mu);font-size:18px}',
      '.aic-pr{font-size:10.5px;font-weight:700;border-radius:6px;padding:1px 7px;margin-left:6px;vertical-align:1px}.aic-pr.high{background:#0970F7;color:#fff}.aic-pr.low{background:rgba(255,255,255,.08);color:var(--mu)}',
      '.aic-sec{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mu2);margin-top:4px}',
      '.aic-hint{display:grid;gap:6px}.aic-hint button{border:1px solid var(--ln);background:rgba(255,255,255,.03);border-radius:10px;padding:9px 11px;text-align:left;cursor:pointer;color:#c4d2e6;font-size:12.5px}.aic-hint button:hover{background:rgba(255,255,255,.07);color:#fff}',
      '.aic-cta{display:flex;gap:8px;padding:12px 16px 16px;margin-top:auto;border-top:1px solid var(--ln);position:sticky;bottom:0;background:linear-gradient(180deg,rgba(7,26,51,.6),var(--n1) 40%)}',
      '.aic-go{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:12px;padding:11px 14px;background:linear-gradient(180deg,#1a7dff,#006fff);color:#fff;font-weight:600;cursor:pointer;box-shadow:0 10px 24px -12px rgba(0,111,255,.9)}',
      '.aic-go2{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ln2);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.04);cursor:pointer;color:#e8eef7}',
      '.aic-cn{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.aic-cn div{display:flex;align-items:center;gap:8px;border:1px solid var(--ln);border-radius:10px;padding:8px 10px;background:rgba(255,255,255,.03);font-size:12.5px;min-width:0}',
      '.aic-cn div span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aic-cn .ms{font-size:16px;color:#b9cbe4}.aic-cn .web .ms{color:var(--mi2)}.aic-cn .tool .ms{color:#8fb8ff}',
      '.aic-back{display:none}',
      /* iPad landscape and laptops: the rail becomes chips over the table */
      '@media(max-width:1280px){.aic{grid-template-columns:minmax(0,1fr) minmax(360px,400px)}.aic-rail{display:none}.aic-chips{display:flex!important}}',
      '.aic-chips{display:none;gap:6px;padding:0 20px 10px;overflow-x:auto;scrollbar-width:none}.aic-chips::-webkit-scrollbar{display:none}',
      '.aic-chips button{flex:none;border:1px solid var(--ln);background:rgba(255,255,255,.04);border-radius:99px;padding:6px 11px;cursor:pointer;font-size:12.5px;color:#c4d2e6}.aic-chips button.on{background:rgba(0,111,255,.28);border-color:rgba(61,139,255,.5);color:#fff}',
      '@media(max-width:1600px){.aic-tr{grid-template-columns:minmax(120px,1.3fr) minmax(100px,1fr) 40px 92px}.aic-role{display:none}}',
      /* phones and iPad portrait: one column; the picked assistant opens over the list */
      '@media(max-width:900px){.aic{grid-template-columns:minmax(0,1fr);height:auto;min-height:0;border-radius:18px}.aic-mid{border-right:0}.aic-tbl{max-height:none;overflow:visible}.aic-det{display:none;border-top:1px solid var(--ln)}',
      '  .aic.det .aic-mid{display:none}.aic.det .aic-det{display:flex}.aic-back{display:inline-flex}.aic-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.aic-head{padding:16px 16px 12px}.aic-tiles,.aic-bar2,.aic-chips{padding-left:16px;padding-right:16px}',
      '  .aic-tr{grid-template-columns:minmax(0,1fr) auto;gap:6px 10px}.aic-th{display:none}.aic-tr .aic-icons{grid-column:1;padding-left:40px}.aic-tr .aic-n{display:none}.aic-tr .aic-st{grid-row:1;grid-column:2;justify-self:end}.aic-cta{position:static}}',
      /* the phone layout pads page sections; the console's columns keep their own spacing */
      '#bpx#bpx#bpx#bpx#bpx .aic>section,#bpx#bpx#bpx#bpx#bpx .aic>aside{padding:0!important;margin:0!important}#bpx#bpx#bpx#bpx#bpx .aic>.aic-rail{padding:14px 10px!important}',
      '.aic-tile span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '@media(max-width:900px){.aic-tile{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:0 9px;padding:10px 12px}.aic-tile .ms{grid-row:1/3;font-size:20px}.aic-tile span{margin:0;font-size:11.5px}.aic-tile b{font-size:18px;margin:0}.aic-head h2{font-size:18px}.aic-mapb{padding:6px 9px}}',
      '@media (prefers-reduced-motion:reduce){.aic-st.work i{animation:none}}'
    ].join('\n');
    document.head.appendChild(c);
  }
  function aicIcons(k) {
    var c = connList(k), sh = c.slice(0, 5);
    return '<div class="aic-icons">' + sh.map(function (x) { return '<i class="' + x.kind + '" title="' + esc(x.n) + '"><span class="ms">' + x.ic + '</span></i>'; }).join('') + (c.length > 5 ? '<small>+' + (c.length - 5) + '</small>' : '') + '</div>';
  }
  function aicRows() {
    var g = A.grp || 'all', q = String(A.q || '').toLowerCase().trim(), f = A.flt || 'all';
    var list = ORDER.filter(function (k) {
      if (g !== 'all' && groupOf(k)[0] !== g) return false;
      var s = stateOf(k)[0];
      if (f === 'work' && s !== 'work') return false;
      if (f === 'tasks' && !(stateOf(k)[2].open + stateOf(k)[2].doing + stateOf(k)[2].blocked)) return false;
      if (q && (AG[k].n + ' ' + AG[k].d + ' ' + connList(k).map(function (x) { return x.n; }).join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (!list.length) return '<div class="aic-empty">No one on your team matches that.</div>';
    return '<div class="aic-tr aic-th"><span>Assistant</span><span class="aic-role">Group</span><span>Connected to</span><span style="text-align:center">Tasks</span><span>Status</span></div>'
      + list.map(function (k) {
        var s = stateOf(k), t = s[2], n = t.open + t.doing + t.blocked;
        return '<div class="aic-tr' + (A.sel === k ? ' on' : '') + '" data-k="' + k + '" role="button" tabindex="0"><span class="aic-nm"><span class="aic-av' + (k === 'ceo' ? ' ceo' : '') + '"><span class="ms">' + AG[k].ic + '</span></span><b>' + esc(AG[k].n) + '</b></span>'
          + '<span class="aic-role">' + esc(k === 'ceo' ? 'Manager' : groupOf(k)[1]) + '</span>' + aicIcons(k)
          + '<span class="aic-n' + (n ? '' : ' z') + '">' + (n || '·') + '</span><span class="aic-st ' + s[0] + '"><i></i>' + s[1] + '</span></div>';
      }).join('');
  }
  /* the picked assistant, wired to what it works from: the CEO (or you) on the left, its tools,
     pages and the web on the right, each joined by a curve with a dot running along it */
  function aicGraph(k) {
    var W = 420, H = 332, cx = 190, cy = 160, c = connList(k), more = Math.max(0, c.length - 8); c = c.slice(0, 8);
    var col = { tool: '#3d8bff', page: '#8fb8ff', web: '#16C79A', mgr: '#a9b8cc', you: '#3FE0B6' };
    var left = k === 'ceo' ? [{ n: 'You', ic: 'person', kind: 'you', s: 'approves' }] : [{ n: 'AI CEO', ic: 'monitoring', kind: 'mgr', s: 'manages' }, { n: 'You', ic: 'person', kind: 'you', s: 'approves' }];
    var nodes = [], motion = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    left.forEach(function (x, i) { nodes.push({ x: 52, y: left.length === 1 ? cy : 78 + i * 144, d: x }); });
    var colA = c.slice(0, Math.ceil(c.length / 2)), colB = c.slice(Math.ceil(c.length / 2));
    /* two columns, the second set half a step lower, so no two labels sit side by side */
    var place = function (arr, x, off) { arr.forEach(function (d, i) { nodes.push({ x: x, y: arr.length === 1 ? cy + off : 36 + off + i * 72, d: d }); }); };
    place(colA, 300, 0); place(colB, 382, colB.length > 1 ? 36 : 0);
    var paths = '', dots = '', circles = '';
    nodes.forEach(function (n, i) {
      var cl = col[n.d.kind] || '#8fb8ff', mx = (cx + n.x) / 2, id = 'aicp' + i;
      paths += '<path id="' + id + '" class="aic-lnk" stroke="' + cl + '" stroke-opacity=".55" d="M' + cx + ' ' + cy + ' C' + mx + ' ' + cy + ' ' + mx + ' ' + n.y + ' ' + n.x + ' ' + n.y + '"/>';
      if (motion) dots += '<circle r="2.6" fill="' + cl + '"><animateMotion dur="' + (2.6 + (i % 4) * 0.5) + 's" begin="' + (i * 0.35) + 's" repeatCount="indefinite" keyPoints="' + (n.x < cx ? '1;0' : '0;1') + '" keyTimes="0;1" calcMode="linear"><mpath href="#' + id + '"/></animateMotion></circle>';
      circles += '<g class="aic-node"><circle class="r" cx="' + n.x + '" cy="' + n.y + '" r="15" stroke="' + cl + '"/>'
        + '<foreignObject x="' + (n.x - 9) + '" y="' + (n.y - 9) + '" width="18" height="18"><span class="ms" style="font-size:15px;color:' + cl + ';display:block;line-height:18px;text-align:center">' + n.d.ic + '</span></foreignObject>'
        + '<text x="' + n.x + '" y="' + (n.y + 27) + '" text-anchor="middle">' + esc(n.d.n.length > 15 ? n.d.n.slice(0, 13) + '…' : n.d.n) + '</text>' + (n.d.s ? '<text class="s" x="' + n.x + '" y="' + (n.y + 39) + '" text-anchor="middle">' + n.d.s + '</text>' : '') + '</g>';
    });
    var center = '<g><circle cx="' + cx + '" cy="' + cy + '" r="30" fill="rgba(0,111,255,.16)"/><circle cx="' + cx + '" cy="' + cy + '" r="21" fill="url(#aicG)" stroke="rgba(255,255,255,.35)"/>'
      + '<foreignObject x="' + (cx - 11) + '" y="' + (cy - 11) + '" width="22" height="22"><span class="ms" style="font-size:19px;color:#fff;display:block;line-height:22px;text-align:center">' + AG[k].ic + '</span></foreignObject>'
      + '<text class="c" x="' + cx + '" y="' + (cy + 46) + '" text-anchor="middle">' + esc(AG[k].n) + '</text></g>';
    return '<div class="aic-graph">'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-label="What ' + esc(AG[k].n) + ' is connected to"><defs><linearGradient id="aicG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#006fff"/><stop offset="1" stop-color="#16C79A"/></linearGradient></defs>' + paths + dots + circles + center + '</svg>'
      + '<div class="aic-gfoot"><span><i style="background:#3d8bff"></i>Tools</span><span><i style="background:#8fb8ff"></i>Pages it reads</span><span><i style="background:#16C79A"></i>The web</span>' + (more ? '<span>+' + more + ' more under Connections</span>' : '') + '<button type="button" class="aic-more" data-map="1"><span class="ms">open_in_full</span>Team map</button></div></div>';
  }
  function aicTaskItem(t) {
    var s = TS[t.status] || TS.open;
    return '<button type="button" class="aic-item" data-task="' + t.id + '"><span class="aic-st ' + ({ doing: 'work', blocked: 'need', open: 'queue', done: 'ready', cancelled: 'queue' }[t.status] || 'queue') + '"><i></i>' + s[0] + '</span><div><b>' + esc(t.title) + (t.priority === 'high' ? '<span class="aic-pr high">High</span>' : t.priority === 'low' ? '<span class="aic-pr low">Low</span>' : '') + '</b>'
      + '<small>' + esc(t.assigned_by === 'owner' ? 'From you' : 'From ' + ((AG[t.assigned_by] || {}).n || t.assigned_by)) + ' · ' + ago(t.updated_at || t.created_at) + '</small></div><span class="ms">chevron_right</span></button>';
  }
  function aicDetail(k) {
    var s = stateOf(k), c = connList(k), mine = (A.tk || []).filter(function (t) { return t.assignee === k; });
    var live = mine.filter(function (t) { return t.status === 'doing' || t.status === 'open' || t.status === 'blocked'; });
    var tab = A.dtab || 'ov', body = '';
    if (tab === 'ov') {
      body = aicGraph(k)
        + '<div class="aic-sec">On the board</div>' + (live.length ? live.slice(0, 3).map(aicTaskItem).join('') : '<div class="aic-item" style="cursor:default"><span class="ms" style="color:#3FE0B6">check_circle</span><div><b>Nothing waiting</b><small>' + (A.tk ? 'Give ' + esc(AG[k].n) + ' a task, or ask the AI CEO to plan the week.' : 'Loading the board…') + '</small></div></div>')
        + '<div class="aic-sec">Ask ' + esc(AG[k].n) + '</div><div class="aic-hint">' + AG[k].h.map(function (h) { return '<button type="button" data-ask="' + esc(h) + '">' + esc(h) + '</button>'; }).join('') + '</div>';
    } else if (tab === 'cn') {
      body = '<div class="bpx-mut" style="color:var(--mu);font-size:12.5px">' + esc(AG[k].n) + ' reads these, works with these tools' + (c.some(function (x) { return x.kind === 'web'; }) ? ' and searches the web' : '') + '. Anything for a customer waits for your OK.</div>'
        + '<div class="aic-cn">' + c.map(function (x) { return '<div class="' + x.kind + '"><span class="ms">' + x.ic + '</span><span>' + esc(x.n) + '</span></div>'; }).join('') + '</div>';
    } else {
      body = (mine.length ? mine.slice(0, 20).map(aicTaskItem).join('') : '<div class="aic-empty">No tasks for ' + esc(AG[k].n) + ' yet.</div>')
        + '<button type="button" class="aic-go2" data-give="1" style="justify-content:center"><span class="ms">add_task</span>Give ' + esc(AG[k].n) + ' a task</button>';
    }
    return '<div class="aic-dh"><button type="button" class="aic-nav aic-back" data-back="1" style="border:0;background:none;cursor:pointer;color:var(--mu)"><span class="ms">arrow_back</span></button>'
      + '<div class="aic-nav"><button type="button" data-step="-1" aria-label="Previous"><span class="ms">keyboard_arrow_up</span></button><button type="button" data-step="1" aria-label="Next"><span class="ms">keyboard_arrow_down</span></button></div>'
      + '<span class="aic-av' + (k === 'ceo' ? ' ceo' : '') + '"><span class="ms">' + AG[k].ic + '</span></span><h3>' + esc(AG[k].n) + '</h3><span class="aic-st ' + s[0] + '" style="margin-left:auto"><i></i>' + s[1] + '</span></div>'
      + '<div class="aic-dsub"><span class="ms">' + groupOf(k)[2] + '</span>' + esc(AG[k].d) + '</div>'
      + '<div class="aic-tabs"><button type="button" data-dt="ov" class="' + (tab === 'ov' ? 'on' : '') + '">Overview</button><button type="button" data-dt="cn" class="' + (tab === 'cn' ? 'on' : '') + '">Connections (' + c.length + ')</button><button type="button" data-dt="tk" class="' + (tab === 'tk' ? 'on' : '') + '">Tasks (' + mine.length + ')</button></div>'
      + '<div class="aic-pane">' + body + '</div>'
      + '<div class="aic-cta"><button type="button" class="aic-go" data-chat="1"><span class="ms">chat</span>Chat with ' + esc(AG[k].n) + '</button><button type="button" class="aic-go2" data-give="1" aria-label="Give a task"><span class="ms">add_task</span></button></div>';
  }
  function aicHtml() {
    var st = A.st || {}, pct = Math.min(100, Math.round(100 * (st.used || 0) / Math.max(1, st.cap || 1)));
    var tot = ORDER.reduce(function (s, k) { var t = stateOf(k)[2]; s.t += t.open + t.doing + t.blocked; s.w += t.doing ? 1 : 0; return s; }, { t: 0, w: 0 });
    var cnt = function (g) { return g[3] ? g[3].length : ORDER.length; };
    var rail = '<aside class="aic-rail"><div class="aic-org"><span class="aic-logo"><span class="ms">auto_awesome</span></span><div><b>AI Team</b><small>' + (st.included ? 'Included in your plan' : '$' + (st.price || 49) + ' / month add-on') + '</small></div></div>'
      + '<div class="aic-cap">Your team</div>' + GRP.map(function (g) { return '<button type="button" class="aic-g' + ((A.grp || 'all') === g[0] ? ' on' : '') + '" data-g="' + g[0] + '"><span class="ms">' + g[2] + '</span>' + g[1] + '<em>' + cnt(g) + '</em></button>'; }).join('')
      + '<div class="aic-cap">Work</div><button type="button" class="aic-g" data-go="tasks"><span class="ms">checklist</span>Task board<em>' + tot.t + '</em></button>'
      + '<button type="button" class="aic-g" data-go="wait"><span class="ms">task_alt</span>Waiting for you<em>' + (st.pending || 0) + '</em></button>'
      + (ceoOn() ? '<button type="button" class="aic-g" data-go="ceo"><span class="ms">insights</span>Briefing &amp; map</button>' : '')
      + '<div class="aic-use"><b>' + (st.used || 0) + ' of ' + (st.cap || 0) + '</b><small>messages this month · brief at 7am</small><div class="aic-bar"><i style="width:' + pct + '%"></i></div></div></aside>';
    var tile = function (id, ic, lbl, v) { return '<button type="button" class="aic-tile' + ((A.flt || 'all') === id ? ' on' : '') + '" data-f="' + id + '"><span class="ms">' + ic + '</span><span>' + lbl + '</span><b>' + v + '</b></button>'; };
    var mid = '<section class="aic-mid"><div class="aic-head"><div><h2>Your team</h2><p>Your AI CEO and ' + RING.length + ' assistants, what each is wired to and what they’re working on.</p></div><button type="button" class="aic-mapb" data-map="1"><span class="ms">hub</span>Team map</button></div>'
      + '<div class="aic-tiles">' + tile('all', 'diversity_3', 'Everyone', ORDER.length) + tile('work', 'bolt', 'Working now', tot.w) + tile('tasks', 'checklist', 'With tasks', ORDER.filter(function (k) { var t = stateOf(k)[2]; return t.open + t.doing + t.blocked; }).length)
      + '<button type="button" class="aic-tile" data-go="wait"><span class="ms">task_alt</span><span>Waiting for you</span><b>' + (st.pending || 0) + '</b></button></div>'
      + '<div class="aic-chips">' + GRP.map(function (g) { return '<button type="button" class="' + ((A.grp || 'all') === g[0] ? 'on' : '') + '" data-g="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</div>'
      + '<div class="aic-bar2"><label class="aic-q"><span class="ms">search</span><input id="aicQ" placeholder="Search your team or what they’re connected to" value="' + esc(A.q || '') + '" autocomplete="off"></label></div>'
      + '<div class="aic-tbl" id="aicTbl">' + aicRows() + '</div></section>';
    return '<div class="aic' + (A.mdet ? ' det' : '') + '" id="aic">' + rail + mid + '<section class="aic-det" id="aicDet">' + aicDetail(A.sel) + '</section></div>';
  }
  function aicWire() {
    var root = $('aic'); if (!root) return;
    var redrawDet = function () { var d = $('aicDet'); if (d) { d.innerHTML = aicDetail(A.sel); wireDet(); } };
    var redrawTbl = function () { var t = $('aicTbl'); if (t) { t.innerHTML = aicRows(); wireRows(); } };
    function pick(k) { A.sel = k; A.dtab = A.dtab || 'ov'; root.querySelectorAll('.aic-tr[data-k]').forEach(function (r) { r.classList.toggle('on', r.getAttribute('data-k') === k); }); redrawDet(); if (window.innerWidth <= 900) { A.mdet = true; root.classList.add('det'); root.scrollIntoView({ block: 'start' }); } }
    function wireRows() { root.querySelectorAll('.aic-tr[data-k]').forEach(function (r) { r.onclick = function () { pick(r.getAttribute('data-k')); }; r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r.getAttribute('data-k')); } }; }); }
    function chatWith(k, text) { A.tab = 'chat'; A.agent = k; A.thread = null; A.mdet = false; draw(); if (text) setTimeout(function () { var i = $('aiIn'); if (i) { i.value = text; if (i.bpFit) i.bpFit(); i.focus(); } }, 400); }
    function wireDet() {
      var d = $('aicDet'); if (!d) return;
      d.querySelectorAll('[data-dt]').forEach(function (b) { b.onclick = function () { A.dtab = b.getAttribute('data-dt'); redrawDet(); }; });
      d.querySelectorAll('[data-step]').forEach(function (b) { b.onclick = function () { var i = ORDER.indexOf(A.sel) + (+b.getAttribute('data-step')); pick(ORDER[(i + ORDER.length) % ORDER.length]); }; });
      d.querySelectorAll('[data-ask]').forEach(function (b) { b.onclick = function () { chatWith(A.sel, b.getAttribute('data-ask')); }; });
      d.querySelectorAll('[data-chat]').forEach(function (b) { b.onclick = function () { chatWith(A.sel); }; });
      d.querySelectorAll('[data-give]').forEach(function (b) { b.onclick = function () { var k = A.sel; A.tab = 'tasks'; A.mdet = false; draw(); setTimeout(function () { var w = $('tkWho'); if (w && k !== 'ceo') w.value = k; var t = $('tkT'); if (t) t.focus(); }, 60); }; });
      d.querySelectorAll('[data-task]').forEach(function (b) { b.onclick = function () { var t = (A.tk || []).filter(function (x) { return x.id === b.getAttribute('data-task'); })[0]; if (t && t.thread_id) { A.tab = 'chat'; A.agent = t.assignee; A.thread = t.thread_id; lastThread(t.assignee, t.thread_id); A.mdet = false; draw(); } else { A.tab = 'tasks'; A.mdet = false; draw(); } }; });
      d.querySelectorAll('[data-back]').forEach(function (b) { b.onclick = function () { A.mdet = false; root.classList.remove('det'); }; });
      d.querySelectorAll('[data-map]').forEach(function (b) { b.onclick = function () { A.tab = 'map'; draw(); }; });
    }
    root.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { A.grp = b.getAttribute('data-g'); root.querySelectorAll('[data-g]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-g') === A.grp); }); redrawTbl(); }; });
    root.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { A.flt = b.getAttribute('data-f'); root.querySelectorAll('[data-f]').forEach(function (x) { x.classList.toggle('on', x === b); }); redrawTbl(); }; });
    root.querySelectorAll('.aic-rail [data-go],.aic-tiles [data-go]').forEach(function (b) { b.onclick = function () { A.tab = b.getAttribute('data-go'); A.mdet = false; draw(); }; });
    root.querySelectorAll('.aic-mid [data-map]').forEach(function (b) { b.onclick = function () { A.tab = 'map'; draw(); }; });
    var q = $('aicQ'); if (q) q.oninput = function () { A.q = q.value; redrawTbl(); };
    wireRows(); wireDet();
  }
  function consoleView() {
    aicCss();
    if (!A.sel || !AG[A.sel]) A.sel = 'ceo';
    $('aiBody').innerHTML = aicHtml(); aicWire();
    /* the board's tasks, for the picked assistant's list */
    api({ op: 'tasks' }).then(function (r) {
      if (!r || !r.ok || A.tab !== 'board' || !$('aicDet')) return;
      A.tk = r.data || []; var d = $('aicDet'), y = d.scrollTop; d.innerHTML = aicDetail(A.sel); d.scrollTop = y; aicWire();
    });
  }

  function pitch(host) {
    var st = A.st; boardCss(); host = host || area();
    if (!st || !st.ok) { host.innerHTML = '<div class="bpx-panel"><div class="bpx-mut">' + esc((st && st.error) || 'Could not load.') + '</div></div>'; return; }
    host.innerHTML = '<div class="bpx-panel"><div class="ai-hero"><div class="pitch">'
      + '<h2>Your AI Team</h2><div class="bpx-mut" style="max-width:52ch">An AI CEO who manages ten assistants that know your business: leads, customers, marketing, estimates, crews and routes, projects and permits. The CEO hands out tasks and the assistants ask each other. You approve anything before it goes to a customer.</div>'
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
