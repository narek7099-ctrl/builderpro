/* Marketing → Website: traffic on the contractor's OWN website.

   The owner copies a one-line snippet (embed/track.js?u=<owner id>) into
   their site's <head>. It batches page views, time on page and conversions
   (BuilderPro tool opened / completed / lead, tel: and mailto: taps, form
   submits) to the site-track edge function, which writes public.site_events.
   This page reads those rows back under RLS and draws them with the portal's
   chart kit (portal/charts.js).

   Until there is data (demo, signed out, table not created yet, or nothing
   received) it shows realistic example numbers with a notice, the same way
   the dashboard does. Nothing here throws if the table does not exist. */
(function () {
  'use strict';
  var SITE = 'https://builderpro-os.com';
  var VERIFY_URL = 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/site-track';
  var DAY = 864e5;
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };

  var W = { period: '30d', uid: null, uidAsked: false, rows: null, loading: false, loaded: false, missing: false, err: '', platform: 'wordpress', check: null };
  try { var sp = localStorage.getItem('bpWebPeriod'); if (sp === '7d' || sp === '30d' || sp === '90d') W.period = sp; } catch (e) {}
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };

  var PLATFORMS = [
    ['wordpress', 'WordPress', 'Install the free “WPCode” plugin → Code Snippets → Header & Footer → paste into Header → Save.'],
    ['wix', 'Wix', 'Settings → Custom Code → + Add Custom Code → paste, apply to All pages, place in Head → Apply.'],
    ['squarespace', 'Squarespace', 'Settings → Advanced → Code Injection → paste into Header → Save.'],
    ['godaddy', 'GoDaddy', 'Website Builder → Settings → Site-wide code (Head HTML) → paste → Save, then Publish.'],
    ['webflow', 'Webflow', 'Site settings → Custom code → Head code → paste → Save, then Publish the site.'],
    ['shopify', 'Shopify', 'Online Store → Themes → … → Edit code → layout/theme.liquid → paste just before </head> → Save.'],
    ['netlify', 'Netlify', 'Site configuration → Build & deploy → Post processing → Snippet injection → Add snippet → Insert before </head> → paste → Save.'],
    ['github', 'GitHub / code', 'Open your site’s main HTML file (index.html or your layout template), paste just before </head>, commit and deploy.'],
    ['other', 'Other / custom', 'Paste it just before </head> on every page (or in your template’s header), then publish.']
  ];

  function snippet() {
    return '<script async src="' + SITE + '/embed/track.js?u=' + (W.uid || 'YOUR-ACCOUNT-ID') + '"></' + 'script>';
  }

  /* ---------------- data ---------------- */
  function withUid(cb) {
    if (W.uid || W.uidAsked) { cb(W.uid); return; }
    if (!(live() && window.bpSetUser)) { W.uidAsked = true; cb(null); return; }
    Promise.resolve(bpSetUser()).then(function (u) { W.uidAsked = true; W.uid = (u && u.id) || null; cb(W.uid); }, function () { W.uidAsked = true; cb(null); });
  }
  function load() {
    if (!live() || W.loading) return;
    W.loading = true;
    var since = new Date(Date.now() - 180 * DAY).toISOString();
    var q;
    try {
      q = BP_SB.from('site_events').select('ts,session,type,path,referrer,utm_source,utm_medium,device,value')
        .gte('ts', since).order('ts', { ascending: true }).limit(50000);
    } catch (e) { done(null, e); return; }
    Promise.resolve(q).then(function (r) {
      if (r && r.error) done(null, r.error); else done((r && r.data) || [], null);
    }, function (e) { done(null, e); });
    setTimeout(function () { if (W.loading) done(null, { message: 'timeout' }); }, 15000);
  }
  function done(rows, err) {
    if (!W.loading) return;
    W.loading = false; W.loaded = true;
    W.rows = rows;
    W.missing = !!(err && /relation|does not exist|schema cache|404|not found/i.test(String(err.message || err.code || err)));
    W.err = err && !W.missing ? 'Couldn’t load your website numbers right now.' : '';
    if (window._bpCurView === 'website') render();
  }

  /* realistic example traffic: a small contractor site, ~25–60 visits a day,
     busier on weekdays, a little growth, Google-heavy */
  var _example = null;
  function example() {
    if (_example) return _example;
    var seed = 20261001, rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    var pick = function (list) { var t = 0, r = rnd(), i; for (i = 0; i < list.length; i++) t += list[i][1]; r *= t; for (i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return list[i][0]; } return list[0][0]; };
    var PAGES = [['/', 40], ['/roof-replacement', 18], ['/roof-repair', 14], ['/free-estimate', 12], ['/gallery', 9], ['/about', 6], ['/storm-damage', 8], ['/contact', 7], ['/reviews', 5], ['/financing', 4]];
    var SRC = [[{ r: 'google.com' }, 46], [{}, 20], [{ r: 'facebook.com' }, 10], [{ us: 'google', um: 'cpc' }, 8], [{ r: 'yelp.com' }, 5], [{ r: 'nextdoor.com' }, 4], [{ r: 'bing.com' }, 3], [{ r: 'instagram.com' }, 2], [{ r: 'angi.com' }, 2]];
    var DEV = [['mobile', 62], ['desktop', 31], ['tablet', 7]];
    var rows = [], now = Date.now(), start = now - 180 * DAY;
    for (var d = 0; d < 180; d++) {
      var day0 = start + d * DAY, wd = new Date(day0).getDay();
      var base = 26 + d * 0.12, n = Math.round(base * (wd === 0 || wd === 6 ? 0.7 : 1.1) * (0.8 + rnd() * 0.45));
      for (var v = 0; v < n; v++) {
        var sid = 'x' + d + '_' + v, src = pick(SRC), dev = pick(DEV);
        var t = day0 + rnd() * DAY; if (t > now) continue;
        var pages = 1 + Math.floor(rnd() * rnd() * 5);
        var path = pick(PAGES);
        for (var p = 0; p < pages; p++) {
          rows.push({ ts: t, session: sid, type: 'pageview', path: path, referrer: p ? null : src.r || null, utm_source: src.us || null, utm_medium: src.um || null, device: dev });
          rows.push({ ts: t + 1000, session: sid, type: 'time', path: path, device: dev, value: { sec: Math.round(15 + rnd() * rnd() * 240) } });
          t += 30000 + rnd() * 120000; path = pick(PAGES);
        }
        if (rnd() < 0.21) {
          rows.push({ ts: t, session: sid, type: 'tool_open', device: dev, value: { tool: pick([['quote', 6], ['health', 2], ['damage', 2]]) } });
          if (rnd() < 0.27) rows.push({ ts: t + 60000, session: sid, type: 'lead', device: dev, value: { tool: 'quote' } });
        }
        if (rnd() < 0.022) rows.push({ ts: t, session: sid, type: 'call_click', device: dev });
        if (rnd() < 0.006) rows.push({ ts: t, session: sid, type: 'form_submit', device: dev });
      }
    }
    _example = rows;
    return rows;
  }

  /* ---------------- numbers ---------------- */
  var LEAD_TYPES = { lead: 1, call_click: 1, email_click: 1, form_submit: 1 };
  function srcOf(e) {
    var u = String(e.utm_source || '').toLowerCase(), m = String(e.utm_medium || '').toLowerCase(), r = String(e.referrer || '').toLowerCase();
    var key = u || r;
    if (!key) return 'Direct';
    if (/google|gclid|^g$/.test(key)) return /cpc|ppc|paid|ads/.test(m) ? 'Google Ads' : 'Google';
    if (/facebook|^fb$|fb\.com|fb\.me/.test(key)) return 'Facebook';
    if (/instagram|^ig$/.test(key)) return 'Instagram';
    if (/bing/.test(key)) return 'Bing';
    if (/yahoo|duckduckgo|ecosia|search\.brave/.test(key)) return 'Other search';
    if (/yelp/.test(key)) return 'Yelp';
    if (/nextdoor/.test(key)) return 'Nextdoor';
    if (/angi|homeadvisor|thumbtack|houzz|porch/.test(key)) return 'Lead sites';
    if (/tiktok/.test(key)) return 'TikTok';
    if (/youtube/.test(key)) return 'YouTube';
    if (/mail|newsletter|email/.test(key + m)) return 'Email';
    if (/builderpro/.test(key)) return 'BuilderPro links';
    return key.replace(/^www\./, '').slice(0, 32);
  }
  function periodDef(k) {
    var n = k === '7d' ? 7 : k === '90d' ? 90 : 30, now = Date.now();
    var bucket = k === '90d' ? 7 : 1, nb = Math.ceil(n / bucket);
    var end = new Date(); end.setHours(24, 0, 0, 0);
    var start = end.getTime() - nb * bucket * DAY;
    var buckets = [];
    for (var i = 0; i < nb; i++) {
      var a = start + i * bucket * DAY, d = new Date(a);
      buckets.push({ start: a, end: a + bucket * DAY, label: d.toLocaleDateString('en-US', bucket === 1 && n === 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }) });
    }
    return { k: k, n: n, start: start, end: end.getTime(), pStart: start - (end.getTime() - start), now: now, buckets: buckets, word: 'last ' + n + ' days', vs: 'the ' + n + ' days before', by: bucket === 1 ? 'by day' : 'by week' };
  }
  function stats(rows, a, b) {
    var sess = {}, pv = 0, tsum = 0, tn = 0, leads = {}, tools = {}, toolLeads = {}, pages = {}, src = {}, dev = {};
    rows.forEach(function (e) {
      var t = typeof e.ts === 'number' ? e.ts : Date.parse(e.ts);
      if (!(t >= a && t < b)) return;
      var s = e.session || '?';
      if (e.type === 'pageview') {
        pv++;
        if (!sess[s]) { sess[s] = 1; var so = srcOf(e); src[so] = (src[so] || 0) + 1; var dv = e.device || 'desktop'; dev[dv] = (dev[dv] || 0) + 1; }
        var p = e.path || '/'; pages[p] = (pages[p] || 0) + 1;
      } else if (e.type === 'time') { var sec = +((e.value || {}).sec) || 0; if (sec > 0) { tsum += sec; tn++; } }
      else if (e.type === 'tool_open') tools[s] = 1;
      if (LEAD_TYPES[e.type]) { leads[s] = 1; if (e.type === 'lead') toolLeads[s] = 1; }
    });
    var visitors = Object.keys(sess).length, nLeads = Object.keys(leads).length;
    return { visitors: visitors, pv: pv, avg: tn ? tsum / tn : 0, leads: nLeads, conv: visitors ? nLeads / visitors * 100 : 0,
      tools: Object.keys(tools).length, toolLeads: Object.keys(toolLeads).length, pages: pages, src: src, dev: dev };
  }
  function series(rows, P) {
    var out = { visitors: [], pv: [], avg: [], leads: [], conv: [] };
    P.buckets.forEach(function (bk) {
      var s = stats(rows, bk.start, bk.end);
      out.visitors.push(s.visitors); out.pv.push(s.pv); out.avg.push(Math.round(s.avg)); out.leads.push(s.leads); out.conv.push(Math.round(s.conv * 10) / 10);
    });
    return out;
  }

  /* ---------------- view ---------------- */
  var fmtTime = function (sec) { sec = Math.round(+sec || 0); if (sec < 60) return sec + 's'; return Math.floor(sec / 60) + 'm ' + (sec % 60 ? (sec % 60) + 's' : ''); };
  var num = function (n) { return (Math.round(+n || 0)).toLocaleString('en-US'); };
  var pct = function (n) { return (Math.round((+n || 0) * 10) / 10) + '%'; };

  function installCard(hasData) {
    var pl = PLATFORMS.filter(function (p) { return p[0] === W.platform; })[0] || PLATFORMS[0];
    var ck = W.check;
    var status = ck ? '<div class="ws-check ' + (ck.ok ? 'ok' : ck.wait ? '' : 'no') + '"><span class="ms">' + (ck.ok ? 'check_circle' : ck.wait ? 'hourglass_top' : 'error') + '</span><span>' + esc(ck.msg) + '</span></div>' : '';
    var acts = '<div class="ws-acts">'
      + '<button class="bpx-btn ws-copy" id="ws-copy" data-copy="' + esc(snippet()) + '" onclick="bpWebCopy(this)"' + (W.uid ? '' : ' title="Sign in to get your own snippet"') + '><span class="ms">content_copy</span> Copy snippet</button>'
      + '<button class="bpx-btn ghost ws-btn" onclick="bpWebCheck()"><span class="ms">wifi_tethering</span> Check installation</button>'
      + '</div>';
    if (hasData && !ck) {
      return '<div class="bpx-panel ws-inst ws-compact"><div class="ws-inst-h"><span class="ms ws-ok">check_circle</span><div><b>Tracking is on</b><div class="bpx-mut">Your site is sending visits. No cookies, no personal data.</div></div></div>' + acts + '</div>';
    }
    return '<div class="bpx-panel ws-inst">'
      + '<div class="ws-inst-h"><span class="ms ws-ic">insights</span><div><b>Track visits to your own website</b>'
      + '<div class="bpx-mut">Copy one line into your site’s &lt;head&gt;. It counts visits, where they came from, calls and form fills, and who opened your calculators. No cookies, no personal data.</div></div></div>'
      + acts
      + '<div class="ws-plat"><label for="ws-plat">Where is your site built?</label><select id="ws-plat" onchange="bpWebPlatform(this.value)">'
      + PLATFORMS.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === W.platform ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('')
      + '</select><div class="ws-tip"><span class="ms">tips_and_updates</span><span>' + esc(pl[2]) + '</span></div></div>'
      + status
      + (W.uid ? '' : '<div class="bpx-mut" style="font-size:12px;margin-top:8px">Sign in and the snippet carries your account id, so visits land in your account.</div>')
      + '</div>';
  }

  function tiles(cur, prev, S, P) {
    var labels = P.buckets.map(function (b) { return b.label; });
    var t = function (lbl, key, val, sub, vals, fmt, o) {
      o = o || {};
      return '<div class="bpx-panel db-st ws-st"><div class="db-st-h"><span class="db-kl">' + lbl + '</span>'
        + bpChart.delta(prev[key], cur[key], { upIsGood: o.upIsGood, vs: P.vs }) + '</div>'
        + '<div class="db-kv' + (o.tone ? ' ' + o.tone : '') + '">' + val + '</div><div class="db-ks">' + sub + '</div>'
        + bpChart.spark(vals, { fmt: fmt, labels: labels }) + '</div>';
    };
    return '<div class="ws-kpis">'
      + t('Visitors', 'visitors', num(cur.visitors), P.word, S.visitors, function (v) { return num(v) + ' visitors'; })
      + t('Page views', 'pv', num(cur.pv), (cur.visitors ? (cur.pv / cur.visitors).toFixed(1) : '0') + ' per visit', S.pv, function (v) { return num(v) + ' views'; })
      + t('Avg time', 'avg', fmtTime(cur.avg), 'on a page', S.avg, fmtTime)
      + t('Leads from site', 'leads', num(cur.leads), 'calls, forms, tool leads', S.leads, function (v) { return num(v) + ' leads'; }, { tone: 'blue' })
      + t('Conversion rate', 'conv', pct(cur.conv), 'visitors who became leads', S.conv, pct)
      + '</div>';
  }

  function body() {
    var real = W.rows && W.rows.length ? W.rows : null;
    var rows = real || example();
    var P = periodDef(W.period);
    var cur = stats(rows, P.start, P.end), prev = stats(rows, P.pStart, P.start), S = series(rows, P);
    var C = bpChart, count = C.NAMED.count;
    var labels = P.buckets.map(function (b) { return b.label; });
    var per = '<div class="db-per" role="group" aria-label="Period">' + [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']].map(function (p) {
      return '<button class="' + (p[0] === W.period ? 'on' : '') + '" aria-pressed="' + (p[0] === W.period) + '" onclick="bpWebPeriod(\'' + p[0] + '\')">' + p[1] + '</button>';
    }).join('') + '</div>';
    var note = '';
    if (!real) {
      note = '<div class="sp-note warn"><span class="ms">science</span>'
        + (W.missing ? 'Example numbers, so you can see how it looks. Website tracking is being switched on for your account — copy the snippet now and your visits show up here once it is.'
          : live() ? 'Example numbers, so you can see how it looks. Paste the snippet into your site and your real visits replace these within a minute.'
            : 'Example numbers, so you can see how it looks. Sign in and add the snippet to your site to see your own.')
        + '</div>';
    }
    if (W.err) note += '<div class="sp-note bad"><span class="ms">error</span>' + esc(W.err) + '</div>';

    var area = '<div class="bpx-panel">' + C.area({ title: 'Visitors over time', lead: P.by + ' · ' + P.word, x: { label: P.by === 'by day' ? 'Day' : 'Week of', values: labels },
      series: [{ name: 'Visitors', values: S.visitors }], fmt: count, fmtKind: 'count', height: 210 }) + '</div>';
    var pageRows = Object.keys(cur.pages).map(function (k) { return { label: k, value: cur.pages[k] }; });
    var pagesC = '<div class="bpx-panel">' + (pageRows.length ? C.ranked({ title: 'Top pages', lead: 'page views · ' + P.word, rows: pageRows, fmt: count, max: 8 })
      : C.empty({ title: 'Top pages', empty: 'No page views ' + P.word + '.' })) + '</div>';
    var srcRows = Object.keys(cur.src).map(function (k) { return { label: k, value: cur.src[k] }; });
    var srcC = '<div class="bpx-panel">' + (srcRows.length ? C.ranked({ title: 'Traffic sources', lead: 'visits by where they came from', rows: srcRows, fmt: count, max: 8 })
      : C.empty({ title: 'Traffic sources', empty: 'No visits ' + P.word + '.' })) + '</div>';
    var DN = { mobile: 'Phone', desktop: 'Computer', tablet: 'Tablet' };
    var devRows = Object.keys(cur.dev).map(function (k) { return { label: DN[k] || k, value: cur.dev[k] }; });
    var devC = '<div class="bpx-panel">' + (devRows.length ? C.donut({ title: 'Devices', lead: 'visits · ' + P.word, rows: devRows, fmt: count, centre: num(cur.visitors), centreNote: 'visits', fixed: true })
      : C.empty({ title: 'Devices', empty: 'No visits ' + P.word + '.' })) + '</div>';
    var funC = '<div class="bpx-panel">' + (cur.visitors ? C.funnel({ title: 'Calculator funnel', lead: 'visits → opened one of your tools → left their details',
      steps: [{ label: 'Visits', value: cur.visitors }, { label: 'Opened a tool', value: cur.tools }, { label: 'Lead', value: cur.toolLeads }], fmt: count })
      : C.empty({ title: 'Calculator funnel', empty: 'Once people visit, you see how many open your calculator and how many become leads.' }))
      + '<div class="bpx-mut ws-fnote">Counts tools from My Calculators embedded on your site. <a href="#" onclick="bpNav(\'calculator\');return false">Get the embed code</a></div></div>';

    return installCard(!!real) + note + per + tiles(cur, prev, S, P)
      + '<div class="db-grid ws-grid">'
      + '<div class="db-c12">' + area + '</div>'
      + '<div class="ws-c6">' + pagesC + '</div><div class="ws-c6">' + srcC + '</div>'
      + '<div class="ws-c6">' + devC + '</div><div class="ws-c6">' + funC + '</div>'
      + '</div>';
  }

  function render() {
    var area = $('bpxViewArea'); if (!area) return;
    area.innerHTML = '<div class="ws-page">' + (window.BP_WEB_G ? BP_WEB_G.page(body) : body()) + '</div>';
    if (window.bpSpin) bpSpin(false);
  }

  window.bpWebsite = function () {
    css();
    if (window.BP_WEB_G) BP_WEB_G.start();
    withUid(function () {
      if (window._bpCurView !== 'website') return;
      if (live() && !W.loaded) {
        render();
        load();
      } else render();
    });
    /* first paint without waiting on the session */
    if (!W.uidAsked) render();
  };
  window.bpWebPeriod = function (k) { W.period = k; try { localStorage.setItem('bpWebPeriod', k); } catch (e) {} render(); };
  window.bpWebPlatform = function (k) { W.platform = k; render(); };
  window.bpWebCopy = function (btn) {
    if (!W.uid && live()) { withUid(function () { btn.setAttribute('data-copy', snippet()); if (window.bpToolCopyStr) bpToolCopyStr(btn); }); return; }
    if (!W.uid) { alert('Sign in to get your own snippet. The one shown here is only an example.'); return; }
    if (window.bpToolCopyStr) bpToolCopyStr(btn);
    else { try { navigator.clipboard.writeText(snippet()); } catch (e) { prompt('Copy this:', snippet()); } }
  };
  /* "is it installed?": the newest row we can see, else the function's own verify */
  window.bpWebCheck = function () {
    if (!live() || !W.uid) { W.check = { ok: false, msg: 'Sign in first — the check looks for visits sent with your account id.' }; render(); return; }
    W.check = { wait: true, msg: 'Checking for visits from your site…' }; render();
    var ago = function (t) { var m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
    var finish = function (row) {
      W.check = row ? { ok: true, msg: 'Installed — last visit ' + ago(row.ts) + (row.path ? ' on ' + row.path : '') + '.' }
        : { ok: false, msg: 'Nothing received yet. Paste the snippet, publish, open your site once in a new tab, then check again.' };
      if (row) { W.loaded = false; load(); }
      render();
    };
    var viaFn = function () {
      Promise.resolve(fetch(VERIFY_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ op: 'verify', u: W.uid }) }))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { finish(d && d.installed ? { ts: d.last_seen, path: d.path } : null); }, function () { finish(null); });
    };
    try {
      Promise.resolve(BP_SB.from('site_events').select('ts,path').order('ts', { ascending: false }).limit(1))
        .then(function (r) { if (r && r.error) viaFn(); else finish(r && r.data && r.data[0]); }, viaFn);
    } catch (e) { viaFn(); }
  };

  function css() {
    if ($('ws-css')) return;
    var st = document.createElement('style'); st.id = 'ws-css';
    st.textContent = ''
      + '#bpx .ws-inst{padding:20px 22px;margin-bottom:14px}'
      + '#bpx .ws-inst-h{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}'
      + '#bpx .ws-inst-h b{font-size:16px;color:var(--ink)}#bpx .ws-inst-h .bpx-mut{font-size:13px;margin-top:3px;line-height:1.5;max-width:640px}'
      + '#bpx .ws-ic{width:40px;height:40px;flex:none;border-radius:12px;display:grid;place-items:center;background:var(--blue-soft,#eaf2ff);color:var(--blue)}'
      + '#bpx .ws-ok{color:#15803d;font-size:26px}'
      + '#bpx .ws-compact{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px}#bpx .ws-compact .ws-inst-h{margin:0}'
      + '#bpx .ws-acts{display:flex;gap:8px;flex-wrap:wrap}'
      + '#bpx .ws-acts .bpx-btn{width:auto;margin:0;display:inline-flex;align-items:center;gap:6px;padding:10px 16px;font-size:14px}'
      + '#bpx .ws-acts .ms{font-size:18px}'
      + '#bpx .ws-plat{margin-top:16px;display:grid;grid-template-columns:auto minmax(0,220px);gap:8px 12px;align-items:center}'
      + '#bpx .ws-plat label{font-size:13px;font-weight:600;color:var(--ink)}'
      + '#bpx .ws-plat select{padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);font:inherit;font-size:13.5px}'
      + '#bpx .ws-tip{grid-column:1/-1;display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--grey);line-height:1.5}#bpx .ws-tip .ms{font-size:17px;color:var(--blue);margin-top:1px}'
      + '#bpx .ws-check{display:flex;gap:8px;align-items:center;margin-top:14px;font-size:13px;padding:9px 12px;border-radius:10px;background:var(--soft);color:var(--ink)}'
      + '#bpx .ws-check .ms{font-size:18px}#bpx .ws-check.ok{background:#f0fdf4;color:#14532d}#bpx .ws-check.no{background:#fff7ed;color:#92400e}'
      + '#bpx.bpx-dark .ws-check.ok{background:rgba(21,128,61,.16);color:#86efac}#bpx.bpx-dark .ws-check.no{background:rgba(245,158,11,.14);color:#fcd34d}'
      + '#bpx .ws-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:8px}'
      + '#bpx .ws-st{cursor:default}#bpx .ws-st .db-kv{font-size:30px}'
      + '#bpx .ws-grid .ws-c6{grid-column:span 6}'
      + '#bpx .ws-fnote{font-size:12px;margin-top:10px}#bpx .ws-fnote a{color:var(--blue)}'
      + '@media(max-width:1180px){#bpx .ws-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}'
      + '@media(max-width:760px){#bpx .ws-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#bpx .ws-grid .ws-c6{grid-column:span 12}#bpx .ws-plat{grid-template-columns:1fr}#bpx .ws-st .db-kv{font-size:26px}}'
      + '@media(max-width:380px){#bpx .ws-kpis{grid-template-columns:1fr}}';
    document.head.appendChild(st);
  }

  /* exposed for tests */
  window.BP_WEB = { stats: stats, srcOf: srcOf, example: example, state: W, render: render, periodDef: periodDef, num: num, pct: pct, fmtTime: fmtTime, esc: esc, live: live };
})();

/* ---------------- Google Analytics + Search Console (primary source) ----------------
   "Sign in with Google" through the google-analytics edge function. The function
   holds the (encrypted) refresh token; this page only ever sees numbers.
   States: function not configured → snippet page exactly as before.
           configured, not connected → Google connect card above the snippet page.
           connected → source switch (Google Analytics / BuilderPro snippet),
           property + site picker, then the GA dashboard + "Google Search". */
(function () {
  'use strict';
  var B = window.BP_WEB; if (!B) return;
  var esc = B.esc, num = B.num, pct = B.pct, fmtTime = B.fmtTime, W = B.state;
  var FN = (window.BP_URL || 'https://ttzwzouhiwdwamuimhpo.supabase.co') + '/functions/v1/google-analytics';
  var G = { st: null, asked: false, src: null, props: null, propsLoading: false, rep: {}, repLoading: {}, err: '', menu: false, busy: false, flash: '', picking: false };
  try { var ss = localStorage.getItem('bpWebSrc'); if (ss === 'google' || ss === 'snippet') G.src = ss; } catch (e) {}

  /* came back from Google's consent screen */
  (function () {
    var m = /[?&]google=(connected|cancelled|error)\b/.exec(location.search);
    if (!m) return;
    G.flash = m[1]; if (m[1] === 'connected') G.src = 'google';
    try { var u = new URL(location.href); u.searchParams.delete('google'); history.replaceState(null, '', u.toString()); } catch (e) {}
    var tries = 0, go = function () {
      if (document.getElementById('bpxViewArea') && typeof window.bpNav === 'function') { try { bpNav('website'); } catch (e) {} return; }
      if (++tries < 40) setTimeout(go, 250);
    };
    setTimeout(go, 400);
  })();

  function api(body) {
    var tokP = (window.BP_SB && BP_SB.auth && BP_SB.auth.getSession) ? Promise.resolve(BP_SB.auth.getSession()).then(function (s) { return (s && s.data && s.data.session && s.data.session.access_token) || ''; }, function () { return ''; }) : Promise.resolve('');
    var anon = window.BP_ANON || '';
    return tokP.then(function (tok) {
      return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: 'Bearer ' + (tok || anon) }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Bad response (' + r.status + ')' }; }); });
    }).catch(function () { return { ok: false, error: 'network' }; });
  }
  var rerender = function () { if (window._bpCurView === 'website') B.render(); };
  var connected = function () { return !!(G.st && G.st.configured && G.st.connected); };
  var useGoogle = function () { return connected() && G.src !== 'snippet'; };
  var rangeN = function () { return W.period === '7d' ? 7 : W.period === '90d' ? 90 : 30; };

  function start() {
    if (G.asked) { if (useGoogle()) ensure(); return; }
    G.asked = true;
    api({ op: 'status' }).then(function (d) {
      G.st = d && d.ok ? d : { configured: false, connected: false };
      if (connected() && !G.src) G.src = 'google';
      if (useGoogle()) ensure();
      rerender();
    });
  }
  function ensure() {
    var st = G.st;
    if (!st.ga_property && !st.gsc_site) { G.picking = true; }
    if (G.picking) { loadProps(); return; }
    loadReport(rangeN());
  }
  function loadProps() {
    if (G.props || G.propsLoading) return;
    G.propsLoading = true;
    api({ op: 'properties' }).then(function (d) {
      G.propsLoading = false;
      if (d && d.ok) G.props = d; else { G.props = { ga: [], gsc: [] }; G.err = errText(d); }
      rerender();
    });
  }
  function loadReport(n) {
    if (G.rep[n] || G.repLoading[n]) return;
    G.repLoading[n] = true;
    api({ op: 'report', range: n }).then(function (d) {
      G.repLoading[n] = false;
      if (d && d.ok) { G.rep[n] = d; G.err = ''; } else G.err = errText(d);
      rerender();
    });
  }
  function errText(d) {
    var e = (d && (d.error || d.message)) || 'unknown';
    if (e === 'reconnect') return 'Google access was removed. Disconnect and connect again.';
    if (e === 'not_configured') return 'Google sign-in is not set up on BuilderPro yet.';
    if (e === 'sign in required') return 'Sign in to use Google Analytics.';
    return 'Google said: ' + e;
  }

  /* ---------- pieces ---------- */
  var GLOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  var gBtn = function () { return '<button class="ws-gbtn" id="ws-gbtn" onclick="bpWebGoogle()"' + (G.busy ? ' disabled' : '') + '><span class="ws-glogo">' + GLOGO + '</span><span>' + (G.busy ? 'Opening Google…' : 'Sign in with Google') + '</span></button>'; };

  function flash() {
    if (!G.flash) return '';
    var f = G.flash; G.flash = '';
    if (f === 'connected') return '<div class="sp-note ok ws-gflash"><span class="ms">check_circle</span>Google is connected. Pick the website below.</div>';
    if (f === 'cancelled') return '<div class="sp-note warn ws-gflash"><span class="ms">info</span>Google sign-in was cancelled. Nothing was connected.</div>';
    return '<div class="sp-note bad ws-gflash"><span class="ms">error</span>Couldn’t connect Google. Please try again.</div>';
  }

  function connectCard() {
    return '<div class="bpx-panel ws-gcard"><div class="ws-gcard-t"><div class="ws-gic">' + GLOGO.replace(/18/g, '26') + '</div><div>'
      + '<b>See your Google Analytics and Google Search numbers here</b>'
      + '<div class="bpx-mut">Sign in with the Google account that runs your website’s Analytics or Search Console. BuilderPro only <b>reads</b> your numbers. It can’t change anything, and you can disconnect any time.</div></div></div>'
      + '<div class="ws-gcard-a">' + gBtn() + '<span class="bpx-mut ws-gor">No Google Analytics? Use the BuilderPro snippet below.</span></div></div>';
  }

  function switcher() {
    var s = useGoogle() ? 'google' : 'snippet';
    var email = G.st && G.st.email ? esc(G.st.email) : 'Google account';
    return '<div class="ws-srcbar"><div class="db-per ws-src" role="group" aria-label="Data source">'
      + '<button class="' + (s === 'google' ? 'on' : '') + '" aria-pressed="' + (s === 'google') + '" onclick="bpWebSrc(\'google\')">Google Analytics</button>'
      + '<button class="' + (s === 'snippet' ? 'on' : '') + '" aria-pressed="' + (s === 'snippet') + '" onclick="bpWebSrc(\'snippet\')">BuilderPro snippet</button></div>'
      + '<div class="ws-gacct"><span class="ws-gdot"></span><span class="ws-gmail" title="' + email + '">' + email + '</span>'
      + '<button class="ws-kebab" aria-label="Google options" aria-expanded="' + G.menu + '" onclick="bpWebGMenu(event)"><span class="ms">more_vert</span></button>'
      + (G.menu ? '<div class="ws-menu" role="menu"><button role="menuitem" onclick="bpWebGPick()"><span class="ms">tune</span>Change website</button>'
        + '<button role="menuitem" onclick="bpWebGRefresh()"><span class="ms">refresh</span>Refresh numbers</button>'
        + '<button role="menuitem" class="bad" onclick="bpWebGDisconnect()"><span class="ms">link_off</span>Disconnect Google</button></div>' : '')
      + '</div></div>';
  }

  function picker() {
    var P = G.props;
    if (!P) return '<div class="bpx-panel ws-pick"><div class="bpx-mut"><span class="ms ws-spin">progress_activity</span> Finding your Google Analytics properties and Search Console sites…</div></div>';
    var st = G.st || {};
    var ga = P.ga || [], gsc = P.gsc || [];
    var gaSel = '<select id="ws-gaprop"><option value="">— None —</option>' + ga.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === st.ga_property || (!st.ga_property && ga.length === 1) ? ' selected' : '') + '>' + esc(p.name) + ' · ' + esc(p.account) + '</option>';
    }).join('') + '</select>';
    var gscSel = '<select id="ws-gscsite"><option value="">— None —</option>' + gsc.map(function (s) {
      return '<option value="' + esc(s.site) + '"' + (s.site === st.gsc_site || (!st.gsc_site && gsc.length === 1) ? ' selected' : '') + '>' + esc(s.site.replace(/^sc-domain:/, '') + (/^sc-domain:/.test(s.site) ? ' (whole domain)' : '')) + '</option>';
    }).join('') + '</select>';
    return '<div class="bpx-panel ws-pick"><b>Which website should we show?</b>'
      + '<div class="ws-pick-g"><label for="ws-gaprop">Google Analytics property</label>' + gaSel
      + (ga.length ? '' : '<div class="ws-pick-n">No GA4 properties on this Google account' + (P.ga_error ? ' (' + esc(P.ga_error) + ')' : '') + '.</div>')
      + '<label for="ws-gscsite">Search Console site</label>' + gscSel
      + (gsc.length ? '' : '<div class="ws-pick-n">No verified Search Console sites on this account' + (P.gsc_error ? ' (' + esc(P.gsc_error) + ')' : '') + '.</div>')
      + '</div><div class="ws-acts"><button class="bpx-btn" onclick="bpWebGSave()"><span class="ms">check</span> Show my numbers</button>'
      + (st.ga_property || st.gsc_site ? '<button class="bpx-btn ghost" onclick="bpWebGCancelPick()">Cancel</button>' : '') + '</div></div>';
  }

  /* group GA/GSC daily rows into the page's buckets */
  function bucketize(P, rows, get, how) {
    return P.buckets.map(function (bk) {
      var sum = 0, n = 0;
      rows.forEach(function (r) { var t = Date.parse(r.date + 'T12:00:00'); if (t >= bk.start && t < bk.end) { sum += get(r); n++; } });
      return how === 'avg' ? (n ? sum / n : 0) : sum;
    });
  }

  /* Google data stops at yesterday (Search Console ~2 days back): drop the
     trailing buckets that have no data yet so lines don't dive to zero */
  function trimP(P, rows) {
    var last = 0; rows.forEach(function (r) { var t = Date.parse(r.date + 'T12:00:00'); if (t > last) last = t; });
    if (!last) return P;
    var Q = {}; for (var k in P) Q[k] = P[k];
    Q.buckets = P.buckets.filter(function (b) { return b.start <= last; });
    return Q.buckets.length > 1 ? Q : P;
  }
  function gaSection(rep, P) {
    var C = bpChart, count = C.NAMED.count;
    var labels = P.buckets.map(function (b) { return b.label; });
    var ga = rep.ga;
    if (!ga) return '<div class="sp-note warn"><span class="ms">info</span>No Google Analytics property picked. <a href="#" onclick="bpWebGPick();return false">Pick one</a> to see visitors.</div>';
    if (ga.error) return '<div class="sp-note bad"><span class="ms">error</span>Google Analytics: ' + esc(ga.error) + '</div>';
    var t = ga.totals || {}, p = ga.previous || {}, by = ga.byDate || [];
    P = trimP(P, by); labels = P.buckets.map(function (b) { return b.label; });
    var S = {
      users: bucketize(P, by, function (r) { return r.users; }), views: bucketize(P, by, function (r) { return r.views; }),
      avg: bucketize(P, by, function (r) { return r.avg; }, 'avg'), ke: bucketize(P, by, function (r) { return r.keyEvents; })
    };
    var tile = function (lbl, cur, prev, val, sub, vals, fmt, tone) {
      return '<div class="bpx-panel db-st ws-st"><div class="db-st-h"><span class="db-kl">' + lbl + '</span>' + C.delta(prev, cur, { vs: P.vs }) + '</div>'
        + '<div class="db-kv' + (tone ? ' ' + tone : '') + '">' + val + '</div><div class="db-ks">' + sub + '</div>' + C.spark(vals, { fmt: fmt, labels: labels }) + '</div>';
    };
    var kpis = '<div class="ws-kpis ws-k4">'
      + tile('Visitors', t.users, p.users, num(t.users), P.word, S.users, function (v) { return num(v) + ' visitors'; })
      + tile('Page views', t.views, p.views, num(t.views), (t.users ? (t.views / t.users).toFixed(1) : '0') + ' per visitor', S.views, function (v) { return num(v) + ' views'; })
      + tile('Avg visit', t.avg, p.avg, fmtTime(t.avg), 'time per visit', S.avg, fmtTime)
      + tile('Key events', t.keyEvents, p.keyEvents, num(t.keyEvents), 'calls, forms, goals you set in GA', S.ke, function (v) { return num(v) + ' events'; }, 'blue')
      + '</div>';
    var area = '<div class="bpx-panel">' + C.area({ title: 'Visitors over time', lead: P.by + ' · ' + P.word, x: { label: P.by === 'by day' ? 'Day' : 'Week of', values: labels },
      series: [{ name: 'Visitors', values: S.users }], fmt: count, fmtKind: 'count', height: 210 }) + '</div>';
    var pages = (ga.pages || []).map(function (r) { return { label: r.path, value: r.views }; });
    var pagesC = '<div class="bpx-panel">' + (pages.length ? C.ranked({ title: 'Top pages', lead: 'page views · ' + P.word, rows: pages, fmt: count, max: 8 }) : C.empty({ title: 'Top pages', empty: 'No page views ' + P.word + '.' })) + '</div>';
    var src = (ga.sources || []).map(function (r) { return { label: r.source || '(not set)', value: r.sessions }; });
    var srcC = '<div class="bpx-panel">' + (src.length ? C.ranked({ title: 'Traffic sources', lead: 'visits by channel · ' + P.word, rows: src, fmt: count, max: 8 }) : C.empty({ title: 'Traffic sources', empty: 'No visits ' + P.word + '.' })) + '</div>';
    var DN = { mobile: 'Phone', desktop: 'Computer', tablet: 'Tablet' };
    var dev = (ga.devices || []).map(function (r) { return { label: DN[r.device] || r.device, value: r.users }; });
    var devC = '<div class="bpx-panel">' + (dev.length ? C.donut({ title: 'Devices', lead: 'visitors · ' + P.word, rows: dev, fmt: count, centre: num(t.users), centreNote: 'visitors', fixed: true }) : C.empty({ title: 'Devices', empty: 'No visits ' + P.word + '.' })) + '</div>';
    return kpis + '<div class="db-grid ws-grid"><div class="db-c12">' + area + '</div>'
      + '<div class="ws-c6">' + pagesC + '</div><div class="ws-c6">' + srcC + '</div>'
      + '<div class="ws-c6">' + devC + '</div><div class="ws-c6">' + funnel(P) + '</div></div>';
  }

  /* calculator funnel still comes from the snippet's events */
  function funnel(P) {
    var C = bpChart, count = C.NAMED.count;
    var real = W.rows && W.rows.length ? W.rows : null;
    if (!real) return C.empty({ title: 'Calculator leads', empty: 'Google Analytics can’t see who opens your BuilderPro calculators. Add the BuilderPro snippet to your site to also see calculator leads here.' })
      + '<div class="bpx-mut ws-fnote"><a href="#" onclick="bpWebSrc(\'snippet\');return false">Get the snippet</a></div>';
    var cur = B.stats(real, P.start, P.end);
    return (cur.visitors ? C.funnel({ title: 'Calculator funnel', lead: 'from the BuilderPro snippet · ' + P.word,
      steps: [{ label: 'Visits', value: cur.visitors }, { label: 'Opened a tool', value: cur.tools }, { label: 'Lead', value: cur.toolLeads }], fmt: count })
      : C.empty({ title: 'Calculator funnel', empty: 'No snippet visits ' + P.word + '.' }));
  }

  function gscSection(rep, P) {
    var C = bpChart, count = C.NAMED.count;
    var g = rep.gsc;
    var head = '<div class="ws-sech"><span class="ms">search</span><div><b>Google Search</b><div class="bpx-mut">How people find you on Google · from Search Console (about 2 days behind)</div></div></div>';
    if (!g) return head + '<div class="sp-note warn"><span class="ms">info</span>No Search Console site picked. <a href="#" onclick="bpWebGPick();return false">Pick one</a> to see searches.</div>';
    if (g.error) return head + '<div class="sp-note bad"><span class="ms">error</span>Search Console: ' + esc(g.error) + '</div>';
    var t = g.totals || {}, p = g.previous || {}, by = g.byDate || [];
    P = trimP(P, by);
    var labels = P.buckets.map(function (b) { return b.label; });
    var clicks = bucketize(P, by, function (r) { return r.clicks; }), impr = bucketize(P, by, function (r) { return r.impressions; });
    var ctrS = clicks.map(function (c, i) { return impr[i] ? c / impr[i] * 100 : 0; });
    var tile = function (lbl, cur, prev, val, sub, vals, fmt, up) {
      return '<div class="bpx-panel db-st ws-st"><div class="db-st-h"><span class="db-kl">' + lbl + '</span>' + C.delta(prev, cur, { vs: P.vs, upIsGood: up }) + '</div>'
        + '<div class="db-kv">' + val + '</div><div class="db-ks">' + sub + '</div>' + (vals ? C.spark(vals, { fmt: fmt, labels: labels }) : '') + '</div>';
    };
    var kpis = '<div class="ws-kpis ws-k4">'
      + tile('Clicks', t.clicks, p.clicks, num(t.clicks), 'from Google search', clicks, function (v) { return num(v) + ' clicks'; })
      + tile('Impressions', t.impressions, p.impressions, num(t.impressions), 'times you showed up', impr, function (v) { return num(v) + ' impressions'; })
      + tile('Click rate', t.ctr, p.ctr, pct(t.ctr), 'of people who saw you clicked', ctrS, pct)
      + tile('Avg position', t.position, p.position, (Math.round((+t.position || 0) * 10) / 10).toFixed(1), 'lower is better (1 = top)', null, null, false)
      + '</div>';
    var area = '<div class="bpx-panel">' + C.area({ title: 'Clicks from Google over time', lead: P.by + ' · ' + P.word, x: { label: P.by === 'by day' ? 'Day' : 'Week of', values: labels },
      series: [{ name: 'Clicks', values: clicks }], fmt: count, fmtKind: 'count', height: 190 }) + '</div>';
    var q = g.queries || [];
    var table = '<div class="bpx-panel"><div class="ws-tt"><b>Top searches</b><span class="bpx-mut">what people typed before finding you · ' + P.word + '</span></div>'
      + (q.length ? '<div class="ws-tw"><table class="ws-tbl"><thead><tr><th>Search</th><th>Clicks</th><th>Shown</th><th class="ws-hide-s">Click rate</th><th class="ws-hide-s">Position</th></tr></thead><tbody>'
        + q.map(function (r) { return '<tr><td>' + esc(r.query) + '</td><td>' + num(r.clicks) + '</td><td>' + num(r.impressions) + '</td><td class="ws-hide-s">' + pct(r.ctr) + '</td><td class="ws-hide-s">' + (Math.round(r.position * 10) / 10).toFixed(1) + '</td></tr>'; }).join('')
        + '</tbody></table></div>' : '<div class="bpx-mut">No searches ' + P.word + ' yet.</div>') + '</div>';
    return head + kpis + '<div class="db-grid ws-grid"><div class="ws-c6">' + table + '</div><div class="ws-c6">' + area + '</div></div>';
  }

  function googleBody() {
    var per = '<div class="db-per" role="group" aria-label="Period">' + [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']].map(function (p) {
      return '<button class="' + (p[0] === W.period ? 'on' : '') + '" aria-pressed="' + (p[0] === W.period) + '" onclick="bpWebPeriod(\'' + p[0] + '\')">' + p[1] + '</button>';
    }).join('') + '</div>';
    var out = switcher() + flash();
    if (G.picking) return out + (G.err ? '<div class="sp-note bad"><span class="ms">error</span>' + esc(G.err) + '</div>' : '') + picker();
    var n = rangeN(), rep = G.rep[n];
    if (!rep) {
      loadReport(n);
      return out + (G.err ? '<div class="sp-note bad"><span class="ms">error</span>' + esc(G.err) + '</div>' : '') + per
        + '<div class="bpx-panel ws-load"><span class="ms ws-spin">progress_activity</span> Getting your numbers from Google…</div>';
    }
    var P = B.periodDef(W.period);
    return out + per + gaSection(rep, P) + gscSection(rep, P);
  }

  function page(snippetBody) {
    gcss();
    if (useGoogle()) return googleBody();
    var top = flash();
    if (connected()) top = switcher() + top;
    return top + snippetBody();
  }

  /* ---------- actions ---------- */
  window.bpWebSrc = function (s) {
    G.src = s; G.menu = false; try { localStorage.setItem('bpWebSrc', s); } catch (e) {}
    if (s === 'google' && connected()) ensure();
    B.render();
  };
  window.bpWebGoogle = function () {
    if (G.busy) return;
    if (G.st && !G.st.configured) { alert('Google sign-in is being set up. Use the BuilderPro snippet below for now.'); return; }
    G.busy = true; B.render();
    var ret = location.origin + location.pathname + '?portal=1';
    api({ op: 'auth_url', return: ret }).then(function (d) {
      G.busy = false;
      if (d && d.ok && d.url) { location.assign(d.url); return; }
      G.err = errText(d); B.render();
      alert(G.err);
    });
  };
  window.bpWebGMenu = function (ev) {
    if (ev) ev.stopPropagation();
    G.menu = !G.menu; B.render();
    if (G.menu) setTimeout(function () {
      var close = function (e) { if (e.target.closest && e.target.closest('.ws-menu')) return; document.removeEventListener('click', close, true); if (G.menu) { G.menu = false; B.render(); } };
      document.addEventListener('click', close, true);
    }, 0);
  };
  window.bpWebGPick = function () { G.menu = false; G.picking = true; G.src = 'google'; loadProps(); B.render(); };
  window.bpWebGCancelPick = function () { G.picking = false; ensure(); B.render(); };
  window.bpWebGRefresh = function () { G.menu = false; G.rep = {}; G.err = ''; ensure(); B.render(); };
  window.bpWebGSave = function () {
    var ga = ($('ws-gaprop') || {}).value || null, gsc = ($('ws-gscsite') || {}).value || null;
    if (!ga && !gsc) { alert('Pick a Google Analytics property or a Search Console site.'); return; }
    api({ op: 'select', ga_property: ga, gsc_site: gsc }).then(function (d) {
      if (!d || !d.ok) { G.err = errText(d); B.render(); return; }
      G.st.ga_property = ga; G.st.gsc_site = gsc; G.picking = false; G.rep = {}; G.err = '';
      ensure(); B.render();
    });
  };
  window.bpWebGDisconnect = function () {
    G.menu = false;
    if (!confirm('Disconnect Google? BuilderPro will stop reading your Analytics and Search Console numbers.')) { B.render(); return; }
    api({ op: 'disconnect' }).then(function (d) {
      if (!d || !d.ok) { alert(errText(d)); return; }
      G.st = { ok: true, configured: true, connected: false }; G.props = null; G.rep = {}; G.picking = false; G.src = null; G.err = '';
      try { localStorage.removeItem('bpWebSrc'); } catch (e) {}
      B.render();
    });
  };
  var $ = function (id) { return document.getElementById(id); };

  /* period changes need a fetch for that range */
  var _per = window.bpWebPeriod;
  window.bpWebPeriod = function (k) { _per(k); if (useGoogle() && !G.picking) { loadReport(rangeN()); } };

  function gcss() {
    if ($('ws-gcss')) return;
    var st = document.createElement('style'); st.id = 'ws-gcss';
    st.textContent = ''
      /* Google's sign-in button (light / dark per the brand guidelines) */
      + '#bpx .ws-gbtn{display:inline-flex;align-items:center;gap:10px;height:40px;padding:0 12px;border:1px solid #747775;border-radius:4px;background:#fff;color:#1f1f1f;font:500 14px/20px Roboto,"Google Sans",Arial,sans-serif;letter-spacing:.25px;cursor:pointer;white-space:nowrap;transition:background .2s,box-shadow .2s}'
      + '#bpx .ws-gbtn:hover{background:#f8f9fa;box-shadow:0 1px 2px rgba(60,64,67,.3),0 1px 3px 1px rgba(60,64,67,.15)}#bpx .ws-gbtn:focus-visible{outline:2px solid #4285f4;outline-offset:2px}#bpx .ws-gbtn[disabled]{opacity:.6;cursor:default}'
      + '#bpx .ws-glogo{display:grid;place-items:center;width:18px;height:18px}'
      + '#bpx.bpx-dark .ws-gbtn{background:#131314;border-color:#8e918f;color:#e3e3e3}#bpx.bpx-dark .ws-gbtn:hover{background:#1f1f20}'
      + '#bpx .ws-gcard{padding:20px 22px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}'
      + '#bpx .ws-gcard-t{display:flex;gap:14px;align-items:flex-start;flex:1 1 380px;min-width:0}#bpx .ws-gcard-t b{font-size:16px;color:var(--ink)}#bpx .ws-gcard-t .bpx-mut{font-size:13px;margin-top:3px;line-height:1.5;max-width:620px}#bpx .ws-gcard-t .bpx-mut b{font-size:inherit}'
      + '#bpx .ws-gic{width:44px;height:44px;flex:none;border-radius:12px;display:grid;place-items:center;background:var(--soft)}'
      + '#bpx .ws-gcard-a{display:flex;flex-direction:column;align-items:flex-start;gap:6px}#bpx .ws-gor{font-size:12px}'
      + '#bpx .ws-srcbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}#bpx .ws-src{margin:0}'
      + '#bpx .ws-gacct{position:relative;display:flex;align-items:center;gap:6px;font-size:13px;color:var(--grey);min-width:0}'
      + '#bpx .ws-gmail{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}'
      + '#bpx .ws-gdot{width:8px;height:8px;border-radius:50%;background:#16a34a;flex:none}'
      + '#bpx .ws-kebab{border:0;background:none;color:var(--grey);cursor:pointer;width:32px;height:32px;border-radius:8px;display:grid;place-items:center}#bpx .ws-kebab:hover{background:var(--soft)}'
      + '#bpx .ws-menu{position:absolute;right:0;top:36px;z-index:30;background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:4px;min-width:200px}'
      + '#bpx .ws-menu button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:9px 10px;border-radius:7px;font:inherit;font-size:13.5px;color:var(--ink);cursor:pointer;text-align:left}#bpx .ws-menu button:hover{background:var(--soft)}#bpx .ws-menu button .ms{font-size:18px}#bpx .ws-menu .bad{color:#b91c1c}'
      + '#bpx .ws-pick{padding:20px 22px;margin-bottom:14px}#bpx .ws-pick>b{font-size:16px;color:var(--ink)}'
      + '#bpx .ws-pick-g{display:grid;grid-template-columns:auto minmax(0,420px);gap:10px 14px;align-items:center;margin:14px 0}'
      + '#bpx .ws-pick-g label{font-size:13px;font-weight:600;color:var(--ink)}#bpx .ws-pick-g select{padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);font:inherit;font-size:13.5px;min-width:0}'
      + '#bpx .ws-pick-n{grid-column:2;font-size:12px;color:var(--grey);margin-top:-6px}'
      + '#bpx .ws-load{padding:28px;text-align:center;color:var(--grey)}#bpx .ws-spin{animation:wsSpin 1s linear infinite;vertical-align:middle}@keyframes wsSpin{to{transform:rotate(360deg)}}'
      + '#bpx .ws-k4{grid-template-columns:repeat(4,minmax(0,1fr))}'
      + '#bpx .ws-sech{display:flex;gap:12px;align-items:center;margin:22px 0 10px}#bpx .ws-sech>.ms{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--soft);color:var(--blue)}#bpx .ws-sech b{font-size:16px;color:var(--ink)}#bpx .ws-sech .bpx-mut{font-size:12.5px}'
      + '#bpx .ws-tt{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}#bpx .ws-tt b{color:var(--ink)}#bpx .ws-tt .bpx-mut{font-size:12px}'
      + '#bpx .ws-tw{overflow-x:auto}#bpx .ws-tbl{width:100%;border-collapse:collapse;font-size:13px}#bpx .ws-tbl th{text-align:right;font-weight:600;color:var(--grey);font-size:12px;padding:6px 8px;border-bottom:1px solid var(--line)}#bpx .ws-tbl th:first-child,#bpx .ws-tbl td:first-child{text-align:left}'
      + '#bpx .ws-tbl td{text-align:right;padding:8px;border-bottom:1px solid var(--line);color:var(--ink);font-variant-numeric:tabular-nums}#bpx .ws-tbl td:first-child{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '@media(max-width:1180px){#bpx .ws-k4{grid-template-columns:repeat(2,minmax(0,1fr))}}'
      + '@media(max-width:760px){#bpx .ws-pick-g{grid-template-columns:1fr}#bpx .ws-pick-n{grid-column:1}#bpx .ws-hide-s{display:none}#bpx .ws-gmail{max-width:150px}#bpx .ws-tbl td:first-child{max-width:170px}}'
      + '@media(max-width:380px){#bpx .ws-k4{grid-template-columns:1fr}}';
    document.head.appendChild(st);
  }

  window.BP_WEB_G = { start: start, page: page, state: G };
})();
