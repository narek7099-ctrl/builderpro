/* ==================================================================
   Subcontractors, the owner's side.

     Projects › Subcontractors   the list (company, trade, compliance
                                 red / amber / green, rating, active jobs,
                                 owed), Add / Invite, and a profile with
                                 their documents, jobs, invoices, reviews
     Project sheet › Subs tab    put a sub on the job with a price, scope,
                                 dates and a site contact; approve / reject
                                 / pay their invoices, approve / reject
                                 their change orders

   Records: public.subcontractors and public.sub_documents (owner/office RLS).
   Per-job data lives on the job (portal_finance.jobs[i]):
     subs[]            {subId, name, trade, scope, price, startDate, endDate,
                        siteContact{name, phone}, lienWaiver?}
     subInvoices[]     submitted by the sub (sub_invoice_add), decided here
     subChangeOrders[] requested by the sub, decided here
   An approved invoice becomes a 'Subcontractor' expense keyed
   'subinv:<id>' (like a crew receipt). An approved change order raises
   the agreed amount. Paying an invoice that needs a lien waiver waits for
   the signed waiver. Expired insurance only warns; it never blocks.

   The database trigger (bp_jobs_keep_subs) keeps a sub's submissions if
   this page saves an older copy of the jobs; bpSubsRefresh() pulls fresh
   ones in so the owner sees them without reloading.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB && BP_SB.from); };
  var SB = window.BP_SUBS = { list: [], docs: [], loaded: false, busy: null, open: null, edit: null, assign: null };
  var LSK = 'bpSubsLocal';
  var TRADES = ['Gutters', 'Electrical', 'Plumbing', 'HVAC', 'Insulation', 'Siding', 'Windows', 'Drywall', 'Painting', 'Concrete', 'Framing', 'Solar', 'Dumpster / haul', 'Other'];
  var KINDS = { coi: 'Certificate of insurance', license: 'License', w9: 'W-9', other: 'Other' };

  function money(n) { n = +n || 0; return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : '$' + Math.round(+n || 0).toLocaleString(); }
  function pretty(d) { if (!d) return ''; var x = typeof d === 'number' ? new Date(d) : new Date(String(d).length <= 10 ? d + 'T12:00:00' : d); return isNaN(x) ? esc(d) : x.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function rid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function uuid() { try { return crypto.randomUUID(); } catch (e) { return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }); } }
  function num(v) { return +String(v == null ? '' : v).replace(/[^0-9.\-]/g, '') || 0; }
  function jobs() { return (typeof bpJobsGet === 'function' ? bpJobsGet() : []) || []; }
  function jobById(id) { return jobs().filter(function (j) { return j && j.id === id; })[0]; }
  function subById(id) { return SB.list.filter(function (s) { return s.id === id; })[0]; }
  function toast(t) { if (window.bpToast) bpToast(t); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function ownerId() { return (window.bpOwnerId && bpOwnerId()) || ''; }

  /* ------------------------------------------------------------- data --- */
  function saveLocal() { try { localStorage.setItem(LSK, JSON.stringify({ list: SB.list, docs: SB.docs })); } catch (e) {} }
  SB.load = function (force) {
    if (SB.loaded && !force) return Promise.resolve(SB);
    if (SB.busy && !force) return SB.busy;
    if (!live()) {
      try { var l = JSON.parse(localStorage.getItem(LSK) || '{}'); SB.list = l.list || []; SB.docs = l.docs || []; } catch (e) { SB.list = []; SB.docs = []; }
      SB.loaded = true; return Promise.resolve(SB);
    }
    SB.busy = Promise.all([
      Promise.resolve(BP_SB.from('subcontractors').select('*').order('company', { ascending: true })),
      Promise.resolve(BP_SB.from('sub_documents').select('*').order('expires', { ascending: false }))
    ]).then(function (r) {
      SB.list = (r[0] && r[0].data) || []; SB.docs = (r[1] && r[1].data) || []; SB.loaded = true; SB.busy = null; return SB;
    }, function () { SB.loaded = true; SB.busy = null; return SB; });
    return SB.busy;
  };
  function docsOf(id) { return SB.docs.filter(function (d) { return d.sub_id === id; }); }
  /* same rule as bp_sub_compliance() in the database */
  function docStatus(d) { if (d.kind === 'w9' || d.kind === 'other' || !d.expires) return 'valid'; var t = todayIso(); return d.expires < t ? 'expired' : d.expires <= addDays(t, 30) ? 'expiring' : 'valid'; }
  function compliance(id) {
    var latest = {};
    docsOf(id).forEach(function (d) { if (d.kind === 'other') return; var c = latest[d.kind]; if (!c || String(d.expires || '') > String(c.expires || '')) latest[d.kind] = d; });
    var sts = Object.keys(latest).map(function (k) { return docStatus(latest[k]); });
    var st = sts.indexOf('expired') >= 0 ? 'expired' : !latest.coi ? 'missing' : sts.indexOf('expiring') >= 0 ? 'expiring' : 'valid';
    return { status: st, coi: latest.coi || null, license: latest.license || null, w9: latest.w9 || null };
  }
  window.bpSubCompliance = compliance;
  var CL = { valid: ['ok', 'Insured', 'verified'], expiring: ['warn', 'Expiring', 'schedule'], expired: ['bad', 'Expired', 'error'], missing: ['bad', 'No COI', 'help'] };
  function compChip(st) { var c = CL[st] || CL.missing; return '<span class="sa-chip ' + c[0] + '"><span class="ms">' + c[2] + '</span>' + c[1] + '</span>'; }
  function compWarn(s, c) {
    if (!c || c.status === 'valid') return '';
    var t = c.status === 'expired' ? esc(s.company) + '’s insurance or license has expired' + (c.coi && c.coi.expires < todayIso() ? ' (COI ' + pretty(c.coi.expires) + ')' : '') + '. Ask for a current certificate before they’re on site.'
      : c.status === 'missing' ? 'No certificate of insurance on file for ' + esc(s.company) + '.'
      : esc(s.company) + '’s COI expires ' + pretty(c.coi && c.coi.expires) + '.';
    return '<div class="sj-warn' + (c.status === 'expiring' ? ' amber' : '') + '"><span class="ms">' + (c.status === 'expiring' ? 'schedule' : 'gpp_maybe') + '</span><span>' + t + '</span></div>';
  }

  /* per-job money for one sub */
  function moneyOf(j, sid) {
    var e = arr(j.subs).filter(function (x) { return x.subId === sid; })[0] || {};
    var inv = arr(j.subInvoices).filter(function (x) { return x.subId === sid; }), co = arr(j.subChangeOrders).filter(function (x) { return x.subId === sid; });
    var sum = function (l, st) { return l.filter(function (x) { return st.indexOf(x.status) >= 0; }).reduce(function (t, x) { return t + (+x.amount || 0); }, 0); };
    var price = num(e.price), coA = sum(co, ['approved']);
    return { price: price, co: coA, contract: price + coA, invoiced: sum(inv, ['submitted', 'approved', 'paid']), approved: sum(inv, ['approved']), paid: sum(inv, ['paid']),
      pending: inv.filter(function (x) { return x.status === 'submitted'; }).length + co.filter(function (x) { return x.status === 'requested'; }).length };
  }
  function jobsOfSub(sid) { return jobs().filter(function (j) { return j && arr(j.subs).some(function (x) { return x.subId === sid; }); }); }
  function newCount(j) { return arr(j.subInvoices).filter(function (x) { return x.status === 'submitted'; }).length + arr(j.subChangeOrders).filter(function (x) { return x.status === 'requested'; }).length; }
  window.bpSubsNewCount = function (j) { return j ? newCount(j) : jobs().reduce(function (t, x) { return t + (x ? newCount(x) : 0); }, 0); };
  function ratingOf(sid) {
    var list = SB.reviews || [];
    var rs = list.filter(function (r) { return r.sub_id === sid; });
    return { n: rs.length, avg: rs.length ? rs.reduce(function (t, r) { return t + (+r.rating || 0); }, 0) / rs.length : 0, list: rs };
  }
  function loadReviews() {
    if (!live()) return Promise.resolve();
    return Promise.resolve(BP_SB.from('worker_reviews').select('sub_id,rating,comment,customer_name,created_at,job_id').not('sub_id', 'is', null).order('created_at', { ascending: false }).limit(500))
      .then(function (r) { SB.reviews = (r && r.data) || []; }).catch(function () {});
  }

  /* pull subs' submissions made since this page loaded the jobs */
  window.bpSubsRefresh = function () {
    if (!live() || (window.bpTeamIsCrew && bpTeamIsCrew())) return Promise.resolve(false);
    return Promise.resolve(BP_SB.from('portal_finance').select('jobs').maybeSingle()).then(function (r) {
      var srv = r && r.data && Array.isArray(r.data.jobs) ? r.data.jobs : null; if (!srv) return false;
      var changed = false, rank = { submitted: 0, requested: 0, approved: 1, rejected: 1, paid: 2 };
      jobs().forEach(function (j) {
        var s = srv.filter(function (x) { return x && x.id === j.id; })[0]; if (!s) return;
        ['subInvoices', 'subChangeOrders'].forEach(function (k) {
          var gone = {}; arr(j[k + 'Gone']).concat(arr(s[k + 'Gone'])).forEach(function (g) { gone[g] = 1; });
          var mine = arr(j[k]);
          arr(s[k]).forEach(function (x) {
            if (!x || !x.id || gone[x.id]) return;
            var m = mine.filter(function (y) { return y.id === x.id; })[0];
            if (!m) { mine.push(x); changed = true; return; }
            if ((rank[x.status] || 0) > (rank[m.status] || 0)) { Object.assign(m, x); changed = true; }
            if (x.lienWaiver && x.lienWaiver.signedAt && !(m.lienWaiver && m.lienWaiver.signedAt)) { m.lienWaiver = x.lienWaiver; changed = true; }
          });
          var before = mine.length;
          mine = mine.filter(function (y) { return !(y && gone[y.id]); });
          if (mine.length !== before) changed = true;
          if (mine.length || j[k]) j[k] = mine;
          var gl = Object.keys(gone); if (gl.length && gl.length !== arr(j[k + 'Gone']).length) { j[k + 'Gone'] = gl; changed = true; }
        });
        ['photos', 'docs'].forEach(function (k) {   /* files a sub added */
          arr(s[k]).forEach(function (x) {
            var ref = typeof x === 'string' ? x : x && x.d;
            if (ref && String(ref).indexOf('/subs/') > 0 && !arr(j[k]).some(function (y) { return (typeof y === 'string' ? y : y && y.d) === ref; })) { j[k] = arr(j[k]).concat([x]); changed = true; }
          });
        });
      });
      if (changed) { try { localStorage.setItem('bpJobs', JSON.stringify(jobs())); } catch (e) {} }
      return changed;
    }).catch(function () { return false; });
  };

  /* ---------------------------------------------- Subcontractors page --- */
  window.bpSubsPage = function () {
    var a = $('bpxViewArea'); if (!a) return;
    a.innerHTML = '<div class="bpx-panel"><div class="bpx-mut">Loading subcontractors…</div></div>';
    Promise.all([SB.load(true), window.bpSubsRefresh(), loadReviews()]).then(draw, draw);
  };
  function rowData(s) {
    var c = compliance(s.id), js = jobsOfSub(s.id), act = js.filter(function (j) { return j.status !== 'done'; }), r = ratingOf(s.id);
    var owed = 0, pend = 0; js.forEach(function (j) { var m = moneyOf(j, s.id); owed += m.approved; pend += m.pending; });
    return { s: s, c: c, active: act.length, owed: owed, pend: pend, r: r };
  }
  function draw() {
    var a = $('bpxViewArea'); if (!a || window._bpCurView !== 'subs') { if (window.bpSpin) bpSpin(false); return; }
    var rows = SB.list.filter(function (s) { return s.active !== false; }).map(rowData);
    var bad = rows.filter(function (x) { return x.c.status !== 'valid'; }).length, owed = rows.reduce(function (t, x) { return t + x.owed; }, 0), pend = rows.reduce(function (t, x) { return t + x.pend; }, 0);
    var stars = function (r) { return r.n ? (window.bpStars ? bpStars(r.avg, 12) : '★') + ' <span class="bpx-mut" style="font-size:12px">' + r.avg.toFixed(1) + ' (' + r.n + ')</span>' : '<span class="bpx-mut">—</span>'; };
    var lbl = { valid: 'Insured', expiring: 'Expiring', expired: 'Expired', missing: 'No COI' };
    a.innerHTML = '<div class="sb-top"><div class="sb-kp"><div><small>Subcontractors</small><b>' + rows.length + '</b></div><div><small>Approved, unpaid</small><b>' + money0(owed) + '</b></div>'
        + '<div><small>Waiting on you</small><b>' + pend + '</b></div><div><small>Compliance issues</small><b style="color:' + (bad ? '#b42318' : 'inherit') + '">' + bad + '</b></div></div>'
        + '<button class="bpx-btn" style="width:auto;margin:0" onclick="bpSubEdit()"><span class="ms" style="font-size:18px;vertical-align:-4px">person_add</span> Add subcontractor</button></div>'
      + (rows.length ? '<div class="bpx-panel" style="padding:6px 8px"><table class="sb-tbl"><thead><tr><th>Company</th><th>Trade</th><th>Compliance</th><th>Rating</th><th class="n">Active jobs</th><th class="n">Owed</th></tr></thead><tbody>'
          + rows.map(function (x) {
              return '<tr class="sb-r" tabindex="0" onclick="bpSubProfile(\'' + x.s.id + '\')" onkeydown="if(event.key===\'Enter\')bpSubProfile(\'' + x.s.id + '\')"><td class="sb-co"><b>' + esc(x.s.company || 'Unnamed') + (x.pend ? '<span class="sb-new" title="Waiting on you">' + x.pend + '</span>' : '') + '</b><span>' + esc(x.s.contact_name || '') + (x.s.team_id ? ' · portal login' : '') + '</span></td>'
                + '<td>' + esc(x.s.trade || '—') + '</td><td><span class="sb-dot ' + x.c.status + '"></span>' + lbl[x.c.status] + '</td><td>' + stars(x.r) + '</td><td class="n">' + x.active + '</td><td class="n">' + money0(x.owed) + '</td></tr>';
            }).join('') + '</tbody></table>'
          + '<div class="sb-cards">' + rows.map(function (x) {
              return '<button class="sb-card" onclick="bpSubProfile(\'' + x.s.id + '\')"><div class="sa-jt"><b>' + esc(x.s.company || 'Unnamed') + (x.pend ? '<span class="sb-new">' + x.pend + '</span>' : '') + '</b>' + compChip(x.c.status) + '</div>'
                + '<div class="sb-cr"><span>' + esc(x.s.trade || 'Subcontractor') + '</span><span>' + x.active + ' active · owed ' + money0(x.owed) + '</span></div></button>';
            }).join('') + '</div></div>'
        : '<div class="bpx-panel ca-empty"><span class="ms">handyman</span><b>No subcontractors yet</b><p>Add the gutter guy, the electrician, the dumpster company. Put them on jobs with a price and scope, and they can log in to see the job, send invoices and keep their insurance current.</p>'
          + '<button class="bpx-btn" style="width:auto" onclick="bpSubEdit()">Add subcontractor</button></div>');
    if (window.bpSpin) bpSpin(false);
  }

  /* add / edit */
  window.bpSubEdit = function (id) {
    var s = id ? subById(id) : null; SB.edit = id || null;
    bpModal('<h3>' + (s ? 'Edit ' + esc(s.company) : 'Add a subcontractor') + '</h3><div class="bpx-sub">' + (s ? 'Changes save to this subcontractor everywhere.' : 'A company you hire for part of a job. They only ever see the jobs you put them on.') + '</div>'
      + '<div class="sb-grid2"><div><label>Company</label><input id="sb-co" maxlength="120" placeholder="Gutter Pros LLC" value="' + esc(s ? s.company : '') + '"></div>'
      + '<div><label>Trade</label><input id="sb-tr" list="sb-trl" maxlength="60" placeholder="Gutters" value="' + esc(s ? s.trade : '') + '"><datalist id="sb-trl">' + TRADES.map(function (t) { return '<option value="' + t + '">'; }).join('') + '</datalist></div>'
      + '<div><label>Contact name</label><input id="sb-cn" maxlength="120" value="' + esc(s ? s.contact_name : '') + '"></div>'
      + '<div><label>Phone</label><input id="sb-ph" maxlength="40" inputmode="tel" value="' + esc(s ? s.phone : '') + '"></div></div>'
      + '<label>Email</label><input id="sb-em" type="email" maxlength="200" placeholder="office@gutterpros.com" value="' + esc(s ? s.email : '') + '"' + (s && s.team_id ? ' disabled title="Their login email"' : '') + '>'
      + '<label class="sb-check"><input type="checkbox" id="sb-lw"' + (s && s.lien_waiver_required ? ' checked' : '') + '> Require a signed lien waiver with each invoice</label>'
      + '<label>Notes</label><textarea id="sb-no" rows="2" maxlength="4000" style="width:100%">' + esc(s ? s.notes : '') + '</textarea>'
      + (!s || !s.team_id ? '<label class="sb-check"><input type="checkbox" id="sb-inv"' + (s ? '' : ' checked') + '> Send them a portal invite by email</label>' : '')
      + '<div class="ca-msg" id="sb-msg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="' + (s ? 'bpSubProfile(\'' + s.id + '\')' : 'bpCloseModal()') + '">Cancel</button><button class="bpx-btn" id="sb-go" onclick="bpSubSave()">' + (s ? 'Save' : 'Add subcontractor') + '</button></div>');
    setTimeout(function () { var c = $('sb-co'); if (c) c.focus(); }, 30);
  };
  function smsg(t, bad) { var m = $('sb-msg'); if (m) { m.className = 'ca-msg ' + (bad ? 'bad' : 'ok'); m.textContent = t; } }
  window.bpSubSave = function () {
    var v = function (id) { return String(($(id) || {}).value || '').trim(); };
    var row = { company: v('sb-co'), trade: v('sb-tr'), contact_name: v('sb-cn'), phone: v('sb-ph'), notes: v('sb-no'), lien_waiver_required: !!($('sb-lw') || {}).checked };
    var em = v('sb-em').toLowerCase(), wantInv = !!($('sb-inv') || {}).checked, old = SB.edit ? subById(SB.edit) : null;
    if (!old || !old.team_id) row.email = em;
    if (!row.company) { smsg('Give the company a name.', true); return; }
    if (wantInv && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { smsg('Add their email to send an invite.', true); return; }
    var go = $('sb-go'); if (go) { go.disabled = true; go.textContent = 'Saving…'; }
    var p;
    if (!live()) {
      if (old) Object.assign(old, row); else { old = Object.assign({ id: uuid(), owner: ownerId(), active: true, created_at: new Date().toISOString(), team_id: null }, row); SB.list.push(old); }
      saveLocal(); p = Promise.resolve(old);
    } else if (old) {
      p = Promise.resolve(BP_SB.from('subcontractors').update(row).eq('id', old.id).select('*').single()).then(function (r) { if (r.error) throw r.error; Object.assign(old, r.data); return old; });
    } else {
      p = Promise.resolve(BP_SB.from('subcontractors').insert(Object.assign({ owner: ownerId() || undefined }, row)).select('*').single()).then(function (r) { if (r.error) throw r.error; SB.list.push(r.data); return r.data; });
    }
    p.then(function (s) {
      /* names on jobs follow the record */
      var js = jobs(), ch = false; js.forEach(function (j) { arr(j.subs).forEach(function (e) { if (e.subId === s.id && (e.name !== s.company || e.trade !== s.trade)) { e.name = s.company; e.trade = s.trade; ch = true; } }); });
      if (ch && typeof bpJobsSet === 'function') bpJobsSet(js);
      if (wantInv && !s.team_id) return invite(s).then(function (m) { bpSubProfile(s.id); setTimeout(function () { pmsg(m.t, m.bad); }, 50); });
      bpSubProfile(s.id);
      if (window._bpCurView === 'subs') draw();
    }).catch(function (e) { if (go) { go.disabled = false; go.textContent = 'Save'; } smsg('Couldn’t save' + (/subcontractors/.test(String(e && e.message)) ? ': the subcontractor tables aren’t set up yet.' : '. Try again.'), true); });
  };
  function invite(s) {
    if (!live() || !window.bpAuthApi) return Promise.resolve({ t: 'Saved. Sign in to send portal invites.', bad: true });
    return Promise.resolve(bpAuthApi(window.TEAM_URL, { op: 'invite', role: 'sub', subId: s.id, email: s.email, name: (s.contact_name || s.company) + (s.contact_name && s.company ? ' (' + s.company + ')' : '') }))
      .then(function (r) {
        if (!r || !r.ok) return { t: (r && r.reason) || 'Saved, but the invite didn’t go out.', bad: true };
        s.team_id = r.member && r.member.id;
        return { t: r.emailed ? 'Invite sent to ' + s.email + '. They set a password and see only their jobs.' : r.note === 'already_has_account' ? s.email + ' already has a login; they just sign in.' : 'Added. The email didn’t go out, so tell them to sign in with ' + s.email + '.' };
      }).catch(function () { return { t: 'Saved, but the team service didn’t answer. Try Invite again.', bad: true }; });
  }
  window.bpSubInvite = function (id) {
    var s = subById(id); if (!s) return;
    if (!s.email) { bpSubEdit(id); setTimeout(function () { smsg('Add their email first.', true); }, 40); return; }
    pmsg('Sending invite…');
    invite(s).then(function (m) { bpSubProfile(id); setTimeout(function () { pmsg(m.t, m.bad); }, 50); });
  };
  function pmsg(t, bad) { var m = $('sbp-msg'); if (m) { m.className = 'ca-msg ' + (bad ? 'bad' : 'ok'); m.textContent = t; } }
  window.bpSubArchive = function (id) {
    var s = subById(id); if (!s) return;
    if (!(window.bpAskDel ? bpAskDel(s.company, 'They come off your list. Past jobs, invoices and reviews stay. Remove their portal login under Settings › Team.') : confirm('Remove ' + s.company + '?'))) return;
    s.active = false;
    (live() ? Promise.resolve(BP_SB.from('subcontractors').update({ active: false }).eq('id', id)) : Promise.resolve(saveLocal())).then(function () { bpCloseModal(); if (window._bpCurView === 'subs') draw(); });
  };

  /* profile */
  window.bpSubProfile = function (id) {
    var s = subById(id); if (!s) return; SB.open = id;
    var c = compliance(id), js = jobsOfSub(id), r = ratingOf(id), docs = docsOf(id);
    var invs = []; js.forEach(function (j) { arr(j.subInvoices).forEach(function (i) { if (i.subId === id) invs.push([j, i]); }); });
    invs.sort(function (a, b) { return (+b[1].at || 0) - (+a[1].at || 0); });
    var tot = { c: 0, p: 0, o: 0 }; js.forEach(function (j) { var m = moneyOf(j, id); tot.c += m.contract; tot.p += m.paid; tot.o += m.approved; });
    bpModal('<div class="sb-prof"><div class="sa-coh"><span class="sa-logo">' + esc(String(s.company || '?').slice(0, 2).toUpperCase()) + '</span><div><h3 style="margin:0">' + esc(s.company) + '</h3><span>' + esc(s.trade || 'Subcontractor') + (s.contact_name ? ' · ' + esc(s.contact_name) : '') + '</span></div><span style="flex:1"></span>' + compChip(c.status) + '</div>'
      + compWarn(s, c)
      + '<dl class="cs-kv"><div><dt>Email</dt><dd>' + (s.email ? '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a>' : '—') + '</dd></div><div><dt>Phone</dt><dd>' + (s.phone ? '<a href="tel:' + esc(s.phone) + '">' + esc(s.phone) + '</a>' : '—') + '</dd></div>'
      + '<div><dt>Portal</dt><dd>' + (s.team_id ? 'Has a login' : '<button class="bpx-rowbtn" onclick="bpSubInvite(\'' + id + '\')">Send invite</button>') + '</dd></div>'
      + '<div><dt>Lien waivers</dt><dd>' + (s.lien_waiver_required ? 'Required with every invoice' : 'Not required') + '</dd></div>'
      + '<div><dt>Rating</dt><dd>' + (r.n ? (window.bpStars ? bpStars(r.avg, 13) : '') + ' ' + r.avg.toFixed(1) + ' (' + r.n + ')' : '—') + '</dd></div>'
      + '<div><dt>Contract value</dt><dd>' + money0(tot.c) + ' · paid ' + money0(tot.p) + ' · owed ' + money0(tot.o) + '</dd></div></dl>'
      + (s.notes ? '<p class="cs-notes" style="margin-top:8px">' + esc(s.notes) + '</p>' : '')
      + '<div class="ca-msg" id="sbp-msg"></div>'
      + '<div class="sb-sec"><h5>Compliance documents</h5>' + (docs.length ? '<div class="sa-list">' + docs.map(function (d) {
          return '<div class="sa-row"><div class="sa-rm"><b>' + esc(KINDS[d.kind] || 'Document') + (d.number ? ' · #' + esc(d.number) : '') + '</b><span>' + (d.expires ? 'Expires ' + pretty(d.expires) : 'No expiry') + ' · ' + (d.added_by === 'sub' ? 'uploaded by them' : 'added by you') + '</span></div>'
            + '<div class="sa-ra">' + (d.kind === 'coi' || d.kind === 'license' ? compChip(docStatus(d)) : '') + (d.file ? '<button class="bpx-rowbtn" onclick="bpSubOpenDoc(\'' + esc(d.file) + '\')">View</button>' : '')
            + '<button class="cm-rm" aria-label="Delete document" onclick="bpSubsDocDel(\'' + d.id + '\')"><span class="ms">delete</span></button></div></div>';
        }).join('') + '</div>' : '<div class="bpx-mut" style="font-size:13px">Nothing on file. They can upload from their portal, or add one here.</div>')
        + '<div id="sbp-dform"><button class="bpx-rowbtn" style="margin-top:6px" onclick="bpSubsDocForm(\'' + id + '\')"><span class="ms" style="font-size:15px;vertical-align:-3px">upload</span> Add document</button></div></div>'
      + '<div class="sb-sec"><h5>Jobs</h5>' + (js.length ? '<div class="sa-list">' + js.map(function (j) { var m = moneyOf(j, id);
          return '<div class="sa-row"><div class="sa-rm"><b>' + esc(j.title || j.name || 'Project') + '</b><span>' + esc(j.addr || '') + ' · ' + (j.status === 'done' ? 'Done' : 'Active') + '</span><span>Agreed ' + money0(m.contract) + ' · paid ' + money0(m.paid) + ' · owed ' + money0(m.approved) + (m.pending ? ' · <b style="color:#b42318">' + m.pending + ' waiting</b>' : '') + '</span></div>'
            + '<div class="sa-ra"><button class="bpx-rowbtn" onclick="bpSubOpenJob(\'' + esc(j.id) + '\')">Open</button></div></div>'; }).join('') + '</div>'
        : '<div class="bpx-mut" style="font-size:13px">Not on any job yet. Open a project › Subs to put them on one.</div>') + '</div>'
      + '<div class="sb-sec"><h5>Invoices</h5>' + (invs.length ? '<div class="sa-list">' + invs.slice(0, 12).map(function (x) { return itemRow(x[0], x[1], 'inv', true); }).join('') + '</div>' : '<div class="bpx-mut" style="font-size:13px">No invoices yet.</div>') + '</div>'
      + '<div class="sb-sec"><h5>Reviews</h5>' + (r.list.length ? r.list.slice(0, 5).map(function (x) { return '<div class="rv-rev"><div class="rv-revh">' + (window.bpStars ? bpStars(+x.rating || 0, 13) : '') + '<b>' + esc(String(x.customer_name || 'Customer').split(' ')[0]) + '</b><em>' + pretty(x.created_at) + '</em></div>' + (x.comment ? '<p>' + esc(x.comment) + '</p>' : '') + '</div>'; }).join('')
        : '<div class="bpx-mut" style="font-size:13px">No ratings yet. The review link you send after Mark done includes the subs on the job.</div>') + '</div>'
      + '<div class="row" style="justify-content:space-between"><button class="bpx-btn ghost" style="color:#b42318" onclick="bpSubArchive(\'' + id + '\')">Remove</button><span style="flex:1"></span><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button><button class="bpx-btn" onclick="bpSubEdit(\'' + id + '\')">Edit</button></div></div>');
  };
  window.bpSubOpenDoc = function (ref) { if (window.bpPF && bpPF.open) bpPF.open(ref); };
  window.bpSubOpenJob = function (jid) { bpCloseModal(); setTimeout(function () { if (window.bpProjOpen) { bpProjOpen(jid); setTimeout(function () { if (window.bpProjTab) bpProjTab('subs'); }, 40); } }, 260); };
  window.bpSubsDocForm = function (id) {
    var h = $('sbp-dform'); if (!h) return;
    h.innerHTML = '<div class="cm-form"><div class="cm-h">Add a document</div><label>Type<select id="sbd-k">' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '">' + KINDS[k] + '</option>'; }).join('') + '</select></label>'
      + '<label>Number<input id="sbd-n" maxlength="80" placeholder="Optional"></label><label>Expires<input type="date" id="sbd-e"></label>'
      + '<label>File<input type="file" id="sbd-f" accept="image/*,application/pdf"></label>'
      + '<div class="sa-fa"><button class="bpx-btn ghost" onclick="bpSubProfile(\'' + id + '\')">Cancel</button><button class="bpx-btn" id="sbd-go" onclick="bpSubsDocAdd(\'' + id + '\')">Add</button></div></div>';
  };
  window.bpSubsDocAdd = function (id) {
    var k = $('sbd-k').value, n = $('sbd-n').value.trim(), e = $('sbd-e').value, f = $('sbd-f').files && $('sbd-f').files[0], go = $('sbd-go');
    if ((k === 'coi' || k === 'license') && !e) { pmsg('Add the expiry date.', true); return; }
    if (f && f.size > 25 * 1024 * 1024) { pmsg('Files must be under 25 MB.', true); return; }
    if (go) { go.disabled = true; go.textContent = 'Saving…'; }
    var row = { sub_id: id, kind: k, number: n, expires: e || null, name: f ? f.name : '', added_by: 'owner' };
    var up = (f && live()) ? Promise.resolve(BP_SB.storage.from('project-files').upload(ownerId() + '/subs/' + id + '/docs/' + Date.now().toString(36) + '-' + String(f.name).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-60), f, { contentType: f.type || 'application/octet-stream' }))
        .then(function (r) { if (r && r.error) throw r.error; return 'sb:' + r.data.path; }) : Promise.resolve('');
    up.then(function (ref) {
      row.file = ref;
      if (!live()) { row.id = uuid(); row.created_at = new Date().toISOString(); SB.docs.unshift(row); saveLocal(); return; }
      return Promise.resolve(BP_SB.from('sub_documents').insert(Object.assign({ owner: ownerId() || undefined }, row)).select('*').single()).then(function (r) { if (r.error) throw r.error; SB.docs.unshift(r.data); });
    }).then(function () { bpSubProfile(id); if (window._bpCurView === 'subs') draw(); })
      .catch(function () { if (go) { go.disabled = false; go.textContent = 'Add'; } pmsg('Couldn’t save the document. Try again.', true); });
  };
  window.bpSubsDocDel = function (docId) {
    var d = SB.docs.filter(function (x) { return x.id === docId; })[0]; if (!d || !confirm('Delete this document?')) return;
    (live() ? Promise.resolve(BP_SB.from('sub_documents').delete().eq('id', docId)) : Promise.resolve()).then(function () {
      if (live() && d.file && window.bpPF) bpPF.remove(d.file);
      SB.docs = SB.docs.filter(function (x) { return x.id !== docId; }); saveLocal(); bpSubProfile(d.sub_id); if (window._bpCurView === 'subs') draw();
    });
  };

  /* ---------------------------------------------- invoices / change orders --- */
  var STL = { submitted: ['wait', 'New'], approved: ['info', 'Approved'], paid: ['ok', 'Paid'], rejected: ['bad', 'Rejected'], requested: ['wait', 'New'] };
  function stChip(st) { var m = STL[st] || ['wait', st]; return '<span class="cm-st ' + m[0] + '">' + esc(m[1]) + '</span>'; }
  function itemRow(j, x, kind, withJob) {
    var s = subById(x.subId), who = (s && s.company) || (arr(j.subs).filter(function (e) { return e.subId === x.subId; })[0] || {}).name || 'Subcontractor';
    var w = x.lienWaiver || {}, needW = kind === 'inv' && w.required && !w.signedAt;
    var b = function (act, t, cls, dis, title) { return '<button class="' + (cls || '') + '"' + (dis ? ' disabled' : '') + (title ? ' title="' + esc(title) + '"' : '') + ' onclick="bpSubAct(\'' + esc(j.id) + '\',\'' + kind + '\',\'' + esc(x.id) + '\',\'' + act + '\')">' + t + '</button>'; };
    var acts = '';
    if (kind === 'inv') {
      if (x.status === 'submitted') acts = b('approve', 'Approve', 'ok') + b('reject', 'Reject', 'no');
      else if (x.status === 'approved') acts = b('paid', 'Mark paid', 'ok', needW, needW ? 'Waiting on their signed lien waiver' : '');
    } else if (x.status === 'requested') acts = b('approve', 'Approve', 'ok') + b('reject', 'Reject', 'no');
    return '<div class="sj-it" data-sj-item="' + esc(x.id) + '"><div class="sj-im"><b>' + money(x.amount) + '</b> ' + stChip(x.status)
      + (kind === 'inv' && w.required ? (w.signedAt ? ' <span class="cm-st ok">Waiver signed' + (w.signedName ? ' · ' + esc(w.signedName) : '') + '</span>' : ' <span class="cm-st wait">Waiver not signed</span>') : '')
      + '<span class="sj-meta">' + (withJob ? esc(j.title || j.name || 'Project') + ' · ' : esc(who) + ' · ') + pretty(x.at) + (x.paidAt ? ' · paid ' + pretty(x.paidAt) : '') + '</span>'
      + ((kind === 'inv' ? x.note : x.desc) ? '<span class="sj-meta" style="color:var(--ink)">' + esc(kind === 'inv' ? x.note : x.desc) + '</span>' : '') + '</div>'
      + '<div class="sj-acts">' + (x.file ? '<button onclick="bpSubOpenDoc(\'' + esc(x.file) + '\')">Invoice file</button>' : '') + (w.file ? '<button onclick="bpSubOpenDoc(\'' + esc(w.file) + '\')">Waiver</button>' : '') + acts + '</div></div>';
  }
  function expOf(j, x) {
    var s = subById(x.subId), who = (s && s.company) || (arr(j.subs).filter(function (e) { return e.subId === x.subId; })[0] || {}).name || 'Subcontractor';
    return { cat: 'Subcontractor', amt: Math.round((+x.amount || 0) * 100) / 100, note: who + ' invoice' + (x.note ? ': ' + x.note : ''), key: 'subinv:' + x.id, when: Date.now(), subInvoiceId: x.id, subId: x.subId };
  }
  window.bpSubAct = function (jid, kind, id, act) {
    var all = jobs(), j = all.filter(function (x) { return x.id === jid; })[0]; if (!j) return;
    var list = arr(j[kind === 'inv' ? 'subInvoices' : 'subChangeOrders']), x = list.filter(function (y) { return y.id === id; })[0]; if (!x) return;
    if (kind === 'inv' && act === 'paid' && x.lienWaiver && x.lienWaiver.required && !x.lienWaiver.signedAt) { toast('Their lien waiver isn’t signed yet.'); return; }
    if (act === 'reject' && !confirm('Reject this ' + (kind === 'inv' ? 'invoice' : 'change order') + '? They’ll see it was rejected; message them why.')) return;
    x.status = act === 'approve' ? 'approved' : act === 'reject' ? 'rejected' : 'paid';
    x.decidedAt = Date.now();
    if (act === 'paid') x.paidAt = Date.now();
    if (kind === 'inv' && act === 'approve') {
      j.expenses = arr(j.expenses);
      var key = 'subinv:' + x.id;
      if (!j.expenses.some(function (e) { return e && e.key === key; })) {
        var e = expOf(j, x); j.expenses.push(e);
        /* the project sheet keeps its own copy of expenses until Save */
        if (window._bpProjId === jid && Array.isArray(window._bpProjExp) && !window._bpProjExp.some(function (y) { return y && y.key === key; })) {
          window._bpProjExp.push(Object.assign({}, e)); if (window.bpProjExpRender) try { bpProjExpRender(); } catch (er) {}
        }
      }
    }
    bpJobsSet(all);
    toast(kind === 'inv' ? (act === 'approve' ? 'Invoice approved. It’s now a Subcontractor cost on the job.' : act === 'paid' ? 'Marked paid.' : 'Invoice rejected.') : (act === 'approve' ? 'Change order approved. The agreed amount went up.' : 'Change order rejected.'));
    if ($('bpx-pj-subs')) window.bpSubsTab(j);
    else if (SB.open && $('sbp-msg')) bpSubProfile(SB.open);
    if (window._bpCurView === 'subs') draw();
  };

  /* --------------------------------------------- project sheet: Subs tab --- */
  window.bpSubsTab = function (j) {
    j = j || jobById(window._bpProjId);
    var h = $('bpx-pj-subs'); if (!h || !j) return;
    var es = arr(j.subs), tot = { c: 0, i: 0, p: 0, o: 0 };
    es.forEach(function (e) { var m = moneyOf(j, e.subId); tot.c += m.contract; tot.i += m.invoiced; tot.p += m.paid; tot.o += m.approved; });
    var gone = function (x) { return !es.some(function (e) { return e.subId === x.subId; }); };
    var orphan = arr(j.subInvoices).filter(gone).map(function (x) { return [x, 'inv']; }).concat(arr(j.subChangeOrders).filter(gone).map(function (x) { return [x, 'co']; }));
    h.innerHTML = '<section class="pjs-sec"><div class="pjs-h">Subcontractors on this job</div>'
      + (es.length ? '<div class="sj-tot"><span>Agreed <b>' + money0(tot.c) + '</b></span><span>Invoiced <b>' + money0(tot.i) + '</b></span><span>Paid <b>' + money0(tot.p) + '</b></span><span>Owed <b>' + money0(tot.o) + '</b></span></div>' : '')
      + es.map(function (e) {
          var s = subById(e.subId) || { company: e.name, trade: e.trade }, c = subById(e.subId) ? compliance(e.subId) : null, m = moneyOf(j, e.subId);
          var inv = arr(j.subInvoices).filter(function (x) { return x.subId === e.subId; }).slice().reverse(), co = arr(j.subChangeOrders).filter(function (x) { return x.subId === e.subId; }).slice().reverse();
          var sc = e.siteContact || {};
          return '<div class="sj-card"><div class="sj-h"><div><b>' + esc(s.company || e.name || 'Subcontractor') + '</b><span>' + esc(s.trade || e.trade || '') + (e.startDate ? ' · ' + pretty(e.startDate) + (e.endDate ? ' – ' + pretty(e.endDate) : '') : '')
              + (sc.name || sc.phone ? ' · site: ' + esc([sc.name, sc.phone].filter(Boolean).join(' ')) : '') + '</span></div>'
            + '<div style="display:flex;gap:6px;align-items:center">' + (c ? compChip(c.status) : '') + '<button class="bpx-rowbtn" onclick="bpSubAssign(\'' + esc(e.subId) + '\')">Edit</button></div></div>'
            + (c ? compWarn(s, c) : '')
            + (e.scope ? '<p class="sj-scope">' + esc(e.scope) + '</p>' : '')
            + '<div class="sj-money"><div><small>Agreed</small><b>' + money0(m.price) + '</b></div><div><small>+ Change orders</small><b>' + money0(m.co) + '</b></div><div><small>Paid</small><b>' + money0(m.paid) + '</b></div><div><small>Owed now</small><b>' + money0(m.approved) + '</b></div></div>'
            + ((inv.length || co.length) ? '<div class="sj-items">' + (inv.length ? '<h6>Invoices</h6>' + inv.map(function (x) { return itemRow(j, x, 'inv'); }).join('') : '')
                + (co.length ? '<h6>Change orders</h6>' + co.map(function (x) { return itemRow(j, x, 'co'); }).join('') : '') + '</div>' : '<div class="bpx-mut" style="font-size:12.5px">No invoices or change orders yet.</div>')
            + '</div>';
        }).join('')
      + (orphan.length ? '<div class="sj-card"><div class="sj-h"><div><b>From subs no longer on this job</b></div></div><div class="sj-items">' + orphan.map(function (x) { return itemRow(j, x[0], x[1]); }).join('') + '</div></div>' : '')
      + (!es.length ? '<div class="pjs-empty sm"><span class="ms">handyman</span><b>No subcontractors on this job</b><p>Put a sub on it with a price and scope. They’ll see the address, the site contact and their scope, never the homeowner’s details or your numbers.</p></div>' : '')
      + '<div id="sj-form"></div><button type="button" class="pm-btn" id="sj-add" onclick="bpSubAssign()"><span class="ms">add</span>Assign a subcontractor</button></section>';
    var tb = document.querySelector('[data-pj-tab="subs"] .pjs-n'); if (tb) { var n = newCount(j); tb.textContent = n ? String(n) : (es.length ? String(es.length) : ''); tb.classList.toggle('sj-hot', !!n); }
  };
  window.bpSubAssign = function (sid) {
    var j = jobById(window._bpProjId), h = $('sj-form'); if (!j || !h) return;
    var e = sid ? arr(j.subs).filter(function (x) { return x.subId === sid; })[0] : null;
    var avail = SB.list.filter(function (s) { return s.active !== false && (s.id === sid || !arr(j.subs).some(function (x) { return x.subId === s.id; })); });
    if (!avail.length && !e) {
      h.innerHTML = '<div class="cm-form"><div>No subcontractors to add yet.</div><div class="sa-fa"><button class="bpx-btn" onclick="bpCloseModal();setTimeout(function(){bpNav(\'subs\');bpSubEdit()},260)">Add a subcontractor</button></div></div>';
      return;
    }
    var sc = (e && e.siteContact) || {};
    h.innerHTML = '<div class="cm-form"><div class="cm-h">' + (e ? 'Edit ' + esc(e.name || 'assignment') : 'Assign a subcontractor') + '</div>'
      + '<label>Subcontractor<select id="sj-sub" onchange="bpSubAssignWarn()"' + (e ? ' disabled' : '') + '>' + avail.map(function (s) { return '<option value="' + s.id + '"' + (s.id === sid ? ' selected' : '') + '>' + esc(s.company) + (s.trade ? ' · ' + esc(s.trade) : '') + '</option>'; }).join('') + '</select></label>'
      + '<div id="sj-warn"></div>'
      + '<label>Agreed price<input id="sj-price" inputmode="decimal" placeholder="0.00" value="' + esc(e && e.price ? e.price : '') + '"></label>'
      + '<label>Scope of work<textarea id="sj-scope" rows="3" maxlength="2000" placeholder="e.g. Remove and haul old gutters; install 160 lf 6&quot; seamless + 6 downspouts">' + esc(e ? e.scope || '' : '') + '</textarea></label>'
      + '<div class="sb-grid2"><label>Start<input type="date" id="sj-start" value="' + esc(e ? e.startDate || '' : '') + '"></label><label>Finish<input type="date" id="sj-end" value="' + esc(e ? e.endDate || '' : '') + '"></label>'
      + '<label>Site contact<input id="sj-scn" maxlength="80" placeholder="e.g. Mark, foreman" value="' + esc(sc.name || '') + '"></label><label>Site contact phone<input id="sj-scp" maxlength="40" inputmode="tel" value="' + esc(sc.phone || '') + '"></label></div>'
      + '<label>Lien waiver<select id="sj-lw"><option value="">As set on the subcontractor</option><option value="1"' + (e && e.lienWaiver === true ? ' selected' : '') + '>Required on this job</option><option value="0"' + (e && e.lienWaiver === false ? ' selected' : '') + '>Not required on this job</option></select></label>'
      + '<div class="bpx-mut" style="font-size:12px">They see the job address and this site contact, never the homeowner’s name, phone or email.</div>'
      + '<div class="ca-msg" id="sj-msg"></div>'
      + '<div class="sa-fa">' + (e ? '<button class="bpx-btn ghost" style="color:#b42318;margin-right:auto" onclick="bpSubUnassign(\'' + esc(sid) + '\')">Take off job</button>' : '') + '<button class="bpx-btn ghost" onclick="document.getElementById(\'sj-form\').innerHTML=\'\';document.getElementById(\'sj-add\').hidden=false">Cancel</button><button class="bpx-btn" onclick="bpSubAssignSave()">' + (e ? 'Save' : 'Assign') + '</button></div></div>';
    var add = $('sj-add'); if (add) add.hidden = true;
    bpSubAssignWarn();
    if (h.scrollIntoView) h.scrollIntoView({ block: 'nearest' });
  };
  window.bpSubAssignWarn = function () {
    var id = ($('sj-sub') || {}).value, s = subById(id), w = $('sj-warn'); if (!w) return;
    w.innerHTML = s ? compWarn(s, compliance(id)) : '';
  };
  window.bpSubAssignSave = function () {
    var all = jobs(), j = all.filter(function (x) { return x.id === window._bpProjId; })[0]; if (!j) return;
    var id = ($('sj-sub') || {}).value, s = subById(id); if (!s) return;
    var price = String(($('sj-price') || {}).value || '').replace(/[$,\s]/g, '');
    if (price && !/^\d{1,7}(\.\d{1,2})?$/.test(price)) { var m = $('sj-msg'); if (m) { m.className = 'ca-msg bad'; m.textContent = 'Price has to be a number, like 4800.'; } return; }
    var lw = ($('sj-lw') || {}).value;
    var e = { subId: id, name: s.company, trade: s.trade || '', scope: String(($('sj-scope') || {}).value || '').trim(), price: price ? +price : 0,
      startDate: ($('sj-start') || {}).value || '', endDate: ($('sj-end') || {}).value || '',
      siteContact: { name: String(($('sj-scn') || {}).value || '').trim(), phone: String(($('sj-scp') || {}).value || '').trim() } };
    if (lw === '1') e.lienWaiver = true; else if (lw === '0') e.lienWaiver = false;
    j.subs = arr(j.subs);
    var i = -1; j.subs.forEach(function (x, k) { if (x.subId === id) i = k; });
    if (i >= 0) j.subs[i] = e; else j.subs.push(e);
    bpJobsSet(all);
    var c = compliance(id);
    toast(c.status === 'expired' || c.status === 'missing' ? s.company + ' is on the job, but has no current insurance on file.' : s.company + (i >= 0 ? ' updated.' : ' is on this job.'));
    bpSubsTab(j);
  };
  window.bpSubUnassign = function (sid) {
    var all = jobs(), j = all.filter(function (x) { return x.id === window._bpProjId; })[0]; if (!j) return;
    var e = arr(j.subs).filter(function (x) { return x.subId === sid; })[0];
    if (!confirm('Take ' + ((e && e.name) || 'this sub') + ' off the job? Their invoices and change orders stay on the job.')) return;
    j.subs = arr(j.subs).filter(function (x) { return x.subId !== sid; });
    bpJobsSet(all); bpSubsTab(j);
  };

  /* the tab: built by projsheet.js; filled here, with fresh submissions */
  window.bpSubsTabOpen = function (j) {
    if (window.bpTeamIsCrew && bpTeamIsCrew()) return;
    Promise.all([SB.load(), window.bpSubsRefresh()]).then(function () { window.bpSubsTab(j && jobById(j.id)); });
  };
})();
