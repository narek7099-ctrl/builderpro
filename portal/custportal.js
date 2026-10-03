/* ==================================================================
   Customer portal: the owner's side (project sheet, "Customer" tab).

   The homeowner opens builderpro-os.com/#home=<token> (index.html,
   bpHomeRoute) and talks only to the customer-portal edge function. Here
   the owner and office manage it through RLS on three tables
   (supabase/migrations/20261006000000_customer_portal.sql):
     customer_portal_links   the link: on/off, regenerate, last viewed,
                             which photos and documents are shared
     customer_messages       the thread with the homeowner
     customer_change_orders  changes sent for the homeowner to approve

   Approved change orders raise the job's contract total (estimate). That
   happens here, in the owner's own save, not in the function: the job
   remembers which ones it added (job.custCoApplied), so adding is
   idempotent and a stale save can never add one twice or lose it; the
   homeowner's page counts any not yet added on top of the estimate, so
   both sides show the same total in the meantime.

   Without a live account the same screens run on a local copy (demo).
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var escA = function (s) { return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var $ = function (id) { return document.getElementById(id); };
  var arr = function (x) { return Array.isArray(x) ? x : []; };
  var money = function (n) { n = +n || 0; return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var BASE = 'https://builderpro-os.com/';
  /* the homeowner's "Request a change" (Changes tab on their page) arrives as
     a message starting with this; shown here as a card that starts a CO */
  var REQ = /^change request:\s*/i;
  function isReq(m) { return !!(m && m.from_customer && REQ.test(m.body || '')); }
  var C = { job: null, link: null, msgs: [], cos: [], unread: {} };

  function isCrew() { return !!(window.bpTeamIsCrew && bpTeamIsCrew()); }
  function live() { return !!(window.BP_LIVE && window.BP_SB); }
  function ownerId() { return (window.bpOwnerId && bpOwnerId()) || undefined; }
  function jobById(id) { return (window.bpJobsGet ? bpJobsGet() : []).filter(function (x) { return x.id === id; })[0]; }
  function toast(t, k) { if (window.bpToast) bpToast(t, k); }
  function hex(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : hex(4) + '-' + hex(2) + '-4' + hex(2).slice(1) + '-a' + hex(2).slice(1) + '-' + hex(6); }
  function ago(t) {
    if (!t) return 'not opened yet';
    var s = (Date.now() - Date.parse(t)) / 1000;
    return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* ------------------------------------------------ data: live or demo --- */
  var DEMO_KEY = 'bpCustDemo';
  function demo() { var d; try { d = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) {} return d || { links: [], customer_messages: [], customer_change_orders: [] }; }
  function demoSave(d) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch (e) {} }
  var TBL = { customer_portal_links: 'links', customer_messages: 'customer_messages', customer_change_orders: 'customer_change_orders' };
  function match(r, f) { return Object.keys(f).every(function (k) { return f[k] === null ? r[k] == null : r[k] === f[k]; }); }
  function eqs(q, f) { Object.keys(f).forEach(function (k) { q = f[k] === null ? q.is(k, null) : q.eq(k, f[k]); }); return q; }
  var DB = {
    sel: function (t, f) {
      if (!live()) return Promise.resolve(demo()[TBL[t]].filter(function (r) { return match(r, f); }));
      return Promise.resolve(eqs(BP_SB.from(t).select('*'), f)).then(function (r) { if (r && r.error) throw r.error; return arr(r && r.data); });
    },
    ins: function (t, row) {
      if (!live()) {
        var d = demo(), r = Object.assign({ id: uuid(), created_at: new Date().toISOString() }, row);
        if (t === 'customer_portal_links') Object.assign(r, { token: hex(24), enabled: true, share_photos: [], share_docs: [], last_seen_at: null });
        if (t === 'customer_change_orders') r.status = 'pending';
        d[TBL[t]].push(r); demoSave(d); return Promise.resolve(r);
      }
      return Promise.resolve(BP_SB.from(t).insert(Object.assign({ owner: ownerId() }, row)).select('*').single()).then(function (r) { if (r && r.error) throw r.error; return r.data; });
    },
    upd: function (t, f, p) {
      if (!live()) {
        var d = demo(), out = [];
        d[TBL[t]].forEach(function (r) { if (match(r, f)) { Object.assign(r, p); out.push(r); } });
        demoSave(d); return Promise.resolve(out);
      }
      return Promise.resolve(eqs(BP_SB.from(t).update(p), f).select('*')).then(function (r) { if (r && r.error) throw r.error; return arr(r && r.data); });
    }
  };

  /* -------------------------------------------- approved changes → total --- */
  /* add each approved change order to its job once; the job remembers */
  var applying = false;
  window.bpCustApply = function () {
    if (applying || isCrew() || !window.bpJobsGet) return Promise.resolve(0);
    applying = true;
    return DB.sel('customer_change_orders', { status: 'approved' }).then(function (rows) {
      var all = bpJobsGet(), n = 0, mark = [];
      rows.forEach(function (c) {
        var j = all.filter(function (x) { return x.id === c.job_id; })[0]; if (!j) return;
        j.custCoApplied = arr(j.custCoApplied);
        if (j.custCoApplied.indexOf(c.id) < 0) {
          j.estimate = Math.round(((+j.estimate || 0) + (+c.amount || 0)) * 100) / 100;
          j.custCoApplied.push(c.id); n++;
          /* the open sheet keeps its own copy of the estimate until Save */
          if (window._bpProjId === j.id && $('bpx-pj-est')) { $('bpx-pj-est').value = window.bpMoneyFmt ? bpMoneyFmt(j.estimate) : j.estimate; if (window.bpProjBal) try { bpProjBal(); } catch (e) {} }
          toast('“' + c.title + '” was approved by the homeowner. ' + money(c.amount) + ' added to the contract.');
        }
        if (!c.applied_at) mark.push(c.id);
      });
      if (n) bpJobsSet(all);
      mark.forEach(function (id) { DB.upd('customer_change_orders', { id: id, applied_at: null }, { applied_at: new Date().toISOString() }).catch(function () {}); });
      return n;
    }).catch(function () { return 0; }).then(function (n) { applying = false; return n; });
  };

  /* ------------------------------------------------------------ the tab --- */
  window.bpCustTabOpen = function (j) {
    if (isCrew() || !j) return;
    C.job = j.id;
    var h = $('bpx-pj-cust'); if (h && !C.link) h.innerHTML = '<section class="pjs-sec"><div class="bpx-mut">Loading…</div></section>';
    return Promise.all([
      DB.sel('customer_portal_links', { job_id: j.id }),
      DB.sel('customer_messages', { job_id: j.id }),
      DB.sel('customer_change_orders', { job_id: j.id }),
      window.bpCustApply()
    ]).then(function (r) {
      if (C.job !== j.id) return;
      C.link = r[0][0] || null;
      C.msgs = r[1].slice().sort(function (a, b) { return Date.parse(a.created_at) - Date.parse(b.created_at); });
      C.cos = r[2].slice().sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); });
      draw();
    }).catch(function (e) {
      if (h) h.innerHTML = '<section class="pjs-sec"><div class="bpx-mut">Couldn’t load the customer portal. ' + esc((e && e.message) || '') + '</div></section>';
    });
  };
  /* reading the thread marks the homeowner's messages read */
  function markRead() {
    var un = C.msgs.filter(function (m) { return m.from_customer && !m.read_at; });
    if (!un.length) return;
    var now = new Date().toISOString();
    un.forEach(function (m) { m.read_at = now; });
    DB.upd('customer_messages', { job_id: C.job, from_customer: true, read_at: null }, { read_at: now }).catch(function () {});
    badge(0);
  }
  function badge(n) {
    var b = document.querySelector('[data-pj-tab="cust"] .pjs-n');
    if (b) { b.textContent = n ? String(n) : ''; b.classList.toggle('cp-hot', !!n); }
  }
  function linkUrl() { return C.link ? BASE + '#home=' + C.link.token : ''; }

  function draw() {
    var h = $('bpx-pj-cust'), j = jobById(C.job); if (!h || !j) return;
    var L = C.link, url = linkUrl(), ph = (j.phone || '').replace(/[^\d+]/g, ''), first = String(j.name || '').trim().split(/\s+/)[0] || '';
    var msg = 'Hi ' + first + ', here’s your project page with photos, schedule, payments and messages: ' + url;
    var sp = arr(L && L.share_photos), sd = arr(L && L.share_docs);
    var unread = C.msgs.filter(function (m) { return m.from_customer && !m.read_at; }).length;
    var linkSec = '<section class="pjs-sec"><div class="pjs-h">Homeowner link</div>'
      + (!L ? '<div class="pjs-empty sm"><span class="ms">home</span><b>Give ' + esc(first || 'the homeowner') + ' a page for this job</b><p>A private link, no password. They see progress, the schedule, the photos and documents you share, what’s paid and due, and can message you and approve changes. Never your costs, your crew’s phones or your subs.</p>'
          + '<button type="button" class="pm-btn" onclick="bpCustCreate()"><span class="ms">add_link</span>Create link</button></div>'
        : '<div class="cp-link' + (L.enabled ? '' : ' off') + '"><span class="ms">' + (L.enabled ? 'link' : 'link_off') + '</span><code>' + esc(url) + '</code></div>'
          + '<div class="cp-meta">' + (L.enabled ? '<span class="cp-dot on"></span>On' : '<span class="cp-dot"></span>Turned off. The link shows nothing') + ' · Last viewed ' + esc(ago(L.last_seen_at)) + '</div>'
          + (L.enabled ? '<div class="cp-acts"><button type="button" class="bpx-btn" onclick="bpCustCopy(this)"><span class="ms">content_copy</span>Copy link</button>'
            + (ph ? '<a class="bpx-btn ghost" href="sms:' + escA(ph) + '?&body=' + escA(encodeURIComponent(msg)) + '"><span class="ms">sms</span>Text link</a>' : '')
            + (j.email ? '<a class="bpx-btn ghost" href="mailto:' + escA(j.email) + '?subject=' + escA(encodeURIComponent('Your project page')) + '&body=' + escA(encodeURIComponent(msg)) + '"><span class="ms">mail</span>Email link</a>' : '')
            + '<a class="bpx-btn ghost" href="' + escA(url) + '" target="_blank" rel="noopener"><span class="ms">visibility</span>Preview</a></div>' : '')
          + '<div class="cp-acts sm"><button type="button" class="bpx-rowbtn" onclick="bpCustToggle()">' + (L.enabled ? 'Turn off' : 'Turn on') + '</button><button type="button" class="bpx-rowbtn" onclick="bpCustRegen()">New link</button><span class="bpx-mut">A new link stops the old one working.</span></div>')
      + '</section>';
    var photos = arr(j.photos), docs = arr(j.docs);
    var shareSec = !L ? '' : '<section class="pjs-sec"><div class="pjs-h">Shared with the homeowner</div>'
      + '<div class="cp-sub">Photos <span class="bpx-mut">' + sp.filter(function (r) { return photos.indexOf(r) >= 0; }).length + ' of ' + photos.length + ' shared · tap to share</span></div>'
      + (photos.length ? '<div class="cp-ph">' + photos.map(function (p, i) {
          var on = sp.indexOf(p) >= 0;
          return '<button type="button" class="cp-pht' + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="bpCustShare(\'photo\',' + i + ')">'
            + (window.bpPF ? bpPF.img(p, 'alt=""') : '<img src="' + escA(p) + '" alt="">') + '<span class="ms">' + (on ? 'visibility' : 'visibility_off') + '</span></button>';
        }).join('') + '</div>' : '<div class="bpx-mut cp-none">No photos on this job yet.</div>')
      + '<div class="cp-sub">Documents</div>'
      + (docs.length ? docs.map(function (d, i) {
          var on = sd.indexOf(d.d) >= 0;
          return '<label class="cp-doc"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="bpCustShare(\'doc\',' + i + ')"><span>' + esc(d.n || 'Document') + '</span><em>' + (on ? 'Shared' : 'Private') + '</em></label>';
        }).join('') : '<div class="bpx-mut cp-none">No documents on this job yet. Permits, warranties and the like go in Documents.</div>')
      + '<div class="bpx-mut cp-none">Contracts you send show on their page by themselves. Money shows as contract total, paid and balance only.</div></section>';
    var msgSec = !L ? '' : '<section class="pjs-sec"><div class="pjs-h">Messages' + (unread ? ' <span class="cp-new">' + unread + ' new</span>' : '') + '</div>'
      + '<div class="cp-thread" id="cp-thread">' + (C.msgs.length ? C.msgs.map(function (m) {
          if (isReq(m)) return reqCard(m, first);
          return '<div class="cp-msg' + (m.from_customer ? '' : ' me') + '"><div>' + esc(m.body).replace(/\n/g, '<br>') + '</div><small>' + (m.from_customer ? esc(first || 'Homeowner') : 'You') + ' · ' + esc(new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + (!m.from_customer && m.read_at ? ' · Seen' : '') + '</small></div>';
        }).join('') : '<div class="bpx-mut">No messages yet. The homeowner can write to you from their page.</div>') + '</div>'
      + '<div class="cp-send"><textarea id="cp-msg" rows="2" maxlength="4000" placeholder="Write to ' + escA(first || 'the homeowner') + '…"></textarea><button type="button" class="bpx-btn" onclick="bpCustSend()"><span class="ms">send</span>Send</button></div>'
      + '<div class="bpx-mut cp-none">They see it next time they open their page. Text them the link if it’s urgent.</div></section>';
    var st = { pending: ['Waiting on homeowner', 'warn'], approved: ['Approved', 'ok'], declined: ['Declined', 'bad'], 'void': ['Withdrawn', ''] };
    var reqs = C.msgs.filter(isReq).slice(-3).reverse();
    var coSec = !L ? '' : '<section class="pjs-sec" id="cp-cosec"><div class="cp-coh"><div class="pjs-h">Change orders for the homeowner</div>'
      + '<button type="button" class="bpx-btn" id="cp-coadd" onclick="bpCustCoForm()"><span class="ms">add</span>New change order</button></div>'
      + (reqs.length ? '<div class="cp-sub">Requested by ' + esc(first || 'the homeowner') + '</div>' + reqs.map(function (m) { return reqCard(m, first); }).join('') + '<div class="cp-sec-gap"></div>' : '')
      + (C.cos.length ? C.cos.map(function (c) {
          var s = st[c.status] || [c.status, ''];
          return '<div class="cp-co"><div class="cp-co-h"><div><b>' + esc(c.title) + '</b><span>' + money(c.amount) + ' · sent ' + esc(new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + '</span></div><em class="cp-st ' + s[1] + '">' + s[0] + '</em></div>'
            + (c.description ? '<p>' + esc(c.description) + '</p>' : '')
            + (c.status === 'approved' ? '<div class="cp-sig">' + (c.signature ? '<img src="' + escA(c.signature) + '" alt="signature">' : '') + '<div><b>' + esc(c.signer_name || '') + '</b><span>Signed ' + esc(new Date(c.signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })) + (c.ip ? ' · IP ' + esc(c.ip) : '') + '</span><span>' + (arr(j.custCoApplied).indexOf(c.id) >= 0 ? 'Added to the contract total' : 'Adding to the contract total…') + '</span></div></div>' : '')
            + (c.status === 'declined' ? '<div class="bpx-mut">Declined ' + esc(new Date(c.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + (c.decline_note ? ': “' + esc(c.decline_note) + '”' : '') + '</div>' : '')
            + (c.status === 'pending' ? '<div class="cp-acts sm"><button type="button" class="bpx-rowbtn" onclick="bpCustCoVoid(\'' + c.id + '\')">Withdraw</button></div>' : '')
            + '</div>';
        }).join('') : '<div class="bpx-mut cp-none">None yet. Extra work or a price change? Send it here and they approve it with a signature on their phone.</div>')
      + '<div id="cp-coform"></div></section>';
    h.innerHTML = logoNudge() + linkSec + shareSec + coSec + msgSec;
    badge(unread);
    var tb = $('cp-thread'); if (tb) tb.scrollTop = tb.scrollHeight;
    if (window.bpPF && bpPF.hydrate) try { bpPF.hydrate(h); } catch (e) {}
    var pane = h.closest('[data-pj-pane]'); if (pane && !pane.hidden) markRead();
  }
  window.bpCustDraw = draw;

  /* no logo yet: the homeowner's page shows initials. A quiet, dismissible
     pointer to Settings, once per device. */
  var NUDGE_KEY = 'bpCustLogoNudgeOff';
  function hasLogo() { var c = ((window.bpSettingsGet ? bpSettingsGet() : {}) || {}).company || {}; return !!(c.logo || c.logoUrl); }
  function logoNudge() {
    var off = false; try { off = localStorage.getItem(NUDGE_KEY) === '1'; } catch (e) {}
    if (off || hasLogo()) return '';
    return '<div class="cp-nudge" id="cp-lognudge" role="note"><span class="ms">add_photo_alternate</span>'
      + '<div><b>Your logo isn’t set</b><span>The homeowner’s page, contracts and review page show your logo and brand colour. </span>'
      + '<button type="button" class="cp-nudge-go" onclick="bpCustLogoGo()">Add it in Settings</button></div>'
      + '<button type="button" class="cp-nudge-x" aria-label="Dismiss" onclick="bpCustLogoDismiss()"><span class="ms">close</span></button></div>';
  }
  window.bpCustLogoDismiss = function () { try { localStorage.setItem(NUDGE_KEY, '1'); } catch (e) {} var n = $('cp-lognudge'); if (n) n.remove(); };
  window.bpCustLogoGo = function () {
    if (window.bpCloseModal) try { bpCloseModal(); } catch (e) {}
    window._bpSetSec = 'business';
    if (window.bpNav) bpNav('settings');
  };
  function reqCard(m, first) {
    return '<div class="cp-req"><div class="cp-req-h"><span class="ms">edit_note</span><b>Change request from ' + esc(first || 'the homeowner') + '</b><small>' + esc(new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</small></div>'
      + '<p>' + esc(String(m.body || '').replace(REQ, '')).replace(/\n/g, '<br>') + '</p>'
      + '<button type="button" class="bpx-btn" onclick="bpCustCoFromMsg(\'' + escA(m.id) + '\')"><span class="ms">post_add</span>Create change order from this</button></div>';
  }
  window.bpCustCoFromMsg = function (id) {
    var m = C.msgs.filter(function (x) { return String(x.id) === String(id); })[0]; if (!m) return;
    var txt = String(m.body || '').replace(REQ, '').trim(), line = txt.split(/\n/)[0];
    window.bpCustCoForm({ title: line.length > 80 ? line.slice(0, 77).replace(/\s+\S*$/, '') + '…' : line, desc: 'Requested by the homeowner: ' + txt });
  };

  window.bpCustCreate = function () {
    DB.ins('customer_portal_links', { job_id: C.job }).then(function (r) { C.link = r; draw(); toast('Link created. Copy it or text it to the homeowner.'); })
      .catch(function (e) { toast('Couldn’t create the link: ' + ((e && e.message) || 'error'), 'warning'); });
  };
  function updLink(p, ok) {
    return DB.upd('customer_portal_links', { job_id: C.job }, p).then(function (r) { if (r[0]) C.link = r[0]; else Object.assign(C.link, p); draw(); if (ok) toast(ok); })
      .catch(function (e) { toast('Couldn’t save: ' + ((e && e.message) || 'error'), 'warning'); });
  }
  window.bpCustToggle = function () { updLink({ enabled: !C.link.enabled }, C.link.enabled ? 'Link turned off.' : 'Link is on again.'); };
  window.bpCustRegen = function () {
    if (!confirm('Make a new link? The old one stops working right away, so send the new one to the homeowner.')) return;
    updLink({ token: hex(24), enabled: true, last_seen_at: undefined }, 'New link ready. The old one no longer works.');
  };
  window.bpCustCopy = function (btn) {
    var u = linkUrl();
    if (window.bpCtCopy) { bpCtCopy(u, null); } else try { navigator.clipboard.writeText(u); } catch (e) {}
    if (btn) { var t = btn.innerHTML; btn.innerHTML = '<span class="ms">check</span>Copied'; setTimeout(function () { btn.innerHTML = t; }, 1600); }
  };
  window.bpCustShare = function (kind, i) {
    var j = jobById(C.job); if (!j || !C.link) return;
    var key = kind === 'photo' ? 'share_photos' : 'share_docs';
    var ref = kind === 'photo' ? arr(j.photos)[i] : (arr(j.docs)[i] || {}).d;
    if (!ref) return;
    if (!/^sb:|^https:/.test(ref) && window.BP_LIVE) { toast('That file is still uploading. Try again in a moment.', 'warning'); draw(); return; }
    var list = arr(C.link[key]).slice(), k = list.indexOf(ref);
    if (k >= 0) list.splice(k, 1); else list.push(ref);
    /* drop anything no longer on the job */
    var still = kind === 'photo' ? arr(j.photos) : arr(j.docs).map(function (d) { return d.d; });
    list = list.filter(function (r) { return still.indexOf(r) >= 0; });
    var p = {}; p[key] = list; updLink(p);
  };
  window.bpCustSend = function () {
    var t = $('cp-msg'), v = (t && t.value || '').trim(); if (!v) return;
    var co = ((window.bpSettingsGet && bpSettingsGet().company) || {}).name || '';
    DB.ins('customer_messages', { job_id: C.job, body: v, author: co }).then(function (r) { C.msgs.push(r); draw(); })
      .catch(function (e) { toast('Couldn’t send: ' + ((e && e.message) || 'error'), 'warning'); });
  };
  window.bpCustCoForm = function (pre) {
    var h = $('cp-coform'); if (!h) return;
    pre = pre && typeof pre === 'object' ? pre : {};
    h.innerHTML = '<div class="cm-form"><div class="cm-h">New change order</div>'
      + '<label>What’s changing<input id="cp-co-t" maxlength="200" placeholder="e.g. Replace 3 sheets of rotted decking" value="' + escA(pre.title || '') + '"></label>'
      + '<label>Details<textarea id="cp-co-d" rows="3" maxlength="4000" placeholder="What you found, what you’ll do, any effect on the schedule">' + esc(pre.desc || '') + '</textarea></label>'
      + '<label>Price change<input id="cp-co-a" inputmode="decimal" placeholder="e.g. 450 (use -150 for a credit)"></label>'
      + '<div class="bpx-mut" style="font-size:12px">The homeowner approves it on their page with a drawn signature. Once approved it’s added to this job’s contract total.</div>'
      + '<div class="ca-msg" id="cp-co-msg"></div>'
      + '<div class="sa-fa"><button class="bpx-btn ghost" onclick="bpCustCoCancel()">Cancel</button><button class="bpx-btn" onclick="bpCustCoSave()">Send to homeowner</button></div></div>';
    ['cp-coadd'].forEach(function (k) { var x = $(k); if (x) x.hidden = true; });
    if (h.scrollIntoView) h.scrollIntoView({ block: 'center', behavior: 'smooth' });
    var f = pre.title ? $('cp-co-a') : $('cp-co-t'); if (f) f.focus({ preventScroll: true });
  };
  window.bpCustCoCancel = function () {
    var h = $('cp-coform'); if (h) h.innerHTML = '';
    ['cp-coadd'].forEach(function (k) { var x = $(k); if (x) x.hidden = false; });
  };
  window.bpCustCoSave = function () {
    var t = String(($('cp-co-t') || {}).value || '').trim(), d = String(($('cp-co-d') || {}).value || '').trim();
    var a = String(($('cp-co-a') || {}).value || '').replace(/[$,\s]/g, ''), m = $('cp-co-msg');
    var bad = function (x) { if (m) { m.className = 'ca-msg bad'; m.textContent = x; } };
    if (!t) return bad('Give it a short title.');
    if (!/^-?\d{1,7}(\.\d{1,2})?$/.test(a)) return bad('Price change has to be a number, like 450 or -150.');
    DB.ins('customer_change_orders', { job_id: C.job, title: t, description: d, amount: +a }).then(function (r) {
      C.cos.unshift(r); draw(); toast('Sent. It’s waiting on the homeowner’s page.');
    }).catch(function (e) { bad('Couldn’t send: ' + ((e && e.message) || 'error')); });
  };
  window.bpCustCoVoid = function (id) {
    if (!confirm('Withdraw this change order? The homeowner will no longer see it.')) return;
    DB.upd('customer_change_orders', { id: id, status: 'pending' }, { status: 'void' }).then(function (r) {
      if (!r.length) { toast('The homeowner already answered it.', 'warning'); return window.bpCustTabOpen(jobById(C.job)); }
      C.cos.forEach(function (c) { if (c.id === id) c.status = 'void'; }); draw();
    }).catch(function (e) { toast('Couldn’t withdraw: ' + ((e && e.message) || 'error'), 'warning'); });
  };

  /* approved change orders land in the total soon after the portal opens */
  setTimeout(function () { if (live() && !isCrew()) window.bpCustApply(); }, 6000);
})();
