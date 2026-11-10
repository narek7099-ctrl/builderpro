/* ==================================================================
   The job record: everything a finished job left behind, in one place.

   Opening a completed job shows its history instead of the working sheet:
   the money (contract, collected, costs, profit), when it was won and
   finished, each stage with its planned and real finish, who worked on it
   (hours per person from Employees → Hours, and the clock-in / clock-out
   times from the crew app), the expenses, materials, payments, photos,
   documents and notes. Read-only; "Edit costs" and "Open full project"
   are one tap away.

   Also: the customer card in an open project goes to that person's
   profile in Leads (bpOpenPerson).
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var money = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(+n || 0) : '$' + Math.round(+n || 0).toLocaleString('en-US'); };
  var isCrew = function () { return !!(window.bpTeamIsCrew && bpTeamIsCrew()); };
  var jobOf = function (id) { return ((window.bpJobsGet && bpJobsGet()) || []).filter(function (x) { return x.id === id; })[0]; };
  var toDate = function (v) { if (!v) return null; var d = typeof v === 'number' ? new Date(v) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v); return isNaN(d) ? null : d; };
  var day = function (v, yr) { var d = toDate(v); return d ? d.toLocaleDateString('en-US', yr ? { month: 'short', day: 'numeric', year: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' }) : ''; };
  var clock = function (v) { var d = toDate(v); return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''; };
  var hrs = function (n) { n = Math.round((+n || 0) * 10) / 10; return n + (n === 1 ? ' hr' : ' hrs'); };
  var CAT = { 'Materials': 'inventory_2', 'Labor / crew': 'engineering', 'Subcontractor': 'handyman', 'Ads': 'campaign', 'Fuel': 'local_gas_station', 'Tools': 'construction', 'Permits': 'description', 'Overhead': 'domain', 'Other': 'receipt_long' };

  /* ---------- the customer card → their profile in Leads ---------- */
  window.bpOpenPerson = async function (id) {
    var j = jobOf(id); if (!j) return;
    try { if (typeof bpEnsureContacts === 'function') await bpEnsureContacts(); } catch (e) {}
    var norm = function (p) { return String(p || '').replace(/\D/g, ''); };
    var all = (typeof _bpContacts !== 'undefined' && _bpContacts) || [];
    var c = all.filter(function (x) { return j.contactId && x.id === j.contactId; })[0]
      || all.filter(function (x) { return j.phone && x.phone && norm(x.phone).slice(-10) === norm(j.phone).slice(-10); })[0]
      || all.filter(function (x) { return j.email && x.email && String(x.email).toLowerCase() === String(j.email).toLowerCase(); })[0]
      || all.filter(function (x) { return j.name && x.name && x.name.trim().toLowerCase() === j.name.trim().toLowerCase(); })[0];
    if (window.bpCloseModal) bpCloseModal();
    if (window.bpNav) bpNav('contacts');
    if (c && window.bpContactPage) setTimeout(function () { bpContactPage(c.id); }, 80);
    else if (window.bpToast) bpToast((j.name || 'This customer') + ' isn’t in Leads yet. Add them with + New contact.');
  };

  /* ---------- the record ---------- */
  function sec(icon, title, body, extra) {
    return '<section class="jr-sec"><div class="jr-sh"><span class="ms">' + icon + '</span><b>' + title + '</b>' + (extra || '') + '</div>' + body + '</section>';
  }
  function stages(j) {
    var pl = j.plan && j.plan.phases && j.plan.phases.length ? j.plan : null;
    if (!pl) {
      var dates = ((j.sched && j.sched.dates) || []).filter(Boolean).sort();
      if (!dates.length) return '<div class="jr-none">No stages were planned for this job.</div>';
      return '<div class="jr-chips">' + dates.map(function (d) { return '<span>' + esc(day(d)) + '</span>'; }).join('') + '</div><div class="jr-note">Days on the schedule (no stage plan was used).</div>';
    }
    return '<ol class="jr-tl">' + pl.phases.map(function (ph) {
      var done = ph.doneAt ? String(ph.doneAt).slice(0, 10) : '', late = done && ph.due && done > ph.due;
      var lateDays = late ? Math.round((toDate(done) - toDate(ph.due)) / 864e5) : 0;
      return '<li class="' + (done ? 'ok' : 'skip') + '"><i></i><div><b>' + esc(ph.name) + '</b><span>'
        + (done ? 'Finished ' + esc(day(done)) : 'Not checked off') + (ph.due ? ' · planned ' + esc(day(ph.due)) : '') + (ph.days ? ' · ' + ph.days + (ph.days === 1 ? ' day' : ' days') : '') + '</span></div>'
        + (late ? '<em class="late">' + lateDays + (lateDays === 1 ? ' day' : ' days') + ' late</em>' : done ? '<em>On time</em>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function expenses(j) {
    var ex = (j.expenses || []).filter(function (e) { return +e.amt; });
    if (!ex.length) return '<div class="jr-none">No expenses were recorded. Add them with Edit costs.</div>';
    var tot = ex.reduce(function (s, e) { return s + (+e.amt || 0); }, 0), by = {};
    ex.forEach(function (e) { by[e.cat || 'Other'] = (by[e.cat || 'Other'] || 0) + (+e.amt || 0); });
    var bars = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).map(function (k) {
      return '<div class="jr-bar"><span>' + esc(k) + '</span><div><i style="width:' + Math.max(3, Math.round(by[k] / tot * 100)) + '%"></i></div><b>' + money(by[k]) + '</b></div>';
    }).join('');
    return '<div class="jr-bars">' + bars + '</div><div class="jr-rows">' + ex.map(function (e) {
      return '<div class="jr-row"><span class="jr-ic ms">' + (CAT[e.cat] || 'receipt_long') + '</span><div class="jr-rt"><b>' + esc(e.note || e.cat || 'Expense') + '</b><small>' + esc(e.cat || '') + (e.when ? ' · ' + esc(day(e.when, 1)) : '') + '</small></div><b class="jr-amt">' + money(e.amt) + '</b></div>';
    }).join('') + '<div class="jr-row tot"><div class="jr-rt"><b>Total costs</b></div><b class="jr-amt">' + money(tot) + '</b></div></div>';
  }
  function materials(j) {
    var m = j.materials, it = m && (Array.isArray(m) ? m : m.items) || [];
    if (!it.length) return '';
    var tot = 0;
    var rows = it.map(function (x) {
      var line = (+x.qty || 0) * (+x.price || 0); tot += line;
      return '<div class="jr-row"><span class="jr-ic ms">inventory_2</span><div class="jr-rt"><b>' + esc(x.name || x.item || 'Item') + '</b><small>' + esc((x.qty || 1) + ' ' + (x.unit || '')) + (x.price ? ' × ' + money(x.price) : '') + '</small></div><b class="jr-amt">' + (line ? money(line) : '') + '</b></div>';
    }).join('');
    return sec('inventory_2', 'Materials', '<div class="jr-rows">' + rows + (tot ? '<div class="jr-row tot"><div class="jr-rt"><b>Materials total</b></div><b class="jr-amt">' + money(tot) + '</b></div>' : '') + '</div>', '<small>' + it.length + (it.length === 1 ? ' item' : ' items') + '</small>');
  }
  function payments(j) {
    var p = j.pay || {}, steps = p.progress || [], C = +j.estimate || 0;
    if (!steps.length && p.dep && C) steps = [{ name: 'Deposit', pct: +p.dep.pct || 0, ready: true }, { name: 'Balance', pct: 100 - (+p.dep.pct || 0), ready: true }];
    var body = steps.length ? '<div class="jr-rows">' + steps.map(function (s) {
      return '<div class="jr-row"><span class="jr-ic ms">payments</span><div class="jr-rt"><b>' + esc(s.name || 'Payment') + '</b><small>' + (s.pct ? s.pct + '% of the contract' : '') + '</small></div><b class="jr-amt">' + (C && s.pct ? money(C * s.pct / 100) : '') + '</b></div>';
    }).join('') + '</div>' : '';
    return body + '<div class="jr-paid"><span>Collected</span><b>' + money(j.collected) + '</b><span>of ' + money(C) + '</span></div>';
  }
  function media(j) {
    var ph = j.photos || [], dc = j.docs || [], out = '';
    if (ph.length) out += sec('photo_library', 'Photos', '<div class="jr-photos">' + ph.slice(0, 12).map(function (u) { return '<div>' + (window.bpPF ? bpPF.img(u, 'alt="" loading="lazy"') : '<img src="' + esc(u) + '" alt="" loading="lazy">') + '</div>'; }).join('') + '</div>', '<small>' + ph.length + '</small>');
    if (dc.length) out += sec('folder', 'Documents', '<div class="jr-rows">' + dc.map(function (d) { return '<div class="jr-row"><span class="jr-ic ms">description</span><div class="jr-rt"><b>' + esc(d.n || d.name || 'Document') + '</b></div></div>'; }).join('') + '</div>');
    return out;
  }

  /* who worked on it: hours per person, and the punches from the crew app */
  function loadCrew(j) {
    var host = document.getElementById('jr-crew'); if (!host) return;
    if (!window.BP_SB || !BP_SB.from) { host.innerHTML = '<div class="jr-none">Hours show here once your crew logs them.</div>'; return; }
    Promise.all([
      Promise.resolve(BP_SB.from('time_entries').select('employee_id,worked_on,hours,ot_hours,cost,note').eq('job_id', j.id).order('worked_on')).catch(function () { return {}; }),
      Promise.resolve(BP_SB.from('time_clock').select('employee_id,user_id,kind,at,on_site,clocked_by_name').eq('job_id', j.id).order('at')).catch(function () { return {}; })
    ]).then(function (r) {
      var te = (r[0] && r[0].data) || [], tc = (r[1] && r[1].data) || [];
      var ids = {}; te.concat(tc).forEach(function (x) { if (x.employee_id) ids[x.employee_id] = 1; });
      var idl = Object.keys(ids);
      return (idl.length ? Promise.resolve(BP_SB.from('employees').select('id,name').in('id', idl)).catch(function () { return {}; }) : Promise.resolve({})).then(function (e) {
        var nm = {}; ((e && e.data) || []).forEach(function (x) { nm[x.id] = x.name; });
        draw(host, j, te, tc, nm);
      });
    }).catch(function () { host.innerHTML = '<div class="jr-none">Couldn’t load the hours right now.</div>'; });
  }
  function draw(host, j, te, tc, nm) {
    var who = window.bpJobWhoLbl ? bpJobWhoLbl(j) : '';
    var people = {};
    te.forEach(function (x) {
      var k = x.employee_id || '?', p = people[k] || (people[k] = { name: nm[k] || 'Crew member', days: {}, hrs: 0, ot: 0, cost: 0 });
      p.days[x.worked_on] = 1; p.hrs += +x.hours || 0; p.ot += +x.ot_hours || 0; p.cost += +x.cost || 0;
    });
    /* clock punches, paired in → out per person */
    var open = {}, shifts = [];
    tc.forEach(function (x) {
      var k = x.employee_id || x.user_id || x.clocked_by_name || '?', name = nm[x.employee_id] || x.clocked_by_name || 'Crew member';
      if (x.kind === 'in') open[k] = { name: name, in: x.at, site: x.on_site };
      else if (open[k]) { shifts.push({ name: open[k].name, in: open[k].in, out: x.at, site: open[k].site !== false && x.on_site !== false }); delete open[k]; }
      else shifts.push({ name: name, in: null, out: x.at, site: x.on_site !== false });
    });
    Object.keys(open).forEach(function (k) { shifts.push({ name: open[k].name, in: open[k].in, out: null, site: open[k].site !== false }); });
    shifts.forEach(function (s) {
      if (!s.in || !s.out) return;
      var h = (toDate(s.out) - toDate(s.in)) / 36e5, hit = null;
      Object.keys(people).forEach(function (k) { if (people[k].name === s.name) hit = people[k]; });
      if (!hit && !te.length) { hit = people['c:' + s.name] || (people['c:' + s.name] = { name: s.name, days: {}, hrs: 0, ot: 0, cost: 0 }); hit.hrs += h; hit.days[String(s.in).slice(0, 10)] = 1; }
    });
    var keys = Object.keys(people);
    var cards = keys.length ? '<div class="jr-people">' + keys.map(function (k) {
      var p = people[k], ini = p.name.split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
      return '<div class="jr-person"><span class="jr-av">' + esc(ini) + '</span><div><b>' + esc(p.name) + '</b><small>' + Object.keys(p.days).length + (Object.keys(p.days).length === 1 ? ' day' : ' days') + ' · ' + hrs(p.hrs) + (p.ot ? ' (' + hrs(p.ot) + ' OT)' : '') + '</small></div>' + (p.cost ? '<b class="jr-amt">' + money(p.cost) + '</b>' : '') + '</div>';
    }).join('') + '</div>' : '';
    var tot = keys.reduce(function (s, k) { return s + people[k].hrs; }, 0);
    var log = shifts.length ? '<div class="jr-sub">Clock-ins</div><div class="jr-rows">' + shifts.sort(function (a, b) { return String(a.in || a.out) < String(b.in || b.out) ? -1 : 1; }).map(function (s) {
      var h = s.in && s.out ? (toDate(s.out) - toDate(s.in)) / 36e5 : 0;
      return '<div class="jr-row"><span class="jr-ic ms">schedule</span><div class="jr-rt"><b>' + esc(s.name) + '</b><small>' + esc(day(s.in || s.out)) + ' · ' + (s.in ? esc(clock(s.in)) : '?') + ' – ' + (s.out ? esc(clock(s.out)) : 'no clock-out') + '</small></div>'
        + (s.site ? '<span class="jr-tag ok">On site</span>' : '<span class="jr-tag">Off site</span>') + (h ? '<b class="jr-amt">' + hrs(h) + '</b>' : '') + '</div>';
    }).join('') + '</div>' : '';
    host.innerHTML = (who ? '<div class="jr-who"><span class="ms">groups</span>Assigned: <b>' + esc(who) + '</b></div>' : '')
      + (cards || log ? cards + log : '<div class="jr-none">No hours or clock-ins were logged on this job.' + (who ? '' : ' Nobody was assigned in the app.') + '</div>');
    var tag = document.getElementById('jr-crew-n'); if (tag && tot) tag.textContent = hrs(tot) + ' total';
  }

  window.bpJobRecord = function (id) {
    var j = jobOf(id); if (!j || !window.bpModal) return;
    var c = +j.collected || 0, e = (j.expenses || []).reduce(function (s, x) { return s + (+x.amt || 0); }, 0), p = c - e;
    var won = toDate(j.wonAt), done = toDate(j.doneAt);
    var span = won && done ? Math.max(1, Math.round((done - won) / 864e5)) : 0;
    var img = (j.photos && j.photos[0]) ? (window.bpPF ? bpPF.img(j.photos[0], 'alt=""') : '<img src="' + esc(j.photos[0]) + '" alt="">') : (window.bpCover ? '<img src="' + bpCover(j) + '" alt="">' : '');
    var addr = j.address || (j.sched && j.sched.address) || '';
    var notes = (j.sched && j.sched.notes) || j.notes || '';
    bpModal('<div class="jr">'
      + '<header class="jr-hero"><div class="jr-img">' + img + '</div><div class="jr-hero-in">'
      + '<button class="jr-x" onclick="bpCloseModal()" aria-label="Close"><span class="ms">close</span></button>'
      + '<span class="jr-done"><span class="ms">verified</span>Completed' + (done ? ' ' + esc(day(done, 1)) : '') + '</span>'
      + '<h2>' + esc(j.name || 'Job') + '</h2><p>' + esc(j.title || 'Job') + (addr ? ' · ' + esc(addr) : '') + '</p>'
      + '<div class="jr-acts"><button onclick="bpOpenPerson(\'' + j.id + '\')"><span class="ms">person</span>Customer profile</button>'
      + '<button onclick="bpCloseModal();bpJobDoneOpen(\'' + j.id + '\')"><span class="ms">edit</span>Edit costs</button>'
      + '<button onclick="bpCloseModal();bpProjOpen(\'' + j.id + '\',{full:1})"><span class="ms">open_in_new</span>Full project</button></div>'
      + '</div></header>'
      + '<div class="jr-body">'
      + '<div class="jr-kpis"><div><small>Contract</small><b>' + money(j.estimate) + '</b></div><div><small>Collected</small><b>' + money(c) + '</b></div><div><small>Costs</small><b>' + money(e) + '</b></div>'
      + '<div class="' + (p >= 0 ? 'pos' : 'neg') + '"><small>Profit</small><b>' + money(p) + '</b><em>' + (c > 0 ? Math.round(p / c * 100) + '% margin' : '') + '</em></div></div>'
      + '<div class="jr-when"><div><small>Won</small><b>' + (won ? esc(day(won, 1)) : '—') + '</b></div><span class="ms">arrow_forward</span><div><small>Finished</small><b>' + (done ? esc(day(done, 1)) : '—') + '</b></div>' + (span ? '<em>' + span + (span === 1 ? ' day' : ' days') + ' start to finish</em>' : '') + '</div>'
      + '<div class="jr-grid"><div class="jr-col">'
      + sec('flag', 'Stages', stages(j))
      + sec('groups', 'Who worked on it', '<div id="jr-crew"><div class="jr-none">Loading hours…</div></div>', '<small id="jr-crew-n"></small>')
      + (notes ? sec('sticky_note_2', 'Notes', '<p class="jr-notes">' + esc(notes) + '</p>') : '')
      + '</div><div class="jr-col">'
      + sec('receipt_long', 'Expenses', expenses(j))
      + materials(j)
      + sec('payments', 'Payments', payments(j))
      + '</div></div>'
      + media(j)
      + '</div></div>');
    var m = document.getElementById('bpx-modal'); if (m) m.classList.add('jr-modal');
    loadCrew(j);
  };

  /* a finished job opens as its record; the working sheet is still one tap away */
  var open0 = window.bpProjOpen;
  if (typeof open0 === 'function') {
    window.bpProjOpen = function (id, opt) {
      var j = jobOf(id);
      if (j && j.status === 'done' && !(opt && opt.full) && !isCrew()) return window.bpJobRecord(id);
      return open0.apply(this, arguments);
    };
    /* keep the project sheet's marker, or it wraps again and the header shows twice */
    if (open0._pjs) window.bpProjOpen._pjs = true;
  }
})();
