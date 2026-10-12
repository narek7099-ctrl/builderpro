/* BuilderPro inside the native app (Capacitor: iPhone, iPad, Android; mobile/).
   The app loads builderpro-os.com, so this file is on every page load but does
   nothing in a normal browser. In the app it:

     push      asks once after sign-in, registers the device (bp_device_register),
               forgets it on sign-out (bp_device_forget), and opens the right
               screen when a notification is tapped (bpNotify.follow)
     lock      optional Face ID / Touch ID / fingerprint lock, on start and
               after a minute in the background (Settings > Security, My projects)
     stores    no buying inside the app: Apple and Google require their own
               billing for in-app subscriptions, so plan changes, upgrade
               buttons and the website's sign-up pages say "manage on the
               website" instead
     links     other sites open in an in-app browser, not inside BuilderPro
     back      Android back button closes sheets before leaving a screen
*/
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var PLATFORM = C.getPlatform ? C.getPlatform() : '';
  var P = function (n) { return (C.Plugins && C.Plugins[n]) || (C.registerPlugin ? C.registerPlugin(n) : null); };
  var html = document.documentElement;
  html.classList.add('bp-native', 'bp-native-' + PLATFORM);
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  /* the marketing homepage is not part of the app: go to sign-in */
  var routed = /[?&](portal|app)=1/.test(location.search) || /^#(home=|my|pros|find-a-pro|sign=|pay=|access_token=|error=)/i.test(location.hash);
  if (!routed && /^\/(index\.html)?$/.test(location.pathname)) { location.replace('/?portal=1&source=app'); return; }

  /* ---------------------------------------------------------------- stores */
  window.bpCanInstall = function () { return false; }; // already the app
  var webOnly = function () {
    bpNativeSheet('Plans are managed on the website',
      '<p>To start, change or cancel a BuilderPro plan, sign in at <b>builderpro-os.com</b> on a computer or in your phone’s browser. Everything you set up there shows here right away.</p>');
  };
  var hook = function () {
    if (window.bpChangePlan && !window.bpChangePlan._native) { window.bpChangePlan = webOnly; window.bpChangePlan._native = 1; }
    if (window.bpUpgradeCard && !window.bpUpgradeCard._native) {
      window.bpUpgradeCard = function (v) {
        var name = (window.BP_WHY && BP_WHY[v]) || 'This page';
        return '<div style="max-width:520px;margin:40px auto;background:#fff;border:1px solid #dbe3ec;border-radius:22px;padding:30px;text-align:center">'
          + '<div style="width:52px;height:52px;border-radius:50%;background:#eaf2ff;color:#006fff;display:grid;place-items:center;margin:0 auto 16px"><span class="ms">lock</span></div>'
          + '<h2 style="margin:0 0 8px;font-size:21px;color:#001530">' + name + ' isn’t on your plan</h2>'
          + '<p style="color:#5b6b7f;margin:0;line-height:1.5">Plans are managed on the BuilderPro website, builderpro-os.com.</p></div>';
      };
      window.bpUpgradeCard._native = 1;
    }
    if (window.bpBillBanner && !window.bpBillBanner._native) { window.bpBillBanner = function () {}; window.bpBillBanner._native = 1; }
  };
  hook(); document.addEventListener('DOMContentLoaded', hook); setTimeout(hook, 1500);
  // sign-up and checkout pages, and any "upgrade" link
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/signup\.html|[?&]step=pay|checkout\.stripe\.com\/c\/pay\/.*(sub|plan)/i.test(href) || a.hasAttribute('data-upg')) { e.preventDefault(); e.stopPropagation(); webOnly(); return; }
    // another website: in-app browser, so they come straight back
    var u; try { u = new URL(href, location.href); } catch (x) { return; }
    var ours = /(^|\.)builderpro-os\.com$/.test(u.hostname) || /\.supabase\.co$/.test(u.hostname);
    if (/^(tel|mailto|sms):/.test(u.protocol)) return;
    if (!ours || a.target === '_blank') { e.preventDefault(); openOut(u.href); }
  }, true);
  var openOut = function (url) { var B = P('Browser'); if (B && B.open) B.open({ url: url, presentationStyle: 'popover' }).catch(function () { location.href = url; }); else location.href = url; };
  var wo = window.open;
  window.open = function (url) {
    try { var u = new URL(url, location.href); if (!/(^|\.)builderpro-os\.com$/.test(u.hostname)) { openOut(u.href); return null; } } catch (e) {}
    return wo.apply(window, arguments);
  };
  var css = document.createElement('style');
  css.textContent = '.bp-native .st-plan-row,.bp-native .my-inst,.bp-native #bpxBill,.bp-native a[href*="signup.html"]{display:none !important}'
    + '.bp-native-sheet{position:fixed;inset:0;z-index:9500;display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,-apple-system,sans-serif}'
    + '.bp-native-sheet>i{position:absolute;inset:0;background:rgba(10,16,30,.5)}'
    + '.bp-native-sheet>div{position:relative;width:100%;max-width:440px;margin:12px;margin-bottom:calc(12px + env(safe-area-inset-bottom));background:#fff;color:#0f1729;border-radius:20px;padding:22px 20px 16px}'
    + '.bp-native-sheet h2{margin:0 0 8px;font-size:19px}.bp-native-sheet p{margin:0 0 16px;font-size:15px;line-height:1.5;color:#475467}'
    + '.bp-native-sheet button{width:100%;height:48px;border:0;border-radius:12px;background:#2f6bff;color:#fff;font:inherit;font-size:15px;font-weight:700}'
    + '#bpLock{position:fixed;inset:0;z-index:9800;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;font-family:system-ui,-apple-system,sans-serif}'
    + '#bpLock img{width:84px;height:84px;border-radius:20px}#bpLock b{font-size:20px;color:#0f1729}'
    + '#bpLock button{height:50px;padding:0 28px;border:0;border-radius:14px;background:#2f6bff;color:#fff;font:inherit;font-size:16px;font-weight:700}'
    + '.bp-lock-row{display:flex;align-items:center;justify-content:space-between;gap:12px}';
  document.head.appendChild(css);
  window.bpNativeSheet = function (title, body) {
    var o = document.getElementById('bpNativeSheet'); if (o) o.remove();
    var d = document.createElement('div'); d.id = 'bpNativeSheet'; d.className = 'bp-native-sheet'; d.setAttribute('role', 'dialog');
    d.innerHTML = '<i onclick="this.parentNode.remove()"></i><div><h2>' + title + '</h2>' + body + '<button type="button" onclick="document.getElementById(\'bpNativeSheet\').remove()">OK</button></div>';
    (document.getElementById('bpSign') || document.body).appendChild(d);
  };

  /* ----------------------------------------------------------------- push */
  var Push = P('PushNotifications'), pending = null;
  var session = function () { return window.BP_SB && BP_SB.auth ? Promise.resolve(BP_SB.auth.getSession()).then(function (r) { return r && r.data && r.data.session; }).catch(function () { return null; }) : Promise.resolve(null); };
  var version = '';
  try { P('App').getInfo().then(function (i) { version = (i && i.version) || ''; }); } catch (e) {}
  var registerPush = function () {
    if (!Push) return;
    session().then(function (s) {
      if (!s) return;
      Push.checkPermissions().then(function (p) {
        if (p.receive === 'granted') return Push.register();
        if (p.receive === 'denied' || store.get('bp.pushAsked')) return;
        store.set('bp.pushAsked', '1');
        return Push.requestPermissions().then(function (q) { if (q.receive === 'granted') return Push.register(); });
      }).catch(function () {});
    });
  };
  if (Push) {
    Push.addListener('registration', function (t) {
      store.set('bp.pushToken', t.value);
      if (window.BP_SB) BP_SB.rpc('bp_device_register', { p_token: t.value, p_platform: PLATFORM, p_version: version }).then(function () {}, function () {});
    });
    Push.addListener('registrationError', function () {});
    // tapped a notification: open what the bell would open
    Push.addListener('pushNotificationActionPerformed', function (a) {
      var d = (a && a.notification && a.notification.data) || {};
      var go = function () { if (window.bpNotify && bpNotify.follow) { bpNotify.follow(d.link || '', d.job || ''); return true; } return false; };
      if (!go()) { pending = d; }
    });
  }
  setInterval(function () { if (pending && window.bpNotify && bpNotify.follow) { var d = pending; pending = null; bpNotify.follow(d.link || '', d.job || ''); } }, 1000);
  // a phone that signs out stops getting that person's notifications
  var wireAuth = function () {
    if (!window.BP_SB || !BP_SB.auth || BP_SB.auth._bpNative) return;
    BP_SB.auth._bpNative = 1;
    var out = BP_SB.auth.signOut.bind(BP_SB.auth);
    BP_SB.auth.signOut = function () {
      var t = store.get('bp.pushToken'); var args = arguments;
      return (t ? Promise.resolve(BP_SB.rpc('bp_device_forget', { p_token: t })).catch(function () {}) : Promise.resolve()).then(function () { return out.apply(null, args); });
    };
    BP_SB.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_IN') setTimeout(registerPush, 1500); });
    setTimeout(registerPush, 2500);
  };
  wireAuth(); document.addEventListener('DOMContentLoaded', wireAuth);

  /* ---------------------------------------------------------------- lock */
  var Bio = P('BiometricAuthNative'), App = P('App');
  var bioName = 'Face ID';
  var lockOn = function () { return store.get('bp.lock') === 'on'; };
  var showLock = function () {
    if (document.getElementById('bpLock')) return;
    var d = document.createElement('div'); d.id = 'bpLock';
    d.innerHTML = '<img src="/assets/app/icon-192.png" alt=""><b>BuilderPro is locked</b><button type="button" id="bpLockGo">Unlock with ' + bioName + '</button>';
    document.body.appendChild(d);
    if (document.getElementById('bpSign')) document.getElementById('bpSign').appendChild(d);
    document.getElementById('bpLockGo').onclick = unlock;
    unlock();
  };
  var unlock = function () {
    if (!Bio) { var l = document.getElementById('bpLock'); if (l) l.remove(); return; }
    Bio.internalAuthenticate({ reason: 'Unlock BuilderPro', cancelTitle: 'Cancel', allowDeviceCredential: true, iosFallbackTitle: 'Use passcode', androidTitle: 'Unlock BuilderPro', androidConfirmationRequired: false })
      .then(function () { var l = document.getElementById('bpLock'); if (l) l.remove(); })
      .catch(function () { /* stays locked; the button tries again */ });
  };
  var lockIfNeeded = function () { session().then(function (s) { if (s && lockOn()) showLock(); }); };
  if (Bio) Bio.checkBiometry().then(function (r) {
    // BiometryType: 1 Touch ID, 2 Face ID, 3 fingerprint, 4 face, 5 iris
    bioName = { 1: 'Touch ID', 2: 'Face ID', 3: 'fingerprint', 4: 'face unlock', 5: 'iris' }[r && r.biometryType] || (PLATFORM === 'ios' ? 'Face ID' : 'fingerprint');
    window._bpBio = !!(r && (r.isAvailable || r.deviceIsSecure));
  }).catch(function () {});
  document.addEventListener('DOMContentLoaded', function () { setTimeout(lockIfNeeded, 400); });
  var bgAt = 0;
  if (App) App.addListener('appStateChange', function (st) {
    if (!st.isActive) { bgAt = Date.now(); return; }
    if (bgAt && Date.now() - bgAt > 60000) lockIfNeeded();
    registerPush();
  });
  window.bpLockToggle = function (on) {
    if (!on) { store.set('bp.lock', 'off'); bpLockRows(); return; }
    if (!Bio || !window._bpBio) { bpNativeSheet('Set up ' + bioName + ' first', '<p>Turn on ' + bioName + ' or a passcode in your phone’s settings, then try again.</p>'); bpLockRows(); return; }
    Bio.internalAuthenticate({ reason: 'Turn on the ' + bioName + ' lock', cancelTitle: 'Cancel', allowDeviceCredential: true, androidTitle: 'Turn on the lock' })
      .then(function () { store.set('bp.lock', 'on'); bpLockRows(); }, function () { bpLockRows(); });
  };
  // the switch: Settings > Security (contractors) and My projects (homeowners)
  var row = function () {
    return '<div class="st-row bp-lock-row" data-bp-lock><div class="st-row-t"><b>' + bioName + ' lock</b><p>Ask for ' + bioName + ' when the app opens, and after a minute away.</p></div>'
      + '<div class="st-row-c"><label class="st-tog"><input type="checkbox"' + (lockOn() ? ' checked' : '') + ' onchange="bpLockToggle(this.checked)"><span>' + (lockOn() ? 'On' : 'Off') + '</span></label></div></div>';
  };
  window.bpLockRows = function () {
    var pw = document.getElementById('bpx-sec-btn');
    if (pw) { var sec = pw.closest('.st-row'); var have = document.querySelector('[data-bp-lock]'); if (have) have.outerHTML = row(); else if (sec) sec.insertAdjacentHTML('afterend', row()); }
    var my = document.querySelector('#bpSign .my-del');
    if (my) { var h = document.querySelector('#bpSign [data-bp-lock]'); var b = '<button type="button" class="hx-card hx-pros" data-bp-lock onclick="bpLockToggle(' + (!lockOn()) + ')"><span class="hx-pros-ic"><span class=ms>' + (lockOn() ? 'lock' : 'lock_open') + '</span></span><div><b>' + bioName + ' lock: ' + (lockOn() ? 'On' : 'Off') + '</b><span>Tap to turn it ' + (lockOn() ? 'off' : 'on') + '.</span></div></button>'; if (h) h.outerHTML = b; else my.insertAdjacentHTML('beforebegin', b); }
  };
  new MutationObserver(function () {
    if ((document.getElementById('bpx-sec-btn') || document.querySelector('#bpSign .my-del')) && !document.querySelector('[data-bp-lock]')) bpLockRows();
  }).observe(document.documentElement, { childList: true, subtree: true });

  /* ---------------------------------------------------------- Android back */
  if (App && PLATFORM === 'android') App.addListener('backButton', function (e) {
    var close = ['#bpNativeSheet', '#bpDel', '#bpInstHelp', '#prFrame'];
    for (var i = 0; i < close.length; i++) { var el = document.querySelector(close[i]); if (el) { el.remove(); return; } }
    if (document.getElementById('prDet') && window.bpPrClose) { bpPrClose(); return; }
    if (window._bpHp && _bpHp.more && window.bpHpMore) { bpHpMore(false); return; }
    if (e && e.canGoBack) history.back(); else App.exitApp();
  });
})();
