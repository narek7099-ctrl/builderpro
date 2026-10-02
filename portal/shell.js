/* ==================================================================
   App shell for the portal (pairs with shell.css)

   The portal is its own app, not an overlay of the website:
     dark flat sidebar   account card, search (Ctrl/Cmd K), quick add,
                         one row per section, Settings pinned at the foot,
                         collapsible to icons, a drawer on phones
     slim top bar        page title, round action buttons, avatar menu
     section tabs        the pages of a section across the top
     command palette     pages, projects, contacts, invoices, estimates
     table toolbar       search, status filter, count, 25-row pages,
                         a row menu for row actions
   index.html calls in through bpShell.enter / buildNav / sync.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  var phone = function () { return (window.innerWidth || 1200) <= 820; };

  /* ---------- icons: 24px line icons, drawn at 16-18px ---------- */
  var P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    convos: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
    leads: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    projects: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    finances: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    supply: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    marketing: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>',
    reputation: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    crew: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    badge: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chev: '<path d="M15 18l-6-6 6-6"/>',
    page: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    inv: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    est: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    exp: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
    key: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    aiteam: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
    collapse: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M16 10l-2 2 2 2"/>'
  };
  function ico(k, cls) { return '<svg class="hl-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[k] || P.page) + '</svg>'; }

  var S = window.bpShell = {};
  S.ico = ico;

  /* ---------- the app's own address: /app ---------- */
  var web = /^https?:$/.test(location.protocol);
  S.appUrl = function (on) {
    if (!web) return;
    try {
      if (on && location.pathname !== '/app') history.replaceState(history.state, '', '/app' + location.search + location.hash);
      else if (!on && location.pathname === '/app') history.replaceState(history.state, '', '/' + location.search + location.hash);
    } catch (e) {}
  };
  S.leave = function () {
    if (document.documentElement.classList.contains('bp-appmode') || location.pathname === '/app') { location.href = web ? '/' : 'index.html'; return; }
    if (window.bpClose) bpClose();
  };

  /* ---------- who and what ---------- */
  function sets() { try { return (window.bpSettingsGet && bpSettingsGet()) || {}; } catch (e) { return {}; } }
  function bizName() { var c = sets().company || {}; return c.name || 'My business'; }
  function initials(s) {
    s = String(s || '').replace(/@.*/, '').replace(/[._-]+/g, ' ').trim();
    var w = s.split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : (w[0] || '')[1] || '')).toUpperCase();
  }
  function ownerName() { var s = sets(), o = s.owner || {}; return o.name || [o.first, o.last].filter(Boolean).join(' ') || ''; }
  function crew() { return !!(window.bpTeamIsCrew && bpTeamIsCrew()); }
  function allows(v) { return !window.bpTeamAllows || bpTeamAllows(v); }
  function planName() { try { return window.bpPlanInfo ? bpPlanInfo().name : ''; } catch (e) { return ''; } }

  function paintAcct() {
    /* the card is BuilderPro's, always: the mark and the name, then whose account it is */
    var b = $('hlBiz'); if (b) b.textContent = 'BuilderPro';
    var p = $('hlPlan'); if (p) p.textContent = bizName() + ' \u00b7 ' + (crew() ? 'Crew' : (planName() || 'OS'));
    var lg = $('hlAcctLogo');
    if (lg && !lg.querySelector('img')) lg.innerHTML = '<img src="assets/brand/logo-mark-128.png" alt="" width="30" height="30">';
    var av = $('hlAv'); if (av) av.textContent = initials(ownerName() || window._bpEmail || bizName());
  }

  /* ---------- sidebar ---------- */
  var CREW = [['crewclock', 'Clock in', 'clock'], ['crewprojects', 'Projects', 'projects'], ['crewhome', 'My crew', 'crew'], ['crewid', 'My ID', 'badge']];
  function kidsOf(g) { return (g.kids || []).filter(function (k) { return allows(k[0]); }); }
  function firstOf(g) {
    var ks = kidsOf(g); if (!ks.length) return g.id;
    var last = LS.get('hlTab:' + g.id);
    return ks.some(function (k) { return k[0] === last; }) ? last : ks[0][0];
  }
  S.go = function (gid) {
    var g = (window.BP_NAV || []).filter(function (x) { return x.id === gid; })[0];
    bpNav(g ? firstOf(g) : gid);
  };
  S.buildNav = function () {
    var nav = $('bpxNav'); if (!nav) return;
    var row = function (attr, label, ic, go, lock) {
      return '<a class="hl-ni" ' + attr + ' href="#" title="' + esc(label) + '" onclick="' + go + ';return false">' + ico(ic) + '<span class="hl-nl">' + esc(label) + '</span>'
        + (lock ? '<svg class="hl-i hl-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' : '') + '</a>';
    };
    var h = '';
    if (crew()) {
      h = CREW.map(function (x) { return row('data-view="' + x[0] + '" data-sec="' + x[0] + '"', x[1], x[2], "bpNav('" + x[0] + "')"); }).join('');
    } else {
      (window.BP_NAV || []).forEach(function (g) {
        if (g.kids) { if (!kidsOf(g).length) return; }
        else if (!allows(g.id)) return;
        var locked = g.kids ? kidsOf(g).every(function (k) { return window.bpLocked && bpLocked(k[0]); }) : (window.bpLocked && bpLocked(g.id));
        if (g.g === 2) h += '<div class="hl-gap" role="separator"></div>';
        h += row('data-sec="' + g.id + '"', g.l, g.ico || g.id, "bpShell.go('" + g.id + "')", locked);
      });
    }
    nav.innerHTML = h;
    var foot = $('hlSideFoot');
    if (foot) foot.innerHTML = (crew() || !allows('settings') ? '' : row('data-sec="settings" data-view="settings"', 'Settings', 'settings', "bpNav('settings')"))
      + '<button type="button" class="hl-ni hl-collapse" onclick="bpShell.collapse()" title="Collapse sidebar" aria-label="Collapse sidebar">' + ico('collapse') + '<span class="hl-nl">Collapse</span></button>';
    var q = document.querySelector('#bpxSide .hl-quick'); if (q) q.hidden = crew();
    paintAcct();
    if (window._bpCurView) S.sync(window._bpCurView, true);
  };

  /* views that are not in the sidebar still belong to a section */
  var EXTRA = { closedeals: 'leads', connections: 'marketing', supply: 'supply', supplyorders: 'supply', prices: 'supply', customize: 'leads' };
  function secOf(v) {
    if (crew()) return v;
    if (v === 'settings') return 'settings';
    if (v === 'customize') return (window._bpCust && _bpCust.kind === 'calendar') ? 'calendar' : 'leads';
    var g = window.bpNavGroupOf ? bpNavGroupOf(v) : null;
    return g || EXTRA[v] || null;
  }
  S.sync = function (v, quiet) {
    var gid = secOf(v);
    document.querySelectorAll('#bpxSide .hl-ni[data-sec]').forEach(function (a) {
      var on = a.getAttribute('data-sec') === gid; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var g = (window.BP_NAV || []).filter(function (x) { return x.id === gid; })[0];
    var title = (g && g.kids) ? g.l : ((window.BPVIEWS && BPVIEWS[v] && BPVIEWS[v].t) || 'BuilderPro');
    var t = $('bpxVtitle'); if (t) t.textContent = title;
    document.title = title + ' · BuilderPro';
    var tabs = $('hlTabs');
    if (tabs) {
      var ks = g && g.kids ? kidsOf(g) : [];
      if (ks.length && !ks.some(function (k) { return k[0] === v; }) && window.BPVIEWS && BPVIEWS[v]) ks = ks.concat([[v, BPVIEWS[v].t]]);
      if (ks.length > 1) {
        tabs.innerHTML = ks.map(function (k) {
          var on = k[0] === v;
          return '<button type="button" role="tab" aria-selected="' + on + '" class="hl-tab' + (on ? ' on' : '') + '" onclick="bpNav(\'' + k[0] + '\')">' + esc(k[1])
            + (window.bpLocked && bpLocked(k[0]) ? ' <svg class="hl-i hl-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' : '') + '</button>';
        }).join('');
        tabs.hidden = false;
        var on = tabs.querySelector('.on'); if (on && on.scrollIntoView && tabs.scrollWidth > tabs.clientWidth) { try { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
      } else { tabs.innerHTML = ''; tabs.hidden = true; }
      if (g && g.kids && g.kids.some(function (k) { return k[0] === v; })) LS.set('hlTab:' + g.id, v);
    }
    if (!quiet) { S.drawer(false); S.closeAll(); }
    paintAcct();
    S.badge();
    setTimeout(S.tables, 0);
  };

  /* ---------- collapse and drawer ---------- */
  function app() { return $('bpxApp'); }
  S.collapse = function (on) {
    var a = app(); if (!a) return;
    if (phone()) { S.drawer(false); return; }
    on = on == null ? !a.classList.contains('hl-min') : !!on;
    a.classList.toggle('hl-min', on);
    LS.set('hlSideMin', on ? '1' : '0');
    var b = document.querySelector('#bpxSide .hl-collapse');
    if (b) { b.title = on ? 'Expand sidebar' : 'Collapse sidebar'; b.setAttribute('aria-label', b.title); }
  };
  S.drawer = function (on) {
    var a = app(); if (!a) return;
    on = on == null ? !a.classList.contains('hl-drawer') : !!on;
    if (on && !phone()) on = false;
    if (on) S.aiClose();
    a.classList.toggle('hl-drawer', on);
  };

  /* ---------- top bar ---------- */
  function topActs() {
    var c = crew();
    return (c ? '' : '<button type="button" class="hl-rb g" title="Conversations" aria-label="Conversations" onclick="bpNav(\'messaging\')">' + ico('phone') + '</button>')
      + '<button type="button" class="hl-rb p" title="Ask ' + esc(window.BP_AI_NAME || 'Lisa') + '" aria-label="AI assistant" onclick="bpShell.aiToggle()">' + ico('spark') + '</button>'
      + '<button type="button" class="hl-rb o" id="hlBell" title="Notifications" aria-label="Notifications" aria-haspopup="menu" onclick="bpShell.notes(this)">' + ico('bell') + '<span class="hl-badge" id="hlBellN" hidden></span></button>'
      + '<button type="button" class="hl-rb b" title="Help" aria-label="Help" aria-haspopup="menu" onclick="bpShell.help(this)">' + ico('help') + '</button>'
      + '<button type="button" class="hl-av" id="hlAv" title="Account" aria-label="Account menu" aria-haspopup="menu" onclick="bpShell.profile(this)">?</button>';
  }
  S.enter = function (email) {
    var k = $('hlKbd'); if (k) k.textContent = isMac ? '⌘K' : 'Ctrl K';
    var ta = $('hlTacts'); if (ta) ta.innerHTML = topActs();
    if (LS.get('hlSideMin') === '1' && !phone()) app().classList.add('hl-min');
    S.buildNav();
    paintAcct();
    /* settings and the team land a moment later; repaint the names when they do */
    setTimeout(function () { S.buildNav(); }, 1500);
  };

  /* ---------- menus: one at a time, anchored, Esc or a click away closes ---------- */
  var openMenu = null;
  S.closeAll = function () {
    if (openMenu) { var m = openMenu; openMenu = null; if (m.parentNode) m.parentNode.removeChild(m); if (m._anchor) m._anchor.setAttribute('aria-expanded', 'false'); }
    var pal = $('hlPal'); if (pal) pal.parentNode.removeChild(pal);
  };
  function host() { return $('bpx') || document.body; }
  S.menu = function (anchor, items, o) {
    o = o || {};
    var same = openMenu && openMenu._anchor === anchor;
    S.closeAll(); if (same) return null;
    var m = document.createElement('div');
    m.className = 'hl-menu' + (o.cls ? ' ' + o.cls : ''); m.setAttribute('role', 'menu'); m._anchor = anchor;
    if (o.head) { var hd = document.createElement('div'); hd.className = 'hl-mhead'; hd.innerHTML = o.head; m.appendChild(hd); }
    items.forEach(function (it) {
      if (it.sep) { var s = document.createElement('div'); s.className = 'hl-msep'; m.appendChild(s); return; }
      if (it.label) { var l = document.createElement('div'); l.className = 'hl-mlab'; l.textContent = it.label; m.appendChild(l); return; }
      if (it.html) { var d = document.createElement('div'); d.className = 'hl-mhtml'; d.innerHTML = it.html; m.appendChild(d); return; }
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'menuitem');
      b.className = 'hl-mi' + (it.danger ? ' danger' : '');
      b.innerHTML = (it.ico ? ico(it.ico) : '') + '<span>' + esc(it.t) + '</span>' + (it.right || '');
      b.onclick = function (e) { e.stopPropagation(); if (!it.keep) S.closeAll(); if (it.fn) it.fn(b); };
      m.appendChild(b);
    });
    host().appendChild(m);
    openMenu = m; anchor.setAttribute('aria-expanded', 'true');
    var r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var left = o.align === 'right' ? r.right - w : r.left;
    if (o.side) left = r.right + 6;
    left = Math.max(8, Math.min(left, vw - w - 8));
    var top = o.side ? r.top : r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, (o.side ? vh - h - 8 : r.top - h - 6));
    m.style.left = left + 'px'; m.style.top = top + 'px';
    var f = m.querySelector('.hl-mi'); if (f && o.focus !== false) f.focus({ preventScroll: true });
    return m;
  };
  document.addEventListener('mousedown', function (e) {
    if (openMenu && !openMenu.contains(e.target) && !(openMenu._anchor && openMenu._anchor.contains(e.target))) S.closeAll();
  }, true);
  window.addEventListener('resize', function () { if (openMenu) S.closeAll(); if (!phone()) S.drawer(false); });
  document.addEventListener('keydown', function (e) {
    var appOn = app() && app().classList.contains('on') && $('bpx') && $('bpx').classList.contains('open');
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K') && appOn) { e.preventDefault(); S.palette(); return; }
    if (e.key === 'Escape') {
      if (openMenu || $('hlPal')) { var a = openMenu && openMenu._anchor; S.closeAll(); if (a && a.focus) a.focus(); e.stopPropagation(); }
      else if (app() && app().classList.contains('hl-drawer')) S.drawer(false);
    }
    if (openMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      var its = [].slice.call(openMenu.querySelectorAll('.hl-mi')), i = its.indexOf(document.activeElement);
      if (its.length) { e.preventDefault(); its[(i + (e.key === 'ArrowDown' ? 1 : -1) + its.length) % its.length].focus(); }
    }
  }, true);

  /* ---------- account card ---------- */
  S.acctMenu = function (btn) {
    var c = crew();
    var sw = function () { return '<span class="hl-sw' + (dark() ? ' on' : '') + '" aria-hidden="true"><i></i></span>'; };
    var items = [];
    if (!c && allows('settings')) items.push({ t: 'Business settings', ico: 'settings', fn: function () { bpNav('settings'); } });
    if (!c && allows('settings')) items.push({ t: 'Plan & billing', ico: 'card', fn: S.plan });
    items.push({ t: 'Switch theme', ico: 'moon', keep: true, right: sw(), fn: function (b) { if (window.bpToggleTheme) bpToggleTheme(); var s = b.querySelector('.hl-sw'); if (s) s.classList.toggle('on', dark()); b.setAttribute('aria-checked', String(dark())); } });
    items.push({ t: 'Back to website', ico: 'globe', fn: S.leave });
    items.push({ sep: 1 });
    items.push({ t: 'Sign out', ico: 'out', fn: function () { bpLogout(); } });
    var m = S.menu(btn, items, { head: '<b>' + esc(bizName()) + '</b><small>' + esc(c ? 'Crew' : (planName() || 'OS')) + '</small>', side: !phone() && app().classList.contains('hl-min') });
    if (m) { var d = [].slice.call(m.querySelectorAll('.hl-mi')).filter(function (x) { return /Switch theme/.test(x.textContent); })[0]; if (d) { d.setAttribute('role', 'menuitemcheckbox'); d.setAttribute('aria-checked', String(dark())); } }
  };
  S.plan = function () {
    bpNav('settings');
    setTimeout(function () {
      var el = document.querySelector('#bpxViewArea [id*="plan" i], #bpxViewArea [class*="plan" i]');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
    }, 120);
  };

  /* ---------- quick add ---------- */
  function openAfter(view, fn) {
    bpNav(view);
    if (window.bpLocked && bpLocked(view)) return;
    setTimeout(function () { var f = window[fn[0]]; if (typeof f === 'function') { try { f.apply(null, fn.slice(1)); } catch (e) {} } }, 90);
  }
  var QUICK = [
    { t: 'New project', ico: 'projects', v: 'activejobs', fn: ['bpAddJobOpen'] },
    { t: 'New estimate', ico: 'est', v: 'estimates', fn: ['bpEstOpen'] },
    { t: 'New invoice', ico: 'inv', v: 'invoices', fn: ['bpInvOpen'] },
    { t: 'Add expense', ico: 'exp', v: 'ledger', fn: ['bpFinAddOpen', 'expense'] },
    { t: 'New contact', ico: 'user', v: 'contacts', fn: ['bpOpenAdd'] }
  ];
  S.quick = function (btn) {
    S.menu(btn, QUICK.filter(function (q) { return allows(q.v); }).map(function (q) { return { t: q.t, ico: q.ico, fn: function () { openAfter(q.v, q.fn); } }; }),
      { side: !phone() && app().classList.contains('hl-min') });
  };

  /* ---------- notifications: what needs you, then what happened ---------- */
  function feed() { try { return (window.BP_DASH && BP_DASH.feed) ? BP_DASH.feed() : { needs: [], recent: [] }; } catch (e) { return { needs: [], recent: [] }; } }
  var strip = function (h) { var d = document.createElement('div'); d.innerHTML = h; return d.textContent; };
  S.badge = function () {
    var n = $('hlBellN'); if (!n) return;
    var c = crew() ? 0 : feed().needs.length;
    n.textContent = c > 9 ? '9+' : String(c); n.hidden = !c;
  };
  S.notes = function (btn) {
    var f = crew() ? { needs: [], recent: [] } : feed();
    var ago = function (t) { var m = Math.max(1, Math.round((Date.now() - t) / 60000)); if (m < 60) return m + 'm ago'; var h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; };
    var items = [];
    if (f.needs.length) {
      items.push({ label: 'Needs you' });
      f.needs.forEach(function (r) { items.push({ t: strip(r.t), ico: 'bell', fn: function () { bpNav(r.go); }, right: '<i class="hl-dot ' + (r.tone || '') + '"></i>' }); });
    }
    if (f.recent.length) {
      items.push({ label: 'Recent activity' });
      f.recent.forEach(function (r) { items.push({ t: strip(r.txt), ico: 'list', fn: function () { bpNav(r.go); }, right: '<small>' + ago(r.t) + '</small>' }); });
    }
    if (!items.length) items.push({ html: '<div class="hl-mempty">' + ico('bell') + '<span>You are all caught up.</span></div>' });
    S.menu(btn, items, { align: 'right', cls: 'hl-notes', head: '<b>Notifications</b>' + (f.needs.length ? '<small>' + f.needs.length + ' waiting</small>' : '') });
  };

  /* ---------- help: the assistant lives here now, not in a floating bubble ---------- */
  function aiOpen() { var p = document.querySelector('.oaw-panel'); return !!(p && p.style.display === 'flex'); }
  S.aiClose = function () { if (aiOpen()) { var b = document.querySelector('.oaw-btn'); if (b) b.click(); } };
  S.aiToggle = function () { if (aiOpen()) S.aiClose(); else S.ai(); };
  S.ai = function () {
    S.closeAll(); S.drawer(false);
    var p = document.querySelector('.oaw-panel');
    if (p && !p.classList.contains('hl-docked')) {
      p.classList.add('hl-docked');
      if ($('bpx') && p.parentNode !== $('bpx')) $('bpx').appendChild(p);
      var h = p.querySelector('.oaw-head');
      if (h) { var x = document.createElement('button'); x.type = 'button'; x.className = 'hl-oaw-x'; x.setAttribute('aria-label', 'Close assistant'); x.textContent = '\u00d7'; x.onclick = S.aiClose; h.appendChild(x); }
    }
    if (!aiOpen()) { var b = document.querySelector('.oaw-btn'); if (b) b.click(); }
  };
  S.help = function (btn) {
    var ai = window.BP_AI_NAME || 'Lisa';
    S.menu(btn, [
      { t: 'Ask ' + ai + ', your assistant', ico: 'spark', fn: S.ai },
      { t: 'Search and shortcuts', ico: 'key', right: '<kbd>' + (isMac ? '⌘K' : 'Ctrl K') + '</kbd>', fn: function () { S.palette(); } },
      { t: 'Setup checklist', ico: 'list', fn: function () { bpNav('dashboard'); } },
      { sep: 1 },
      { t: 'Email support', ico: 'mail', fn: function () { location.href = 'mailto:support@builderpro-os.com'; } }
    ], { align: 'right' });
  };

  /* ---------- profile ---------- */
  function dark() { var x = $('bpx'); return !!(x && x.classList.contains('bpx-dark')); }
  S.profile = function (btn) {
    var c = crew(), name = ownerName() || bizName();
    var sw = function () { return '<span class="hl-sw' + (dark() ? ' on' : '') + '" aria-hidden="true"><i></i></span>'; };
    var items = [];
    if (!c && allows('settings')) items.push({ t: 'Settings', ico: 'settings', fn: function () { bpNav('settings'); } });
    if (!c && allows('settings')) items.push({ t: 'Plan & billing', ico: 'card', fn: S.plan });
    items.push({ t: 'Dark mode', ico: 'moon', keep: true, right: sw(), fn: function (b) { if (window.bpToggleTheme) bpToggleTheme(); var s = b.querySelector('.hl-sw'); if (s) s.classList.toggle('on', dark()); b.setAttribute('aria-checked', String(dark())); } });
    items.push({ t: 'Back to website', ico: 'globe', fn: S.leave });
    items.push({ sep: 1 });
    items.push({ t: 'Sign out', ico: 'out', fn: function () { bpLogout(); } });
    var m = S.menu(btn, items, { align: 'right', head: '<span class="hl-av sm">' + esc(initials(ownerName() || window._bpEmail || name)) + '</span><span><b>' + esc(name) + '</b><small>' + esc(window._bpEmail || '') + '</small></span>', cls: 'hl-prof' });
    if (m) { var d = [].slice.call(m.querySelectorAll('.hl-mi')).filter(function (x) { return /Dark mode/.test(x.textContent); })[0]; if (d) { d.setAttribute('role', 'menuitemcheckbox'); d.setAttribute('aria-checked', String(dark())); } }
  };

  /* ---------- command palette ---------- */
  function pages() {
    var out = [], seen = {};
    var add = function (v, label, sec) {
      if (seen[v] || !allows(v) || !(window.BPVIEWS && BPVIEWS[v])) return; seen[v] = 1;
      out.push({ kind: 'Pages', t: label, sub: sec || '', ico: 'page', go: function () { bpNav(v); } });
    };
    if (crew()) { CREW.forEach(function (x) { add(x[0], x[1]); }); return out; }
    (window.BP_NAV || []).forEach(function (g) {
      if (g.kids) kidsOf(g).forEach(function (k) { add(k[0], k[1] === 'Overview' || k[1] === 'Active' ? g.l + ' ' + k[1].toLowerCase() : k[1], g.l); });
      else add(g.id, g.l);
    });
    add('settings', 'Settings');
    add('ai', BPVIEWS.ai ? BPVIEWS.ai.t : 'AI receptionist', 'Settings');
    add('supplyorders', 'Material orders', 'Supply');
    add('prices', 'Supplier prices', 'Supply');
    add('closedeals', 'Close deals', 'Leads');
    return out;
  }
  function records(q) {
    var out = [], lim = q ? 6 : 4;
    var jobs = []; try { jobs = (window.bpJobsGet && bpJobsGet()) || []; } catch (e) {}
    jobs.filter(function (j) { return !q || ((j.name || '') + ' ' + (j.title || '') + ' ' + (j.address || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, lim)
      .forEach(function (j) { out.push({ kind: 'Projects', t: j.name || 'Project', sub: (j.title || '') + (j.status === 'done' ? ' · done' : ''), ico: 'projects', go: function () { bpNav('activejobs'); setTimeout(function () { if (window.bpProjOpen) bpProjOpen(j.id); }, 80); } }); });
    if (!q) return out;
    var cs = [].concat(window._bpContacts || [], window._bpCtList || []), seen = {};
    cs.filter(function (c) { if (!c || seen[c.id || c.name]) return false; seen[c.id || c.name] = 1; return ((c.name || '') + ' ' + (c.email || '') + ' ' + (c.phone || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, lim)
      .forEach(function (c) { out.push({ kind: 'Contacts', t: c.name || c.email || 'Contact', sub: c.phone || c.email || '', ico: 'user', go: function () { bpNav('contacts'); if (c.id && window.bpContactPage) setTimeout(function () { bpContactPage(c.id); }, 80); } }); });
    [['Invoices', window._bpInvItems, 'invoices', 'inv'], ['Estimates', window._bpEstItems, 'estimates', 'est']].forEach(function (x) {
      (x[1] || []).filter(function (v) { return ((v.name || '') + ' ' + (v.contact || '') + ' ' + (v.status || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, lim)
        .forEach(function (v) { out.push({ kind: x[0], t: (v.name || x[0].slice(0, -1)) + (v.contact ? ' · ' + v.contact : ''), sub: (v.status || '') + (v.total != null && window.bpMoneyFmt ? ' · ' + bpMoneyFmt(v.total) : ''), ico: x[3], go: function () { bpNav(x[2]); } }); });
    });
    return out;
  }
  S.palette = function () {
    S.closeAll(); S.drawer(false); S.aiClose();
    var ov = document.createElement('div'); ov.id = 'hlPal'; ov.className = 'hl-pal-ov';
    ov.innerHTML = '<div class="hl-pal" role="dialog" aria-modal="true" aria-label="Search"><div class="hl-pal-in">' + ico('search') + '<input id="hlPalQ" type="text" autocomplete="off" spellcheck="false" placeholder="Search pages, projects, contacts, invoices…" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="hlPalL"><kbd>Esc</kbd></div><div class="hl-pal-l" id="hlPalL" role="listbox"></div>'
      + '<div class="hl-pal-f"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span></div></div>';
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) S.closeAll(); });
    host().appendChild(ov);
    var inp = $('hlPalQ'), list = $('hlPalL'), res = [], sel = 0;
    var actions = function (q) {
      return QUICK.filter(function (x) { return allows(x.v) && !crew() && (!q || x.t.toLowerCase().indexOf(q) >= 0); })
        .map(function (x) { return { kind: 'Create', t: x.t, ico: x.ico, go: function () { openAfter(x.v, x.fn); } }; });
    };
    function draw() {
      var q = inp.value.trim().toLowerCase();
      var pg = pages().filter(function (p) { return !q || (p.t + ' ' + p.sub).toLowerCase().indexOf(q) >= 0; });
      res = (q ? [] : []).concat(q ? pg.slice(0, 8) : pg.slice(0, 7), actions(q), records(q));
      sel = Math.min(sel, Math.max(0, res.length - 1));
      var h = '', last = '';
      res.forEach(function (r, i) {
        if (r.kind !== last) { h += '<div class="hl-pal-k">' + esc(r.kind) + '</div>'; last = r.kind; }
        h += '<div class="hl-pal-r' + (i === sel ? ' on' : '') + '" role="option" aria-selected="' + (i === sel) + '" data-i="' + i + '">' + ico(r.ico) + '<span class="t">' + esc(r.t) + '</span>' + (r.sub ? '<span class="s">' + esc(r.sub) + '</span>' : '') + '</div>';
      });
      list.innerHTML = h || '<div class="hl-pal-none">No results for “' + esc(inp.value) + '”</div>';
    }
    function pick(i) { var r = res[i]; if (!r) return; S.closeAll(); r.go(); }
    inp.addEventListener('input', function () { sel = 0; draw(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!res.length) return;
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + res.length) % res.length; draw();
        var on = list.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    });
    list.addEventListener('mousemove', function (e) { var r = e.target.closest('.hl-pal-r'); if (r && +r.getAttribute('data-i') !== sel) { sel = +r.getAttribute('data-i'); [].forEach.call(list.querySelectorAll('.hl-pal-r'), function (x) { x.classList.toggle('on', +x.getAttribute('data-i') === sel); }); } });
    list.addEventListener('click', function (e) { var r = e.target.closest('.hl-pal-r'); if (r) pick(+r.getAttribute('data-i')); });
    draw(); inp.focus();
  };

  /* ---------- tables: toolbar, filter, count, pages, row menu ---------- */
  var SKIP = '.pr-tbl,.ml-tbl,.bpc-tbl,.hl-notable,.db-grid table,.hl-grid table';
  var PER = 25;
  function dataRows(tb) {
    return [].slice.call(tb.rows).filter(function (r) { return !r.classList.contains('hl-nomatch') && !(r.cells.length === 1 && r.cells[0].colSpan > 1); });
  }
  function statusCol(t) {
    var hs = t.tHead ? [].slice.call(t.tHead.rows[0] ? t.tHead.rows[0].cells : []) : [];
    for (var i = 0; i < hs.length; i++) if (/^(status|stage|state)$/i.test(hs[i].textContent.trim())) return i;
    return -1;
  }
  function rowMenu(t) {
    var hs = t.tHead && t.tHead.rows[0] ? t.tHead.rows[0].cells : [];
    [].forEach.call(t.tBodies, function (tb) {
      dataRows(tb).forEach(function (r) {
        var c = r.cells[r.cells.length - 1]; if (!c || c.querySelector('.hl-rowkeb')) return;
        if (hs.length && hs[hs.length - 1] && hs[hs.length - 1].textContent.trim()) return;
        var bs = [].slice.call(c.querySelectorAll('button')).filter(function (b) { return !b.classList.contains('bpx-donebtn') && !b.classList.contains('primary') && !b.classList.contains('pj-mark'); });
        if (bs.length < 2) return;
        bs.forEach(function (b) { b.classList.add('hl-inmenu'); });
        var k = document.createElement('button');
        k.type = 'button'; k.className = 'hl-rowkeb'; k.setAttribute('aria-label', 'Row actions'); k.setAttribute('aria-haspopup', 'menu');
        k.innerHTML = ico('dots');
        k.onclick = function (e) {
          e.stopPropagation();
          S.menu(k, bs.map(function (b) {
            var label = (b.getAttribute('title') || b.getAttribute('aria-label') || b.textContent || 'Action').trim();
            var del = b.classList.contains('del') || b.classList.contains('bpx-delbtn') || /delete|remove/i.test(label);
            return { t: label, danger: del, fn: function () { b.click(); } };
          }), { align: 'right' });
        };
        c.appendChild(k); c.classList.add('hl-actcell');
      });
    });
  }
  function nomatch(tb, show, cols) {
    var nm = tb.querySelector('tr.hl-nomatch');
    if (show && !nm) { nm = document.createElement('tr'); nm.className = 'hl-nomatch'; nm.innerHTML = '<td colspan="' + cols + '">No matches</td>'; tb.appendChild(nm); }
    if (!show && nm) nm.parentNode.removeChild(nm);
  }
  function newBar() {
    var bar = document.createElement('div'); bar.className = 'hl-tbar';
    bar.innerHTML = '<label class="hl-tsearch">' + ico('search') + '<input type="search" placeholder="Search" aria-label="Search this list"></label><span class="hl-tfilt"></span><span class="hl-tcount"></span>';
    return bar;
  }
  /* a list paged by bpPage(): search and filter the whole list, then redraw */
  function wirePaged(bar, foot) {
    var key = foot.getAttribute('data-pgk');
    var inp = bar.querySelector('input'), cnt = bar.querySelector('.hl-tcount'), fl = bar.querySelector('.hl-tfilt');
    var call = foot.getAttribute('data-call'), total = +foot.getAttribute('data-total'), all = +foot.getAttribute('data-all');
    var sts = (foot.getAttribute('data-st') || '').split('|').filter(Boolean);
    if (inp.value !== (window._bpPgQ[key] || '')) inp.value = window._bpPgQ[key] || '';
    cnt.textContent = total === all ? all + (all === 1 ? ' result' : ' results') : total + ' of ' + all;
    if (sts.length > 1 && !fl.firstChild) {
      fl.innerHTML = '<select aria-label="Filter by status"><option value="">All statuses</option>' + sts.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')) + '</option>'; }).join('') + '</select>';
    }
    var sel = fl.querySelector('select'); if (sel) sel.value = window._bpPgF[key] || '';
    var redraw = function () { window._bpPg[key] = 1; S._focus = { key: key, pos: inp.selectionStart }; try { new Function(call)(); } catch (e) {} };
    inp.oninput = function () { window._bpPgQ[key] = inp.value; redraw(); };
    if (sel) sel.onchange = function () { window._bpPgF[key] = sel.value; redraw(); };
    if (S._focus && S._focus.key === key) { if (document.activeElement !== inp) { inp.focus(); try { inp.setSelectionRange(S._focus.pos, S._focus.pos); } catch (e) {} } S._focus = null; }
  }
  function enhance(t) {
    if (t.closest(SKIP) || t.closest('.bpx-modal,.bpx-modalcard,#bpx-modal,.hl-w')) return;
    var tb = t.tBodies[0]; if (!tb) return;
    var view = window._bpCurView || '';
    /* a paged list: the footer from bpPage() is next to it */
    var foot = null, up = t.parentNode, area = $('bpxViewArea');
    while (up && up !== document.body) {
      var f = up.querySelector('.hl-pgfoot');
      if (f) { if (up.querySelectorAll('table').length === 1) foot = f; break; }
      if (up === area) break;
      up = up.parentNode;
    }
    var bar = t.previousElementSibling && t.previousElementSibling.classList.contains('hl-tbar') ? t.previousElementSibling : null;
    var wrap = t.parentNode;
    /* tables inside a scroll wrapper get the bar above the wrapper */
    if (!bar && wrap && wrap !== area && wrap.children.length <= 2 && /auto|scroll/.test(getComputedStyle(wrap).overflowX) && wrap.previousElementSibling && wrap.previousElementSibling.classList.contains('hl-tbar')) bar = wrap.previousElementSibling;
    var rows = dataRows(tb);
    if (!rows.length && !foot) return;
    var key = foot ? foot.getAttribute('data-pgk') : null;
    if (!bar) {
      bar = newBar();
      var anchor = (wrap && wrap !== area && wrap.children.length === 1 && /auto|scroll|hidden/.test(getComputedStyle(wrap).overflowX)) ? wrap : t;
      anchor.parentNode.insertBefore(bar, anchor);
    }
    var inp = bar.querySelector('input'), cnt = bar.querySelector('.hl-tcount'), fl = bar.querySelector('.hl-tfilt');
    var cols = (t.tHead && t.tHead.rows[0]) ? t.tHead.rows[0].cells.length : (rows[0] ? rows[0].cells.length : 1);
    if (foot) {
      wirePaged(bar, foot);
      var total = +foot.getAttribute('data-total'), all = +foot.getAttribute('data-all');
      nomatch(tb, !rows.length && total === 0 && all > 0, cols);
    } else {
      /* everything is on the page already: filter and page it here */
      var sc = statusCol(t);
      if (sc >= 0 && !fl.firstChild) {
        var vals = {}; rows.forEach(function (r) { var c = r.cells[sc]; if (c) { var v = c.textContent.trim(); if (v) vals[v] = 1; } });
        var vs = Object.keys(vals);
        if (vs.length > 1 && vs.length <= 12) fl.innerHTML = '<select aria-label="Filter by status"><option value="">All statuses</option>' + vs.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>';
      }
      var sel2 = fl.querySelector('select');
      var pg = t._hlPage || 1;
      var apply = function (reset) {
        if (reset) pg = 1;
        var q = inp.value.trim().toLowerCase(), f = sel2 ? sel2.value : '';
        var hits = rows.filter(function (r) { return (!q || r.textContent.toLowerCase().indexOf(q) >= 0) && (!f || (r.cells[sc] && r.cells[sc].textContent.trim() === f)); });
        var n = Math.max(1, Math.ceil(hits.length / PER)); pg = Math.min(pg, n); t._hlPage = pg;
        rows.forEach(function (r) { r.hidden = true; });
        hits.slice((pg - 1) * PER, pg * PER).forEach(function (r) { r.hidden = false; });
        cnt.textContent = (q || f) ? hits.length + ' of ' + rows.length : rows.length + (rows.length === 1 ? ' result' : ' results');
        nomatch(tb, !hits.length, cols);
        var pf = bar._foot;
        if (hits.length > PER) {
          if (!pf) { pf = bar._foot = document.createElement('div'); pf.className = 'hl-pgfoot'; (t.parentNode === wrap && wrap !== area && wrap.children.length <= 2 && bar.parentNode !== wrap ? wrap : t).insertAdjacentElement('afterend', pf); }
          var a = (pg - 1) * PER + 1, b = Math.min(pg * PER, hits.length);
          pf.innerHTML = '<span>' + a + '–' + b + ' of ' + hits.length + '</span><button class="hl-pgb" aria-label="Previous page"' + (pg <= 1 ? ' disabled' : '') + '>‹</button><button class="hl-pgb" aria-label="Next page"' + (pg >= n ? ' disabled' : '') + '>›</button>';
          var bb = pf.querySelectorAll('button');
          bb[0].onclick = function () { pg--; apply(); }; bb[1].onclick = function () { pg++; apply(); };
        } else if (pf) { pf.innerHTML = ''; }
      };
      inp.oninput = function () { apply(true); };
      if (sel2) sel2.onchange = function () { apply(true); };
      apply();
    }
    rowMenu(t);
    t.setAttribute('data-hl', view);
  }
  S.tables = function () {
    var area = $('bpxViewArea'); if (!area || window._bpCurView === 'dashboard') return;
    [].forEach.call(area.querySelectorAll('table.bpx-table, table.bpx-ctable'), function (t) {
      if (t.tBodies[0] && t._hlSig === t.tBodies[0].rows.length + ':' + (t.tBodies[0].firstElementChild ? t.tBodies[0].firstElementChild.textContent.length : 0) && t.getAttribute('data-hl')) return;
      try { enhance(t); } catch (e) {}
      if (t.tBodies[0]) t._hlSig = t.tBodies[0].rows.length + ':' + (t.tBodies[0].firstElementChild ? t.tBodies[0].firstElementChild.textContent.length : 0);
    });
    /* paged lists that are not tables (checks, reviews): the bar goes on top of the list */
    [].forEach.call(area.querySelectorAll('.hl-pgfoot[data-pgk]'), function (f) {
      var box = f.parentNode; if (!box || box.querySelector('table')) return;
      if (+f.getAttribute('data-all') < 2) return;
      var bar = box.querySelector(':scope > .hl-tbar');
      if (!bar) { bar = newBar(); bar.classList.add('hl-tbar-list'); box.insertBefore(bar, box.firstChild); }
      try { wirePaged(bar, f); } catch (e) {}
    });
  };
  /* lists draw late (after a fetch) and redraw their bodies in place */
  var tq = 0;
  function watch() {
    var area = $('bpxViewArea'); if (!area || !window.MutationObserver) return;
    new MutationObserver(function (ms) {
      if (tq) return;
      for (var i = 0; i < ms.length; i++) { var n = ms[i].target; if (n.closest && n.closest('.hl-tbar,.hl-pgfoot')) continue; tq = requestAnimationFrame(function () { tq = 0; S.tables(); }); return; }
    }).observe(area, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
