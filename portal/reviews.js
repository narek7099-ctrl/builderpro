/* ==================================================================
   The worker record: jobs completed, client reviews, experience.

   Owner side of public.worker_reviews / public.review_requests
   (supabase/migrations/20261003000003_worker_reviews.sql):

     bpJobWorkers(job)     who worked a job: the snapshot taken when it was
                           marked done (job.workers), else who is on it now
                           (assigned directly, or a member of its crew)
     bpWorkerStats(empId)  jobs completed, last one, total job value (owner
                           only), average rating, review count, 5→1 spread
     bpEmpProfile(empId)   the "Employee profile" panel
     bpReviewAsk(jobId)    after Mark done: makes the review link
                           (embed/rate.html?t=<token>) and offers Copy / Text /
                           Email to the customer

   Offline (the signed-out example portal) there is no database, so the
   Employees page runs on BP_REV_SAMPLE — sample people, finished jobs and
   reviews — and says so.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var money = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : ('$' + Math.round(n || 0)); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var SITE = 'https://builderpro-os.com';
  var R = window.BP_REV = { reviews: [], loaded: false, sample: false, busy: null };

  /* ------------------------------------------------------ sample data --- */
  var Y = new Date().getFullYear(), DAY = 864e5, NOW = Date.now();
  var SAMPLE_EMPS = [
    { id: 'sx-luis', name: 'Luis Ortega', trade: 'Foreman', kind: 'w2', pay_type: 'hourly', rate: 38, burden_pct: 32, active: true, phone: '(818) 555-0199', email: 'luis@example.com',
      started_trade_year: Y - 16, hired_on: (Y - 6) + '-03-14', skills: ['Shingle', 'Tile', 'Flat roof', 'Crew lead'], certifications: 'OSHA 30 · GAF Master Elite installer', bio: 'Runs the A crew. Sixteen years on roofs, the last six with us.', photo_url: 'https://i.pravatar.cc/300?img=12' },
    { id: 'sx-mark', name: 'Mark Jones', trade: 'Roofer', kind: 'w2', pay_type: 'hourly', rate: 29, burden_pct: 32, active: true, phone: '(818) 555-0142', email: 'mark@example.com',
      started_trade_year: Y - 7, hired_on: (Y - 2) + '-08-01', skills: ['Shingle', 'Gutters'], certifications: 'OSHA 10', bio: 'Fast and tidy. Always the last one off the roof.', photo_url: 'https://i.pravatar.cc/300?img=33' },
    { id: 'sx-ana', name: 'Ana Ruiz', trade: 'Siding', kind: 'w2', pay_type: 'hourly', rate: 31, burden_pct: 30, active: true, phone: '(818) 555-0177',
      started_trade_year: Y - 9, hired_on: (Y - 4) + '-05-20', skills: ['Hardie siding', 'Trim', 'Paint'], certifications: 'James Hardie Elite Preferred', bio: '', photo_url: 'https://i.pravatar.cc/300?img=47' },
    { id: 'sx-dev', name: 'Devon Price', trade: 'Labourer', kind: '1099', pay_type: 'day', rate: 220, burden_pct: 0, active: true, phone: '(818) 555-0110',
      started_trade_year: Y - 1, hired_on: Y + '-02-03', skills: ['Tear-off', 'Clean-up'], certifications: '', bio: '', photo_url: '' }
  ];
  var CUST = ['Dana Mitchell', 'Priya Nair', 'Marcus Reed', 'Lena Kowalski', 'Tom Baker', 'Ana Gomez', 'Sarah Lin', 'Jim Owens', 'Emily Williams', 'Carlos Vega', 'Rachel Kim', 'Ben Foster'];
  var TITLES = ['Roof replacement', 'Storm repair', 'Gutter replacement', 'Siding repair', 'Re-roof, 32 sq', 'Leak repair', 'Skylight flashing', 'Hardie siding'];
  var COMMENTS = {
    5: ['Showed up at 7 sharp and the yard was cleaner than they found it.', 'Explained everything before he started. Great guy.', 'Careful around the garden, picked up every nail.', 'Best crew we have had on the house.', 'Fast, friendly, no mess.'],
    4: ['Good work, ran a day over but called ahead.', 'Solid job. Left a few nails by the driveway.', 'Very polite, would have him back.'],
    3: ['Work is fine, communication could be better.'],
    2: ['Arrived late two days in a row.']
  };
  var SAMPLE_JOBS = [], SAMPLE_REVS = [];
  (function build() {
    /* who works most: Luis leads, Mark and Devon are on his crew, Ana does siding */
    var plan = [['sx-luis', 'sx-mark'], ['sx-luis', 'sx-mark', 'sx-dev'], ['sx-ana'], ['sx-luis'], ['sx-luis', 'sx-mark'], ['sx-ana', 'sx-dev']];
    var weights = { 'sx-luis': [5, 5, 5, 5, 5, 5, 4, 5, 5, 4], 'sx-mark': [5, 4, 5, 4, 5, 3, 5, 4], 'sx-ana': [5, 5, 4, 5, 5, 5], 'sx-dev': [4, 5, 2, 4] };
    var cur = {}, n = 0;
    for (var i = 0; i < 46; i++) {
      var who = plan[i % plan.length], done = NOW - (i * 9 + 3) * DAY, est = 4800 + ((i * 2731) % 17000);
      var j = { id: 'sxj' + i, name: CUST[i % CUST.length], title: TITLES[i % TITLES.length], status: 'done', estimate: est, collected: est, doneAt: done,
        workers: who.map(function (id) { var e = SAMPLE_EMPS.filter(function (x) { return x.id === id; })[0]; return { employeeId: id, name: e.name }; }) };
      SAMPLE_JOBS.push(j);
      if (i % 4 === 3) continue;           /* not every customer rates */
      who.forEach(function (id) {
        var w = weights[id], k = (cur[id] = (cur[id] || 0) + 1) - 1; if (k >= w.length * 2) return;
        var r = w[k % w.length], cs = COMMENTS[r] || [''], c = (k % 3 === 1) ? '' : cs[(k + n++) % cs.length];
        SAMPLE_REVS.push({ id: 'sxr' + i + id, employee_id: id, job_id: j.id, rating: r, comment: c, customer_name: j.name, created_at: new Date(done + DAY).toISOString(), source: 'link' });
      });
    }
  })();
  window.BP_REV_SAMPLE = { emps: SAMPLE_EMPS, jobs: SAMPLE_JOBS, reviews: SAMPLE_REVS };

  /* ------------------------------------------------------------- load --- */
  window.bpRevLoad = function (force) {
    if (!live()) { R.sample = true; R.reviews = SAMPLE_REVS.slice(); R.loaded = true; return Promise.resolve(R); }
    if (R.loaded && !force) return Promise.resolve(R);
    if (R.busy) return R.busy;
    R.busy = Promise.resolve(BP_SB.from('worker_reviews').select('*').order('created_at', { ascending: false }).limit(3000))
      .then(function (r) { R.reviews = (r && !r.error && r.data) || []; R.sample = false; R.loaded = true; R.busy = null; return R; },
            function () { R.reviews = []; R.loaded = true; R.busy = null; return R; });
    return R.busy;
  };

  function jobs() {
    var a = (typeof bpJobsGet === 'function' ? bpJobsGet() : []) || [];
    return (window.BP_CREW && BP_CREW.sample) ? a.concat(SAMPLE_JOBS) : a;
  }
  function emp(id) { return window.bpEmpById ? bpEmpById(id) : null; }

  /* who worked this job */
  window.bpJobWorkers = function (j) {
    if (!j) return [];
    if (Array.isArray(j.workers) && j.workers.length) return j.workers.slice();
    var ids = [], push = function (id) { if (id && ids.indexOf(String(id)) < 0) ids.push(String(id)); };
    (Array.isArray(j.assignees) ? j.assignees : []).forEach(function (a) { push(a && a.employeeId); });
    if (Array.isArray(j.crew)) j.crew.forEach(push);
    else if (typeof j.crew === 'string' && window.pjCrew) { var c = pjCrew(j.crew); ((c && c.members) || []).forEach(push); }
    return ids.map(function (id) { var e = emp(id); return { employeeId: id, name: e ? e.name : '' }; });
  };
  function workedOn(j, id) { return bpJobWorkers(j).some(function (w) { return w.employeeId === id; }); }

  window.bpWorkerStats = function (id) {
    var done = jobs().filter(function (j) { return j && j.status === 'done' && workedOn(j, id); })
      .sort(function (a, b) { return (+b.doneAt || 0) - (+a.doneAt || 0); });
    var value = done.reduce(function (t, j) { return t + (+(j.collected != null ? j.collected : j.estimate) || 0); }, 0);
    var revs = R.reviews.filter(function (r) { return r.employee_id === id; });
    var dist = [0, 0, 0, 0, 0], sum = 0;
    revs.forEach(function (r) { var v = Math.max(1, Math.min(5, +r.rating || 0)); dist[5 - v]++; sum += v; });
    return { jobsDone: done.length, lastDone: done[0] ? done[0].doneAt : null, value: value, jobs: done,
      rating: revs.length ? sum / revs.length : 0, reviews: revs.length, dist: dist, list: revs };
  };

  /* experience in words */
  function yearsSince(y) { y = +y; if (!y) return null; return Math.max(0, new Date().getFullYear() - y); }
  function tenure(d) {
    if (!d) return '';
    var t = new Date(String(d).length <= 10 ? d + 'T12:00:00' : d); if (isNaN(t)) return '';
    var m = Math.max(0, Math.round((Date.now() - t.getTime()) / (30.44 * DAY)));
    return m < 12 ? (m <= 1 ? 'new' : m + ' mo') : (Math.floor(m / 12) + ' yr' + (Math.floor(m / 12) === 1 ? '' : 's'));
  }
  function hiredOf(e) { return e.hired_on || (e.created_at ? String(e.created_at).slice(0, 10) : ''); }
  window.bpEmpExp = function (e) { return { years: yearsSince(e && e.started_trade_year), tenure: tenure(e && hiredOf(e)), hired: e ? hiredOf(e) : '' }; };

  var STAR = function (on, sz) { return '<span class="rv-st' + (on === 1 ? ' on' : on > 0 ? ' half' : '') + '"' + (sz ? ' style="font-size:' + sz + 'px"' : '') + '>★</span>'; };
  window.bpStars = function (r, sz) { var h = ''; for (var i = 1; i <= 5; i++) h += STAR(r >= i - .25 ? 1 : r >= i - .75 ? .5 : 0, sz); return '<span class="rv-stars" title="' + (r ? r.toFixed(1) : 0) + ' of 5">' + h + '</span>'; };
  function when(at) { if (!at) return ''; var d = new Date(typeof at === 'number' ? at : String(at)); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || 'Customer'; }

  /* the one-line record shown on the Employees list */
  window.bpEmpRecordHtml = function (e) {
    var s = bpWorkerStats(e.id), x = bpEmpExp(e);
    return '<div class="rv-rec">'
      + (s.reviews ? '<span class="rv-rate">★ ' + s.rating.toFixed(1) + '</span><span class="bpx-mut"> · ' + s.reviews + ' review' + (s.reviews === 1 ? '' : 's') + '</span>'
                   : '<span class="bpx-mut">No reviews yet</span>')
      + '<div class="bpx-mut" style="font-size:11.5px;margin-top:2px">' + s.jobsDone + ' job' + (s.jobsDone === 1 ? '' : 's') + ' done'
      + (x.years != null ? ' · ' + x.years + ' yr' + (x.years === 1 ? '' : 's') + ' exp' : '')
      + (x.tenure ? ' · ' + (x.tenure === 'new' ? 'new here' : x.tenure + ' with you') : '') + '</div></div>';
  };

  /* --------------------------------------------------- profile panel --- */
  window.bpEmpProfile = function (id) {
    var e = emp(id); if (!e) return;
    var go = function () {
      var s = bpWorkerStats(id), x = bpEmpExp(e), c = window.bpCrewOfEmp ? bpCrewOfEmp(id) : null;
      var max = Math.max.apply(null, s.dist.concat([1]));
      var skills = (Array.isArray(e.skills) ? e.skills : []).filter(Boolean);
      var tile = function (lbl, val, note) { return '<div class="rv-tile"><span>' + lbl + '</span><b>' + val + '</b>' + (note ? '<em>' + note + '</em>' : '') + '</div>'; };
      var jobT = {}; s.jobs.forEach(function (j) { jobT[j.id] = j; });
      bpModal('<div class="rv-prof">'
        + '<div class="rv-ph">' + (window.bpAvatar ? bpAvatar.html(e.photo_url, e.name, 'emp-av rv-av') : '')
          + '<div class="rv-pn"><div class="rv-kick">Employee profile</div><h3>' + esc(e.name || 'Unnamed') + '</h3>'
          + '<div class="bpx-mut">' + esc(e.trade || 'Crew') + (c ? ' · <span style="color:' + esc(c.color) + ';font-weight:600">● ' + esc(c.name) + '</span>' : '') + (e.active === false ? ' · inactive' : '') + '</div>'
          + (s.reviews ? '<div class="rv-big">' + bpStars(s.rating, 18) + '<b>' + s.rating.toFixed(1) + '</b><span class="bpx-mut">' + s.reviews + ' review' + (s.reviews === 1 ? '' : 's') + '</span></div>' : '<div class="bpx-mut" style="margin-top:6px;font-size:13px">No client reviews yet</div>')
          + '</div><button class="rv-x" onclick="bpCloseModal()" aria-label="Close">×</button></div>'
        + '<div class="rv-tiles">'
          + tile('Jobs completed', s.jobsDone, s.lastDone ? 'last ' + when(s.lastDone) : 'none yet')
          + tile('Average rating', s.reviews ? s.rating.toFixed(1) + '<small>/5</small>' : '—', s.reviews ? s.reviews + ' review' + (s.reviews === 1 ? '' : 's') : 'no reviews')
          + tile('Experience', x.years != null ? x.years + '<small> yr' + (x.years === 1 ? '' : 's') + '</small>' : '—', e.started_trade_year ? 'in the trade since ' + e.started_trade_year : 'add the year they started')
          + tile('With you', x.tenure ? (x.tenure === 'new' ? 'New' : x.tenure) : '—', x.hired ? 'since ' + when(x.hired) : '')
          + tile('Work completed', money(s.value), 'job value · owner only')
        + '</div>'
        + '<div class="rv-cols"><div class="rv-col">'
          + '<div class="rv-sh">Rating breakdown</div><div class="rv-dist">' + [5, 4, 3, 2, 1].map(function (n, i) {
              return '<div><span>' + n + ' ★</span><i><b style="width:' + Math.round(s.dist[i] / max * 100) + '%"></b></i><em>' + s.dist[i] + '</em></div>'; }).join('') + '</div>'
          + (skills.length || e.certifications || e.bio ? '<div class="rv-sh">About</div>'
              + (e.bio ? '<p class="rv-bio">' + esc(e.bio) + '</p>' : '')
              + (skills.length ? '<div class="rv-chips">' + skills.map(function (k) { return '<span>' + esc(k) + '</span>'; }).join('') + '</div>' : '')
              + (e.certifications ? '<div class="rv-cert"><span class="ms">workspace_premium</span>' + esc(e.certifications) + '</div>' : '') : '')
          + '<div class="rv-sh">Recent completed jobs</div>' + (s.jobs.length ? '<div class="rv-jobs">' + s.jobs.slice(0, 6).map(function (j) {
              return '<div><b>' + esc(j.name || 'Job') + '</b><span>' + esc(j.title || '') + '</span><em>' + when(j.doneAt) + '</em><strong>' + money(+(j.collected != null ? j.collected : j.estimate) || 0) + '</strong></div>'; }).join('') + '</div>'
              : '<div class="bpx-mut" style="font-size:13px">Nothing marked done with them on it yet.</div>')
        + '</div><div class="rv-col">'
          + '<div class="rv-sh">What clients said</div>' + (s.list.length ? '<div class="rv-revs">' + s.list.slice(0, 8).map(function (r) {
              var j = jobT[r.job_id];
              return '<div class="rv-rev"><div class="rv-revh">' + bpStars(+r.rating || 0, 13) + '<b>' + esc(firstName(r.customer_name)) + '</b><em>' + when(r.created_at) + '</em></div>'
                + (r.comment ? '<p>' + esc(r.comment) + '</p>' : '') + (j ? '<span class="bpx-mut">' + esc(j.title || '') + '</span>' : '') + '</div>'; }).join('') + '</div>'
              : '<div class="bpx-mut" style="font-size:13px;line-height:1.6">When you mark a job done you get a link to send the customer. Their ratings of each person land here.</div>')
        + '</div></div>'
        + '<div class="row" style="justify-content:flex-end;gap:10px"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button><button class="bpx-btn" onclick="bpEmpOpen(\'' + e.id + '\')">Edit profile</button></div>'
        + '</div>');
      var card = document.querySelector('#bpx-modal .bpx-modalcard'); if (card) card.classList.add('rv-wide');
      if (window.bpAvatar) bpAvatar.fill($('bpx-modal'));
    };
    if (R.loaded) go(); else bpRevLoad().then(go);
  };

  /* ---------------------------------------- after "Mark done": ask --- */
  function ownerId() { return (window.bpOwnerId && bpOwnerId()) || ''; }
  function rid() { try { return crypto.randomUUID(); } catch (e) { return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }); } }
  window.bpReviewLink = function (token) { var u = ownerId(); return SITE + '/embed/rate.html?t=' + token + (u ? '&u=' + encodeURIComponent(u) : ''); };

  window.bpReviewAsk = function (jobId, fresh) {
    var all = typeof bpJobsGet === 'function' ? bpJobsGet() : [], j = all.filter(function (x) { return x.id === jobId; })[0]; if (!j) return;
    var ws = bpJobWorkers(j);
    var make = (j.review && j.review.token && !fresh) ? Promise.resolve(j.review.token)
      : (live() ? Promise.resolve(BP_SB.from('review_requests').insert({ owner: ownerId() || undefined, job_id: j.id, job_title: j.title || '', workers: ws, customer_name: j.name || '' }).select('token').single())
          .then(function (r) { if (r && r.error) throw r.error; return r.data.token; })
        : Promise.resolve(rid()));
    make.then(function (token) {
      if (!j.review || j.review.token !== token) { j.review = { token: token, at: Date.now() }; bpJobsSet(all); }
      show(j, ws, token);
    }, function (err) {
      window.bpToast && bpToast('Couldn’t make the review link' + (/review_requests/.test(String(err && err.message)) ? ' — the reviews tables aren’t set up yet.' : '.'));
    });
  };
  function show(j, ws, token) {
    var link = bpReviewLink(token), cust = firstName(j.name), co = ((typeof bpSettingsGet === 'function' ? bpSettingsGet() : {}).company || {}).name || 'us';
    var msg = 'Hi ' + cust + ', thanks for choosing ' + co + '! Could you take 30 seconds to rate the crew on your ' + (j.title || 'job').toLowerCase() + '? ' + link;
    var tel = String(j.phone || '').replace(/[^\d+]/g, '');
    bpModal('<div class="rv-ask"><div class="rv-askic"><span class="ms">star</span></div>'
      + '<h3>Ask ' + esc(cust) + ' to rate the crew</h3>'
      + '<div class="bpx-sub">' + esc(j.title || 'Job') + ' is done. Send this link and ' + esc(cust) + ' can rate the job and each person on it. It works once.</div>'
      + (ws.length ? '<div class="rv-askw">' + ws.map(function (w) { var e = emp(w.employeeId);
          return '<span>' + (window.bpAvatar ? bpAvatar.html(e && e.photo_url, w.name || (e && e.name), 'emp-av') : '') + esc(w.name || (e && e.name) || 'Crew') + '</span>'; }).join('') + '</div>'
        : '<div class="bpx-mut" style="font-size:12.5px;margin:6px 0">Nobody was assigned to this job, so the link only asks for an overall rating.</div>')
      + '<label>Review link</label><div class="rv-link"><input id="rv-link" readonly value="' + esc(link) + '" onclick="this.select()"><button class="bpx-btn" id="rv-copy" onclick="bpReviewCopy()">Copy link</button></div>'
      + '<div class="rv-acts">'
        + '<a class="bpx-btn ghost" href="sms:' + esc(tel) + '?&body=' + encodeURIComponent(msg) + '"><span class="ms">sms</span>Text' + (tel ? ' ' + esc(j.phone) : '') + '</a>'
        + '<a class="bpx-btn ghost" href="mailto:' + esc(j.email || '') + '?subject=' + encodeURIComponent('How did we do?') + '&body=' + encodeURIComponent(msg) + '"><span class="ms">mail</span>Email</a>'
        + '<a class="bpx-btn ghost" href="' + esc(link) + '" target="_blank" rel="noopener"><span class="ms">open_in_new</span>Preview</a></div>'
      + '<div class="row" style="justify-content:flex-end"><button class="bpx-btn ghost" onclick="bpCloseModal()">Done</button></div></div>');
    if (window.bpAvatar) bpAvatar.fill($('bpx-modal'));
  }
  window.bpReviewCopy = function () {
    var i = $('rv-link'), b = $('rv-copy'); if (!i) return;
    var ok = function () { if (b) { b.textContent = 'Copied'; setTimeout(function () { if (b) b.textContent = 'Copy link'; }, 1600); } };
    try { navigator.clipboard.writeText(i.value).then(ok, function () { i.select(); document.execCommand('copy'); ok(); }); } catch (e) { i.select(); try { document.execCommand('copy'); } catch (x) {} ok(); }
  };

  /* wrap the Mark-done save (index.html, and installs.js's wrapper on top):
     the first time a job is completed, snapshot who worked it and offer the
     review link */
  function wire() {
    if (typeof window.bpJobDoneSave !== 'function' || window.bpJobDoneSave._rv) return !!(window.bpJobDoneSave && window.bpJobDoneSave._rv);
    var save = window.bpJobDoneSave;
    var find = function (id) { return (typeof bpJobsGet === 'function' ? bpJobsGet() : []).filter(function (x) { return x.id === id; })[0]; };
    window.bpJobDoneSave = function (id) {
      var j = find(id), was = !!(j && j.status === 'done');
      var r = save.apply(this, arguments);
      var k = find(id);
      if (k && !was && k.status === 'done') {
        if (!(Array.isArray(k.workers) && k.workers.length)) { k.workers = bpJobWorkers(k); bpJobsSet(bpJobsGet()); }
        setTimeout(function () { bpReviewAsk(id); }, 80);
      }
      return r;
    };
    window.bpJobDoneSave._rv = 1;
    /* a finished job's dialog keeps a way back to the link */
    var open = window.bpJobDoneOpen;
    if (typeof open === 'function' && !open._rv) {
      window.bpJobDoneOpen = function (id) {
        var r = open.apply(this, arguments), j = find(id), card = document.querySelector('#bpx-modal .bpx-modalcard');
        if (j && j.status === 'done' && card) {
          var sub = card.querySelector('.bpx-sub');
          if (sub) sub.insertAdjacentHTML('afterend', '<button type="button" class="bpx-rowbtn rv-again" onclick="bpReviewAsk(\'' + esc(id) + '\')"><span class="ms">star</span>'
            + (j.review && j.review.token ? 'Review link' : 'Ask the customer to rate the crew') + '</button>');
        }
        return r;
      };
      Object.keys(open).forEach(function (k) { window.bpJobDoneOpen[k] = open[k]; });
      window.bpJobDoneOpen._rv = 1;
    }
    return true;
  }
  if (!wire()) document.addEventListener('DOMContentLoaded', wire);
  window.addEventListener('load', wire);
})();
