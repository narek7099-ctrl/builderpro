/* ==================================================================
   Notifications: the bell in the top bar (pairs with notify.css)

   Rows come from public.notifications (migration
   20261008000001_notifications.sql). The database writes them (triggers and
   bp_notify_scan); this page only reads its own rows and marks them read.

     bell          unread count on the top-bar bell (portal/shell.js draws it,
                   this file takes over bpShell.badge / bpShell.notes)
     panel         Today / Earlier, an icon per kind, high priority marked;
                   a click marks read and opens the place it is about
     live          Supabase realtime on notifications for this user, and a
                   60 s poll whenever realtime is not connected
     desktop       browser notifications, only after the person clicks
                   "Turn on desktop alerts", never on load
     settings      Settings > Notifications (owner / office); crew and subs
                   get the same switches inside the panel
   Owner, office, crew and subs all get the bell; each sees only their own rows
   (RLS: user_id = auth.uid()).
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB && BP_SB.from); };
  var crew = function () { return !!(window.bpTeamIsCrew && bpTeamIsCrew()); };
  var sub = function () { return !!(window.bpTeamIsSub && bpTeamIsSub()); };
  var role = function () { return sub() ? 's' : crew() ? 'c' : 'o'; };
  /* line icons (24px grid), drawn like the shell's: no icon font needed */
  var IC = {
    lead: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    work: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    done: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    assign: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/>',
    pay: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    wait: '<path d="M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    yes: '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7"/>',
    no: '<path d="M17 13V4h3v9zM17 13l-4 8a2 2 0 0 1-2-2v-4H5.5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.7 4H17"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 14v3"/>',
    late: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
    flag: '<path d="M5 22V4M5 4h11l-2 4 2 4H5"/>',
    permit: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    screen: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    tune: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    empty: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M9 11l2 2 4-4"/>'
  };
  function svg(k) { return '<svg class="nt-svg" viewBox="0 0 24 24" aria-hidden="true">' + (IC[k] || IC.bell) + '</svg>'; }
  var COLS = 'id,kind,title,body,link,job_id,priority,created_at,read_at';

  var N = window.bpNotify = { items: [], loaded: false, uid: null, ch: null, rt: false, poll: null, prefs: null, view: 'list', busy: false };

  /* ---------- what each kind is: group, label, icon, who can get it ---------- */
  var GROUPS = ['Leads & sales', 'Projects', 'Money', 'Team', 'Customers', 'Subcontractors', 'Deadlines'];
  var KINDS = {
    lead_new:                { g: 0, t: 'New leads',                          ic: 'lead',      r: 'o' },
    contract_signed:         { g: 0, t: 'Contract signed',                    ic: 'pen',            r: 'o' },
    job_new:                 { g: 1, t: 'New project added',                  ic: 'work',            r: 'o' },
    job_done:                { g: 1, t: 'Project finished',                   ic: 'done',        r: 'ocs' },
    job_assigned:            { g: 1, t: 'You are put on a project',           ic: 'assign',  r: 'c' },
    ceo_report:              { g: 1, t: 'AI CEO morning briefing',            ic: 'note',      r: 'o' },
    payment_received:        { g: 2, t: 'Payment received',                   ic: 'pay',        r: 'o' },
    sub_invoice_unpaid:      { g: 2, t: 'Approved sub invoice still unpaid',  ic: 'wait',   r: 'o' },
    team_message:            { g: 3, t: 'Team chat messages',                 ic: 'chat',           r: 'ocs' },
    crew_receipt:            { g: 3, t: 'Crew adds a receipt',                ic: 'receipt',    r: 'o' },
    crew_material:           { g: 3, t: 'Crew asks for materials',            ic: 'box',     r: 'o' },
    clocked_by_lead:         { g: 3, t: 'Your crew lead clocks you in or out', ic: 'clock',   r: 'c' },
    clock_disputed:          { g: 3, t: 'Someone reports a punch made for them', ic: 'flag',  r: 'o' },
    review_new:              { g: 3, t: 'Customer reviews of the team',       ic: 'star',            r: 'oc' },
    customer_message:        { g: 4, t: 'Homeowner messages',                 ic: 'chat',            r: 'o' },
    customer_change_request: { g: 4, t: 'Homeowner change requests',          ic: 'note',       r: 'o' },
    customer_co_approved:    { g: 4, t: 'Change order approved',              ic: 'yes',        r: 'o' },
    customer_co_declined:    { g: 4, t: 'Change order declined',              ic: 'no',      r: 'o' },
    sub_invoice:             { g: 5, t: 'Sub sends an invoice',               ic: 'receipt',   r: 'o' },
    sub_change_order:        { g: 5, t: 'Sub asks for a change order',        ic: 'note',      r: 'o' },
    sub_insurance:           { g: 5, t: 'Sub insurance or licence expiring',  ic: 'shield',   r: 'o' },
    sub_decision:            { g: 5, t: 'Your invoice or change order is decided', ic: 'check', r: 's' },
    due_soon:                { g: 6, t: 'Due in the next 2 days',             ic: 'cal',  r: 'ocs' },
    overdue:                 { g: 6, t: 'Overdue',                            ic: 'late',      r: 'ocs' },
    permit_expiring:         { g: 6, t: 'Permit expiring (14 days)',          ic: 'permit',           r: 'o' },
    inspection_soon:         { g: 6, t: 'Inspection in the next 2 days',      ic: 'check',      r: 'ocs' }
  };
  function kind(k) { return KINDS[k] || { g: -1, t: k, ic: 'bell', r: 'ocs' }; }

  /* ---------- who am I ---------- */
  function uid() {
    var t = window.BP_TEAM || {};
    if (t.uid) return Promise.resolve(t.uid);
    if (N.uid) return Promise.resolve(N.uid);
    if (!live() || !BP_SB.auth || !BP_SB.auth.getUser) return Promise.resolve(null);
    return BP_SB.auth.getUser().then(function (r) { N.uid = r && r.data && r.data.user ? r.data.user.id : null; return N.uid; }).catch(function () { return null; });
  }

  /* ---------- load ---------- */
  function unread() { return N.items.filter(function (n) { return !n.read_at; }).length; }
  N.load = function () {
    if (!live()) { N.loaded = true; paint(); return Promise.resolve(); }
    return Promise.resolve(BP_SB.from('notifications').select(COLS).order('created_at', { ascending: false }).limit(60))
      .then(function (r) {
        if (r && !r.error && Array.isArray(r.data)) { N.items = r.data; N.loaded = true; paint(); }
      }).catch(function () {});
  };

  /* ---------- bell ---------- */
  function feed() { try { return (!crew() && window.BP_DASH && BP_DASH.feed) ? BP_DASH.feed() : { needs: [], recent: [] }; } catch (e) { return { needs: [], recent: [] }; } }
  function badge() {
    var n = $('hlBellN'); if (!n) return;
    var c = unread();
    n.textContent = c > 9 ? '9+' : String(c); n.hidden = !c;
    var b = $('hlBell'); if (b) b.setAttribute('aria-label', c ? 'Notifications, ' + c + ' unread' : 'Notifications');
  }
  function paint() { badge(); var m = openPanel(); if (m) fill(m); }

  /* ---------- panel ---------- */
  function openPanel() { var m = document.querySelector('.hl-menu.nt-menu'); return m && m.parentNode ? m : null; }
  function ago(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'now'; if (m < 60) return m + 'm';
    var h = Math.round(m / 60); if (h < 24) return h + 'h';
    var d = Math.round(h / 24); if (d < 7) return d + 'd';
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function row(n) {
    var k = kind(n.kind);
    return '<button type="button" role="menuitem" class="nt-it' + (n.read_at ? '' : ' unread') + (n.priority === 'high' ? ' hi' : n.priority === 'low' ? ' lo' : '') + '" data-nt="' + esc(n.id) + '">'
      + '<span class="nt-ic k' + (k.g < 0 ? 'x' : k.g) + '">' + svg(k.ic) + '</span>'
      + '<span class="nt-tx"><b>' + esc(n.title || k.t) + '</b>' + (n.body ? '<small>' + esc(n.body) + '</small>' : '') + '</span>'
      + '<span class="nt-meta"><time datetime="' + esc(n.created_at) + '">' + esc(ago(n.created_at)) + '</time>' + (n.read_at ? '' : '<i class="nt-dot" aria-label="Unread"></i>') + '</span></button>';
  }
  function desktopState() {
    if (!('Notification' in window)) return 'none';
    return Notification.permission;   /* default | granted | denied */
  }
  function listHtml() {
    if (!N.loaded) return '<div class="nt-empty">' + svg('bell') + '<span>Loading…</span></div>';
    var start = new Date(); start.setHours(0, 0, 0, 0);
    var today = N.items.filter(function (n) { return Date.parse(n.created_at) >= start.getTime(); });
    var earlier = N.items.filter(function (n) { return Date.parse(n.created_at) < start.getTime(); });
    var h = '';
    if (today.length) h += '<div class="nt-lab">Today</div>' + today.map(row).join('');
    if (earlier.length) h += '<div class="nt-lab">Earlier</div>' + earlier.map(row).join('');
    var f = feed();
    if (f.needs.length) {
      h += '<div class="nt-lab">Needs you</div>' + f.needs.slice(0, 6).map(function (r, i) {
        var d = document.createElement('div'); d.innerHTML = r.t;
        return '<button type="button" role="menuitem" class="nt-it need" data-need="' + i + '"><span class="nt-ic kn">' + svg('alert') + '</span><span class="nt-tx"><b>' + esc(d.textContent) + '</b></span></button>';
      }).join('');
    }
    if (!h) h = '<div class="nt-empty">' + svg('empty') + '<span>You’re all caught up.</span><small>New leads, signed contracts, messages and deadlines show up here.</small></div>';
    var ds = desktopState();
    var foot = '';
    if (ds === 'default' && LS.get('ntDeskNo') !== '1') foot += '<button type="button" class="nt-foot-b" data-nt-act="desk">' + svg('screen') + 'Turn on desktop alerts</button>';
    else if (ds === 'denied' && LS.get('ntDeskAsked') === '1') foot += '<span class="nt-foot-note">Desktop alerts are blocked in this browser’s site settings.</span>';
    foot += '<button type="button" class="nt-foot-b" data-nt-act="prefs">' + svg('tune') + 'Notification settings</button>';
    return '<div class="nt-list" role="none">' + h + '</div><div class="nt-foot">' + foot + '</div>';
  }
  function headHtml() {
    var c = unread();
    if (N.view === 'prefs') return '<button type="button" class="nt-hb" data-nt-act="back" aria-label="Back to notifications">' + svg('back') + '</button><b>Notification settings</b><span></span>';
    return '<span><b>Notifications</b><small>' + (c ? c + ' unread' : 'All read') + '</small></span>'
      + (c ? '<button type="button" class="nt-hb txt" data-nt-act="all">Mark all read</button>' : '');
  }
  function fill(m) {
    var hd = m.querySelector('.hl-mhead'); if (hd) hd.innerHTML = headHtml();
    var body = m.querySelector('.nt-body'); if (!body) return;
    if (N.view === 'prefs') { body.innerHTML = '<div class="nt-prefs-in" id="ntPrefsIn"></div>'; N.settings($('ntPrefsIn'), true); }
    else body.innerHTML = listHtml();
  }
  N.open = function (btn) {
    btn = btn || $('hlBell'); if (!btn || !window.bpShell) return;
    N.view = 'list';
    var m = bpShell.menu(btn, [{ html: '<div class="nt-body"></div>' }], { align: 'right', cls: 'hl-notes nt-menu', head: headHtml(), focus: false });
    if (!m) return;
    fill(m);
    m.addEventListener('click', onClick);
    if (live() && (!N.loaded || !N.rt)) N.load();
    var f = m.querySelector('.nt-it'); if (f) f.focus({ preventScroll: true });
  };
  function onClick(e) {
    var t = e.target.closest('[data-nt],[data-nt-act],[data-need]'); if (!t) return;
    e.stopPropagation();
    if (t.hasAttribute('data-nt')) { go(t.getAttribute('data-nt')); return; }
    if (t.hasAttribute('data-need')) {
      var r = feed().needs[+t.getAttribute('data-need')]; bpShell.closeAll(); if (r && r.go) bpNav(r.go); return;
    }
    var a = t.getAttribute('data-nt-act');
    if (a === 'all') N.markAll();
    else if (a === 'desk') N.desktopOn();
    else if (a === 'back') { N.view = 'list'; var m = openPanel(); if (m) fill(m); }
    else if (a === 'prefs') {
      if (!crew() && (!window.bpTeamAllows || bpTeamAllows('settings'))) { bpShell.closeAll(); N.toSettings(); }
      else { N.view = 'prefs'; var m2 = openPanel(); if (m2) fill(m2); }
    }
  }

  /* ---------- read ---------- */
  function setRead(ids) {
    var now = new Date().toISOString();
    N.items.forEach(function (n) { if (ids.indexOf(n.id) >= 0 && !n.read_at) n.read_at = now; });
    paint();
    if (!live() || !ids.length) return Promise.resolve();
    var q = BP_SB.from('notifications').update({ read_at: now });
    q = ids.length === 1 ? q.eq('id', ids[0]) : q.in('id', ids);
    return Promise.resolve(q).catch(function () {});
  }
  N.markRead = function (id) { return setRead([id]); };
  N.markAll = function () {
    var ids = N.items.filter(function (n) { return !n.read_at; }).map(function (n) { return n.id; });
    if (!ids.length) return Promise.resolve();
    var now = new Date().toISOString();
    N.items.forEach(function (n) { if (!n.read_at) n.read_at = now; });
    paint();
    if (!live()) return Promise.resolve();
    /* every unread row of mine, including ones older than the 60 loaded */
    return Promise.resolve(BP_SB.from('notifications').update({ read_at: now }).is('read_at', null)).catch(function () {});
  };

  /* ---------- go to what it is about ---------- */
  function allowed(v) { return !!(window.BPVIEWS && BPVIEWS[v]) && (!window.bpTeamAllows || bpTeamAllows(v)); }
  function later(fn, tries) {
    var n = 0, t = setInterval(function () { n++; var ok = false; try { ok = fn(); } catch (e) {} if (ok || n >= (tries || 30)) clearInterval(t); }, 100);
  }
  N.follow = function (link, jobId) {
    link = String(link || ''); var i = link.indexOf(':');
    var v = i >= 0 ? link.slice(0, i) : link, id = i >= 0 ? link.slice(i + 1) : '';
    if (!v && jobId) { v = 'activejobs'; id = jobId; }
    if (!v) return;
    if (v === 'activejobs') {
      if (sub()) { bpNav('subjobs'); if (id) later(function () { if (window.bpSubJob && $('bpxViewArea')) { bpSubJob(id); return true; } }); return; }
      if (crew()) { bpNav('crewprojects'); if (id) later(function () { if (window.bpCrewJob && $('bpxViewArea')) { bpCrewJob(id); return true; } }); return; }
      bpNav('activejobs'); if (id) setTimeout(function () { if (window.bpProjOpen) bpProjOpen(id); }, 80);
      return;
    }
    if (v === 'teamchat') {
      bpNav(crew() ? 'crewmsgs' : 'teamchat');
      if (id) later(function () { var C = window.BP_TCHAT; if (C && (C.threads || []).some(function (t) { return t.id === id; }) && window.bpTcOpen) { bpTcOpen(id); return true; } });
      return;
    }
    if (v === 'employees' && id && allowed('employees')) {
      bpNav('employees');
      later(function () { if (window.bpCrewTab && window.BP_CREW && BP_CREW.loaded && $('bpCrewPane')) { if (id === 'pay') bpCrewTab('pay'); else bpCrewTab(id); return true; } });
      return;
    }
    if (v === 'storm') { bpNav('dashboard'); if (id) later(function () { if (window.bpStormOpen && $('bpxViewArea')) { bpStormOpen(id); return true; } }); return; }
    if (v === 'contacts') { bpNav('contacts'); if (id) setTimeout(function () { if (window.bpContactPage) bpContactPage(id); }, 80); return; }
    if (allowed(v)) bpNav(v);
  };
  function go(id) {
    var n = N.items.filter(function (x) { return x.id === id; })[0]; if (!n) return;
    if (!n.read_at) N.markRead(id);
    bpShell.closeAll();
    N.follow(n.link, n.job_id);
  }

  /* ---------- live ---------- */
  function onRow(p) {
    if (!p) return;
    var ev = p.eventType || p.type, row = p.new && p.new.id ? p.new : null;
    if (ev === 'INSERT' && row) {
      var had = N.items.some(function (x) { return x.id === row.id; });
      N.items = [row].concat(N.items.filter(function (x) { return x.id !== row.id; })).slice(0, 80);
      if (!had && !row.read_at) desktop(row);
    } else if (ev === 'UPDATE' && row) {
      var fresh = Date.parse(row.created_at) > Date.now() - 60000 && !row.read_at;
      var old = N.items.filter(function (x) { return x.id === row.id; })[0];
      N.items = N.items.filter(function (x) { return x.id !== row.id; }).concat([row]);
      N.items.sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); });
      if (fresh && (!old || old.body !== row.body)) desktop(row);   /* team chat refreshes one row per thread */
    } else return;
    paint();
  }
  function pollOn() { if (!N.poll) N.poll = setInterval(function () { if (!document.hidden) N.load(); }, 60000); }
  function pollOff() { if (N.poll) { clearInterval(N.poll); N.poll = null; } }
  N.start = function () {
    if (N.started) return; N.started = true;
    N.load();
    if (!live()) return;
    uid().then(function (me) {
      if (!me) { pollOn(); return; }
      N.uid = me;
      prefsLoad();   /* quiet hours for desktop alerts */
      try {
        if (!BP_SB.channel) { pollOn(); return; }
        N.ch = BP_SB.channel('notify-' + me)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + me }, onRow)
          .subscribe(function (status) {
            if (status === 'SUBSCRIBED') { if (!N.rt) N.load(); N.rt = true; pollOff(); }
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { N.rt = false; pollOn(); }
          });
        setTimeout(function () { if (!N.rt) pollOn(); }, 5000);
      } catch (e) { pollOn(); }
    });
  };
  N.stop = function () {
    pollOff();
    if (N.ch) { try { BP_SB.removeChannel(N.ch); } catch (e) {} N.ch = null; }
    N.rt = false; N.started = false;
  };
  document.addEventListener('visibilitychange', function () { if (!document.hidden && N.started && !N.rt) N.load(); });

  /* ---------- desktop alerts (opt-in only) ---------- */
  function quiet() {
    var p = N.prefs; if (!p || !p.quiet_from || !p.quiet_to) return false;
    var d = new Date(), m = d.getHours() * 60 + d.getMinutes();
    var a = +p.quiet_from.slice(0, 2) * 60 + +p.quiet_from.slice(3, 5), b = +p.quiet_to.slice(0, 2) * 60 + +p.quiet_to.slice(3, 5);
    return a <= b ? (m >= a && m < b) : (m >= a || m < b);
  }
  function desktop(n) {
    if (desktopState() !== 'granted' || LS.get('ntDesk') !== '1' || quiet()) return;
    if (!document.hidden && document.hasFocus && document.hasFocus()) return;   /* the bell is enough when they're looking */
    try {
      var x = new Notification(n.title || 'BuilderPro', { body: n.body || '', tag: 'bp-' + n.id, icon: 'assets/brand/logo-mark-128.png' });
      x.onclick = function () { try { window.focus(); } catch (e) {} x.close(); if (!n.read_at) N.markRead(n.id); N.follow(n.link, n.job_id); };
    } catch (e) {}
  }
  N.desktopOn = function () {
    if (!('Notification' in window)) return;
    LS.set('ntDeskAsked', '1');
    var done = function (p) { if (p === 'granted') { LS.set('ntDesk', '1'); if (window.bpToast) bpToast('Desktop alerts are on.'); } paint(); var s = $('ntDeskRow'); if (s) N.settings(s.closest('[data-nt-prefs]'), s.closest('.nt-prefs-in') != null); };
    try {
      var r = Notification.requestPermission(done);
      if (r && r.then) r.then(done);
    } catch (e) {}
  };
  N.desktopOff = function () { LS.set('ntDesk', '0'); };

  /* ---------- settings ---------- */
  function prefsLoad() {
    if (N.prefs) return Promise.resolve(N.prefs);
    var blank = { prefs: {}, email: false, sms: false, quiet_from: null, quiet_to: null };
    if (!live()) { N.prefs = blank; return Promise.resolve(N.prefs); }
    return uid().then(function (me) {
      if (!me) { N.prefs = blank; return N.prefs; }
      return Promise.resolve(BP_SB.from('notification_prefs').select('prefs,email,sms,quiet_from,quiet_to').eq('user_id', me).maybeSingle())
        .then(function (r) { N.prefs = Object.assign(blank, (r && r.data) || {}); N.prefs.prefs = N.prefs.prefs || {}; return N.prefs; })
        .catch(function () { N.prefs = blank; return N.prefs; });
    });
  }
  var saveT = null;
  function prefsSave(host) {
    clearTimeout(saveT);
    var msg = host && host.querySelector('.nt-saved');
    if (msg) { msg.textContent = 'Saving…'; msg.classList.remove('err'); }
    saveT = setTimeout(function () {
      var p = N.prefs;
      var row = { prefs: p.prefs, email: !!p.email, sms: !!p.sms, quiet_from: p.quiet_from || null, quiet_to: p.quiet_to || null };
      var after = function (ok) { if (msg) { msg.textContent = ok ? 'Saved' : 'Couldn’t save. Try again.'; msg.classList.toggle('err', !ok); } };
      if (!live()) { after(true); return; }
      uid().then(function (me) {
        if (!me) { after(false); return; }
        row.user_id = me;
        Promise.resolve(BP_SB.from('notification_prefs').upsert(row, { onConflict: 'user_id' }))
          .then(function (r) { after(!(r && r.error)); }).catch(function () { after(false); });
      });
    }, 350);
  }
  function sw(id, on, label, hint, attrs) {
    return '<label class="nt-sw" for="' + id + '"><span class="nt-swt"><b>' + label + '</b>' + (hint ? '<small>' + hint + '</small>' : '') + '</span>'
      + '<input type="checkbox" role="switch" id="' + id + '"' + (on ? ' checked' : '') + ' ' + (attrs || '') + '><i aria-hidden="true"></i></label>';
  }
  /* host: any element. compact: the crew version inside the panel */
  N.settings = function (host, compact) {
    if (!host) return;
    host.setAttribute('data-nt-prefs', '1');
    if (!N.prefs) { host.innerHTML = '<div class="nt-empty"><span>Loading…</span></div>'; prefsLoad().then(function () { N.settings(host, compact); }); return; }
    var p = N.prefs, r = role(), ds = desktopState();
    var groups = GROUPS.map(function (gname, gi) {
      var ks = Object.keys(KINDS).filter(function (k) { return KINDS[k].g === gi && KINDS[k].r.indexOf(r) >= 0; });
      if (!ks.length) return '';
      return '<fieldset class="nt-grp"><legend>' + esc(gname) + '</legend>' + ks.map(function (k) {
        return sw('nt-k-' + k, p.prefs[k] !== 'off', esc(KINDS[k].t), '', 'data-nt-kind="' + k + '"');
      }).join('') + '</fieldset>';
    }).join('');
    var desk = ds === 'none' ? '<div class="nt-note">This browser can’t show desktop alerts.</div>'
      : ds === 'denied' ? '<div class="nt-note">Desktop alerts are blocked for this site. Allow them in the browser’s site settings, then come back.</div>'
      : ds === 'granted' ? sw('nt-desk', LS.get('ntDesk') === '1', 'Desktop alerts', 'A pop-up from the browser when something new comes in and this tab isn’t in front.', 'data-nt-desk="1"')
      : '<button type="button" class="nt-btn" data-nt-deskon="1">' + svg('screen') + 'Turn on desktop alerts</button><div class="nt-note">Your browser will ask first. Only for this browser.</div>';
    host.innerHTML = '<div class="nt-set' + (compact ? ' compact' : '') + '">'
      + '<p class="nt-intro">Pick what lands in your bell. Everything stays on until you turn it off.</p>'
      + groups
      + '<fieldset class="nt-grp"><legend>How you hear about it</legend>'
        + '<div class="nt-desk" id="ntDeskRow">' + desk + '</div>'
        + sw('nt-email', p.email, 'Email me too <span class="nt-soon">Coming soon</span>', 'Saved now; emails start when this goes live.', 'data-nt-ch="email"')
        + sw('nt-sms', p.sms, 'Text me too <span class="nt-soon">Coming soon</span>', 'Saved now; texts start when this goes live.', 'data-nt-ch="sms"')
        + '<div class="nt-quiet"><span class="nt-swt"><b>Quiet hours</b><small>No desktop alerts between these times. The bell still counts.</small></span>'
          + '<span class="nt-qt"><input type="time" id="nt-qf" aria-label="Quiet from" value="' + esc((p.quiet_from || '').slice(0, 5)) + '"><span>to</span><input type="time" id="nt-qt" aria-label="Quiet until" value="' + esc((p.quiet_to || '').slice(0, 5)) + '"></span></div>'
      + '</fieldset>'
      + '<div class="nt-saved" aria-live="polite"></div></div>';
    host.onchange = function (e) {
      var t = e.target;
      if (t.hasAttribute('data-nt-kind')) { var k = t.getAttribute('data-nt-kind'); if (t.checked) delete p.prefs[k]; else p.prefs[k] = 'off'; prefsSave(host); }
      else if (t.hasAttribute('data-nt-ch')) { p[t.getAttribute('data-nt-ch')] = t.checked; prefsSave(host); }
      else if (t.id === 'nt-qf' || t.id === 'nt-qt') { p.quiet_from = $('nt-qf').value || null; p.quiet_to = $('nt-qt').value || null; prefsSave(host); }
      else if (t.hasAttribute('data-nt-desk')) { LS.set('ntDesk', t.checked ? '1' : '0'); }
    };
    host.onclick = function (e) { var b = e.target.closest('[data-nt-deskon]'); if (b) { e.stopPropagation(); N.desktopOn(); } };
  };
  N.toSettings = function () {
    window._bpSetSec = 'notify';
    bpNav('settings');
    setTimeout(function () { if (window.bpSetTab) bpSetTab('notify'); }, 60);
  };
  /* Settings > Notifications calls this (index.html) */
  window.bpNotifySettings = function () { N.settings($('bpx-nt-host')); };

  /* ---------- take over the shell's bell ---------- */
  function hook() {
    var S = window.bpShell; if (!S || S._nt) return !!S;
    S._nt = true;
    S.badge = badge;
    S.notes = function (btn) { N.open(btn); };
    var enter = S.enter;
    S.enter = function () { var r = enter.apply(this, arguments); setTimeout(N.start, 800); return r; };
    return true;
  }
  if (!hook()) later(hook, 50);
})();
