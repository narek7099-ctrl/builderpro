/* ===========================================================================
   OFFLINE MODE (2026-11-15). Loaded before the Supabase library, so every
   call the app makes to Supabase passes through here.

   Reading: every answer the app gets from Supabase while online is kept on
   this device (IndexedDB), filed under the person signed in here. With no
   signal, or a signal too weak to answer, the app is handed the kept answer
   instead of an error, so any screen opened online also opens offline.

   Saving: a crew action that can't reach the server (clock in/out, lunch and
   breaks, job steps, finishing a job, photos and files, materials, receipts,
   team chat) is kept in a queue on the device and the app is told it went
   through. The kept answers are patched to match, so the screen shows the
   change at once. When the signal comes back the queue is sent in order, each
   item with a fresh sign-in, and removed only once the server confirms it.
   Clock and break taps are sent with the moment they were tapped
   (crew_clock_at / crew_break_at), so hours stay right.

   A small pill shows "Offline", "3 changes waiting to sync" and "All synced".
   Nothing here touches Stripe, texting, AI or any other paid service.
   ========================================================================= */
(function () {
  'use strict';
  if (!window.fetch || !window.indexedDB || window.bpOffline) return;
  var SB = 'https://ttzwzouhiwdwamuimhpo.supabase.co';
  var AUTH_KEY = 'sb-ttzwzouhiwdwamuimhpo-auth-token';
  var raw = window.fetch.bind(window);

  /* ---------------------------------------------------------- the store --- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var o = indexedDB.open('bp-offline', 1);
      o.onupgradeneeded = function () {
        var d = o.result;
        if (!d.objectStoreNames.contains('reads')) d.createObjectStore('reads');
        if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('failed')) d.createObjectStore('failed', { keyPath: 'id', autoIncrement: true });
      };
      o.onsuccess = function () { res(o.result); };
      o.onerror = function () { rej(o.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        var r = fn(s); if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); };
      });
    });
  }
  var get = function (st, k) { return tx(st, 'readonly', function (s) { return s.get(k); }); };
  var put = function (st, v, k) { return tx(st, 'readwrite', function (s) { return k === undefined ? s.put(v) : s.put(v, k); }); };
  var del = function (st, k) { return tx(st, 'readwrite', function (s) { return s.delete(k); }); };
  var all = function (st) { return tx(st, 'readonly', function (s) { return s.getAll(); }); };
  var keys = function (st) { return tx(st, 'readonly', function (s) { return s.getAllKeys(); }); };

  /* who is signed in on this device: from the stored session, not the request's token
     (an expired token offline makes the library ask as "anonymous") */
  function who() {
    try { var s = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); return (s && s.user && s.user.id) || (s && s.currentSession && s.currentSession.user && s.currentSession.user.id) || 'anon'; }
    catch (e) { return 'anon'; }
  }
  function online() { return navigator.onLine !== false; }

  /* ------------------------------------------------- what kind of call --- */
  /* functions that change something: queued when there's no signal */
  var WRITE_RPC = { crew_clock: 1, crew_clock_at: 1, crew_break: 1, crew_break_at: 1, crew_clock_for: 1, crew_clock_dispute: 1, crew_check: 1, crew_finish: 1,
    crew_add_file: 1, crew_material_add: 1, crew_material_remove: 1, crew_receipt_add: 1, crew_set_photo: 1, team_chat_mark_read: 1 };
  /* tables whose new rows may wait for a signal */
  var WRITE_TABLE = { team_messages: 1, calendar_notes: 1 };
  /* functions that must never be answered from the device (sign-ins, money, live checks) */
  var NEVER = { portal_finance_save: 1, bp_touch: 1 };
  /* server functions never answered from the device */
  var NEVER_FN = /^(test-login|system-test|stripe|billing|account|team-invite|ai-|aiceo|blueprint|supply-scan|lisa|voice|twilio|job-done|contract-sign|homeowner)/;
  function kindOf(u, method, body) {
    if (u.origin !== SB) return 'pass';
    var p = u.pathname, m;
    if (/^\/auth\//.test(p) || /^\/realtime\//.test(p)) return 'pass';
    /* server functions (round two): only calls that just read (list, get, view, search...)
       are kept, so Contacts, the estimate and invoice lists, the calendar and the inbox open
       offline. Anything that creates, sends, charges or asks the AI goes straight through. */
    if ((m = /^\/functions\/v1\/([a-z0-9-]+)/.exec(p))) {
      if (method !== 'POST' || NEVER_FN.test(m[1])) return 'pass';
      var b0 = {}; try { b0 = JSON.parse(body || '{}') || {}; } catch (e) { return 'pass'; }
      var verb = String(b0.action || b0.op || (b0.view ? 'view' : '') || '').toLowerCase();
      return /^(list|get|search|view|load|status|state|history|thread|threads|messages|events|summary|stats|contacts|calendar)$/.test(verb) ? 'read' : 'pass';
    }
    if ((m = /^\/rest\/v1\/rpc\/([a-z0-9_]+)/.exec(p))) {
      var fn = m[1];
      if (NEVER[fn]) return 'pass';
      if (WRITE_RPC[fn]) { if ((fn === 'crew_break' || fn === 'crew_break_at') && /"p_action"\s*:\s*"state"/.test(body || '')) return 'read'; return 'write'; }
      return 'read';
    }
    if ((m = /^\/rest\/v1\/([a-z0-9_]+)/.exec(p))) {
      /* the owner's jobs and money live on the device already and sync on their own: a kept
         server copy handed back offline would overwrite newer edits made here */
      if (m[1] === 'portal_finance') return 'pass';
      if (method === 'GET' || method === 'HEAD') return 'read';
      return WRITE_TABLE[m[1]] && method === 'POST' ? 'write' : 'pass';
    }
    if (/^\/storage\/v1\/object\/project-files\//.test(p) && (method === 'POST' || method === 'PUT')) return 'write';
    return 'pass';
  }
  function rpcName(url) { var m = /\/rest\/v1\/rpc\/([a-z0-9_]+)/.exec(url); return m ? m[1] : ''; }

  /* ------------------------------------------------------- the request --- */
  function hdrs(h) {
    var o = {};
    if (!h) return o;
    if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach(function (v, k) { o[k.toLowerCase()] = v; });
    else if (Array.isArray(h)) h.forEach(function (p) { o[String(p[0]).toLowerCase()] = p[1]; });
    else Object.keys(h).forEach(function (k) { o[k.toLowerCase()] = h[k]; });
    return o;
  }
  /* a body the queue can keep: text, a file, or a form (photos) taken apart */
  function keepBody(b) {
    if (b == null) return Promise.resolve(null);
    if (typeof b === 'string') return Promise.resolve({ t: 'text', v: b });
    if (typeof FormData !== 'undefined' && b instanceof FormData) {
      var parts = []; b.forEach(function (v, k) { parts.push(typeof v === 'string' ? { k: k, s: v } : { k: k, f: v, n: v.name || 'file' }); });
      return Promise.resolve({ t: 'form', v: parts });
    }
    if (typeof Blob !== 'undefined' && b instanceof Blob) return Promise.resolve({ t: 'blob', v: b });
    if (b instanceof ArrayBuffer) return Promise.resolve({ t: 'blob', v: new Blob([b]) });
    if (ArrayBuffer.isView && ArrayBuffer.isView(b)) return Promise.resolve({ t: 'blob', v: new Blob([b]) });
    return Promise.resolve({ t: 'text', v: String(b) });
  }
  function giveBody(k) {
    if (!k) return undefined;
    if (k.t === 'form') { var f = new FormData(); k.v.forEach(function (p) { if ('s' in p) f.append(p.k, p.s); else f.append(p.k, p.f, p.n); }); return f; }
    return k.v;
  }
  function textOf(b) { return typeof b === 'string' ? b : ''; }
  function reply(status, obj, extra) {
    var h = { 'content-type': 'application/json', 'x-bp-offline': extra || 'queued' };
    return new Response(obj === undefined ? 'null' : JSON.stringify(obj), { status: status, headers: h });
  }

  /* ---------------------------------------------------- kept answers --- */
  function readKey(user, method, url, body) { return user + '|' + method + '|' + url + '|' + (body || ''); }
  function keepRead(key, res) {
    return res.clone().text().then(function (txt) {
      if (txt.length > 1500000) return;   /* a huge answer isn't worth keeping */
      var h = {}; ['content-type', 'content-range'].forEach(function (n) { var v = res.headers.get(n); if (v) h[n] = v; });
      return put('reads', { at: Date.now(), status: res.status, h: h, body: txt }, key);
    }).catch(function () {});
  }
  function fromKept(key) {
    return get('reads', key).then(function (r) {
      if (!r) return null;
      var h = Object.assign({}, r.h, { 'x-bp-offline': 'kept' });
      state.keptUsed = true; paint();
      return new Response(r.body, { status: r.status, headers: h });
    }).catch(function () { return null; });
  }
  /* with a weak signal, waiting forever is worse than the kept copy */
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new TypeError('timed out')); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  /* --------------------------------------------------- the wrapped fetch --- */
  window.fetch = function (input, init) {
    var url, method, headers, body;
    try {
      if (typeof input === 'string' || input instanceof URL) { url = String(input); method = ((init && init.method) || 'GET').toUpperCase(); headers = hdrs(init && init.headers); body = init && init.body; }
      else { url = input.url; method = ((init && init.method) || input.method || 'GET').toUpperCase(); headers = hdrs((init && init.headers) || input.headers); body = init && init.body; }
    } catch (e) { return raw(input, init); }
    var u; try { u = new URL(url, location.href); } catch (e) { return raw(input, init); }
    var k = kindOf(u, method, textOf(body));
    if (k === 'pass') return raw(input, init);
    var user = who();
    if (k === 'read') {
      var key = readKey(user, method, u.href, textOf(body));
      if (!online()) return fromKept(key).then(function (r) { return r || raw(input, init); });
      return withTimeout(raw(input, init), 9000).then(function (res) {
        if (res.ok) { keepRead(key, res); state.lastOk = Date.now(); }
        return res;
      }, function (err) {
        return fromKept(key).then(function (r) { if (r) return r; throw err; });
      });
    }
    /* a change: straight through when the signal is good, queued when it isn't */
    var queueIt = function () { return enqueue(u, method, headers, body, user); };
    if (!online()) return queueIt();
    return withTimeout(raw(input, init), 15000).then(function (res) { state.lastOk = Date.now(); return res; }, function (err) {
      if (err && err.name === 'AbortError') throw err;
      return queueIt();
    });
  };

  /* ---------------------------------------------------------- the queue --- */
  function enqueue(u, method, headers, body, user) {
    var at = new Date().toISOString(), url = u.href, fn = rpcName(url), txt = textOf(body), args = null;
    if (fn) { try { args = JSON.parse(txt || '{}'); } catch (e) { args = {}; } }
    /* clock and break taps keep the moment they were tapped */
    if (fn === 'crew_clock') { url = url.replace('/rpc/crew_clock', '/rpc/crew_clock_at'); args.p_at = at; txt = JSON.stringify(args); body = txt; fn = 'crew_clock_at'; }
    if (fn === 'crew_break') { url = url.replace('/rpc/crew_break', '/rpc/crew_break_at'); args.p_at = at; if (!('p_kind' in args)) args.p_kind = 'break'; txt = JSON.stringify(args); body = txt; fn = 'crew_break_at'; }
    var h = Object.assign({}, headers); delete h['content-length'];
    if (typeof FormData !== 'undefined' && body instanceof FormData) delete h['content-type'];
    return keepBody(body).then(function (kb) {
      return put('queue', { at: Date.now(), user: user, url: url, method: method, h: h, body: kb, fn: fn, args: args, label: label(fn, u, args) });
    }).then(function () {
      return Promise.resolve(patchFor(fn, args, user, at)).catch(function () {});
    }).then(function () {
      refresh(); kick(4000);
      return answerFor(fn, u, method, txt, args, at, h);
    });
  }
  function label(fn, u, a) {
    a = a || {};
    switch (fn) {
      case 'crew_clock_at': return a.p_kind === 'out' ? 'Clock out' : 'Clock in';
      case 'crew_break_at': return a.p_action === 'start' ? (a.p_kind === 'lunch' ? 'Lunch started' : 'Break started') : 'Back from break';
      case 'crew_check': return a.p_done ? 'Step checked off' : 'Step unchecked';
      case 'crew_finish': return 'Job finished';
      case 'crew_add_file': return 'Photo or file added';
      case 'crew_material_add': return 'Material added';
      case 'crew_material_remove': return 'Material removed';
      case 'crew_receipt_add': return 'Receipt added';
      case 'crew_set_photo': return 'Profile photo';
      case 'crew_clock_for': return 'Crew clocked ' + (a.p_kind === 'out' ? 'out' : 'in');
      case 'crew_clock_dispute': return 'Punch flagged';
    }
    if (/\/storage\/v1\/object\//.test(u.href)) return 'Photo upload';
    if (/team_messages/.test(u.pathname)) return 'Chat message';
    if (/calendar_notes/.test(u.pathname)) return 'Calendar note';
    return 'Change';
  }
  /* what the app is told when a change is queued: shaped like the server's answer */
  function answerFor(fn, u, method, txt, a, at, h) {
    a = a || {};
    switch (fn) {
      case 'crew_clock_at': return reply(200, { ok: true, queued: true, at: at, hours: 0, lunch_min: 0, job_id: a.p_job || '', job_name: a.p_job_name || '' });
      case 'crew_break_at': return reply(200, Object.assign({ ok: true, on: true, queued: true }, breakState(a, at)));
      case 'crew_check': return reply(200, { ok: true, queued: true, checklist: null });
      case 'crew_finish': return reply(200, { ok: true, queued: true, at: at });
      case 'team_chat_mark_read': return reply(200, null);
    }
    if (fn) return reply(200, { ok: true, queued: true });
    if (/\/storage\/v1\/object\//.test(u.href)) {
      var path = u.pathname.replace(/^\/storage\/v1\/object\//, '');
      return reply(200, { Key: path, Id: 'queued', path: path.replace(/^project-files\//, '') });
    }
    /* a new row: hand back what was sent, as a row */
    var row; try { row = JSON.parse(txt || '{}'); } catch (e) { row = {}; }
    if (!Array.isArray(row)) row = [row];
    row.forEach(function (r) { if (!r.id) r.id = 'q-' + Date.now(); if (!r.created_at) r.created_at = at; });
    /* .single() asks for one object back, not a list */
    return reply(201, /vnd\.pgrst\.object/.test((h && h.accept) || '') ? row[0] : row);
  }

  /* --------------------------------- keep the kept answers in step --- */
  /* change every kept answer of one function (for this person) with fn(data, args) */
  function patchRpc(name, user, fn) {
    var pre = user + '|POST|' + SB + '/rest/v1/rpc/' + name + '|';
    return keys('reads').then(function (ks) {
      return Promise.all(ks.filter(function (k) { return String(k).indexOf(pre) === 0; }).map(function (k) {
        return get('reads', k).then(function (r) {
          if (!r) return; var d, args; try { d = JSON.parse(r.body); args = JSON.parse(String(k).slice(pre.length) || '{}'); } catch (e) { return; }
          var nd = fn(d, args); if (nd === undefined) return;
          r.body = JSON.stringify(nd); return put('reads', r, k);
        });
      }));
    });
  }
  var brk = {};   /* the open shift's breaks as this device last saw them, for the kept answer */
  function breakState(a, at) {
    var b = brk.cur || { open: null, breaks: [], lunch_sec: 0, break_sec: 0 };
    b = JSON.parse(JSON.stringify(b));
    if (a.p_action === 'start') { b.open = { id: 'q-' + Date.now(), kind: a.p_kind || 'break', at: at }; b.breaks.push({ kind: a.p_kind || 'break', at: at, end: null }); }
    if (a.p_action === 'end' && b.open) {
      var sec = Math.round((Date.parse(at) - Date.parse(b.open.at)) / 1000);
      b[b.open.kind === 'lunch' ? 'lunch_sec' : 'break_sec'] += Math.max(0, sec);
      b.breaks.forEach(function (x) { if (!x.end && x.at === b.open.at) x.end = at; });
      b.open = null;
    }
    brk.cur = b; return b;
  }
  function patchFor(fn, a, user, at) {
    a = a || {};
    if (fn === 'crew_clock_at') {
      return patchRpc('crew_me', user, function (me) {
        if (!me || typeof me !== 'object') return;
        if (a.p_kind === 'in') me.open = { id: 'q-' + Date.now(), job_id: a.p_job || '', job_name: a.p_job_name || '', at: at, on_site: a.p_on_site == null ? null : !!a.p_on_site };
        else me.open = null;
        return me;
      }).then(function () {
        if (a.p_kind === 'in') brk.cur = { open: null, breaks: [], lunch_sec: 0, break_sec: 0 };
        return patchRpc('crew_break', user, function (d, args) { if (args.p_action !== 'state') return; return a.p_kind === 'in' ? { ok: true, on: true, open: null, breaks: [], lunch_sec: 0, break_sec: 0 } : { ok: true, on: false }; });
      });
    }
    if (fn === 'crew_break_at') {
      var st = brk.cur;
      return patchRpc('crew_break', user, function (d, args) { if (args.p_action !== 'state') return; return Object.assign({ ok: true, on: true }, st); });
    }
    if (fn === 'crew_finish') {
      return patchRpc('crew_checklist', user, function (d, args) { if (!d || args.p_job !== a.p_job) return; d.doneAt = at; return d; });
    }
  }
  /* the crew app tells us its checklist after a queued tick, so the kept copy matches */
  function patchChecklist(job, list) {
    return patchRpc('crew_checklist', who(), function (d, args) { if (!d || args.p_job !== job) return; d.checklist = list; return d; });
  }
  /* remember the open shift's breaks whenever the server tells us */
  function noteBreak(d) { if (d && d.on) brk.cur = { open: d.open || null, breaks: d.breaks || [], lunch_sec: d.lunch_sec || 0, break_sec: d.break_sec || 0 }; }

  /* ------------------------------------------------------- send it all --- */
  var state = { count: 0, sending: false, lastOk: 0, needSignIn: false, problems: [], keptUsed: false, justSynced: 0 };
  var timer = 0;
  function kick(ms) { clearTimeout(timer); timer = setTimeout(flush, ms || 0); }
  function token() {
    var sb = window.BP_SB;
    if (!sb || !sb.auth) return Promise.resolve(null);
    return Promise.resolve(sb.auth.getSession()).then(function (r) { var s = r && r.data && r.data.session; return s ? { t: s.access_token, id: s.user && s.user.id } : null; }).catch(function () { return null; });
  }
  function flush() {
    if (state.sending || !online()) return Promise.resolve();
    state.sending = true; paint();
    var sentAny = false;
    return all('queue').then(function (items) {
      if (!items.length) return;
      items.sort(function (x, y) { return x.id - y.id; });
      return token().then(function (tk) {
        if (!tk) { state.needSignIn = true; return; }
        state.needSignIn = false;
        var i = 0;
        var next = function () {
          var it = items[i++]; if (!it) return;
          if (it.user !== 'anon' && it.user !== tk.id) return next();   /* someone else's change: waits for them */
          var h = Object.assign({}, it.h, { authorization: 'Bearer ' + tk.t });
          return raw(it.url, { method: it.method, headers: h, body: giveBody(it.body) }).then(function (res) {
            if (res.status === 401 || res.status === 403 && /jwt/i.test(res.statusText || '')) { state.needSignIn = true; throw 'stop'; }
            if (res.status >= 500 || res.status === 408 || res.status === 429) throw 'stop';
            return res.text().then(function (txt) {
              var bad = !res.ok, why = '';
              if (res.ok) { try { var d = JSON.parse(txt); if (d && d.ok === false && d.error && !/already clocked in|not clocked in|already on a break|not on a break/.test(d.error)) { bad = true; why = d.error; } } catch (e) {} }
              else { why = 'HTTP ' + res.status; }
              /* "already clocked in" and the like: the server already has it, nothing to do */
              var done = bad ? put('failed', { at: Date.now(), label: it.label, why: why, url: it.url }) : Promise.resolve();
              return done.then(function () { return del('queue', it.id); }).then(function () { sentAny = true; if (bad) state.problems.push(it.label + ': ' + why); return next(); });
            });
          }, function () { throw 'stop'; });
        };
        return next();
      });
    }).catch(function () {}).then(function () {
      state.sending = false;
      return refresh().then(function () {
        if (sentAny) { state.lastOk = Date.now(); if (!state.count) state.justSynced = Date.now(); window.dispatchEvent(new CustomEvent('bp-offline-synced')); }
        if (state.count && online()) kick(30000);   /* something is still waiting: try again in a bit */
        paint();
      });
    });
  }
  var extra = [];   /* other waiting things (portal/quote.js outbox): functions that return a count */
  function extraCount() { return extra.reduce(function (t, f) { try { return t + (+f() || 0); } catch (e) { return t; } }, 0); }
  function refresh() { return keys('queue').then(function (ks) { state.count = ks.length + extraCount(); paint(); }).catch(function () {}); }

  /* ------------------------------------------------------------ the pill --- */
  var pill = null;
  function paint() {
    if (!document.body) return;
    if (!pill) {
      pill = document.createElement('button'); pill.type = 'button'; pill.id = 'bpSync'; pill.setAttribute('aria-live', 'polite');
      pill.onclick = function () { if (online()) kick(0); };
      document.body.appendChild(pill);
      var css = document.createElement('style'); css.textContent =
        '#bpSync{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translate(-50%,12px);z-index:2600;display:none;align-items:center;gap:8px;' +
        'padding:8px 14px 8px 11px;border-radius:999px;border:1px solid rgba(0,111,255,.16);background:rgba(255,255,255,.96);color:#0b1a33;font:600 13px/1.2 Inter,system-ui,sans-serif;' +
        'box-shadow:0 10px 28px -12px rgba(0,30,80,.35);cursor:pointer;opacity:0;transition:opacity .25s,transform .35s cubic-bezier(.22,1,.36,1)}' +
        '#bpSync.show{display:inline-flex;opacity:1;transform:translate(-50%,0)}' +
        '#bpSync i{width:9px;height:9px;border-radius:50%;background:#006fff;flex:none}' +
        '#bpSync.off i{background:#8a97ab}#bpSync.wait i{background:#006fff;animation:bpSyncP 1.2s ease-in-out infinite}#bpSync.ok i{background:#16C79A}#bpSync.bad i{background:#e5484d}' +
        '#bpSync small{font-weight:500;color:#5b6b82}' +
        '@keyframes bpSyncP{50%{opacity:.35}}' +
        '#bpx.bp-m ~ #bpSync,body:has(#bpx.bp-m.open) #bpSync{bottom:calc(84px + env(safe-area-inset-bottom))}' +
        'body:has(#bpx.bpx-dark) #bpSync{background:rgba(16,22,34,.96);color:#e8eef8;border-color:rgba(255,255,255,.1)}body:has(#bpx.bpx-dark) #bpSync small{color:#9fb0c6}' +
        '@media (prefers-reduced-motion:reduce){#bpSync,#bpSync i{animation:none;transition:none}}';
      document.head.appendChild(css);
    }
    var appOpen = !!document.querySelector('#bpx.open');
    var n = state.count, txt = '', cls = '';
    var banner = document.getElementById('bpNet');   /* portal/appfeel.js already says "You're offline": no second notice */
    if (!online() && banner && /show/.test(banner.className)) { cls = 'off'; txt = ''; }
    else if (!online()) { cls = 'off'; txt = 'Offline' + (n ? ' <small>&middot; ' + n + (n === 1 ? ' change' : ' changes') + ' saved on this phone</small>' : ' <small>&middot; showing what was saved</small>'); }
    else if (state.needSignIn && n) { cls = 'bad'; txt = 'Sign in again to send ' + n + (n === 1 ? ' change' : ' changes'); }
    else if (n) { cls = 'wait'; txt = (state.sending ? 'Syncing ' : '') + n + (n === 1 ? ' change' : ' changes') + ' waiting to sync'; }
    else if (state.justSynced && Date.now() - state.justSynced < 4000) { cls = 'ok'; txt = 'All synced'; setTimeout(paint, 4100); }
    pill.className = cls + (txt && appOpen ? ' show' : '');
    pill.innerHTML = txt ? '<i></i><span>' + txt + '</span>' : '';
  }

  /* --------------------------------------------------------- the clock --- */
  window.addEventListener('online', function () { paint(); kick(1500); });
  window.addEventListener('offline', paint);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && online()) kick(800); });
  setInterval(function () { if (state.count && online()) kick(0); }, 60000);
  function boot() { refresh().then(function () { paint(); if (online()) kick(3000); }); setInterval(paint, 5000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  /* keep the kept answers from growing forever: drop what's older than three weeks */
  setTimeout(function () {
    all('reads').then(function () {}).catch(function () {});
    db().then(function (d) {
      var t = d.transaction('reads', 'readwrite'), s = t.objectStore('reads'), cut = Date.now() - 21 * 864e5;
      s.openCursor().onsuccess = function (e) { var c = e.target.result; if (!c) return; if (!c.value || c.value.at < cut) c.delete(); c.continue(); };
    }).catch(function () {});
  }, 20000);

  /* hand the service worker the list of every file this visit used, so the app can open
     offline next time without anyone opening things ahead of time (sw.js 'warm') */
  function warm() {
    if (!('serviceWorker' in navigator) || !online()) return;
    var urls = [location.origin + '/app.html'].concat((performance.getEntriesByType ? performance.getEntriesByType('resource') : []).map(function (e) { return e.name; }));
    navigator.serviceWorker.ready.then(function (reg) { if (reg && reg.active) reg.active.postMessage({ type: 'warm', urls: urls }); }).catch(function () {});
  }
  window.addEventListener('load', function () { setTimeout(warm, 8000); setTimeout(warm, 90000); });

  window.bpOffline = {
    online: online, count: function () { return state.count; }, flush: function () { return flush(); },
    patchChecklist: patchChecklist, noteBreak: noteBreak,
    addCounter: function (f) { extra.push(f); refresh(); }, refresh: function () { return refresh(); },
    /* the signed-in person's last confirmed role, for starting up with no signal */
    who: who, problems: function () { return state.problems.slice(); }
  };
})();
