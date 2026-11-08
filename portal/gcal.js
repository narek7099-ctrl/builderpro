/* Google Calendar in BuilderPro (functions/v1/gcal does the syncing).

   - Their Google events show on the calendar as grey "Google" blocks (busy time:
     Lisa won't book over them once HighLevel is on).
   - A new Google event in work hours gets one question in the calendar's side
     panel: "Customer appointment?" Yes -> pick the customer -> it becomes a real
     appointment (HighLevel workflows and pipeline). No -> it just stays busy.
   - The same panel connects, shows when it last synced, and disconnects.
   - BuilderPro's project days (and Lisa's bookings) are written to their Google
     Calendar by the function; nothing to do here for that. */
(function () {
  'use strict';
  var G = window.bpGcal = { ev: [], st: null, busy: false };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var api = function (op, x) { return window.bpAuthApi(window.BP_URL + '/functions/v1/gcal', Object.assign({ op: op }, x || {})); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var when = function (e) {
    var s = new Date(e.starts_at);
    return e.all_day ? s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · all day'
      : s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  G.status = function () { if (!live()) return Promise.resolve(null); return Promise.resolve(api('status')).then(function (s) { G.st = s && s.ok ? s : null; return G.st; }, function () { return null; }); };
  G.load = function () {
    if (!live()) return Promise.resolve();
    var from = new Date(Date.now() - 40 * 864e5).toISOString();
    return Promise.resolve(BP_SB.from('gcal_events').select('id,title,starts_at,ends_at,all_day,kind,contact_name,ghl_appt_id').gte('ends_at', from).order('starts_at', { ascending: true }).limit(1000))
      .then(function (r) { G.ev = (r && r.data) || []; }, function () {});
  };
  /* what the calendar draws: an appointment already in HighLevel shows as that, not twice */
  function shown() { return G.ev.filter(function (e) { return !(e.kind === 'appt' && e.ghl_appt_id); }); }
  /* the Google events on one local day, for the month grid */
  window.bpGcalDay = function (key) {
    return shown().filter(function (e) {
      var s = new Date(e.starts_at), en = new Date(e.ends_at);
      if (e.all_day) { var d = new Date(key + 'T12:00:00'); return d >= s && d < en; }
      return iso(s) === key;
    });
  };
  /* the same, as day / week view items */
  window.bpGcalItems = function (key) {
    return window.bpGcalDay(key).map(function (e) {
      var s = new Date(e.starts_at), en = new Date(e.ends_at), from = e.all_day ? null : s.getHours() * 60 + s.getMinutes();
      var to = e.all_day ? null : (iso(en) === key ? en.getHours() * 60 + en.getMinutes() : 24 * 60);
      return { from: from, to: from == null ? null : Math.max(to, from + 30), allDay: e.all_day, kind: e.kind === 'appt' ? 'insp' : 'gcal',
        title: e.kind === 'appt' ? (e.contact_name || e.title) : e.title, sub: e.kind === 'appt' ? 'From Google Calendar · inspection' : (e.kind === 'ask' ? 'Google Calendar · customer?' : 'Google Calendar · busy'),
        act: "bpGcalOpen('" + e.id + "')", ref: 'gcal:' + e.id };
    });
  };

  /* ---------- the side panel ---------- */
  window.bpGcalOpenBox = function (on) { G.open = !!on; draw(); };
  window.bpGcalPanel = function () {
    var el = document.getElementById('bpx-gcal'); if (!el) return;
    if (!live()) { el.hidden = true; return; }
    Promise.all([G.status(), G.load()]).then(function () {
      draw();
      if (window.bpCalRedraw) bpCalRedraw();
    });
  };
  function draw() {
    var el = document.getElementById('bpx-gcal'); if (!el) return;
    var s = G.st;
    if (!s || !s.configured) { el.hidden = true; return; }
    el.hidden = false;
    var head = '<div class="cal-side-h"><b><span class="ms gc-ic">calendar_month</span> Google Calendar</b>' + (s.connected ? '<span class="bpx-badge gc-ok">Connected</span>' : '') + '</div>';
    if (!s.connected) {
      el.innerHTML = head + '<div class="bpx-mut gc-p">' + (s.reconnect ? 'Google signed BuilderPro out. Connect again to keep your calendars in step.'
        : 'See your personal events here so ' + esc(window.BP_AI_NAME || 'Lisa') + ' never books over them, and get your BuilderPro schedule on your phone’s calendar.') + '</div>'
        + '<button class="bpx-btn gc-go" onclick="bpGcalConnect()"' + (G.busy ? ' disabled' : '') + '><span class="ms">link</span> ' + (s.reconnect ? 'Reconnect' : 'Connect Google Calendar') + '</button>';
      return;
    }
    var now = Date.now();
    var ask = G.ev.filter(function (e) { return e.kind === 'ask' && Date.parse(e.ends_at) > now; }).slice(0, 6);
    var ago = s.last_sync ? Math.max(0, Math.round((now - Date.parse(s.last_sync)) / 60000)) : null;
    /* connected, nothing waiting, no error: shrink to a slim chip; Manage opens it */
    if (window.bpCalConnSeen) bpCalConnSeen();
    /* connected, nothing waiting, no error: out of sight; the calendar's link button opens it */
    if (!ask.length && !s.error && !G.open) { el.hidden = true; return; }
    el.innerHTML = head
      + '<div class="bpx-mut gc-p">' + esc(s.email || 'Your Google account') + (ago == null ? '' : ' · synced ' + (ago < 1 ? 'just now' : ago + ' min ago')) + '</div>'
      + (s.error ? '<div class="gc-err">' + esc(s.error) + '</div>' : '')
      + (ask.length ? '<div class="gc-askh">Are these customer appointments?</div>' + ask.map(function (e) {
        return '<div class="gc-ask"><div class="gc-ask-t"><b>' + esc(e.title) + '</b><span>' + esc(when(e)) + '</span></div>'
          + '<div class="gc-ask-b"><button class="bpx-rowbtn gc-yes" onclick="bpGcalYes(\'' + e.id + '\')"><span class="ms">person</span> Customer</button>'
          + '<button class="bpx-rowbtn" onclick="bpGcalNo(\'' + e.id + '\')">Just busy</button></div></div>';
      }).join('') : '<div class="bpx-mut gc-p gc-none">Nothing to sort. Your Google events show in grey on the calendar.</div>')
      + '<div class="gc-foot"><button class="bpx-linkbtn" onclick="bpGcalSync()">Sync now</button><button class="bpx-linkbtn gc-off" onclick="bpGcalOff()">Disconnect</button>' + (G.open ? '<button class="bpx-linkbtn conn-hide" onclick="bpCalConnToggle(false)">Hide</button>' : '') + '</div>';
  }

  window.bpGcalConnect = function () {
    G.busy = true; draw();
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    Promise.resolve(api('start', { tz: tz })).then(function (r) {
      G.busy = false;
      if (r && r.url) { location.href = r.url; return; }
      draw(); window.bpToast && bpToast(r && r.error === 'not_configured' ? 'Google Calendar isn’t switched on yet.' : 'Couldn’t open Google just now. Try again.', 'warning');
    }, function () { G.busy = false; draw(); });
  };
  window.bpGcalSync = function () {
    window.bpToast && bpToast('Syncing with Google…');
    Promise.resolve(api('sync_now')).then(function () { bpGcalPanel(); }, function () {});
  };
  window.bpGcalOff = function () {
    var go = function () { Promise.resolve(api('disconnect')).then(function () { G.ev = []; bpGcalPanel(); window.bpToast && bpToast('Google Calendar disconnected.'); }); };
    if (confirm('Disconnect Google Calendar? BuilderPro takes its events back out of your Google Calendar and stops showing your Google events here.')) go();
  };
  function answer(id, body) {
    return Promise.resolve(api('answer', Object.assign({ id: id }, body))).then(function (r) {
      if (!r || !r.ok) { window.bpToast && bpToast((r && r.error) || 'Couldn’t save that. Try again.', 'warning'); return false; }
      G.ev.forEach(function (e) { if (e.id === id) { e.kind = body.appt ? 'appt' : 'dismissed'; if (body.name) e.contact_name = body.name; } });
      draw(); if (window.bpCalRedraw) bpCalRedraw();
      return true;
    });
  }
  window.bpGcalNo = function (id) { answer(id, { appt: false }); };
  /* Yes: pick the customer (search the contacts), then it's booked */
  window.bpGcalYes = function (id) {
    var e = G.ev.filter(function (x) { return x.id === id; })[0]; if (!e) return;
    Promise.resolve(window.bpEnsureContacts ? bpEnsureContacts() : null).then(function () {
      var all = (window._bpContacts || []).filter(function (c) { return /^[0-9a-f-]{36}$/i.test(String(c.id)); });
      var guess = String(e.title || '').toLowerCase();
      var row = function (c) { return '<button type="button" class="gc-pick" onclick="bpGcalPick(\'' + id + '\',\'' + c.id + '\')"><b>' + esc(c.name || c.phone || c.email || 'Contact') + '</b><span>' + esc([c.phone, c.email].filter(Boolean).join(' · ')) + '</span></button>'; };
      var list = function (q) {
        q = String(q || '').toLowerCase().trim();
        var hit = all.filter(function (c) { var t = [c.name, c.phone, c.email].join(' ').toLowerCase(); return !q || t.indexOf(q) > -1; });
        // the contact whose name is in the event's title goes first
        hit.sort(function (a, b) { var na = String(a.name || '').toLowerCase(), nb = String(b.name || '').toLowerCase();
          var sa = na && guess.indexOf(na.split(' ').pop()) > -1 ? 0 : 1, sb2 = nb && guess.indexOf(nb.split(' ').pop()) > -1 ? 0 : 1; return sa - sb2; });
        return hit.slice(0, 30).map(row).join('') || '<div class="bpx-mut" style="padding:10px 0">No contact matches. Add them under Leads › Contacts first.</div>';
      };
      window._bpGcalList = list;
      var html = '<h3>Who is it for?</h3><div class="bpx-sub">' + esc(e.title) + ' · ' + esc(when(e)) + '. It becomes a real inspection for this customer, so their reminders and follow-ups run.</div>'
        + '<input class="bpx-inp gc-q" placeholder="Search name, phone or email" oninput="document.getElementById(\'gc-list\').innerHTML=_bpGcalList(this.value)">'
        + '<div class="gc-list" id="gc-list">' + list('') + '</div>';
      if (window.bpModal) bpModal(html); else alert('Open BuilderPro on a bigger screen to pick the customer.');
    });
  };
  window.bpGcalPick = function (id, cid) {
    var c = (window._bpContacts || []).filter(function (x) { return x.id === cid; })[0];
    answer(id, { appt: true, contact_id: cid, name: c ? c.name : '' }).then(function (ok) {
      if (!ok) return;
      if (window.bpCloseModal) bpCloseModal();
      window.bpToast && bpToast('Booked as an inspection for ' + (c && c.name ? c.name : 'that customer') + '.');
    });
  };
  /* a tap on a Google block in the calendar */
  window.bpGcalOpen = function (id) {
    var e = G.ev.filter(function (x) { return x.id === id; })[0]; if (!e) return;
    if (e.kind === 'ask') { bpGcalYes(id); return; }
    var html = '<h3>' + esc(e.kind === 'appt' ? (e.contact_name || e.title) : e.title) + '</h3><div class="bpx-sub">' + esc(when(e)) + ' · from Google Calendar</div>'
      + (e.kind === 'appt' ? '<p class="gc-p">An inspection for ' + esc(e.contact_name || 'this customer') + '. Move or delete it in Google Calendar and BuilderPro follows.</p>'
        : '<p class="gc-p">Shown as busy, so nothing gets booked over it.</p><button class="bpx-btn" onclick="bpGcalYes(\'' + e.id + '\')"><span class="ms">person</span> It’s a customer appointment</button>');
    if (window.bpModal) bpModal(html);
  };

  /* back from Google's sign-in page */
  (function () {
    var m = location.search.match(/[?&]gcal=(\w+)/); if (!m) return;
    var msg = { connected: ['Google Calendar connected. Your events show on the calendar in a minute.', ''], cancelled: ['Google Calendar wasn’t connected.', 'warning'],
      noscope: ['Google didn’t give calendar access. Connect again and leave the calendar box ticked.', 'warning'], failed: ['Google Calendar didn’t connect. Try again.', 'warning'] }[m[1]] || ['', ''];
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    var tries = 0, t = setInterval(function () {
      if (!(window.BP_LIVE && window.bpNav) && ++tries < 60) return;
      clearInterval(t); try { bpNav('calendar'); } catch (e) {}
      if (msg[0] && window.bpToast) bpToast(msg[0], msg[1] || undefined);
    }, 500);
  })();

  /* the setup checklist asks whether it's connected (portal/dash.js) */
  setTimeout(function () { if (live()) G.status(); }, 4000);

  var css = document.createElement('style');
  css.textContent =
    '#bpx .gc-ic{font-size:18px;vertical-align:-4px;margin-right:4px;color:var(--blue,#2b63e6)}' +
    '#bpx .gc-ok{background:var(--ok-soft,#ecfdf5);color:var(--ok-t,#15803d)}' +
    '#bpx .gc-p{font-size:13px;line-height:1.45;margin:0 0 10px}' +
    '#bpx .gc-go{width:100%;justify-content:center}' +
    '#bpx .gc-err{font-size:12.5px;color:var(--err-t,#b91c1c);margin:-4px 0 10px}' +
    '#bpx .gc-askh{font-weight:700;font-size:13px;margin:4px 0 8px}' +
    '#bpx .gc-ask{border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px}' +
    '#bpx .gc-ask-t b{display:block;font-size:13.5px}#bpx .gc-ask-t span{font-size:12px;color:var(--grey,#5a6b82)}' +
    '#bpx .gc-ask-b{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}#bpx .gc-ask-b .bpx-rowbtn{margin:0}' +
    '#bpx .gc-yes{border-color:var(--blue,#2b63e6);color:var(--blue,#2b63e6)}' +
    '#bpx .gc-foot{display:flex;justify-content:space-between;margin-top:6px}#bpx .gc-off{color:var(--err-t,#b91c1c)}' +
    '#bpx .bpx-appt.gcal,#bpx .cd-ev.gcal,#bpx .cw-ev.gcal{background:repeating-linear-gradient(135deg,var(--soft,#f1f4f8) 0 6px,transparent 6px 12px),var(--card,#fff);border-left:3px solid #94a3b8;color:var(--ink)}' +
    '#bpx .bpx-appt.gcal.ask,#bpx .cd-ev.gcal.ask{border-left-color:var(--blue,#2b63e6)}' +
    '#bpx .bpx-day .bpx-appt.gcal{background:repeating-linear-gradient(135deg,var(--soft,#f1f4f8) 0 6px,transparent 6px 12px),var(--card,#fff) !important;border-color:var(--line,#dfe5ee) !important;border-left:3px solid #94a3b8 !important;color:var(--ink) !important}' +
    '#bpx .bpx-day .bpx-appt.gcal.ask{border-left-color:var(--blue,#2b63e6) !important}#bpx .bpx-day .bpx-appt.gcal .t{color:var(--grey,#5a6b82) !important}' +
    '.gc-q{width:100%;margin:10px 0 8px}.gc-list{max-height:320px;overflow:auto;display:grid;gap:6px}' +
    '.gc-pick{display:block;width:100%;text-align:left;border:1px solid var(--line,#dfe5ee);border-radius:10px;padding:9px 12px;background:var(--card,#fff);cursor:pointer;font:inherit;color:inherit}' +
    '.gc-pick:hover{border-color:var(--blue,#2b63e6)}.gc-pick b{display:block;font-size:14px}.gc-pick span{font-size:12px;color:var(--grey,#5a6b82)}';
  document.head.appendChild(css);
})();
