/* ==================================================================
   The subcontractor's own BuilderPro.

     Jobs           the jobs the owner put them on. Tapping one opens a
                    read-only job sheet: Overview (address + map, scope,
                    site contact), Schedule, Photos and Documents (they can
                    add), Blueprints, Permits, Money (agreed price, change
                    orders, invoiced, paid, owed).
     Invoices       submit an invoice (amount, note, file), follow its
                    status, sign / upload the lien waiver when required
     Change orders  ask for more (or less) money for a change in scope
     Compliance     certificate of insurance, license, W-9 with expiry
     Messages       portal/teamchat.js (the crewmsgs view)
     My company     their card, rating, and the contractor they work for

   Everything comes from sub_me() and the sub_* functions in
   supabase/migrations/20261004000000_subcontractors.sql, where the limits
   live: a sub never receives the homeowner's name, phone or email, the
   owner's estimate or costs, other subs, or crew pay. Files go to the
   private project-files bucket under <owner>/<job>/subs/<subId>/ and
   <owner>/subs/<subId>/, the only folders a sub may write to.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = window.BP_SUBAPP = { me: null, busy: null, job: null, tab: 'details', form: null };
  var BUCKET = 'project-files';

  function area() { return $('bpxViewArea'); }
  function rpcRes(r) { if (r && r.error) throw r.error; return (r && r.data) || {}; }
  function load(force) {
    if (S.me && !force) return Promise.resolve(S.me);
    if (S.busy && !force) return S.busy;
    S.busy = Promise.resolve(BP_SB.rpc('sub_me')).then(function (r) {
      S.busy = null;
      if (r && r.error) throw r.error;
      S.me = r.data || {}; paintMe(); return S.me;
    }, function (e) { S.busy = null; throw e; });
    return S.busy;
  }
  function wait() { var a = area(); if (a) a.innerHTML = '<div class="bpx-panel"><div class="bpx-mut" style="font-size:14px">Loading…</div></div>'; }
  function fail() { var a = area(); if (a) a.innerHTML = '<div class="bpx-panel"><div class="bpx-empty2">Couldn’t load this just now. Check your signal and try again.</div></div>'; }
  function done() { if (window.bpSpin) bpSpin(false); }
  function jobs() { return (S.me && S.me.jobs) || []; }
  function sub() { return (S.me && S.me.sub) || null; }
  function jobById(id) { return jobs().filter(function (j) { return j.id === id; })[0]; }
  function initials(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function money(n) { n = +n || 0; return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(n) { n = +n || 0; return (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function pretty(d) { if (!d) return ''; var x = typeof d === 'number' ? new Date(d) : new Date(String(d).length <= 10 ? d + 'T12:00:00' : d); return isNaN(x) ? esc(d) : x.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  function telOf(p) { return String(p || '').replace(/[^\d+]/g, ''); }
  function msg(id, t, cls) { var m = $(id); if (m) { m.className = 'ca-msg ' + (cls || ''); m.textContent = t || ''; } }
  function contract(j) { return (+j.price || 0) + (+j.coApproved || 0); }
  function owedNow(j) { return +j.approved || 0; }
  function left(j) { return Math.max(0, contract(j) - (+j.paid || 0) - (+j.approved || 0)); }
  function safe(n) { return String(n || 'file').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-60) || 'file'; }
  function ownerId() { var s = sub(); return (s && s.owner) || (window.bpOwnerId && bpOwnerId()) || ''; }
  function rnd() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* upload into one of my folders; resolves to "sb:<path>" */
  function upload(folder, file) {
    var s = sub(), o = ownerId(); if (!s || !o) return Promise.reject(new Error('not set up'));
    var path = o + '/' + folder + '/' + rnd() + '-' + safe(file.name);
    return Promise.resolve(BP_SB.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }))
      .then(function (r) { if (r && r.error) throw r.error; return 'sb:' + path; });
  }
  function jobFolder(jobId, kind) { return jobId + '/subs/' + sub().id + '/' + kind; }
  function rmFile(ref) { if (ref && String(ref).indexOf('sb:') === 0) try { Promise.resolve(BP_SB.storage.from(BUCKET).remove([String(ref).slice(3)])).catch(function () {}); } catch (e) {} }
  function openRef(ref) { if (window.bpPF && bpPF.open) bpPF.open(ref); }
  window.bpSubOpenFile = function (ref) { openRef(ref); };
  function fillRefs(root) {
    (root || document).querySelectorAll('[data-ref]').forEach(function (a) {
      var ref = a.getAttribute('data-ref'); if (!ref) return;
      var put = function (u) { if (!u) return; a.href = u; var im = a.querySelector('img'); if (im) im.src = u; };
      if (window.bpPF && bpPF.isRef(ref)) bpPF.url(ref).then(put); else put(ref);
    });
  }
  function fileOk(f, max) { return f && f.size <= (max || 25) * 1024 * 1024; }

  /* the sub's company in the sidebar card and avatar */
  function paintMe() {
    if (!(window.bpTeamIsSub && bpTeamIsSub())) return;
    var s = sub(); if (!s) return;
    var nm = s.company || s.contactName || 'Subcontractor';
    window.bpMeAvatar = { ref: '', name: s.contactName || nm };
    var bz = $('hlBiz'); if (bz) bz.textContent = nm;
    var p = $('hlPlan'); if (p) p.textContent = ((S.me.business && S.me.business.name) || 'Contractor') + ' · Subcontractor';
    var lg = $('hlAcctLogo'); if (lg) { lg.classList.add('ca-me'); lg.innerHTML = '<span class="ca-mei">' + esc(initials(nm)) + '</span>'; }
    var av = $('hlAv'); if (av) av.textContent = initials(s.contactName || nm);
  }
  window.bpSubPaintMe = paintMe;

  function unlinked() {
    var a = area(); if (!a) return true;
    if (sub()) return false;
    a.innerHTML = '<div class="bpx-panel ca-empty"><span class="ms">handyman</span><b>You’re not set up yet</b>'
      + '<p>Your login works, but the contractor hasn’t linked it to a subcontractor record. Ask them to open <b>Projects › Subcontractors</b> and invite you with this email:</p>'
      + '<code>' + esc((window.BP_TEAM && BP_TEAM.email) || window._bpEmail || 'your email') + '</code></div>';
    done();
    return true;
  }

  /* -------------------------------------------------------- compliance --- */
  var CST = { valid: ['ok', 'verified', 'Valid'], expiring: ['warn', 'schedule', 'Expiring soon'], expired: ['bad', 'error', 'Expired'], missing: ['bad', 'help', 'Missing'] };
  function chip(st, txt) { var c = CST[st] || CST.missing; return '<span class="sa-chip ' + c[0] + '"><span class="ms">' + c[1] + '</span>' + esc(txt || c[2]) + '</span>'; }
  function compBanner() {
    var c = (S.me && S.me.compliance) || {}, st = c.status || 'missing';
    if (st === 'valid') return '';
    var t = st === 'expired' ? 'Your insurance or license on file has expired.' : st === 'expiring' ? 'Your certificate of insurance expires ' + pretty(c.coi && c.coi.expires) + '.' : 'There is no certificate of insurance on file.';
    return '<div class="sa-banner ' + (st === 'expiring' ? 'warn' : 'bad') + '"><span class="ms">' + (st === 'expiring' ? 'schedule' : 'gpp_maybe') + '</span><div><b>' + t + '</b>'
      + '<span>Upload a current one so ' + esc((S.me.business && S.me.business.name) || 'the contractor') + ' can keep you on jobs.</span></div>'
      + '<button class="pm-btn" onclick="bpNav(\'subcomply\')"><span class="ms">upload</span>Upload</button></div>';
  }

  /* --------------------------------------------------------------- jobs --- */
  function nextDate(j) { var t = iso(new Date()); return ((j.sched && j.sched.dates) || []).slice().sort().filter(function (d) { return d >= t; })[0] || ''; }
  function datesLine(j) {
    if (j.startDate || j.endDate) return pretty(j.startDate) + (j.endDate ? ' – ' + pretty(j.endDate) : '');
    var n = nextDate(j); return n ? 'Next work day ' + pretty(n) : '';
  }
  function badgeOf(j) {
    var w = (j.invoices || []).filter(function (i) { return i.lienWaiver && i.lienWaiver.required && !i.lienWaiver.signedAt && (i.status === 'approved' || i.status === 'submitted'); }).length;
    return w ? '<span class="sa-chip warn"><span class="ms">draw</span>Waiver to sign</span>' : '';
  }
  window.bpSubJobs = function () {
    wait();
    load(true).then(function () {
      if (unlinked()) return;
      var js = jobs(), b = S.me.business || {};
      var tot = js.reduce(function (t, j) { t.c += contract(j); t.p += +j.paid || 0; t.o += owedNow(j); return t; }, { c: 0, p: 0, o: 0 });
      area().innerHTML = '<div class="ca-wrap sa">' + compBanner()
        + '<div class="sa-hello"><div><small>' + esc(b.name || 'Your contractor') + '</small><h2>' + esc(sub().company || 'Your jobs') + '</h2></div>'
        + '<div class="sa-kpis"><div><small>Contract value</small><b>' + money0(tot.c) + '</b></div><div><small>Paid</small><b>' + money0(tot.p) + '</b></div><div><small>Approved, unpaid</small><b>' + money0(tot.o) + '</b></div></div></div>'
        + (js.length ? '<div class="sa-jobs">' + js.map(function (j) {
            var pct = contract(j) > 0 ? Math.min(100, Math.round((+j.paid || 0) / contract(j) * 100)) : 0;
            return '<button class="bpx-panel sa-job" onclick="bpSubJob(\'' + esc(j.id) + '\')">'
              + '<div class="sa-jt"><b>' + esc(j.title || 'Project') + '</b>' + (j.status === 'done' ? '<span class="sa-chip ok"><span class="ms">task_alt</span>Done</span>' : '<span class="sa-chip live"><i></i>Active</span>') + '</div>'
              + '<div class="sa-ja"><span class="ms">location_on</span>' + esc(j.addr || 'No address yet') + '</div>'
              + (j.scope ? '<p class="sa-scope">' + esc(j.scope) + '</p>' : '')
              + '<div class="sa-jm"><span><small>Agreed</small><b>' + money0(contract(j)) + '</b></span><span><small>Paid</small><b>' + money0(j.paid) + '</b></span>'
                + '<span><small>Dates</small><b>' + (datesLine(j) || '—') + '</b></span></div>'
              + '<div class="sa-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' + badgeOf(j) + '</button>';
          }).join('') + '</div>'
          : '<div class="bpx-panel ca-empty"><span class="ms">handyman</span><b>No jobs yet</b><p>When ' + esc(b.name || 'the contractor') + ' puts you on a job it shows up here with the address, scope and price.</p></div>')
        + '</div>';
      done();
      if (S.job && jobById(S.job) && !$('bpx-modal')) sheet();
    }).catch(function () { fail(); done(); });
  };

  /* --------------------------------------------------- read-only sheet --- */
  var TABS = [['details', 'Overview', 'dashboard'], ['schedule', 'Schedule', 'calendar_month'], ['money', 'Money', 'payments'], ['photos', 'Photos', 'photo_library'],
    ['docs', 'Documents', 'folder'], ['blueprints', 'Blueprints', 'architecture'], ['permits', 'Permits', 'assignment']];
  function counts(j) { return { photos: (j.photos || []).length, docs: (j.docs || []).length, blueprints: (j.blueprints || []).length, permits: (j.permits || []).length, money: (j.invoices || []).length + (j.changeOrders || []).length }; }
  window.bpSubJob = function (id) { S.job = id; S.tab = 'details'; sheet(); };
  function sec(t, b) { return '<section class="pjs-sec">' + (t ? '<div class="pjs-h">' + t + '</div>' : '') + b + '</section>'; }
  function kv(rows) { rows = rows.filter(function (r) { return r[1]; }); return rows.length ? '<dl class="cs-kv">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' : ''; }
  function none(ico, t, p) { return '<div class="pjs-empty sm"><span class="ms">' + ico + '</span><b>' + t + '</b>' + (p ? '<p>' + p + '</p>' : '') + '</div>'; }
  function hero(j) {
    var addr = (j.addr || '').trim(), sc = j.siteContact || {}, ph = telOf(sc.phone);
    var act = function (href, ico, t, dis, ext) { return dis ? '<span class="pjs-act dis" aria-disabled="true"><span class="ms">' + ico + '</span>' + t + '</span>' : '<a class="pjs-act" href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '><span class="ms">' + ico + '</span>' + t + '</a>'; };
    return '<header class="pjs-hero"><div class="pjs-hero-top"><div class="pjs-av" aria-hidden="true"><span class="ms">handyman</span></div><div class="pjs-hero-t">'
      + '<div class="pjs-tags">' + (j.status === 'done' ? '<span class="pjs-pill done"><span class="ms">task_alt</span>Done</span>' : '<span class="pjs-pill live"><i></i>In progress</span>')
        + '<span class="pjs-pill ro"><span class="ms">visibility</span>View only</span>' + (j.lienWaiverRequired ? '<span class="pjs-pill ro"><span class="ms">draw</span>Lien waiver required</span>' : '') + '</div>'
      + '<h2 id="pjs-title">' + esc(j.title || 'Project') + '</h2><div class="pjs-job">' + esc(j.trade || sub().trade || 'Subcontract') + '</div>'
      + (addr ? '<a class="pjs-addr" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr) + '"><span class="ms">location_on</span><span>' + esc(addr) + '</span><span class="ms ext">open_in_new</span></a>'
        : '<span class="pjs-addr none"><span class="ms">location_off</span>No address yet</span>')
      + '</div><button class="pjs-x" type="button" aria-label="Close job" onclick="bpCloseModal()"><span class="ms">close</span></button></div>'
      + '<div class="pjs-hero-row"><div class="pjs-stats">'
        + '<div class="pjs-stat"><small>Agreed</small><b>' + money0(contract(j)) + '</b></div>'
        + '<div class="pjs-stat"><small>Paid</small><b>' + money0(j.paid) + '</b></div>'
        + '<div class="pjs-stat"><small>Owed now</small><b>' + money0(owedNow(j)) + '</b></div></div>'
      + '<div class="pjs-acts">' + act('tel:' + ph, 'call', 'Call site', !ph) + act('sms:' + ph, 'sms', 'Text site', !ph)
        + act('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr), 'directions', 'Directions', !addr, true) + '</div></div></header>';
  }
  function mapHtml(j) {
    var addr = (j.addr || '').trim(); if (!addr) return '';
    var q = j.geo && j.geo.lat != null && j.geo.lng != null ? j.geo.lat + ',' + j.geo.lng : addr;
    return '<div class="sa-map"><iframe title="Map of the job site" loading="lazy" referrerpolicy="no-referrer" src="https://maps.google.com/maps?q=' + encodeURIComponent(q) + '&z=16&output=embed"></iframe></div>';
  }
  function slotLbl(j, d) {
    var s = j.sched || {}, sl = s.slots && s.slots[d], t = (sl && sl.t) || s.time; if (!t) return '';
    var p = String(t).split(':'), h = +p[0]; return (h % 12 || 12) + (p[1] && p[1] !== '00' ? ':' + p[1] : '') + (h >= 12 ? ' PM' : ' AM');
  }
  function phasesOf(j) {
    if (j.plan && Array.isArray(j.plan.phases)) return j.plan.phases.map(function (p) { return { name: p.name, due: p.due, done: !!p.doneAt }; });
    return [];
  }
  function stChip(st) {
    var m = { submitted: ['wait', 'Submitted'], approved: ['info', 'Approved'], paid: ['ok', 'Paid'], rejected: ['bad', 'Rejected'], requested: ['wait', 'Waiting on approval'] }[st] || ['wait', st || ''];
    return '<span class="cm-st ' + m[0] + '">' + esc(m[1]) + '</span>';
  }
  function moneyPane(j) {
    var cos = j.changeOrders || [], inv = j.invoices || [];
    var rows = [['Agreed price', money(j.price)], ['Approved change orders', money(j.coApproved)], ['<b>Contract total</b>', '<b>' + money(contract(j)) + '</b>'],
      ['Invoiced', money(j.invoiced)], ['Paid', money(j.paid)], ['Approved, waiting on payment', money(owedNow(j))], ['Left to invoice', money(Math.max(0, contract(j) - (+j.invoiced || 0)))]];
    return sec('Money', '<dl class="cs-kv">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>')
      + sec('My invoices', (inv.length ? '<div class="sa-list">' + inv.slice().reverse().map(invRow.bind(null, j)).join('') + '</div>' : '<div class="bpx-mut">No invoices on this job yet.</div>')
        + '<button class="pm-btn" style="margin-top:10px" onclick="bpCloseModal();bpSubInvForm(\'' + esc(j.id) + '\')"><span class="ms">add</span>Submit an invoice</button>')
      + sec('My change orders', (cos.length ? '<div class="sa-list">' + cos.slice().reverse().map(coRow.bind(null, j)).join('') + '</div>' : '<div class="bpx-mut">No change orders on this job.</div>')
        + '<button class="pm-btn ghost" style="margin-top:10px" onclick="bpCloseModal();bpSubCoForm(\'' + esc(j.id) + '\')"><span class="ms">add</span>Request a change order</button>');
  }
  function pane(j, t) {
    var sc = j.siteContact || {};
    if (t === 'details') {
      return sec('Site', kv([['Address', j.addr ? esc(j.addr) : ''], ['Start', pretty(j.startDate)], ['Finish', pretty(j.endDate)]]) + mapHtml(j))
        + sec('My scope', j.scope ? '<p class="cs-notes">' + esc(j.scope) + '</p>' : '<div class="bpx-mut">The contractor hasn’t written the scope yet. Message them to confirm.</div>')
        + sec('Site contact', sc.name || sc.phone ? kv([['Name', esc(sc.name || '')], ['Phone', sc.phone ? '<a href="tel:' + esc(telOf(sc.phone)) + '">' + esc(sc.phone) + '</a>' : '']])
            : '<div class="bpx-mut">No site contact yet. Message ' + esc((S.me.business && S.me.business.name) || 'the contractor') + ' before you go out.</div>')
        + (j.lienWaiverRequired ? sec('Lien waivers', '<p class="cs-notes">This job needs a signed lien waiver with each invoice before it can be paid.</p>') : '');
    }
    if (t === 'schedule') {
      var dates = ((j.sched && j.sched.dates) || []).slice().sort(), td = iso(new Date()), phs = phasesOf(j);
      return sec('Work days', dates.length ? '<div class="cs-days">' + dates.filter(function (d) { return d >= td; }).concat(dates.filter(function (d) { return d < td; }).slice(-3).reverse()).map(function (d) {
            return '<div class="' + (d < td ? 'past' : d === td ? 'today' : '') + '"><b>' + pretty(d) + '</b><span>' + (slotLbl(j, d) || 'Time not set') + '</span></div>';
          }).join('') + '</div>' : '<div class="bpx-mut">No work days booked yet.</div>')
        + sec('Phases', phs.length ? '<div class="cs-phases">' + phs.map(function (p) {
            var late = !p.done && p.due && p.due < td;
            return '<div class="' + (p.done ? 'done' : late ? 'late' : '') + '"><span class="ms">' + (p.done ? 'check_circle' : 'radio_button_unchecked') + '</span><b>' + esc(p.name || 'Phase') + '</b><span>' + (p.due ? 'Due ' + pretty(p.due) : '') + '</span></div>';
          }).join('') + '</div>' : '<div class="bpx-mut">No phases planned for this job.</div>');
    }
    if (t === 'money') return moneyPane(j);
    if (t === 'permits') {
      var pm = j.permits || [];
      return pm.length ? '<div class="pm-list">' + pm.map(function (p) {
          var st = p.status || 'Not applied', cls = /Passed|Closed/.test(st) ? 'ok' : /Failed/.test(st) ? 'bad' : /Approved|scheduled/.test(st) ? 'info' : 'idle';
          var insp = (p.inspections || []).filter(function (x) { return x.date || x.kind; });
          return '<div class="pm-card"><div class="pm-top"><div class="pm-ico"><span class="ms">assignment</span></div><div class="pm-t"><b>' + esc(p.type || 'Permit') + (p.number ? ' <span class="pm-no">#' + esc(p.number) + '</span>' : '') + '</b><small>' + esc(p.office || '') + '</small></div><span class="pm-st ' + cls + '">' + esc(st) + '</span></div>'
            + kv([['Applied', pretty(p.applied)], ['Approved', pretty(p.approved)], ['Expires', pretty(p.expires)]])
            + (insp.length ? '<div class="cs-insp"><div class="pjs-h">Inspections</div>' + insp.map(function (x) { return '<div><span class="ms">event_available</span><b>' + esc(x.kind || 'Inspection') + '</b><span>' + pretty(x.date) + (x.result ? ' · ' + esc(x.result) : '') + '</span></div>'; }).join('') + '</div>' : '') + '</div>';
        }).join('') + '</div>' : none('assignment', 'No permits on this job', 'Permit numbers and inspection dates show up here once the contractor adds them.');
    }
    var list = j[t] || [], what = t === 'photos' ? 'photos' : t === 'docs' ? 'documents' : 'blueprints';
    var add = t === 'blueprints' ? '' : '<label class="ca-add"><span class="ms">' + (t === 'photos' ? 'add_a_photo' : 'upload_file') + '</span>Add ' + what
      + '<input type="file" hidden multiple ' + (t === 'photos' ? 'accept="image/*"' : 'accept="image/*,application/pdf"') + ' onchange="bpSubAddFiles(this)"></label><div class="ca-msg" id="sa-fmsg"></div>';
    return sec('', add + (list.length ? (t === 'photos'
        ? '<div class="ca-grid">' + list.map(function (p, i) { return '<a class="ca-ph" data-ref="' + esc(p) + '" target="_blank" rel="noopener"><img alt="Photo ' + (i + 1) + '"></a>'; }).join('') + '</div>'
        : '<div class="ca-files">' + list.map(function (f) { return '<a class="ca-file" data-ref="' + esc(f.d || '') + '" target="_blank" rel="noopener"><span class="ms">' + (t === 'docs' ? 'description' : 'architecture') + '</span><b>' + esc(f.n || 'File') + '</b>' + (f.t ? '<small>' + pretty(f.t) + (f.by ? ' · ' + esc(f.by) : '') + '</small>' : '') + '</a>'; }).join('') + '</div>')
      : '<div class="bpx-mut" style="margin-top:12px">No ' + what + ' yet.</div>'));
  }
  function sheet() {
    var j = jobById(S.job); if (!j) { S.job = null; return; }
    var n = counts(j);
    bpModal(hero(j) + '<nav class="pjs-tabs" role="tablist" aria-label="Job sections">' + TABS.map(function (t) {
        return '<button type="button" class="bpx-jt pjs-tab' + (S.tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (S.tab === t[0]) + '" data-sa-tab="' + t[0] + '" onclick="bpSubJobTab(\'' + t[0] + '\')">'
          + '<span class="ms">' + t[2] + '</span><span class="pjs-tl">' + t[1] + '</span><span class="pjs-n">' + (n[t[0]] || '') + '</span></button>';
      }).join('') + '</nav><div class="pjs-body" id="sa-body"></div>');
    var m = $('bpx-modal'); if (!m) return;
    m.classList.add('pjs', 'cs-sheet', 'sa-sheet');
    var card = m.querySelector('.bpx-modalcard'); card.classList.add('pjs-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'pjs-title');
    body();
  }
  function body() {
    var j = jobById(S.job), b = $('sa-body'); if (!j || !b) return;
    b.innerHTML = '<div data-pj-pane="' + S.tab + '" role="tabpanel">' + pane(j, S.tab) + '</div>';
    b.scrollTop = 0; fillRefs(b);
  }
  window.bpSubJobTab = function (t) {
    S.tab = t;
    document.querySelectorAll('.sa-sheet [data-sa-tab]').forEach(function (x) { var on = x.getAttribute('data-sa-tab') === t; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
    body();
  };
  window.bpSubAddFiles = function (inp) {
    var files = [].slice.call(inp.files || []); inp.value = ''; if (!files.length) return;
    var kind = S.tab, jobId = S.job, n = 0;
    msg('sa-fmsg', 'Uploading ' + files.length + '…');
    files.reduce(function (p, f) {
      return p.then(function () {
        if (!fileOk(f)) return;
        return upload(jobFolder(jobId, kind), f).then(function (ref) {
          var item = kind === 'photos' ? ref : { n: f.name, d: ref };
          return Promise.resolve(BP_SB.rpc('sub_add_file', { p_job: jobId, p_kind: kind, p_item: item })).then(rpcRes).then(function (d) { if (d.ok) n++; else rmFile(ref); });
        });
      });
    }, Promise.resolve()).then(function () { return load(true); }).then(function () {
      body(); var j = jobById(jobId); if (j) { var c = counts(j); document.querySelectorAll('.sa-sheet [data-sa-tab]').forEach(function (x) { var e = x.querySelector('.pjs-n'); if (e) e.textContent = c[x.getAttribute('data-sa-tab')] || ''; }); }
      msg('sa-fmsg', n ? n + ' added.' : 'Nothing was added. Files must be under 25 MB.', n ? 'ok' : 'bad');
    }).catch(function () { msg('sa-fmsg', 'Upload failed. Try again.', 'bad'); });
  };

  /* ----------------------------------------------------------- invoices --- */
  var ERR = { amount: 'Enter the amount, like 2500 or 2500.50.', note: 'Keep the note under 500 characters.', file: 'The file didn’t upload right. Try again.',
    'not your job': 'You’re no longer on that job.', 'not yours': 'That isn’t yours.', 'already decided': 'The contractor already acted on that one.',
    'not found': 'That’s already gone.', 'too many': 'That’s a lot waiting. Message the contractor.', desc: 'Describe the change (up to 600 characters).',
    name: 'Type your full name to sign.', expires: 'Add the expiry date.', kind: 'Pick what kind of document it is.' };
  function err(d) { return ERR[d && d.error] || 'That didn’t go through. Try again.'; }
  function jobOpts(sel) { return jobs().map(function (j) { return '<option value="' + esc(j.id) + '"' + (j.id === sel ? ' selected' : '') + '>' + esc(j.title || 'Project') + ' · ' + esc(j.addr || '') + '</option>'; }).join(''); }
  function invRow(j, i) {
    var w = i.lienWaiver || {}, need = w.required && !w.signedAt && i.status !== 'rejected' && i.status !== 'paid';
    return '<div class="sa-row" data-sa-inv="' + esc(i.id) + '"><div class="sa-rm"><b>' + money(i.amount) + '</b><span>' + (j ? esc(j.title || 'Project') + ' · ' : '') + pretty(i.at) + (i.note ? ' · ' + esc(i.note) : '') + '</span>'
      + '<em class="cm-chips">' + stChip(i.status) + (i.paidAt ? '<span class="cm-by">Paid ' + pretty(i.paidAt) + '</span>' : '')
        + (w.required ? (w.signedAt ? '<span class="cm-st ok">Waiver signed</span>' : '<span class="cm-st wait">Waiver needed</span>') : '') + '</em></div>'
      + '<div class="sa-ra">' + (i.file ? '<button class="bpx-rowbtn" onclick="bpSubOpenFile(\'' + esc(i.file) + '\')"><span class="ms">attach_file</span>File</button>' : '')
        + (need ? '<button class="pm-btn sm" onclick="bpSubWaiver(\'' + esc(j.id) + '\',\'' + esc(i.id) + '\')"><span class="ms">draw</span>Sign waiver</button>' : '')
        + (i.status === 'submitted' ? '<button class="cm-rm" title="Delete this invoice" aria-label="Delete invoice" onclick="bpSubInvRemove(\'' + esc(j.id) + '\',\'' + esc(i.id) + '\')"><span class="ms">delete</span></button>' : '') + '</div></div>';
  }
  window.bpSubInvoices = function () {
    wait();
    load(true).then(function () {
      if (unlinked()) return;
      var all = []; jobs().forEach(function (j) { (j.invoices || []).forEach(function (i) { all.push([j, i]); }); });
      all.sort(function (a, b) { return (+b[1].at || 0) - (+a[1].at || 0); });
      var sum = function (st) { return all.filter(function (x) { return st.indexOf(x[1].status) >= 0; }).reduce(function (t, x) { return t + (+x[1].amount || 0); }, 0); };
      area().innerHTML = '<div class="ca-wrap sa">' + compBanner()
        + '<div class="sa-kpis wide"><div><small>Waiting on review</small><b>' + money0(sum(['submitted'])) + '</b></div><div><small>Approved, unpaid</small><b>' + money0(sum(['approved'])) + '</b></div><div><small>Paid</small><b>' + money0(sum(['paid'])) + '</b></div></div>'
        + '<div class="bpx-panel"><div class="sa-ph"><h4>Invoices</h4>' + (jobs().length ? '<button class="pm-btn" onclick="bpSubInvForm()"><span class="ms">add</span>Submit invoice</button>' : '') + '</div>'
        + '<div id="sa-invform"></div><div class="ca-msg" id="sa-imsg"></div>'
        + (all.length ? '<div class="sa-list">' + all.map(function (x) { return invRow(x[0], x[1]); }).join('') + '</div>'
          : '<div class="bpx-mut" style="margin-top:6px">' + (jobs().length ? 'No invoices yet. Submit one when a stage of the work is done.' : 'You’ll be able to invoice once you’re on a job.') + '</div>')
        + '</div></div>';
      done();
      if (S.form && S.form.k === 'inv') { var jid = S.form.job; S.form = null; bpSubInvForm(jid); }
    }).catch(function () { fail(); done(); });
  };
  window.bpSubInvForm = function (jobId) {
    if (window._bpCurView !== 'subinvoices') { S.form = { k: 'inv', job: jobId }; bpNav('subinvoices'); return; }
    var h = $('sa-invform'); if (!h) return;
    var j = jobById(jobId) || jobs()[0];
    h.innerHTML = '<div class="cm-form"><div class="cm-h">New invoice</div>'
      + '<label>Job<select id="sa-ijob" onchange="bpSubInvHint()">' + jobOpts(j && j.id) + '</select></label>'
      + '<div id="sa-ihint" class="sa-hint"></div>'
      + '<label>Amount<input id="sa-iamt" inputmode="decimal" placeholder="0.00" autocomplete="off"></label>'
      + '<label>Note<input id="sa-inote" maxlength="500" placeholder="e.g. Gutters installed, 50% progress"></label>'
      + '<label>Invoice file (PDF or photo)<input type="file" id="sa-ifile" accept="image/*,application/pdf"></label>'
      + '<div class="sa-fa"><button class="bpx-btn ghost" onclick="document.getElementById(\'sa-invform\').innerHTML=\'\'">Cancel</button><button class="bpx-btn" id="sa-igo" onclick="bpSubInvAdd()">Submit invoice</button></div></div>';
    bpSubInvHint();
    var a = $('sa-iamt'); if (a) a.focus();
  };
  window.bpSubInvHint = function () {
    var j = jobById(($('sa-ijob') || {}).value), h = $('sa-ihint'); if (!h || !j) return;
    h.innerHTML = 'Contract ' + money(contract(j)) + ' · invoiced ' + money(j.invoiced) + ' · left to invoice <b>' + money(Math.max(0, contract(j) - (+j.invoiced || 0))) + '</b>'
      + (j.lienWaiverRequired ? '<br><span class="ms" style="font-size:15px;vertical-align:-3px">draw</span> A signed lien waiver is needed before this can be paid.' : '');
  };
  window.bpSubInvAdd = function () {
    var jobId = ($('sa-ijob') || {}).value, amt = String(($('sa-iamt') || {}).value || '').replace(/[$,\s]/g, ''), note = String(($('sa-inote') || {}).value || '').trim();
    var f = ($('sa-ifile') || {}).files && $('sa-ifile').files[0], go = $('sa-igo');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(amt) || !(+amt > 0)) { msg('sa-imsg', ERR.amount, 'bad'); return; }
    if (f && !fileOk(f)) { msg('sa-imsg', 'Files must be under 25 MB.', 'bad'); return; }
    if (go) { go.disabled = true; go.textContent = 'Sending…'; }
    var reset = function () { if (go) { go.disabled = false; go.textContent = 'Submit invoice'; } };
    (f ? upload(jobFolder(jobId, 'invoices'), f) : Promise.resolve('')).then(function (ref) {
      return Promise.resolve(BP_SB.rpc('sub_invoice_add', { p_job: jobId, p_inv: { amount: amt, note: note, file: ref, mime: f ? f.type : '' } })).then(rpcRes).then(function (d) {
        if (!d.ok) { rmFile(ref); reset(); msg('sa-imsg', err(d), 'bad'); return; }
        S.form = null; bpSubInvoices();
        setTimeout(function () { msg('sa-imsg', money(+amt) + ' invoice sent. You’ll see when it’s approved and paid.', 'ok'); }, 350);
      });
    }).catch(function () { reset(); msg('sa-imsg', 'Upload failed. Check your signal and try again.', 'bad'); });
  };
  window.bpSubInvRemove = function (jobId, id) {
    if (!confirm('Delete this invoice? You can submit a new one.')) return;
    Promise.resolve(BP_SB.rpc('sub_invoice_remove', { p_job: jobId, p_id: id })).then(rpcRes).then(function (d) {
      if (d.ok) { rmFile(d.file); rmFile(d.waiver); }
      var after = function () { msg('sa-imsg', d.ok ? 'Invoice deleted.' : err(d), d.ok ? 'ok' : 'bad'); };
      if (window._bpCurView === 'subinvoices') { bpSubInvoices(); setTimeout(after, 350); } else after();
    }).catch(function () { msg('sa-imsg', 'Couldn’t reach the server. Try again.', 'bad'); });
  };
  /* lien waiver: a typed signature on a plain conditional waiver, and/or the state form as a file */
  window.bpSubWaiver = function (jobId, id) {
    var j = jobById(jobId), i = j && (j.invoices || []).filter(function (x) { return x.id === id; })[0]; if (!i) return;
    var s = sub(), b = S.me.business || {};
    bpModal('<h3>Lien waiver</h3><div class="bpx-sub">Conditional waiver and release on payment of this invoice.</div>'
      + '<div class="sa-waiver"><p><b>' + esc(s.company || 'Subcontractor') + '</b> (“Claimant”), for labor, services and materials furnished on <b>' + esc(j.addr || j.title || 'the project') + '</b> for <b>' + esc(b.name || 'the contractor') + '</b>, '
      + 'upon receipt of payment of <b>' + money(i.amount) + '</b>, waives and releases any mechanic’s lien, stop notice or payment bond right for the work covered by this invoice'
      + ' dated ' + pretty(i.at) + '. This waiver is conditional on that payment actually being received.</p></div>'
      + '<label>Type your full name to sign</label><input id="sa-wname" maxlength="120" placeholder="Full name" value="' + esc(s.contactName || '') + '">'
      + '<label>Signed waiver file <span class="bpx-mut" style="font-weight:400">(optional: your state’s form)</span></label><input type="file" id="sa-wfile" accept="image/*,application/pdf">'
      + '<div class="ca-msg" id="sa-wmsg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" id="sa-wgo" onclick="bpSubWaiverSign(\'' + esc(jobId) + '\',\'' + esc(id) + '\')">Sign waiver</button></div>');
  };
  window.bpSubWaiverSign = function (jobId, id) {
    var nm = String(($('sa-wname') || {}).value || '').trim(), f = ($('sa-wfile') || {}).files && $('sa-wfile').files[0], go = $('sa-wgo');
    if (nm.length < 2) { msg('sa-wmsg', ERR.name, 'bad'); return; }
    if (f && !fileOk(f)) { msg('sa-wmsg', 'Files must be under 25 MB.', 'bad'); return; }
    if (go) { go.disabled = true; go.textContent = 'Signing…'; }
    (f ? upload(jobFolder(jobId, 'waivers'), f) : Promise.resolve('')).then(function (ref) {
      return Promise.resolve(BP_SB.rpc('sub_waiver_sign', { p_job: jobId, p_id: id, p_waiver: { signedName: nm, file: ref } })).then(rpcRes).then(function (d) {
        if (!d.ok) { rmFile(ref); if (go) { go.disabled = false; go.textContent = 'Sign waiver'; } msg('sa-wmsg', err(d), 'bad'); return; }
        bpCloseModal(); var v = window._bpCurView; if (v === 'subinvoices') bpSubInvoices(); else bpSubJobs();
      });
    }).catch(function () { if (go) { go.disabled = false; go.textContent = 'Sign waiver'; } msg('sa-wmsg', 'Couldn’t save. Try again.', 'bad'); });
  };

  /* ------------------------------------------------------ change orders --- */
  function coRow(j, c) {
    return '<div class="sa-row"><div class="sa-rm"><b>' + money(c.amount) + '</b><span>' + (j ? esc(j.title || 'Project') + ' · ' : '') + pretty(c.at) + '</span>'
      + '<p>' + esc(c.desc || '') + '</p><em class="cm-chips">' + stChip(c.status) + '</em></div>'
      + '<div class="sa-ra">' + (c.status === 'requested' ? '<button class="cm-rm" title="Withdraw" aria-label="Withdraw change order" onclick="bpSubCoRemove(\'' + esc(j.id) + '\',\'' + esc(c.id) + '\')"><span class="ms">delete</span></button>' : '') + '</div></div>';
  }
  window.bpSubChanges = function () {
    wait();
    load(true).then(function () {
      if (unlinked()) return;
      var all = []; jobs().forEach(function (j) { (j.changeOrders || []).forEach(function (c) { all.push([j, c]); }); });
      all.sort(function (a, b) { return (+b[1].at || 0) - (+a[1].at || 0); });
      area().innerHTML = '<div class="ca-wrap sa"><div class="bpx-panel"><div class="sa-ph"><h4>Change orders</h4>' + (jobs().length ? '<button class="pm-btn" onclick="bpSubCoForm()"><span class="ms">add</span>Request change</button>' : '') + '</div>'
        + '<p class="bpx-mut" style="margin:0 0 10px;font-size:13px">Extra work, or less, than the agreed scope. Once approved it’s added to your contract total and you can invoice it.</p>'
        + '<div id="sa-coform"></div><div class="ca-msg" id="sa-cmsg"></div>'
        + (all.length ? '<div class="sa-list">' + all.map(function (x) { return coRow(x[0], x[1]); }).join('') + '</div>' : '<div class="bpx-mut">No change orders yet.</div>')
        + '</div></div>';
      done();
      if (S.form && S.form.k === 'co') { var jid = S.form.job; S.form = null; bpSubCoForm(jid); }
    }).catch(function () { fail(); done(); });
  };
  window.bpSubCoForm = function (jobId) {
    if (window._bpCurView !== 'subchanges') { S.form = { k: 'co', job: jobId }; bpNav('subchanges'); return; }
    var h = $('sa-coform'); if (!h) return;
    var j = jobById(jobId) || jobs()[0];
    h.innerHTML = '<div class="cm-form"><div class="cm-h">Request a change order</div>'
      + '<label>Job<select id="sa-cjob">' + jobOpts(j && j.id) + '</select></label>'
      + '<label>What changed<textarea id="sa-cdesc" rows="3" maxlength="600" placeholder="e.g. Rotted fascia behind the gutter, replace 24 lf"></textarea></label>'
      + '<label>Price<input id="sa-camt" inputmode="decimal" placeholder="0.00 (use − for a credit)"></label>'
      + '<div class="sa-fa"><button class="bpx-btn ghost" onclick="document.getElementById(\'sa-coform\').innerHTML=\'\'">Cancel</button><button class="bpx-btn" id="sa-cgo" onclick="bpSubCoAdd()">Send request</button></div></div>';
    var d = $('sa-cdesc'); if (d) d.focus();
  };
  window.bpSubCoAdd = function () {
    var jobId = ($('sa-cjob') || {}).value, desc = String(($('sa-cdesc') || {}).value || '').trim(), amt = String(($('sa-camt') || {}).value || '').replace(/[$,\s]/g, '').replace('−', '-');
    if (!desc) { msg('sa-cmsg', ERR.desc, 'bad'); return; }
    if (!/^-?\d{1,7}(\.\d{1,2})?$/.test(amt) || +amt === 0) { msg('sa-cmsg', 'Enter the price, like 350 (or -50 for a credit).', 'bad'); return; }
    var go = $('sa-cgo'); if (go) { go.disabled = true; go.textContent = 'Sending…'; }
    Promise.resolve(BP_SB.rpc('sub_change_order_add', { p_job: jobId, p_co: { desc: desc, amount: amt } })).then(rpcRes).then(function (d) {
      if (!d.ok) { if (go) { go.disabled = false; go.textContent = 'Send request'; } msg('sa-cmsg', err(d), 'bad'); return; }
      bpSubChanges(); setTimeout(function () { msg('sa-cmsg', 'Change order sent for ' + money(+amt) + '.', 'ok'); }, 350);
    }).catch(function () { if (go) { go.disabled = false; go.textContent = 'Send request'; } msg('sa-cmsg', 'Couldn’t reach the server. Try again.', 'bad'); });
  };
  window.bpSubCoRemove = function (jobId, id) {
    if (!confirm('Withdraw this change order?')) return;
    Promise.resolve(BP_SB.rpc('sub_change_order_remove', { p_job: jobId, p_id: id })).then(rpcRes).then(function (d) {
      if (window._bpCurView === 'subchanges') { bpSubChanges(); setTimeout(function () { msg('sa-cmsg', d.ok ? 'Withdrawn.' : err(d), d.ok ? 'ok' : 'bad'); }, 350); }
    }).catch(function () { msg('sa-cmsg', 'Couldn’t reach the server. Try again.', 'bad'); });
  };

  /* --------------------------------------------------------- compliance --- */
  var KINDS = { coi: 'Certificate of insurance', license: 'Contractor license', w9: 'W-9', other: 'Other' };
  window.bpSubComply = function () {
    wait();
    load(true).then(function () {
      if (unlinked()) return;
      var c = S.me.compliance || {}, docs = S.me.docs || [], st = c.status || 'missing';
      var card = function (k, x) {
        var d = x ? (k === 'w9' ? 'On file' : 'Expires ' + pretty(x.expires)) : 'Not on file';
        return '<div class="sa-cc"><span class="ms">' + (k === 'coi' ? 'shield' : k === 'license' ? 'badge' : 'description') + '</span><div><b>' + KINDS[k] + '</b><span>' + d + (x && x.number ? ' · #' + esc(x.number) : '') + '</span></div>'
          + (x ? chip(x.status) : chip(k === 'coi' ? 'missing' : 'none', 'None')) + '</div>';
      };
      area().innerHTML = '<div class="ca-wrap sa">'
        + '<div class="bpx-panel sa-comp ' + esc(st) + '"><div class="sa-ph"><h4>Compliance</h4>' + chip(st, st === 'valid' ? 'All current' : null) + '</div>'
        + '<p class="bpx-mut" style="margin:0 0 12px;font-size:13px">Keep a current certificate of insurance on file. ' + esc((S.me.business && S.me.business.name) || 'The contractor') + ' sees these and gets a reminder before they expire.</p>'
        + '<div class="sa-ccs">' + card('coi', c.coi) + card('license', c.license) + card('w9', c.w9) + '</div></div>'
        + '<div class="bpx-panel"><div class="sa-ph"><h4>Documents</h4><button class="pm-btn" onclick="bpSubDocForm()"><span class="ms">upload</span>Upload</button></div>'
        + '<div id="sa-dform"></div><div class="ca-msg" id="sa-dmsg"></div>'
        + (docs.length ? '<div class="sa-list">' + docs.map(function (d) {
            return '<div class="sa-row"><div class="sa-rm"><b>' + esc(KINDS[d.kind] || 'Document') + (d.number ? ' · #' + esc(d.number) : '') + '</b><span>' + (d.expires ? 'Expires ' + pretty(d.expires) : 'No expiry') + ' · added ' + pretty(d.at) + (d.addedBy === 'owner' ? ' by the contractor' : '') + '</span>'
              + '<em class="cm-chips">' + (d.kind === 'w9' || d.kind === 'other' ? '' : chip(d.status)) + '</em></div>'
              + '<div class="sa-ra">' + (d.file ? '<button class="bpx-rowbtn" onclick="bpSubOpenFile(\'' + esc(d.file) + '\')"><span class="ms">visibility</span>View</button>' : '')
              + (d.addedBy === 'sub' ? '<button class="cm-rm" aria-label="Delete document" title="Delete" onclick="bpSubDocRemove(\'' + esc(d.id) + '\')"><span class="ms">delete</span></button>' : '') + '</div></div>';
          }).join('') + '</div>' : '<div class="bpx-mut">Nothing uploaded yet.</div>')
        + '</div></div>';
      done();
    }).catch(function () { fail(); done(); });
  };
  window.bpSubDocForm = function () {
    var h = $('sa-dform'); if (!h) return;
    h.innerHTML = '<div class="cm-form"><div class="cm-h">Upload a document</div>'
      + '<label>Type<select id="sa-dkind" onchange="document.getElementById(\'sa-dexpl\').hidden=this.value===\'w9\'">' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '">' + KINDS[k] + '</option>'; }).join('') + '</select></label>'
      + '<label>Policy / license number<input id="sa-dnum" maxlength="80" placeholder="Optional"></label>'
      + '<label id="sa-dexpl">Expires<input type="date" id="sa-dexp"></label>'
      + '<label>File (PDF or photo)<input type="file" id="sa-dfile" accept="image/*,application/pdf"></label>'
      + '<div class="sa-fa"><button class="bpx-btn ghost" onclick="document.getElementById(\'sa-dform\').innerHTML=\'\'">Cancel</button><button class="bpx-btn" id="sa-dgo" onclick="bpSubDocAdd()">Upload</button></div></div>';
  };
  window.bpSubDocAdd = function () {
    var k = ($('sa-dkind') || {}).value, num = String(($('sa-dnum') || {}).value || '').trim(), ex = ($('sa-dexp') || {}).value || '', f = ($('sa-dfile') || {}).files && $('sa-dfile').files[0], go = $('sa-dgo');
    if (!f) { msg('sa-dmsg', 'Pick the file to upload.', 'bad'); return; }
    if (!fileOk(f)) { msg('sa-dmsg', 'Files must be under 25 MB.', 'bad'); return; }
    if ((k === 'coi' || k === 'license') && !ex) { msg('sa-dmsg', ERR.expires, 'bad'); return; }
    if (go) { go.disabled = true; go.textContent = 'Uploading…'; }
    upload('subs/' + sub().id + '/docs', f).then(function (ref) {
      return Promise.resolve(BP_SB.rpc('sub_doc_add', { p_doc: { kind: k, number: num, expires: k === 'w9' ? '' : ex, file: ref, name: f.name } })).then(rpcRes).then(function (d) {
        if (!d.ok) { rmFile(ref); if (go) { go.disabled = false; go.textContent = 'Upload'; } msg('sa-dmsg', err(d), 'bad'); return; }
        bpSubComply(); setTimeout(function () { msg('sa-dmsg', KINDS[k] + ' uploaded.', 'ok'); }, 350);
      });
    }).catch(function () { if (go) { go.disabled = false; go.textContent = 'Upload'; } msg('sa-dmsg', 'Upload failed. Try again.', 'bad'); });
  };
  window.bpSubDocRemove = function (id) {
    if (!confirm('Delete this document?')) return;
    Promise.resolve(BP_SB.rpc('sub_doc_remove', { p_id: id })).then(rpcRes).then(function (d) {
      if (d.ok) rmFile(d.file);
      bpSubComply(); setTimeout(function () { msg('sa-dmsg', d.ok ? 'Deleted.' : err(d), d.ok ? 'ok' : 'bad'); }, 350);
    });
  };

  /* --------------------------------------------------------- my company --- */
  window.bpSubCompany = function () {
    wait();
    load(true).then(function () {
      if (unlinked()) return;
      var s = sub(), b = S.me.business || {}, st = S.me.stats || {}, revs = S.me.reviews || [], n = +st.reviews || 0, avg = +st.rating || 0;
      var stars = function (r, sz) { return window.bpStars ? bpStars(r, sz) : '★ ' + r.toFixed(1); };
      area().innerHTML = '<div class="ca-wrap sa"><div class="bpx-panel sa-co">'
        + '<div class="sa-coh"><span class="sa-logo">' + esc(initials(s.company)) + '</span><div><h3>' + esc(s.company || 'My company') + '</h3><span>' + esc(s.trade || 'Subcontractor') + ' · working with ' + esc(b.name || 'your contractor') + ' since ' + pretty(s.since) + '</span></div></div>'
        + '<dl class="cs-kv"><div><dt>Contact</dt><dd>' + esc(s.contactName || '—') + '</dd></div><div><dt>Email</dt><dd>' + esc(s.email || '—') + '</dd></div><div><dt>Phone</dt><dd>' + esc(s.phone || '—') + '</dd></div>'
        + '<div><dt>Lien waivers</dt><dd>' + (s.lienWaiverRequired ? 'Required with invoices' : 'Only where a job asks') + '</dd></div></dl>'
        + '<button class="bpx-rowbtn" style="margin-top:10px" onclick="bpSubProfileEdit()"><span class="ms" style="font-size:15px;vertical-align:-3px">edit</span> Edit contact</button></div>'
        + '<div class="bpx-panel"><h4 style="margin:0 0 8px">Rating</h4>' + (n ? '<div class="ca-rech"><b>' + avg.toFixed(1) + '</b>' + stars(avg, 20) + '<span class="bpx-mut" style="font-size:13px">' + n + ' review' + (n === 1 ? '' : 's') + '</span></div>'
            + revs.slice(0, 6).map(function (r) { return '<div class="rv-rev"><div class="rv-revh">' + stars(+r.rating || 0, 13) + '<em>' + pretty(r.at) + '</em></div>' + (r.comment ? '<p>' + esc(r.comment) + '</p>' : '') + '</div>'; }).join('')
          : '<span class="bpx-mut" style="font-size:13.5px">No homeowner ratings yet. They show up here after a job is finished.</span>') + '</div>'
        + '<div class="bpx-panel"><h4 style="margin:0 0 8px">Your contractor</h4><dl class="cs-kv"><div><dt>Company</dt><dd>' + esc(b.name || '—') + '</dd></div>'
        + (b.phone ? '<div><dt>Phone</dt><dd><a href="tel:' + esc(telOf(b.phone)) + '">' + esc(b.phone) + '</a></dd></div>' : '')
        + (b.email ? '<div><dt>Email</dt><dd><a href="mailto:' + esc(b.email) + '">' + esc(b.email) + '</a></dd></div>' : '') + '</dl>'
        + '<button class="pm-btn ghost" style="margin-top:10px" onclick="bpNav(\'crewmsgs\')"><span class="ms">chat</span>Message them</button></div></div>';
      done();
    }).catch(function () { fail(); done(); });
  };
  window.bpSubProfileEdit = function () {
    var s = sub(); if (!s) return;
    bpModal('<h3>Contact details</h3><div class="bpx-sub">Company name, trade and email are set by the contractor.</div>'
      + '<label>Contact name</label><input id="sa-pname" maxlength="120" value="' + esc(s.contactName || '') + '">'
      + '<label>Phone</label><input id="sa-pphone" maxlength="40" inputmode="tel" value="' + esc(s.phone || '') + '">'
      + '<div class="ca-msg" id="sa-pmsg"></div><div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" id="sa-pgo" onclick="bpSubProfileSave()">Save</button></div>');
  };
  window.bpSubProfileSave = function () {
    var go = $('sa-pgo'); if (go) { go.disabled = true; go.textContent = 'Saving…'; }
    Promise.resolve(BP_SB.rpc('sub_set_profile', { p_contact: ($('sa-pname') || {}).value || '', p_phone: ($('sa-pphone') || {}).value || '' })).then(rpcRes).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      bpCloseModal(); bpSubCompany();
    }).catch(function () { if (go) { go.disabled = false; go.textContent = 'Save'; } msg('sa-pmsg', 'Couldn’t save. Try again.', 'bad'); });
  };
})();
