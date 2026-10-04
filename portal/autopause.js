/* ==================================================================
   Project automations, from the project side.

   1. Pause: a switch on every project, "Automatic messages: On / Paused".
      Paused (j.autoPause) stops every customer text the CRM workflows would
      send for that job (ghl-events skips them); alerts to the owner still
      go out. For a difficult customer, a dispute, a job for a friend.

   2. Domino reschedule (Enterprise): when one of a crew's jobs starts later
      than it did, the crew's later jobs are offered the same move. Nothing
      moves without a yes. Each moved job then fires its own "schedule
      pushed back" text, and the crew lead gets an in-app notice (both done
      by the database when the dates change).
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var isCrew = function () { return !!(window.bpTeamIsCrew && bpTeamIsCrew()); };
  var plan = function () { return String((window._bpAcct || {}).plan || '').toLowerCase(); };
  var first = function (j) { var d = ((j.sched && j.sched.dates) || []).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); }).sort(); return d[0] || ''; };
  var addDays = function (iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
  var dayDiff = function (a, b) { return Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5); };
  var pretty = function (iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };

  /* ---------- 1. the pause switch on the project ---------- */
  function pauseRow(j) {
    var on = !j.autoPause;
    return '<div class="ap-row" id="ap-row"><span class="ms">' + (on ? 'notifications_active' : 'notifications_paused') + '</span>'
      + '<div><b>Automatic messages: ' + (on ? 'On' : 'Paused') + '</b><span>' + (on ? 'Texts and emails to this customer go out as the job moves along.' : 'Nothing automatic goes to this customer. Alerts to you still come through.') + '</span></div>'
      + '<button class="bpx-rowbtn" onclick="bpAutoPause(\'' + j.id + '\')">' + (on ? 'Pause' : 'Turn back on') + '</button></div>';
  }
  window.bpAutoPause = function (id) {
    var jobs = bpJobsGet(), j = jobs.filter(function (x) { return x.id === id; })[0]; if (!j) return;
    j.autoPause = !j.autoPause; bpJobsSet(jobs);
    var r = document.getElementById('ap-row'); if (r) r.outerHTML = pauseRow(j);
    if (window.bpToast) bpToast(j.autoPause ? 'Automatic messages paused for ' + (j.name || 'this project') + '.' : 'Automatic messages are back on for ' + (j.name || 'this project') + '.');
  };
  var open0 = window.bpProjOpen;
  if (typeof open0 === 'function') {
    window.bpProjOpen = function (id) {
      try { snap(bpJobsGet()); } catch (e) {}   /* the dates as they were before this edit */
      var r = open0.apply(this, arguments);
      try {
        if (isCrew()) return r;
        var j = bpJobsGet().filter(function (x) { return x.id === id; })[0], tab = document.querySelector('.bpx-modalcard [data-pj-tab]');
        if (j && tab && !document.getElementById('ap-row')) tab.parentNode.insertAdjacentHTML('beforebegin', pauseRow(j));
      } catch (e) {}
      return r;
    };
  }

  /* ---------- 2. domino reschedule ---------- */
  var last = {}, busy = false;
  function snap(jobs) { last = {}; jobs.forEach(function (j) { if (j && j.id) last[j.id] = { first: first(j), crew: typeof j.crew === 'string' ? j.crew : '', status: j.status }; }); }
  function check(jobs) {
    if (busy || isCrew() || plan() !== 'enterprise') return;
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i], was = last[j.id];
      if (!j || j.status !== 'active' || !was || !was.first || typeof j.crew !== 'string' || !j.crew) continue;
      var now = first(j); if (!now || now <= was.first) continue;
      var delta = dayDiff(was.first, now);
      var later = jobs.filter(function (x) { return x !== j && x.status === 'active' && x.crew === j.crew && first(x) && first(x) >= was.first && !x.sample; })
        .sort(function (a, b) { return first(a) < first(b) ? -1 : 1; });
      if (later.length) { offer(j, later, delta); return; }
    }
  }
  function offer(moved, later, delta) {
    var crew = (window.pjCrew && pjCrew(moved.crew)) || { name: 'this crew' };
    setTimeout(function () {
      window.bpModal('<h3>Move ' + esc(crew.name) + '’s later jobs too?</h3>'
        + '<div class="bpx-sub">' + esc(moved.name || 'A job') + ' now starts ' + delta + ' day' + (delta === 1 ? '' : 's') + ' later. These ' + later.length + ' job' + (later.length === 1 ? '' : 's') + ' on the same crew come after it:</div>'
        + '<div class="ap-list">' + later.map(function (x) { var f = first(x); return '<div><b>' + esc(x.name || 'Job') + '</b><span>' + esc(x.title || '') + '</span><em>' + pretty(f) + ' → ' + pretty(addDays(f, delta)) + '</em></div>'; }).join('') + '</div>'
        + '<div class="bpx-mut" style="font-size:12.5px;margin-top:8px">Each customer gets the “schedule pushed back” text, and the crew lead is told. Sundays are skipped.</div>'
        + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Leave them</button><button class="bpx-btn" id="ap-go">Move ' + later.length + ' job' + (later.length === 1 ? '' : 's') + '</button></div>');
      var go = document.getElementById('ap-go');
      if (go) go.onclick = function () {
        var ids = later.map(function (x) { return x.id; }), jobs = bpJobsGet();
        jobs.forEach(function (x) {
          if (ids.indexOf(x.id) < 0) return;
          var s = x.sched || {}, slots = {};
          /* each day moves by the same amount; a Sunday pushes on to Monday, and a day never lands on the one before it */
          var prev = '';
          s.dates = (s.dates || []).slice().sort().map(function (d) {
            var nd = addDays(d, delta); while (prev && nd <= prev) nd = addDays(nd, 1);
            prev = nd; if (s.slots && s.slots[d]) slots[nd] = s.slots[d]; return nd;
          });
          if (s.slots) s.slots = slots;
          s.start = s.dates[0] || ''; s.target = s.dates.length > 1 ? s.dates[s.dates.length - 1] : '';
          x.sched = s;
        });
        busy = true; try { bpJobsSet(jobs); } finally { busy = false; }
        window.bpCloseModal();
        if (window.bpToast) bpToast('Moved ' + ids.length + ' job' + (ids.length === 1 ? '' : 's') + ' ' + delta + ' day' + (delta === 1 ? '' : 's') + ' later.');
        if (window._bpCurView === 'activejobs' && window.bpActiveJobs) bpActiveJobs();
      };
    }, 250);
  }
  var set0 = window.bpJobsSet;
  if (typeof set0 === 'function') {
    window.bpJobsSet = function (a) {
      var r = set0.apply(this, arguments);
      try { check(a || []); } catch (e) {}
      snap(a || []);
      return r;
    };
    try { snap(window.bpJobsGet ? bpJobsGet() : []); } catch (e) {}
    /* jobs can arrive from the cloud without a save; take a fresh baseline when a page opens */
    var nav0 = window.bpNav;
    if (typeof nav0 === 'function') window.bpNav = function () { try { snap(bpJobsGet()); } catch (e) {} return nav0.apply(this, arguments); };
  }

  var st = document.createElement('style');
  st.textContent = '#bpx .ap-row{display:flex;align-items:center;gap:12px;border:1px solid #e6e9f0;border-radius:12px;padding:10px 14px;margin:4px 24px 12px;background:#fafbfd}'
    + '#bpx .ap-row>.ms{font-size:22px;color:#2f6bff}#bpx .ap-row>div{flex:1;min-width:0;display:flex;flex-direction:column}#bpx .ap-row b{font-size:13.5px}#bpx .ap-row span:not(.ms){font-size:12px;color:#6b7280}'
    + '#bpx .ap-list{display:flex;flex-direction:column;gap:6px;margin-top:10px;max-height:260px;overflow:auto}#bpx .ap-list>div{display:grid;grid-template-columns:1fr auto;gap:2px 10px;border:1px solid #e6e9f0;border-radius:10px;padding:8px 12px}'
    + '#bpx .ap-list span{grid-column:1;font-size:12px;color:#6b7280}#bpx .ap-list em{grid-row:1/3;grid-column:2;align-self:center;font-style:normal;font-size:12.5px;font-weight:600;color:#b45309}'
    + '#bpx.bpx-dark .ap-row{background:#141b2b;border-color:#262f45}';
  document.head.appendChild(st);
})();
