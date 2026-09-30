/* ==================================================================
   AI Brain (Settings → AI Brain): teaches the AI receptionist from what
   the portal already knows.

   Sources (each can be switched off, each shows the text it produces):
     calc      – price ranges from the account's calculator
     business  – services, service area, hours, contact from Settings
     jobs      – summary of completed jobs (work types, sizes, price bands,
                 towns). Never customer names, addresses or phones.
     installs  – maintenance periods from Installation sign-offs
     reviews   – rating and short highlights, if reviews were loaded
   Plus: a "questions she couldn't answer" inbox (answered → FAQ),
   owner-written extras, pasted documents, and "Teach" which merges it all
   into the SAME publish payload the receptionist page sends to
   ai-brain-sync (services / pricing / faq / rules), trimmed per field.

   Everything lives in settings.brain, so it syncs with bpSettingsPush.
   The weekly re-teach runs client-side when the portal opens.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (x) { return window.bpEsc ? bpEsc(x) : String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var NAME = function () { return window.BP_AI_NAME || 'Lisa'; };
  var DAY = 864e5, WEEK = 7 * DAY;

  /* per-field limits for what goes to GHL custom values. The edge function
     accepts 6000; we stay well under so the voice prompt stays lean. */
  var LIMIT = { services: 1200, pricing: 1800, faq: 2800, rules: 2400 };

  var SOURCES = [
    ['calc', 'Calculator prices', 'calculate', 'Price ranges from your instant-quote calculator, so she can give ballparks.'],
    ['business', 'Business details', 'storefront', 'Services, service area, hours and contact info from Settings.'],
    ['jobs', 'Completed jobs', 'task_alt', 'The kinds of work you finish, typical sizes and price bands, and the towns. No customer names, addresses or phone numbers.'],
    ['installs', 'Warranty & maintenance', 'build', 'How often installed work needs service, from your Installation sign-offs.'],
    ['reviews', 'Reviews', 'star', 'Your rating and what customers praise.']
  ];
  var EXTRAS = [
    ['dos', 'Do\'s and don\'ts', 'One per line. e.g. "Always offer a free inspection" / "Never promise a same-day install".'],
    ['phrases', 'Phrases to use or avoid', 'e.g. Say "free estimate", not "quote". Avoid "cheap".'],
    ['afterhours', 'Emergency & after-hours policy', 'What counts as an emergency, whether you come out at night, and what it costs.'],
    ['objPrice', 'When the price seems too high', 'How she should answer "that\'s too expensive".'],
    ['objThink', 'When they need to think about it', 'How she should answer "I need to think about it" or "I\'m getting other quotes".'],
    ['financing', 'Financing', 'Who you finance through, terms, minimums. Leave blank if you don\'t offer it.']
  ];

  /* ---------------- state ---------------- */
  function B() {
    var s = window.bpSettingsGet ? bpSettingsGet() : {};
    var b = s.brain || {};
    b.src = b.src || {}; SOURCES.forEach(function (x) { if (b.src[x[0]] == null) b.src[x[0]] = true; });
    b.extras = b.extras || {}; b.qs = b.qs || []; b.docs = b.docs || '';
    return b;
  }
  function saveB(b, push) {
    var s = bpSettingsGet(); s.brain = b; bpSettingsSet(s);
    if (push && window.bpSettingsPush) Promise.resolve(bpSettingsPush(s)).catch(function () {});
  }
  var money = function (n) {
    n = +n || 0;
    if (n >= 1000) return '$' + (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + 'k';
    return '$' + (n % 1 ? n.toFixed(2) : n);
  };
  var clip = function (t, n) {
    t = String(t || '').trim(); if (t.length <= n) return t;
    var cut = t.slice(0, n), nl = cut.lastIndexOf('\n');
    return (nl > n * 0.6 ? cut.slice(0, nl) : cut.replace(/\s+\S*$/, '')).trim() + ' …';
  };

  /* ---------------- sources ---------------- */
  var _calcRemote = null, _calcAsked = false;
  function calcPricing(cid) {
    var loc = null; try { loc = JSON.parse(localStorage.getItem('bpPrice_' + cid) || 'null'); } catch (e) {}
    return (_calcRemote && _calcRemote.cid === cid && _calcRemote.p) || loc || null;
  }
  function askCalcRemote(cid) {
    if (_calcAsked || !window.BP_LIVE || !window.BP_SB) return; _calcAsked = true;
    try {
      BP_SB.from('calculator_pricing').select('pricing,owner').eq('calc_id', cid).then(function (r) {
        var row = r && r.data && (r.data.filter(function (x) { return x.owner; })[0] || r.data[0]);
        if (row && row.pricing) { _calcRemote = { cid: cid, p: row.pricing }; if ($('brn')) render(); }
      }, function () {});
    } catch (e) {}
  }
  function srcCalc() {
    if (typeof BP_CALC_DEFS === 'undefined') return '';
    var cid = window.bpCalcAssigned ? bpCalcAssigned() : 'roofing', def = BP_CALC_DEFS[cid]; if (!def) return '';
    askCalcRemote(cid);
    var ov = calcPricing(cid) || {}, out = [];
    var nm = cid; try { BP_CALC_IDS.forEach(function (p) { if (p[0] === cid) nm = p[1]; }); } catch (e) {}
    def.groups.forEach(function (g) {
      if (g.flat) return;
      var lines = g.items.map(function (it) {
        var o = (ov[g.prop] || {})[it.k] || {}, v = function (f) { return o[f] != null ? +o[f] : +it[f]; };
        if (g.fields.indexOf('baseLow') >= 0) {
          var t = money(v('baseLow')) + '–' + money(v('baseHigh'));
          if (v('perHigh') > 0) t += ' plus ' + money(v('perLow')) + '–' + money(v('perHigh')) + ' ' + def.unit.replace(/^base \+ /, '');
          return '- ' + it.l + ': ' + t;
        }
        return '- ' + it.l + ': ' + money(v('low')) + '–' + money(v('high')) + (g.prop === 'addons' ? '' : ' ' + def.unit);
      });
      out.push(g.title + ':\n' + lines.join('\n'));
    });
    if (!out.length) return '';
    return 'Price ranges (' + nm + ' calculator; ballparks only, the final price comes from an on-site estimate):\n' + out.join('\n');
  }
  function srcBusiness() {
    var s = bpSettingsGet(), c = s.company || {}, t = [];
    if (c.name) t.push('Business: ' + c.name + (c.trade ? ' (' + c.trade + ')' : ''));
    if (c.serviceArea) t.push('Service area: ' + c.serviceArea);
    var h = window.bpHoursText ? bpHoursText(s.hours) : ''; if (h) t.push('Hours: ' + h);
    if (c.phone) t.push('Phone: ' + c.phone);
    if (c.email) t.push('Email: ' + c.email);
    if (c.website) t.push('Website: ' + c.website);
    if (c.license) t.push('Licensed & insured (license ' + c.license + ')');
    return t.join('\n');
  }
  /* a town from an address, without the street: "12 Oak St, Round Rock, TX 78664" → "Round Rock" */
  function town(j) {
    if (j.city) return String(j.city).trim();
    var a = String(j.address || j.addr || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (a.length >= 3) return a[a.length - 2];
    if (a.length === 2 && !/\d/.test(a[1])) return a[1];
    return '';
  }
  function kind(j) {
    var t = String(j.title || j.trade || j.type || '').trim();
    if (!t || /^job$/i.test(t)) return '';
    /* job titles are sometimes "Roof replacement — Smith"; keep the work, drop the person */
    return t.split(/\s[—–-]\s|:|\(/)[0].trim().replace(/\b(for|at)\b.*$/i, '').trim().slice(0, 40);
  }
  function srcJobs() {
    var jobs = (window.bpJobsGet ? bpJobsGet() : []).filter(function (j) { return j.status === 'done'; });
    if (!jobs.length) return '';
    var since = Date.now() - 365 * DAY;
    var recent = jobs.filter(function (j) { return !j.doneAt || j.doneAt >= since; }); if (!recent.length) recent = jobs;
    var kinds = {}, towns = {}, vals = [];
    recent.forEach(function (j) {
      var k = kind(j); if (k) { var key = k.toLowerCase(); kinds[key] = kinds[key] || { l: k, n: 0, v: [] }; kinds[key].n++; if (+j.estimate > 0) kinds[key].v.push(+j.estimate); }
      var tw = town(j); if (tw) towns[tw] = (towns[tw] || 0) + 1;
      if (+j.estimate > 0) vals.push(+j.estimate);
    });
    var t = ['Completed ' + recent.length + ' job' + (recent.length === 1 ? '' : 's') + ' in the last year.'];
    var ks = Object.keys(kinds).map(function (k) { return kinds[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    if (ks.length) t.push('Most common work: ' + ks.map(function (k) {
      var r = ''; if (k.v.length >= 2) { k.v.sort(function (a, b) { return a - b; }); r = ' (usually ' + money(k.v[0]) + '–' + money(k.v[k.v.length - 1]) + ')'; }
      return k.l + r;
    }).join('; ') + '.');
    if (vals.length >= 3) {
      vals.sort(function (a, b) { return a - b; });
      var p = function (q) { return vals[Math.min(vals.length - 1, Math.floor(q * vals.length))]; };
      t.push('Typical job size: ' + money(p(0.25)) + ' to ' + money(p(0.75)) + ', median ' + money(p(0.5)) + '.');
    }
    var tw = Object.keys(towns).sort(function (a, b) { return towns[b] - towns[a]; }).slice(0, 8);
    if (tw.length) t.push('Recent work in: ' + tw.join(', ') + '.');
    return t.join('\n');
  }
  var PER = { 3: 'every 3 months', 6: 'every 6 months', 12: 'once a year', 24: 'every 2 years', 36: 'every 3 years', 60: 'every 5 years' };
  function srcInstalls() {
    var jobs = (window.bpJobsGet ? bpJobsGet() : []).filter(function (j) { return j.install && j.install.date; });
    if (!jobs.length) return '';
    var by = {};
    jobs.forEach(function (j) {
      var it = (j.install.item || kind(j) || 'Installed work').slice(0, 50), p = +j.install.period || 0;
      var key = it.toLowerCase() + '|' + p; by[key] = by[key] || { it: it, p: p, n: 0 }; by[key].n++;
    });
    var rows = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
    return 'Maintenance we recommend after install:\n' + rows.map(function (r) {
      return '- ' + r.it + ': ' + (r.p ? 'service ' + (PER[r.p] || 'every ' + r.p + ' months') : 'no routine maintenance needed');
    }).join('\n') + '\nCustomers can book a maintenance visit through us.';
  }
  function srcReviews() {
    var R = window._bpRep; if (!R || !R.loaded || R.demo || !R.data) return '';
    var d = R.data, parts = [], quotes = [];
    ['google', 'yelp', 'facebook'].forEach(function (k) {
      var p = d[k]; if (!p || !p.rating) return;
      parts.push((k[0].toUpperCase() + k.slice(1)) + ' ' + p.rating + '★' + (p.count ? ' (' + p.count + ' reviews)' : ''));
      (p.reviews || []).forEach(function (r) { if (+r.rating >= 5 && r.text) quotes.push(r.text); });
    });
    if (!parts.length) return '';
    var t = 'Reputation: ' + parts.join(', ') + '.';
    /* short quotes only, no reviewer names */
    quotes = quotes.slice(0, 3).map(function (q) { return '"' + clip(q.replace(/\s+/g, ' '), 140) + '"'; });
    if (quotes.length) t += '\nWhat customers say: ' + quotes.join(' ');
    return t;
  }
  var SRC_FN = { calc: srcCalc, business: srcBusiness, jobs: srcJobs, installs: srcInstalls, reviews: srcReviews };
  var EMPTY = {
    calc: 'No calculator prices yet. Set them under Calculator.',
    business: 'Nothing in Business settings yet.',
    jobs: 'No completed jobs yet. Finish a job in Active Jobs and it shows up here.',
    installs: 'No Installation sign-offs yet.',
    reviews: 'No reviews loaded. Open Reputation once to pull them in.'
  };

  /* ---------------- unanswered questions ---------------- */
  var UNSURE = /(not sure|don'?t know|do not know|i don'?t have (that|this)|no information|check with (the|our)|get back to you|have (the|our) (owner|team|office)|can'?t (answer|say)|unable to (answer|confirm))/i;
  /* seeds from the Test-Lisa chat on the receptionist page: a reply where she
     hedged makes the question before it land in the inbox */
  function seedFromChat(b) {
    var h = window._bpRgHist || (typeof _bpRgHist !== 'undefined' ? _bpRgHist : null); if (!h || !h.length) return false;
    var added = false;
    for (var i = 1; i < h.length; i++) {
      if (h[i].role !== 'assistant' || !UNSURE.test(h[i].content || '') || h[i - 1].role !== 'user') continue;
      if (addQ(b, h[i - 1].content, 'Test chat')) added = true;
    }
    return added;
  }
  function addQ(b, q, from) {
    q = String(q || '').trim().slice(0, 300); if (!q) return false;
    if (b.qs.some(function (x) { return x.q.toLowerCase() === q.toLowerCase(); })) return false;
    b.qs.unshift({ id: 'q' + Date.now() + Math.floor(Math.random() * 1e3), q: q, a: '', from: from || 'You', at: Date.now() });
    return true;
  }
  /* other parts of the app (or a future server log) can drop questions in */
  window.bpBrainNoteQuestion = function (q, from) { var b = B(); if (addQ(b, q, from || 'Conversation')) { saveB(b, true); if ($('brn')) render(); } };

  /* ---------------- compile ---------------- */
  function compile() {
    var b = B(), d = window.bpRgDraft ? bpRgDraft() : {}, x = b.extras, on = b.src;
    var join = function (a) { return a.filter(function (t) { return t && String(t).trim(); }).join('\n\n'); };
    var faqQA = b.qs.filter(function (q) { return q.a && q.a.trim(); }).map(function (q) { return 'Q: ' + q.q + '\nA: ' + q.a.trim(); }).join('\n');
    var parts = {
      services: join([d.services, on.business ? srcBusiness() : '']),
      pricing: join([d.pricing, on.calc ? srcCalc() : '']),
      faq: join([d.faq, faqQA,
        on.installs ? srcInstalls() : '', on.jobs ? srcJobs() : '', on.reviews ? srcReviews() : '',
        b.docs ? 'From our documents:\n' + b.docs.trim() : '']),
      rules: join([d.rules,
        x.dos ? 'Do\'s and don\'ts:\n' + x.dos : '', x.phrases ? 'Wording:\n' + x.phrases : '',
        x.afterhours ? 'Emergencies & after hours:\n' + x.afterhours : '',
        x.objPrice ? 'If the price seems too high:\n' + x.objPrice : '',
        x.objThink ? 'If they need to think about it:\n' + x.objThink : '',
        x.financing ? 'Financing:\n' + x.financing : ''])
    };
    var out = {}, raw = {};
    Object.keys(LIMIT).forEach(function (k) { raw[k] = parts[k].length; out[k] = clip(parts[k], LIMIT[k]); });
    return { fields: out, raw: raw, tone: d.tone || 'Friendly' };
  }
  window.bpBrainCompile = compile;

  /* ---------------- teach (publish) ---------------- */
  var _busy = false;
  function teach(silent) {
    if (_busy) return Promise.resolve(null);
    if (!window.bpAuthApi || typeof AI_BRAIN_URL === 'undefined') { setStatus('err', 'The publish service isn\'t available in this build.'); return Promise.resolve(null); }
    _busy = true;
    var c = compile(), f = c.fields;
    if (!silent) setStatus('busy', 'Teaching ' + NAME() + '…');
    var company = window.bpRgCompany ? bpRgCompany() : {};
    return Promise.resolve(bpAuthApi(AI_BRAIN_URL, { op: 'publish', brain: { services: f.services, pricing: f.pricing, faq: f.faq, rules: f.rules, tone: c.tone, assistant_name: NAME() }, company: company }))
      .then(function (r) {
        _busy = false;
        var b = B(), now = Date.now();
        if (!(r && r.ok)) {
          b.last = { at: now, ok: false, ghl: '', msg: (r && r.error) || 'The server said no.' }; saveB(b, false);
          setStatus('err', 'Could not teach ' + NAME() + ' — ' + ((r && r.error) || 'try again') + '.'); return r;
        }
        b.last = { at: now, ok: true, ghl: r.ghl || '', msg: '' }; b.taughtAt = now; saveB(b, true);
        setStatus(r.ghl === 'synced' ? 'ok' : 'warn', statusText(b.last));
        return r;
      }, function () {
        _busy = false; var b = B(); b.last = { at: Date.now(), ok: false, ghl: '', msg: 'No connection.' }; saveB(b, false);
        setStatus('err', 'Could not reach the server — check your connection and try again.'); return null;
      });
  }
  function statusText(l) {
    if (!l) return 'Not taught yet. ' + NAME() + ' is using only what\'s on her receptionist page.';
    var ago = window.bpRgAgo ? bpRgAgo(l.at) : new Date(l.at).toLocaleString();
    if (!l.ok) return 'Last try ' + ago + ' failed: ' + l.msg;
    if (l.ghl === 'synced') return 'Taught ' + ago + ' · live on web, text and your phone line.';
    if (l.ghl === 'failed') return 'Saved ' + ago + ' for web and text, but the phone line (GHL) didn\'t update. Try again in a minute.';
    return 'Saved ' + ago + ' for web and text. Your phone line isn\'t linked to a GHL location yet, so the phone AI didn\'t get it.';
  }
  function setStatus(k, t) {
    var el = $('brn-status'); if (!el) return;
    el.className = 'brn-st ' + k; el.innerHTML = '<i></i><span>' + esc(t) + '</span>';
    var btn = $('brn-teach'); if (btn) btn.disabled = (k === 'busy');
  }

  /* weekly auto re-teach: once per portal open, if on and older than 7 days */
  var _autoTried = false;
  function autoCheck() {
    if (_autoTried) return;
    if (!window.bpSettingsGet || !window._bpEmail) return;
    _autoTried = true;
    var b = B(); if (!b.weekly) return;
    if (b.taughtAt && Date.now() - b.taughtAt < WEEK) return;
    teach(true);
  }
  window.bpBrainAutoCheck = autoCheck;
  (function poll(n) { if (_autoTried || n > 40) return; setTimeout(function () { try { autoCheck(); } catch (e) {} poll(n + 1); }, 15000); })(0);

  /* ---------------- UI ---------------- */
  var _open = { calc: false };
  function css() {
    if ($('brn-css')) return;
    var s = document.createElement('style'); s.id = 'brn-css';
    s.textContent =
      '#brn{display:flex;flex-direction:column;gap:18px;margin-top:18px}'
      + '#brn .brn-card{border:1px solid var(--line);border-radius:14px;background:var(--card,#fff);padding:18px}'
      + '#brn .brn-ch{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}'
      + '#brn .brn-ch .ms{font-size:20px;color:var(--blue,#006fff);background:color-mix(in srgb,var(--blue,#006fff) 10%,transparent);border-radius:9px;padding:6px}'
      + '#brn .brn-ch b{display:block;font-size:15px;color:var(--ink)}#brn .brn-ch p{margin:2px 0 0;font-size:12.5px;color:var(--grey);line-height:1.5}'
      + '#brn .brn-src{border-top:1px solid var(--line-2,var(--line));padding:12px 0}#brn .brn-src:first-of-type{border-top:0}'
      + '#brn .brn-sh{display:flex;align-items:center;gap:10px}#brn .brn-sh .t{flex:1;min-width:0}#brn .brn-sh .t b{font-size:13.5px;color:var(--ink)}#brn .brn-sh .t span{display:block;font-size:12px;color:var(--grey);line-height:1.45}'
      + '#brn .brn-tg{position:relative;width:38px;height:22px;flex:none;border-radius:99px;border:0;background:var(--line);cursor:pointer;transition:background .15s}'
      + '#brn .brn-tg::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}'
      + '#brn .brn-tg.on{background:var(--blue,#006fff)}#brn .brn-tg.on::after{transform:translateX(16px)}'
      + '#brn .brn-pv{margin:10px 0 0;white-space:pre-wrap;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);background:var(--bg-2,rgba(127,127,127,.07));border-radius:10px;padding:10px 12px;max-height:180px;overflow:auto;word-break:break-word}'
      + '#brn .brn-pv.off{opacity:.45}#brn .brn-pv.none{font-family:inherit;color:var(--grey)}'
      + '#brn .brn-more{background:none;border:0;color:var(--blue,#006fff);font-size:12px;font-weight:600;cursor:pointer;padding:6px 0 0}'
      + '#brn textarea,#brn input[type=text]{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:10px;padding:9px 11px;font:inherit;font-size:13px;background:var(--card,#fff);color:var(--ink)}'
      + '#brn textarea{min-height:64px;resize:vertical}#brn .brn-docs{min-height:130px}'
      + '#brn .brn-lab{display:block;font-size:13px;font-weight:700;color:var(--ink);margin:12px 0 2px}#brn .brn-hint{font-size:12px;color:var(--grey);margin:0 0 6px;line-height:1.45}'
      + '#brn .brn-q{border:1px solid var(--line-2,var(--line));border-radius:11px;padding:10px 12px;margin-top:10px}'
      + '#brn .brn-qh{display:flex;gap:8px;align-items:flex-start}#brn .brn-qh b{flex:1;font-size:13.5px;color:var(--ink);line-height:1.4}#brn .brn-qh small{font-size:11px;color:var(--grey);white-space:nowrap}'
      + '#brn .brn-qx{background:none;border:0;color:var(--grey);cursor:pointer;padding:0}#brn .brn-q textarea{margin-top:8px;min-height:44px}'
      + '#brn .brn-q.done{border-color:color-mix(in srgb,#15803d 35%,transparent)}#brn .brn-ok{font-size:11px;font-weight:700;color:#15803d;margin-top:6px;display:flex;align-items:center;gap:4px}#brn .brn-ok .ms{font-size:14px}'
      + '#brn .brn-add{display:flex;gap:8px;margin-top:10px}#brn .brn-add input{flex:1}'
      + '#brn .brn-empty{text-align:center;padding:18px 10px;color:var(--grey);font-size:13px;line-height:1.5}#brn .brn-empty .ms{display:block;font-size:28px;margin-bottom:4px;opacity:.6}'
      + '#brn .brn-meters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}'
      + '#brn .brn-m{font-size:12px;color:var(--grey)}#brn .brn-m b{display:flex;justify-content:space-between;color:var(--ink);font-size:12.5px;margin-bottom:5px}'
      + '#brn .brn-bar{height:6px;border-radius:9px;background:var(--line);overflow:hidden}#brn .brn-bar i{display:block;height:100%;background:var(--blue,#006fff);border-radius:9px}'
      + '#brn .brn-bar.full i{background:#b45309}#brn .brn-m em{font-style:normal;color:#b45309;display:block;margin-top:3px;font-size:11px}'
      + '#brn .brn-fh{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--grey-l,var(--grey));margin:12px 0 4px}'
      + '#brn .brn-foot{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:14px}#brn .brn-foot .bpx-btn{width:auto;padding:12px 22px}'
      + '#brn .brn-st{display:flex;align-items:flex-start;gap:8px;flex:1;min-width:220px;font-size:12.5px;color:var(--grey);line-height:1.45}'
      + '#brn .brn-st i{flex:none;width:8px;height:8px;border-radius:50%;margin-top:5px;background:#94a3b8}'
      + '#brn .brn-st.ok i{background:#15803d}#brn .brn-st.warn i{background:#b45309}#brn .brn-st.err i{background:#dc2626}#brn .brn-st.err{color:#dc2626}#brn .brn-st.busy i{background:var(--blue,#006fff)}'
      + '#brn .brn-wk{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink);margin-top:12px}'
      + '#brn .brn-file{font-size:12px;color:var(--blue,#006fff);font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin-top:8px}#brn .brn-file .ms{font-size:16px}'
      + '@media(max-width:720px){#brn .brn-meters{grid-template-columns:repeat(2,minmax(0,1fr))}#brn .brn-card{padding:14px}}';
    document.head.appendChild(s);
  }
  function tg(on, click, label) { return '<button type="button" class="brn-tg' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label) + '" onclick="' + click + '"></button>'; }
  function card(ic, t, p, body) { return '<div class="brn-card"><div class="brn-ch"><span class="ms">' + ic + '</span><div><b>' + t + '</b><p>' + p + '</p></div></div>' + body + '</div>'; }

  function render() {
    var host = $('bpx-br-host'); if (!host) return;
    css();
    var b = B(); if (seedFromChat(b)) saveB(b, true);
    var nm = esc(NAME());
    var srcHtml = SOURCES.map(function (x) {
      var on = b.src[x[0]], txt = ''; try { txt = SRC_FN[x[0]]() || ''; } catch (e) { txt = ''; }
      var long = txt.length > 420 && !_open[x[0]];
      return '<div class="brn-src"><div class="brn-sh"><span class="ms" style="color:var(--grey)">' + x[2] + '</span><div class="t"><b>' + x[1] + '</b><span>' + x[3] + '</span></div>'
        + tg(on, 'bpBrainSrc(\'' + x[0] + '\')', x[1]) + '</div>'
        + (txt ? '<div class="brn-pv' + (on ? '' : ' off') + '">' + esc(long ? txt.slice(0, 420) + ' …' : txt) + '</div>'
          + (txt.length > 420 ? '<button class="brn-more" onclick="bpBrainMore(\'' + x[0] + '\')">' + (_open[x[0]] ? 'Show less' : 'Show all') + '</button>' : '')
          : '<div class="brn-pv none">' + esc(EMPTY[x[0]]) + '</div>')
        + '</div>';
    }).join('');

    var open = b.qs.filter(function (q) { return !(q.a && q.a.trim()); }).length;
    var qHtml = (b.qs.length ? b.qs.map(function (q) {
      var done = !!(q.a && q.a.trim());
      return '<div class="brn-q' + (done ? ' done' : '') + '"><div class="brn-qh"><b>' + esc(q.q) + '</b><small>' + esc(q.from || '') + '</small>'
        + '<button class="brn-qx" title="Remove" aria-label="Remove question" onclick="bpBrainQDel(\'' + q.id + '\')"><span class="ms" style="font-size:18px">close</span></button></div>'
        + '<textarea placeholder="Your answer. Once answered, ' + nm + ' uses it as an FAQ." onchange="bpBrainQAns(\'' + q.id + '\',this.value)">' + esc(q.a || '') + '</textarea>'
        + (done ? '<div class="brn-ok"><span class="ms">check_circle</span>Added to FAQs</div>' : '') + '</div>';
    }).join('') : '<div class="brn-empty"><span class="ms">forum</span>No unanswered questions yet.<br>When ' + nm + ' can\'t answer something in a Test chat it lands here. You can also add questions customers ask you.</div>')
      + '<div class="brn-add"><input type="text" id="brn-newq" placeholder="Add a question customers ask, e.g. Do you do gutter guards?" onkeydown="if(event.key===\'Enter\')bpBrainQAdd()"><button class="bpx-rowbtn" style="margin:0" onclick="bpBrainQAdd()">Add</button></div>';

    var exHtml = EXTRAS.map(function (x) {
      return '<label class="brn-lab" for="brn-x-' + x[0] + '">' + x[1] + '</label><div class="brn-hint">' + x[2] + '</div>'
        + '<textarea id="brn-x-' + x[0] + '" onchange="bpBrainExtra(\'' + x[0] + '\',this.value)">' + esc(b.extras[x[0]] || '') + '</textarea>';
    }).join('');

    var docsHtml = '<textarea class="brn-docs" id="brn-docs" placeholder="Paste warranty terms, a brochure, a price sheet, anything you\'d hand a new office hire." onchange="bpBrainDocs(this.value)">' + esc(b.docs) + '</textarea>'
      + '<label class="brn-file"><span class="ms">upload_file</span>Add a .txt file<input type="file" accept=".txt,text/plain" style="display:none" onchange="bpBrainFile(event)"></label>'
      + '<span id="brn-docmsg" class="brn-hint" style="margin-left:10px"></span>';

    host.innerHTML = '<div id="brn">'
      + card('auto_awesome', 'What ' + nm + ' learns on her own', 'Pulled from what BuilderPro already knows about your business. Switch off anything you don\'t want her to say.', srcHtml)
      + card('contact_support', 'Questions ' + nm + ' couldn\'t answer' + (open ? ' <span class="bpx-badge" style="margin-left:6px">' + open + ' open</span>' : ''), 'Answer them once and she\'ll know next time.', qHtml)
      + card('edit_note', 'Your rules', 'How you want her to handle the tricky parts of a call.', exHtml)
      + card('description', 'Paste in documents', 'Warranty, brochure or FAQ text. Kept to what fits; put the most important part first.', docsHtml)
      + card('psychology', 'What ' + nm + ' knows', 'Everything above merged with her receptionist page, as it will be published.', '<div id="brn-compiled"></div>'
        + '<div class="brn-foot"><button class="bpx-btn" id="brn-teach" onclick="bpBrainTeach()"><span class="ms">school</span> Teach ' + nm + '</button><div id="brn-status" class="brn-st"></div></div>'
        + '<label class="brn-wk">' + tg(b.weekly, 'bpBrainWeekly()', 'Re-teach every week') + '<span>Re-teach ' + nm + ' every week<span class="brn-hint" style="display:block;margin:0">Checks when you open BuilderPro and re-teaches if it\'s been 7 days, so new jobs and prices flow in.</span></span></label>')
      + '</div>';
    renderCompiled();
    var l = b.last; setStatus(!l ? '' : !l.ok ? 'err' : l.ghl === 'synced' ? 'ok' : 'warn', statusText(l));
  }
  function renderCompiled() {
    var el = $('brn-compiled'); if (!el) return;
    var c = compile(), L = { services: 'Services', pricing: 'Pricing', faq: 'FAQs & background', rules: 'Rules' };
    var meters = '<div class="brn-meters">' + Object.keys(LIMIT).map(function (k) {
      var n = c.fields[k].length, pct = Math.min(100, Math.round(n / LIMIT[k] * 100)), cut = c.raw[k] > LIMIT[k];
      return '<div class="brn-m"><b><span>' + L[k] + '</span><span>' + n + ' / ' + LIMIT[k] + '</span></b><div class="brn-bar' + (cut ? ' full' : '') + '"><i style="width:' + pct + '%"></i></div>'
        + (cut ? '<em>' + (c.raw[k] - LIMIT[k]) + ' chars trimmed</em>' : '') + '</div>';
    }).join('') + '</div>';
    var body = Object.keys(LIMIT).map(function (k) {
      return '<div class="brn-fh">' + L[k] + '</div><div class="brn-pv' + (c.fields[k] ? '' : ' none') + '">' + (c.fields[k] ? esc(c.fields[k]) : 'Nothing yet.') + '</div>';
    }).join('');
    el.innerHTML = meters + body;
  }

  /* ---------------- handlers ---------------- */
  window.bpBrainRender = render;
  /* re-render after the current event: a change handler fired by blur must
     not replace the node that is blurring */
  var later = function () { setTimeout(render, 0); };
  window.bpBrainSrc = function (k) { var b = B(); b.src[k] = !b.src[k]; saveB(b, true); render(); };
  window.bpBrainMore = function (k) { _open[k] = !_open[k]; render(); };
  window.bpBrainQAdd = function () { var i = $('brn-newq'); if (!i) return; var b = B(); if (addQ(b, i.value, 'You')) { saveB(b, true); setTimeout(function () { render(); var n = $('brn-newq'); if (n) n.focus(); }, 0); } };
  window.bpBrainQAns = function (id, v) { var b = B(); b.qs.forEach(function (q) { if (q.id === id) { q.a = String(v || '').trim().slice(0, 600); q.answeredAt = Date.now(); } }); saveB(b, true); later(); };
  window.bpBrainQDel = function (id) { var b = B(); b.qs = b.qs.filter(function (q) { return q.id !== id; }); saveB(b, true); later(); };
  window.bpBrainExtra = function (k, v) { var b = B(); b.extras[k] = String(v || '').trim().slice(0, 1500); saveB(b, true); renderCompiled(); };
  window.bpBrainDocs = function (v) { var b = B(); b.docs = String(v || '').slice(0, 20000); saveB(b, true); renderCompiled(); };
  window.bpBrainFile = function (e) {
    var f = e.target.files && e.target.files[0], m = $('brn-docmsg'); if (!f) return;
    if (f.size > 500000) { if (m) m.textContent = 'That file is too big. Paste the key part instead.'; return; }
    var r = new FileReader();
    r.onload = function () {
      var b = B(); b.docs = ((b.docs ? b.docs.trim() + '\n\n' : '') + String(r.result || '')).slice(0, 20000); saveB(b, true);
      var t = $('brn-docs'); if (t) t.value = b.docs; renderCompiled(); if (m) m.textContent = 'Added ' + f.name;
    };
    r.readAsText(f);
  };
  window.bpBrainWeekly = function () { var b = B(); b.weekly = !b.weekly; saveB(b, true); render(); };
  window.bpBrainTeach = function () {
    /* pick up anything typed but not yet blurred */
    var b = B(); EXTRAS.forEach(function (x) { var t = $('brn-x-' + x[0]); if (t) b.extras[x[0]] = t.value.trim().slice(0, 1500); });
    var d = $('brn-docs'); if (d) b.docs = d.value.slice(0, 20000); saveB(b, false);
    renderCompiled();
    return teach(false);
  };
})();
