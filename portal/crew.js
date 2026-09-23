/* ==================================================================
   Employees, their hours, and what labour actually cost each job.

   Explicitly NOT payroll. Running payroll means withholding tax, filing
   with the IRS and the state, and moving money — regulated work where a
   bug becomes the customer's tax liability rather than our support
   ticket. Every contractor already pays through Gusto, QuickBooks, ADP
   or a bookkeeper, and none of them is going to switch to a roofing CRM
   for it.

   What they do lack is job costing on labour. Their payroll provider
   knows Dave earned $1,240 last week; it has no idea that $780 of it
   went into the Smith roof. So they guess at labour when they quote, and
   find out whether they guessed right months later, if ever. This is the
   only place that knows both the hours and the job, so this is where
   that question gets answered.

   The page therefore does three things and stops: keeps the people,
   takes the hours against a job, and hands the period's gross to
   whatever really runs the payroll.
   ================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var money = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : ('$' + Math.round(n || 0)); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  /* Totals round to the dollar; an hourly RATE does not. $34.50 against $35
     is a thousand dollars over a working year, and the rate is the number
     this whole page is arguing about. */
  var rate = function (n) {
    n = +n || 0;
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  window.bpRateFmt = rate;

  var S = { emps: [], entries: [], loaded: false, err: '', tab: 'people' };
  window.BP_CREW = S;

  var TRADES = ['Roofer', 'Foreman', 'Labourer', 'Gutter', 'Siding', 'Driver', 'Office', 'Other'];

  /* ---------------------------------------------------------- costing --- */
  /* What an hour of this person costs the business, as opposed to what they
     take home. The gap is the employer's half of FICA, unemployment, and
     workers' compensation — and in roofing that last one is brutal: the
     classification carries some of the highest comp rates there are, so a
     $25/hr roofer really costs $32-38 an hour.

     A contractor who budgets labour at the wage is underwater before the
     first bundle is opened, which is exactly the mistake this is here to
     stop. The percentage is theirs to set from their own policy — comp
     rates vary by state and carrier, and a number we invented would be
     wrong in a way that looks authoritative. */
  function hourlyOf(e) {
    if (!e) return 0;
    if (e.pay_type === 'hourly') return +e.rate || 0;
    if (e.pay_type === 'day') return (+e.rate || 0) / 8;
    /* salary: a nominal 2080-hour year, which is the convention. It is an
       approximation and the page says so where it is used. */
    if (e.pay_type === 'salary') return (+e.rate || 0) / 2080;
    return 0;
  }
  function burdenedOf(e) { return hourlyOf(e) * (1 + (+(e && e.burden_pct) || 0) / 100); }
  window.bpBurdenedRate = burdenedOf;

  function entryCost(e, hours, ot) {
    var r = burdenedOf(e);
    return Math.round((r * (+hours || 0) + r * 1.5 * (+ot || 0)) * 100) / 100;
  }

  /* The project budget's labour line. Reads from hours logged rather than
     from what somebody remembered to type as an expense — a day of four
     people is not a line item anyone writes down. */
  window.bpProjLabour = function (jobId) {
    if (!jobId) return 0;
    var t = 0;
    S.entries.forEach(function (x) { if (x.job_id === jobId) t += +x.cost || 0; });
    return t;
  };
  window.bpProjHours = function (jobId) {
    var h = 0, ot = 0, who = {};
    S.entries.forEach(function (x) {
      if (x.job_id !== jobId) return;
      h += +x.hours || 0; ot += +x.ot_hours || 0; who[x.employee_id] = 1;
    });
    return { hours: h, ot: ot, people: Object.keys(who).length };
  };
  window.bpEmpById = function (id) { return S.emps.filter(function (e) { return e.id === id; })[0] || null; };
  window.bpEmpsActive = function () { return S.emps.filter(function (e) { return e.active; }); };

  /* ------------------------------------------------------------- load --- */
  window.bpCrewLoad = function (force) {
    if (!live()) { S.loaded = true; S.err = 'signed-out'; return Promise.resolve(S); }
    if (S.loaded && !force) return Promise.resolve(S);
    return Promise.all([
      Promise.resolve(BP_SB.from('employees').select('*').order('name')).catch(function (e) { return { error: e }; }),
      Promise.resolve(BP_SB.from('time_entries').select('*').order('worked_on', { ascending: false }).limit(2000))
        .catch(function () { return { data: [] }; })
    ]).then(function (r) {
      if (r[0] && r[0].error) {
        S.err = /does not exist/i.test(String((r[0].error && r[0].error.message) || ''))
          ? 'no-table' : 'load';
        S.emps = [];
      } else { S.err = ''; S.emps = r[0].data || []; }
      S.entries = (r[1] && r[1].data) || [];
      S.loaded = true;
      return S;
    });
  };

  /* ------------------------------------------------------------- page --- */
  window.bpEmployees = function () {
    var area = $('bpxViewArea');
    area.innerHTML = '<div class="bpx-panel"><div class="bpx-mut" style="font-size:13px">Loading your crew…</div></div>';
    bpCrewLoad(true).then(render);
  };

  function render() {
    var area = $('bpxViewArea'); if (!area) return;
    if (S.err === 'signed-out') {
      area.innerHTML = '<div class="bpx-panel"><div class="bpx-empty2">Sign in to keep your crew here.</div></div>'; return;
    }
    if (S.err === 'no-table') {
      area.innerHTML = '<div class="bpx-panel"><div class="bpx-empty2">The employees tables haven’t been created yet — '
        + 'run the Employees SQL and reload.</div></div>'; return;
    }
    if (S.err) {
      area.innerHTML = '<div class="bpx-panel"><div class="bpx-empty2">Couldn’t load your crew just now.</div></div>'; return;
    }

    var tabs = [['people', 'People'], ['hours', 'Hours'], ['pay', 'Pay period']];
    area.innerHTML = '<div class="bpx-panel">'
      + '<div class="bpx-jobtabs bpx-mtabs">'
      + tabs.map(function (t) {
          return '<button class="bpx-jt' + (S.tab === t[0] ? ' on' : '') + '" onclick="bpCrewTab(\'' + t[0] + '\')">' + t[1] + '</button>';
        }).join('')
      + '</div><div id="bpCrewPane"></div></div>';
    pane();
  }

  window.bpCrewTab = function (t) { S.tab = t; render(); };

  function pane() {
    var el = $('bpCrewPane'); if (!el) return;
    if (S.tab === 'people') return people(el);
    if (S.tab === 'hours') return hours(el);
    return payPeriod(el);
  }

  /* ----------------------------------------------------------- people --- */
  function people(el) {
    var head = '<div class="bpx-chead" style="margin-bottom:12px">'
      + '<div class="bpx-ptitle" style="margin:0">Your people'
      + '<span class="lg2" style="margin-left:8px">everyone who works on your jobs, on the books or on a 1099</span></div>'
      + '<button class="bpx-btn" style="width:auto;margin:0;padding:9px 16px;font-size:13px" onclick="bpEmpOpen()">+ Add someone</button></div>';

    if (!S.emps.length) {
      el.innerHTML = head + '<div class="bpx-empty2"><b>Nobody added yet.</b>'
        + '<div class="bpx-mut" style="font-size:13px;margin-top:5px;line-height:1.6">Add your crew and you can put their hours against a job — '
        + 'which is what turns the labour line on a project budget from a guess into a number.</div></div>';
      return;
    }

    var rows = S.emps.map(function (e) {
      var r = hourlyOf(e), b = burdenedOf(e);
      var rateTxt = e.pay_type === 'hourly' ? money(e.rate) + '/hr'
        : e.pay_type === 'day' ? money(e.rate) + '/day'
        : money(e.rate) + '/yr';
      return '<tr' + (e.active ? '' : ' style="opacity:.55"') + '>'
        + '<td><b>' + esc(e.name || 'Unnamed') + '</b>'
          + (e.trade ? '<div class="bpx-mut" style="font-size:11.5px">' + esc(e.trade) + '</div>' : '') + '</td>'
        + '<td>' + (e.phone ? '<a href="tel:' + esc(e.phone) + '" style="color:#2f6bff;text-decoration:none">' + esc(e.phone) + '</a>' : '—')
          + (e.email ? '<div class="bpx-mut" style="font-size:11.5px">' + esc(e.email) + '</div>' : '') + '</td>'
        + '<td><span class="bpx-badge' + (e.kind === '1099' ? '' : ' ok') + '">' + (e.kind === '1099' ? '1099' : 'W-2') + '</span></td>'
        + '<td>' + rateTxt + '</td>'
        + '<td>' + (b > 0 ? '<b>' + money(b) + '</b>/hr' : '—')
          + (e.burden_pct > 0 ? '<div class="bpx-mut" style="font-size:11.5px">+' + e.burden_pct + '% burden</div>'
            : (e.kind === 'w2' ? '<div class="bpx-mut" style="font-size:11.5px;color:#b45309">no burden set</div>' : '')) + '</td>'
        + '<td class="bpx-r" style="white-space:nowrap">'
          + '<button class="bpx-rowbtn" onclick="bpEmpOpen(\'' + e.id + '\')">Edit</button>'
          + '<button class="bpx-rowbtn" onclick="bpEmpToggle(\'' + e.id + '\')">' + (e.active ? 'Deactivate' : 'Reactivate') + '</button>'
        + '</td></tr>';
    }).join('');

    /* The one thing worth saying unprompted: a W-2 rate with no burden on it
       is not what that person costs, and budgeting against it loses money
       quietly for as long as nobody notices. */
    var noBurden = S.emps.filter(function (e) { return e.active && e.kind === 'w2' && !(+e.burden_pct > 0); }).length;
    var warn = noBurden
      ? '<div class="bg-warn" style="margin-top:12px"><span class="ms">warning</span>'
        + '<span>' + noBurden + ' ' + (noBurden === 1 ? 'person has' : 'people have')
        + ' no burden set, so their hours are costed at the bare wage. Payroll tax and workers’ comp typically add '
        + '25–50% on top, and roofing comp rates are among the highest there are — jobs will look more profitable than they are. '
        + 'Your accountant or comp policy has the real figure.</span></div>'
      : '';

    el.innerHTML = head
      + '<div class="bpx-cwrap"><table class="bpx-ctable"><thead><tr>'
      + '<th>Name</th><th>Contact</th><th>Type</th><th>Rate</th><th>Real cost</th><th></th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>' + warn;
  }

  window.bpEmpOpen = function (id) {
    var e = id ? bpEmpById(id) : null;
    var f = e || { name: '', phone: '', email: '', trade: '', kind: 'w2', pay_type: 'hourly', rate: 0, burden_pct: 0, notes: '' };
    var inp = function (k, ph, v, type) {
      return '<input id="emp-' + k + '"' + (type ? ' type="' + type + '"' : '') + ' placeholder="' + ph + '" value="' + esc(v == null ? '' : v) + '">';
    };
    bpModal('<h3>' + (e ? 'Edit ' + esc(e.name || 'person') : 'Add someone') + '</h3>'
      + '<div class="bpx-sub">Everyone who works on your jobs — employees and subcontractors alike.</div>'
      + '<label>Name</label>' + inp('name', 'Full name', f.name)
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div><label>Phone</label>' + inp('phone', '(555) 555-5555', f.phone) + '</div>'
        + '<div><label>Email</label>' + inp('email', 'name@email.com', f.email) + '</div></div>'
      + '<label>Trade</label><select id="emp-trade">'
        + ['<option value=""></option>'].concat(TRADES.map(function (t) {
            return '<option' + (f.trade === t ? ' selected' : '') + '>' + t + '</option>';
          })).join('') + '</select>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div><label>On the books?</label><select id="emp-kind" onchange="bpEmpKind()">'
          + '<option value="w2"' + (f.kind === 'w2' ? ' selected' : '') + '>W-2 employee</option>'
          + '<option value="1099"' + (f.kind === '1099' ? ' selected' : '') + '>1099 subcontractor</option></select></div>'
        + '<div><label>Paid by</label><select id="emp-pt" onchange="bpEmpKind()">'
          + '<option value="hourly"' + (f.pay_type === 'hourly' ? ' selected' : '') + '>The hour</option>'
          + '<option value="day"' + (f.pay_type === 'day' ? ' selected' : '') + '>The day</option>'
          + '<option value="salary"' + (f.pay_type === 'salary' ? ' selected' : '') + '>Salary</option></select></div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div><label id="emp-ratelab">Rate</label>' + inp('rate', '$0', f.rate || '') + '</div>'
        + '<div><label>Costs you extra</label>'
          + '<div style="display:flex;align-items:center;gap:6px"><input id="emp-burden" type="number" min="0" max="200" step="1" '
          + 'value="' + (+f.burden_pct || '') + '" placeholder="0" oninput="bpEmpKind()" style="flex:1"><span class="bpx-mut">%</span></div></div></div>'
      + '<div class="bpx-mut" id="emp-hint" style="font-size:12px;margin-top:8px;line-height:1.6"></div>'
      + '<label>Notes</label>' + inp('notes', 'Certifications, who to call, anything else', f.notes)
      + '<div class="bpx-mmsg" id="bpx-mmsg"></div>'
      + '<div class="row" style="justify-content:space-between">'
        + (e ? '<span class="bpx-skip" onclick="bpEmpDel(\'' + e.id + '\')">Remove</span>' : '<span></span>')
        + '<span style="display:flex;gap:10px"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button>'
        + '<button class="bpx-btn" id="emp-go" onclick="bpEmpSave(' + (e ? "'" + e.id + "'" : 'null') + ')">Save</button></span></div>');
    bpEmpKind();
  };

  /* The hint under the rate is the whole argument of this page in two lines,
     so it updates live rather than sitting in help nobody opens. */
  window.bpEmpKind = function () {
    var kind = ($('emp-kind') || {}).value, pt = ($('emp-pt') || {}).value;
    var rate = window.bpParseMoney ? bpParseMoney(($('emp-rate') || {}).value || '0') : 0;
    var bur = +($('emp-burden') || {}).value || 0;
    var lab = $('emp-ratelab'); if (lab) lab.textContent = pt === 'hourly' ? 'Per hour' : pt === 'day' ? 'Per day' : 'Per year';
    var hint = $('emp-hint'); if (!hint) return;
    var per = pt === 'hourly' ? rate : pt === 'day' ? rate / 8 : rate / 2080;
    if (kind === '1099') {
      hint.innerHTML = 'A 1099 subcontractor invoices you, so there is no payroll tax or comp on top — leave the extra at 0. '
        + 'Whether someone really is a subcontractor is a legal test, not a preference; if you direct their hours and supply their tools, '
        + 'the IRS is likely to call them an employee.';
      return;
    }
    if (!(per > 0)) { hint.innerHTML = 'Put the wage in and this shows what the hour really costs you.'; return; }
    var real = per * (1 + bur / 100);
    hint.innerHTML = bur > 0
      ? 'An hour of this person costs you <b>' + rate(real) + '</b>, not ' + rate(per) + '. That is the number jobs are costed at.'
        + (pt === 'salary' ? ' (Salary is spread over a nominal 2,080-hour year.)' : '')
      : '<span style="color:#b45309">Payroll tax and workers’ comp usually add 25–50% on top of the wage, and roofing comp rates '
        + 'are among the highest of any trade. At 0% this person is costed at ' + rate(per) + '/hr and every job using them will look '
        + 'more profitable than it is. Your comp policy or accountant has the real number.</span>';
  };

  window.bpEmpSave = function (id) {
    var g = function (k) { var e = $('emp-' + k); return e ? e.value.trim() : ''; };
    var name = g('name');
    if (!name) { msg('Give them a name.'); return; }
    var kind = ($('emp-kind') || {}).value || 'w2';
    var row = {
      name: name, phone: g('phone'), email: g('email'), trade: ($('emp-trade') || {}).value || '',
      kind: kind, pay_type: ($('emp-pt') || {}).value || 'hourly',
      rate: window.bpParseMoney ? bpParseMoney(g('rate')) : (+g('rate') || 0),
      burden_pct: kind === '1099' ? 0 : Math.max(0, Math.min(200, +($('emp-burden') || {}).value || 0)),
      notes: g('notes')
    };
    var btn = $('emp-go'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    var q = id ? BP_SB.from('employees').update(row).eq('id', id)
               : BP_SB.from('employees').insert(Object.assign({ owner: window.bpOwnerId ? bpOwnerId() : undefined }, row));
    Promise.resolve(q).then(function (r) {
      if (r && r.error) throw r.error;
      bpCloseModal(); bpCrewLoad(true).then(render);
    }, function (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      msg((e && e.message) || 'Couldn’t save that.');
    });
  };
  function msg(t) { var m = $('bpx-mmsg'); if (m) { m.style.color = '#dc2626'; m.textContent = t; } }

  window.bpEmpToggle = function (id) {
    var e = bpEmpById(id); if (!e) return;
    e.active = !e.active; render();
    Promise.resolve(BP_SB.from('employees').update({ active: e.active }).eq('id', id))
      .then(function () {}, function () { e.active = !e.active; render(); });
  };

  /* Deactivate, not delete, is the default — and the dialog says why. Their
     hours are what last year's jobs cost, and removing the person would
     take the history with them. */
  window.bpEmpDel = function (id) {
    var e = bpEmpById(id); if (!e) return;
    var mine = S.entries.filter(function (x) { return x.employee_id === id; }).length;
    if (mine) {
      bpModal('<h3>Remove ' + esc(e.name) + '?</h3>'
        + '<div class="bpx-sub">They have ' + mine + ' logged ' + (mine === 1 ? 'day' : 'days') + ' of hours.</div>'
        + '<p style="font-size:13.5px;line-height:1.65;color:var(--grey)">Removing them deletes those hours too, and those hours are '
        + 'what your finished jobs cost. The profit on every job they worked would change.</p>'
        + '<p style="font-size:13.5px;line-height:1.65;color:var(--grey)">Deactivating keeps the history and takes them off the lists.</p>'
        + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button>'
        + '<button class="bpx-btn" onclick="bpEmpToggle(\'' + id + '\');bpCloseModal()">Deactivate instead</button></div>');
      return;
    }
    if (!confirm('Remove ' + e.name + '? They have no hours logged, so nothing else changes.')) return;
    Promise.resolve(BP_SB.from('employees').delete().eq('id', id))
      .then(function () { bpCloseModal(); bpCrewLoad(true).then(render); }, function () { msg('Couldn’t remove them.'); });
  };

  /* ------------------------------------------------------------ hours --- */
  function hours(el) {
    var head = '<div class="bpx-chead" style="margin-bottom:12px">'
      + '<div class="bpx-ptitle" style="margin:0">Hours'
      + '<span class="lg2" style="margin-left:8px">a day at a time, against the job they were on</span></div>'
      + '<span style="display:flex;gap:8px">'
      + (window.bpCsvBtn ? bpCsvBtn('bpCsvHours()', 'Export') : '')
      + '<button class="bpx-btn" style="width:auto;margin:0;padding:9px 16px;font-size:13px" onclick="bpHoursOpen()">+ Log hours</button></span></div>';

    if (!S.emps.length) {
      el.innerHTML = head + '<div class="bpx-empty2">Add someone under <b>People</b> first.</div>'; return;
    }
    if (!S.entries.length) {
      el.innerHTML = head + '<div class="bpx-empty2"><b>No hours logged yet.</b>'
        + '<div class="bpx-mut" style="font-size:13px;margin-top:5px;line-height:1.6">Every day you log goes onto that job’s budget as '
        + 'real labour cost, burden included — so the margin you see mid-job is the one you will actually get.</div></div>';
      return;
    }

    var rows = S.entries.slice(0, 120).map(function (t) {
      var e = bpEmpById(t.employee_id);
      return '<tr><td>' + esc(t.worked_on) + '</td>'
        + '<td><b>' + esc(e ? e.name : 'Removed') + '</b></td>'
        + '<td>' + esc(t.job_name || '—') + '</td>'
        + '<td>' + (+t.hours || 0) + (t.ot_hours > 0 ? ' <span style="color:#b45309">+' + t.ot_hours + ' OT</span>' : '') + '</td>'
        + '<td>' + money(t.cost) + '</td>'
        + '<td class="bpx-r"><button class="bpx-rowbtn" onclick="bpHoursDel(\'' + t.id + '\')">Remove</button></td></tr>';
    }).join('');

    el.innerHTML = head + '<div class="bpx-cwrap"><table class="bpx-ctable"><thead><tr>'
      + '<th>Day</th><th>Who</th><th>Job</th><th>Hours</th><th>Cost to you</th><th></th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="bpx-mut" style="font-size:11.5px;margin-top:9px">Cost is the burdened rate at the time it was logged — '
      + 'a rate change later does not rewrite what a finished job cost.</div>';
  }

  window.bpHoursOpen = function (jobId) {
    var jobs = (typeof bpJobsGet === 'function' ? bpJobsGet() : []).filter(function (j) { return j.status === 'active'; });
    var today = new Date(); var iso = today.toISOString().slice(0, 10);
    var emps = bpEmpsActive();
    if (!emps.length) { alert('Add someone under People first.'); return; }
    bpModal('<h3>Log hours</h3><div class="bpx-sub">One person, one day, one job.</div>'
      + '<label>Who</label><select id="hr-emp">' + emps.map(function (e) {
          return '<option value="' + e.id + '">' + esc(e.name) + (e.trade ? ' — ' + esc(e.trade) : '') + '</option>';
        }).join('') + '</select>'
      + '<label>Job</label><select id="hr-job">' + (jobs.length
          ? jobs.map(function (j) {
              return '<option value="' + esc(j.id) + '"' + (jobId === j.id ? ' selected' : '') + '>' + esc((j.name || 'Job') + ' — ' + (j.title || '')) + '</option>';
            }).join('')
          : '<option value="">No active projects</option>') + '</select>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">'
        + '<div><label>Day</label><input id="hr-day" type="date" value="' + iso + '"></div>'
        + '<div><label>Hours</label><input id="hr-h" type="number" min="0" max="24" step="0.5" value="8" oninput="bpHoursHint()"></div>'
        + '<div><label>Overtime</label><input id="hr-ot" type="number" min="0" max="24" step="0.5" value="0" oninput="bpHoursHint()"></div></div>'
      + '<div class="bpx-mut" style="font-size:12px;margin-top:6px;line-height:1.6">Overtime is entered, not worked out for you: '
        + 'the federal rule is over 40 in a week, but several states count over 8 in a day. Yours is the one that applies.</div>'
      + '<label>Note</label><input id="hr-note" placeholder="Tear-off, dry-in, anything worth remembering">'
      + '<div class="bpx-mut" id="hr-hint" style="font-size:12.5px;margin-top:10px"></div>'
      + '<div class="bpx-mmsg" id="bpx-mmsg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button>'
      + '<button class="bpx-btn" id="hr-go" onclick="bpHoursSave()">Log it</button></div>');
    var sel = $('hr-emp'); if (sel) sel.onchange = bpHoursHint;
    bpHoursHint();
  };

  window.bpHoursHint = function () {
    var e = bpEmpById(($('hr-emp') || {}).value);
    var h = +($('hr-h') || {}).value || 0, ot = +($('hr-ot') || {}).value || 0;
    var el = $('hr-hint'); if (!el || !e) return;
    var c = entryCost(e, h, ot);
    el.innerHTML = 'That is <b>' + money(c) + '</b> of labour on the job'
      + (e.burden_pct > 0 ? ' — ' + money(burdenedOf(e)) + '/hr including the ' + e.burden_pct + '% on top'
        : ' at the bare wage, with no payroll tax or comp added')
      + (ot > 0 ? '. Overtime is counted at time and a half.' : '.');
  };

  window.bpHoursSave = function () {
    var e = bpEmpById(($('hr-emp') || {}).value);
    var jobId = ($('hr-job') || {}).value || '';
    var jobs = typeof bpJobsGet === 'function' ? bpJobsGet() : [];
    var job = jobs.filter(function (j) { return j.id === jobId; })[0];
    var h = +($('hr-h') || {}).value || 0, ot = +($('hr-ot') || {}).value || 0;
    if (!e) { msg('Pick who worked.'); return; }
    if (!(h > 0 || ot > 0)) { msg('Put some hours in.'); return; }
    var btn = $('hr-go'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    var row = {
      owner: window.bpOwnerId ? bpOwnerId() : undefined,
      employee_id: e.id, job_id: jobId, job_name: job ? ((job.name || '') + ' — ' + (job.title || '')) : '',
      worked_on: ($('hr-day') || {}).value || new Date().toISOString().slice(0, 10),
      hours: h, ot_hours: ot, note: ($('hr-note') || {}).value || '',
      cost: entryCost(e, h, ot)
    };
    Promise.resolve(BP_SB.from('time_entries').insert(row)).then(function (r) {
      if (r && r.error) throw r.error;
      bpCloseModal(); bpCrewLoad(true).then(function () {
        if (window._bpCurView === 'employees') render();
        /* the project budget's labour line has just moved */
        if (document.getElementById('bpx-pj-budget') && window.bpProjBudgetRender) bpProjBudgetRender();
        if (document.getElementById('bpx-pj-crew') && window.bpProjCrewRender) bpProjCrewRender();
      });
    }, function (er) {
      if (btn) { btn.disabled = false; btn.textContent = 'Log it'; }
      msg((er && er.message) || 'Couldn’t save that.');
    });
  };

  window.bpHoursDel = function (id) {
    if (!confirm('Remove this day? The job it was on will cost that much less.')) return;
    S.entries = S.entries.filter(function (x) { return x.id !== id; });
    render();
    Promise.resolve(BP_SB.from('time_entries').delete().eq('id', id))
      .then(function () {}, function () { bpCrewLoad(true).then(render); });
  };

  window.bpCsvHours = function () {
    bpCsv('hours', ['Day', 'Who', 'Type', 'Job', 'Hours', 'Overtime', 'Cost to you', 'Note'],
      S.entries.map(function (t) {
        var e = bpEmpById(t.employee_id);
        return [t.worked_on, e ? e.name : '', e ? e.kind : '', t.job_name, t.hours, t.ot_hours, t.cost, t.note];
      }));
  };

  /* -------------------------------------------------------- pay period --- */
  /* Gross, for export. It says gross and means gross: no withholding, no
     deductions, no filing. Showing a "net pay" here would be a number
     somebody trusts, and we have no business computing it. */
  function payPeriod(el) {
    var end = new Date(), start = new Date(Date.now() - 13 * 864e5);
    var f = (S.payFrom || start.toISOString().slice(0, 10)), t = (S.payTo || end.toISOString().slice(0, 10));
    var rows = S.entries.filter(function (x) { return x.worked_on >= f && x.worked_on <= t; });

    var by = {};
    rows.forEach(function (x) {
      var e = bpEmpById(x.employee_id); if (!e) return;
      var k = e.id;
      by[k] = by[k] || { e: e, h: 0, ot: 0, cost: 0, jobs: {} };
      by[k].h += +x.hours || 0; by[k].ot += +x.ot_hours || 0; by[k].cost += +x.cost || 0;
      if (x.job_name) by[k].jobs[x.job_name] = 1;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; });

    var gross = function (r) {
      var e = r.e;
      if (e.pay_type === 'hourly') return r.h * (+e.rate || 0) + r.ot * (+e.rate || 0) * 1.5;
      if (e.pay_type === 'day') return (r.h / 8) * (+e.rate || 0);
      return 0;  /* salary is an agreement about the period, not about these hours */
    };
    var totG = 0, totC = 0;
    list.forEach(function (r) { totG += gross(r); totC += r.cost; });

    var head = '<div class="bpx-chead" style="margin-bottom:10px">'
      + '<div class="bpx-ptitle" style="margin:0">Pay period'
      + '<span class="lg2" style="margin-left:8px">what to hand to whoever runs your payroll</span></div>'
      + (window.bpCsvBtn ? bpCsvBtn('bpCsvPay()', 'Export') : '') + '</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">'
      + '<div><label class="st-lab" style="display:block;font-size:12px;font-weight:600">From</label>'
        + '<input type="date" value="' + f + '" onchange="bpPayRange(this.value,null)"></div>'
      + '<div><label class="st-lab" style="display:block;font-size:12px;font-weight:600">To</label>'
        + '<input type="date" value="' + t + '" onchange="bpPayRange(null,this.value)"></div></div>';

    /* Said once, plainly, and not buried: this is not a payroll run. */
    var note = '<div class="bg-warn" style="margin-top:14px"><span class="ms">info</span><span>'
      + '<b>This is not a payroll run.</b> These are gross figures for the period — no tax withheld, nothing filed, no money moved. '
      + 'Hand them to Gusto, QuickBooks, ADP or your bookkeeper, whichever you already use. '
      + 'What you get here that they cannot give you is the job each hour went into.</span></div>';

    if (!list.length) {
      el.innerHTML = head + '<div class="bpx-empty2">No hours logged in this period.</div>' + note; return;
    }

    el.innerHTML = head
      + '<div class="bg-top"><div><b>' + money(totG) + '</b><span>gross wages</span></div>'
      + '<div><b>' + money(totC) + '</b><span>true cost with burden</span></div>'
      + '<div><b>' + money(totC - totG) + '</b><span>tax, comp and the rest</span></div>'
      + '<div><b>' + list.length + '</b><span>' + (list.length === 1 ? 'person' : 'people') + '</span></div></div>'
      + '<div class="bpx-cwrap"><table class="bpx-ctable"><thead><tr>'
      + '<th>Who</th><th>Type</th><th>Hours</th><th>OT</th><th>Gross</th><th>Costs you</th><th>Jobs</th>'
      + '</tr></thead><tbody>'
      + list.map(function (r) {
          var g = gross(r);
          return '<tr><td><b>' + esc(r.e.name) + '</b></td>'
            + '<td><span class="bpx-badge' + (r.e.kind === '1099' ? '' : ' ok') + '">' + (r.e.kind === '1099' ? '1099' : 'W-2') + '</span></td>'
            + '<td>' + r.h + '</td><td>' + (r.ot || '—') + '</td>'
            + '<td>' + (r.e.pay_type === 'salary' ? '<span class="bpx-mut">salaried</span>' : '<b>' + money(g) + '</b>') + '</td>'
            + '<td>' + money(r.cost) + '</td>'
            + '<td class="bpx-mut" style="font-size:11.5px">' + esc(Object.keys(r.jobs).join(', ') || '—') + '</td></tr>';
        }).join('')
      + '</tbody></table></div>' + note;
  }

  window.bpPayRange = function (f, t) {
    if (f) S.payFrom = f;
    if (t) S.payTo = t;
    pane();
  };

  window.bpCsvPay = function () {
    var f = S.payFrom, t = S.payTo;
    var rows = S.entries.filter(function (x) { return (!f || x.worked_on >= f) && (!t || x.worked_on <= t); });
    var by = {};
    rows.forEach(function (x) {
      var e = bpEmpById(x.employee_id); if (!e) return;
      by[e.id] = by[e.id] || { e: e, h: 0, ot: 0, cost: 0 };
      by[e.id].h += +x.hours || 0; by[e.id].ot += +x.ot_hours || 0; by[e.id].cost += +x.cost || 0;
    });
    bpCsv('pay-period', ['Who', 'Type', 'Paid by', 'Rate', 'Hours', 'Overtime', 'Gross', 'True cost'],
      Object.keys(by).map(function (k) {
        var r = by[k], e = r.e;
        var g = e.pay_type === 'hourly' ? r.h * e.rate + r.ot * e.rate * 1.5
          : e.pay_type === 'day' ? (r.h / 8) * e.rate : '';
        return [e.name, e.kind, e.pay_type, e.rate, r.h, r.ot, g, r.cost];
      }));
  };
})();
