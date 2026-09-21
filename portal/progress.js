/* ==================================================================
   Job progress, built the way a job actually runs.

   A contractor does not set a deadline and then guess how far along
   they are. A job runs through a fixed sequence of phases — tear-off,
   dry-in, shingle, detail, cleanup — and each one takes a known number
   of working days. That is what they commit to a customer and what they
   tell a crew. So the plan here is phases, not a date and a slider, and
   progress is the share of the WORK that is finished rather than the
   share of the checklist: a one-day tear-off cannot read as 20% of a
   five-day job just because it is one of five boxes.

   Every day the job is running, the phases whose day has come get asked
   about. Finished moves the job on. Not finished slips that phase to the
   next working day and pushes everything after it by the same amount,
   which is the honest answer — you cannot absorb a lost day by wishing —
   and then says plainly what it did to the finish date, so the
   contractor can ring the customer before the customer rings them.

   Weekends are not working days. A Friday that slips lands on Monday.
   ================================================================== */
(function () {
  'use strict';
  var P = window.bpPlan = {};
  var esc = window.bpEsc || function (s) { return String(s == null ? '' : s); };

  /* ---------- the phase sets ----------
     What each trade actually does, in order, with the working days a
     normal residential job takes. The contractor can rename, re-time or
     delete any of it; this is a starting point, not a rule. */
  var SETS = {
    roofing:   [['Tear-off', 1], ['Dry-in', 1], ['Shingle', 2], ['Flashing and detail', 1], ['Cleanup and magnet', 1], ['Final walk', 1]],
    plumbing:  [['Rough-in', 2], ['Inspection', 1], ['Trim-out', 1], ['Test and final', 1]],
    electrical:[['Rough-in', 2], ['Inspection', 1], ['Trim-out', 1], ['Final and label', 1]],
    hvac:      [['Pull the old system', 1], ['Set equipment', 1], ['Duct and line set', 2], ['Start-up and test', 1]],
    painting:  [['Prep and mask', 1], ['Prime', 1], ['Coats', 2], ['Touch-up and walk', 1]],
    landscaping:[['Clear and grade', 1], ['Hardscape', 2], ['Irrigation', 1], ['Plant and sod', 1], ['Cleanup', 1]],
    concrete:  [['Excavate', 1], ['Form and steel', 1], ['Pour', 1], ['Finish and cure', 2], ['Strip and clean', 1]],
    pools:     [['Excavate', 2], ['Steel and plumbing', 2], ['Gunite', 1], ['Cure', 5], ['Tile and coping', 2], ['Deck', 2], ['Plaster', 1], ['Fill and start-up', 1]],
    trim:      [['Measure and order', 1], ['Install', 2], ['Caulk and fill', 1], ['Paint touch-up', 1]],
    cabinets:  [['Measure and order', 1], ['Demo old', 1], ['Set boxes', 2], ['Doors and hardware', 1], ['Punch list', 1]],
    countertops:[['Template', 1], ['Fabricate', 3], ['Install', 1], ['Seal and final', 1]],
    flooring:  [['Tear out', 1], ['Prep and level', 1], ['Install', 2], ['Trim and transitions', 1], ['Clean and final', 1]],
    drywall:   [['Hang', 2], ['Tape and coat', 2], ['Sand', 1], ['Texture and prime', 1]],
    framing:   [['Layout', 1], ['Frame', 3], ['Sheathe', 1], ['Inspection', 1]],
    general:   [['Get started', 1], ['Main work', 3], ['Finish up', 1], ['Final walk', 1]],
  };
  P.setFor = function (trade) {
    var key = (window.SP && SP.tradeKey) ? SP.tradeKey(trade) : '';
    return (SETS[key] || SETS.general).map(function (r) { return { name: r[0], days: r[1] }; });
  };
  P.sets = SETS;

  /* ---------- working days ---------- */
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function parse(s) { var p = String(s || '').split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isWeekend(d) { var x = d.getDay(); return x === 0 || x === 6; }
  /* n working days on from a date, landing on a working day */
  function addWork(d, n) {
    var x = new Date(d.getTime());
    while (isWeekend(x)) x.setDate(x.getDate() + 1);
    for (var i = 0; i < n; i++) { do { x.setDate(x.getDate() + 1); } while (isWeekend(x)); }
    return x;
  }
  function nextWork(d) { var x = new Date(d.getTime()); while (isWeekend(x)) x.setDate(x.getDate() + 1); return x; }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  P.iso = iso; P.addWork = addWork;

  function pretty(s) {
    if (!s) return '';
    var d = parse(s);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  P.pretty = pretty;

  /* ---------- the plan on a job ----------
     Dates are laid out from the start: each phase ends the given number
     of working days after the one before it. Nothing is written to the
     job until the contractor actually starts a plan. */
  P.build = function (job, startIso) {
    var phases = P.setFor(((window.bpSettingsGet && bpSettingsGet().company) || {}).trade);
    var start = startIso ? parse(startIso) : nextWork(today());
    var cur = new Date(start.getTime()), out = [];
    phases.forEach(function (ph, i) {
      cur = i === 0 ? addWork(new Date(cur.getTime() - 86400000), ph.days) : addWork(cur, ph.days);
      out.push({ key: 'p' + i + Math.random().toString(36).slice(2, 6), name: ph.name, days: ph.days, due: iso(cur), doneAt: null, slips: 0 });
    });
    return { start: iso(start), phases: out, startedAt: new Date().toISOString() };
  };

  P.of = function (job) { return job && job.plan && job.plan.phases && job.plan.phases.length ? job.plan : null; };

  /* Progress is weighted by days, not by how many boxes are ticked. */
  P.progress = function (job) {
    var pl = P.of(job);
    if (!pl) return null;
    var total = 0, done = 0, next = null, late = [], t = iso(today());
    pl.phases.forEach(function (ph) {
      total += (+ph.days || 1);
      if (ph.doneAt) done += (+ph.days || 1);
      else {
        if (!next) next = ph;
        if (ph.due <= t) late.push(ph);
      }
    });
    var finish = pl.phases.length ? pl.phases[pl.phases.length - 1].due : '';
    return {
      pct: total ? Math.round(done / total * 100) : 0,
      doneDays: done, totalDays: total,
      next: next, late: late, finish: finish,
      complete: !next,
      slipped: pl.phases.reduce(function (t2, ph) { return t2 + (+ph.slips || 0); }, 0),
    };
  };

  /* ---------- slipping ----------
     A phase that did not happen moves to the next working day, and
     everything behind it moves with it. Pretending the rest of the job
     can absorb it is how a finish date quietly becomes a lie. */
  P.slip = function (job, key, days) {
    var pl = P.of(job); if (!pl) return null;
    days = Math.max(1, +days || 1);
    var i = -1;
    pl.phases.forEach(function (ph, k) { if (ph.key === key) i = k; });
    if (i < 0) return null;
    var before = pl.phases[pl.phases.length - 1].due;
    for (var k = i; k < pl.phases.length; k++) {
      if (pl.phases[k].doneAt) continue;
      pl.phases[k].due = iso(addWork(parse(pl.phases[k].due), days));
    }
    pl.phases[i].slips = (+pl.phases[i].slips || 0) + days;
    return { from: before, to: pl.phases[pl.phases.length - 1].due };
  };

  /* Pulling a day back, for the Saturday a crew works to catch up. */
  P.pull = function (job, days) {
    var pl = P.of(job); if (!pl) return null;
    days = Math.max(1, +days || 1);
    var before = pl.phases[pl.phases.length - 1].due;
    pl.phases.forEach(function (ph) {
      if (ph.doneAt) return;
      var d = parse(ph.due);
      for (var i = 0; i < days; i++) { do { d.setDate(d.getDate() - 1); } while (isWeekend(d)); }
      ph.due = iso(d);
    });
    return { from: before, to: pl.phases[pl.phases.length - 1].due };
  };

  P.done = function (job, key, on) {
    var pl = P.of(job); if (!pl) return;
    pl.phases.forEach(function (ph) { if (ph.key === key) ph.doneAt = on === false ? null : new Date().toISOString(); });
  };

  /* ---------- what to draw ---------- */
  /* the slim bar that rides on a job row */
  P.bar = function (job) {
    var pr = P.progress(job);
    if (!pr) return '';
    var tone = pr.late.length ? 'late' : pr.complete ? 'done' : '';
    return '<div class="bpp-bar ' + tone + '" title="' + esc(pr.doneDays + ' of ' + pr.totalDays + ' working days done') + '">'
      + '<span class="bpp-track"><i style="width:' + pr.pct + '%"></i></span>'
      + '<b>' + pr.pct + '%</b></div>';
  };

  /* the line under a job row that says where it actually stands */
  P.line = function (job) {
    var pr = P.progress(job);
    if (!pr) return '';
    if (pr.complete) return 'All phases done';
    if (pr.late.length) {
      return pr.late.length === 1
        ? '<em class="bpp-late">' + esc(pr.late[0].name) + ' was due ' + pretty(pr.late[0].due) + '</em>'
        : '<em class="bpp-late">' + pr.late.length + ' phases overdue</em>';
    }
    return 'Next: ' + esc(pr.next.name) + ' by ' + pretty(pr.next.due);
  };
})();

/* ==================================================================
   The UI on top of it: the daily ask, the plan panel, and the bar that
   rides on a job row. Kept apart from the model above so the arithmetic
   can be tested without a DOM.
   ================================================================== */
(function () {
  'use strict';
  var P = window.bpPlan; if (!P) return;
  var esc = window.bpEsc;
  var jobs = function () { return window.bpJobsGet ? bpJobsGet() : []; };
  var save = function () { if (window.bpJobsSet) bpJobsSet(jobs()); };
  var byId = function (id) { return jobs().filter(function (j) { return j.id === id; })[0]; };
  var redraw = function () { if (window._bpCurView === 'activejobs') bpActiveJobs(); else if (window.bpNav) bpNav(window._bpCurView); };

  /* ---------- the daily ask ----------
     Only phases whose day has arrived, and only on jobs that are
     running. Two buttons, because the answer really is yes or no. */
  window.bpPlanCheckin = function () {
    var due = [];
    jobs().forEach(function (j) {
      if (j.status !== 'active') return;
      var pr = P.progress(j); if (!pr) return;
      pr.late.forEach(function (ph) { due.push({ job: j, ph: ph }); });
    });
    if (!due.length) return '';
    var one = due.length === 1;
    return '<div class="bpp-ask">'
      + '<div class="bpp-ask-h"><span class="ms">event_available</span>'
      + '<div><b>' + (one ? 'One thing was due' : due.length + ' things were due') + '</b>'
      + '<span>Tell us what got finished and the schedule keeps itself honest. Anything that did not happen moves on, and so does everything behind it.</span></div></div>'
      + '<div class="bpp-ask-rows">' + due.slice(0, 6).map(function (d) {
        return '<div class="bpp-ask-row"><div class="bpp-ask-w"><b>' + esc(d.ph.name) + '</b>'
          + '<span>' + esc(d.job.name) + (d.job.title ? ' · ' + esc(d.job.title) : '') + ' · due ' + P.pretty(d.ph.due) + '</span></div>'
          + '<div class="bpp-ask-b"><button class="bpx-rowbtn primary" onclick="bpPlanYes(\'' + d.job.id + '\',\'' + d.ph.key + '\')">Finished</button>'
          + '<button class="bpx-rowbtn" onclick="bpPlanNo(\'' + d.job.id + '\',\'' + d.ph.key + '\')">Not yet</button></div></div>';
      }).join('') + '</div>'
      + (due.length > 6 ? '<div class="bpx-mut" style="font-size:12px;margin-top:8px">+ ' + (due.length - 6) + ' more on the jobs below</div>' : '')
      + '</div>';
  };

  window.bpPlanYes = function (jid, key) {
    var j = byId(jid); if (!j) return;
    P.done(j, key); save();
    var pr = P.progress(j);
    redraw();
    if (pr && pr.complete) {
      window.bpToast && bpToast('Every phase on ' + j.name + ' is done — mark the job complete when you have been paid.');
    }
  };

  /* Not finished: move it, show what that did, and offer the one real
     way back — a working Saturday — rather than pretending otherwise. */
  window.bpPlanNo = function (jid, key) {
    var j = byId(jid); if (!j) return;
    var ph = P.of(j).phases.filter(function (x) { return x.key === key; })[0];
    window.bpModal('<h3>' + esc(ph.name) + ' did not get finished</h3>'
      + '<div class="bpx-sub">How many more working days does it need? Everything after it moves by the same amount, because a lost day has to land somewhere.</div>'
      + '<div class="bpp-slip">'
      + [1, 2, 3].map(function (n) {
        return '<button class="bpp-slipbtn" onclick="bpPlanSlip(\'' + jid + '\',\'' + key + '\',' + n + ')">'
          + '<b>' + n + '</b><span>' + (n === 1 ? 'more day' : 'more days') + '</span></button>';
      }).join('') + '</div>'
      + '<div class="bpx-mmsg" id="bpp-msg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button></div>');
  };

  window.bpPlanSlip = function (jid, key, days) {
    var j = byId(jid); if (!j) return;
    var moved = P.slip(j, key, days); save();
    window.bpCloseModal();
    if (!moved) { redraw(); return; }
    if (moved.from === moved.to) { redraw(); return; }
    /* say what it cost, and offer the catch-up rather than leaving them with it */
    window.bpModal('<h3>Finish moves to ' + P.pretty(moved.to) + '</h3>'
      + '<div class="bpx-sub">It was ' + P.pretty(moved.from) + '. Worth a call to ' + esc(j.name) + ' before they notice it themselves.</div>'
      + '<div class="bpp-after">'
      + '<button class="bpx-btn" onclick="bpPlanPull(\'' + jid + '\',' + days + ')">Work a Saturday and pull it back</button>'
      + '<button class="bpx-btn ghost" onclick="bpCloseModal()">Leave it where it is</button>'
      + '</div>');
    redraw();
  };
  window.bpPlanPull = function (jid, days) {
    var j = byId(jid); if (!j) return;
    var moved = P.pull(j, days); save();
    window.bpCloseModal();
    if (moved) window.bpToast && bpToast('Finish pulled back to ' + P.pretty(moved.to) + '.');
    redraw();
  };

  /* ---------- the plan, in full, on a project ---------- */
  window.bpPlanPanel = function (jid) {
    var j = byId(jid); if (!j) return '';
    var pl = P.of(j);
    if (!pl) {
      return '<div class="bpp-none"><b>No schedule on this job yet</b>'
        + '<span>Lay out the phases and BuilderPro tracks the finish date for you, asks what got done, and moves the rest when something slips.</span>'
        + '<button class="bpx-btn sp-inline" onclick="bpPlanStart(\'' + jid + '\')">Plan the phases</button></div>';
    }
    var pr = P.progress(j), t = P.iso(new Date());
    return '<div class="bpp-panel">'
      + (window.bpChart ? bpChart.progress({
        title: 'Progress', value: pr.doneDays, target: pr.totalDays,
        fmt: function (n) { return n + (n === 1 ? ' day' : ' days'); },
        tone: pr.late.length ? 'warn' : '',
        note: pr.complete ? 'all phases done' : 'finish ' + P.pretty(pr.finish),
      }) : '')
      + '<div class="bpp-phases">' + pl.phases.map(function (ph) {
        var late = !ph.doneAt && ph.due <= t;
        return '<div class="bpp-ph' + (ph.doneAt ? ' done' : late ? ' late' : '') + '">'
          + '<button class="bpp-tick" onclick="bpPlanToggle(\'' + jid + '\',\'' + ph.key + '\')" aria-label="'
          + (ph.doneAt ? 'Mark not done' : 'Mark done') + '">' + (ph.doneAt ? '<span class="ms">check</span>' : '') + '</button>'
          + '<div class="bpp-ph-t"><b>' + esc(ph.name) + '</b>'
          + '<span>' + (ph.doneAt ? 'done ' + P.pretty(P.iso(new Date(ph.doneAt))) : 'due ' + P.pretty(ph.due))
          + ' · ' + ph.days + (ph.days === 1 ? ' day' : ' days')
          + (ph.slips ? ' · slipped ' + ph.slips : '') + '</span></div>'
          + (ph.doneAt || !late ? '' : '<button class="bpx-rowbtn" onclick="bpPlanNo(\'' + jid + '\',\'' + ph.key + '\')">Not yet</button>')
          + '</div>';
      }).join('') + '</div>'
      + '<div class="bpp-foot"><button class="bpx-linkbtn" onclick="bpPlanStart(\'' + jid + '\')">Start the plan over</button>'
      + (pr.slipped ? '<span class="bpx-mut">' + pr.slipped + (pr.slipped === 1 ? ' day' : ' days') + ' slipped so far</span>' : '')
      + '</div></div>';
  };

  window.bpPlanStart = function (jid) {
    var j = byId(jid); if (!j) return;
    var start = (j.sched && j.sched.dates && j.sched.dates[0]) || P.iso(P.addWork(new Date(), 1));
    window.bpModal('<h3>Plan the phases</h3>'
      + '<div class="bpx-sub">These are the usual stages for your trade with the working days each one takes. Change anything that is not how you work — the dates lay themselves out from the start.</div>'
      + '<label>First day on site</label><input id="bpp-start" type="date" value="' + esc(start) + '">'
      + '<div class="bpx-mmsg" id="bpp-msg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button>'
      + '<button class="bpx-btn" onclick="bpPlanCreate(\'' + jid + '\')">Lay out the schedule</button></div>');
  };
  window.bpPlanCreate = function (jid) {
    var j = byId(jid); if (!j) return;
    var v = (document.getElementById('bpp-start') || {}).value || '';
    j.plan = P.build(j, v || null);
    save(); window.bpCloseModal(); redraw();
  };
  window.bpPlanToggle = function (jid, key) {
    var j = byId(jid); if (!j) return;
    var ph = P.of(j).phases.filter(function (x) { return x.key === key; })[0];
    P.done(j, key, !ph.doneAt ? true : false);
    save(); redraw();
  };
})();
