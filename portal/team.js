/* ==================================================================
   Team: who else can sign in, and what they can see.

   One account, several people. The owner invites by email and picks a
   role. Office sees what the owner sees, except billing and this page.
   Crew sees projects, the calendar and materials, and nothing about money.

   On every sign-in, before anything loads, we find out whose account this
   session works on (bpTeamResolve). From then on writes are stamped with
   that owner and the sidebar shows only what the role allows.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.bpEsc;
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var T = window.BP_TEAM = { owner: null, role: 'owner', name: '', ownerEmail: '', uid: null, members: null, busy: false };
  window.TEAM_URL = (window.BP_URL || '') + '/functions/v1/team-invite';

  /* the id every write is stamped with: the owner's, never the member's */
  window.bpOwnerId = function (u) { return T.owner || (u && u.id) || T.uid || null; };

  /* what each role may open */
  var CREW = { dashboard: 1, activejobs: 1, calendar: 1, supply: 1, supplyorders: 1, suppliers: 1, messaging: 1, email: 1, contacts: 1 };
  window.bpTeamAllows = function (view) {
    if (T.role === 'crew') return !!CREW[view];
    return true;
  };
  window.bpTeamIsCrew = function () { return T.role === 'crew'; };
  window.bpTeamIsOwner = function () { return T.role === 'owner'; };

  /* who am I working for? asked once per sign-in, before data loads */
  window.bpTeamResolve = function () {
    T.owner = null; T.role = 'owner'; T.name = ''; T.ownerEmail = '';
    if (!live()) return Promise.resolve(T);
    return window.bpSetUser().then(function (u) {
      if (!u) return T;
      T.uid = u.id;
      return BP_SB.rpc('bp_team_claim').then(function (r) {
        var row = r && r.data && r.data[0];
        if (row) { T.owner = row.owner; T.role = row.role === 'office' ? 'office' : 'crew'; T.name = row.name || ''; T.ownerEmail = row.owner_email || ''; }
        return T;
      }).catch(function () { return T; });
    }).catch(function () { return T; });
  };

  /* the sidebar footer says who you are working as */
  window.bpTeamStamp = function () {
    var el = $('bpxUemail'); if (!el || T.role === 'owner') return;
    el.innerHTML = esc(el.textContent) + '<span class="tm-as">' + (T.role === 'office' ? 'Office' : 'Crew') + (T.ownerEmail ? ' at ' + esc(T.ownerEmail) : '') + '</span>';
  };

  /* ---------- the Team page, inside Settings ---------- */
  window.bpTeamPanel = function () {
    if (T.role !== 'owner') return '<div class="bpx-panel"><div class="tm-note">You are signed in as ' + (T.role === 'office' ? 'office staff' : 'crew') + ' on this account. Only the owner can change the team.</div></div>';
    if (T.members === null && live() && !T.busy) load();
    var rows = T.members || [];
    var roleSel = function (m) { return '<select class="tm-role" onchange="bpTeamRole(\'' + m.id + '\',this.value)"><option value="office"' + (m.role === 'office' ? ' selected' : '') + '>Office</option><option value="crew"' + (m.role === 'crew' ? ' selected' : '') + '>Crew</option></select>'; };
    var list = !live() ? '<div class="tm-note">Sign in to add people to your account.</div>'
      : T.members === null ? '<div class="bpx-skel" style="width:60%"></div>'
      : !rows.length ? '<div class="tm-empty"><span class="ms">group_add</span><b>Just you so far.</b><span>Add your office and your crew leads below. Each one signs in with their own email and sees only what their role allows.</span></div>'
      : '<div class="tm-list">' + rows.map(function (m) {
        return '<div class="tm-row"><div class="tm-who"><b>' + esc(m.name || m.email) + '</b><span>' + esc(m.email) + ' &middot; ' + (m.joined ? 'signed in' : 'invited, not signed in yet') + '</span></div>'
          + roleSel(m)
          + '<div class="tm-acts">' + (m.joined ? '' : '<button class="bpx-linkbtn" onclick="bpTeamResend(\'' + m.id + '\')">Resend invite</button>') + '<button class="bpx-linkbtn tm-del" onclick="bpTeamRemove(\'' + m.id + '\',\'' + esc(m.name || m.email) + '\')">Remove</button></div></div>';
      }).join('') + '</div>';
    return '<div class="bpx-panel">'
      + '<div class="tm-roles"><div><b>Office</b><span>Everything you see, except billing and this page.</span></div><div><b>Crew</b><span>Projects, calendar, materials and messages. No money, no settings.</span></div></div>'
      + list + '</div>'
      + '<div class="bpx-panel"><div class="bpx-ptitle">Add someone<span class="lg2">they get an email with a link to set their password</span></div>'
      + '<div class="tm-form"><input id="tm-name" placeholder="Their name"><input id="tm-email" type="email" placeholder="their@email.com"><select id="tm-role"><option value="crew">Crew</option><option value="office">Office</option></select><button class="bpx-btn sp-inline" id="tm-add" onclick="bpTeamInvite()">Send invite</button></div>'
      + '<div class="bpx-mmsg" id="tm-msg"></div></div>';
  };
  function redraw() { var host = $('set-sec-team'); if (host) { var h = host.querySelector('.st-head'); host.innerHTML = (h ? h.outerHTML : '') + window.bpTeamPanel(); } }
  function msg(t, bad) { var e = $('tm-msg'); if (!e) return; e.textContent = t || ''; e.style.color = bad ? '#b3392f' : ''; }
  function call(body) { return Promise.resolve(window.bpAuthApi(window.TEAM_URL, body)); }
  function load() {
    T.busy = true;
    call({ op: 'list' }).then(function (r) { T.members = (r && r.ok && r.members) || []; }).catch(function () { T.members = []; }).then(function () { T.busy = false; redraw(); });
  }
  window.bpTeamInvite = function () {
    var name = ($('tm-name') || {}).value || '', email = (($('tm-email') || {}).value || '').trim(), role = ($('tm-role') || {}).value || 'crew';
    if (!email) { msg('Put in their email.', true); return; }
    var b = $('tm-add'); if (b) { b.disabled = true; b.textContent = 'Sending'; }
    call({ op: 'invite', email: email, name: name, role: role }).then(function (r) {
      if (!r || !r.ok) { msg((r && r.reason) || 'Could not send the invite.', true); return; }
      T.members = (T.members || []).concat([r.member]);
      redraw();
      msg(r.emailed ? 'Invite sent to ' + email + '. They tap the link, set a password, and they are in.'
        : r.note === 'already_has_account' ? email + ' already has a BuilderPro login. They just sign in and they are on your team.'
        : 'Added. The invite email did not go out (' + (r.note || 'unknown') + '), so tell them to sign in with that address.');
    }).catch(function () { msg('Could not reach the team service.', true); })
      .then(function () { if (b) { b.disabled = false; b.textContent = 'Send invite'; } });
  };
  window.bpTeamRole = function (id, role) {
    call({ op: 'role', id: id, role: role }).then(function (r) { if (r && r.ok) { (T.members || []).forEach(function (m) { if (m.id === id) m.role = role; }); msg('Saved. It applies the next time they sign in.'); } else msg('Could not change the role.', true); });
  };
  window.bpTeamRemove = function (id, who) {
    if (!window.bpAskDel(who + ' from your team', 'They lose access the next time they open the app.')) return;
    call({ op: 'remove', id: id }).then(function (r) { if (r && r.ok) { T.members = (T.members || []).filter(function (m) { return m.id !== id; }); redraw(); } else msg('Could not remove them.', true); });
  };
  window.bpTeamResend = function (id) {
    call({ op: 'resend', id: id }).then(function (r) { msg(r && r.ok ? (r.emailed ? 'Sent again.' : 'They already have a login; they just sign in.') : 'Could not resend.', !(r && r.ok)); });
  };
})();
