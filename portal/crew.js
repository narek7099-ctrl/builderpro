/* ==================================================================
   Employees, their hours, and what labor actually cost each job.

   Explicitly NOT payroll. Running payroll means withholding tax, filing
   with the IRS and the state, and moving money — regulated work where a
   bug becomes the customer's tax liability rather than our support
   ticket. Every contractor already pays through Gusto, QuickBooks, ADP
   or a bookkeeper, and none of them is going to switch to a roofing CRM
   for it.

   What they do lack is job costing on labor. Their payroll provider
   knows Dave earned $1,240 last week; it has no idea that $780 of it
   went into the Smith roof. So they guess at labor when they quote, and
   find out whether they guessed right months later, if ever. This is the
   only place that knows both the hours and the job, so this is where
   that question gets answered.

   The page therefore does three things and stops: keeps the people,
   takes the hours against a job, and hands the period's gross to
   whatever really runs the payroll.
   ================================================================== */
(function () {
  'use strict';
  /* 2026-10-24 → Sat, Oct 24 (the worked_on day, no timezone shift) */
  function dayLabel(d) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(d || '')); if (!m) return String(d || ''); return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

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

     A contractor who budgets labor at the wage is underwater before the
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

  /* The project budget's labor line. Reads from hours logged rather than
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
    if (!live()) {
      /* the signed-out example portal: sample people with a work record
         (portal/reviews.js), so the page shows what it does */
      var X = window.BP_REV_SAMPLE;
      if (X && !S.sample) { S.emps = X.emps.map(function (e) { return Object.assign({}, e); }); S.entries = []; S.sample = true; }
      S.loaded = true; S.err = X ? '' : 'signed-out';
      return (window.bpRevLoad ? bpRevLoad() : Promise.resolve()).then(function () { return S; });
    }
    S.sample = false;
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
      return window.bpRevLoad ? bpRevLoad(true).then(function () { return S; }, function () { return S; }) : S;
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

    var tabs = [['people', 'People'], ['crews', 'Crews'], ['hours', 'Hours'], ['pay', 'Pay period']];
    /* Hours and Crews draw their own cards (2026-11-26), so the page panel goes flat for them */
    area.innerHTML = '<div class="bpx-panel' + (S.tab === 'hours' || S.tab === 'crews' ? ' emp-flat' : '') + '">'
      + '<div class="bpx-jobtabs bpx-mtabs">'
      + tabs.map(function (t) {
          return '<button class="bpx-jt' + (S.tab === t[0] ? ' on' : '') + '" onclick="bpCrewTab(\'' + t[0] + '\')">' + t[1] + '</button>';
        }).join('')
      + '</div><div id="bpCrewPane"></div></div>';
    pane();
  }

  window.bpCrewTab = function (t) { S.tab = t; render(); };
  window.bpCrewTabIs = function (t) { return S.tab === t && !!$('bpCrewPane'); };

  function pane() {
    var el = $('bpCrewPane'); if (!el) return;
    if (S.tab === 'people') return people(el);
    if (S.tab === 'crews') { el.innerHTML = window.bpCrewsHtml ? bpCrewsHtml(true) : ''; return; }
    if (S.tab === 'hours') return hours(el);
    return payPeriod(el);
  }

  /* ----------------------------------------------------------- people --- */
  function people(el) {
    var head = '<div class="bpx-chead" style="margin-bottom:12px">'
      + '<div class="bpx-ptitle" style="margin:0">Your people'
      + '<span class="lg2" style="margin-left:8px">everyone who works on your jobs, on the books or on a 1099</span></div>'
      + '<span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      + (S.emps.length > 1 ? '<label class="emp-sort">Sort<select onchange="bpEmpSort(this.value)">'
          + [['name', 'Name'], ['rating', 'Rating'], ['jobs', 'Jobs done'], ['exp', 'Experience']].map(function (o) {
              return '<option value="' + o[0] + '"' + (S.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' : '')
      + '<button class="bpx-addbtn" onclick="bpEmpOpen()">+ Add someone</button></span></div>';

    if (S.sample) head += '<div class="emp-sample"><span class="ms">info</span><span>Sample crew. Sign in and your own people, their completed jobs and client ratings show here.</span></div>';
    head += '<div id="bpClockNow"></div>';
    setTimeout(function () { if (window.bpClockNowFill) bpClockNowFill(); }, 0);
    if (!S.emps.length) {
      el.innerHTML = head + '<div class="bpx-empty2"><b>Nobody added yet.</b>'
        + '<div class="bpx-mut" style="font-size:13px;margin-top:5px;line-height:1.6">Add your crew and you can put their hours against a job — '
        + 'which is what turns the labor line on a project budget from a guess into a number.</div></div>';
      return;
    }

    var list = S.emps.slice(), st = {};
    if (window.bpWorkerStats) list.forEach(function (e) { st[e.id] = bpWorkerStats(e.id); });
    if (S.sort && S.sort !== 'name') list.sort(function (a, b) {
      var x = st[a.id] || {}, y = st[b.id] || {};
      if (S.sort === 'rating') return (y.reviews ? y.rating : -1) - (x.reviews ? x.rating : -1) || (y.reviews || 0) - (x.reviews || 0);
      if (S.sort === 'jobs') return (y.jobsDone || 0) - (x.jobsDone || 0);
      return (+a.started_trade_year || 9999) - (+b.started_trade_year || 9999);
    });
    var rows = list.map(function (e) {
      var r = hourlyOf(e), b = burdenedOf(e);
      var rateTxt = e.pay_type === 'hourly' ? money(e.rate) + '/hr'
        : e.pay_type === 'day' ? money(e.rate) + '/day'
        : money(e.rate) + '/yr';
      return '<tr' + (e.active ? '' : ' style="opacity:.55"') + '>'
        + '<td><div class="emp-who">' + (window.bpAvatar ? bpAvatar.html(e.photo_url, e.name, 'emp-av') : '') + '<div><button type="button" class="emp-name" onclick="bpEmpProfile(\'' + e.id + '\')" title="Open profile"><b>' + esc(e.name || 'Unnamed') + '</b></button>'
          + (e.trade ? '<div class="bpx-mut" style="font-size:11.5px">' + esc(e.trade) + '</div>' : '')
          + (function () { var c = window.bpCrewOfEmp ? bpCrewOfEmp(e.id) : null;
              return c ? '<div style="font-size:11.5px;margin-top:2px;color:' + c.color + ';font-weight:600">\u25CF ' + esc(c.name) + '</div>' : ''; })() + '</div></div></td>'
        + '<td>' + (e.phone ? '<a href="tel:' + esc(e.phone) + '" style="color:#2f6bff;text-decoration:none">' + esc(e.phone) + '</a>' : '—')
          + (e.email ? '<div class="bpx-mut" style="font-size:11.5px">' + esc(e.email) + '</div>' : '') + '</td>'
        + '<td>' + (window.bpEmpRecordHtml ? bpEmpRecordHtml(e) : '') + '</td>'
        + '<td><span class="bpx-badge' + (e.kind === '1099' ? '' : ' ok') + '">' + (e.kind === '1099' ? '1099' : 'W-2') + '</span></td>'
        + '<td>' + rateTxt + '</td>'
        + '<td>' + (b > 0 ? '<b>' + money(b) + '</b>/hr' : '—')
          + (e.burden_pct > 0 ? '<div class="bpx-mut" style="font-size:11.5px">+' + e.burden_pct + '% payroll tax &amp; insurance</div>'
            : (e.kind === 'w2' ? '<div class="bpx-mut" style="font-size:11.5px;color:#0953b4">payroll tax &amp; insurance not set</div>' : '')) + '</td>'
        + '<td class="bpx-r" style="white-space:nowrap">'
          + (window.bpEmpProfile ? '<button class="bpx-rowbtn" onclick="bpEmpProfile(\'' + e.id + '\')">Profile</button>' : '')
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
        + ' no payroll tax or workers’ comp added. That usually adds 25–50% to their cost, so jobs look more profitable than they are. Add it under Edit on each person.</span></div>'
      : '';

    el.innerHTML = head
      + '<div class="bpx-cwrap"><table class="bpx-ctable"><thead><tr>'
      + '<th>Name</th><th>Contact</th><th>Reviews</th><th>Type</th><th>Rate</th><th>Cost to you</th><th></th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>' + warn;
    if (window.bpAvatar) bpAvatar.fill(el);
  }

  window.bpEmpSort = function (v) { S.sort = v; pane(); };

  window.bpEmpOpen = function (id) {
    var e = id ? bpEmpById(id) : null;
    var f = e || { name: '', phone: '', email: '', trade: '', kind: 'w2', pay_type: 'hourly', rate: 0, burden_pct: 0, notes: '' };
    var inp = function (k, ph, v, type) {
      return '<input id="emp-' + k + '"' + (type ? ' type="' + type + '"' : '') + ' placeholder="' + ph + '" value="' + esc(v == null ? '' : v) + '">';
    };
    bpModal('<h3>' + (e ? 'Edit ' + esc(e.name || 'person') : 'Add someone') + '</h3>'
      + '<div class="bpx-sub">Everyone who works on your jobs — employees and subcontractors alike.</div>'
      + (e && window.bpAvatar ? '<div class="emp-ph"><button type="button" class="emp-phb" onclick="bpEmpPhoto(\'' + e.id + '\')" aria-label="Change photo">' + bpAvatar.html(e.photo_url, e.name, 'emp-av lg') + '</button>'
          + '<div><b>Photo</b><span>Shows on their ID card and next to their name.</span><div class="emp-phacts"><button type="button" class="bpx-rowbtn" onclick="bpEmpPhoto(\'' + e.id + '\')">' + (e.photo_url ? 'Change' : 'Upload') + '</button>'
          + (e.photo_url ? '<button type="button" class="bpx-rowbtn" onclick="bpEmpPhoto(\'' + e.id + '\',true)">Remove</button>' : '') + '</div></div></div>' : '')
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
        + '<div><label>Payroll tax &amp; insurance</label>'
          + '<div style="display:flex;align-items:center;gap:6px"><input id="emp-burden" type="number" min="0" max="200" step="1" '
          + 'value="' + (+f.burden_pct || '') + '" placeholder="0" oninput="bpEmpKind()" style="flex:1"><span class="bpx-mut">%</span></div></div></div>'
      + '<div class="bpx-mut" id="emp-hint" style="font-size:12px;margin-top:8px;line-height:1.6"></div>'
      /* what some states require on a W-2 pay stub (2026-11-27): an ID and the sick leave they have */
      + '<div class="bpx-sub" style="margin:16px 0 0;font-weight:600;color:var(--ink,inherit)">On pay stubs</div>'
      + '<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:0">'
        + '<div><label>ID</label><div style="display:flex;gap:6px"><select id="emp-idk" aria-label="Which ID" style="flex:0 0 44%;min-width:0;width:44%"><option value="num"' + (/^ssn:/.test(f.stub_id || '') ? '' : ' selected') + '>Employee #</option><option value="ssn"' + (/^ssn:/.test(f.stub_id || '') ? ' selected' : '') + '>SSN, last 4</option></select>'
          + '<input id="emp-stubid" maxlength="12" autocomplete="off" placeholder="e.g. 1234" value="' + esc(String(f.stub_id || '').replace(/^ssn:/, '')) + '" style="flex:1;min-width:0"></div></div>'
        + '<div><label>Paid sick leave available</label><div style="display:flex;align-items:center;gap:6px"><input id="emp-sick" type="number" min="0" max="999" step="0.5" placeholder="hours" value="' + (f.sick_hours == null ? '' : esc(f.sick_hours)) + '" style="flex:0 1 160px"><span class="bpx-mut">hrs</span></div></div></div>'
      + '<div class="bpx-mut" style="font-size:12px;margin-top:6px;line-height:1.5">Some states, like California, require these on a W-2 employee\u2019s pay stub. Never the full Social Security number: only the last 4 digits are kept.</div>'
      + '<div class="bpx-sub" style="margin:16px 0 0;font-weight:600;color:var(--ink,inherit)">Experience</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div><label>Started in the trade</label><input id="emp-sty" type="number" min="1940" max="' + new Date().getFullYear() + '" placeholder="e.g. 2012" value="' + esc(f.started_trade_year || '') + '"></div>'
        + '<div><label>With you since</label><input id="emp-hired" type="date" value="' + esc(f.hired_on || (f.created_at ? String(f.created_at).slice(0, 10) : '')) + '"></div></div>'
      + '<label>Skills <span class="bpx-mut" style="font-weight:400">(comma separated)</span></label>' + inp('skills', 'Shingle, Flat roof, Gutters', (f.skills || []).join(', '))
      + '<label>Certifications</label>' + inp('certs', 'OSHA 30, manufacturer certified installer', f.certifications)
      + '<label>About them</label><textarea id="emp-bio" rows="2" maxlength="600" placeholder="A line or two. They see this on their ID.">' + esc(f.bio || '') + '</textarea>'
      + '<label>Notes</label>' + inp('notes', 'Who to call, anything else', f.notes)
      + '<div class="bpx-mmsg" id="bpx-mmsg"></div>'
      + '<div class="row" style="justify-content:space-between">'
        + (e ? '<span class="bpx-skip" onclick="bpEmpDel(\'' + e.id + '\')">Remove</span>' : '<span></span>')
        + '<span style="display:flex;gap:10px"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button>'
        + '<button class="bpx-btn" id="emp-go" onclick="bpEmpSave(' + (e ? "'" + e.id + "'" : 'null') + ')">Save</button></span></div>');
    bpEmpKind();
    if (e && window.bpAvatar) bpAvatar.fill($('bpx-modal'));
  };

  /* the owner sets or clears someone's photo (the same file their ID card uses) */
  window.bpEmpPhoto = function (id, remove) {
    var e = bpEmpById(id); if (!e || !window.bpAvatar) return;
    var save = function (ref) {
      return Promise.resolve(BP_SB.from('employees').update({ photo_url: ref }).eq('id', id)).then(function (r) {
        if (r && r.error) throw r.error;
        e.photo_url = ref; bpEmpOpen(id); if ($('bpCrewPane')) render();
      });
    };
    if (remove) {
      if (!confirm('Remove ' + (e.name || 'their') + '’s photo?')) return;
      var old = String(e.photo_url || '');
      save(null).then(function () { if (old.indexOf('sb:') === 0) BP_SB.storage.from('project-files').remove([old.slice(3).split('#')[0]]).catch(function () {}); })
        .catch(function (x) { msg((x && x.message) || 'Couldn’t remove the photo.'); });
      return;
    }
    bpAvatar.pick((e.name || 'Their') + ' — photo').then(function (blob) {
      if (!blob) { bpEmpOpen(id); return; }
      var owner = e.owner || (window.bpOwnerId && bpOwnerId());
      return bpAvatar.upload(owner, id, blob).then(save);
    }).catch(function (x) { bpEmpOpen(id); setTimeout(function () { msg((x && x.message) || 'Couldn’t save the photo.'); }, 50); });
  };

  /* The hint under the rate is the whole argument of this page in two lines,
     so it updates live rather than sitting in help nobody opens. */
  window.bpEmpKind = function () {
    var kind = ($('emp-kind') || {}).value, pt = ($('emp-pt') || {}).value;
    var amt = window.bpParseMoney ? bpParseMoney(($('emp-rate') || {}).value || '0') : 0;
    var bur = +($('emp-burden') || {}).value || 0;
    var lab = $('emp-ratelab'); if (lab) lab.textContent = pt === 'hourly' ? 'Per hour' : pt === 'day' ? 'Per day' : 'Per year';
    var hint = $('emp-hint'); if (!hint) return;
    var per = pt === 'hourly' ? amt : pt === 'day' ? amt / 8 : amt / 2080;
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
      : '<span style="color:#0953b4">Payroll tax and workers’ comp usually add 25–50% on top of the wage, and roofing comp rates '
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
    var sty = parseInt(g('sty'), 10), yr = new Date().getFullYear();
    var prof = {
      started_trade_year: sty >= 1940 && sty <= yr ? sty : null,
      skills: g('skills').split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 20),
      certifications: g('certs') || null,
      bio: (($('emp-bio') || {}).value || '').trim().slice(0, 600) || null
    };
    if (g('hired')) prof.hired_on = g('hired');
    /* pay stub ID: an employee number, or only the LAST 4 digits of an SSN (never more) */
    var sid = g('stubid').replace(/\s+/g, ''), idk = ($('emp-idk') || {}).value;
    if (idk === 'ssn') { sid = sid.replace(/\D/g, '').slice(-4); prof.stub_id = sid ? 'ssn:' + sid : null; }
    else prof.stub_id = sid ? sid.slice(0, 12) : null;
    var sk = g('sick'); prof.sick_hours = sk === '' ? null : Math.max(0, Math.min(999, Math.round((+sk || 0) * 100) / 100));
    Object.keys(prof).forEach(function (k) { row[k] = prof[k]; });
    if (S.sample) {   /* example portal: nothing to save to */
      if (id) Object.assign(bpEmpById(id) || {}, row);
      else S.emps.push(Object.assign({ id: 'sx-' + Date.now(), active: true, created_at: new Date().toISOString() }, row));
      bpCloseModal(); render(); return;
    }
    var btn = $('emp-go'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    var send = function (r0) {
      return id ? BP_SB.from('employees').update(r0).eq('id', id)
                : BP_SB.from('employees').insert(Object.assign({ owner: window.bpOwnerId ? bpOwnerId() : undefined }, r0));
    };
    Promise.resolve(send(row)).then(function (r) {
      /* the experience columns not migrated yet: save the rest */
      if (r && r.error && /started_trade_year|hired_on|skills|certifications|bio|stub_id|sick_hours/.test(String(r.error.message || ''))) {
        Object.keys(prof).forEach(function (k) { delete row[k]; });
        return send(row);
      }
      return r;
    }).then(function (r) {
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
    if (S.sample) return;
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

  /* ------------------------------------------- punches made by a crew lead --- */
  /* A crew lead can clock their crew in and out (crew_clock_for); those
     shifts carry who did it and where the lead's phone was. The person can
     report a punch they didn't make, which flags the entry here and in the
     pay period until the owner or office clears it. */
  window.bpByLeadTag = function (name, lat, lng) {
    if (!name) return '';
    var first = String(name).trim().split(/\s+/)[0];
    return '<span class="bylead" title="Clocked by ' + esc(name) + ', the crew lead"><span class="ms">supervisor_account</span>by ' + esc(first) + ' (lead)'
      + (isFinite(+lat) && isFinite(+lng) && lat != null && lng != null
        ? ' <a href="https://www.google.com/maps/search/?api=1&query=' + (+lat) + ',' + (+lng) + '" target="_blank" rel="noopener" aria-label="Where ' + esc(first) + '’s phone was" title="Where ' + esc(first) + '’s phone was"><span class="ms">location_on</span></a>' : '')
      + '</span>';
  };
  function dispTag(t, withNote) {
    if (!t || !t.disputed_at) return '';
    return '<span class="bpdisp" title="' + esc(t.dispute_note || 'Reported by the crew member') + '"><span class="ms">flag</span>Disputed</span>'
      + (withNote && t.dispute_note ? '<span class="bpdisp-note">“' + esc(t.dispute_note) + '”</span>' : '');
  }
  window.bpEntryTags = function (t) { return (t ? bpByLeadTag(t.clocked_by_name, t.clocked_lat, t.clocked_lng) : '') + dispTag(t, false); };
  window.bpHoursClear = function (id) {
    var t = S.entries.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    if (!confirm('Clear the dispute? Do this once you’ve checked the hours (edit or remove the entry if they were wrong).')) return;
    Promise.resolve(BP_SB.rpc('crew_clock_dispute_clear', { p_id: id })).then(function (r) {
      if (r && r.error) throw r.error;
      t.disputed_at = null; render();
    }, function () { alert('Couldn’t clear it. Try again.'); });
  };
  window.bpHoursDisputed = function () { S.tab = 'hours'; S.hoursOnly = 'disputed'; render(); };
  window.bpHoursAll = function () { S.hoursOnly = ''; render(); };

  /* ------------------------------------------------------------ hours --- */
  /* 2026-11-26 redesign: four figures for the week up top, who carried the last 30 days,
     then the log grouped by day (each day's total on its header), one row per person:
     who, the job, the hours and what it cost. Remove is a small bin, not a button per row. */
  window.bpHoursWho = function (v) { S.hoursWho = v || ''; S.hoursDays = 0; render(); };
  window.bpHoursMore = function () { S.hoursDays = (S.hoursDays || 10) + 14; render(); };
  function hours(el) {
    var hrs = function (n) { n = Math.round(n * 10) / 10; return n + (n === 1 ? ' hr' : ' hrs'); };
    var ini = function (n) { var p = String(n || '?').replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); };
    var head = '<div class="hr6-bar"><div class="hr6-bt"><b>Hours</b><span>each day, against the job it was on</span></div><div class="hr6-ba">'
      + (window.bpCsvBtn && S.entries.length ? bpCsvBtn('bpCsvHours()', 'Export') : '')
      + '<button class="bpx-btn hr6-log" onclick="bpHoursOpen()"><span class="ms">add</span>Log hours</button></div></div>';
    if (!S.emps.length) { el.innerHTML = head + '<div class="hr6-empty"><span class="ms">group_add</span><b>Add your people first</b><p>Put your crew in under People, then log their days here.</p><button class="bpx-btn" onclick="bpCrewTab(\'people\')">Go to People</button></div>'; return; }
    if (!S.entries.length) { el.innerHTML = head + '<div class="hr6-empty"><span class="ms">schedule</span><b>No hours logged yet</b><p>Each day you log goes onto that job as labor cost, so you see the real profit while the job is still running.</p><button class="bpx-btn" onclick="bpHoursOpen()">Log the first day</button></div>'; return; }

    /* this week and last week (weeks start Monday) */
    var d0 = new Date(); d0.setHours(0, 0, 0, 0); var dow = (d0.getDay() + 6) % 7;
    var wk = new Date(d0.getTime() - dow * 864e5), lw = new Date(wk.getTime() - 7 * 864e5);
    var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
    var wkS = iso(wk), lwS = iso(lw);
    var sum = function (from, to) { var o = { h: 0, ot: 0, c: 0, ppl: {} }; S.entries.forEach(function (t) { var d = String(t.worked_on || ''); if (d < from || (to && d >= to)) return; o.h += +t.hours || 0; o.ot += +t.ot_hours || 0; o.c += +t.cost || 0; o.ppl[t.employee_id] = 1; }); return o; };
    var tw = sum(wkS), pw = sum(lwS, wkS);
    var tile = function (l, v, sub) { return '<div class="hr6-tile"><small>' + l + '</small><b>' + v + '</b><em>' + sub + '</em></div>'; };
    var tiles = '<div class="hr6-tiles">'
      + tile('This week', hrs(tw.h + tw.ot), Object.keys(tw.ppl).length + (Object.keys(tw.ppl).length === 1 ? ' person' : ' people') + ' worked')
      + tile('Overtime', hrs(tw.ot), 'this week')
      + tile('Labor cost', money(tw.c), 'this week, on your jobs')
      + tile('Last week', hrs(pw.h + pw.ot), money(pw.c) + ' of labor') + '</div>';

    var nDisp = S.entries.filter(function (t) { return t.disputed_at; }).length;
    var disp = (S.hoursOnly === 'disputed' || nDisp) ? '<div class="pay-disp"><span class="ms">flag</span><span>' + (S.hoursOnly === 'disputed'
        ? 'Showing the <b>' + nDisp + ' disputed ' + (nDisp === 1 ? 'entry' : 'entries') + '</b>. Fix or remove each one, then clear the flag.'
        : '<b>' + nDisp + ' disputed ' + (nDisp === 1 ? 'entry' : 'entries') + '</b>: a crew member says a lead’s punch was wrong.') + '</span>'
      + '<button type="button" onclick="' + (S.hoursOnly === 'disputed' ? 'bpHoursAll()">Show all' : 'bpHoursDisputed()">Review') + '</button></div>' : '';

    /* who carried the last 30 days */
    var cut = iso(new Date(d0.getTime() - 30 * 864e5)), per = {};
    S.entries.forEach(function (t) { if (String(t.worked_on || '') < cut) return; var e = bpEmpById(t.employee_id), k = e ? e.name : 'Removed'; per[k] = (per[k] || 0) + (+t.hours || 0) + (+t.ot_hours || 0); });
    var who = Object.keys(per).filter(function (k) { return per[k] > 0; });
    var chart = (window.bpChart && who.length >= 2) ? '<section class="hr6-card">' + bpChart.ranked({
      title: 'Hours by person', lead: 'last 30 days, overtime included', rows: who.map(function (k) { return { label: k, value: per[k] }; }), fmt: hrs, axis: 'Person', valueHead: 'Hours'
    }) + '</section>' : '';

    /* the log, a day at a time */
    var list = S.hoursOnly === 'disputed' ? S.entries.filter(function (t) { return t.disputed_at; }) : S.entries;
    if (S.hoursWho) list = list.filter(function (t) { return t.employee_id === S.hoursWho; });
    var byDay = {}, order = [];
    list.forEach(function (t) { var k = String(t.worked_on || ''); if (!byDay[k]) { byDay[k] = []; order.push(k); } byDay[k].push(t); });
    order.sort().reverse();
    var maxDays = S.hoursDays || 10, shownDays = order.slice(0, maxDays);
    var used = {}; S.entries.forEach(function (t) { used[t.employee_id] = 1; });
    var pick = '<select class="hr6-who" onchange="bpHoursWho(this.value)" aria-label="Show one person"><option value="">Everyone</option>'
      + S.emps.filter(function (e) { return used[e.id]; }).map(function (e) { return '<option value="' + esc(e.id) + '"' + (S.hoursWho === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('') + '</select>';
    var days = shownDays.map(function (k) {
      var rows = byDay[k], dh = 0, dc = 0; rows.forEach(function (t) { dh += (+t.hours || 0) + (+t.ot_hours || 0); dc += +t.cost || 0; });
      return '<div class="hr6-day"><div class="hr6-dh"><b>' + esc(dayLabel(k)) + '</b><span>' + hrs(dh) + ' · ' + money(dc) + '</span></div>'
        + rows.map(function (t) {
          var e = bpEmpById(t.employee_id), job = String(t.job_name || '').replace(/\s*\(sample\)/g, '');
          return '<div class="hr6-row' + (t.disputed_at ? ' disp' : '') + '"><span class="hr6-av">' + esc(ini(e ? e.name : '?')) + '</span>'
            + '<div class="hr6-rt"><b>' + esc(e ? e.name : 'Removed') + '</b><small>' + esc(job || 'No job') + '</small>'
            + (t.clocked_by_name || t.disputed_at ? '<span class="hr6-tags">' + bpByLeadTag(t.clocked_by_name, t.clocked_lat, t.clocked_lng) + dispTag(t, true)
              + (t.disputed_at ? '<button class="hr6-clear" onclick="bpHoursClear(\'' + t.id + '\')">Clear flag</button>' : '') + '</span>' : '') + '</div>'
            + '<div class="hr6-rh"><b>' + (+t.hours || 0) + 'h' + (t.ot_hours > 0 ? '<i>+' + t.ot_hours + ' OT</i>' : '') + '</b><small>' + money(t.cost) + '</small></div>'
            + '<button class="hr6-del" onclick="bpHoursDel(\'' + t.id + '\')" aria-label="Remove this day" title="Remove"><span class="ms">delete</span></button></div>';
        }).join('') + '</div>';
    }).join('');
    el.innerHTML = head + tiles + disp + chart
      + '<section class="hr6-card hr6-log"><div class="hr6-lh"><b>Every day</b>' + pick + '</div>'
      + (days || '<div class="hr6-none">Nothing logged for this person.</div>')
      + (order.length > maxDays ? '<button class="hr6-more" onclick="bpHoursMore()">Show older days</button>' : '')
      + '<p class="hr6-foot">Cost is what each person cost you on the day it was logged; a pay change later doesn’t rewrite a finished job.</p></section>';
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
    el.innerHTML = 'That is <b>' + money(c) + '</b> of labor on the job'
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
        /* the project budget's labor line has just moved */
        if (document.getElementById('bpx-pj-budget') && window.bpProjBudgetRender) bpProjBudgetRender();
        if (document.getElementById('bpx-pj-people') && window.bpProjCrewRender) bpProjCrewRender();
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
  /* Every two weeks, what each person is owed for that fortnight. Nothing is
     money until the contractor says it went out: "Mark paid" books it as an
     expense in Finances (W-2 as Labor / crew, 1099 as Subcontractor), and
     un-marking takes that entry back out. The Finances entry carries the
     person and the period, so the button always knows its own state.
     Gross is gross: no withholding, no filing — that stays with whoever
     runs their payroll. */
  var DAY = 864e5;
  function ymd(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function at(s) { return new Date(s + 'T12:00:00').getTime(); }
  function anchor() { var a = null; try { a = localStorage.getItem('bpPayAnchor'); } catch (e) {} return a || '2026-01-05'; }
  /* how often they pay: weekly, every two weeks, or monthly */
  function freq() { var f = null; try { f = localStorage.getItem('bpPayFreq'); } catch (e) {} return f === 'weekly' || f === 'monthly' ? f : 'biweekly'; }
  /* the period containing day t, as [from, to] */
  function periodOf(t) {
    if (freq() === 'monthly') { var d = new Date(at(ymd(t))); return [ymd(new Date(d.getFullYear(), d.getMonth(), 1, 12).getTime()), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getTime())]; }
    var len = freq() === 'weekly' ? 7 : 14;
    var n = Math.floor((at(ymd(t)) - at(anchor())) / (len * DAY));
    var f = at(anchor()) + n * len * DAY;
    return [ymd(f), ymd(f + (len - 1) * DAY)];
  }
  function periodEnd(from) { return periodOf(at(from))[1]; }
  function periodBefore(from) { return periodOf(at(from) - DAY)[0]; }
  function perYear() { return freq() === 'weekly' ? 52 : freq() === 'monthly' ? 12 : 26; }
  function nice(s) { return new Date(at(s)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function payKey(empId, from) { return 'pay:' + empId + ':' + from; }
  function finEntry(key) { var f = window.bpFinGet ? bpFinGet() : []; for (var i = 0; i < f.length; i++) if (f[i].payKey === key) return f[i]; return null; }

  function dueFor(from, to) {
    var by = {};
    S.entries.forEach(function (x) {
      if (x.worked_on < from || x.worked_on > to) return;
      var e = bpEmpById(x.employee_id); if (!e) return;
      var r = by[e.id] = by[e.id] || { e: e, h: 0, ot: 0, cost: 0, jobs: {}, disp: [], lead: {} };
      r.h += +x.hours || 0; r.ot += +x.ot_hours || 0; r.cost += +x.cost || 0;
      if (x.disputed_at) r.disp.push(x);
      if (x.clocked_by_name) r.lead[x.clocked_by_name] = x;
      if (x.job_name) r.jobs[x.job_name] = 1;
    });
    /* salaried people are owed their fortnight whether or not hours were logged */
    S.emps.forEach(function (e) {
      if (e.active && e.pay_type === 'salary' && !by[e.id]) by[e.id] = { e: e, h: 0, ot: 0, cost: 0, jobs: {}, disp: [], lead: {} };
    });
    return Object.keys(by).map(function (k) {
      var r = by[k], e = r.e, rt = +e.rate || 0;
      r.gross = e.pay_type === 'hourly' ? r.h * rt + r.ot * rt * 1.5
        : e.pay_type === 'day' ? (r.h / 8) * rt
        : rt / perYear();
      r.gross = Math.round(r.gross * 100) / 100;
      r.key = payKey(e.id, from); r.paid = finEntry(r.key);
      return r;
    }).filter(function (r) { return r.gross > 0 || r.paid; })
      .sort(function (a, b) { return a.e.name.localeCompare(b.e.name); });
  }

  function payPeriod(el) {
    stubCss();
    var cur = periodOf(Date.now());
    var f = S.payFrom || cur[0], t = periodEnd(f);
    var list = dueFor(f, t);
    var owed = 0, paid = 0;
    list.forEach(function (r) { if (r.paid) paid += +r.paid.amount || 0; else owed += r.gross; });

    /* the last eight fortnights, newest first, each with how much is still unpaid */
    var opts = [];
    for (var i = 0, pf = cur[0]; i < 8; i++, pf = periodBefore(pf)) {
      var pt = periodEnd(pf);
      var left = dueFor(pf, pt).filter(function (r) { return !r.paid; }).reduce(function (s2, r) { return s2 + r.gross; }, 0);
      opts.push('<option value="' + pf + '"' + (pf === f ? ' selected' : '') + '>' + nice(pf) + ' – ' + nice(pt)
        + (i === 0 ? ' (this period)' : '') + (left > 0 ? ' · ' + money(left) + ' due' : '') + '</option>');
    }

    var head = '<div class="bpx-chead" style="margin-bottom:10px">'
      + '<div class="bpx-ptitle" style="margin:0">Pay period'
      + '<span class="lg2" style="margin-left:8px">' + ({ weekly: 'every week', biweekly: 'every two weeks', monthly: 'every month' })[freq()] + ', what each person is owed</span></div>'
      + (window.bpCsvBtn ? bpCsvBtn('bpCsvPay()', 'Export') : '') + '</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">'
      + '<div><label class="st-lab" style="display:block;font-size:12px;font-weight:600">Period</label>'
        + '<select onchange="bpPayPick(this.value)">' + opts.join('') + '</select></div>'
      + '<div><label class="st-lab" style="display:block;font-size:12px;font-weight:600">You pay</label>'
        + '<select onchange="bpPayFreq(this.value)">' + [['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly']].map(function (o) {
          return '<option value="' + o[0] + '"' + (freq() === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>'
      + (freq() === 'monthly' ? '' : '<div><label class="st-lab" style="display:block;font-size:12px;font-weight:600">Periods start on</label>'
        + '<input type="date" value="' + anchor() + '" onchange="bpPayAnchor(this.value)"></div>') + '</div>';

    var note = '<div class="bg-warn" style="margin-top:14px"><span class="ms">info</span><span>'
      + '<b>Mark paid once the money has gone out.</b> That books it in Finances as an expense — W-2 wages as Labor / crew, 1099 as Subcontractor. '
      + 'Amounts are gross: no tax is withheld or filed here, so hand them to Gusto, QuickBooks, ADP or your bookkeeper as usual.</span></div>';

    /* checks only print for 1099 contractors; say so when there is no one to print one for (2026-11-26) */
    var has1099 = list.some(function (r) { return r.e.kind === '1099'; }), any1099 = S.emps.some(function (e) { return e.active && e.kind === '1099'; });
    var ckHint = has1099 ? '' : '<div class="bg-warn ck-hint" style="margin-top:14px"><span class="ms">payments</span><span><b>Paying by check?</b> '
      + (any1099 ? 'None of your 1099 contractors has hours in this period, so there are no checks to print.'
        : 'Checks print for 1099 contractors, and everyone on your team is set as W-2. (A W-2 paycheck needs tax taken out, so it goes through your payroll.) To pay someone by check, open them in Employees and set Type to 1099 subcontractor.')
      + '</span><button type="button" class="bpx-btn ghost hl-keep" onclick="bpCheckSample()">See a sample check</button></div>';
    /* (2026-11-27) checks work for everyone now, from the Pay button: no hint needed */
    var nDisp = list.reduce(function (n, r) { return n + r.disp.length; }, 0);
    if (nDisp) head += '<div class="pay-disp" role="alert"><span class="ms">flag</span><span><b>' + nDisp + ' disputed ' + (nDisp === 1 ? 'entry' : 'entries') + '</b> — review before paying.</span>'
      + '<button type="button" onclick="bpHoursDisputed()">Review</button></div>';
    if (!list.length) {
      el.innerHTML = head + '<div class="bpx-empty2">Nothing owed for ' + nice(f) + ' – ' + nice(t) + '. Log hours under Hours and they show up here.</div>' + note; return;
    }

    el.innerHTML = head
      + '<div class="bg-top"><div><b>' + money(owed) + '</b><span>still to pay</span></div>'
      + '<div><b>' + money(paid) + '</b><span>paid, in Finances</span></div>'
      + '<div><b>' + list.length + '</b><span>' + (list.length === 1 ? 'person' : 'people') + '</span></div></div>'
      /* on a phone (2026-11-26): one card per person instead of a seven-column table */
      + ((window.innerWidth || 1000) <= 760 ? '<div class="pp6-list">' + list.map(function (r) {
          var amt = r.paid ? +r.paid.amount || 0 : r.gross;
          return '<div class="pp6' + (r.disp.length ? ' disp' : '') + '"><div class="pp6-h"><div class="pp6-t"><b>' + esc(r.e.name) + '</b><small>' + (r.e.kind === '1099' ? '1099' : 'W-2')
            + ' \u00b7 ' + (r.e.pay_type === 'salary' && !r.h ? 'salary' : r.h + ' hrs' + (r.ot ? ' + ' + r.ot + ' OT' : '')) + '</small></div><div class="pp6-amt"><b>' + money(amt) + '</b><small>' + (r.paid ? 'paid' : 'due') + '</small></div></div>'
            + (Object.keys(r.jobs).length ? '<div class="pp6-jobs">' + esc(Object.keys(r.jobs).join(', ').replace(/\s*\(sample\)/g, '')) + '</div>' : '')
            + (r.disp.length ? '<div class="pp6-flag"><span class="ms">flag</span>' + r.disp.length + ' disputed ' + (r.disp.length === 1 ? 'day' : 'days') + '</div>' : '')
            + '<div class="pp6-b">' + (r.paid ? '<button class="bpx-btn ghost" onclick="bpPayStub(\'' + r.e.id + '\',\'' + f + '\')"><span class="ms">receipt_long</span>Pay stub</button>'
              : '<button class="bpx-btn ghost" onclick="bpPayOpen(\'' + r.e.id + '\',\'' + f + '\')"><span class="ms">payments</span>Pay</button>')
            + (r.paid ? '<button class="bpx-btn ghost" onclick="bpPayMark(\'' + r.e.id + '\',\'' + f + '\',0)">\u2713 Paid</button>'
              : '<button class="bpx-btn" onclick="bpPayMark(\'' + r.e.id + '\',\'' + f + '\',1)">Mark paid</button>') + '</div></div>';
        }).join('') + '</div>' : '<div class="bpx-cwrap"><table class="bpx-ctable"><thead><tr>'
      + '<th>Who</th><th>Type</th><th>Hours</th><th>OT</th><th>Due</th><th>Jobs</th><th></th>'
      + '</tr></thead><tbody>'
      + list.map(function (r) {
          var amt = r.paid ? +r.paid.amount || 0 : r.gross;
          var leads = Object.keys(r.lead);
          return '<tr' + (r.disp.length ? ' class="te-disp"' : '') + '><td><b>' + esc(r.e.name) + '</b>'
            + leads.map(function (k) { var x = r.lead[k]; return bpByLeadTag(k, x.clocked_lat, x.clocked_lng); }).join('')
            + (r.disp.length ? '<span class="bpdisp" title="' + esc(r.disp.map(function (x) { return x.dispute_note || 'Reported'; }).join(' · ')) + '"><span class="ms">flag</span>Disputed' + (r.disp.length > 1 ? ' ×' + r.disp.length : '') + '</span>' : '') + '</td>'
            + '<td><span class="bpx-badge' + (r.e.kind === '1099' ? '' : ' ok') + '">' + (r.e.kind === '1099' ? '1099' : 'W-2') + '</span></td>'
            + '<td>' + (r.e.pay_type === 'salary' && !r.h ? '<span class="bpx-mut">salary</span>' : r.h) + '</td><td>' + (r.ot || '—') + '</td>'
            + '<td><b>' + money(amt) + '</b></td>'
            + '<td class="bpx-mut" style="font-size:11.5px">' + esc(Object.keys(r.jobs).join(', ') || '—') + '</td>'
            + '<td style="text-align:right;white-space:nowrap">' + (r.paid ? '<button class="bpx-btn ghost ps-btn hl-keep" onclick="bpPayStub(\'' + r.e.id + '\',\'' + f + '\')"><span class="ms">receipt_long</span>Pay stub</button> '
              : '<button class="bpx-btn ghost ps-btn hl-keep" onclick="bpPayOpen(\'' + r.e.id + '\',\'' + f + '\')"><span class="ms">payments</span>Pay</button> ') + (r.paid
                ? '<button class="bpx-btn ghost bpx-donebtn" style="padding:6px 12px;font-size:12px" title="Undo: takes it back out of Finances" onclick="bpPayMark(\'' + r.e.id + '\',\'' + f + '\',0)">✓ Paid</button>'
                : '<button class="bpx-btn bpx-donebtn" style="padding:6px 12px;font-size:12px" onclick="bpPayMark(\'' + r.e.id + '\',\'' + f + '\',1)">Mark paid</button>')
            + '</td></tr>';
        }).join('')
      + '</tbody></table></div>')
      + '<div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="bpx-btn ghost" onclick="bpPayStubPrint(\'\',\'' + f + '\')">Print every pay stub</button>'
      + (list.some(function (r) { return r.e.kind === '1099'; }) ? '<button class="bpx-btn ghost" onclick="bpCheckPrint(\'\',\'' + f + '\',0)">Print checks for 1099 contractors</button>' : '') + '</div>'
      + (owed > 0 && list.filter(function (r) { return !r.paid; }).length > 1
          ? '<div style="margin-top:10px;text-align:right"><button class="bpx-btn" onclick="bpPayAll(\'' + f + '\')">Mark everyone paid · ' + money(owed) + '</button></div>' : '')
      + note;
  }

  /* ------------------------------------------------------------ Pay --- */
  /* 2026-11-27: checks for W-2 people too. Their check is for take-home pay, which the owner
     types in after working out the taxes with their payroll or accountant (BuilderPro does not
     calculate or file payroll tax); the stub then shows gross, taxes and deductions, take-home. */
  function ckNet() { var el = $('ckNet'); if (!el) return null; var v = parseFloat(String(el.value).replace(/[^0-9.]/g, '')); return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null; }
  /* 2026-11-26 (the owner's ask): one Pay button per person. It asks how: a pay stub, a
     check, or both (the check with the pay stub printed after it). Checks are for 1099
     contractors only; a W-2 paycheck needs tax taken out, so that goes through payroll and
     only the stub is offered. Choosing does nothing yet: each road keeps its own preview
     and its own two-step confirmation before anything is printed or booked. */
  window.bpPayOpen = function (empId, from) {
    from = from || S.payFrom || periodOf(Date.now())[0];
    var d = stubData(empId, from); if (!d) return;
    var c99 = d.e.kind === '1099', amt = d.r.gross;
    var opt = function (k, ico, t, sub, on, off) {
      return '<label class="pay6-o' + (off ? ' off' : '') + '"><input type="radio" name="pay6" value="' + k + '"' + (on ? ' checked' : '') + (off ? ' disabled' : '') + '>'
        + '<span class="pay6-i"><span class="ms">' + ico + '</span></span><span class="pay6-t"><b>' + t + '</b><small>' + sub + '</small></span><span class="pay6-r" aria-hidden="true"></span></label>';
    };
    bpModal('<div class="pay6"><h3>Pay ' + esc(d.e.name) + '</h3>'
      + '<div class="pay6-amt"><b>' + m2(amt) + '</b><span>' + esc(nice(d.from)) + ' \u2013 ' + esc(nice(d.to)) + ' \u00b7 ' + (c99 ? '1099 contractor' : 'W-2 employee') + '</span></div>'
      + '<div class="pay6-l" role="radiogroup" aria-label="How do you want to pay?">'
      + opt('stub', 'receipt_long', 'Pay stub', 'The record of hours and pay, to print or save as a PDF.', !c99, false)
      + opt('check', 'payments', 'Check', 'Print a check, signed with your saved e-signature.' + (c99 ? '' : ' You enter their take-home pay after taxes.'), false, false)
      + opt('both', 'library_books', 'Both', 'The check, with the pay stub printed right after it.', c99, false)
      + '</div><p class="pay6-n">Nothing is printed or marked paid yet: you see it first, then confirm.</p>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" onclick="bpPayGo(\'' + d.e.id + '\',\'' + d.from + '\')">Next</button></div></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) mc.style.maxWidth = '460px';
    payCss();
  };
  window.bpPayGo = function (empId, from) {
    var r = document.querySelector('input[name="pay6"]:checked'), k = r ? r.value : 'stub';
    if (k === 'stub') return bpPayStub(empId, from);
    bpPayCheck(empId, from, { stub: k === 'both' });
  };
  function payCss() {
    if (document.getElementById('pay6-css')) return;
    var c = document.createElement('style'); c.id = 'pay6-css';
    c.textContent = '#bpx .pay6 h3{margin:0 0 4px}#bpx .pay6-amt{margin:0 0 14px}#bpx .pay6-amt b{display:block;font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}#bpx .pay6-amt span{font-size:13.5px;color:var(--grey)}'
      + '#bpx .pay6-l{display:flex;flex-direction:column;gap:8px}'
      + '#bpx .pay6-o{display:flex !important;align-items:center;gap:12px;margin:0 !important;padding:12px 14px !important;border:1.5px solid var(--line);border-radius:14px;background:var(--card,#fff);cursor:pointer;text-transform:none !important;letter-spacing:0 !important;font-weight:400 !important;color:var(--ink) !important}'
      + '#bpx .pay6-o input{position:absolute;opacity:0;pointer-events:none}'
      + '#bpx .pay6-o:has(input:checked){border-color:var(--blue);background:var(--blue-l)}#bpx .pay6-o:has(input:focus-visible){outline:2px solid var(--blue);outline-offset:2px}'
      + '#bpx .pay6-o.off{opacity:.5;cursor:not-allowed}'
      + '#bpx .pay6-i{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:12px;background:var(--soft);color:var(--blue)}#bpx .pay6-i .ms{font-size:22px}'
      + '#bpx .pay6-t{flex:1;min-width:0}#bpx .pay6-t b{display:block;font-size:15.5px;font-weight:700}#bpx .pay6-t small{display:block;margin-top:1px;font-size:13px;line-height:1.4;color:var(--grey)}'
      + '#bpx .pay6-r{flex:none;width:20px;height:20px;border-radius:50%;border:2px solid var(--line)}#bpx .pay6-o:has(input:checked) .pay6-r{border:6px solid var(--blue)}'
      + '#bpx .pay6-n{margin:12px 0 0;font-size:12.5px;color:var(--grey)}';
    document.head.appendChild(c);
  }

  /* ------------------------------------------------------- pay stubs --- */
  /* 2026-11-26: a pay stub per person per period, shown first as a preview (like an
     invoice or an estimate) and printed or saved as a PDF from there. Gross pay only:
     BuilderPro does not withhold or file tax, and the stub says so. */
  var m2 = function (n) { n = Math.round((+n || 0) * 100) / 100; return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  function stubData(empId, from) {
    var to = periodEnd(from), r = dueFor(from, to).filter(function (x) { return x.e.id === empId; })[0]; if (!r) return null;
    var e = r.e, rt = +e.rate || 0, lines = [];
    if (e.pay_type === 'hourly') {
      if (r.h) lines.push(['Regular hours', r.h, rt, r.h * rt]);
      if (r.ot) lines.push(['Overtime (time and a half)', r.ot, rt * 1.5, r.ot * rt * 1.5]);
    } else if (e.pay_type === 'day') lines.push(['Days worked', Math.round(r.h / 8 * 100) / 100, rt, (r.h / 8) * rt]);
    else lines.push(['Salary for this period', 1, rt / perYear(), rt / perYear()]);
    var days = S.entries.filter(function (x) { return x.employee_id === e.id && x.worked_on >= from && x.worked_on <= to; })
      .sort(function (a, b) { return a.worked_on < b.worked_on ? -1 : 1; });
    /* year to date: every period from January 1 to the end of this one */
    var y0 = to.slice(0, 4) + '-01-01', ytd = 0;
    if (e.pay_type === 'salary') ytd = rt * Math.max(0, (at(to) - at(y0)) / (365 * 864e5)) + 0;
    else S.entries.forEach(function (x) { if (x.employee_id !== e.id || x.worked_on < y0 || x.worked_on > to) return; var h = +x.hours || 0, ot = +x.ot_hours || 0; ytd += e.pay_type === 'day' ? (h / 8) * rt : h * rt + ot * rt * 1.5; });
    var co = ((window.bpSettingsGet && bpSettingsGet()) || {}).company || {};
    return { r: r, e: e, from: from, to: to, lines: lines, days: days, ytd: ytd, co: co, paid: r.paid,
      no: 'PS-' + to.replace(/-/g, '') + '-' + String(e.name || 'X').replace(/\([^)]*\)/g, '').trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join('').toUpperCase() };
  }
  function stubHtml(d) {
    var e = d.e, co = d.co, logo = ckLogo(co);
    var w2 = e.kind !== '1099', when = function (s) { return new Date(at(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
    var payDate = d.paid && d.paid.when ? new Date(d.paid.when).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
    var rateTxt = e.pay_type === 'hourly' ? m2(e.rate) + '/hr' : e.pay_type === 'day' ? m2(e.rate) + '/day' : m2(e.rate) + '/yr';
    return '<div class="ps-doc">'
      + '<div class="ps-top"><div class="ps-co">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '<span class="ps-mono">' + esc(String(co.name || 'B').charAt(0)) + '</span>')
        + '<div><b>' + esc(co.name || 'Your business') + '</b>' + (co.address ? '<small>' + esc(co.address) + '</small>' : '') + (co.phone ? '<small>' + esc(co.phone) + '</small>' : '') + '</div></div>'
        + '<div class="ps-title"><b>Pay stub</b><small>' + esc(d.no) + '</small></div></div>'
      + '<div class="ps-meta"><div><small>Paid to</small><b>' + esc(e.name) + '</b><span>' + esc(e.trade || '') + (e.trade ? ' · ' : '') + (w2 ? 'W-2 employee' : '1099 contractor') + '</span>'
          + (e.stub_id ? '<span>' + (/^ssn:/.test(e.stub_id) ? 'SSN ending ' + esc(e.stub_id.slice(4)) : 'Employee # ' + esc(e.stub_id)) + '</span>' : '') + '</div>'
        + '<div><small>Pay period</small><b>' + when(d.from) + ' – ' + when(d.to) + '</b><span>' + ({ weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly' })[freq()] + '</span></div>'
        + '<div><small>' + (payDate ? 'Paid on' : 'Status') + '</small><b>' + (payDate || 'Not paid yet') + '</b><span>Rate ' + rateTxt + '</span></div></div>'
      + '<table class="ps-tb"><thead><tr><th>Earnings</th><th class="n">Hours</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>'
        + d.lines.map(function (l) { return '<tr><td>' + esc(l[0]) + '</td><td class="n">' + (e.pay_type === 'salary' ? '—' : l[1]) + '</td><td class="n">' + m2(l[2]) + '</td><td class="n">' + m2(l[3]) + '</td></tr>'; }).join('')
      + '</tbody></table>'
      + '<div class="ps-sum"><div><span>Gross pay</span><span>' + m2(d.r.gross) + '</span></div>'
        + (w2 && d.net != null ? '<div class="ps-tax"><span>Taxes and deductions</span><span>\u2212' + m2(Math.max(0, d.r.gross - d.net)) + '</span></div>'
          : w2 ? '<div class="ps-tax"><span>Taxes and deductions</span><span>Handled by your payroll</span></div>' : '<div class="ps-tax"><span>Tax withheld</span><span>None (1099)</span></div>')
        + '<div class="t"><span>' + (w2 && d.net != null ? 'Take-home pay' : w2 ? 'Gross pay this period' : 'Amount paid') + '</span><span>' + m2(w2 && d.net != null ? d.net : d.r.gross) + '</span></div>'
        + '<div class="ps-ytd"><span>Year to date, gross</span><span>' + m2(d.ytd) + '</span></div>'
        + (w2 && e.sick_hours != null && e.sick_hours !== '' ? '<div class="ps-ytd"><span>Paid sick leave available</span><span>' + (+e.sick_hours) + ' hrs</span></div>' : '') + '</div>'
      + (d.days.length ? '<div class="ps-days"><b>Days worked</b><table class="ps-tb sm"><thead><tr><th>Day</th><th>Job</th><th class="n">Hours</th><th class="n">OT</th></tr></thead><tbody>'
        + d.days.map(function (x) { return '<tr><td>' + esc(dayLabel(x.worked_on)) + '</td><td>' + esc(String(x.job_name || '—').replace(/\s*\(sample\)/g, '')) + '</td><td class="n">' + (+x.hours || 0) + '</td><td class="n">' + (+x.ot_hours || '—') + '</td></tr>'; }).join('')
        + '</tbody></table></div>' : '')
      + '<div class="ps-foot">' + (w2 && d.net != null ? 'Taxes and deductions as worked out by your employer; their payroll provider or accountant files them.' : w2 ? 'Amounts are before tax. Withholding and filing are done by your payroll provider.' : 'Paid as an independent contractor; no tax was withheld.') + ' Made with BuilderPro.</div>'
      + (d.paid ? '<div class="ps-stamp">Paid</div>' : '')
      + '</div>';
  }
  window.bpPayStub = function (empId, from) {
    var d = stubData(empId, from || S.payFrom || periodOf(Date.now())[0]); if (!d) return;
    bpModal('<h3>Pay stub for ' + esc(d.e.name) + '</h3>' + stubHtml(d)
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button>'
      + '<button class="bpx-btn" onclick="bpPayStubPrint(\'' + d.e.id + '\',\'' + d.from + '\')"><span class="ms" style="font-size:18px;vertical-align:-4px;margin-right:4px">print</span>Print or save PDF</button></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '780px'; mc.style.width = '95vw'; mc.classList.add('ps-modal'); }
  };
  /* a clean page of its own, printed (or saved as a PDF from the print dialog) */
  window.bpPayStubPrint = function (empId, from) {
    var ids = empId ? [empId] : dueFor(from, periodEnd(from)).map(function (r) { return r.e.id; });
    var body = ids.map(function (id) { var d = stubData(id, from); return d ? stubHtml(d) : ''; }).join('<div class="ps-break"></div>');
    var css = (document.getElementById('ps-css') || {}).textContent || '';
    var w = window.open('', '_blank');
    if (!w) { alert('Your browser blocked the new tab. Allow pop-ups for this site and try again.'); return; }
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Pay stub</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Arial,sans-serif;color:#001530;--line:#e3e8ef;--grey:#5b6b80;--soft:#f4f7fa;--ink:#001530}' + css.replace(/#bpx\s*/g, '') + '.ps-break{page-break-after:always;height:24px}@media print{body{margin:0}}</style></head><body>' + body + '<script>(function(){var done=0,go=function(){if(done++)return;setTimeout(function(){print()},150)};var im=[].slice.call(document.images).filter(function(i){return !i.complete});if(!im.length)return go();var n=im.length,t=setTimeout(go,4000);im.forEach(function(i){i.onload=i.onerror=function(){if(--n<=0){clearTimeout(t);go()}}})})()<\/script></body></html>');
    w.document.close();
  };
  function stubCss() {
    if (document.getElementById('ps-css')) return;
    var c = document.createElement('style'); c.id = 'ps-css';
    c.textContent = '#bpx .ps-doc{position:relative;margin:8px 0 14px;padding:28px;border:1px solid var(--line);border-radius:14px;background:#fff;color:#001530;font-size:14px;line-height:1.45;overflow:hidden}'
      + '#bpx .ps-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:16px;border-bottom:2px solid #001530}'
      + '#bpx .ps-co{display:flex;gap:12px;align-items:center;min-width:0}#bpx .ps-co img{width:52px;height:52px;object-fit:contain;border-radius:10px}#bpx .ps-mono{display:grid;place-items:center;width:52px;height:52px;border-radius:12px;background:#001530;color:#fff;font-weight:800;font-size:22px}'
      + '#bpx .ps-co b{display:block;font-size:17px}#bpx .ps-co small{display:block;color:#5b6b80;font-size:12.5px}'
      + '#bpx .ps-title{text-align:right}#bpx .ps-title b{display:block;font-size:22px;letter-spacing:-.01em;text-transform:uppercase}#bpx .ps-title small{color:#5b6b80;font-size:12.5px}'
      + '#bpx .ps-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:18px 0}#bpx .ps-meta small{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5b6b80}#bpx .ps-meta b{display:block;margin-top:3px;font-size:15px}#bpx .ps-meta span{display:block;font-size:12.5px;color:#5b6b80}'
      + '#bpx .ps-tb{width:100%;border-collapse:collapse}#bpx .ps-tb th{padding:8px 0;border-bottom:1px solid #e3e8ef;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5b6b80;text-align:left}#bpx .ps-tb td{padding:10px 0;border-bottom:1px solid #eef1f5}#bpx .ps-tb .n{text-align:right;white-space:nowrap;padding-left:12px}'
      + '#bpx .ps-tb.sm td{padding:6px 0;font-size:12.5px}'
      + '#bpx .ps-sum{margin:12px 0 0 auto;max-width:330px}#bpx .ps-sum>div{display:flex;justify-content:space-between;gap:12px;padding:5px 0}#bpx .ps-tax{color:#5b6b80;font-size:13px}#bpx .ps-sum .t{margin-top:4px;padding-top:10px;border-top:2px solid #001530;font-size:17px;font-weight:800}#bpx .ps-ytd{color:#5b6b80;font-size:12.5px}'
      + '#bpx .ps-days{margin-top:20px}#bpx .ps-days>b{display:block;margin-bottom:4px;font-size:13px}'
      + '#bpx .ps-foot{margin-top:20px;padding-top:12px;border-top:1px solid #e3e8ef;font-size:11.5px;color:#5b6b80}'
      + '#bpx .ps-stamp{position:absolute;top:96px;right:28px;padding:6px 16px;border:3px solid #16c79a;border-radius:10px;color:#0d8f6e;font-weight:900;font-size:20px;letter-spacing:.12em;text-transform:uppercase;transform:rotate(-8deg);opacity:.85}'
      + '@media (max-width:600px){#bpx .ps-doc{padding:18px}#bpx .ps-meta{grid-template-columns:1fr}#bpx .ps-top{flex-direction:column}#bpx .ps-title{text-align:left}#bpx .ps-stamp{top:18px;right:16px}}';
    document.head.appendChild(c);
  }

  /* ------------------------------------------------- 1099 checks --- */
  /* 2026-11-26: checks for 1099 contractors, printed onto PRE-PRINTED business checks (the
     standard "check on top, two stubs below" sheet). The bank's name, routing and account
     numbers, the magnetic MICR line and the check number are already on the paper, so
     BuilderPro never stores bank details; it prints the date, who it's to, the amount in
     numbers and words, the address and the memo where those go, and fills both stubs.
     W-2 pay needs tax withheld, so those go through payroll instead. */
  var ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function words(n) {
    var dol = Math.floor(n + 1e-9), cents = Math.round((n - dol) * 100);
    var three = function (x) { var o = []; if (x >= 100) { o.push(ONES[Math.floor(x / 100)] + ' hundred'); x %= 100; } if (x >= 20) { o.push(TENS[Math.floor(x / 10)] + (x % 10 ? '-' + ONES[x % 10] : '')); } else if (x) o.push(ONES[x]); return o.join(' '); };
    var parts = [], units = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
    units.forEach(function (u) { if (dol >= u[0]) { parts.push(three(Math.floor(dol / u[0])) + ' ' + u[1]); dol %= u[0]; } });
    if (dol) parts.push(three(dol));
    var w = parts.join(' ') || 'zero';
    return w.charAt(0).toUpperCase() + w.slice(1) + ' and ' + ('0' + cents).slice(-2) + '/100';
  }
  function chkGet(k, d) { try { var v = JSON.parse(localStorage.getItem('bpChk') || '{}'); return v[k] == null ? d : v[k]; } catch (e) { return d; } }
  function chkSet(k, val) { try { var v = JSON.parse(localStorage.getItem('bpChk') || '{}'); v[k] = val; localStorage.setItem('bpChk', JSON.stringify(v)); } catch (e) {} }
  /* the check itself, 8.5 x 3.5 in; positions in % of the check, type in cqw so the preview and the paper match */
  /* the logo on checks and stubs (2026-11-26): the business's own if one is uploaded in
     Settings > Business, otherwise the BuilderPro logo */
  function ckLogo(co) {
    var u = co.logoUrl || co.logo || window.BPLOGO || '';
    return u || (location.origin + '/assets/brand/logo-mark-128.png');
  }
  function checkFace(d, o) {
    o = o || {}; var co = d.co, amt = o.amt != null ? o.amt : (d.r.paid ? +d.r.paid.amount || d.r.gross : d.r.gross);
    var top = o.top != null ? !!o.top : !!chkGet('top', true);
    var adj = chkGet('adj', { x: 0, y: 0 }), dx = (+adj.x || 0) / 16 / 8.5 * 100, dy = (+adj.y || 0) / 16 / 3.5 * 100;
    var at2 = function (l, t) { return 'left:' + (l + dx).toFixed(2) + '%;top:' + (t + dy).toFixed(2) + '%'; };
    var amtTxt = (Math.round(amt * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var addr = String(o.addr || '').split(/\n/).map(function (l) { return esc(l); }).join('<br>');
    var bg = o.bg ? '<div class="ck-bg">' + (top ? '' : '<div class="ck-co"><b>' + esc(co.name || 'Your business') + '</b>' + (co.address ? '<span>' + esc(co.address) + '</span>' : '') + '</div>')
        + '<div class="ck-bank">Your bank</div><div class="ck-no">' + esc(o.no || '') + '</div><div class="ck-dl">Date</div><div class="ck-dline"></div>'
        + '<div class="ck-pay">Pay to the<br>order of</div><div class="ck-pline"></div><div class="ck-box">$</div><div class="ck-wline"></div><div class="ck-dol">Dollars</div>'
        + '<div class="ck-memo">Memo</div><div class="ck-mline"></div><div class="ck-sline"></div><div class="ck-sig">Signature</div>'
        + '<div class="ck-micr">⑆ 000000000 ⑆ 0000000000 ⑈ ' + esc(o.no || '') + '</div></div>' : '';
    return '<div class="ck' + (o.bg ? ' bg' : '') + '">' + bg
      + (top ? '<div class="ck-f ck-top" style="' + at2(4, 6) + '"><img src="' + esc(ckLogo(co)) + '" alt=""><span><b>' + esc(co.name || 'Your business') + '</b>' + (co.address ? '<i>' + esc(co.address) + '</i>' : '') + (co.phone ? '<i>' + esc(co.phone) + '</i>' : '') + '</span></div>' : '')
      + '<span class="ck-f" style="' + at2(76.5, 19) + '">' + esc(o.date || '') + '</span>'
      + '<span class="ck-f ck-name" style="' + at2(14, 36.5) + '">' + esc(String(d.e.name || '').replace(/\s*\(sample\)/, '')) + '</span>'
      + '<span class="ck-f ck-amt" style="' + at2(80.5, 36.5) + '">**' + amtTxt + '</span>'
      + '<span class="ck-f ck-words" style="' + at2(5.5, 49) + '">' + esc(words(amt)) + ' <i>' + Array(60).join('*') + '</i></span>'
      + (addr ? '<span class="ck-f ck-addr" style="' + at2(14, 60) + '">' + esc(String(d.e.name || '').replace(/\s*\(sample\)/, '')) + '<br>' + addr + '</span>' : '')
      + '<span class="ck-f ck-mm" style="' + at2(10.5, 82.5) + '">' + esc(o.memo || '') + '</span>'
      + (o.sig ? '<img class="ck-sigimg" alt="" src="' + esc(o.sig) + '" style="' + at2(60, 66) + '">' : '') + '</div>';
  }
  function voucher(d, o, keep) {
    var rt = +d.e.rate || 0;
    return '<div class="ck-v"><div class="ck-vh"><b><img src="' + esc(ckLogo(d.co)) + '" alt="">' + esc(d.co.name || 'Your business') + '</b><span>Check ' + esc(o.no || '') + ' · ' + esc(o.date || '') + '</span></div>'
      + '<div class="ck-vp"><b>Paid to ' + esc(d.e.name) + '</b><span>' + (d.e.kind === '1099' ? '1099 contractor · no tax withheld' : 'W-2 employee') + '</span></div>'
      + '<table><thead><tr><th>For</th><th class="n">Hours</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>'
      + d.lines.map(function (l) { return '<tr><td>' + esc(l[0]) + ', ' + esc(nice(d.from)) + ' – ' + esc(nice(d.to)) + '</td><td class="n">' + (d.e.pay_type === 'salary' ? '—' : l[1]) + '</td><td class="n">' + m2(l[2]) + '</td><td class="n">' + m2(l[3]) + '</td></tr>'; }).join('')
      + (o.amt != null && d.e.kind !== '1099' ? '<tr><td>Taxes and deductions</td><td class="n"></td><td class="n"></td><td class="n">\u2212' + m2(Math.max(0, d.r.gross - o.amt)) + '</td></tr>' : '')
      + '</tbody></table><div class="ck-vt"><span>' + esc(o.memo || '') + '</span><b>' + (o.amt != null && d.e.kind !== '1099' ? 'Take-home ' + m2(o.amt) : 'Total ' + m2(d.r.paid ? +d.r.paid.amount || d.r.gross : d.r.gross)) + '</b></div>'
      + '<div class="ck-vk">' + (keep ? 'Keep for your records' : (d.e.kind === '1099' ? 'Contractor’s copy' : 'Employee’s copy')) + '</div></div>';
  }
  function sheet(d, o) { return '<div class="ck-page">' + checkFace(d, o) + voucher(d, o, false) + voucher(d, o, true) + '</div>'; }
  function today() { return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  window.bpPayCheck = function (empId, from, how) {
    ckCss(); how = how || {};
    var d = stubData(empId, from || S.payFrom || periodOf(Date.now())[0]); if (!d) return;
    var w2 = d.e.kind !== '1099';
    var no = String(chkGet('next', 1001)), addrs = chkGet('addr', {}), memo = 'Pay ' + nice(d.from) + ' – ' + nice(d.to);
    bpModal('<h3>Check for ' + esc(d.e.name) + '</h3>'
      + '<div class="ck-wrap" id="ckPrev"></div>'
      + '<div class="ck-legend"><span><i class="b"></i>BuilderPro prints this</span><span><i class="g"></i>Already on your checks</span></div>'
      + '<div class="ck-form"><div><label>Check number</label><input id="ckNo" inputmode="numeric" value="' + esc(no) + '"></div>'
      + '<div><label>Date</label><input id="ckDate" value="' + esc(today()) + '"></div>'
      + '<div class="w"><label>Memo</label><input id="ckMemo" value="' + esc(memo) + '"></div>'
      + (w2 ? '<div class="w ck-net"><label>Take-home pay <small>after taxes. Their gross pay is ' + m2(d.r.gross) + '; work out what comes out with your payroll or accountant.</small></label><input id="ckNet" inputmode="decimal" placeholder="$0.00" autocomplete="off"><div class="ck-netmsg" id="ckNetMsg" role="alert"></div></div>' : '')
      + '<div class="w ck-chk"><label><input type="checkbox" id="ckStub"' + (how.stub ? ' checked' : '') + '> Print the pay stub after the check <small>A full page with the hours, rate and year-to-date pay, for their records.</small></label></div>'
      + '<div class="w ck-chk"><label><input type="checkbox" id="ckTop"' + (chkGet('top', true) ? ' checked' : '') + '> Print my logo and business name in the top-left corner <small>Turn this off if your checks already have your name printed there.</small></label></div>'
      + '<div class="w"><label>Mailing address <small>for a window envelope, optional</small></label><textarea id="ckAddr" rows="2" placeholder="Street\nCity, State ZIP">' + esc(addrs[empId] || '') + '</textarea></div></div>'
      + '<p class="ck-note">Print onto pre-printed business checks with the check on top (from your bank or an office store). Your bank details and the magnetic number line are already on them, so BuilderPro never asks for them. Two stubs with the pay details print below the check. <b>Pay</b> signs it with your saved signature, prints it and marks it paid; paid another way? Close this and use Mark paid.</p>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCheckAdjOpen()">Line up</button><button class="bpx-btn ghost" onclick="bpCheckPrint(\'' + d.e.id + '\',\'' + d.from + '\',1)">Test on plain paper</button>'
      + '<button class="bpx-btn ghost" onclick="bpCheckPrint(\'' + d.e.id + '\',\'' + d.from + '\',0)">Print to sign by hand</button>'
      + (d.paid ? '' : '<button class="bpx-btn ck-paybtn" id="ckPayBtn" onclick="bpCheckPay(\'' + d.e.id + '\',\'' + d.from + '\')"><span class="ms" style="font-size:18px;vertical-align:-4px;margin-right:4px">draw</span>Pay ' + m2(d.r.gross) + '</button>') + '</div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '820px'; mc.style.width = '95vw'; mc.classList.add('ps-modal'); }
    var sig = null;
    var draw = function () {
      var amt = w2 ? (ckNet() || 0) : d.r.gross;
      var el = $('ckPrev'); if (el) el.innerHTML = checkFace(d, { bg: 1, sig: sig, no: ($('ckNo') || {}).value, date: ($('ckDate') || {}).value, memo: ($('ckMemo') || {}).value, addr: ($('ckAddr') || {}).value, top: ($('ckTop') || {}).checked, amt: amt });
      var pb = $('ckPayBtn'); if (pb) pb.lastChild.textContent = w2 && !ckNet() ? 'Pay' : 'Pay ' + m2(amt);
      var mm = $('ckNetMsg'); if (mm && ckNet()) mm.textContent = ckNet() > d.r.gross ? 'That\u2019s more than their gross pay of ' + m2(d.r.gross) + '.' : '';
    };
    if (window.bpUsLoad) bpUsLoad().then(function (row) { sig = row && row.image; if (sig) draw(); }, function () {});
    ['ckNo', 'ckDate', 'ckMemo', 'ckAddr', 'ckNet'].forEach(function (id) { var el = $(id); if (el) el.oninput = draw; });
    if ($('ckTop')) $('ckTop').onchange = function () { chkSet('top', this.checked); draw(); };
    draw();
  };
  /* a sample check, so the owner can see what BuilderPro prints before anyone is set to 1099 */
  window.bpCheckSample = function () {
    ckCss();
    var co = ((window.bpSettingsGet && bpSettingsGet()) || {}).company || {}, to = new Date(), fr = new Date(to.getTime() - 13 * 864e5);
    var iso = function (x) { return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); };
    var d = { co: co, e: { id: 'sample', name: 'Alex Rivera (sample)', kind: '1099', rate: 45, pay_type: 'hourly' }, r: { gross: 1440, paid: null }, paid: null,
      from: iso(fr), to: iso(to), lines: [['Regular hours', 32, 45, 1440]] };
    var o = { bg: 1, no: String(chkGet('next', 1001)), date: today(), memo: 'Pay ' + nice(d.from) + ' – ' + nice(d.to), addr: '123 Main St\nYour City, ST 00000' };
    bpModal('<h3>A sample check</h3>'
      + '<div class="ck-wrap">' + checkFace(d, o) + '</div>'
      + '<div class="ck-legend"><span><i class="b"></i>BuilderPro prints this</span><span><i class="g"></i>Already on your checks</span></div>'
      + '<p class="ck-note">This is what prints for a 1099 contractor: your logo and business name, the date, who it\u2019s to, the amount in numbers and words, the address for a window envelope and the memo, onto pre-printed business checks from your bank or an office store. Two stubs print under it, one for them and one for you. With your saved e-signature it can print signed.</p>'
      + '<p class="ck-note">' + ((d.co.logoUrl || d.co.logo || window.BPLOGO) ? 'The logo is the one in Settings \u203a Business.' : 'That\u2019s the BuilderPro logo until you add your own in Settings \u203a Business.') + '</p>'
      + '<p class="ck-note">To use it, open someone in Employees and set Type to 1099 subcontractor. Their row in Pay period then gets a Pay by check button.</p>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button><button class="bpx-btn" onclick="bpCloseModal();bpCrewTab(\'people\')">Go to People</button></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '820px'; mc.style.width = '95vw'; mc.classList.add('ps-modal'); }
  };
  /* nudge everything up, down, left or right in sixteenths of an inch, for printers that feed a little off */
  window.bpCheckAdjOpen = function () {
    var a = chkGet('adj', { x: 0, y: 0 }), el = document.querySelector('.ck-form'); if (!el || $('ckAdj')) return;
    el.insertAdjacentHTML('beforeend', '<div class="w ck-adj" id="ckAdj"><label>Line up <small>in sixteenths of an inch: right and down are +, left and up are −</small></label>'
      + '<div><span>Across</span><input id="ckAx" type="number" step="1" value="' + (+a.x || 0) + '"><span>Down</span><input id="ckAy" type="number" step="1" value="' + (+a.y || 0) + '"></div></div>');
    var save = function () { chkSet('adj', { x: +$('ckAx').value || 0, y: +$('ckAy').value || 0 }); var i = $('ckNo'); if (i) i.oninput(); };
    $('ckAx').oninput = save; $('ckAy').oninput = save;
  };
  window.bpCheckPay = function (empId, from) {
    var d = stubData(empId, from); if (!d) return;
    var w2 = d.e.kind !== '1099', amt = w2 ? ckNet() : d.r.gross;
    if (w2 && !amt) { var mm = $('ckNetMsg'), ni = $('ckNet'); if (mm) mm.textContent = 'Enter their take-home pay first.'; if (ni) ni.focus(); return; }
    var signP = window.bpUsLoad ? bpUsLoad().catch(function () { return null; }) : Promise.resolve(null);
    signP.then(function (row) {
      var sig = row && row.image;
      return ok2({ kind: 'check', title: 'Pay ' + d.e.name + ' by check?', amount: amt, who: 'Check ' + (($('ckNo') || {}).value || chkGet('next', 1001)) + ' \u00b7 ' + nice(d.from) + ' \u2013 ' + nice(d.to),
        lines: [sig ? 'Signed with your saved signature.' : 'You have no saved signature, so it prints for you to sign by hand (Settings \u203a Your signature to add one).', 'It prints now, then shows as paid in Finances.', 'Print on your pre-printed checks.', ($('ckStub') || {}).checked ? 'Their pay stub prints right after the check.' : '', w2 ? 'Gross pay ' + m2(d.r.gross) + ' goes into Finances as wages; the check is for take-home.' : ''],
        cta: 'Yes, pay ' + m2(amt) }).then(function (y) {
          if (!y) return;
          bpCheckPrint(empId, from, 0, { sig: sig, skipAsk: 1, stub: !!($('ckStub') || {}).checked, net: w2 ? amt : null });
          bpPayMark(empId, from, 1, 1);
          if (window.bpCloseModal) bpCloseModal();
          if (window.bpToast) bpToast(d.e.name + ' paid ' + m2(amt) + ' by check.', 'success');
        });
    });
  };
  window.bpCheckPrint = function (empId, from, test, opt) {
    opt = opt || {};
    var ids = empId ? [empId] : dueFor(from, periodEnd(from)).filter(function (r) { return r.e.kind === '1099'; }).map(function (r) { return r.e.id; });
    if (!ids.length) { alert('No 1099 contractors to pay in this period.'); return; }
    /* a W-2 check is for take-home pay, typed in on the check screen */
    if (empId && opt.net == null && (bpEmpById(empId) || {}).kind !== '1099') {
      opt.net = ckNet();
      if (!opt.net) { var mm = $('ckNetMsg'), ni = $('ckNet'); if (mm) mm.textContent = 'Enter their take-home pay first.'; if (ni) ni.focus(); return; }
    }
    if (!test && !opt.skipAsk) {
      var tot0 = opt.net != null ? opt.net : ids.reduce(function (t, id) { var dd = stubData(id, from); return t + (dd ? dd.r.gross : 0); }, 0);
      return ok2({ kind: 'check', title: ids.length > 1 ? 'Print ' + ids.length + ' checks?' : 'Print this check?', amount: tot0,
        who: ids.length > 1 ? 'Every 1099 contractor this period' : (stubData(ids[0], from) || { e: { name: '' } }).e.name,
        lines: ['They print to sign by hand. This doesn\u2019t mark anyone paid.', 'Print on your pre-printed checks.'], cta: ids.length > 1 ? 'Yes, print ' + ids.length + ' checks' : 'Yes, print check' })
        .then(function (y) { if (y) bpCheckPrint(empId, from, test, { skipAsk: 1, stub: opt.stub, net: opt.net }); });
    }
    if (opt.stub == null && $('ckStub')) opt.stub = $('ckStub').checked;
    if (opt.stub) stubCss();
    var first = parseInt(($('ckNo') || {}).value || chkGet('next', 1001), 10) || 1001;
    var date = ($('ckDate') || {}).value || today(), memoIn = $('ckMemo') ? $('ckMemo').value : null;
    if (empId && $('ckAddr')) { var A = chkGet('addr', {}); A[empId] = $('ckAddr').value; chkSet('addr', A); }
    var addrs = chkGet('addr', {});
    var pages = ids.map(function (id, i) { var d = stubData(id, from); if (!d) return '';
      if (opt.net != null && empId) d.net = opt.net;
      return sheet(d, { bg: !!test, sig: opt.sig || null, no: String(first + i), date: date, memo: memoIn != null && empId ? memoIn : 'Pay ' + nice(d.from) + ' – ' + nice(d.to), addr: addrs[id] || '', top: !!chkGet('top', true), amt: d.net != null ? d.net : null })
        + (opt.stub ? '<div class="ps-page">' + stubHtml(d) + '</div>' : ''); }).join('');
    if (!test) chkSet('next', first + ids.length);
    ckCss();
    var css = ((document.getElementById('ck-css') || {}).textContent || '') + (opt.stub ? ((document.getElementById('ps-css') || {}).textContent || '') + '.ps-page{box-sizing:border-box;width:8.5in;min-height:11in;padding:.5in;background:#fff;page-break-after:always}.ps-page .ps-doc{border:0;border-radius:0;padding:0;margin:0}@media screen{.ps-page{margin:0 auto 20px}}' : '');
    var w = window.open('', '_blank');
    if (!w) { alert('Your browser blocked the new tab. Allow pop-ups for this site and try again.'); return; }
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + (test ? 'Check test' : 'Checks') + '</title><style>@page{size:letter;margin:0}html,body{margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#000}'
      + css.replace(/#bpx\s*/g, '') + '.ck-page{width:8.5in;height:11in;page-break-after:always;overflow:hidden}.ck{width:8.5in;height:3.5in}@media screen{body{background:#888;padding:20px}.ck-page{background:#fff;margin:0 auto 20px}}</style></head><body>'
      + pages + '<script>(function(){var done=0,go=function(){if(done++)return;setTimeout(function(){print()},150)};var im=[].slice.call(document.images).filter(function(i){return !i.complete});if(!im.length)return go();var n=im.length,t=setTimeout(go,4000);im.forEach(function(i){i.onload=i.onerror=function(){if(--n<=0){clearTimeout(t);go()}}})})()<\/script></body></html>');
    w.document.close();
    if (!test && $('ckNo')) $('ckNo').value = String(first + ids.length);
  };
  function ckCss() {
    if (document.getElementById('ck-css')) return;
    var c = document.createElement('style'); c.id = 'ck-css';
    c.textContent = '#bpx .ck{position:relative;width:100%;aspect-ratio:8.5/3.5;container-type:inline-size;background:#fff;color:#000;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}'
      + '#bpx .ck.bg{border-radius:6px;box-shadow:0 0 0 1px #cfd8e3;background:repeating-linear-gradient(135deg,#f3f8f4 0 6px,#eef5f0 6px 12px)}'
      + '#bpx .ck-f{position:absolute;font-size:1.75cqw;line-height:1.25;white-space:nowrap;color:#000;font-weight:500}'
      + '#bpx .ck-name{font-size:1.9cqw;font-weight:600}#bpx .ck-amt{font-size:1.95cqw;font-weight:700;letter-spacing:.02em}#bpx .ck-words{max-width:78%;overflow:hidden}#bpx .ck-words i{font-style:normal;letter-spacing:.1em}'
      + '#bpx .ck-addr{white-space:normal;font-size:1.6cqw}#bpx .ck-mm{font-size:1.55cqw}'
      + '#bpx .ck-bg>*{position:absolute;color:#8a99ad;font-size:1.35cqw;text-transform:uppercase;letter-spacing:.04em}'
      + '#bpx .ck-co{left:4%;top:7%;text-transform:none;letter-spacing:0}#bpx .ck-co b{display:block;font-size:1.9cqw;color:#7d8da3}#bpx .ck-co span{display:block;font-size:1.35cqw}'
      + '#bpx .ck-bank{left:45%;top:8%;font-size:1.6cqw}#bpx .ck-no{right:4%;top:7%;font-size:1.9cqw;font-weight:700}'
      + '#bpx .ck-dl{left:70%;top:20.5%}#bpx .ck-dline{left:76%;top:27%;width:18%;border-top:1px solid #a9b6c6}'
      + '#bpx .ck-pay{left:4%;top:34%;font-size:1.15cqw;line-height:1.15}#bpx .ck-pline{left:13.5%;top:44%;width:62%;border-top:1px solid #a9b6c6}'
      + '#bpx .ck-box{left:78%;top:33%;width:17%;height:12%;border:1px solid #a9b6c6;padding-left:.6%;font-size:1.9cqw;color:#7d8da3;box-sizing:border-box}'
      + '#bpx .ck-wline{left:4%;top:56%;width:80%;border-top:1px solid #a9b6c6}#bpx .ck-dol{left:85%;top:51.5%}'
      + '#bpx .ck-memo{left:4%;top:83%}#bpx .ck-mline{left:10%;top:89%;width:36%;border-top:1px solid #a9b6c6}'
      + '#bpx .ck-sline{left:58%;top:86%;width:37%;border-top:1px solid #a9b6c6}#bpx .ck-sig{left:58%;top:87.5%;font-size:1.1cqw}'
      + '#bpx .ck-sigimg{position:absolute;height:17%;max-width:34%;object-fit:contain;object-position:left bottom}'
      + '#bpx .ck-top{display:flex;align-items:center;gap:1.3cqw;max-width:40%;white-space:normal;color:#000}#bpx .ck-top img{height:6.6cqw;max-width:14cqw;object-fit:contain;flex:none}#bpx .ck-top b{display:block;font-size:1.95cqw;font-weight:700;line-height:1.15}#bpx .ck-top i{display:block;font-style:normal;font-size:1.3cqw;line-height:1.35;color:#222}'
      + '#bpx .ck-vh b{display:flex;align-items:center;gap:8px}#bpx .ck-vh img{height:22px;max-width:90px;object-fit:contain}'
      + '#bpx .ck-chk label{display:flex !important;align-items:flex-start;gap:8px;font-size:13.5px !important;font-weight:600;color:var(--ink) !important;flex-wrap:wrap}#bpx .ck-form .ck-chk input[type=checkbox]{width:18px !important;min-width:18px !important;height:18px !important;min-height:0 !important;margin:1px 0 0 !important;padding:0 !important;flex:none !important;accent-color:var(--blue)}#bpx .ck-form .ck-chk label{margin:0 !important;cursor:pointer}#bpx .ck-chk small{flex-basis:100%;margin-left:26px;font-weight:400;color:var(--grey)}'
      + '#bpx .ck-net input{max-width:220px;font-size:18px !important;font-weight:700}#bpx .ck-netmsg{margin-top:6px;font-size:13px;font-weight:600;color:#b45309}#bpx .ck-netmsg:empty{display:none}'
      + '#bpx .ck-micr{left:22%;top:93%;font-family:"Courier New",monospace;font-size:1.7cqw;letter-spacing:.12em;text-transform:none}'
      + '#bpx .ck-v{box-sizing:border-box;height:3.75in;padding:.35in .5in 0;font-size:10pt;color:#000;border-top:1px dashed #bbb}#bpx .ck-vh,#bpx .ck-vp,#bpx .ck-vt{display:flex;justify-content:space-between;gap:12px}'
      + '#bpx .ck-vh b{font-size:11pt}#bpx .ck-vp{margin:8px 0}#bpx .ck-vp span,#bpx .ck-vh span{color:#444}'
      + '#bpx .ck-v table{width:100%;border-collapse:collapse;margin-top:6px}#bpx .ck-v th{text-align:left;font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em;color:#555;border-bottom:1px solid #999;padding:4px 0}#bpx .ck-v td{padding:5px 0;border-bottom:1px solid #ddd}#bpx .ck-v .n{text-align:right}'
      + '#bpx .ck-vt{margin-top:8px}#bpx .ck-vt b{font-size:11pt}#bpx .ck-vk{margin-top:10px;font-size:8.5pt;color:#666;text-transform:uppercase;letter-spacing:.05em}'
      + '#bpx .ck-wrap{margin:6px 0 8px}#bpx .ck-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--grey)}#bpx .ck-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}#bpx .ck-legend .b{background:#000}#bpx .ck-legend .g{background:#a9b6c6}'
      + '#bpx .ck-form{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-top:14px}#bpx .ck-form .w{grid-column:1/-1}#bpx .ck-form label{display:block;margin:0 0 4px;font-size:12.5px;font-weight:600;color:var(--grey)}#bpx .ck-form label small{font-weight:400}#bpx .ck-form input,#bpx .ck-form textarea{width:100%;box-sizing:border-box}'
      + '#bpx .ck-adj>div{display:flex;align-items:center;gap:8px}#bpx .ck-adj input{width:80px}#bpx .ck-adj span{font-size:13px;color:var(--grey)}'
      + '#bpx .ck-note{margin:12px 0 0;font-size:12.5px;line-height:1.5;color:var(--grey)}'
      + '@media (max-width:600px){#bpx .ck-form{grid-template-columns:1fr}}';
    document.head.appendChild(c);
  }

  function book(r, from) {
    var to = periodEnd(from), fin = bpFinGet();
    fin.unshift({ id: 'f' + Date.now() + Math.floor(Math.random() * 1000), kind: 'expense', amount: r.gross,
      category: r.e.kind === '1099' ? 'Subcontractor' : 'Labor / crew',
      note: 'Pay — ' + r.e.name + ', ' + nice(from) + '–' + nice(to), when: Date.now(), payKey: r.key });
    bpFinSet(fin);
  }
  /* double confirmation for money (2026-11-26): every Mark paid, undo and Pay asks once more */
  var ok2 = function (o) { return window.bpMoneyOk ? bpMoneyOk(o) : Promise.resolve(confirm((o.title || 'Are you sure?') + (o.amount != null ? ' ' + m2(o.amount) : ''))); };
  window.bpPayMark = function (empId, from, on, quiet) {
    var key = payKey(empId, from), r = dueFor(from, periodEnd(from)).filter(function (x) { return x.e.id === empId; })[0];
    var go = function () {
      if (on) { if (r && !r.paid) book(r, from); }
      else bpFinSet(bpFinGet().filter(function (x) { return x.payKey !== key; }));
      pane();
    };
    if (quiet) return go();
    var amt = r ? (r.paid ? +r.paid.amount || r.gross : r.gross) : 0, name = r ? r.e.name : 'this person';
    return ok2(on ? { kind: 'pay', title: 'Mark this pay as paid?', amount: amt, who: name + ' \u00b7 ' + nice(from) + ' \u2013 ' + nice(periodEnd(from)),
        how: 'Paid in cash, by your own check or by transfer', lines: ['It goes into Finances as ' + (r && r.e.kind === '1099' ? 'a Subcontractor' : 'a Labor / crew') + ' expense.'], cta: 'Yes, mark ' + m2(amt) + ' paid' }
      : { kind: 'pay', title: 'Undo this payment?', amount: amt, who: name, lines: ['It comes back out of Finances and shows as still owed.'], cta: 'Yes, undo' })
      .then(function (y) { if (y) go(); });
  };
  window.bpPayAll = function (from) {
    var due = dueFor(from, periodEnd(from)).filter(function (r) { return !r.paid && r.gross > 0; }), tot = due.reduce(function (t, r) { return t + r.gross; }, 0);
    ok2({ kind: 'pay', title: 'Mark everyone paid?', amount: tot, who: due.length + (due.length === 1 ? ' person' : ' people') + ' \u00b7 ' + nice(from) + ' \u2013 ' + nice(periodEnd(from)),
      lines: due.map(function (r) { return r.e.name + ': ' + m2(r.gross); }), cta: 'Yes, mark ' + m2(tot) + ' paid' })
      .then(function (y) { if (!y) return; due.forEach(function (r) { book(r, from); }); pane(); });
  };
  window.bpPayPick = function (f) { S.payFrom = f; pane(); };
  window.bpPayFreq = function (v) { try { localStorage.setItem('bpPayFreq', v); } catch (e) {} S.payFrom = null; pane(); };
  window.bpPayAnchor = function (v) {
    if (!v) return; try { localStorage.setItem('bpPayAnchor', v); } catch (e) {}
    S.payFrom = null; pane();
  };

  window.bpCsvPay = function () {
    var f = S.payFrom || periodOf(Date.now())[0], t = periodEnd(f);
    var rows = S.entries.filter(function (x) { return x.worked_on >= f && x.worked_on <= t; });
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
