/* ==================================================================
   Team chat: the owner and the people who sign in to the account.
   Not customer texting (that is Conversations > Texts).

   Owner:  Conversations > Team chat. Groups (create, rename, members,
           delete) and a direct line with anyone on the team.
   Crew:   Messages in their sidebar. The groups they are in and a
           direct line with the owner, which is always there.

   Data: team_threads / team_thread_members / team_messages and the
   team_chat_* functions (supabase/migrations/20261003000001_team_chat.sql).
   New messages arrive over Supabase Realtime; if the channel will not
   open, the open view polls every 5 seconds instead.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.bpEsc || function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var phone = function () { return (window.innerWidth || 1200) <= 820; };
  var BUCKET = 'project-files';

  var C = window.BP_TCHAT = { me: null, threads: [], people: null, cur: null, msgs: {}, ch: null, rt: false, poll: null, guard: null, busy: false, urls: {} };

  function team() { return window.BP_TEAM || {}; }
  function me() { return team().uid || C.me; }
  function isOwner() { return !team().role || team().role === 'owner'; }
  function toast(m) { if (window.bpToast) bpToast(m); }

  function initials(s) {
    s = String(s || '').replace(/@.*/, '').replace(/[._-]+/g, ' ').trim();
    var w = s.split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : (w[0] || '')[1] || '')).toUpperCase();
  }
  var HUES = ['#155EEF', '#7A5AF8', '#12B76A', '#F79009', '#EE46BC', '#0BA5EC', '#F04438', '#475467'];
  function hue(s) { s = String(s || ''); var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return HUES[Math.abs(h) % HUES.length]; }
  function when(t) {
    if (!t) return '';
    var d = new Date(t), n = new Date();
    if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    var y = new Date(n); y.setDate(n.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function dayLabel(t) {
    var d = new Date(t), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
    if (d.toDateString() === n.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  }

  /* ---------- thread helpers ---------- */
  function others(t) { return (t.members || []).filter(function (m) { return m.user_id !== me(); }); }
  function title(t) {
    if (!t) return '';
    if (t.virtual) return t.name;
    if (t.kind === 'group') return t.name || 'Group';
    var o = others(t)[0]; return o ? o.name : 'Direct message';
  }
  function sub(t) {
    if (t.kind === 'group') return (t.members || []).length + ' people';
    var o = others(t)[0]; return o && o.is_owner ? 'Owner' : 'Direct message';
  }
  function avatar(t, sz) {
    var n = title(t);
    if (t.kind === 'group') return '<span class="tc-av g' + (sz ? ' ' + sz : '') + '" style="--c:' + hue(t.id || n) + '"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg></span>';
    var o = others(t)[0]; return '<span class="tc-av' + (sz ? ' ' + sz : '') + '" style="--c:' + hue((o && o.user_id) || n) + '">' + esc(initials(n)) + '</span>';
  }
  function nameOf(uid, t) {
    var m = ((t && t.members) || []).filter(function (x) { return x.user_id === uid; })[0]
      || (C.people || []).filter(function (x) { return x.user_id === uid; })[0];
    return m ? m.name : 'Someone';
  }
  function byId(id) { return C.threads.filter(function (t) { return t.id === id; })[0] || null; }

  /* crew (and office) always see a line to the owner, even before the first message */
  function listed() {
    var ts = C.threads.slice();
    if (!isOwner() && !ts.some(function (t) { return t.kind === 'direct' && others(t).some(function (m) { return m.is_owner; }); })) {
      ts.unshift({ id: '__owner', virtual: true, kind: 'direct', name: team().ownerName || 'Owner', members: [], unread: 0 });
    }
    return ts;
  }

  /* ---------- data ---------- */
  function rpc(n, a) {
    return BP_SB.rpc(n, a || {}).then(function (r) { if (r && r.error) throw r.error; return r ? r.data : null; });
  }
  function loadThreads() {
    if (!live()) return Promise.resolve([]);
    return rpc('team_chat_list').then(function (rows) {
      C.threads = (rows || []).map(function (t) { t.members = t.members || []; return t; });
      if (!isOwner()) {
        var o = null; C.threads.forEach(function (t) { (t.members || []).forEach(function (m) { if (m.is_owner) o = m.name; }); });
        if (o) team().ownerName = o;
      }
      paintBadge(C.threads.reduce(function (s, t) { return s + (t.unread || 0); }, 0));
      return C.threads;
    });
  }
  function loadPeople() {
    if (C.people || !live()) return Promise.resolve(C.people || []);
    return rpc('team_chat_people').then(function (r) { C.people = r || []; return C.people; }).catch(function () { C.people = []; return []; });
  }
  function loadMsgs(id) {
    return Promise.resolve(BP_SB.from('team_messages').select('id,thread_id,sender,body,attachment,created_at')
      .eq('thread_id', id).order('created_at', { ascending: false }).limit(200))
      .then(function (r) { if (r && r.error) throw r.error; C.msgs[id] = ((r && r.data) || []).slice().reverse(); return C.msgs[id]; });
  }
  function markRead(id) {
    var t = byId(id); if (t && t.unread) { t.unread = 0; paintList(); }
    paintBadge(C.threads.reduce(function (s, x) { return s + (x.unread || 0); }, 0));
    return rpc('team_chat_mark_read', { p_thread: id }).catch(function () {});
  }

  /* ---------- sidebar badge ---------- */
  function paintBadge(n) {
    C.unread = n;
    var sel = (window.bpTeamIsCrew && bpTeamIsCrew()) ? '#bpxNav .hl-ni[data-sec="crewmsgs"]' : '#bpxNav .hl-ni[data-sec="convos"]';
    var a = document.querySelector(sel); if (!a) return;
    [a, document.querySelector('#hlTabs .hl-tab[onclick*="teamchat"]')].forEach(function (el) {
      if (!el) return;
      var b = el.querySelector('.tc-nb');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('i'); b.className = 'tc-nb'; el.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n);
    });
  }
  window.bpTeamChatBadge = function () {
    if (!live() || !me()) return;
    rpc('team_chat_unread').then(function (n) { paintBadge(+n || 0); }).catch(function () {});
  };
  setInterval(function () { if (!document.hidden && !$('tcRoot')) window.bpTeamChatBadge(); }, 60000);

  /* ---------- the view ---------- */
  function area() { return $('bpxViewArea'); }
  function view() {
    stop();
    var a = area(); if (!a) return;
    if (!live()) {
      a.innerHTML = '<div class="tc tc-empty-page"><div class="tc-zero"><b>Team chat</b><p>Sign in to message your team.</p></div></div>';
      if (window.bpSpin) bpSpin(false); return;
    }
    a.innerHTML = '<div class="tc" id="tcRoot"><aside class="tc-side"><div class="tc-sh"><b>' + (isOwner() ? 'Team chat' : 'Messages') + '</b>'
      + (isOwner() ? '<span class="tc-acts"><button type="button" class="tc-ib" title="New message" aria-label="New message" onclick="bpTcNewDirect(this)"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>'
        + '<button type="button" class="tc-btn" onclick="bpTcGroup()"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>New group</button></span>' : '')
      + '</div><div class="tc-list" id="tcList"><div class="tc-load">Loading…</div></div></aside>'
      + '<section class="tc-pane" id="tcPane"><div class="tc-zero"><b>Pick a conversation</b><p>' + (isOwner() ? 'Or start a group for a job crew.' : 'Messages from your team show up here.') + '</p></div></section></div>';
    if (window.bpSpin) bpSpin(false);
    var first = !phone();
    loadThreads().then(function () {
      paintList();
      var want = C.cur && (byId(C.cur) || C.cur === '__owner') ? C.cur : (first ? (listed()[0] || {}).id : null);
      if (want) open(want);
    }).catch(function (e) {
      $('tcList').innerHTML = '<div class="tc-load">Team chat is not set up yet.<br><small>' + esc((e && e.message) || '') + '</small></div>';
    });
    if (isOwner()) loadPeople();
    start();
  }
  window.bpTeamChat = view;
  window.bpCrewMsgs = view;

  function paintList() {
    var el = $('tcList'); if (!el) return;
    var ts = listed();
    if (!ts.length) { el.innerHTML = '<div class="tc-load">No conversations yet.' + (isOwner() ? '<br><small>Start a group or message someone on your team.</small>' : '') + '</div>'; return; }
    el.innerHTML = ts.map(function (t) {
      var who = t.last_sender && t.kind === 'group' ? (t.last_sender === me() ? 'You' : nameOf(t.last_sender, t).split(' ')[0]) + ': ' : (t.last_sender === me() ? 'You: ' : '');
      var last = t.virtual ? 'Message the owner' : (t.last_body != null && t.last_message_at ? who + (t.last_body || 'Photo') : sub(t));
      return '<button type="button" class="tc-row' + (t.id === C.cur ? ' on' : '') + (t.unread ? ' un' : '') + '" onclick="bpTcOpen(\'' + t.id + '\')">'
        + avatar(t) + '<span class="tc-rb"><span class="tc-rt"><b>' + esc(title(t)) + '</b><small>' + esc(when(t.last_message_at)) + '</small></span>'
        + '<span class="tc-rl"><span>' + esc(last) + '</span>' + (t.unread ? '<i class="tc-dot">' + (t.unread > 9 ? '9+' : t.unread) + '</i>' : '') + '</span></span></button>';
    }).join('');
  }

  function open(id) {
    if (id === '__owner') {
      return rpc('team_chat_open_direct', { p_other: null }).then(function (nid) {
        return loadThreads().then(function () { C.cur = nid; paintList(); open(nid); });
      }).catch(function (e) { toast((e && e.message) || 'Could not open that chat'); });
    }
    var t = byId(id); if (!t) return;
    C.cur = id;
    var root = $('tcRoot'); if (root) root.classList.add('tc-open');
    paintList();
    var p = $('tcPane'); if (!p) return;
    var canEdit = isOwner() && t.kind === 'group' && t.owner === me();
    p.innerHTML = '<header class="tc-ph"><button type="button" class="tc-ib tc-back" aria-label="Back" onclick="bpTcBack()"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + avatar(t, 'sm') + '<span class="tc-pt"><b>' + esc(title(t)) + '</b><small>' + esc(t.kind === 'group' ? (t.members || []).map(function (m) { return m.user_id === me() ? 'You' : m.name; }).join(', ') : sub(t)) + '</small></span>'
      + (canEdit ? '<button type="button" class="tc-ib" title="Group settings" aria-label="Group settings" onclick="bpTcGroup(\'' + t.id + '\')"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>' : '')
      + '</header><div class="tc-msgs" id="tcMsgs"><div class="tc-load">Loading…</div></div>'
      + '<form class="tc-comp" onsubmit="bpTcSend();return false"><label class="tc-ib tc-att" title="Attach a photo" aria-label="Attach a photo"><input type="file" accept="image/*" id="tcFile" onchange="bpTcAttach(this)" hidden><svg viewBox="0 0 24 24"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg></label>'
      + '<div class="tc-in"><div class="tc-prev" id="tcPrev" hidden></div><textarea id="tcText" rows="1" placeholder="Message ' + esc(t.kind === 'group' ? t.name || 'the group' : title(t)) + '" onkeydown="bpTcKey(event)" oninput="bpTcGrow(this)"></textarea></div>'
      + '<button type="submit" class="tc-send" id="tcSend" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form>';
    if (C.msgs[id]) paintMsgs(true);
    loadMsgs(id).then(function () { if (C.cur === id) paintMsgs(true); }).catch(function () { var m = $('tcMsgs'); if (m) m.innerHTML = '<div class="tc-load">Could not load messages.</div>'; });
    markRead(id);
    if (!phone()) { var ta = $('tcText'); if (ta) ta.focus(); }
  }
  window.bpTcOpen = open;
  window.bpTcBack = function () { var r = $('tcRoot'); if (r) r.classList.remove('tc-open'); C.cur = null; paintList(); };

  function paintMsgs(toEnd) {
    var el = $('tcMsgs'); if (!el) return;
    var t = byId(C.cur), ms = C.msgs[C.cur] || [];
    var nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (!ms.length) { el.innerHTML = '<div class="tc-zero sm"><b>No messages yet</b><p>Say hello.</p></div>'; return; }
    var h = '', lastDay = '', prev = null;
    ms.forEach(function (m) {
      var d = new Date(m.created_at).toDateString();
      if (d !== lastDay) { h += '<div class="tc-day"><span>' + esc(dayLabel(m.created_at)) + '</span></div>'; lastDay = d; prev = null; }
      var mine = m.sender === me();
      var grouped = prev && prev.sender === m.sender && (new Date(m.created_at) - new Date(prev.created_at)) < 5 * 60000;
      var att = m.attachment && m.attachment.path ? '<a class="tc-img" href="#" onclick="bpTcView(\'' + esc(m.attachment.path) + '\');return false"><img data-p="' + esc(m.attachment.path) + '" alt="' + esc(m.attachment.name || 'Photo') + '"></a>' : '';
      h += '<div class="tc-m' + (mine ? ' me' : '') + (grouped ? ' gr' : '') + (m.pending ? ' pend' : '') + '">'
        + (!mine && !grouped && t && t.kind === 'group' ? '<span class="tc-who">' + esc(nameOf(m.sender, t)) + '</span>' : '')
        + '<div class="tc-b">' + att + (m.body ? '<span class="tc-tx">' + esc(m.body).replace(/\n/g, '<br>') + '</span>' : '') + '</div>'
        + '<time title="' + esc(new Date(m.created_at).toLocaleString()) + '">' + esc(new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + (m.pending ? ' · Sending' : '') + '</time></div>';
      prev = m;
    });
    el.innerHTML = h;
    if (toEnd || nearEnd) el.scrollTop = el.scrollHeight;
    el.querySelectorAll('img[data-p]').forEach(function (img) {
      signed(img.getAttribute('data-p')).then(function (u) { if (u) { img.src = u; img.onload = function () { if (toEnd || nearEnd) el.scrollTop = el.scrollHeight; }; } });
    });
  }
  function signed(path) {
    if (C.urls[path]) return Promise.resolve(C.urls[path]);
    if (!BP_SB.storage) return Promise.resolve(null);
    return BP_SB.storage.from(BUCKET).createSignedUrl(path, 3600).then(function (r) { var u = r && r.data && r.data.signedUrl; if (u) C.urls[path] = u; return u; }).catch(function () { return null; });
  }
  window.bpTcView = function (path) { signed(path).then(function (u) { if (u) window.open(u, '_blank', 'noopener'); }); };

  /* ---------- composing ---------- */
  window.bpTcKey = function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); window.bpTcSend(); }
  };
  window.bpTcGrow = function (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
  window.bpTcAttach = function (inp) {
    var f = inp.files && inp.files[0]; C.file = f || null;
    var p = $('tcPrev'); if (!p) return;
    if (!f) { p.hidden = true; p.innerHTML = ''; return; }
    if (f.size > 15 * 1024 * 1024) { toast('That photo is over 15 MB'); inp.value = ''; C.file = null; return; }
    p.hidden = false;
    p.innerHTML = '<span class="tc-chip"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>' + esc(f.name) + '<button type="button" aria-label="Remove photo" onclick="bpTcClearFile()">×</button></span>';
  };
  window.bpTcClearFile = function () { C.file = null; var i = $('tcFile'); if (i) i.value = ''; var p = $('tcPrev'); if (p) { p.hidden = true; p.innerHTML = ''; } };

  function upload(file, tid) {
    var owner = (window.bpOwnerId && bpOwnerId()) || me();
    var safe = String(file.name || 'photo.jpg').replace(/[^\w.\-]+/g, '_').slice(-60);
    var path = owner + '/chat/' + tid + '/' + Date.now() + '-' + safe;
    return BP_SB.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false }).then(function (r) {
      if (r && r.error) throw r.error;
      return { path: path, name: file.name || 'Photo', type: file.type || 'image/jpeg', size: file.size || 0 };
    });
  }

  window.bpTcSend = function () {
    var ta = $('tcText'), tid = C.cur; if (!ta || !tid || C.sending) return;
    var body = ta.value.replace(/\s+$/, ''), file = C.file;
    if (!body.trim() && !file) return;
    C.sending = true;
    var tmp = { id: 'tmp' + Date.now(), thread_id: tid, sender: me(), body: body, created_at: new Date().toISOString(), pending: true };
    (C.msgs[tid] = C.msgs[tid] || []).push(tmp);
    ta.value = ''; window.bpTcGrow(ta); window.bpTcClearFile();
    paintMsgs(true);
    (file ? upload(file, tid) : Promise.resolve(null)).then(function (att) {
      return BP_SB.from('team_messages').insert({ thread_id: tid, sender: me(), body: body, attachment: att }).select('id,thread_id,sender,body,attachment,created_at').single();
    }).then(function (r) {
      if (r && r.error) throw r.error;
      var row = r && r.data, list = C.msgs[tid] || [];
      var i = list.indexOf(tmp);
      if (row && !list.some(function (m) { return m.id === row.id; })) { if (i >= 0) list[i] = row; else list.push(row); }
      else if (i >= 0) list.splice(i, 1);
      var t = byId(tid); if (t && row) { t.last_body = row.body; t.last_sender = row.sender; t.last_message_at = row.created_at; C.threads.sort(sortT); }
      paintList(); if (C.cur === tid) paintMsgs(true);
    }).catch(function (e) {
      var list = C.msgs[tid] || [], i = list.indexOf(tmp); if (i >= 0) list.splice(i, 1);
      if (C.cur === tid) { paintMsgs(true); var t2 = $('tcText'); if (t2 && !t2.value) t2.value = body; }
      toast('Message not sent' + (e && e.message ? ': ' + e.message : ''));
    }).then(function () { C.sending = false; });
  };
  function sortT(a, b) { return String(b.last_message_at || b.created_at || '').localeCompare(String(a.last_message_at || a.created_at || '')); }

  /* ---------- live updates ---------- */
  function onMsg(m) {
    if (!m || !m.thread_id) return;
    var t = byId(m.thread_id);
    if (!t) { loadThreads().then(paintList); return; }
    var list = C.msgs[m.thread_id];
    if (list && !list.some(function (x) { return x.id === m.id; })) {
      var pi = -1; list.forEach(function (x, i) { if (x.pending && x.sender === m.sender && x.body === m.body) pi = i; });
      if (pi >= 0) list[pi] = m; else list.push(m);
    }
    t.last_body = m.body; t.last_sender = m.sender; t.last_message_at = m.created_at;
    if (m.sender !== me()) {
      if (m.thread_id === C.cur && $('tcRoot') && !document.hidden && ($('tcRoot').classList.contains('tc-open') || !phone())) markRead(m.thread_id);
      else t.unread = (t.unread || 0) + 1;
    }
    C.threads.sort(sortT);
    paintList(); if (m.thread_id === C.cur) paintMsgs(false);
    paintBadge(C.threads.reduce(function (s, x) { return s + (x.unread || 0); }, 0));
  }
  function refresh() {
    if (!$('tcRoot')) { stop(); return; }
    loadThreads().then(function () {
      paintList();
      if (C.cur && byId(C.cur)) return loadMsgs(C.cur).then(function () {
        paintMsgs(false);
        var t = byId(C.cur); if (t && t.unread && !document.hidden) markRead(C.cur);
      });
    }).catch(function () {});
  }
  function start() {
    C.guard = setInterval(function () { if (!$('tcRoot')) stop(); }, 1500);
    var poll = function () { if (!C.poll) C.poll = setInterval(function () { if (!document.hidden) refresh(); }, 5000); };
    try {
      if (!BP_SB.channel) { poll(); return; }
      C.ch = BP_SB.channel('team-chat-' + (me() || 'x'))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, function (p) { onMsg(p && p.new); })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') { C.rt = true; if (C.poll) { clearInterval(C.poll); C.poll = null; } }
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { C.rt = false; if ($('tcRoot')) poll(); }
        });
      setTimeout(function () { if (!C.rt && $('tcRoot')) poll(); }, 4000);
    } catch (e) { poll(); }
  }
  function stop() {
    if (C.poll) { clearInterval(C.poll); C.poll = null; }
    if (C.guard) { clearInterval(C.guard); C.guard = null; }
    if (C.ch) { try { BP_SB.removeChannel(C.ch); } catch (e) {} C.ch = null; }
    C.rt = false;
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && $('tcRoot')) refresh(); });

  /* ---------- owner: groups and direct lines ---------- */
  function pickList(sel, cls) {
    var ps = (C.people || []).filter(function (p) { return p.user_id !== me(); });
    if (!ps.length) return '<div class="tc-note">Nobody else signs in yet. Invite people under Settings › Team, or give an employee a login.</div>';
    return '<div class="tc-pick">' + ps.map(function (p) {
      return '<label class="tc-pr"><input type="checkbox" class="' + cls + '" value="' + esc(p.user_id) + '"' + (sel[p.user_id] ? ' checked' : '') + '>'
        + '<span class="tc-av sm" style="--c:' + hue(p.user_id) + '">' + esc(initials(p.name)) + '</span><span><b>' + esc(p.name) + '</b><small>' + esc(p.role === 'office' ? 'Office' : p.role === 'owner' ? 'Owner' : 'Crew') + '</small></span></label>';
    }).join('') + '</div>';
  }
  window.bpTcGroup = function (id) {
    var t = id ? byId(id) : null;
    loadPeople().then(function () {
      var sel = {}; ((t && t.members) || []).forEach(function (m) { sel[m.user_id] = 1; });
      bpModal('<h3>' + (t ? 'Group settings' : 'New group') + '</h3><div class="bpx-sub">' + (t ? 'Rename it or change who is in it.' : 'Name it and pick who is in it. You are always in your groups.') + '</div>'
        + '<label>Group name</label><input id="tcGName" maxlength="80" placeholder="e.g. Hamilton roof crew" value="' + esc(t ? t.name : '') + '">'
        + '<label>People</label>' + pickList(sel, 'tc-gm')
        + '<div class="tc-mf">' + (t ? '<button type="button" class="bpx-btn ghost tc-del" onclick="bpTcDelete(\'' + t.id + '\')">Delete group</button>' : '<span></span>')
        + '<span style="display:flex;gap:10px"><button type="button" class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button>'
        + '<button type="button" class="bpx-btn" id="tcGGo" onclick="bpTcGroupSave(' + (t ? "'" + t.id + "'" : '') + ')">' + (t ? 'Save' : 'Create group') + '</button></span></div>');
      setTimeout(function () { var n = $('tcGName'); if (n) n.focus(); }, 30);
    });
  };
  window.bpTcGroupSave = function (id) {
    var name = (($('tcGName') || {}).value || '').trim();
    if (!name) { toast('Give the group a name'); return; }
    var ids = Array.prototype.map.call(document.querySelectorAll('.tc-gm:checked'), function (c) { return c.value; });
    var go = $('tcGGo'); if (go) go.disabled = true;
    var job = id
      ? Promise.resolve(BP_SB.from('team_threads').update({ name: name, updated_at: new Date().toISOString() }).eq('id', id)).then(function (r) { if (r && r.error) throw r.error; return rpc('team_chat_set_members', { p_thread: id, p_members: ids }); }).then(function () { return id; })
      : rpc('team_chat_create_group', { p_name: name, p_members: ids });
    job.then(function (tid) {
      bpCloseModal(); toast(id ? 'Group saved' : 'Group created');
      return loadThreads().then(function () { paintList(); open(tid); });
    }).catch(function (e) { if (go) go.disabled = false; toast((e && e.message) || 'Could not save the group'); });
  };
  window.bpTcDelete = function (id) {
    var t = byId(id); if (!t) return;
    bpModal('<h3>Delete “' + esc(t.name) + '”?</h3><div class="bpx-sub">Every message in it goes too, for everyone. This cannot be undone.</div>'
      + '<div class="tc-mf"><span></span><span style="display:flex;gap:10px"><button type="button" class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button>'
      + '<button type="button" class="bpx-btn tc-danger" onclick="bpTcDeleteGo(\'' + id + '\')">Delete group</button></span></div>');
  };
  window.bpTcDeleteGo = function (id) {
    Promise.resolve(BP_SB.from('team_threads').delete().eq('id', id)).then(function (r) {
      if (r && r.error) throw r.error;
      bpCloseModal(); delete C.msgs[id];
      C.threads = C.threads.filter(function (t) { return t.id !== id; });
      if (C.cur === id) { C.cur = null; var p = $('tcPane'); if (p) p.innerHTML = '<div class="tc-zero"><b>Group deleted</b></div>'; var r2 = $('tcRoot'); if (r2) r2.classList.remove('tc-open'); }
      paintList(); toast('Group deleted');
    }).catch(function (e) { toast((e && e.message) || 'Could not delete'); });
  };
  window.bpTcNewDirect = function (btn) {
    loadPeople().then(function () {
      var ps = (C.people || []).filter(function (p) { return p.user_id !== me(); });
      var items = ps.length ? ps.map(function (p) { return { t: p.name, ico: 'user', right: '<small>' + esc(p.role === 'office' ? 'Office' : 'Crew') + '</small>', fn: function () { window.bpTcDirect(p.user_id); } }; })
        : [{ t: 'Nobody else signs in yet', ico: 'team', fn: function () { bpNav('settings'); } }];
      if (window.bpShell && bpShell.menu) bpShell.menu(btn, [{ label: 'Message someone' }].concat(items), { align: 'left' });
      else if (ps[0]) window.bpTcDirect(ps[0].user_id);
    });
  };
  window.bpTcDirect = function (uid) {
    rpc('team_chat_open_direct', { p_other: uid }).then(function (tid) {
      return loadThreads().then(function () { paintList(); open(tid); });
    }).catch(function (e) { toast((e && e.message) || 'Could not open that chat'); });
  };

  /* badge on first load, once the portal knows who is signed in */
  setTimeout(function () { window.bpTeamChatBadge(); }, 4000);
})();
