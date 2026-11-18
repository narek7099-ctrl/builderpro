/* Error reporting (2026-11-18): when something breaks on someone's phone or computer, a short
   report reaches the Command Center ("App errors") without anyone having to email support.

   Loaded first in the page head, so it sees errors from everything after it.

   What is sent: the error message and the top of its stack, the screen that was open, the
   page path (no query string, no hash), the app version, the browser, and whether the device
   was online. Before it leaves the device, emails, phone numbers, sign-in tokens, ids and
   query strings are removed (the database removes them again). No form contents, no job
   data, no names.

   Not sent (noise, not bugs): browser extensions, "Script error." from other sites, the
   ResizeObserver warning, cancelled requests, and network drops (bad signal is handled by
   the offline layer). At most 10 reports per page load, the same one once.

   Offline: reports wait on the device (at most 20) and go when the connection comes back.

   Database side: public.bp_report_error() in supabase/migrations/20261118000002_client_errors.sql */
(function () {
  'use strict';
  if (window.bpErrors) return;
  var SB = 'https://ttzwzouhiwdwamuimhpo.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0end6b3VoaXdkd2FtdWltaHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTc2NjgsImV4cCI6MjA5ODY5MzY2OH0.oVqdHZlZLWJd_8nkgPRA9VgAqY4ytg51N1mT3Hqekso';
  var AUTH_KEY = 'sb-ttzwzouhiwdwamuimhpo-auth-token';
  var QKEY = 'bpErrQ';
  /* the page's own fetch, before the offline layer wraps it: a report is never queued as a data write */
  var rawFetch = window.fetch ? window.fetch.bind(window) : null;
  var seen = {}, sent = 0, MAX = 10, sending = false;

  function scrub(t, n) {
    t = String(t == null ? '' : t)
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
      .replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){0,2}/g, '<token>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
      .replace(/\b(sk|pk|rk|whsec|sb)_[A-Za-z0-9_]{12,}/g, '<key>')
      .replace(/[A-Za-z0-9_-]{32,}/g, '<long>')
      .replace(/\+?\d[\d ().-]{8,}\d/g, '<number>')
      .replace(/([?#])[^\s)'"]*/g, '');
    return n ? t.slice(0, n) : t;
  }
  /* the app version: the newest ?v= on the page's own scripts and styles */
  function appVer() {
    var best = '';
    try {
      var els = document.querySelectorAll('script[src],link[rel=stylesheet][href]');
      for (var i = 0; i < els.length; i++) {
        var m = /[?&]v=([A-Za-z0-9._-]+)/.exec(els[i].getAttribute('src') || els[i].getAttribute('href') || '');
        if (m && /^20\d{6}/.test(m[1]) && m[1] > best) best = m[1];
      }
    } catch (e) {}
    return best;
  }
  function area() {
    try {
      if (document.querySelector('#bpx.open') || /^\/(app|command)/.test(location.pathname) || /[?&]portal=/.test(location.search)) return 'app';
    } catch (e) {}
    return 'site';
  }
  function token() {
    try {
      var s = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      if (s && s.access_token && (!s.expires_at || s.expires_at > Date.now() / 1000 + 30)) return s.access_token;
    } catch (e) {}
    return '';
  }
  function noise(msg, src, stack) {
    var all = msg + ' ' + (src || '') + ' ' + (stack || '');
    if (/(chrome|moz|safari(-web)?|ms-browser)-extension:\/\//i.test(all)) return true;
    if (/^(\w*Error: )?Script error\.?$/i.test(msg)) return true;
    if (/ResizeObserver loop/i.test(msg)) return true;
    if (/AbortError|The (user|operation) (aborted|was aborted)|signal is aborted/i.test(msg)) return true;
    /* a dropped connection is not a bug; the offline layer deals with it */
    if (/^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|Network request failed|cancelled|The network connection was lost\.?|The Internet connection appears to be offline\.?)$/i.test(msg)) return true;
    if (/FetchError|Failed to fetch dynamically imported module/i.test(msg) && !navigator.onLine) return true;
    /* the auth library refreshing a session while the phone has no signal */
    if (/AuthRetryableFetchError|AuthSessionMissingError/i.test(msg)) return true;
    /* the Google tag and other outside scripts */
    if (src && /googletagmanager|google-analytics|gtag\/js|doubleclick|facebook\.net|hotjar|clarity\.ms/i.test(src)) return true;
    return false;
  }

  function queue() { try { return JSON.parse(localStorage.getItem(QKEY) || '[]') || []; } catch (e) { return []; } }
  function keep(q) { try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-20))); } catch (e) {} }

  function post(r, auth) {
    return rawFetch(SB + '/rest/v1/rpc/bp_report_error', {
      method: 'POST', keepalive: true,
      headers: { apikey: ANON, Authorization: 'Bearer ' + (auth || ANON), 'Content-Type': 'application/json', 'X-Bp-Report': '1' },
      body: JSON.stringify(r)
    });
  }
  function flush() {
    if (sending || !rawFetch || !navigator.onLine) return;
    var q = queue(); if (!q.length) return;
    sending = true;
    var r = q[0], t = token();
    post(r, t).then(function (res) {
      /* a stale sign-in: send it without one */
      if (res.status === 401 && t) return post(r, '');
      return res;
    }).then(function (res) {
      sending = false;
      if (res && (res.ok || (res.status >= 400 && res.status < 500))) { keep(queue().slice(1)); setTimeout(flush, 400); }
    }, function () { sending = false; });
  }

  function report(kind, msg, src, stack) {
    try {
      /* Chrome says "Uncaught Error: x", Safari "Error: x", Firefox "x": one wording, so one row */
      msg = String(msg || '').trim().replace(/^Uncaught\s+(\(in promise\)\s+)?/i, '');
      if (!msg || noise(msg, src, stack)) return;
      var key = kind + '|' + msg + '|' + (src || '');
      if (seen[key] || sent >= MAX) return;
      seen[key] = 1; sent++;
      var stackTop = String(stack || '').split('\n').slice(0, 12).join('\n');
      var q = queue();
      q.push({
        p_kind: kind,
        p_message: scrub(msg, 300),
        p_source: scrub(src || '', 200),
        p_stack: scrub(stackTop, 2000),
        p_view: String(window._bpCurView || '').slice(0, 40),
        p_path: location.pathname.slice(0, 120),
        p_app_ver: appVer(),
        p_ua: String(navigator.userAgent || '').slice(0, 160),
        p_online: navigator.onLine,
        p_area: area()
      });
      keep(q);
      setTimeout(flush, 50);
    } catch (e) {}
  }
  function where(file, line, col) {
    if (!file) return '';
    var f = String(file).replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
    return f + (line ? ':' + line + (col ? ':' + col : '') : '');
  }

  window.addEventListener('error', function (e) {
    var t = e && e.target;
    /* a script or stylesheet of our own that failed to load: the page is missing a piece */
    if (t && t !== window && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
      var u = t.src || t.href || '';
      if (u && u.indexOf(location.origin) === 0 && navigator.onLine) report('resource', 'Could not load ' + where(u), where(u), '');
      return;
    }
    var err = e && e.error;
    report('error', (e && e.message) || (err && err.message) || '', where(e && e.filename, e && e.lineno, e && e.colno), err && err.stack);
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason, msg;
    if (r && typeof r === 'object') msg = (r.name && r.message ? r.name + ': ' + r.message : r.message) || String(r);
    else msg = String(r);
    if (msg === '[object Object]' || msg === 'undefined') {
      try { msg = 'Unhandled: ' + JSON.stringify(r).slice(0, 200); } catch (x) { msg = 'Unhandled promise rejection'; }
    }
    var stack = r && r.stack, src = '';
    var m = /(\/[^\s()]+\.(?:js|html)(?:\?[^\s():]*)?):(\d+):(\d+)/.exec(String(stack || ''));
    if (m) src = where(m[1], m[2], m[3]);
    report('promise', msg, src, stack);
  });

  window.addEventListener('online', function () { setTimeout(flush, 1500); });
  setTimeout(flush, 4000);   /* anything kept from last time */

  /* bpErrors.report(err, where) from code that catches an error but still wants it known */
  window.bpErrors = {
    report: function (err, ctx) {
      var msg = err && err.message ? (err.name ? err.name + ': ' : '') + err.message : String(err);
      report('error', (ctx ? ctx + ': ' : '') + msg, '', err && err.stack);
    },
    pending: function () { return queue().length; },
    _scrub: scrub
  };
})();
