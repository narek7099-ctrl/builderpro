/* ==================================================================
   Phones: the app the way a phone app works (pairs with mobile.css).

   Only below 760px wide. Computers and tablets keep the sidebar layout.

     Bottom tab bar   the four places each role goes most, plus Apps/More
                      owner/office: Home, Inbox, Projects, Calendar, Apps
                      crew:         Home, Clock, Projects, Messages, More
                      sub:          Jobs, Invoices, Changes, Messages, More
     Apps sheet       everything else, as a grid, plus settings and sign out
     Home (owner)     replaces the desktop dashboard on a phone: four
                      numbers, what needs you, today, pinned apps and quick
                      actions. The desktop dashboard is untouched.
     Top bar          the business on Home, the page title elsewhere; the
                      bell and a settings gear. The hamburger and the AI /
                      help buttons go: Apps and Quick actions cover them.

   Everything routes through bpNav(), so permissions and plan locks apply
   exactly as on a computer.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var mq = window.matchMedia ? window.matchMedia('(max-width: 760px)') : { matches: false };
  var M = window.bpMobile = {};
  M.on = function () { return !!mq.matches; };

  function S() { return window.bpShell || {}; }
  function ico(k) { return S().ico ? S().ico(k) : ''; }
  function role() { var t = window.BP_TEAM || {}; return t.role === 'sub' ? 'sub' : t.role === 'crew' ? 'crew' : 'owner'; }
  function allows(v) { return !window.bpTeamAllows || bpTeamAllows(v); }
  function locked(v) { return !!(window.bpLocked && bpLocked(v)); }
  function sets() { try { return (window.bpSettingsGet && bpSettingsGet()) || {}; } catch (e) { return {}; } }
  function bizName() { var c = sets().company || {}; return c.name || 'My business'; }
  function ownerFirst() { var o = sets().owner || {}; return String(o.first || o.name || '').trim().split(/\s+/)[0] || ''; }
  function initials(s) { var p = String(s || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function money(n) { n = Math.round(+n || 0); return (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString(); }
  function iso(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ------------------------------------------------------------ tabs --- */
  var TABS = {
    /* owner: the big + in the middle makes anything new; everything else is under the avatar (top right) */
    owner: [['home', 'Home', 'home', 'dashboard'], ['projects', 'Jobs', 'projects', 'activejobs'], ['create', 'New', 'plus', null], ['calendar', 'Calendar', 'calendar', 'calendar'], ['inbox', 'Inbox', 'convos', 'messaging']],
    crew: [['home', 'Clock', 'clock', 'crewdash'], ['projects', 'Jobs', 'projects', 'crewprojects'], ['msgs', 'Messages', 'convos', 'crewmsgs'], ['apps', 'Me', 'user', null]],
    sub: [['jobs', 'Jobs', 'projects', 'subjobs'], ['inv', 'Invoices', 'inv', 'subinvoices'], ['chg', 'Changes', 'page', 'subchanges'], ['msgs', 'Messages', 'convos', 'crewmsgs'], ['apps', 'More', 'dots', null]]
  };
  /* which tab a view lights up */
  function tabOf(v) {
    var r = role();
    if (r === 'owner') {
      if (v === 'dashboard') return 'home';
      var g = window.bpNavGroupOf ? bpNavGroupOf(v) : null;
      if (g === 'convos') return 'inbox';
      if (g === 'projects') return 'projects';
      if (v === 'calendar') return 'calendar';
      return '';
    }
    var hit = TABS[r].filter(function (t) { return t[3] === v; })[0];
    return hit ? hit[0] : 'apps';
  }
  var APPS_ICO = '<svg class="hl-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="5" r="1.7"/><circle cx="12" cy="5" r="1.7"/><circle cx="19" cy="5" r="1.7"/><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/><circle cx="5" cy="19" r="1.7"/><circle cx="12" cy="19" r="1.7"/><circle cx="19" cy="19" r="1.7"/></svg>';
  function tabbar() {
    var app = document.querySelector('#bpx .bpx-app'); if (!app) return null;
    var bar = $('bpTabbar');
    if (!bar) { bar = document.createElement('nav'); bar.id = 'bpTabbar'; bar.className = 'bp-tabbar'; bar.setAttribute('aria-label', 'Main'); app.appendChild(bar); }
    var r = role(), list = TABS[r].filter(function (t) { return !t[3] || allows(t[3]); });
    var key = r + ':' + list.map(function (t) { return t[0]; }).join(',');
    if (bar.getAttribute('data-k') !== key) {
      bar.setAttribute('data-k', key);
      bar.innerHTML = list.map(function (t) {
        if (t[0] === 'create') return '<button type="button" class="bp-tab bp-tab-new" data-tab="create" aria-label="Create something new" onclick="bpMobile.create()"><span class="bp-tab-plus"><svg class="hl-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span></button>';
        return '<button type="button" class="bp-tab" data-tab="' + t[0] + '" onclick="bpMobile.tab(\'' + t[0] + '\')">'
          + '<span class="bp-tab-i">' + (t[2] === 'apps' ? APPS_ICO : ico(t[2])) + '</span><span class="bp-tab-l">' + esc(t[1]) + '</span></button>';
      }).join('');
    }
    return bar;
  }
  M.tab = function (k) {
    var t = TABS[role()].filter(function (x) { return x[0] === k; })[0]; if (!t) return;
    if (!t[3]) return M.apps();
    M.appsClose();
    if (window._bpCurView === t[3]) { if (window.bpScrollTop) bpScrollTop(); return; }
    bpNav(t[3]);
  };
  function paintTabs(v) {
    var bar = tabbar(); if (!bar) return;
    var on = $('bpApps') ? 'apps' : tabOf(v || window._bpCurView);
    bar.querySelectorAll('.bp-tab').forEach(function (b) {
      var a = b.getAttribute('data-tab') === on; b.classList.toggle('on', a);
      if (a) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* --------------------------------------------------------- top bar --- */
  function homeView(v) { return (v === 'dashboard' && role() === 'owner'); }
  function paintTop(v) {
    var top = $('hlTop'); if (!top) return;
    var chip = $('bpMAcct');
    if (!chip) {
      chip = document.createElement('button'); chip.type = 'button'; chip.id = 'bpMAcct'; chip.className = 'bp-macct';
      chip.setAttribute('aria-haspopup', 'menu');
      chip.onclick = function () { if (S().acctMenu) S().acctMenu(chip); };
      var ttl = top.querySelector('.hl-ttl'); top.insertBefore(chip, ttl);
    }
    var logo = (sets().company || {}).logoUrl;
    chip.innerHTML = '<span class="bp-macct-av">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : esc(initials(bizName()))) + '</span>'
      + '<span class="bp-macct-t"><b>' + esc(bizName()) + '</b><small>' + esc((sets().company || {}).city || (window.bpPlanInfo ? (bpPlanInfo().name || '') : '')) + '</small></span>'
      + '<svg class="hl-i bp-macct-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    var x = $('bpx'); if (x) x.classList.toggle('bp-m-home', homeView(v || window._bpCurView));
    var av0 = $('hlAv');
    if (av0 && role() === 'owner' && !av0._m) { av0._m = 1; var po = av0.onclick; av0.onclick = function (e) { if (M.on()) { e.preventDefault(); M.apps(); } else if (po) po.call(av0, e); }; }
    var acts = $('hlTacts');
    if (acts && role() === 'owner' && allows('settings') && !$('bpMGear')) {
      var g = document.createElement('button'); g.type = 'button'; g.id = 'bpMGear'; g.className = 'hl-rb bp-m-only'; g.title = 'Settings'; g.setAttribute('aria-label', 'Settings');
      g.innerHTML = ico('settings'); g.onclick = function () { bpNav('settings'); };
      var av = $('hlAv'); acts.insertBefore(g, av || null);
    }
  }

  /* ------------------------------------------------------ apps sheet --- */
  function tile(ic, label, fn, o) {
    o = o || {};
    return '<button type="button" class="bp-app' + (o.lock ? ' lock' : '') + '" onclick="' + fn + '"><span class="bp-app-c">' + ico(ic)
      + (o.lock ? '<i class="bp-app-lock"><svg class="hl-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></i>' : '') + '</span><span class="bp-app-l">' + esc(label) + '</span></button>';
  }
  M.apps = function () {
    if ($('bpApps')) return M.appsClose();
    var r = role(), grid = '', more = '';
    if (r === 'owner') {
      (window.BP_NAV || []).forEach(function (g) {
        var ks = g.kids ? g.kids.filter(function (k) { return allows(k[0]); }) : null;
        if (g.id === 'dashboard' || (ks ? !ks.length : !allows(g.id))) return;
        var lk = ks ? ks.every(function (k) { return locked(k[0]); }) : locked(g.id);
        grid += tile(g.ico || g.id, g.l, "bpMobile.go('" + g.id + "')", { lock: lk });
      });
      if (allows('settings')) grid += tile('settings', 'Settings', "bpMobile.nav('settings')");
      more = '<button type="button" class="bp-sheet-row" onclick="bpMobile.appsClose();bpShell.ai()">' + ico('spark') + '<span>Ask ' + esc(window.BP_AI_NAME || 'Lisa') + ', your assistant</span></button>'
        + '<button type="button" class="bp-sheet-row" onclick="bpMobile.appsClose();bpShell.palette()">' + ico('search') + '<span>Search everything</span></button>';
    } else if (r === 'crew') {
      grid = tile('crew', 'My crew', "bpMobile.nav('crewhome')") + tile('badge', 'My ID', "bpMobile.nav('crewid')") + tile('clock', 'Time clock', "bpMobile.nav('crewclock')") + tile('projects', 'Projects', "bpMobile.nav('crewprojects')") + tile('tool', 'Equipment', "bpMobile.nav('assets')");
    } else {
      grid = tile('badge', 'Compliance', "bpMobile.nav('subcomply')") + tile('crew', 'My company', "bpMobile.nav('subcompany')") + tile('page', 'Change orders', "bpMobile.nav('subchanges')") + tile('inv', 'Invoices', "bpMobile.nav('subinvoices')");
    }
    var dark = !!($('bpx') && $('bpx').classList.contains('bpx-dark'));
    var el = document.createElement('div'); el.id = 'bpApps'; el.className = 'bp-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', r === 'owner' ? 'Apps' : 'More');
    el.innerHTML = '<div class="bp-sheet-bg" onclick="bpMobile.appsClose()"></div><div class="bp-sheet-card"><i class="bp-sheet-grab"></i>'
      + '<div class="bp-sheet-h"><b>' + (r === 'owner' ? 'Apps' : 'More') + '</b><button type="button" class="bp-sheet-x" onclick="bpMobile.appsClose()" aria-label="Close">×</button></div>'
      + '<div class="bp-apps">' + grid + '</div>'
      + '<div class="bp-sheet-rows">' + more
        + (window.bpTour ? '<button type="button" class="bp-sheet-row" onclick="bpMobile.appsClose();bpTour()">' + ico('help') + '<span>Take the tour</span></button>' : '')
        + '<button type="button" class="bp-sheet-row" onclick="bpMobile.dark(this)">' + ico('moon') + '<span>Dark mode</span><span class="hl-sw' + (dark ? ' on' : '') + '" aria-hidden="true"><i></i></span></button>'
        + '<button type="button" class="bp-sheet-row" onclick="bpMobile.appsClose();bpShell.leave()">' + ico('globe') + '<span>Back to website</span></button>'
        + '<button type="button" class="bp-sheet-row danger" onclick="bpMobile.appsClose();bpLogout()">' + ico('out') + '<span>Sign out</span></button></div></div>';
    ($('bpx') || document.body).appendChild(el);
    paintTabs();
  };
  /* the + sheet: every "new" thing in one place */
  M.create = function () {
    M.createClose(); M.appsClose();
    var big = [['estimates', "bpMobile.quick('estimates','bpEstOpen')", 'request_quote', 'Estimate', 1], ['invoices', "bpMobile.quick('invoices','bpInvOpen')", 'receipt_long', 'Invoice'],
      ['activejobs', "bpMobile.quick('activejobs','bpAddJobOpen')", 'add_business', 'Job'], ['contacts', "bpMobile.quick('contacts','bpOpenAdd')", 'person_add', 'Customer']].filter(function (q) { return allows(q[0]); });
    var small = [['calendar', "window._bpApptCal='inspection';bpMobile.quick('calendar','bpOpenBook')", 'roofing', 'Book an inspection'], ['receipts', "bpMobile.createClose();bpNav('receipts')", 'photo_camera', 'Snap a receipt'],
      ['calendar', "bpMobile.quick('calendar','bpNoteOpen')", 'sticky_note_2', 'Note or to-do']].filter(function (q) { return allows(q[0]); });
    var el = document.createElement('div'); el.id = 'bpCreate'; el.className = 'bp-create';
    el.innerHTML = '<div class="bp-create-bg" onclick="bpMobile.createClose()"></div><div class="bp-create-sh" role="dialog" aria-label="Create something new"><i class="bp-create-grab"></i>'
      + '<div class="bp-create-h"><b>What do you need?</b><button type="button" class="bp-create-x" aria-label="Close" onclick="bpMobile.createClose()"><span class="ms">close</span></button></div>'
      + '<div class="bp-create-big">' + big.map(function (q) { return '<button type="button" class="' + (q[4] ? 'pri' : '') + '" onclick="bpMobile.createClose();' + q[1] + '"><span class="ms">' + q[2] + '</span><b>' + q[3] + '</b></button>'; }).join('') + '</div>'
      + '<div class="bp-create-list">' + small.map(function (q) { return '<button type="button" onclick="bpMobile.createClose();' + q[1] + '"><span class="ms">' + q[2] + '</span>' + q[3] + '</button>'; }).join('') + '</div></div>';
    ($('bpx') || document.body).appendChild(el);
  };
  M.createClose = function () { var el = $('bpCreate'); if (el) el.remove(); };
  M.appsClose = function () { var el = $('bpApps'); if (el) { el.remove(); paintTabs(); } };
  M.go = function (gid) { M.appsClose(); if (S().go) S().go(gid); else bpNav(gid); };
  M.nav = function (v) { M.appsClose(); bpNav(v); };
  M.dark = function (b) { if (window.bpToggleTheme) bpToggleTheme(); var s = b.querySelector('.hl-sw'); if (s) s.classList.toggle('on', !!($('bpx') && $('bpx').classList.contains('bpx-dark'))); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('bpApps')) M.appsClose(); });

  /* ------------------------------------------------------ owner home --- */
  function D() { return window.BPDASH || {}; }
  function kpi(per, title, ic, tone, val, go, note) {
    return '<button type="button" class="mh-k" onclick="bpNav(\'' + go + '\')"><span class="mh-k-per"><svg class="hl-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' + per + '</span>'
      + '<span class="mh-k-b"><span class="mh-k-t">' + title + '</span><span class="mh-k-ic ' + tone + '"><span class="ms">' + ic + '</span></span>'
      + '<b class="mh-k-v">' + val + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</span></button>';
  }
  function circ(ic, label, fn, msIcon) {
    return '<button type="button" class="mh-c" onclick="' + fn + '"><span class="mh-c-r">' + (msIcon ? '<span class="ms">' + ic + '</span>' : ico(ic)) + '</span><span>' + esc(label) + '</span></button>';
  }
  M.quick = function (v, fn, arg) {
    bpNav(v);
    if (locked(v)) return;
    setTimeout(function () { var f = window[fn]; if (typeof f === 'function') { try { arg ? f(arg) : f(); } catch (e) {} } }, 90);
  };
  M.refresh = function () {
    var d = D(); ['unread', 'deals', 'leads', 'events', 'appts', 'contracts'].forEach(function (k) { d[k] = undefined; });
    if (window.bpDashboard) bpDashboard();
  };
  function home() {
    var el = $('bpxViewArea'); if (!el) return;
    var d = D(), dots = '<span class="mh-dots">•••</span>';
    var jobs = (window.bpJobsGet && bpJobsGet()) || [], act = jobs.filter(function (j) { return j.status === 'active'; });
    var owed = act.reduce(function (t, j) { return t + Math.max((+j.estimate || 0) - (+j.collected || 0), 0); }, 0);
    var day = iso(), hiH = new Date().getHours();
    var crews = act.filter(function (j) { return j.sched && (j.sched.dates || []).indexOf(day) >= 0; });
    var appts = (d.appts || []).filter(function (a) { return !a.start || a.start.slice(0, 10) === day || iso(new Date(a.start)) === day; });
    var todayRows = crews.map(function (j) { return { t: j.sched.time ? esc(j.sched.time) : 'All day', w: esc(j.name || 'Project') + (j.title ? ' · ' + esc(j.title) : ''), s: 'Crew on site', go: 'activejobs', ic: 'construction' }; })
      .concat(appts.slice(0, 5).map(function (a) { return { t: esc(a.time || ''), w: esc(a.name || 'Appointment'), s: esc(a.what || 'Appointment'), go: 'calendar', ic: 'event' }; }));
    var needs = [];
    try { needs = (window.BP_DASH && BP_DASH.feed) ? (BP_DASH.feed().needs || []) : []; } catch (e) { needs = []; }
    var name = ownerFirst();
    var pins = [['contacts', 'Contacts', 'user'], ['closedeals', 'Pipeline', 'leads'], ['estimates', 'Estimates', 'est'], ['invoices', 'Invoices', 'inv']].filter(function (p) { return allows(p[0]); });
    var quick = [['contacts', 'bpOpenAdd', '', 'person_add', 'New contact'], ['estimates', 'bpEstOpen', '', 'request_quote', 'Estimate'], ['invoices', 'bpInvOpen', '', 'receipt_long', 'Invoice'],
      ['activejobs', 'bpAddJobOpen', '', 'add_business', 'Project'], ['ledger', 'bpFinAddOpen', 'expense', 'payments', 'Expense']].filter(function (q) { return allows(q[0]); });
    var got = jobs.reduce(function (t, j) { return t + (+j.collected || 0); }, 0);
    var tileB = function (fnq, ic, label, pri) { return '<button type="button" class="mh2-tile' + (pri ? ' pri' : '') + '" onclick="' + fnq + '"><span class="ms">' + ic + '</span><b>' + label + '</b></button>'; };
    var row = function (go, dot, t, sub) { return '<button type="button" class="mh2-row" onclick="bpNav(\'' + esc(go) + '\')"><i class="mh2-dot ' + dot + '"></i><span class="mh2-rt"><b>' + t + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="ms">chevron_right</span></button>'; };
    el.innerHTML = '<div class="mh2">'
      + '<section class="mh2-hero">'
        + '<small>' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + '</small>'
        + '<h2>' + (hiH < 12 ? 'Morning' : hiH < 17 ? 'Afternoon' : 'Evening') + (name ? ', ' + esc(name) : '') + '</h2>'
        + '<button type="button" class="mh2-owed" onclick="bpNav(\'invoices\')"><span>Customers owe you</span><b>' + money(owed) + '</b>'
          + '<small>on ' + act.length + (act.length === 1 ? ' job' : ' jobs') + (got ? ' · ' + money(got) + ' collected so far' : '') + '</small></button>'
      + '</section>'
      + '<div class="mh2-body">'
        + '<section class="mh2-tiles">'
          + (allows('estimates') ? tileB("bpMobile.quick('estimates','bpEstOpen')", 'request_quote', 'New estimate', 1) : '')
          + (allows('activejobs') ? tileB("bpMobile.quick('activejobs','bpAddJobOpen')", 'add_business', 'Add job') : '')
          + (allows('invoices') ? tileB("bpMobile.quick('invoices','bpInvOpen')", 'receipt_long', 'Send invoice') : '')
          + (allows('calendar') ? tileB("bpMobile.quick('calendar','bpCrewBookOpen')", 'groups', 'Schedule crew') : '')
        + '</section>'
        + '<section class="mh2-card"><div class="mh2-h"><b>Needs you</b>' + (needs.length ? '<span class="mh2-n">' + needs.length + '</span>' : '') + '</div>'
          + (needs.length ? needs.slice(0, 3).map(function (r) { return row(r.go, r.tone || '', r.t, ''); }).join('')
            + (needs.length > 3 ? '<button type="button" class="mh2-more" onclick="bpShell.notes&&bpShell.notes(document.getElementById(\'hlBell\'))">See all ' + needs.length + '</button>' : '')
            : '<div class="mh2-empty"><span class="ms">check_circle</span>You’re all caught up.</div>')
        + '</section>'
        + '<section class="mh2-card"><div class="mh2-h"><b>Today</b></div>'
          + (todayRows.length ? todayRows.map(function (r) { return '<button type="button" class="mh2-today" onclick="bpNav(\'' + r.go + '\')"><span class="mh2-tt">' + (r.t || '') + '</span><span class="mh2-rt"><b>' + r.w + '</b><small>' + r.s + '</small></span></button>'; }).join('')
            : '<div class="mh2-empty"><span class="ms">event_available</span>' + (d.appts === undefined ? 'Loading today…' : 'Nothing booked today.') + '</div>')
        + '</section>'
      + '</div></div>';
  }

  /* ---------------------------------------------- tables, tabs, tidy --- */
  /* A table on a phone becomes a stack of cards: the first cell is the
     title, the rest read "Label  value" from the column headers. Only the
     labels are added here; the layout is in mobile.css. */
  var TBL = '#bpxViewArea table.bpx-ctable, #bpxViewArea table.bpx-table';
  function labelTables() {
    if (!M.on()) return;
    Array.prototype.forEach.call(document.querySelectorAll(TBL), function (t) {
      if (t.classList.contains('pr-tbl') || t.classList.contains('ml-jobs')) return;
      var hr = t.tHead && t.tHead.rows[0]; if (!hr) return;
      var heads = []; Array.prototype.forEach.call(hr.cells, function (c) { var n = +c.colSpan || 1; for (var i = 0; i < n; i++) heads.push(c.textContent.trim()); });
      t.classList.add('bp-mcards');
      Array.prototype.forEach.call(t.tBodies, function (tb) {
        Array.prototype.forEach.call(tb.rows, function (r) {
          if (r._bpml === r.cells.length) return; r._bpml = r.cells.length;
          var k = 0;
          Array.prototype.forEach.call(r.cells, function (c) {
            if ((+c.colSpan || 1) > 1 && r.cells.length === 1) { c.classList.add('bp-mfull'); return; }
            c.setAttribute('data-l', heads[k] || '');
            /* the value stays one block beside its label, however many pieces it has */
            if (k > 0 && !c._bpmv && c.childNodes.length && !c.querySelector(':scope > .bp-mv')) { var w = document.createElement('span'); w.className = 'bp-mv'; while (c.firstChild) w.appendChild(c.firstChild); c.appendChild(w); c._bpmv = 1; } if (!String(c.textContent).trim() && !c.querySelector('button,a,input,select,img,svg')) c.classList.add('bp-mempty');
            else if (/^[—–-]$/.test(String(c.textContent).trim()) && !c.querySelector('button,input,select')) c.classList.add('bp-mdash');
            k += +c.colSpan || 1;
          });
        });
      });
    });
  }
  /* the section tabs scroll sideways: show that there is more, and keep the open one in view */
  function tabsFade() {
    var t = document.querySelector('#bpx .hl-tabs'); if (!t) return;
    var upd = function () { t.classList.toggle('bp-more', t.scrollWidth - t.clientWidth - t.scrollLeft > 6); t.classList.toggle('bp-less', t.scrollLeft > 6); };
    if (!t._bpf) { t._bpf = 1; t.addEventListener('scroll', upd, { passive: true }); }
    var on = t.querySelector('.hl-tab.on');
    if (on && M.on()) { var l = on.offsetLeft - 16, r = on.offsetLeft + on.offsetWidth - t.clientWidth + 16; if (t.scrollLeft > l) t.scrollLeft = l; else if (t.scrollLeft < r) t.scrollLeft = r; }
    upd();
  }
  var tidyT = null;
  /* a row of stat tiles that are all "—" (nothing connected yet) says nothing
     on a phone; the connect card under it says it better */
  function emptyStats() {
    if (!M.on()) return;
    Array.prototype.forEach.call(document.querySelectorAll('#bpxViewArea .bpx-stats'), function (g) {
      var v = g.querySelectorAll('.val'); if (!v.length) return;
      var empty = Array.prototype.every.call(v, function (x) { return /^[\s—–-]*$/.test(x.textContent); });
      g.classList.toggle('bp-mhide', empty);
    });
  }
  /* Texts and email: on a phone an opened conversation takes the whole screen,
     like a messaging app, with a back arrow to the list (it used to open under
     the list, off screen, so tapping looked like it did nothing) */
  function inboxHook() {
    ['bpOpenConv', 'bpMyInboxOpen'].forEach(function (n) {
      var o = window[n]; if (typeof o !== 'function' || o._m) return;
      var w = function () {
        var r = o.apply(this, arguments);
        var ib = document.querySelector('#bpxViewArea .bpx-inbox');
        if (ib && M.on()) {
          if (!ib.querySelector(':scope > .bp-tback')) { var bk = document.createElement('button'); bk.type = 'button'; bk.className = 'bp-tback'; bk.innerHTML = '<span class="ms">arrow_back</span>All conversations'; bk.onclick = M.inboxBack; ib.insertBefore(bk, ib.firstChild); }
          ib.classList.add('bp-thread-open');
          var m = document.querySelector('#bpx .bpx-main'); if (m) m.scrollTop = 0;
        }
        return r;
      };
      w._m = 1; window[n] = w;
    });
  }
  /* Settings on a phone: a list of every section first; tapping one opens
     it full screen with "All settings" to go back (computers keep the rail) */
  function settingsHook() {
    var st = document.querySelector('#bpxViewArea .st');
    if (st && !st._m) {
      st._m = 1;
      if (M.on()) st.classList.add('st-menu');
      var body = st.querySelector('.st-body');
      if (body && !body.querySelector('.st-back')) {
        var bk = document.createElement('button'); bk.type = 'button'; bk.className = 'st-back';
        bk.innerHTML = '<span class="ms">arrow_back</span>All settings';
        bk.onclick = function () { st.classList.add('st-menu'); var m = document.querySelector('#bpx .bpx-main'); if (m) m.scrollTop = 0; };
        body.insertBefore(bk, body.firstChild);
      }
    }
    var o = window.bpSetTab; if (typeof o !== 'function' || o._m) return;
    var w = function () {
      var r = o.apply(this, arguments);
      var s = document.querySelector('#bpxViewArea .st');
      if (s && s._m && w._user) { s.classList.remove('st-menu'); var m = document.querySelector('#bpx .bpx-main'); if (m) m.scrollTop = 0; }
      return r;
    };
    w._m = 1; window.bpSetTab = w;
    /* only a tap opens a section; the page's own first call leaves the list showing */
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-set-tab]')) { w._user = 1; setTimeout(function () { w._user = 0; }, 0); } }, true);
  }
  M.inboxBack = function () { var ib = document.querySelector('#bpxViewArea .bpx-inbox'); if (ib) ib.classList.remove('bp-thread-open'); };
  function tidy() { clearTimeout(tidyT); tidyT = setTimeout(function () { labelTables(); tabsFade(); emptyStats(); inboxHook(); settingsHook(); }, 80); }
  function watch() {
    var a = $('bpxViewArea'); if (!a || a._bpmw || !window.MutationObserver) return;
    a._bpmw = 1; new MutationObserver(function () { if (M.on()) tidy(); }).observe(a, { childList: true, subtree: true });
  }

  /* ----------------------------------------------------------- hooks --- */
  function apply() {
    var x = $('bpx'); if (!x) return;
    x.classList.toggle('bp-m', M.on());
    if (!M.on()) { M.appsClose(); x.classList.remove('bp-m-home'); }
    paintTabs(); paintTop(); watch(); tidy();
  }
  function hook() {
    var sh = window.bpShell; if (!sh || sh._mob) return !!(sh && sh._mob);
    sh._mob = true;
    var sync = sh.sync;
    sh.sync = function (v, quiet) { var r = sync.apply(this, arguments); if (!quiet) M.appsClose(); paintTabs(v); paintTop(v); watch(); tidy(); return r; };
    var build = sh.buildNav;
    sh.buildNav = function () { var r = build.apply(this, arguments); apply(); return r; };
    var dash = window.bpDashboard;
    if (dash) window.bpDashboard = function () {
      var r = dash.apply(this, arguments);
      if (M.on() && role() === 'owner') home();
      return r;
    };
    return true;
  }
  if (!hook()) { var tries = 0, t = setInterval(function () { if (hook() || ++tries > 40) clearInterval(t); }, 250); }
  var was = M.on();
  var onChange = function () {
    apply();
    if (M.on() !== was) { was = M.on(); if (window._bpCurView === 'dashboard' && window.bpDashboard) bpDashboard(); }
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
