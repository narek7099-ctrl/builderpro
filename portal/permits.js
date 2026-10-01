/* ==================================================================
   Permits (per project) and licenses & insurance (per company).

   Permits live on the job record, job.permits = [{id, type, number,
   office, status, applied, approved, expires, inspections:[{date, kind,
   result}], fee, feePaid, doc:{n,t,d}, notes}], so they sync to the cloud
   with the rest of the job (bpJobsSet -> bpFinCloudPush). A paid fee posts
   one 'Permits' expense on the job, keyed 'permit:<id>' so it is never
   counted twice, and the open project's expense draft is kept in step so
   Save in the project popup does not undo it.

   Licenses live in settings, bpSettings.licenses = [{id, type, cls,
   number, state, expires, doc}], pushed with bpSettingsPush. They show
   read-only at the top of every project's Permits tab.

   Documents go through the project-files helper (portal/pfiles.js): shown
   at once as a data URL, then swapped for a storage reference.
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var money = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : '$' + Math.round(+n || 0); };
  var parseMoney = function (s) { return window.bpParseMoney ? bpParseMoney(s) : (+String(s || '').replace(/[^0-9.]/g, '') || 0); };
  var uid = function (p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

  var TYPES = ['Building', 'Roofing', 'Electrical', 'Plumbing', 'Mechanical', 'Demolition', 'Other'];
  var STATUSES = ['Not applied', 'Applied', 'Approved', 'Inspection scheduled', 'Passed', 'Failed', 'Closed'];
  var RESULTS = ['Pending', 'Passed', 'Failed', 'Partial'];
  var TYPE_ICON = { Building: 'domain', Roofing: 'roofing', Electrical: 'electrical_services', Plumbing: 'plumbing', Mechanical: 'mode_fan', Demolition: 'hardware', Other: 'assignment' };
  var LIC_TYPES = ['Contractor license', 'General liability insurance', "Workers' comp insurance", 'Surety bond', 'Business license', 'Other'];

  /* ---------------------------------------------------------------- dates --- */
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function daysTo(iso) {
    if (!iso) return null;
    var a = new Date(todayIso() + 'T12:00:00'), b = new Date(iso + 'T12:00:00');
    if (isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }
  function pretty(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00'); if (isNaN(d.getTime())) return esc(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ---------------------------------------------------------------- state --- */
  function job(id) { return (window.bpJobsGet ? bpJobsGet() : []).filter(function (x) { return x.id === (id || window._bpProjId); })[0]; }
  function save() { try { bpJobsSet(bpJobsGet()); } catch (e) {} }
  var draft = null;          /* the permit being edited, or null */

  /* what a permit needs you to notice; each {cls, ico, t} */
  function flags(p) {
    var out = [], t = todayIso();
    var closed = p.status === 'Closed' || p.status === 'Passed';
    (p.inspections || []).forEach(function (x) {
      if (x.date === t && (!x.result || x.result === 'Pending')) out.push({ cls: 'info', ico: 'event_available', t: 'Inspection today' });
    });
    if (p.expires && !closed) {
      var d = daysTo(p.expires);
      if (d != null && d < 0) out.push({ cls: 'bad', ico: 'error', t: 'Expired ' + pretty(p.expires) });
      else if (d != null && d <= 14) out.push({ cls: 'warn', ico: 'schedule', t: d === 0 ? 'Expires today' : 'Expires in ' + d + (d === 1 ? ' day' : ' days') });
    }
    if (p.status === 'Failed') out.push({ cls: 'bad', ico: 'cancel', t: 'Failed inspection' });
    return out;
  }
  function statusCls(s) {
    return ({ 'Not applied': 'idle', Applied: 'info', Approved: 'ok', 'Inspection scheduled': 'info', Passed: 'ok', Failed: 'bad', Closed: 'done' })[s] || 'idle';
  }
  function badge(f) { return '<span class="pm-b ' + f.cls + '"><span class="ms">' + f.ico + '</span>' + esc(f.t) + '</span>'; }

  /* the one-line chip for project cards and lists */
  window.bpPermitChip = function (j) {
    var list = (j && j.permits) || []; if (!list.length) return '';
    var all = []; list.forEach(function (p) { all = all.concat(flags(p)); });
    var pick = all.filter(function (f) { return f.cls === 'bad'; })[0] || all.filter(function (f) { return f.cls === 'info'; })[0] || all.filter(function (f) { return f.cls === 'warn'; })[0];
    var cls, t;
    if (pick) { cls = pick.cls; t = pick.t; }
    else {
      var st = list.map(function (p) { return p.status; });
      if (st.every(function (s) { return s === 'Closed' || s === 'Passed'; })) { cls = 'ok'; t = 'Permits closed'; }
      else if (st.some(function (s) { return s === 'Approved' || s === 'Inspection scheduled'; })) { cls = 'ok'; t = 'Permit approved'; }
      else if (st.some(function (s) { return s === 'Applied'; })) { cls = 'info'; t = 'Permit applied'; }
      else { cls = 'idle'; t = 'Permit not applied'; }
      if (list.length > 1) t += ' · ' + list.length;
    }
    return '<span class="pm-chip ' + cls + '" title="Permits on this job"><span class="ms">assignment</span>' + esc(t) + '</span>';
  };

  /* ---------------------------------------------------------- fee expense --- */
  function syncFee(j, p) {
    var key = 'permit:' + p.id, amt = +p.fee || 0, on = !!p.feePaid && amt > 0 && !p.gone;
    var note = (p.type || 'Permit') + ' permit' + (p.number ? ' #' + p.number : '');
    j.expenses = (j.expenses || []).filter(function (e) { return e.key !== key; });
    if (on) j.expenses.push({ cat: 'Permits', amt: amt, note: note, key: key, at: Date.now() });
    /* the open popup edits a copy of the expenses; keep it in step */
    if (window._bpProjId === j.id && Array.isArray(window._bpProjExp)) {
      var dr = window._bpProjExp, k = -1;
      dr.forEach(function (e, i) { if (e.key === key) k = i; });
      if (on && k >= 0) { dr[k].amt = amt; dr[k].note = note; dr[k].cat = 'Permits'; }
      else if (on) dr.push({ cat: 'Permits', amt: amt, note: note, key: key });
      else if (k >= 0) dr.splice(k, 1);
      try { if (window.bpProjExpRender) bpProjExpRender(); } catch (e) {}
    }
  }

  /* --------------------------------------------------------- licenses strip --- */
  function licenses() { var s = window.bpSettingsGet ? bpSettingsGet() : {}; return Array.isArray(s.licenses) ? s.licenses : []; }
  function licFlag(l) {
    var d = daysTo(l.expires);
    if (d == null) return null;
    if (d < 0) return { cls: 'bad', ico: 'error', t: 'Expired' };
    if (d <= 30) return { cls: 'warn', ico: 'schedule', t: d === 0 ? 'Expires today' : d + (d === 1 ? ' day left' : ' days left') };
    return null;
  }
  function licLine(l) {
    return esc([l.state, l.cls].filter(Boolean).join(' ')) + (l.number ? ' #' + esc(l.number) : '');
  }
  function licStrip() {
    var L = licenses();
    if (!L.length) return '<div class="pm-lic none"><span class="ms">badge</span><div><b>No company license on file</b><small>Add your license and insurance once in Settings and it shows on every job.</small></div>'
      + '<button class="pm-btn ghost" onclick="bpPermitGoLicenses()">Add in Settings</button></div>';
    var main = L.filter(function (l) { return /license/i.test(l.type || ''); })[0] || L[0];
    var others = L.filter(function (l) { return l !== main; });
    var f = licFlag(main);
    var warnOthers = others.map(function (l) { var x = licFlag(l); return x ? badge({ cls: x.cls, ico: x.ico, t: (l.type || 'Document') + ': ' + x.t }) : ''; }).join('');
    return '<div class="pm-lic"><span class="ms">verified</span><div><b>Your license: ' + licLine(main) + '</b>'
      + '<small>' + esc(main.type || 'License') + (main.expires ? ', expires ' + pretty(main.expires) : '') + (others.length ? ' · ' + others.length + ' more on file' : '') + '</small>'
      + ((f || warnOthers) ? '<div class="pm-bs">' + (f ? badge(f) : '') + warnOthers + '</div>' : '') + '</div>'
      + '<button class="pm-btn ghost" onclick="bpPermitGoLicenses()">Manage</button></div>';
  }
  window.bpPermitGoLicenses = function () {
    if (window.bpCloseModal) bpCloseModal();
    try { window._bpSetSec = 'business'; } catch (e) {}
    if (window.bpNav) bpNav('settings');
    setTimeout(function () { if (window.bpSetTab) bpSetTab('business'); var c = document.getElementById('lic-card'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
  };

  /* ------------------------------------------------------------- the pane --- */
  window.bpPermitsRender = function (j) {
    j = j || job();
    var el = document.getElementById('bpx-pj-permits'); if (!el || !j) return;
    var list = j.permits || [];
    var h = '<section class="pjs-sec pm-licsec">' + licStrip() + '</section>';
    if (draft) h += '<section class="pjs-sec">' + form(draft) + '</section>';
    if (!list.length && !draft) {
      h += '<div class="pjs-empty"><span class="ms">assignment</span><b>No permits on this job yet</b>'
        + '<p>Track each permit from application to final inspection. A paid fee posts to this job\'s expenses.</p>'
        + '<button class="pm-btn" onclick="bpPermitNew()"><span class="ms">add</span>Add permit</button></div>';
    } else {
      var fee = list.reduce(function (s, p) { return s + (+p.fee || 0); }, 0), paid = list.reduce(function (s, p) { return s + (p.feePaid ? +p.fee || 0 : 0); }, 0);
      h += '<section class="pjs-sec"><div class="pm-head"><div><label class="pjs-h">Permits · ' + list.length + '</label>'
        + '<div class="bpx-mut" style="font-size:12px">' + money(fee) + ' in fees' + (fee ? ' · ' + money(paid) + ' paid' : '') + '</div></div>'
        + (draft ? '' : '<button class="pm-btn" onclick="bpPermitNew()"><span class="ms">add</span>Add permit</button>') + '</div>'
        + '<div class="pm-list">' + list.map(function (p) { return card(p, j); }).join('') + '</div></section>';
    }
    el.innerHTML = h;
    var tab = document.querySelector('[data-pj-tab="permits"] .pjs-n'); if (tab) tab.textContent = list.length ? String(list.length) : '';
    if (window.bpPF && bpPF.hydrate) bpPF.hydrate(el);
  };

  function card(p, j) {
    var fl = flags(p);
    var dates = [['Applied', p.applied], ['Approved', p.approved], ['Expires', p.expires]].filter(function (x) { return x[1]; })
      .map(function (x) { return '<span><small>' + x[0] + '</small>' + pretty(x[1]) + '</span>'; }).join('');
    var insp = (p.inspections || []).filter(function (x) { return x.date || x.kind; }).map(function (x) {
      var r = x.result || 'Pending';
      return '<li><span class="ms">' + (r === 'Passed' ? 'check_circle' : r === 'Failed' ? 'cancel' : 'pending') + '</span>' + (x.kind ? esc(x.kind) + ' · ' : '') + (x.date ? pretty(x.date) : 'no date') + ' <em class="' + r.toLowerCase() + '">' + esc(r) + '</em></li>';
    }).join('');
    return '<article class="pm-card" data-permit="' + esc(p.id) + '">'
      + '<div class="pm-top"><span class="pm-ico"><span class="ms">' + (TYPE_ICON[p.type] || 'assignment') + '</span></span>'
      + '<div class="pm-t"><b>' + esc(p.type || 'Permit') + ' permit' + (p.number ? ' <span class="pm-no">#' + esc(p.number) + '</span>' : '') + '</b>'
      + '<small>' + esc(p.office || 'Issuing office not set') + '</small></div>'
      + '<span class="pm-st ' + statusCls(p.status) + '">' + esc(p.status || 'Not applied') + '</span></div>'
      + (fl.length ? '<div class="pm-bs">' + fl.map(badge).join('') + '</div>' : '')
      + (dates ? '<div class="pm-dates">' + dates + '</div>' : '')
      + (insp ? '<ul class="pm-insp">' + insp + '</ul>' : '')
      + (p.notes ? '<div class="pm-notes">' + esc(p.notes) + '</div>' : '')
      + '<div class="pm-foot">'
      + (+p.fee ? '<label class="pm-paid"><input type="checkbox" ' + (p.feePaid ? 'checked' : '') + ' onchange="bpPermitPaid(\'' + p.id + '\',this.checked)"> Fee ' + money(p.fee) + (p.feePaid ? ' paid · on expenses' : ' · mark paid') + '</label>' : '<span class="bpx-mut" style="font-size:12px">No fee</span>')
      + '<span style="flex:1"></span>'
      + (p.doc && p.doc.d ? '<button class="pm-btn ghost sm" onclick="bpPermitDocOpen(\'' + p.id + '\')"><span class="ms">description</span>Document</button>' : '')
      + '<button class="pm-btn ghost sm" onclick="bpPermitEdit(\'' + p.id + '\')"><span class="ms">edit</span>Edit</button>'
      + '<button class="pm-btn ghost sm danger" aria-label="Delete permit" onclick="bpPermitDel(\'' + p.id + '\')"><span class="ms">delete</span></button>'
      + '</div></article>';
  }

  function opts(list, sel) { return list.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
  function form(d) {
    var f = function (lbl, html, wide) { return '<div class="pm-f' + (wide ? ' wide' : '') + '"><label>' + lbl + '</label>' + html + '</div>'; };
    var v = function (k) { return esc(d[k] || ''); };
    var insp = (d.inspections || []).map(function (x, i) {
      return '<div class="pm-irow"><input type="date" value="' + esc(x.date || '') + '" onchange="bpPermitInsp(' + i + ',\'date\',this.value)" aria-label="Inspection date">'
        + '<input placeholder="e.g. Rough-in, Final" value="' + esc(x.kind || '') + '" oninput="bpPermitInsp(' + i + ',\'kind\',this.value)" aria-label="Inspection">'
        + '<select onchange="bpPermitInsp(' + i + ',\'result\',this.value)" aria-label="Result">' + opts(RESULTS, x.result || 'Pending') + '</select>'
        + '<button class="bpx-exprm" aria-label="Remove inspection" onclick="bpPermitInspDel(' + i + ')">×</button></div>';
    }).join('');
    return '<div class="pm-form" id="pm-form"><div class="pm-head"><label class="pjs-h">' + (d._new ? 'New permit' : 'Edit permit') + '</label></div>'
      + '<div class="pm-grid">'
      + f('Type', '<select id="pm-type">' + opts(TYPES, d.type || 'Building') + '</select>')
      + f('Permit number', '<input id="pm-number" value="' + v('number') + '" placeholder="e.g. BLD-2026-01234">')
      + f('Issuing office', '<input id="pm-office" value="' + v('office') + '" placeholder="City or county building dept.">', true)
      + f('Status', '<select id="pm-status">' + opts(STATUSES, d.status || 'Not applied') + '</select>')
      + f('Fee', '<input id="pm-fee" inputmode="decimal" value="' + (d.fee ? esc(money(d.fee)) : '') + '" placeholder="$0">')
      + f('Applied', '<input type="date" id="pm-applied" value="' + v('applied') + '">')
      + f('Approved', '<input type="date" id="pm-approved" value="' + v('approved') + '">')
      + f('Expires', '<input type="date" id="pm-expires" value="' + v('expires') + '">')
      + f('&nbsp;', '<label class="pm-paid"><input type="checkbox" id="pm-paid" ' + (d.feePaid ? 'checked' : '') + '> Fee paid (posts as a Permits expense)</label>')
      + '</div>'
      + '<label>Inspections</label><div class="pm-insp-ed">' + (insp || '<div class="bpx-mut" style="font-size:12px">None scheduled.</div>') + '</div>'
      + '<button class="pm-btn ghost sm" style="margin-top:6px" onclick="bpPermitInspAdd()"><span class="ms">add</span>Add inspection</button>'
      + '<label>Document</label><div class="pm-docrow">'
      + (d.doc && d.doc.d ? '<span class="pm-doc"><span class="ms">description</span>' + esc(d.doc.n || 'Permit document') + '</span><button class="pm-btn ghost sm" onclick="bpPermitDocOpen(null)">View</button><button class="pm-btn ghost sm" onclick="bpPermitDocRm()">Remove</button>'
        : '<button class="pm-btn ghost sm" onclick="document.getElementById(\'pm-file\').click()"><span class="ms">upload_file</span>Attach permit (PDF or photo)</button>')
      + '<input type="file" id="pm-file" accept="application/pdf,image/*" style="display:none" onchange="bpPermitDocPick(event)"></div>'
      + '<label>Notes</label><textarea id="pm-notes" placeholder="Conditions, inspector name, card location…">' + v('notes') + '</textarea>'
      + '<div class="pm-msg" id="pm-msg" role="status"></div>'
      + '<div class="pm-actions"><button class="pm-btn ghost" onclick="bpPermitCancel()">Cancel</button><button class="pm-btn" id="pm-save" onclick="bpPermitSave()">Save permit</button></div></div>';
  }
  /* read the form back into the draft, so adding an inspection keeps what was typed */
  function pull() {
    if (!draft) return;
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
    if (!document.getElementById('pm-form')) return;
    draft.type = g('pm-type'); draft.number = g('pm-number').trim(); draft.office = g('pm-office').trim();
    draft.status = g('pm-status'); draft.fee = parseMoney(g('pm-fee'));
    draft.applied = g('pm-applied'); draft.approved = g('pm-approved'); draft.expires = g('pm-expires');
    var pd = document.getElementById('pm-paid'); draft.feePaid = !!(pd && pd.checked);
    draft.notes = g('pm-notes');
  }

  window.bpPermitNew = function () { draft = { _new: true, id: uid('pm'), type: 'Building', status: 'Not applied', inspections: [] }; bpPermitsRender(); focusForm(); };
  window.bpPermitEdit = function (id) {
    var j = job(); var p = j && (j.permits || []).filter(function (x) { return x.id === id; })[0]; if (!p) return;
    draft = JSON.parse(JSON.stringify(p)); draft.inspections = draft.inspections || []; bpPermitsRender(); focusForm();
  };
  function focusForm() { setTimeout(function () { var f = document.getElementById('pm-form'); if (f) { f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); var i = document.getElementById('pm-number'); if (i) i.focus({ preventScroll: true }); } }, 30); }
  window.bpPermitCancel = function () { draft = null; bpPermitsRender(); };
  window.bpPermitInsp = function (i, k, v) { if (draft && draft.inspections[i]) draft.inspections[i][k] = v; };
  window.bpPermitInspAdd = function () { pull(); draft.inspections.push({ date: '', kind: '', result: 'Pending' }); bpPermitsRender(); };
  window.bpPermitInspDel = function (i) { pull(); draft.inspections.splice(i, 1); bpPermitsRender(); };
  window.bpPermitSave = function () {
    var j = job(); if (!j || !draft) return; pull();
    var msg = document.getElementById('pm-msg');
    if (draft.approved && draft.applied && draft.approved < draft.applied) { if (msg) msg.textContent = 'The approved date is before the applied date.'; return; }
    var p = JSON.parse(JSON.stringify(draft)); delete p._new;
    p.inspections = (p.inspections || []).filter(function (x) { return x.date || x.kind; });
    /* keep the stored file object itself, so a pending upload can still swap in its reference */
    if (draft.doc) p.doc = draft.doc;
    j.permits = j.permits || [];
    var k = -1; j.permits.forEach(function (x, i) { if (x.id === p.id) k = i; });
    if (k >= 0) j.permits[k] = p; else j.permits.push(p);
    syncFee(j, p);
    draft = null; save(); bpPermitsRender(j); refreshChip(j);
  };
  window.bpPermitDel = function (id) {
    var j = job(); if (!j) return;
    var p = (j.permits || []).filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (!confirm('Delete the ' + (p.type || '') + ' permit' + (p.number ? ' #' + p.number : '') + '?' + (p.feePaid ? ' Its fee comes off the expenses too.' : ''))) return;
    p.gone = true; syncFee(j, p);
    if (p.doc && window.bpPF) bpPF.remove(p.doc.d);
    j.permits = j.permits.filter(function (x) { return x.id !== id; });
    if (draft && draft.id === id) draft = null;
    save(); bpPermitsRender(j); refreshChip(j);
  };
  window.bpPermitPaid = function (id, on) {
    var j = job(); var p = j && (j.permits || []).filter(function (x) { return x.id === id; })[0]; if (!p) return;
    p.feePaid = !!on; syncFee(j, p); save(); bpPermitsRender(j);
  };
  function refreshChip(j) { var c = document.getElementById('pjs-permit-chip'); if (c) c.innerHTML = bpPermitChip(j); }

  /* documents */
  window.bpPermitDocPick = function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f || !draft) return;
    if (f.size > 15 * 1024 * 1024) { alert('That file is over 15 MB. Attach a smaller PDF or a photo.'); return; }
    pull();
    var r = new FileReader();
    r.onload = function () {
      var j = job(); var doc = { n: f.name, t: f.type || 'application/pdf', d: r.result };
      draft.doc = doc; bpPermitsRender();
      if (window.bpPF && j) bpPF.adopt(j, 'docs/permits', doc.d, f.name, function () { return doc.d; }, function (_, ref) { doc.d = ref; });
    };
    r.readAsDataURL(f);
  };
  window.bpPermitDocRm = function () { pull(); if (draft && draft.doc) { if (window.bpPF) bpPF.remove(draft.doc.d); draft.doc = null; } bpPermitsRender(); };
  window.bpPermitDocOpen = function (id) {
    var d = null;
    if (id == null) d = draft && draft.doc;
    else { var j = job(); var p = j && (j.permits || []).filter(function (x) { return x.id === id; })[0]; d = p && p.doc; }
    if (!d || !d.d) return;
    if (window.bpPF) bpPF.open(d.d, d.t); else window.open(d.d, '_blank');
  };

  /* reset the draft whenever a project opens */
  window.bpPermitsReset = function () { draft = null; };

  /* ======================================================= Settings card === */
  var ldraft = null;
  function licSave(list) {
    var s = bpSettingsGet(); s.licenses = list; bpSettingsSet(s);
    try { if (window.bpSettingsPush) bpSettingsPush(s); } catch (e) {}
  }
  function licCard() {
    var L = licenses();
    var rows = L.map(function (l) {
      var f = licFlag(l);
      return '<div class="lic-row"><span class="lic-ico"><span class="ms">' + (/insur|comp/i.test(l.type || '') ? 'shield' : /bond/i.test(l.type || '') ? 'account_balance' : 'badge') + '</span></span>'
        + '<div class="lic-t"><b>' + esc(l.type || 'License') + '</b><small>' + licLine(l) + (l.expires ? ' · expires ' + pretty(l.expires) : ' · no expiry set') + '</small>'
        + (f ? '<div class="pm-bs">' + badge(f) + '</div>' : '') + '</div>'
        + (l.doc && l.doc.d ? '<button class="pm-btn ghost sm" onclick="bpLicDocOpen(\'' + l.id + '\')"><span class="ms">description</span>View</button>' : '')
        + '<button class="pm-btn ghost sm" onclick="bpLicEdit(\'' + l.id + '\')">Edit</button>'
        + '<button class="pm-btn ghost sm danger" aria-label="Delete" onclick="bpLicDel(\'' + l.id + '\')"><span class="ms">delete</span></button></div>';
    }).join('');
    var d = ldraft, fm = '';
    if (d) {
      fm = '<div class="lic-form" id="lic-form"><div class="pm-grid">'
        + '<div class="pm-f"><label>Type</label><select id="lic-type">' + opts(LIC_TYPES, d.type || LIC_TYPES[0]) + '</select></div>'
        + '<div class="pm-f"><label>Classification</label><input id="lic-cls" value="' + esc(d.cls || '') + '" placeholder="e.g. C-39 Roofing"></div>'
        + '<div class="pm-f"><label>Number</label><input id="lic-no" value="' + esc(d.number || '') + '" placeholder="License or policy #"></div>'
        + '<div class="pm-f"><label>State</label><input id="lic-state" value="' + esc(d.state || '') + '" placeholder="CA" maxlength="20"></div>'
        + '<div class="pm-f"><label>Expires</label><input type="date" id="lic-exp" value="' + esc(d.expires || '') + '"></div>'
        + '<div class="pm-f"><label>Document</label>' + (d.doc && d.doc.d ? '<span class="pm-doc"><span class="ms">description</span>' + esc(d.doc.n || 'Document') + ' <a href="#" onclick="event.preventDefault();bpLicDocRm()">remove</a></span>'
          : '<button class="pm-btn ghost sm" onclick="document.getElementById(\'lic-file\').click()"><span class="ms">upload_file</span>Upload</button>')
        + '<input type="file" id="lic-file" accept="application/pdf,image/*" style="display:none" onchange="bpLicDocPick(event)"></div>'
        + '</div><div class="pm-actions"><button class="pm-btn ghost" onclick="bpLicCancel()">Cancel</button><button class="pm-btn" onclick="bpLicSave()">Save</button></div></div>';
    }
    return '<div class="st-grp">Licenses &amp; insurance</div>'
      + '<div class="lic-card" id="lic-card"><p class="st-hint" style="margin:0 0 10px">Your contractor license, insurance and bonds. We warn you 30 days before one expires, and your license shows on every project\'s Permits tab. Saved as soon as you add one.</p>'
      + (rows || (d ? '' : '<div class="pjs-empty sm"><span class="ms">badge</span><b>No licenses on file</b><button class="pm-btn" onclick="bpLicNew()"><span class="ms">add</span>Add license or policy</button></div>'))
      + fm + ((rows && !d) ? '<button class="pm-btn ghost" style="margin-top:10px" onclick="bpLicNew()"><span class="ms">add</span>Add license or policy</button>' : '') + '</div>';
  }
  function licRender() {
    var host = document.getElementById('lic-host');
    if (!host) {
      var sec = document.getElementById('set-sec-business'); if (!sec) return;
      host = document.createElement('div'); host.id = 'lic-host'; sec.appendChild(host);
    }
    host.innerHTML = licCard();
  }
  function lpull() {
    if (!ldraft || !document.getElementById('lic-form')) return;
    var g = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    ldraft.type = g('lic-type'); ldraft.cls = g('lic-cls'); ldraft.number = g('lic-no'); ldraft.state = g('lic-state').toUpperCase(); ldraft.expires = g('lic-exp');
  }
  window.bpLicNew = function () { ldraft = { id: uid('lic'), type: LIC_TYPES[0] }; licRender(); };
  window.bpLicEdit = function (id) { var l = licenses().filter(function (x) { return x.id === id; })[0]; if (!l) return; ldraft = JSON.parse(JSON.stringify(l)); licRender(); };
  window.bpLicCancel = function () { ldraft = null; licRender(); };
  window.bpLicSave = function () {
    lpull(); if (!ldraft) return;
    var L = licenses(), k = -1; L.forEach(function (x, i) { if (x.id === ldraft.id) k = i; });
    var rec = JSON.parse(JSON.stringify(ldraft));
    if (k >= 0) L[k] = rec; else L.push(rec);
    licSave(L); ldraft = null; licRender();
  };
  window.bpLicDel = function (id) {
    var L = licenses(), l = L.filter(function (x) { return x.id === id; })[0]; if (!l) return;
    if (!confirm('Remove ' + (l.type || 'this license') + (l.number ? ' #' + l.number : '') + '?')) return;
    if (l.doc && window.bpPF) bpPF.remove(l.doc.d);
    licSave(L.filter(function (x) { return x.id !== id; })); licRender();
  };
  window.bpLicDocPick = function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f || !ldraft) return;
    if (f.size > 8 * 1024 * 1024) { alert('That file is over 8 MB. Upload a smaller PDF or a photo.'); return; }
    lpull();
    var r = new FileReader();
    r.onload = function () {
      var doc = { n: f.name, t: f.type || 'application/pdf', d: r.result }, id = ldraft.id;
      ldraft.doc = doc; licRender();
      /* to storage under <owner>/company/licenses; the reference replaces the data URL */
      if (window.bpPF && bpPF.upload) bpPF.upload('company', 'licenses', doc.d, f.name).then(function (ref) {
        if (doc.d.indexOf('data:') !== 0) return; doc.d = ref;
        var L = licenses(), hit = false;
        L.forEach(function (x) { if (x.id === id && x.doc && x.doc.n === doc.n) { x.doc.d = ref; hit = true; } });
        if (hit) licSave(L);
      }).catch(function () {});
    };
    r.readAsDataURL(f);
  };
  window.bpLicDocRm = function () { lpull(); if (ldraft) ldraft.doc = null; licRender(); };
  window.bpLicDocOpen = function (id) { var l = licenses().filter(function (x) { return x.id === id; })[0]; if (l && l.doc && l.doc.d) { if (window.bpPF) bpPF.open(l.doc.d, l.doc.t); else window.open(l.doc.d, '_blank'); } };
  window.bpLicensesWarn = function () { return licenses().map(function (l) { var f = licFlag(l); return f ? { l: l, f: f } : null; }).filter(Boolean); };

  /* hook Settings: after it draws, add the card to the Business section */
  function hookSettings() {
    var orig = window.bpSettings; if (typeof orig !== 'function' || orig._lic) return;
    var wrapped = function () { var r = orig.apply(this, arguments); ldraft = null; try { licRender(); } catch (e) {} return r; };
    wrapped._lic = true; window.bpSettings = wrapped;
  }
  hookSettings();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookSettings);
})();
