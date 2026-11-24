/* ==================================================================
   Phones: the app the way a phone app works (pairs with mobile.css).

   Only below 760px wide. Computers and tablets keep the sidebar layout.

     Bottom tab bar   the four places each role goes most, plus Apps/More
                      owner/office: Home, Leads, New, Jobs, Inbox
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
  /* Home has two looks on a phone: 'list' (every section as a list on Home) or 'sidebar'
     (a menu button opens the same sidebar as the computer). Kept on this phone. */
  function look() { try { return localStorage.getItem('bpHomeLook') === 'list' ? 'list' : 'sidebar'; } catch (e) { return 'sidebar'; } }   /* sidebar is the default since 2026-11-22 */
  M.setLook = function (v) { try { localStorage.setItem('bpHomeLook', v); } catch (e) {} var x = $('bpx'); if (x) x.classList.toggle('bp-look-sb', v === 'sidebar'); lookPick(); if (window._bpCurView === 'dashboard' && window.bpDashboard) bpDashboard(); };
  function ownerFirst() { var o = sets().owner || {}; return String(o.first || o.name || '').trim().split(/\s+/)[0] || ''; }
  function initials(s) { var p = String(s || '').replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function money(n) { n = Math.round(+n || 0); return (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString(); }
  function iso(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ------------------------------------------------------------ tabs --- */
  var TABS = {
    /* owner: the big + in the middle makes anything new; everything else is under the avatar (top right) */
    /* Leads is a tab because new customers are the money; Calendar is one tap from Home (Today card, Apps) */
    owner: [['home', 'Home', 'home', 'dashboard'], ['leads', 'Leads', 'leads', 'contacts'], ['create', 'New', 'plus', null], ['projects', 'Jobs', 'projects', 'activejobs'], ['inbox', 'Inbox', 'convos', 'messaging']],
    crew: [['home', 'Today', 'home', 'crewdash'], ['projects', 'Jobs', 'projects', 'crewprojects'], ['msgs', 'Messages', 'convos', 'crewmsgs'], ['apps', 'Me', 'user', null]],
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
      if (g === 'leads' || v === 'closedeals') return 'leads';
      return '';
    }
    if (r === 'crew' && v === 'crewclock') return 'home';   /* the time clock belongs to the Today tab */
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
    if (window.bpSlideTabs) { bpSlideTabs(); setTimeout(bpSlideTabs, 420); }   /* again once the label has opened */
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
    /* 2026-11-21: the BuilderPro logo in the corner (the business name and its logo looked odd up here) */
    /* 2026-11-24: the logo on its own, no name next to it */
    chip.innerHTML = '<span class="bp-mlogo"><img src="assets/brand/logo-mark-64.png" alt="BuilderPro" width="34" height="34"></span>';
    chip.setAttribute('aria-label', 'BuilderPro: account menu');
    var xx = $('bpx'); if (xx) xx.classList.toggle('bp-look-sb', look() === 'sidebar');
    var x = $('bpx'); if (x) x.classList.toggle('bp-m-home', homeView(v || window._bpCurView));
    /* the bottom tab says Jobs, so the page does too */
    /* (only the heading's text: replacing the whole box removed the h1 the shell retitles on every page) */
    var tt = top.querySelector('.hl-ttl h1') || top.querySelector('.hl-ttl'); if (tt && M.on() && role() === 'owner' && (v || window._bpCurView) === 'activejobs' && /^Projects$/.test(tt.textContent.trim())) tt.textContent = 'Jobs';
    /* the crew's first tab is Today, so its page says Today too */
    if (tt && M.on() && role() === 'crew' && (v || window._bpCurView) === 'crewdash' && /^Home$/.test(tt.textContent.trim())) tt.textContent = 'Today';
    /* the bottom tab says Inbox, and "Conversations" does not fit next to the header buttons */
    if (tt && M.on() && /^Conversations$/.test(tt.textContent.trim())) tt.textContent = 'Inbox';
    /* the Jobs page had two "Active"s (the page tab and the Active / Completed switch): the tab says Jobs */
    var at = document.querySelector('#hlTabs .hl-tab[onclick*="\'activejobs\'"]');
    if (at && M.on() && role() === 'owner' && at.textContent.trim() === 'Active') at.textContent = 'Jobs';
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
        grid += tile(g.ico || g.id, g.id === 'projects' ? 'Jobs' : g.l, "bpMobile.go('" + g.id + "')", { lock: lk });
      });
      if (allows('settings')) grid += tile('settings', 'Settings', "bpMobile.nav('settings')");
      more = '<button type="button" class="bp-sheet-row" onclick="bpMobile.appsClose();bpShell.ai()">' + ico('spark') + '<span>Ask ' + esc(window.BP_AI_NAME || 'Lisa') + ', your assistant</span></button>'
        + '<button type="button" class="bp-sheet-row" onclick="bpMobile.appsClose();bpShell.palette()">' + ico('search') + '<span>Search everything</span></button>';
    } else if (r === 'crew') {
      grid = tile('crew', 'My crew', "bpMobile.nav('crewhome')") + tile('badge', 'My ID', "bpMobile.nav('crewid')") + tile('clock', 'Time clock', "bpMobile.nav('crewclock')") + tile('projects', 'Jobs', "bpMobile.nav('crewprojects')") + tile('tool', 'Equipment', "bpMobile.nav('assets')");
    } else {
      grid = tile('badge', 'Compliance', "bpMobile.nav('subcomply')") + tile('crew', 'My company', "bpMobile.nav('subcompany')") + tile('page', 'Change orders', "bpMobile.nav('subchanges')") + tile('inv', 'Invoices', "bpMobile.nav('subinvoices')");
    }
    var dark = !!($('bpx') && $('bpx').classList.contains('bpx-dark'));
    var el = document.createElement('div'); el.id = 'bpApps'; el.className = 'bp-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', r === 'owner' ? 'Apps' : 'More');
    el.innerHTML = '<div class="bp-sheet-bg" onclick="bpMobile.appsClose()"></div><div class="bp-sheet-card"><i class="bp-sheet-grab"></i>'
      + '<div class="bp-sheet-h"><b>' + (r === 'owner' ? 'Apps' : r === 'crew' ? 'Me' : 'More') + '</b><button type="button" class="bp-sheet-x" onclick="bpMobile.appsClose()" aria-label="Close">×</button></div>'
      + '<div class="bp-apps">' + grid + '</div>'
      + '<div class="bp-sheet-rows">' + more
        + (window.bpTour ? '<button type="button" class="bp-sheet-row" onclick="bpMobile.appsClose();bpTour()">' + ico('help') + '<span>Take the tour</span></button>' : '')
        + '<button type="button" class="bp-sheet-row" onclick="bpMobile.dark(this)">' + ico('moon') + '<span>Dark mode</span><span class="hl-sw' + (dark ? ' on' : '') + '" aria-hidden="true"><i></i></span></button>'
        + '<button type="button" class="bp-sheet-row" onclick="bpMobile.appsClose();bpShell.leave()">' + ico('globe') + '<span>Back to website</span></button>'
        + '<button type="button" class="bp-sheet-row danger" onclick="bpMobile.appsClose();bpLogout()">' + ico('out') + '<span>Sign out</span></button></div></div>';
    ($('bpx') || document.body).appendChild(el);
    paintTabs();
  };
  /* Jobs on a phone: one clean card per job — who, what, a status pill,
     a progress bar, what's next and what's left to collect */
  function jobCard(j) {
    var pr = window.bpPlan && bpPlan.progress ? bpPlan.progress(j) : null;
    var e = +j.estimate || 0, c = +j.collected || 0, owe = Math.max(e - c, 0);
    var today = iso(), onSite = j.sched && (j.sched.dates || []).indexOf(today) >= 0;
    var pill = !pr ? ['Not planned', 'gray'] : pr.late.length ? ['Behind', 'red'] : pr.complete ? ['Ready to close', 'green'] : onSite ? ['Crew there today', 'green'] : [pr.pct + '% built', 'blue'];
    var pct = pr ? pr.pct : (e ? Math.round(c / e * 100) : 0);
    var addr = String(j.addr || '').split(',')[0];
    /* 2026-11-20: compact, so more jobs fit on the screen: name and what's left on one line,
       the job and street under it, a thin bar. A status only when it says something. */
    var tag = !pr ? '' : '<span class="mj-pill ' + pill[1] + '">' + pill[0] + '</span>';
    return '<button type="button" class="mj mj2" onclick="bpProjOpen(\'' + esc(j.id) + '\')">'
      + '<span class="mj-r1"><b>' + esc(j.name || 'Job') + '</b><span class="mj-amt">' + (owe ? money(owe) + '<small> left</small>' : '<small>Paid in full</small>') + '</span></span>'
      + '<span class="mj-r2"><small>' + esc(j.title || 'Job') + (addr ? ' · ' + esc(addr) : '') + '</small>' + tag + '</span>'
      + '<span class="mj-bar"><i style="width:' + Math.max(pct, 3) + '%"></i></span></button>';
  }
  function jobsHook() {
    var o = window.bpPjRow; if (typeof o !== 'function' || o._m) return;
    var w = function (j) { return M.on() ? jobCard(j) : o.apply(this, arguments); };
    w._m = 1; window.bpPjRow = w;
    if (M.on() && window.bpPjGrid && document.getElementById('pjkGrid')) bpPjGrid();
  }

  /* the + sheet: every "new" thing in one place */
  M.create = function () {
    M.createClose(); M.appsClose();
    var big = [['estimates', "bpMobile.quick('estimates','bpEstOpen')", 'request_quote', 'Estimate', 1], ['invoices', "bpMobile.quick('invoices','bpInvOpen')", 'receipt_long', 'Invoice'],
      ['activejobs', "bpMobile.quick('activejobs','bpAddJobOpen')", 'add_business', 'Job'], ['contacts', "bpMobile.quick('contacts','bpOpenAdd')", 'person_add', 'Customer']].filter(function (q) { return allows(q[0]); });
    var small = [['calendar', "window._bpApptCal='inspection';bpMobile.quick('calendar','bpOpenBook')", 'roofing', 'Book an inspection'], ['receipts', "bpMobile.createClose();bpNav('receipts');setTimeout(function(){if(window.SP&&SP.rcOpen)SP.rcOpen()},250)", 'photo_camera', 'Snap a receipt'],
      ['calendar', "bpMobile.quick('calendar','bpNoteOpen')", 'sticky_note_2', 'Note or to-do']].filter(function (q) { return allows(q[0]); });
    var here = pageAddNow(), cur = window._bpCurView, same = big.filter(function (q) { return q[0] === cur; })[0];
    if (same) { here = null; big.forEach(function (q) { q[4] = q === same ? 1 : 0; }); big.splice(big.indexOf(same), 1); big.unshift(same); }   /* this page's tile leads */
    else if (here) big.forEach(function (q) { q[4] = 0; });   /* this page's own action leads instead */
    var el = document.createElement('div'); el.id = 'bpCreate'; el.className = 'bp-create';
    el.innerHTML = '<div class="bp-create-bg" onclick="bpMobile.createClose()"></div><div class="bp-create-sh" role="dialog" aria-label="Create something new"><i class="bp-create-grab"></i>'
      + '<div class="bp-create-h"><b>What do you need?</b><button type="button" class="bp-create-x" aria-label="Close" onclick="bpMobile.createClose()"><span class="ms">close</span></button></div>'
      /* not on this plan: still shown (it leads to what the upgrade adds), with a lock */
      + (here ? '<button type="button" class="bp-create-here" onclick="bpMobile.pageAdd()"><span class="ms">add</span><b>' + esc(here.label) + '</b><span class="ms bp-create-go">chevron_right</span></button>' : '')
      + '<div class="bp-create-big">' + big.map(function (q) { return '<button type="button" class="' + (q[4] ? 'pri' : '') + '" onclick="bpMobile.createClose();' + q[1] + '"><span class="ms">' + q[2] + '</span><b>' + q[3] + '</b>' + (locked(q[0]) ? '<span class="ms bp-lk" aria-label="Not on your plan">lock</span>' : '') + '</button>'; }).join('') + '</div>'
      + '<div class="bp-create-list">' + small.map(function (q) { return '<button type="button" onclick="bpMobile.createClose();' + q[1] + '"><span class="ms">' + q[2] + '</span>' + q[3] + (locked(q[0]) ? '<span class="ms bp-lk" aria-label="Not on your plan">lock</span>' : '') + '</button>'; }).join('') + '</div></div>';
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
  M.book = function () { bpNav('calendar'); setTimeout(function () { var d = document.querySelector('#bpxViewArea .cal-add'); if (d) d.open = true; }, 500); };
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
    var tileB = function (fnq, ic, label, pri) { var lk = /quick\('(\w+)'/.exec(fnq); return '<button type="button" class="mh2-tile' + (pri ? ' pri' : '') + '" onclick="' + fnq + '"><span class="ms">' + ic + '</span><b>' + label + '</b>' + (lk && locked(lk[1]) ? '<span class="ms bp-lk" aria-label="Not on your plan">lock</span>' : '') + '</button>'; };
    var row = function (go, dot, t, sub) { return '<button type="button" class="mh2-row" onclick="bpNav(\'' + esc(go) + '\')"><i class="mh2-dot ' + dot + '"></i><span class="mh2-rt"><b>' + t + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="ms">chevron_right</span></button>'; };
    setTimeout(function () { if (window.bpCountUp) bpCountUp(el); }, 0);
    /* 2026-11-20: simpler. A small greeting, one money card, three quick buttons in a row, one
       "Today" card (what needs you, then what's booked), a one-line setup bar, the apps. */
    var qb = function (go, fn, ic, label) { if (!allows(go)) return ''; return '<button type="button" class="mh3-q" onclick="bpMobile.quick(\'' + go + '\',\'' + fn + '\')"><span class="ms">' + ic + '</span><span>' + label + '</span>' + (locked(go) ? '<span class="ms bp-lk" aria-label="Not on your plan">lock</span>' : '') + '</button>'; };
    var todayList = needs.slice(0, 3).map(function (r) { return row(r.go, r.tone || '', r.t, ''); }).join('')
      + todayRows.map(function (r) { return '<button type="button" class="mh2-today" onclick="bpNav(\'' + r.go + '\')"><span class="mh2-tt">' + (r.t || '') + '</span><span class="mh2-rt"><b>' + r.w + '</b><small>' + r.s + '</small></span></button>'; }).join('');
    /* 2026-11-22: the phone dashboard is short lists you act on, no money stats:
       what needs you, today, jobs in progress, new leads to call, estimates waiting on a yes */
    var card = function (title, go, more, body, extra) { return '<section class="mh5-card"><div class="mh5-h"><b>' + title + '</b>' + (extra || '') + (go ? '<button type="button" class="mh5-all" onclick="bpNav(\'' + go + '\')">' + (more || 'See all') + '</button>' : '') + '</div>' + body + '</section>'; };
    var needCard = needs.length ? card('Needs you', '', '', needs.slice(0, 3).map(function (r) { return row(r.go, r.tone || '', r.t, ''); }).join('')
      + (needs.length > 3 ? '<button type="button" class="mh5-more" onclick="bpShell.notes&&bpShell.notes(document.getElementById(\'hlBell\'))">See all ' + needs.length + '</button>' : ''), '<span class="mh5-n">' + needs.length + '</span>') : '';
    var todayCard = card('Today', allows('calendar') ? 'calendar' : '', 'Calendar', todayRows.length
      ? todayRows.map(function (r) { return '<button type="button" class="mh5-row" onclick="bpNav(\'' + r.go + '\')"><span class="mh5-time">' + (r.t || '') + '</span><span class="mh5-t"><b>' + r.w + '</b><small>' + r.s + '</small></span><span class="ms mh5-go">chevron_right</span></button>'; }).join('')
      : '<div class="mh5-empty">' + (d.appts === undefined ? 'Loading today…' : 'Nothing booked today.') + (allows('calendar') ? ' <button type="button" class="mh5-link" onclick="bpMobile.book()">Book a visit</button>' : '') + '</div>');
    var jobRows = act.slice().sort(function (a, b) { return (Math.max((+b.estimate || 0) - (+b.collected || 0), 0)) - (Math.max((+a.estimate || 0) - (+a.collected || 0), 0)); }).slice(0, 8).map(function (j) {
      var est = +j.estimate || 0, got1 = +j.collected || 0, pc = est ? Math.min(100, Math.round(got1 / est * 100)) : 0, left = Math.max(est - got1, 0);
      /* how far the work is: phases ticked off when the job has a plan, else how much is paid */
      var ph = j.plan && j.plan.phases && j.plan.phases.length ? j.plan.phases : null, dn = ph ? ph.filter(function (x) { return x.doneAt; }).length : 0;
      var wk = ph ? Math.round(dn / ph.length * 100) : pc, nxt = ph ? ph.filter(function (x) { return !x.doneAt; })[0] : null;
      var C = 2 * Math.PI * 16, rg = '<span class="mh5-ring' + (wk >= 100 ? ' full' : '') + '"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" class="t"/><circle cx="20" cy="20" r="16" class="a" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - wk / 100)).toFixed(1) + '"/></svg><b>' + (wk >= 100 ? '<span class="ms">check</span>' : wk + '%') + '</b></span>';
      var sub = ph ? (nxt ? 'Next: ' + esc(nxt.name) + ' · ' + dn + ' of ' + ph.length + ' phases' : 'All ' + ph.length + ' phases done') : esc(j.title || '') + (est ? ' · ' + pc + '% paid' : '');
      /* 2026-11-23: a card you swipe through, like an app */
      return '<button type="button" class="mh5-jc" onclick="bpProjOpen&&bpProjOpen(\'' + esc(j.id) + '\')"><span class="mh5-jtop">' + rg
        + '<span class="mh5-amt">' + (left ? money(left) + '<small>left</small>' : '<small>paid</small>') + '</span></span>'
        + '<span class="mh5-jn">' + esc(j.name || 'Project') + '</span><span class="mh5-js"><span>' + esc(j.title || 'Job') + '</span><span>'
        + (ph ? (nxt ? 'Next: ' + esc(nxt.name) + ' · ' + dn + ' of ' + ph.length : 'All ' + ph.length + ' phases done') : (est ? pc + '% paid' : '')) + '</span></span></button>';
    }).join('');
    var addJob = '<button type="button" class="mh5-jc mh5-jadd" onclick="bpMobile.quick(\'activejobs\',\'bpAddJobOpen\')"><span class="ms">add_circle</span>New job</button>';
    var jobsCard = !allows('activejobs') ? '' : jobRows
      ? '<section class="mh5-sec"><div class="mh5-h"><b>Jobs in progress</b><span class="mh5-n">' + act.length + '</span><button type="button" class="mh5-all" onclick="bpNav(\'activejobs\')">All jobs</button></div><div class="mh5-car">' + jobRows + addJob + '</div></section>'
      : card('Jobs in progress', 'activejobs', 'All jobs', '<div class="mh5-empty">No active jobs. <button type="button" class="mh5-link" onclick="bpMobile.quick(\'activejobs\',\'bpAddJobOpen\')">Add a job</button></div>');
    var leadHost = allows('contacts') ? '<div id="mh5Leads">' + leadCards() + '</div>' : '';
    el.innerHTML = '<div class="mh2 mh3 mh5">'
      + '<section class="mh3-hi"><h2>' + (hiH < 12 ? 'Good morning' : hiH < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + esc(name) : '') + '</h2>'
        + '<small>' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + '</small></section>'
      + '<section class="mh3-qs">' + qb('estimates', 'bpEstOpen', 'request_quote', 'Estimate') + qb('activejobs', 'bpAddJobOpen', 'add_business', 'Job') + qb('invoices', 'bpInvOpen', 'receipt_long', 'Invoice') + '</section>'
      + setupCard()
      + needCard + todayCard + jobsCard + leadHost
      + (look() === 'sidebar' ? '' : sectionsCard())
      + '</div>';
    if (allows('contacts') && !(window._bpContacts && _bpContacts.length) && window.bpEnsureContacts) {
      bpEnsureContacts().then(function () { var h = $('mh5Leads'); if (h && window._bpCurView === 'dashboard') h.innerHTML = leadCards(); });
    }
  }
  /* new leads to call, and estimates out waiting on a yes (from the contacts already loaded for Leads) */
  function leadCards() {
    var all = (window._bpContacts || []).filter(function (c) { return c && c.name; }), grp = window.bpCtGroup || function () { return ''; };
    if (!all.length) return '';
    var by = function (g) { return all.filter(function (c) { try { return grp(c) === g; } catch (e) { return false; } }).sort(function (a, b) { return String(b.dateAdded || '').localeCompare(String(a.dateAdded || '')); }); };
    var fresh = by('new'), out = by('quoted');
    var when = function (c) { var t = Date.parse(c.dateAdded || ''); if (!isFinite(t)) return ''; var dd = Math.round((Date.now() - t) / 864e5); return dd <= 0 ? 'today' : dd === 1 ? 'yesterday' : dd < 7 ? dd + ' days ago' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
    var row = function (c, sub) {
      var tel = String(c.phone || '').replace(/[^\d+]/g, '');
      return '<div class="mh5-row mh5-lead"><button type="button" class="mh5-t" onclick="bpContactPage&&bpContactPage(\'' + esc(c.id) + '\')"><b>' + esc(c.name) + '</b><small>' + sub(c) + '</small></button>'
        + (tel ? '<a class="mh5-cb" href="tel:' + esc(tel) + '" aria-label="Call ' + esc(c.name) + '"><span class="ms">call</span></a><a class="mh5-cb" href="sms:' + esc(tel) + '" aria-label="Text ' + esc(c.name) + '"><span class="ms">sms</span></a>' : '') + '</div>';
    };
    var c1 = fresh.length ? '<section class="mh5-card"><div class="mh5-h"><b>New leads to call</b><span class="mh5-n">' + fresh.length + '</span><button type="button" class="mh5-all" onclick="window._bpCtStage=\'new\';bpNav(\'contacts\')">See all</button></div>'
      + fresh.slice(0, 3).map(function (c) { return row(c, function (x) { var w = when(x); return 'New lead' + (w ? ' · came in ' + w : ''); }); }).join('') + '</section>' : '';
    var c2 = out.length ? '<section class="mh5-card"><div class="mh5-h"><b>Waiting on a yes</b><span class="mh5-n">' + out.length + '</span><button type="button" class="mh5-all" onclick="window._bpCtStage=\'quoted\';bpNav(\'contacts\')">See all</button></div>'
      + out.slice(0, 3).map(function (c) { return row(c, function (x) { var st = ''; try { st = window.bpStageOf ? bpStageOf(x)[0] : ''; } catch (e) {} return esc(st || 'Estimate sent') + ' · follow up'; }); }).join('') + '</section>' : '';
    return c1 + c2;
  }
  /* Look A: every section of the software as one list, the same order as the sidebar */
  function sectionsCard() {
    var rows = '';
    (window.BP_NAV || []).forEach(function (g) {
      var ks = g.kids ? g.kids.filter(function (k) { return allows(k[0]); }) : null;
      if (g.id === 'dashboard' || (ks ? !ks.length : !allows(g.id))) return;
      var lk = ks ? ks.every(function (k) { return locked(k[0]); }) : locked(g.id);
      var sub = ks ? ks.map(function (k) { return k[1]; }).join(' · ') : '';
      rows += '<button type="button" class="mh4-row" onclick="bpMobile.go(\'' + g.id + '\')"><span class="mh4-ic">' + ico(g.ico || g.id) + '</span>'
        + '<span class="mh4-t"><b>' + esc(g.id === 'projects' ? 'Jobs' : g.l) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>'
        + (lk ? '<span class="ms bp-lk" aria-label="Not on your plan">lock</span>' : '') + '<span class="ms mh4-go">chevron_right</span></button>';
    });
    if (allows('settings')) rows += '<button type="button" class="mh4-row" onclick="bpMobile.nav(\'settings\')"><span class="mh4-ic">' + ico('settings') + '</span><span class="mh4-t"><b>Settings</b></span><span class="ms mh4-go">chevron_right</span></button>';
    return rows ? '<section class="mh4-secs"><div class="mh4-h">Sections</div><div class="mh4-list">' + rows + '</div></section>' : '';
  }
  /* the switch between the two looks, at the bottom of Home */
  /* the switch lives in Settings > Appearance (it was on Home, which is for work) */
  function lookPick() {
    if (!M.on()) return;
    var sec = document.getElementById('set-sec-appearance'); if (!sec) return;
    var old = sec.querySelector('.mh4-look'); var html = lookSwitch();
    if (old) { old.outerHTML = html; return; }
    var div = document.createElement('div'); div.innerHTML = html; sec.appendChild(div.firstChild);
  }
  function lookSwitch() {
    var l = look();
    return '<section class="mh4-look"><div class="mh4-h">Phone menu</div><div class="mh4-seg" role="tablist">'
      + '<button type="button" role="tab" aria-selected="' + (l === 'list') + '" class="' + (l === 'list' ? 'on' : '') + '" onclick="bpMobile.setLook(\'list\')">List on Home</button>'
      + '<button type="button" role="tab" aria-selected="' + (l === 'sidebar') + '" class="' + (l === 'sidebar' ? 'on' : '') + '" onclick="bpMobile.setLook(\'sidebar\')">Sidebar</button></div>'
      + '<small>' + (l === 'sidebar' ? 'The menu button at the top left opens every section.' : 'Every section is listed at the bottom of Home.') + '</small></section>';
  }
  /* the first week decides whether a new account sticks: the same setup steps as the computer
     dashboard (portal/dash.js), so a phone-only owner sees what is left and can tap straight to it */
  var setupOpen = false;
  M.setupToggle = function () { setupOpen = !setupOpen; if (window.bpDashboard) bpDashboard(); };
  function setupCard() {
    if ((window.bpTeamIsCrew && bpTeamIsCrew()) || (window.bpTeamIsSub && bpTeamIsSub()) || !window.BPDASH || !BPDASH.steps) return '';
    var list = []; try { list = BPDASH.steps(); } catch (e) { return ''; }
    if (!list.length) return '';
    var done = list.filter(function (x) { return x.done; }).length, pct = Math.round(done / list.length * 100);
    if (pct === 100) return '';
    try { if (localStorage.getItem('bpSetupHidden') === '1') return ''; } catch (e) {}
    var next = list.filter(function (x) { return x.done === false; })[0];
    var step = function (x) { return '<button type="button" class="mh2-row" onclick="bpNav(\'' + esc(x.go) + '\')"><span class="ms mh2-sk' + (x.done ? ' ok' : '') + '">' + (x.done ? 'check_circle' : 'radio_button_unchecked') + '</span><span class="mh2-rt"><b>' + esc(x.t) + '</b>' + (x.done ? '' : '<small>' + esc(x.s) + '</small>') + '</span></button>'; };
    if (!setupOpen) return '<button type="button" class="mh3-setup" onclick="bpMobile.setupToggle()"><span class="mh3-sb"><i style="width:' + pct + '%"></i></span><span><b>Setup ' + done + ' of ' + list.length + '</b>' + (next ? ' · next: ' + esc(next.t) : '') + '</span><span class="ms">chevron_right</span></button>';
    return '<section class="mh2-card mh2-setup"><div class="mh2-h"><b>Finish setting up</b><span class="mh2-n">' + done + ' of ' + list.length + '</span></div>'
      + '<div class="mh2-bar"><i style="width:' + pct + '%"></i></div>'
      + (setupOpen ? list.map(step).join('') : (next ? step(next) : ''))
      + '<button type="button" class="mh2-more" onclick="bpMobile.setupToggle()">' + (setupOpen ? 'Show less' : 'All ' + list.length + ' steps') + '</button></section>';
  }
  /* every section of the software, one tap from Home */
  function appsCard() {
    var grid = '';
    (window.BP_NAV || []).forEach(function (g) {
      var ks = g.kids ? g.kids.filter(function (k) { return allows(k[0]); }) : null;
      if (g.id === 'dashboard' || (ks ? !ks.length : !allows(g.id))) return;
      var lk = ks ? ks.every(function (k) { return locked(k[0]); }) : locked(g.id);
      grid += tile(g.ico || g.id, g.id === 'projects' ? 'Jobs' : g.l, "bpMobile.go('" + g.id + "')", { lock: lk });
    });
    if (allows('settings')) grid += tile('settings', 'Settings', "bpMobile.nav('settings')");
    return grid ? '<section class="mh2-card mh2-apps"><div class="mh2-h"><b>All apps</b></div><div class="bp-apps">' + grid + '</div></section>' : '';
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
    /* the shadow alone was easy to miss: an arrow sits at the right edge while more tabs are hidden, and a tap slides them in */
    var mb = t.querySelector('.bp-tabmore');
    if (!mb) { mb = document.createElement('button'); mb.type = 'button'; mb.className = 'bp-tabmore'; mb.setAttribute('aria-label', 'More tabs'); mb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
      mb.onclick = function (e) { e.stopPropagation(); t.scrollBy({ left: Math.max(120, t.clientWidth * 0.6), behavior: 'smooth' }); }; t.appendChild(mb); }
    var upd = function () { var more = t.scrollWidth - t.clientWidth - t.scrollLeft > 6; t.classList.toggle('bp-more', more); t.classList.toggle('bp-less', t.scrollLeft > 6); mb.hidden = !more || !M.on(); };
    if (!t._bpf) { t._bpf = 1; t.addEventListener('scroll', upd, { passive: true }); }
    var on = t.querySelector('.hl-tab.on');
    if (on && M.on()) { var l = on.offsetLeft - 48, r = on.offsetLeft + on.offsetWidth - t.clientWidth + 48;   /* clear of the soft edges */ if (t.scrollLeft > l) t.scrollLeft = l; else if (t.scrollLeft < r) t.scrollLeft = r; }
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
        bk.innerHTML = '<span class="ms">chevron_left</span>Settings';
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
  /* long explanations (4+ lines) read like a website on a phone: show two
     lines and a "more" under them to open the rest. Only plain paragraphs in
     the page (text and inline words, no boxes, nothing centred); never lists,
     messages, forms, tables, notices or warnings about money. */
  var CLAMP_SKIP = 'input,textarea,select,table,button,a,label,summary,.bpx-msg,.bpx-cm,.fl-row,.wa-dh,.pjs,.bpx-modal,.tc-msg,.bpx-bubble,.bg-warn,.ctp3,.st-plan-card,[contenteditable],[class*=empty],[class*=note],[class*=warn],[class*=band]';
  var INLINE = /^(B|I|EM|STRONG|SPAN|A|SMALL|CODE)$/;
  function clampLong() {
    if (!M.on()) return;
    var v = document.getElementById('bpxViewArea'); if (!v) return;
    Array.prototype.forEach.call(v.querySelectorAll('p,span,div'), function (e) {
      if (e._bpc || e.closest(CLAMP_SKIP)) return;
      var own = Array.prototype.some.call(e.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim().length > 40; });
      if (!own || (e.textContent || '').length < 160) return;
      if (Array.prototype.some.call(e.children, function (c) { return !INLINE.test(c.tagName) || c.querySelector('button,input,select,img,svg,br'); })) return;
      var r = e.getBoundingClientRect(); if (!r.height) return;
      var cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
      if (cs.textAlign === 'center' || parseFloat(cs.fontSize) > 17) return;
      if (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) > 2 || parseFloat(cs.borderTopWidth) > 0 || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) return;
      if (r.height / lh < 3.6) return;
      e._bpc = 1; e.classList.add('bp-clamp');
      var more = document.createElement('button'); more.type = 'button'; more.className = 'bp-more'; more.textContent = 'More';
      more.onclick = function (ev) { ev.stopPropagation(); var open = e.classList.toggle('bp-open'); more.textContent = open ? 'Less' : 'More'; };
      e.parentNode.insertBefore(more, e.nextSibling);
    });
  }
  /* bars that stick to the bottom of a page go above the tab bar */
  function stickBottom() {
    if (!M.on()) return;
    var v = document.getElementById('bpxViewArea'); if (!v) return;
    Array.prototype.forEach.call(v.querySelectorAll('[class*=foot],[class*=bar],[class*=save]'), function (e) {
      if (e._bpsb) return; var cs = getComputedStyle(e);
      if (cs.position === 'sticky' && cs.bottom !== 'auto') { e._bpsb = 1; e.classList.add('bp-stickbot'); }
    });
  }
  function tidy() { clearTimeout(tidyT); tidyT = setTimeout(function () { labelTables(); tabsFade(); emptyStats(); inboxHook(); settingsHook(); jobsHook(); clampLong(); stickBottom(); lookPick(); iconAdds(); backHook(); pageAdds(); }, 80); }
  /* a page you opened from a list (a contact, a machine, an estimate, an invoice) gets a back arrow
     in the top bar, like an app, in place of the menu; the "← All contacts" link in the page goes */
  /* One + for adding, like an app: on the phone a page's own "+ Add job" / "+ New contact" button
     is hidden, and the blue + in the tab bar offers that page's action first. Buttons inside
     empty states, pop-ups and open records stay where they are. */
  var PAGEADD = '.bpx-addbtn,.fin-new-est,.tc-btn,.rcp-up';
  function addLabel(b) {
    var c = b.cloneNode(true); Array.prototype.forEach.call(c.querySelectorAll('.ms,svg'), function (x) { x.remove(); });
    return (c.textContent || '').replace(/\s+/g, ' ').replace(/^\+\s*/, '').trim();
  }
  function pageAdds() {
    var a = $('bpxViewArea'); if (!a) return;
    Array.prototype.forEach.call(a.querySelectorAll(PAGEADD), function (b) {
      if (b.closest('.bp-emptyx,.eq-empty,.bpx-empty2,.bpx-modal,.pjs-app,.ctp,.bp-create,.mh5,.db4')) return;
      if (!/^(new|add|upload)\b/i.test(addLabel(b))) return;
      b.classList.toggle('bp-mpgadd', M.on());
      /* a row left holding nothing but hidden add buttons goes too */
      var row = b.parentElement;
      if (row && row !== a && !row.matches('.bpx-chead')) row.classList.toggle('bp-mpgrow', M.on() && Array.prototype.every.call(row.children, function (k) { return k.classList.contains('bp-mpgadd') || getComputedStyle(k).display === 'none'; }));
    });
  }
  function pageAddNow() {
    var a = $('bpxViewArea'); if (!a) return null;
    var hit = null;
    Array.prototype.some.call(a.querySelectorAll('.bp-mpgadd'), function (b) {
      if (getComputedStyle(b).display === 'none' && !b.classList.contains('bp-mpgadd')) return false;
      /* only the one that belongs to this tab (Finances keeps all four in one row) */
      var cs = b.className;
      var f = a.getAttribute('data-fin') || '';
      if (/fin-new-inv/.test(cs) && f !== 'invoices') return false;
      if (/fin-new-est/.test(cs) && f !== 'estimates') return false;
      if (/fin-new-incm/.test(cs) && f !== 'income') return false;
      if (/fin-new-exp/.test(cs) && f !== 'expense') return false;
      hit = b; return true;
    });
    return hit ? { el: hit, label: addLabel(hit) } : null;
  }
  M.pageAdd = function () { var h = pageAddNow(); M.createClose(); if (h) h.el.click(); };
  var BACKS = '.ctp-back,.eq-back,.qx-back';
  function backHook() {
    var x = $('bpx'), top = $('hlTop'); if (!x || !top) return;
    var lk = null;
    if (M.on() && role() === 'owner') Array.prototype.some.call(document.querySelectorAll('#bpxViewArea :is(' + BACKS + ')'), function (e) { if (e.closest('.qs-head')) return false; lk = e; return true; });
    x.classList.toggle('bp-m-detail', !!lk);
    var b = $('bpMBack');
    if (!lk) { if (b) b.hidden = true; return; }
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.id = 'bpMBack'; b.className = 'bp-mback';
      b.innerHTML = '<span class="ms">chevron_left</span>';
      var bg = top.querySelector('.hl-burger'); top.insertBefore(b, bg || top.firstChild);
    }
    var name = (lk.textContent || '').replace(/[←\u2190]/g, '').replace(/arrow_back|chevron_left/g, '').trim();
    b.setAttribute('aria-label', 'Back to ' + (name || 'the list'));
    b.hidden = false; b.onclick = function () { lk.click(); };
  }

  /* Calendar's "+ Add" is a round + on the phone (the word goes, the menu stays) */
  function iconAdds() {
    /* Inspections and Jobs tabs: their Book and Closed days / Schedule a crew buttons go into a round + menu */
    document.querySelectorAll('#bpxViewArea .cal-acts').forEach(function (a) {
      if (a._bpk) return;
      var prim = a.querySelector(':scope>button.bpx-btn:not(.ghost)'); if (!prim) return;
      a._bpk = 1;
      var extra = Array.prototype.filter.call(a.querySelectorAll(':scope>button.cal-today'), function (b) { return !/bpCalToday\(/.test(b.getAttribute('onclick') || ''); });
      var item = function (b, ic) {
        var i0 = b.querySelector('.ms'), label = (b.textContent || '').replace(i0 ? i0.textContent : '', '').trim();
        return '<button type="button" onclick="bpCalAddClose();' + String(b.getAttribute('onclick') || '').replace(/"/g, '&quot;') + '"><span class="ms">' + (ic || (i0 && i0.textContent) || 'add') + '</span><span><b>' + esc(label) + '</b></span></button>';
      };
      var html = item(prim, 'event') + extra.map(function (b) { return item(b); }).join('');
      [prim].concat(extra).forEach(function (b) { b.classList.add('bp-mhide'); });
      var d = document.createElement('details'); d.className = 'cal-add bp-kindadd'; d.setAttribute('ontoggle', 'bpCalAddPos(this)');
      d.innerHTML = '<summary class="bpx-btn"><span class="ms">add</span></summary><div class="cal-addm">' + html + '</div>';
      a.appendChild(d);
    });
    document.querySelectorAll('#bpxViewArea .cal-add>summary').forEach(function (sm) {
      if (sm._bpi) return; sm._bpi = 1;
      Array.prototype.slice.call(sm.childNodes).forEach(function (n) { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ''; });
      sm.setAttribute('aria-label', 'Add to the calendar'); sm.classList.add('bp-iconadd');
    });
  }
  function watch() {
    var a = $('bpxViewArea'); if (!a || a._bpmw || !window.MutationObserver) return;
    a._bpmw = 1; new MutationObserver(function () { if (M.on()) tidy(); }).observe(a, { childList: true, subtree: true });
  }

  /* 2026-11-23: a new screen slides in a little, like an app (not when the same page redraws) */
  var lastV = '';
  function enter(v) {
    v = v || window._bpCurView; if (!M.on() || !v || v === lastV) { lastV = v || lastV; return; }
    lastV = v;
    var va = $('bpxViewArea'); if (!va) return;
    va.classList.remove('bp-enter'); void va.offsetWidth; va.classList.add('bp-enter');
    clearTimeout(va._bpE); va._bpE = setTimeout(function () { va.classList.remove('bp-enter'); }, 400);
  }

  /* 2026-11-24: real iPhones. In the app (not the website): full-screen phones so the notch and home-bar
     spacing in the styles applies; the browser bar takes the top bar's color; and while the keyboard is up
     the tab bar steps aside and the box being typed in scrolls into view. */
  function deviceFit() {
    var mv = document.querySelector('meta[name="viewport"]');
    if (mv && M.on() && !/viewport-fit/.test(mv.content)) mv.content = mv.content + ', viewport-fit=cover';
    var dark = !!($('bpx') && $('bpx').classList.contains('bpx-dark'));
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc && M.on()) tc.content = dark ? '#101216' : '#ffffff';
  }
  if (window.visualViewport) {
    var kbT = 0;
    var kb = function () {
      var x = $('bpx'); if (!x) return;
      var open = M.on() && (window.innerHeight - window.visualViewport.height) > 150;
      x.classList.toggle('bp-kb', open);
    };
    window.visualViewport.addEventListener('resize', function () { clearTimeout(kbT); kbT = setTimeout(kb, 60); });
  }
  document.addEventListener('focusin', function (e) {
    var t = e.target; if (!M.on() || !t || !t.matches || !t.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')) return;
    setTimeout(function () { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) {} }, 320);
  });

  /* ----------------------------------------------------------- hooks --- */
  function apply() {
    var x = $('bpx'); if (!x) return;
    x.classList.toggle('bp-m', M.on());
    if (!M.on()) { M.appsClose(); x.classList.remove('bp-m-home'); }
    paintTabs(); paintTop(); watch(); tidy(); deviceFit();
  }
  function hook() {
    var sh = window.bpShell; if (!sh || sh._mob) return !!(sh && sh._mob);
    sh._mob = true;
    var sync = sh.sync;
    sh.sync = function (v, quiet) { var r = sync.apply(this, arguments); if (!quiet) M.appsClose(); paintTabs(v); paintTop(v); watch(); tidy(); deviceFit(); if (!quiet) enter(v); return r; };
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
