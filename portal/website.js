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
    area.innerHTML = '<div class="ws-page">' + body() + '</div>';
    if (window.bpSpin) bpSpin(false);
  }

  window.bpWebsite = function () {
    css();
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
  window.BP_WEB = { stats: stats, srcOf: srcOf, example: example, state: W };
})();
