/* ==================================================================
   Customer links: everything a contractor sends a homeowner (#home=
   project page, #est= estimate, #sign= contract, #pay= invoice).

   1. Signed in on this device as a homeowner: the link is saved to their
      account at once (bp_ho_save), quietly, with a small "Saved" note.
      From then on the account follows the job: anything else the
      contractor sends for it lands there too, with a notification.
   2. Not signed in: a short sheet offers a free account to keep this and
      get updates, with their name and email already filled in. It comes
      up after a few seconds, or right after they approve, sign or pay.
   3. On a phone, outside the app: a slim banner offers the app.

   A contractor previewing their own link is left alone: nothing is saved
   to their login and nothing pops up.
   ================================================================== */
(function () {
  'use strict';
  /* the store listings, once the apps are live; until then "Get the app"
     installs the web app to the home screen */
  var STORE = { ios: '', android: '' };
  var NOUN = { home: 'project', est: 'estimate', sign: 'agreement', pay: 'invoice' };

  var C = { kind: '', token: '', info: {}, me: undefined, shown: false, timer: null, mode: 'up', busy: false, err: '' };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var native = function () { try { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (e) { return false; } };
  var standalone = function () { return native() || (window.bpIsStandalone ? bpIsStandalone() : false); };
  var phone = function () { return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); };
  var isIOS = function () { return window.bpIsIOS ? bpIsIOS() : /iphone|ipad|ipod/i.test(navigator.userAgent); };
  var me = function () { return window.bpMeLoad ? bpMeLoad() : Promise.resolve(null); };
  var homeowner = function (s) { return window.bpIsHomeowner ? bpIsHomeowner(s) : !!(s && s.user && s.user.user_metadata && s.user.user_metadata.bp_role === 'homeowner'); };
  var noun = function () { return NOUN[C.kind] || 'project'; };

  function save() {
    if (!window.BP_SB || !C.token) return Promise.resolve(false);
    return Promise.resolve(BP_SB.rpc('bp_ho_save', { p_kind: C.kind, p_token: C.token, p_title: String(C.info.title || '').slice(0, 120) }))
      .then(function (r) { return !!(r && r.data); }, function () { return false; });
  }

  var L = window.bpCustLink = {
    /* a customer page loaded its link */
    seen: function (kind, token, info) {
      if (C.token === token && C.kind === kind) return;
      C.kind = kind; C.token = token; C.info = info || {}; C.shown = false;
      me().then(function (s) {
        C.me = s || null;
        if (s && homeowner(s)) { save().then(function (ok) { if (ok) chip('Saved to your account'); }); return; }
        if (s) return;                                   /* a contractor login: leave it */
        banner();
        var key = 'bp.ho.later', last = +store.get(key) || 0;
        if (Date.now() - last > 3 * 864e5) C.timer = setTimeout(function () { sheet(false); }, 9000);
      });
    },
    /* they just approved, signed or paid: the best moment to offer updates */
    after: function (kind) {
      if (kind) C.kind = C.kind || kind;
      clearTimeout(C.timer);
      var go = function () { if (C.me === null) setTimeout(function () { sheet(true); }, 900); };
      if (C.me === undefined) me().then(function (s) { C.me = s || null; go(); }); else go();
    },
    later: function () { store.set('bp.ho.later', String(Date.now())); close(); },
    mode: function (m) { C.mode = m; C.err = ''; draw(); },
    submit: submit,
    app: getApp,
    bannerOff: function () { store.set('bp.ho.app', String(Date.now())); var b = document.getElementById('bpclBar'); if (b) b.remove(); document.body.classList.remove('bpcl-bar-on'); }
  };

  /* ---------- the account sheet ---------- */
  function sheet(force) {
    if (C.shown || C.me || document.getElementById('bpclSheet')) return;
    /* never over someone typing or signing: try again a little later */
    var a = document.activeElement;
    if (!force && ((a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || Date.now() - (C.drawAt || 0) < 15000)) { C.timer = setTimeout(function () { sheet(false); }, 8000); return; }
    C.shown = true; C.mode = 'up'; C.err = '';
    var bar = document.getElementById('bpclBar'); if (bar) bar.hidden = true;
    var d = document.createElement('div'); d.id = 'bpclSheet'; d.className = 'bpcl-ov'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'bpclH');
    d.addEventListener('click', function (e) { if (e.target === d) L.later(); });
    (document.getElementById('bpSign') || document.body).appendChild(d);
    draw();
  }
  function close() {
    var d = document.getElementById('bpclSheet'); if (d) d.remove();
    var bar = document.getElementById('bpclBar'); if (bar) bar.hidden = false;
  }
  function draw(done) {
    var d = document.getElementById('bpclSheet'); if (!d) return;
    var biz = C.info.biz || 'your contractor', up = C.mode === 'up', f = d.querySelector('form'), keep = {};
    if (f) ['name', 'email', 'phone'].forEach(function (k) { if (f.elements[k]) keep[k] = f.elements[k].value; });
    if (done) {
      var offerApp = phone() && !standalone();
      d.innerHTML = '<div class="bpcl-card"><div class="bpcl-ok"><span>✓</span></div><h2 id="bpclH">You’re all set</h2>'
        + '<p>This ' + noun() + ' is saved to your account. Anything else ' + esc(biz) + ' sends you shows up there too, and we’ll let you know when something changes.</p>'
        + (offerApp ? '<button type="button" class="bpcl-btn" onclick="bpCustLink.app()">Get the app for alerts</button><button type="button" class="bpcl-link" onclick="bpCustLink.later()">Not now</button>'
          : '<button type="button" class="bpcl-btn" onclick="bpCustLink.later()">Done</button>')
        + '<a class="bpcl-link" href="/#my" onclick="location.href=\'/#my\';location.reload();return false">See all my projects</a></div>';
      return;
    }
    d.innerHTML = '<div class="bpcl-card"><button type="button" class="bpcl-x" aria-label="Close" onclick="bpCustLink.later()">×</button>'
      + '<div class="bpcl-ic"><span class="ms">notifications_active</span></div>'
      + '<h2 id="bpclH">' + (up ? 'Get updates on this ' + noun() : 'Sign in to save this ' + noun()) + '</h2>'
      + '<p>' + (up ? 'A free account keeps this ' + noun() + ' and everything else ' + esc(biz) + ' sends you in one place. We’ll tell you when there’s news.' : 'Sign in and this ' + noun() + ' is added to your projects.') + '</p>'
      + '<form onsubmit="event.preventDefault();bpCustLink.submit()" novalidate>'
      + (up ? '<label><span>Your name</span><input name="name" id="bpclName" autocomplete="name" required value="' + esc(keep.name != null ? keep.name : C.info.name || '') + '"></label>' : '')
      + '<label><span>Email</span><input name="email" id="bpclEmail" type="email" autocomplete="email" inputmode="email" required value="' + esc(keep.email != null ? keep.email : C.info.email || '') + '"></label>'
      + '<label><span>' + (up ? 'Choose a password' : 'Password') + '</span><input name="password" id="bpclPw" type="password" autocomplete="' + (up ? 'new-password' : 'current-password') + '" minlength="8" required></label>'
      + '<input name="website" tabindex="-1" autocomplete="off" class="bpcl-hp" aria-hidden="true">'
      + (C.err ? '<div class="bpcl-err" role="alert">' + esc(C.err) + '</div>' : '')
      + '<button type="submit" class="bpcl-btn"' + (C.busy ? ' disabled' : '') + '>' + (C.busy ? 'One moment…' : up ? 'Create free account' : 'Sign in') + '</button></form>'
      + '<button type="button" class="bpcl-link" onclick="bpCustLink.mode(\'' + (up ? 'in' : 'up') + '\')">' + (up ? 'I already have an account' : 'Create a free account instead') + '</button>'
      + '<button type="button" class="bpcl-link mute" onclick="bpCustLink.later()">Not now</button>'
      + '<p class="bpcl-fine">Free for homeowners. ' + esc(biz) + ' still decides what you see.</p></div>';
  }
  function submit() {
    var f = document.querySelector('#bpclSheet form'); if (!f || C.busy || !window.BP_SB) return;
    var v = function (k) { return f.elements[k] ? String(f.elements[k].value || '').trim() : ''; };
    var up = C.mode === 'up', email = v('email'), pw = f.elements.password.value, name = v('name');
    var fail = function (t) { C.busy = false; C.err = t; draw(); var g = document.querySelector('#bpclSheet form'); if (g) { if (g.elements.name) g.elements.name.value = name; g.elements.email.value = email; } };
    if (up && !name) return fail('Add your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('That email doesn’t look right.');
    if (pw.length < 8) return fail('Use at least 8 characters for your password.');
    C.busy = true; C.err = ''; draw();
    var signIn = function () {
      return Promise.resolve(BP_SB.auth.signInWithPassword({ email: email, password: pw })).then(function (r) {
        if (!r || r.error || !r.data || !r.data.session) throw new Error(up ? 'Your account was made, but signing in failed. Try Sign in.' : 'That email and password don’t match.');
        return r.data.session;
      });
    };
    var made = up ? fetch((window.BP_URL || '') + '/functions/v1/homeowner-signup', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: window.BP_ANON || '', Authorization: 'Bearer ' + (window.BP_ANON || '') },
      body: JSON.stringify({ email: email, password: pw, name: name, phone: '', website: v('website') }) }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.ok) return true;
        if (d && d.exists) { C.mode = 'in'; throw new Error('That email already has an account. Sign in with its password.'); }
        throw new Error((d && d.error) || 'We couldn’t create your account. Try again in a minute.');
      }) : Promise.resolve(true);
    made.then(signIn).then(function (s) {
      if (window.bpMeLoad) { try { window._bpMe = Promise.resolve(s); } catch (e) {} }
      C.me = s; C.busy = false;
      return save().then(function () { draw(true); var bar = document.getElementById('bpclBar'); if (bar) bar.remove(); });
    }).catch(function (e) { fail(String((e && e.message) || 'Something went wrong. Try again.')); });
  }

  /* ---------- the app ---------- */
  function banner() {
    if (!phone() || standalone() || document.getElementById('bpclBar')) return;
    if (Date.now() - (+store.get('bp.ho.app') || 0) < 7 * 864e5) return;
    var b = document.createElement('div'); b.id = 'bpclBar'; b.className = 'bpcl-bar';
    b.innerHTML = '<img src="assets/brand/logo-mark-64.png" alt="" width="34" height="34"><div><b>BuilderPro app</b><span>Alerts when your ' + esc(noun()) + ' changes</span></div>'
      + '<button type="button" class="bpcl-get" onclick="bpCustLink.app()">Get</button><button type="button" class="bpcl-bx" aria-label="Dismiss" onclick="bpCustLink.bannerOff()">×</button>';
    (document.getElementById('bpSign') || document.body).appendChild(b); document.body.classList.add('bpcl-bar-on');
    /* above the project page's own tab bar, under its sheets */
    var lift = function () { var t = document.querySelector('#bpSign .hp-tabbar'); var hgt = t && getComputedStyle(t).display !== 'none' ? t.getBoundingClientRect().height : 0; b.style.bottom = hgt ? (hgt + 8) + 'px' : ''; };
    lift(); setTimeout(lift, 600); window.addEventListener('resize', lift);
  }
  function getApp() {
    var url = isIOS() ? STORE.ios : /android/i.test(navigator.userAgent) ? STORE.android : '';
    if (url) { location.href = url; return; }
    close();
    if (window.bpInstall) bpInstall();
  }

  function chip(t) {
    var c = document.createElement('div'); c.className = 'bpcl-chip'; c.setAttribute('role', 'status');
    c.innerHTML = '<span class="ms">bookmark_added</span>' + esc(t);
    (document.getElementById('bpSign') || document.body).appendChild(c);
    setTimeout(function () { c.classList.add('out'); }, 2600); setTimeout(function () { c.remove(); }, 3200);
  }

  document.addEventListener('pointerdown', function (e) { if (e.target && e.target.tagName === 'CANVAS') C.drawAt = Date.now(); }, true);

  var css = document.createElement('style');
  css.textContent = ''
    + '.bpcl-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,41,.45);display:flex;align-items:flex-end;justify-content:center;animation:bpclF .2s ease}'
    + '.bpcl-card{position:relative;width:100%;max-width:440px;max-height:92vh;overflow:auto;background:#fff;border-radius:22px 22px 0 0;padding:24px 20px calc(18px + env(safe-area-inset-bottom,0px));box-sizing:border-box;font-family:Geist,system-ui,-apple-system,sans-serif;color:#0f1729;animation:bpclU .26s cubic-bezier(.2,.8,.2,1);text-align:left}'
    + '@media(min-width:640px){.bpcl-ov{align-items:center}.bpcl-card{border-radius:20px;padding:28px 26px 22px}}'
    + '.bpcl-card h2{margin:10px 0 6px;font-size:20px;line-height:1.25;letter-spacing:-.02em}.bpcl-card>p{margin:0 0 14px;font-size:14.5px;line-height:1.5;color:#56657a}'
    + '.bpcl-ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--hp-soft,#eaf1ff);color:var(--hp-blue2,#1d4ed8)}.bpcl-ic .ms{font-size:24px}'
    + '.bpcl-ok{display:grid;place-items:center;margin:4px 0}.bpcl-ok span{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:#e7f6ee;color:#15803d;font-size:26px;font-weight:700}.bpcl-card .bpcl-ok~h2,.bpcl-card .bpcl-ok~p{text-align:center}'
    + '.bpcl-x{position:absolute;top:12px;right:12px;width:36px;height:36px;border:0;border-radius:50%;background:#f1f4f8;color:#56657a;font-size:22px;line-height:1;cursor:pointer}'
    + '.bpcl-card form{display:flex;flex-direction:column;gap:10px}.bpcl-card label span{display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#344054}'
    + '.bpcl-card input{width:100%;box-sizing:border-box;height:46px;padding:0 13px;border:1px solid #d5dbe4;border-radius:12px;font:inherit;font-size:16px;color:#0f1729;background:#fff}.bpcl-card input:focus{outline:none;border-color:var(--hp-blue,#2f6bff);box-shadow:0 0 0 3px var(--hp-ring,rgba(47,107,255,.18))}'
    + '.bpcl-hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0}'
    + '.bpcl-btn{display:block;width:100%;height:50px;margin-top:4px;border:0;border-radius:14px;background:var(--hp-blue,#2f6bff);color:var(--hp-on,#fff);font:inherit;font-size:16px;font-weight:700;cursor:pointer}.bpcl-btn[disabled]{opacity:.6}'
    + '.bpcl-link{display:block;width:100%;margin-top:10px;padding:8px;border:0;background:none;color:var(--hp-blue2,#1d4ed8);font:inherit;font-size:14.5px;font-weight:600;text-align:center;cursor:pointer;text-decoration:none}.bpcl-link.mute{color:#667085;font-weight:500;margin-top:0}'
    + '.bpcl-err{background:#fef2f2;color:#b42318;border-radius:10px;padding:9px 11px;font-size:13.5px}.bpcl-fine{margin:6px 0 0;font-size:12px;color:#8b93a1;text-align:center}'
    + '.bpcl-bar{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:25;display:flex;align-items:center;gap:10px;padding:10px 10px 10px 12px;background:#fff;border:1px solid #e3e8ef;border-radius:16px;box-shadow:0 10px 30px rgba(16,24,40,.16);font-family:Geist,system-ui,-apple-system,sans-serif;animation:bpclU .3s ease}'
    + '.bpcl-bar img{border-radius:9px;flex:0 0 auto}.bpcl-bar div{flex:1;min-width:0}.bpcl-bar b{display:block;font-size:14px;color:#0f1729}.bpcl-bar span{display:block;font-size:12.5px;color:#667085;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.bpcl-get{flex:0 0 auto;height:36px;padding:0 16px;border:0;border-radius:99px;background:var(--hp-blue,#2f6bff);color:var(--hp-on,#fff);font:inherit;font-weight:700;font-size:14px;cursor:pointer}'
    + '.bpcl-bx{flex:0 0 auto;width:32px;height:32px;border:0;background:none;color:#98a2b3;font-size:22px;cursor:pointer}'
    + 'body.bpcl-bar-on #bpSign .sg-wrap,body.bpcl-bar-on #bpSign .hp-content{padding-bottom:84px}'
    + '.bpcl-chip{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:2147483001;display:flex;align-items:center;gap:7px;padding:9px 14px;border-radius:99px;background:#0f1729;color:#fff;font:600 13.5px Geist,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);transition:opacity .4s}.bpcl-chip .ms{font-size:18px;color:#7ee2a8}.bpcl-chip.out{opacity:0}'
    + '@keyframes bpclU{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@keyframes bpclF{from{opacity:0}to{opacity:1}}'
    + '@media(prefers-reduced-motion:reduce){.bpcl-ov,.bpcl-card,.bpcl-bar{animation:none}}'
    + '@media print{.bpcl-bar,.bpcl-ov,.bpcl-chip{display:none!important}}';
  (document.head || document.documentElement).appendChild(css);
})();
