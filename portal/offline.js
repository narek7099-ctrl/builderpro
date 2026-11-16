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
  var WRITE_TABLE = { team_messages: 1, calendar_notes: 1, contacts: 1, inspection_reports: 1, time_entries: 1, assets: 1 };
  /* rows that may be edited offline (round three) */
  var PATCH_TABLE = { contacts: 1, inspection_reports: 1, calendar_notes: 1, roof_checks: 1, notifications: 1, assets: 1 };
  /* rows that may be removed offline (round four) */
  var DELETE_TABLE = { calendar_notes: 1, inspection_reports: 1, time_entries: 1 };
  /* server functions whose changes may wait (round three): calendar bookings, and starting
     the AI's first text to a new lead (it sends when the signal returns, as if tapped then) */
  function fnWrite(name, b) {
    if (name === 'ghl-calendar') return /^(create|update|delete|cancel)$/.test(String(b.action || ''));
    if (name === 'lead-in') return b.op === 'push';
    /* round four: a reply to a customer waits in the outbox (bulk sends stay online-only, see app.html) */
    if (name === 'ghl-messaging') return b.action === 'send';
    return false;
  }
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
      if (method !== 'POST') return 'pass';
      var b0 = {}; try { b0 = JSON.parse(body || '{}') || {}; } catch (e) { return 'pass'; }
      /* the AI team's own lists (status, tasks, conversations, approvals) are just reads; anything that asks the AI still needs a signal */
      if (m[1] === 'ai-team') return /^(status|tasks|threads|thread|approvals)$/.test(String(b0.op || '')) ? 'read' : 'pass';
      if (NEVER_FN.test(m[1])) return 'pass';
      var verb = String(b0.action || b0.op || (b0.view ? 'view' : '') || '').toLowerCase();
      if (fnWrite(m[1], b0)) return 'write';
      return /^(list|get|search|view|load|status|state|history|thread|threads|messages|events|summary|stats|contacts|calendar|slots)$|_list$/.test(verb) ? 'read' : 'pass';
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
      return (WRITE_TABLE[m[1]] && method === 'POST') || (PATCH_TABLE[m[1]] && method === 'PATCH') || (DELETE_TABLE[m[1]] && method === 'DELETE') ? 'write' : 'pass';
    }
    if (/^\/storage\/v1\/object\/project-files\//.test(p) && (method === 'POST' || method === 'PUT')) return 'write';
    /* a photo's viewing link: the kept one still works offline, because sw.js keeps the photo itself */
    if (/^\/storage\/v1\/object\/sign\/project-files\//.test(p) && method === 'POST') return 'read';
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
  function keepRead(key, res, req) {
    return res.clone().text().then(function (txt) {
      if (txt.length > 1500000) return;   /* a huge answer isn't worth keeping */
      var h = {}; ['content-type', 'content-range'].forEach(function (n) { var v = res.headers.get(n); if (v) h[n] = v; });
      return get('reads', key).then(function (old) {
        /* req: how it was asked for (no sign-in token), so it can be refreshed in the background (round nine) */
        return put('reads', { at: Date.now(), status: res.status, h: h, body: txt, req: req || (old && old.req) || null, n: ((old && old.n) || 0) + (req ? 1 : 0) }, key);
      });
    }).catch(function () {});
  }
  function reqOf(u, method, headers, body) {
    var h = Object.assign({}, headers); delete h.authorization; delete h['content-length'];
    return { url: u.href, method: method, h: h, body: textOf(body) };
  }
  /* ------------------------------------------------------- weak signal --- */
  /* The phone says it's online but answers are slow or don't come (round nine). After one slow or
     failed answer, for a minute: screens get the kept answer at once and it's refreshed quietly
     behind them, and changes go straight to the queue. The first quick answer ends it. */
  function weak() { return !!state.weak && Date.now() - state.weak < 60000 && online(); }
  /* t0: when the slow request started; one that began before the last quick answer says nothing new */
  function markWeak(t0) { if (!online() || (t0 && t0 < state.goodAt)) return; var was = weak(); state.weak = Date.now(); if (!was) paint(); }
  function markGood(ms) { if (ms >= 2500) return; state.goodAt = Date.now(); if (state.weak) { state.weak = 0; paint(); kick(500); } }
  function fromKept(key) {
    return get('reads', key).then(function (r) {
      if (!r) return null;
      var h = Object.assign({}, r.h, { 'x-bp-offline': 'kept' });
      state.keptUsed = true; state.keptAt = r.at || state.keptAt; paint();
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
    /* the Supabase library retries a table read that fails, so with no signal each one waited about
       7 seconds: answer "offline" at once and the screen shows its own "couldn't load" (round eight) */
    var tableRead = u.origin === SB && /^\/rest\/v1\//.test(u.pathname) && (method === 'GET' || method === 'HEAD');
    /* 504, not 503: the library retries 503 (and network errors) three times, about 7 seconds */
    var offAnswer = function () { return reply(504, { code: 'offline', message: 'You’re offline', details: '', hint: '' }, 'offline'); };
    if (k === 'pass') return tableRead && !online() ? Promise.resolve(offAnswer()) : raw(input, init);
    var user = who();
    if (k === 'read') {
      var key = readKey(user, method, u.href, textOf(body));
      var req = reqOf(u, method, headers, body);
      if (!online()) return fromKept(key).then(function (r) { return r || (tableRead ? offAnswer() : raw(input, init)); });
      var live = function () {
        var t0 = Date.now();
        return withTimeout(raw(input, init), 9000).then(function (res) {
          if (res.ok) { keepRead(key, res, req); state.lastOk = Date.now(); markGood(Date.now() - t0); }
          /* a server function's "not set up / not connected" answer (403, 404, 409) is kept too, so the screen says the same thing offline (round eight) */
          else if ((res.status === 403 || res.status === 404 || res.status === 409) && /\/functions\/v1\//.test(u.pathname)) keepRead(key, res, req);
          return res;
        }, function (err) {
          if (!(err && err.name === 'AbortError')) markWeak(t0);
          return fromKept(key).then(function (r) { if (r) return r; throw err; });
        });
      };
      if (weak()) return fromKept(key).then(function (r) {
        if (!r) return live();
        /* the kept answer now; a fresh one is fetched behind it for next time */
        var t0 = Date.now();
        withTimeout(raw(input, init), 15000).then(function (res) { if (res.ok) { keepRead(key, res, req); markGood(Date.now() - t0); } }, function () { markWeak(t0); });
        return r;
      });
      return live();
    }
    /* a change: straight through when the signal is good, queued when it isn't */
    var queueIt = function () { return enqueue(u, method, headers, body, user); };
    if (!online() || weak()) return queueIt();
    var t1 = Date.now();
    return withTimeout(raw(input, init), 15000).then(function (res) { state.lastOk = Date.now(); markGood(Date.now() - t1); return res; }, function (err) {
      if (err && err.name === 'AbortError') throw err;
      markWeak(t1);
      return queueIt();
    });
  };

  /* ---------------------------------------------------------- the queue --- */
  var lastQ = '';
  function enqueue(u, method, headers, body, user) {
    lastQ = 'q-' + Date.now();
    var at = new Date().toISOString(), url = u.href, fn = rpcName(url), txt = textOf(body), args = null;
    if (fn) { try { args = JSON.parse(txt || '{}'); } catch (e) { args = {}; } }
    /* clock and break taps keep the moment they were tapped */
    if (fn === 'crew_clock') { url = url.replace('/rpc/crew_clock', '/rpc/crew_clock_at'); args.p_at = at; txt = JSON.stringify(args); body = txt; fn = 'crew_clock_at'; }
    if (fn === 'crew_break') { url = url.replace('/rpc/crew_break', '/rpc/crew_break_at'); args.p_at = at; if (!('p_kind' in args)) args.p_kind = 'break'; txt = JSON.stringify(args); body = txt; fn = 'crew_break_at'; }
    /* a booking made with no signal, then moved or cancelled before it was sent: change the waiting one */
    if (/\/functions\/v1\/ghl-calendar/.test(u.pathname)) {
      var cb = {}; try { cb = JSON.parse(txt || '{}') || {}; } catch (e) {}
      if (cb.action !== 'create' && /^q-/.test(String(cb.id || ''))) return editQueued(cb, u, method, txt, user, at);
    }
    var tm = /^\/rest\/v1\/([a-z0-9_]+)/.exec(u.pathname), table = tm && !fn ? tm[1] : '';
    if (table && method === 'POST') {
      /* a new row gets its permanent id here, so later edits and links to it work before it is sent */
      try { var rows = JSON.parse(txt || 'null'), one = !Array.isArray(rows); if (rows) { (one ? [rows] : rows).forEach(function (r) { if (r && !r.id) r.id = uuid(); }); txt = JSON.stringify(rows); body = txt; } } catch (e) {}
    }
    if (table && (method === 'PATCH' || method === 'DELETE')) {
      return foldInto(table, u, method, txt, user, at, headers).then(function (r) { return r || addToQueue(); });
    }
    return addToQueue();
    function addToQueue() {
    var h = Object.assign({}, headers); delete h['content-length'];
    if (typeof FormData !== 'undefined' && body instanceof FormData) delete h['content-type'];
    var base = null;
    return (table && method === 'PATCH' ? baseFor(table, idOf(u), txt, user) : Promise.resolve(null)).then(function (b) { base = b; return keepBody(body); }).then(function (kb) {
      return put('queue', { qid: lastQ, at: Date.now(), user: user, url: url, method: method, h: h, body: kb, fn: fn, args: args, base: base, label: label(fn, u, args) + detail(txt) });
    }).then(function () {
      return Promise.resolve(fn ? patchFor(fn, args, user, at) : patchWrite(u, method, txt, user, at)).catch(function () {});
    }).then(function () {
      refresh(); kick(4000);
      return answerFor(fn, u, method, txt, args, at, h);
    });
    }
  }
  /* three-way merge: what this phone saw (base), what it has now (mine), what the server has (theirs).
     A change on one side only is taken; lists of items with ids merge item by item; where both sides
     changed the same thing differently, this phone's version is kept and the clash is noted. */
  function merge3(base, mine, theirs, path, clash) {
    path = path || []; clash = clash || [];
    if (same(mine, theirs)) return mine;
    if (same(base, mine)) return theirs;
    if (same(base, theirs)) return mine;
    var obj = function (v) { return v && typeof v === 'object' && !Array.isArray(v); };
    var idList = function (v) { return Array.isArray(v) && v.every(function (x) { return x && typeof x === 'object' && x.id != null; }); };
    if (obj(mine) && obj(theirs) && (base == null || obj(base))) {
      var out = {}, b = base || {};
      Object.keys(Object.assign({}, b, mine, theirs)).forEach(function (k) {
        if (SKIP_KEYS[k]) { out[k] = mine[k] !== undefined ? mine[k] : theirs[k]; return; }
        var v = merge3(b[k], mine[k], theirs[k], path.concat(k), clash);
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    if (idList(mine) && idList(theirs) && (base == null || idList(base))) {
      var by = function (l) { var m = {}; (l || []).forEach(function (x) { m[x.id] = x; }); return m; };
      var B = by(base), M = by(mine), T = by(theirs), res = [], seen = {};
      theirs.concat(mine).forEach(function (x) {
        if (seen[x.id]) return; seen[x.id] = 1;
        var bb = B[x.id], mm = M[x.id], tt = T[x.id];
        if (mm && tt) res.push(merge3(bb, mm, tt, path.concat(x.id), clash));
        else if (mm) { if (!(bb && same(bb, mm))) res.push(mm); }          /* removed there and untouched here: removed */
        else if (tt) { if (!(bb && same(bb, tt))) res.push(tt); }          /* removed here and untouched there: removed */
      });
      return res;
    }
    /* plain lists (photo links, tags): keep what either side added, drop what either side removed */
    var plain = function (v) { return Array.isArray(v) && v.every(function (x) { return x == null || typeof x !== 'object'; }); };
    if (plain(mine) && plain(theirs) && (base == null || plain(base))) {
      var bl = base || [], gone = {}, outl = [];
      bl.forEach(function (x) { if (mine.indexOf(x) < 0 || theirs.indexOf(x) < 0) gone[x] = 1; });
      theirs.concat(mine).forEach(function (x) { if (!gone[x] && outl.indexOf(x) < 0) outl.push(x); });
      return outl;
    }
    clash.push({ path: path, mine: mine, theirs: theirs });
    return mine;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function idOf(u) { var m = /[?&]id=eq\.([^&]+)/.exec(u.search); return m ? decodeURIComponent(m[1]) : ''; }
  /* an edit or removal of a row that is still waiting to be sent changes the waiting item instead
     (an inspection report typed with no signal autosaves often: one item, not hundreds) */
  function foldInto(table, u, method, txt, user, at, headers) {
    var id = idOf(u), patch = {}; try { patch = JSON.parse(txt || '{}') || {}; } catch (e) { return null; }
    var path = SB + '/rest/v1/' + table;
    return all('queue').then(function (items) {
      items = items.filter(function (x) { return x.user === user && x.url.indexOf(path) === 0 && /^\/rest\/v1\/[a-z0-9_]+$/.test(new URL(x.url).pathname) && new URL(x.url).pathname === '/rest/v1/' + table; });
      var ins = id && items.filter(function (x) { if (x.method !== 'POST') return false; try { var b = JSON.parse(x.body.v); return (Array.isArray(b) ? b[0] : b).id === id; } catch (e) { return false; } })[0];
      var same = items.filter(function (x) { return x.method === 'PATCH' && x.url === u.href; })[0];
      var step;
      if (method === 'DELETE') {
        if (!ins) return null;
        /* never sent: drop it and any edits to it */
        step = Promise.all(items.filter(function (x) { return x === ins || (x.method === 'PATCH' && idOf(new URL(x.url)) === id); }).map(function (x) { return del('queue', x.id); }));
      } else if (ins) {
        var b = JSON.parse(ins.body.v), row = Array.isArray(b) ? b[0] : b; Object.assign(row, patch);
        ins.body = { t: 'text', v: JSON.stringify(b) }; step = put('queue', ins);
      } else if (same) {
        var ob = {}; try { ob = JSON.parse(same.body.v) || {}; } catch (e) {}
        same.body = { t: 'text', v: JSON.stringify(Object.assign(ob, patch)) };
        /* fields this edit adds: what the phone saw before is still in the kept copy */
        step = baseFor(table, id, txt, user).then(function (b) {
          if (b && same.base) Object.keys(b).forEach(function (k) { if (!(k in same.base)) same.base[k] = b[k]; });
          return put('queue', same);
        });
      } else return null;
      return step.then(function () { return Promise.resolve(patchWrite(u, method, txt, user, at)).catch(function () {}); })
        .then(function () { refresh(); return answerFor('', u, method, txt, null, at, hdrs(headers)); });
    }).then(function (r) { return r || null; });
  }
  /* ------------------------------------------------- edits made in two places --- */
  /* records whose offline edits are checked against the server before they're sent (round seven) */
  var CHECK = { contacts: 1, inspection_reports: 1, calendar_notes: 1, roof_checks: 1, assets: 1 };
  var SKIP_KEYS = { updated_at: 1, created_at: 1, _mt: 1 };
  /* the row as this phone last saw it (newest kept copy), for the fields being changed */
  function baseFor(table, id, txt, user) {
    if (!CHECK[table] || !id) return Promise.resolve(null);
    var patch = {}; try { patch = JSON.parse(txt || '{}') || {}; } catch (e) { return Promise.resolve(null); }
    var pre = user + '|GET|' + SB + '/rest/v1/' + table + '?';
    return keys('reads').then(function (ks) {
      return Promise.all(ks.filter(function (k) { return String(k).indexOf(pre) === 0; }).map(function (k) { return get('reads', k); }));
    }).then(function (rs) {
      var best = null, at = -1;
      rs.forEach(function (r) {
        if (!r || r.at <= at) return; var d; try { d = JSON.parse(r.body); } catch (e) { return; }
        var row = (Array.isArray(d) ? d : [d]).filter(function (x) { return x && x.id === id; })[0];
        if (row) { best = row; at = r.at; }
      });
      if (!best) return null;
      var b = {}; Object.keys(patch).forEach(function (k) { if (!SKIP_KEYS[k] && k in best) b[k] = best[k]; });
      return Object.keys(b).length ? b : null;
    }).catch(function () { return null; });
  }
  /* compare values the way a person would: key order and empty/missing don't matter */
  function canon(v) {
    if (v === undefined || v === '') v = null;
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(function (k) { return !SKIP_KEYS[k]; }).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function same(a, b) { return canon(a) === canon(b); }
  /* before an offline edit is sent: was the record changed or removed by someone else meanwhile? */
  function precheck(it, tk) {
    if (it.method !== 'PATCH' || !it.base) return Promise.resolve('send');
    var u = new URL(it.url), id = idOf(u), t = u.pathname.split('/').pop(), ks = Object.keys(it.base);
    if (!id || !ks.length) return Promise.resolve('send');
    var mine = {}; try { mine = JSON.parse(it.body.v) || {}; } catch (e) { return Promise.resolve('send'); }
    var h = { apikey: it.h.apikey || '', authorization: 'Bearer ' + tk.t, accept: 'application/json' };
    return raw(SB + '/rest/v1/' + t + '?id=eq.' + encodeURIComponent(id) + '&select=' + ['id'].concat(ks).join(','), { headers: h }).then(function (res) {
      if (!res.ok) return 'send';   /* can't tell: send it as before */
      return res.json().then(function (rows) {
        if (!Array.isArray(rows)) return 'send';
        if (!rows.length) return put('failed', { kind: 'gone', at: Date.now(), queuedAt: it.at, label: it.label, user: it.user }).then(function () { return 'skip'; });
        var cur = rows[0], clash = [];
        ks.forEach(function (k) { if (!same(cur[k], it.base[k]) && !same(cur[k], mine[k])) clash.push({ k: k, mine: mine[k], theirs: cur[k] }); });
        if (!clash.length) return 'send';
        /* both changed the same thing: this phone's version is sent, the other one is offered back */
        return put('failed', { kind: 'clash', at: Date.now(), queuedAt: it.at, label: it.label, user: it.user, url: it.url, h: it.h, fields: clash }).then(function () { return 'send'; });
      });
    }, function () { throw 'stop'; });
  }
  var NAMES = { name: 'Name', phone: 'Phone', email: 'Email', address: 'Address', addr: 'Address', title: 'Title', body: 'Report text', status: 'Status', notes: 'Notes', note: 'Note',
    tags: 'Tags', text: 'Text', day: 'Day', at: 'Time', done: 'Done', photos: 'Photos', price: 'Price', amount: 'Amount', date: 'Date', start: 'Start', end: 'End', steps: 'Steps', crew: 'Crew' };
  function fieldName(path) {
    var k = String([].concat(path).filter(function (x) { return !/^\d+$/.test(String(x)); }).pop() || '');
    return NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');
  }
  function show(v) {
    if (v == null || v === '') return '(empty)';
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (Array.isArray(v)) return v.length + (v.length === 1 ? ' item' : ' items');
    if (typeof v === 'object') return (v.name || v.title || v.label || '(changed)') + '';
    var t = String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > 70 ? t.slice(0, 68) + '…' : t;
  }
  var theirsFns = {};   /* app.html: what "Use theirs" does for jobs and money (they live on the device) */
  function editQueued(cb, u, method, txt, user, at) {
    return all('queue').then(function (items) {
      var it = items.filter(function (x) { return x.qid === cb.id; })[0], step = Promise.resolve();
      if (it && cb.action === 'update') {
        var ob = {}; try { ob = JSON.parse((it.body && it.body.v) || '{}') || {}; } catch (e) {}
        ['title', 'address', 'startTime', 'endTime'].forEach(function (k) { if (cb[k] != null) ob[k] = cb[k]; });
        it.body = { t: 'text', v: JSON.stringify(ob) }; step = put('queue', it);
      } else if (it) step = del('queue', it.id);
      return step.then(function () { return patchWrite(u, method, txt, user, at); }).catch(function () {});
    }).then(function () { refresh(); return reply(200, { ok: true, queued: true }); });
  }
  /* which one: a name, a title or the start of a message, shown in the sync sheet */
  function detail(txt) {
    var b; try { b = JSON.parse(txt || 'null'); } catch (e) { return ''; }
    if (Array.isArray(b)) b = b[0];
    if (!b || typeof b !== 'object') return '';
    var d = b.name || b.title || b.contact_name || b.message || b.body || b.text || '';
    d = String(d).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return d ? ': ' + (d.length > 48 ? d.slice(0, 46) + '…' : d) : '';
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
    if (/\/rest\/v1\/contacts/.test(u.pathname)) return 'Contact';
    if (/inspection_reports/.test(u.pathname)) return 'Inspection report';
    if (/time_entries/.test(u.pathname)) return 'Hours';
    if (/roof_checks/.test(u.pathname)) return 'Roof check';
    if (/notifications/.test(u.pathname)) return 'Notification read';
    if (/\/rest\/v1\/assets/.test(u.pathname)) return 'Equipment';
    if (/ghl-messaging/.test(u.pathname)) return 'Message to a customer';
    if (/ghl-calendar/.test(u.pathname)) return 'Calendar booking';
    if (/lead-in/.test(u.pathname)) return 'First text to a new lead';
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
    if (/\/functions\/v1\//.test(u.pathname)) return reply(200, { ok: true, queued: true, sent: false, id: lastQ });
    if (method === 'PATCH' || method === 'DELETE') {
      /* an edit asked to hand back the row (.select()): the row as it is now on this phone */
      if (method === 'PATCH' && /return=representation/.test((h && h.prefer) || '')) {
        var ch = {}; try { ch = JSON.parse(txt || '{}') || {}; } catch (e) {}
        var r1 = Object.assign({}, ch, { updated_at: ch.updated_at || at }); var id1 = idOf(u); if (id1) r1.id = id1;
        return reply(200, /vnd\.pgrst\.object/.test((h && h.accept) || '') ? r1 : [r1]);
      }
      return new Response(null, { status: 204, headers: { 'x-bp-offline': 'queued' } });
    }
    if (/\/storage\/v1\/object\//.test(u.href)) {
      var path = u.pathname.replace(/^\/storage\/v1\/object\//, '');
      return reply(200, { Key: path, Id: 'queued', path: path.replace(/^project-files\//, '') });
    }
    /* a new row: hand back what was sent, as a row */
    var row; try { row = JSON.parse(txt || '{}'); } catch (e) { row = {}; }
    if (!Array.isArray(row)) row = [row];
    row.forEach(function (r) { if (!r.id) r.id = 'q-' + Date.now(); if (!r.created_at) r.created_at = at; if (!r.updated_at) r.updated_at = at; });
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
  /* does a row match the filters in an address (id=eq.x, status=is.null, or=(a.eq.1,b.eq.2), ...)?
     Filters it can't read count as a match. */
  function fits(row, url) {
    var q; try { q = new URL(url).searchParams; } catch (e) { return true; }
    var ok = true;
    q.forEach(function (v, k) {
      if (!ok || /^(select|order|limit|offset|on_conflict|columns)$/.test(k)) return;
      if (k === 'or') {
        var parts = v.replace(/^\(|\)$/g, '').split(','), any = false, known = false;
        parts.forEach(function (pt) { var m = /^([a-z0-9_]+)\.eq\.(.*)$/.exec(pt); if (m) { known = true; if (String(row[m[1]]) === m[2]) any = true; } });
        if (known && !any) ok = false; return;
      }
      if (!(k in row)) return;
      var m = /^(eq|neq|is|in)\.(.*)$/.exec(v); if (!m) return;
      var val = row[k];
      if (m[1] === 'eq') ok = String(val) === m[2];
      else if (m[1] === 'neq') ok = String(val) !== m[2];
      else if (m[1] === 'is') ok = m[2] === 'null' ? val == null : String(val) === m[2];
      else if (m[1] === 'in') ok = m[2].replace(/^\(|\)$/g, '').split(',').map(function (x) { return x.replace(/^"|"$/g, ''); }).indexOf(String(val)) >= 0;
    });
    return ok;
  }
  /* change every kept answer for one address (for this person): fn(data, sentBody) */
  function patchKept(method, urlStart, user, fn) {
    var pre = user + '|' + method + '|' + urlStart;
    return keys('reads').then(function (ks) {
      return Promise.all(ks.filter(function (k) { return String(k).indexOf(pre) === 0; }).map(function (k) {
        return get('reads', k).then(function (r) {
          if (!r) return; var rest = String(k).slice((user + '|' + method + '|').length), bar = rest.indexOf('|'), url = rest.slice(0, bar), sent = rest.slice(bar + 1);
          var d, b; try { d = JSON.parse(r.body); b = sent ? JSON.parse(sent) : {}; } catch (e) { return; }
          var nd = fn(d, b, url); if (nd === undefined) return;
          r.body = JSON.stringify(nd); return put('reads', r, k);
        });
      }));
    });
  }
  /* round three: new and edited contacts, and calendar bookings, show at once */
  function patchWrite(u, method, txt, user, at) {
    var b = {}; try { b = JSON.parse(txt || '{}') || {}; } catch (e) {}
    var tm = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(u.pathname);
    if (tm) {
      var t = tm[1], base = SB + '/rest/v1/' + t + '?';
      if (method === 'POST') {
        var rows = (Array.isArray(b) ? b : [b]).map(function (r) { return Object.assign({ created_at: at, updated_at: at }, t === 'contacts' ? { date_added: at, tags: [], ghl_id: '' } : {}, r); });
        return patchKept('GET', base, user, function (d, sent, url) {
          if (!Array.isArray(d)) return;
          var add = rows.filter(function (r) { return fits(r, url) && !d.some(function (x) { return x.id === r.id; }); });
          if (!add.length) return; return add.concat(d);
        });
      }
      return patchKept('GET', base, user, function (d) {
        if (!Array.isArray(d)) return;
        if (method === 'DELETE') return d.filter(function (x) { return !fits(x, u.href); });
        d.forEach(function (x) { if (fits(x, u.href)) Object.assign(x, b); }); return d;
      });
    }
    if (/\/functions\/v1\/ghl-messaging/.test(u.pathname) && b.action === 'send') {
      var mid = lastQ, conv = '';
      return patchKept('POST', SB + '/functions/v1/ghl-messaging', user, function (d, sent) {
        if (!d || sent.action !== 'list' || !Array.isArray(d.conversations)) return;
        d.conversations.forEach(function (c) { if (c.contactId === b.contactId) { conv = c.id; c.last = b.message || ''; c.lastDate = at; c.dir = 'outbound'; } });
        return d;
      }).then(function () {
        return patchKept('POST', SB + '/functions/v1/ghl-messaging', user, function (d, sent) {
          if (!d || sent.action !== 'thread' || !conv || sent.id !== conv || !Array.isArray(d.messages)) return;
          d.messages.push({ id: mid, dir: 'outbound', body: b.message || '', date: at, type: b.msgType === 'Email' ? 'TYPE_EMAIL' : 'TYPE_SMS', status: 'queued', activity: null });
          return d;
        });
      });
    }
    if (/\/functions\/v1\/ghl-calendar/.test(u.pathname)) {
      var qid = lastQ;
      return patchKept('POST', SB + '/functions/v1/ghl-calendar', user, function (d, sent) {
        if (!d || sent.action !== 'list' || !Array.isArray(d.events)) return;
        if (b.action === 'create') {
          if (b.cal && sent.cal && b.cal !== sent.cal) return;
          d.events.push({ id: qid, title: b.title || 'Appointment', contactId: b.contactId || null, start: b.startTime, end: b.endTime, status: 'confirmed', address: b.address || '', queued: true });
        } else if (b.action === 'update') {
          d.events.forEach(function (e) { if (e.id !== b.id) return; if (b.title != null) e.title = b.title; if (b.address != null) e.address = b.address; if (b.startTime) e.start = b.startTime; if (b.endTime) e.end = b.endTime; });
        } else { d.events = d.events.filter(function (e) { return e.id !== b.id; }); }
        return d;
      });
    }
  }
  /* the crew app tells us its checklist after a queued tick, so the kept copy matches */
  function patchChecklist(job, list) {
    return patchRpc('crew_checklist', who(), function (d, args) { if (!d || args.p_job !== job) return; d.checklist = list; return d; });
  }
  /* remember the open shift's breaks whenever the server tells us */
  function noteBreak(d) { if (d && d.on) brk.cur = { open: d.open || null, breaks: d.breaks || [], lunch_sec: d.lunch_sec || 0, break_sec: d.break_sec || 0 }; }

  /* ------------------------------------------------------- send it all --- */
  var state = { count: 0, failed: 0, weak: 0, goodAt: 0, sending: false, lastOk: 0, needSignIn: false, problems: [], keptUsed: false, keptAt: 0, justSynced: 0 };
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
          return precheck(it, tk).then(function (go) {
            if (go === 'skip') return del('queue', it.id).then(function () { sentAny = true; return next(); });
            return send();
          });
          function send() {
          var t2 = Date.now();
          return raw(it.url, { method: it.method, headers: h, body: giveBody(it.body) }).then(function (res) {
            if (res.status < 500) markGood(Date.now() - t2);
            if (res.status === 401 || res.status === 403 && /jwt/i.test(res.statusText || '')) { state.needSignIn = true; throw 'stop'; }
            if (res.status >= 500 || res.status === 408 || res.status === 429) throw 'stop';
            return res.text().then(function (txt) {
              var bad = !res.ok, why = '';
              if (res.ok) { try { var d = JSON.parse(txt); if (d && d.ok === false && d.error && !/already clocked in|not clocked in|already on a break|not on a break/.test(d.error)) { bad = true; why = d.error; } } catch (e) {} }
              else { why = 'HTTP ' + res.status; }
              /* "already clocked in" and the like: the server already has it, nothing to do */
              var done = bad ? put('failed', { at: Date.now(), queuedAt: it.at, label: it.label, why: friendlyWhy(why, txt), url: it.url, method: it.method, h: it.h, body: it.body, user: it.user, fn: it.fn, args: it.args }) : Promise.resolve();
              if (bad && window.bpToast) { try { bpToast(it.label + ' couldn’t be saved: ' + why, 'error'); } catch (e) {} }
              return done.then(function () { return del('queue', it.id); }).then(function () { sentAny = true; if (bad) state.problems.push(it.label + ': ' + why); return next(); });
            });
          }, function () { throw 'stop'; });
          }
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
  /* the server's reason, in words a person can use */
  function friendlyWhy(why, txt) {
    var m = ''; try { var d = JSON.parse(txt || '{}'); m = d.message || d.error || d.msg || ''; } catch (e) {}
    m = String(m || why || '');
    if (/duplicate key|already exists/i.test(m)) return 'it was already saved';
    if (/violates row-level security|permission|not allowed|403/i.test(m)) return 'your account isn’t allowed to make this change';
    if (/violates foreign key|not found|404/i.test(m)) return 'what it belongs to was removed';
    if (/invalid input syntax|violates check|violates not-null|400|422/i.test(m)) return 'something in it wasn’t filled in the way the server expects';
    return m.slice(0, 120) || 'the server didn’t accept it';
  }
  var extra = [];   /* other waiting things (portal/quote.js outbox): functions that return a count */
  function extraCount() { return extra.reduce(function (t, f) { try { return t + (+f() || 0); } catch (e) { return t; } }, 0); }
  function refresh() {
    var me = who();
    return Promise.all([all('queue'), all('failed')]).then(function (r) {
      state.count = r[0].filter(function (x) { return x.user === me || x.user === 'anon'; }).length + extraCount();
      var mineF = r[1].filter(function (x) { return !x.user || x.user === me; });
      state.failed = mineF.filter(function (x) { return !x.kind; }).length;
      state.clash = mineF.filter(function (x) { return x.kind; }).length;
      paint(); if (sheet) drawSheet();
    }).catch(function () {});
  }

  /* ------------------------------------------------------------ the pill --- */
  var pill = null;
  function paint() {
    if (!document.body) return;
    if (!pill) {
      pill = document.createElement('button'); pill.type = 'button'; pill.id = 'bpSync'; pill.setAttribute('aria-live', 'polite');
      pill.onclick = function () { if (online()) kick(0); openSheet(); };
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
    else if (!online()) { cls = 'off'; txt = 'Offline' + (n ? ' <small>&middot; ' + n + (n === 1 ? ' change' : ' changes') + ' saved on this phone</small>' : ' <small>&middot; showing what was saved' + (state.keptAt ? ' ' + ago(state.keptAt) : '') + '</small>'); }
    else if (weak()) { cls = 'off'; txt = 'Weak signal <small>&middot; ' + (n ? n + (n === 1 ? ' change' : ' changes') + ' waiting to send' : 'showing what was saved') + '</small>'; }
    else if (state.needSignIn && n) { cls = 'bad'; txt = 'Sign in again to send ' + n + (n === 1 ? ' change' : ' changes'); }
    else if (n) { cls = 'wait'; txt = (state.sending ? 'Syncing ' : '') + n + (n === 1 ? ' change' : ' changes') + ' waiting to sync'; }
    else if (state.clash && !state.failed) { cls = 'wait'; txt = state.clash + (state.clash === 1 ? ' change was' : ' changes were') + ' also made elsewhere <small>&middot; review</small>'; }
    else if (state.failed) { cls = 'bad'; txt = state.failed + (state.failed === 1 ? ' change' : ' changes') + ' couldn’t be saved <small>&middot; see why</small>'; }
    else if (state.justSynced && Date.now() - state.justSynced < 4000) { cls = 'ok'; txt = 'All synced'; setTimeout(paint, 4100); }
    pill.className = cls + (txt && appOpen ? ' show' : '');
    pill.innerHTML = txt ? '<i></i><span>' + txt + '</span>' : '';
  }

  /* ------------------------------------------- keep the kept copies fresh --- */
  /* While the signal is good (not on data saver or 2G), at most every 30 minutes, the answers this
     person uses most that are over 20 minutes old are fetched again quietly, one at a time (up to
     40), so what shows offline on a job site is recent. Table and server-function reads only;
     never anything that sends, charges or asks the AI (those are never kept in the first place). */
  var warming = false;
  function warmKept(force) {
    if (warming || !online() || weak() || document.hidden) return Promise.resolve(0);
    var c = navigator.connection; if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return Promise.resolve(0);
    var me = who(); if (me === 'anon') return Promise.resolve(0);
    var lk = 'bpWarmAt:' + me, last = 0; try { last = +(localStorage.getItem(lk) || 0); } catch (e) {}
    if (!force && Date.now() - last < 30 * 60000) return Promise.resolve(0);
    try { localStorage.setItem(lk, String(Date.now())); } catch (e) {}
    warming = true;
    return keys('reads').then(function (ks) {
      return Promise.all(ks.filter(function (k) { return String(k).indexOf(me + '|') === 0; }).map(function (k) { return get('reads', k).then(function (r) { return r && r.req ? { k: k, r: r } : null; }); }));
    }).then(function (list) {
      list = list.filter(function (x) { return x && x.r.status === 200 && Date.now() - x.r.at > 20 * 60000 && !/\/rest\/v1\/rpc\//.test(x.r.req.url); })
        .sort(function (a, b) { return (b.r.n || 1) - (a.r.n || 1) || b.r.at - a.r.at; }).slice(0, 40);
      return token().then(function (tk) {
        if (!tk || tk.id !== me) return 0;
        var done = 0, i = 0;
        var next = function () {
          var x = list[i++]; if (!x || !online() || weak() || document.hidden) return done;
          var q = x.r.req, h = Object.assign({}, q.h, { authorization: 'Bearer ' + tk.t }), t0 = Date.now();
          return withTimeout(raw(q.url, { method: q.method, headers: h, body: q.method === 'GET' || q.method === 'HEAD' ? undefined : (q.body || undefined) }), 15000)
            .then(function (res) { if (res.ok) { done++; markGood(Date.now() - t0); return keepRead(x.k, res, null); } }, function () { markWeak(t0); })
            .then(function () { return new Promise(function (r) { setTimeout(r, 250); }); }).then(next);
        };
        return next();
      });
    }).catch(function () { return 0; }).then(function (n) { warming = false; return n; });
  }
  setTimeout(function () { warmKept(); }, 25000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(function () { warmKept(); }, 5000); });

  /* ----------------------------------------------------------- the sheet --- */
  /* everything waiting to send, and anything the server refused (with Try again / Dismiss) */
  function ago(t) {
    var s = (Date.now() - t) / 1000, n;
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) { n = Math.round(s / 3600); return n + (n === 1 ? ' hour ago' : ' hours ago'); }
    n = Math.round(s / 86400); return n + (n === 1 ? ' day ago' : ' days ago');
  }
  function when(t) {
    var d = new Date(t), today = new Date().toDateString() === d.toDateString();
    return (today ? '' : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ') + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var sheet = null;
  function openSheet() {
    if (sheet) return;
    if (!document.getElementById('bpSyncCss')) {
      var css = document.createElement('style'); css.id = 'bpSyncCss'; css.textContent =
        '#bpSyncSh{position:fixed;inset:0;z-index:2700;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,21,48,.32);animation:bpShF .2s ease}' +
        '#bpSyncSh .c{width:100%;max-width:480px;max-height:82vh;overflow:auto;background:#fff;color:#0b1a33;border-radius:20px 20px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -12px 40px -16px rgba(0,30,80,.4);font:14px/1.45 Inter,system-ui,sans-serif;animation:bpShU .3s cubic-bezier(.22,1,.36,1)}' +
        '@media (min-width:700px){#bpSyncSh{align-items:center}#bpSyncSh .c{border-radius:20px}}' +
        '#bpSyncSh h3{margin:0 0 4px;font-size:18px;letter-spacing:-.01em}#bpSyncSh .st{margin:0 0 14px;color:#5b6b82}' +
        '#bpSyncSh h4{margin:16px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#5b6b82}' +
        '#bpSyncSh ul{list-style:none;margin:0;padding:0}#bpSyncSh li{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid #e8edf4}' +
        '#bpSyncSh li i{width:8px;height:8px;border-radius:50%;background:#006fff;margin-top:6px;flex:none}#bpSyncSh li.bad i{background:#e5484d}' +
        '#bpSyncSh li div{flex:1;min-width:0}#bpSyncSh li b{font-weight:600}#bpSyncSh li small{display:block;color:#5b6b82}' +
        '#bpSyncSh .acts{display:flex;gap:6px;margin-top:6px}#bpSyncSh .acts button,#bpSyncSh .foot button{border:1px solid #d9e2ee;background:#fff;color:#0b1a33;border-radius:9px;padding:6px 11px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}' +
        '#bpSyncSh .foot{display:flex;gap:8px;margin-top:18px}#bpSyncSh .foot button{flex:1;padding:11px}#bpSyncSh .foot .pri{background:#006fff;border-color:#006fff;color:#fff}' +
        '#bpSyncSh .none{color:#5b6b82;padding:8px 0}' +
        'body:has(#bpx.bpx-dark) #bpSyncSh .c{background:#101622;color:#e8eef8}body:has(#bpx.bpx-dark) #bpSyncSh li{border-color:#222b3a}' +
        'body:has(#bpx.bpx-dark) #bpSyncSh .st,body:has(#bpx.bpx-dark) #bpSyncSh h4,body:has(#bpx.bpx-dark) #bpSyncSh li small,body:has(#bpx.bpx-dark) #bpSyncSh .none{color:#9fb0c6}' +
        'body:has(#bpx.bpx-dark) #bpSyncSh .acts button,body:has(#bpx.bpx-dark) #bpSyncSh .foot button:not(.pri){background:#161d2b;border-color:#2a3446;color:#e8eef8}' +
        '@keyframes bpShF{from{opacity:0}}@keyframes bpShU{from{transform:translateY(24px);opacity:.6}}' +
        '@media (prefers-reduced-motion:reduce){#bpSyncSh,#bpSyncSh .c{animation:none}}';
      document.head.appendChild(css);
    }
    sheet = document.createElement('div'); sheet.id = 'bpSyncSh'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Sync');
    sheet.innerHTML = '<div class="c"></div>';
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet) return closeSheet();
      var b = e.target.closest && e.target.closest('button[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a'), id = +b.getAttribute('data-id');
      if (a === 'close') closeSheet();
      else if (a === 'send') { kick(0); setTimeout(refresh, 400); }
      else if (a === 'retry') get('failed', id).then(function (f) {
        if (!f || !f.method) return;
        var it = { qid: '', at: Date.now(), user: f.user || who(), url: f.url, method: f.method, h: f.h, body: f.body, fn: f.fn, args: f.args, label: f.label };
        return put('queue', it).then(function () { return del('failed', id); }).then(function () { state.problems = []; refresh(); if (online()) kick(300); });
      });
      else if (a === 'dismiss') del('failed', id).then(refresh);
      else if (a === 'theirs') get('failed', id).then(function (f) {
        if (!f) return;
        var done = function () { return del('failed', id).then(function () { refresh(); if (online()) kick(300); }); };
        if (f.kind === 'clash-job') { var fn = theirsFns[f.store]; return Promise.resolve(fn ? fn(f) : null).then(done); }
        /* a record: send the other person's values back */
        var back = {}; (f.fields || []).forEach(function (fl) { back[fl.k] = fl.theirs === undefined ? null : fl.theirs; });
        var hh = Object.assign({}, f.h); delete hh.prefer;
        return put('queue', { qid: '', at: Date.now(), user: f.user || who(), url: f.url, method: 'PATCH', h: hh, body: { t: 'text', v: JSON.stringify(back) }, label: f.label }).then(function () {
          return patchWrite(new URL(f.url), 'PATCH', JSON.stringify(back), f.user || who(), new Date().toISOString());
        }).then(done);
      });
    });
    document.addEventListener('keydown', escClose);
    document.body.appendChild(sheet);
    drawSheet();
  }
  function escClose(e) { if (e.key === 'Escape') closeSheet(); }
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; document.removeEventListener('keydown', escClose); } }
  function drawSheet() {
    if (!sheet) return;
    var me = who();
    Promise.all([all('queue'), all('failed')]).then(function (r) {
      if (!sheet) return;
      var q = r[0].filter(function (x) { return x.user === me || x.user === 'anon'; }).sort(function (a, b) { return a.id - b.id; });
      var all1 = r[1].filter(function (x) { return !x.user || x.user === me; }).sort(function (a, b) { return b.at - a.at; });
      var f = all1.filter(function (x) { return !x.kind; }), c = all1.filter(function (x) { return x.kind; });
      var more = extraCount();
      var st = !online() ? 'You’re offline.' + (state.keptAt ? ' Showing what was saved ' + ago(state.keptAt) + '.' : '') + ' Changes are kept on this phone and sent when you’re back.'
        : weak() ? 'Weak signal. Showing what was saved; changes are kept and sent as soon as the signal is good.'
        : state.needSignIn && q.length ? 'Sign in again to send these.'
        : state.sending ? 'Sending now…'
        : q.length || more ? 'These send by themselves in a moment.' : f.length || c.length ? 'Nothing is waiting to send.' : 'Everything is synced.';
      var h = '<h3>Sync</h3><p class="st">' + esc(st) + '</p>';
      if (c.length) {
        h += '<h4>Changed in two places (' + c.length + ')</h4><ul>' + c.map(function (x) {
          var what = x.kind === 'gone'
            ? 'Someone else removed it while you were offline, so your change wasn’t saved.'
            : 'Also changed by someone else while you were offline. Yours was kept. ' + (x.fields || []).map(function (fl) { return esc(fieldName(fl.path || fl.k)) + ': yours “' + esc(show(fl.mine)) + '”, theirs “' + esc(show(fl.theirs)) + '”'; }).join('; ') + '.';
          return '<li><i></i><div><b>' + esc(x.label || 'Change') + '</b><small>' + (x.queuedAt ? 'Made ' + esc(when(x.queuedAt)) + ' · ' : '') + what + '</small>' +
            '<div class="acts">' + (x.kind !== 'gone' ? '<button type="button" data-a="theirs" data-id="' + x.id + '">Use theirs</button>' : '') + '<button type="button" data-a="dismiss" data-id="' + x.id + '">' + (x.kind === 'gone' ? 'OK' : 'Keep mine') + '</button></div></div></li>';
        }).join('') + '</ul>';
      }
      if (q.length || more || (!f.length && !c.length)) h += '<h4>Waiting to send' + (q.length + more ? ' (' + (q.length + more) + ')' : '') + '</h4>';
      if (!q.length && !more) { if (!f.length && !c.length) h += '<div class="none">Nothing waiting.</div>'; }
      else {
        h += '<ul>' + q.map(function (x) { return '<li><i></i><div><b>' + esc(x.label || 'Change') + '</b><small>Made ' + esc(when(x.at)) + '</small></div></li>'; }).join('');
        if (more) h += '<li><i></i><div><b>' + more + (more === 1 ? ' estimate or invoice' : ' estimates and invoices') + ' in the outbox</b><small>Sent with the normal Send when the signal is back</small></div></li>';
        h += '</ul>';
      }
      if (f.length) {
        h += '<h4>Couldn’t be saved (' + f.length + ')</h4><ul>' + f.map(function (x) {
          return '<li class="bad"><i></i><div><b>' + esc(x.label || 'Change') + '</b><small>' + (x.queuedAt ? 'Made ' + esc(when(x.queuedAt)) + ' · ' : '') + 'refused ' + esc(ago(x.at)) + ': ' + esc(x.why || 'the server didn’t accept it') + '</small>' +
            '<div class="acts">' + (x.method ? '<button type="button" data-a="retry" data-id="' + x.id + '">Try again</button>' : '') + '<button type="button" data-a="dismiss" data-id="' + x.id + '">Dismiss</button></div></div></li>';
        }).join('') + '</ul>';
      }
      h += '<div class="foot">' + (online() && q.length ? '<button type="button" class="pri" data-a="send">Send now</button>' : '') + '<button type="button" data-a="close">Close</button></div>';
      sheet.firstChild.innerHTML = h;
    }).catch(function () {});
  }

  /* --------------------------------------------------------- the clock --- */
  window.addEventListener('online', function () { paint(); kick(1500); });
  window.addEventListener('offline', paint);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && online()) kick(800); });
  setInterval(function () { if (state.count && online()) kick(0); }, 60000);
  function boot() {
    refresh().then(function () { paint(); if (online()) kick(3000); }); setInterval(paint, 5000);
    try {
      if (who() !== 'anon' && navigator.storage && navigator.storage.persist && !/firefox/i.test(navigator.userAgent))
        navigator.storage.persisted().then(function (p) { if (!p) return navigator.storage.persist(); }).catch(function () {});
    } catch (e) {}
  }
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
    who: who, problems: function () { return state.problems.slice(); },
    open: openSheet, failedCount: function () { return state.failed; },
    weak: weak, warmNow: function () { return warmKept(true); },
    /* app.html: a job or money entry changed here and elsewhere ({ store, itemId, label, fields: [{ path, mine, theirs }] }) */
    clash: function (c) { var r = Object.assign({ kind: 'clash-job', at: Date.now(), user: who() }, c); delete r.id; return put('failed', r).then(refresh).catch(function () {}); },
    onTheirs: function (store, fn) { theirsFns[store] = fn; },
    merge3: merge3,
    /* a link to a file still waiting to upload (path inside project-files), or '' */
    localFile: function (path) {
      return all('queue').then(function (items) {
        var it = items.filter(function (x) { return x.url.indexOf('/storage/v1/object/project-files/' + path) > 0 || decodeURIComponent(x.url).indexOf('/storage/v1/object/project-files/' + path) > 0; })[0];
        if (!it || !it.body) return '';
        var f = it.body.t === 'blob' ? it.body.v : it.body.t === 'form' ? (it.body.v.filter(function (p) { return p.f; })[0] || {}).f : null;
        return f ? URL.createObjectURL(f) : '';
      }).catch(function () { return ''; });
    }
  };
})();
