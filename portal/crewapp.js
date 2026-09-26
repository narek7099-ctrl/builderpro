/* ==================================================================
   The crew's own BuilderPro: four pages and nothing else.

     Clock in    clock in / out at a job, with where they were standing
     My crew     who they work with, and how to reach the office
     Projects    their crew's active jobs: read the details, add photos,
                 documents and blueprints. No money, and no editing.
     My ID       their badge

   All of it comes from crew_me() / crew_clock() / crew_add_file() in the
   database, which is where the limits are enforced: a crew login can't
   read the projects table, pay rates or anyone else's clock.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var C = window.BP_CREWAPP = { me: null, busy: null, job: null, tab: 'photos', log: null };
  var ONSITE_M = 250;   /* within this many metres of the job counts as on site */

  function area() { return $('bpxViewArea'); }
  function load(force) {
    if (C.me && !force) return Promise.resolve(C.me);
    if (C.busy && !force) return C.busy;
    C.busy = Promise.resolve(BP_SB.rpc('crew_me')).then(function (r) {
      C.busy = null;
      if (r && r.error) throw r.error;
      C.me = r.data || {}; return C.me;
    });
    return C.busy;
  }
  function wait(msg) { var a = area(); if (a) a.innerHTML = '<div class="bpx-panel"><div class="bpx-mut" style="font-size:14px">' + (msg || 'Loading…') + '</div></div>'; }
  function fail() { var a = area(); if (a) a.innerHTML = '<div class="bpx-panel"><div class="bpx-empty2">Couldn’t load this just now. Check your signal and try again.</div></div>'; }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function t12(hhmm) { var p = String(hhmm || '').split(':'), h = +p[0]; if (isNaN(h)) return ''; return (h % 12 || 12) + (p[1] && p[1] !== '00' ? ':' + p[1] : '') + (h >= 12 ? ' PM' : ' AM'); }
  function clock(ts) { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function onToday(j) { return ((j.sched && j.sched.dates) || []).indexOf(iso(new Date())) > -1; }
  function slotLbl(j, day) {
    var s = j.sched || {}, sl = s.slots && s.slots[day], t = (sl && sl.t) || s.time; if (!t) return '';
    var d = +(sl && sl.dur) || +s.dur || 0, p = t.split(':'), m = (+p[0]) * 60 + (+p[1] || 0) + d;
    return t12(t) + (d ? ' – ' + t12(('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2)) : '');
  }
  /* no employee record with this login's email: nothing to show yet */
  function unlinked() {
    var a = area(); if (!a) return true;
    if (C.me && C.me.employee) return false;
    a.innerHTML = '<div class="bpx-panel ca-empty"><span class="ms">badge</span><b>You’re not set up yet</b>'
      + '<p>Ask your boss to add you under <b>Employees</b> with this email address, then put you in a crew:</p>'
      + '<code>' + esc((window.BP_TEAM && BP_TEAM.email) || (window._bpEmail || 'your email')) + '</code></div>';
    return true;
  }

  /* ----------------------------------------------------------- clock --- */
  window.bpCrewClock = function () {
    wait();
    load(true).then(function () {
      if (unlinked()) return;
      var me = C.me, open = me.open, jobs = me.projects || [], day = iso(new Date());
      var today = jobs.filter(onToday), rest = jobs.filter(function (j) { return !onToday(j); });
      var hi = new Date().getHours(), hello = hi < 12 ? 'Good morning' : hi < 17 ? 'Good afternoon' : 'Good evening';
      var body;
      if (open) {
        var mins = Math.max(0, Math.round((Date.now() - Date.parse(open.at)) / 60000));
        body = '<div class="ca-clock on"><div class="ca-dot"></div><div class="ca-st"><b>On the clock</b>'
          + '<span>' + esc(open.job_name || 'No job picked') + ' · since ' + clock(open.at) + ' · ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm</span>'
          + (open.on_site === true ? '<em class="ok"><span class="ms">where_to_vote</span>Clocked in on site</em>' : open.on_site === false ? '<em class="warn"><span class="ms">wrong_location</span>Clocked in away from the job</em>' : '') + '</div></div>'
          + '<button class="ca-big out" id="ca-go" onclick="bpCrewClockGo(\'out\')"><span class="ms">logout</span>Clock out</button>';
      } else {
        var opt = function (j, dflt) { return '<label class="ca-job"><input type="radio" name="ca-job" value="' + esc(j.id) + '"' + (dflt ? ' checked' : '') + '><div><b>' + esc(j.name || 'Project') + '</b><span>' + esc(j.title || '') + (j.addr ? ' · ' + esc(j.addr) : '') + '</span>'
          + (onToday(j) && slotLbl(j, day) ? '<small>Today ' + slotLbl(j, day) + '</small>' : '') + '</div></label>'; };
        body = '<div class="ca-clock"><div class="ca-dot"></div><div class="ca-st"><b>Not clocked in</b><span>Pick the job you’re at, then clock in. Your location is checked against the job address.</span></div></div>'
          + (jobs.length ? (today.length ? '<div class="ca-h">Today</div>' + today.map(function (j, i) { return opt(j, i === 0); }).join('') : '')
              + (rest.length ? '<div class="ca-h">Other projects</div>' + rest.map(function (j, i) { return opt(j, !today.length && i === 0); }).join('') : '')
            : '<div class="bpx-mut" style="margin:8px 0 12px">No projects for your crew right now. You can still clock in.</div>')
          + '<button class="ca-big" id="ca-go" onclick="bpCrewClockGo(\'in\')"><span class="ms">login</span>Clock in</button>';
      }
      area().innerHTML = '<div class="ca-wrap"><div class="ca-hello">' + hello + ', ' + esc((me.employee.name || '').split(' ')[0]) + '</div>'
        + '<div class="bpx-panel">' + body + '<div class="ca-msg" id="ca-msg"></div></div>'
        + '<div class="bpx-panel"><div class="bpx-ptitle">Your recent shifts</div><div id="ca-log" class="bpx-mut">Loading…</div></div></div>';
      history();
    }).catch(fail);
  };
  function history() {
    Promise.resolve(BP_SB.from('time_clock').select('kind,at,job_name,on_site,hours').order('at', { ascending: false }).limit(20)).then(function (r) {
      var el = $('ca-log'); if (!el) return;
      var rows = (r && r.data) || [];
      if (!rows.length) { el.textContent = 'No shifts yet.'; return; }
      el.innerHTML = '<div class="ca-log">' + rows.map(function (x) {
        return '<div><span class="ms ' + (x.kind === 'in' ? 'in' : 'out') + '">' + (x.kind === 'in' ? 'login' : 'logout') + '</span>'
          + '<b>' + (x.kind === 'in' ? 'In' : 'Out') + ' ' + clock(x.at) + '</b><span>' + new Date(x.at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + (x.job_name ? ' · ' + esc(x.job_name) : '') + '</span>'
          + (x.kind === 'out' && x.hours != null ? '<em>' + (+x.hours).toFixed(2) + ' h</em>' : x.on_site === true ? '<em class="ok">on site</em>' : x.on_site === false ? '<em class="warn">off site</em>' : '') + '</div>';
      }).join('') + '</div>';
    });
  }
  function metres(a, b) { var R = 6371000, t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lng - a.lng) * t, x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) * Math.sin(dn / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function where() {
    return new Promise(function (res) {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(function (p) { res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
        function () { res(null); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });
  }
  window.bpCrewClockGo = function (kind) {
    var btn = $('ca-go'), msg = $('ca-msg');
    var jobId = kind === 'in' ? ((document.querySelector('input[name="ca-job"]:checked') || {}).value || '') : ((C.me.open || {}).job_id || '');
    var job = (C.me.projects || []).filter(function (j) { return j.id === jobId; })[0];
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ms">my_location</span>Checking your location…'; }
    where().then(function (pos) {
      var dist = null, onSite = null;
      if (pos && job && job.geo && isFinite(job.geo.lat)) { dist = Math.round(metres(pos, job.geo)); onSite = dist <= Math.max(ONSITE_M, pos.acc || 0); }
      return Promise.resolve(BP_SB.rpc('crew_clock', {
        p_kind: kind, p_job: jobId, p_job_name: job ? ((job.name || '') + (job.title ? ' — ' + job.title : '')) : '',
        p_lat: pos ? pos.lat : null, p_lng: pos ? pos.lng : null, p_acc: pos ? pos.acc : null, p_dist: dist, p_on_site: onSite
      })).then(function (r) {
        if (r && r.error) throw r.error;
        var d = r.data || {};
        if (!d.ok) { if (msg) { msg.className = 'ca-msg bad'; msg.textContent = d.error === 'already clocked in' ? 'You’re already clocked in.' : d.error === 'not clocked in' ? 'You’re not clocked in.' : 'That didn’t go through.'; } bpCrewClock(); return; }
        bpCrewClock();
        setTimeout(function () {
          var m = $('ca-msg'); if (!m) return;
          m.className = 'ca-msg ' + (onSite === false ? 'warn' : 'ok');
          m.textContent = kind === 'in'
            ? (onSite === true ? 'Clocked in on site.' : onSite === false ? 'Clocked in, ' + (dist > 1609 ? (dist / 1609).toFixed(1) + ' mi' : dist + ' m') + ' from the job. Your boss will see that.' : pos ? 'Clocked in. This job has no map location, so your spot was saved without a check.' : 'Clocked in without your location (it was blocked or unavailable).')
            : 'Clocked out. ' + (+d.hours || 0).toFixed(2) + ' hours logged.';
        }, 60);
      });
    }).catch(function () { if (msg) { msg.className = 'ca-msg bad'; msg.textContent = 'Couldn’t reach the server. Try again.'; } if (btn) { btn.disabled = false; btn.textContent = kind === 'in' ? 'Clock in' : 'Clock out'; } });
  };

  /* ------------------------------------------------------------ crew --- */
  window.bpCrewHome = function () {
    wait();
    load(true).then(function () {
      if (unlinked()) return;
      var c = C.me.crew, b = C.me.business || {};
      area().innerHTML = '<div class="ca-wrap">'
        + (c ? '<div class="bpx-panel"><div class="ca-crewh"><i style="background:' + esc(c.color) + '"></i><div><b>' + esc(c.name) + '</b><span>' + (c.members || []).length + ' in this crew</span></div></div>'
            + '<div class="ca-mates">' + (c.members || []).map(function (m) {
                var me = m.name === C.me.employee.name;
                return '<div class="ca-mate"><div class="ca-av" style="background:' + esc(c.color) + '">' + esc((m.name || '?').charAt(0)) + '</div><div><b>' + esc(m.name) + (me ? ' <small>(you)</small>' : '') + '</b><span>' + esc(m.trade || '') + '</span></div>'
                  + (m.phone && !me ? '<a class="ca-call" href="tel:' + esc(m.phone) + '"><span class="ms">call</span></a>' : '') + '</div>';
              }).join('') + '</div></div>'
          : '<div class="bpx-panel ca-empty"><span class="ms">groups</span><b>You’re not in a crew yet</b><p>Your boss puts you in one under Employees → Crews.</p></div>')
        + '<div class="bpx-panel"><div class="bpx-ptitle">The office</div><div class="ca-mate"><div class="ca-av" style="background:#0b1220"><span class="ms" style="font-size:18px">storefront</span></div><div><b>' + esc(b.name || 'Your company') + '</b><span>' + esc(b.phone || '') + '</span></div>'
          + (b.phone ? '<a class="ca-call" href="tel:' + esc(b.phone) + '"><span class="ms">call</span></a>' : '') + '</div></div></div>';
    }).catch(fail);
  };

  /* -------------------------------------------------------- projects --- */
  window.bpCrewProjects = function () {
    wait();
    load(true).then(function () {
      if (unlinked()) return;
      if (C.job && (C.me.projects || []).some(function (j) { return j.id === C.job; })) return detail();
      C.job = null;
      var jobs = C.me.projects || [];
      area().innerHTML = '<div class="ca-wrap">' + (jobs.length ? jobs.map(function (j) {
          var next = ((j.sched && j.sched.dates) || []).filter(function (d) { return d >= iso(new Date()); })[0];
          return '<button class="bpx-panel ca-proj" onclick="bpCrewJob(\'' + esc(j.id) + '\')"><div><b>' + esc(j.name || 'Project') + '</b><span>' + esc(j.title || '') + '</span>'
            + (j.addr ? '<small><span class="ms">location_on</span>' + esc(j.addr) + '</small>' : '')
            + (next ? '<small><span class="ms">event</span>' + (next === iso(new Date()) ? 'Today' : new Date(next + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + (slotLbl(j, next) ? ' · ' + slotLbl(j, next) : '') + '</small>' : '') + '</div>'
            + '<div class="ca-counts"><span><span class="ms">photo_camera</span>' + (j.photos || []).length + '</span><span><span class="ms">description</span>' + (j.docs || []).length + '</span><span><span class="ms">architecture</span>' + (j.blueprints || []).length + '</span></div></button>';
        }).join('') : '<div class="bpx-panel ca-empty"><span class="ms">construction</span><b>No projects for your crew</b><p>When your boss books your crew on a job, it shows up here.</p></div>') + '</div>';
    }).catch(fail);
  };
  window.bpCrewJob = function (id) { C.job = id; C.tab = 'photos'; detail(); };
  window.bpCrewJobTab = function (t) { C.tab = t; detail(); };
  function detail() {
    var j = (C.me.projects || []).filter(function (x) { return x.id === C.job; })[0]; if (!j) { C.job = null; return bpCrewProjects(); }
    var days = ((j.sched && j.sched.dates) || []).filter(function (d) { return d >= iso(new Date()); }).slice(0, 6);
    var T = [['photos', 'Photos', 'photo_camera'], ['docs', 'Documents', 'description'], ['blueprints', 'Blueprints', 'architecture']];
    var list = j[C.tab] || [];
    area().innerHTML = '<div class="ca-wrap"><button class="bpx-rowbtn" style="margin-bottom:10px" onclick="window.BP_CREWAPP.job=null;bpCrewProjects()">← All projects</button>'
      + '<div class="bpx-panel"><div class="ca-dh"><div><h3>' + esc(j.name || 'Project') + '</h3><span>' + esc(j.title || '') + '</span></div><em class="ca-ro"><span class="ms">visibility</span>View only</em></div>'
        + '<div class="ca-info">'
          + (j.addr ? '<a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(j.addr) + '" target="_blank" rel="noopener"><span class="ms">directions</span><div><b>' + esc(j.addr) + '</b><span>Get directions</span></div></a>' : '')
          + (j.phone ? '<a href="tel:' + esc(j.phone) + '"><span class="ms">call</span><div><b>' + esc(j.phone) + '</b><span>Customer</span></div></a>' : '')
          + (days.length ? '<div><span class="ms">event</span><div><b>' + days.map(function (d) { return (d === iso(new Date()) ? 'Today' : new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + (slotLbl(j, d) ? ' ' + slotLbl(j, d) : ''); }).join(' · ') + '</b><span>Booked days</span></div></div>' : '')
        + '</div>'
        + ((j.sched && j.sched.notes) || j.notes ? '<div class="ca-notes"><b>Notes</b><p>' + esc((j.sched && j.sched.notes) || j.notes) + '</p></div>' : '')
        + (Array.isArray(j.phases) && j.phases.length ? '<div class="ca-notes"><b>Phases</b>' + j.phases.map(function (p) { return '<p>' + (p.done ? '✓ ' : '○ ') + esc(p.name || p.label || '') + (p.due ? ' · by ' + esc(p.due) : '') + '</p>'; }).join('') + '</div>' : '')
      + '</div>'
      + '<div class="bpx-panel"><div class="bpx-jobtabs">' + T.map(function (t) { return '<button class="bpx-jt' + (C.tab === t[0] ? ' on' : '') + '" onclick="bpCrewJobTab(\'' + t[0] + '\')"><span class="ms" style="font-size:16px;vertical-align:-3px">' + t[2] + '</span> ' + t[1] + ' · ' + (j[t[0]] || []).length + '</button>'; }).join('') + '</div>'
        + '<label class="ca-add"><span class="ms">add_a_photo</span>Add ' + (C.tab === 'photos' ? 'photos' : C.tab === 'docs' ? 'documents' : 'blueprints')
          + '<input type="file" hidden multiple ' + (C.tab === 'photos' ? 'accept="image/*"' : C.tab === 'blueprints' ? 'accept="image/*,application/pdf"' : '') + ' onchange="bpCrewAdd(this)"></label><div class="ca-msg" id="ca-fmsg"></div>'
        + (list.length ? (C.tab === 'photos'
            ? '<div class="ca-grid">' + list.map(function (p, i) { return '<a class="ca-ph" data-ref="' + esc(p) + '" target="_blank" rel="noopener"><img alt="Photo ' + (i + 1) + '"></a>'; }).join('') + '</div>'
            : '<div class="ca-files">' + list.map(function (f) { return '<a class="ca-file" data-ref="' + esc(f.d || '') + '" target="_blank" rel="noopener"><span class="ms">' + (C.tab === 'docs' ? 'description' : 'architecture') + '</span><b>' + esc(f.n || 'File') + '</b></a>'; }).join('') + '</div>')
          : '<div class="bpx-mut" style="margin-top:12px">Nothing here yet.</div>')
      + '</div></div>';
    /* files in storage are private: fetch a short-lived link for each */
    document.querySelectorAll('#bpxViewArea [data-ref]').forEach(function (a) {
      var ref = a.getAttribute('data-ref'); if (!ref) return;
      var put = function (u) { if (!u) return; a.href = u; var im = a.querySelector('img'); if (im) im.src = u; };
      if (window.bpPF && bpPF.isRef(ref)) bpPF.url(ref).then(put); else put(ref);
    });
  }
  function shrink(file) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () {
        if (!/^image\//.test(file.type)) return res(r.result);
        var im = new Image();
        im.onload = function () {
          var k = Math.min(1, 1600 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
          cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.82));
        };
        im.onerror = function () { res(r.result); }; im.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  window.bpCrewAdd = function (inp) {
    var files = [].slice.call(inp.files || []); inp.value = ''; if (!files.length) return;
    var kind = C.tab, jobId = C.job, m = $('ca-fmsg'), done = 0;
    if (m) { m.className = 'ca-msg'; m.textContent = 'Uploading ' + files.length + '…'; }
    files.reduce(function (p, f) {
      return p.then(function () {
        if (f.size > 25 * 1024 * 1024) return;
        return shrink(f).then(function (data) { return bpPF.upload(jobId, kind, data, f.name); }).then(function (ref) {
          var item = kind === 'photos' ? ref : { n: f.name, d: ref, t: new Date().toISOString().slice(0, 10), by: (C.me.employee || {}).name || '' };
          return Promise.resolve(BP_SB.rpc('crew_add_file', { p_job: jobId, p_kind: kind, p_item: item })).then(function (r) { if (r && r.data) done++; });
        });
      });
    }, Promise.resolve()).then(function () {
      return load(true);
    }).then(function () {
      detail(); var mm = $('ca-fmsg'); if (mm) { mm.className = 'ca-msg ' + (done ? 'ok' : 'bad'); mm.textContent = done ? done + ' added.' : 'Nothing was added. Files must be under 25 MB.'; }
    }).catch(function () { var mm = $('ca-fmsg'); if (mm) { mm.className = 'ca-msg bad'; mm.textContent = 'Upload failed. Try again.'; } });
  };

  /* ------------------------------------------------------------- ID --- */
  window.bpCrewId = function () {
    wait();
    load(true).then(function () {
      if (unlinked()) return;
      var e = C.me.employee, c = C.me.crew, b = C.me.business || {};
      var code = String(e.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
      area().innerHTML = '<div class="ca-wrap"><div class="ca-badge" style="--crew:' + esc((c && c.color) || '#2f6bff') + '">'
        + '<div class="ca-bt">' + (b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : '<span class="ms">storefront</span>') + '<b>' + esc(b.name || 'BuilderPro') + '</b></div>'
        + '<div class="ca-bav">' + esc((e.name || '?').split(' ').map(function (x) { return x.charAt(0); }).join('').slice(0, 2).toUpperCase()) + '</div>'
        + '<div class="ca-bn">' + esc(e.name) + '</div><div class="ca-br">' + esc(e.trade || 'Crew') + '</div>'
        + (c ? '<div class="ca-bc"><i></i>' + esc(c.name) + '</div>' : '')
        + '<div class="ca-bf"><div><span>ID</span><b>' + code + '</b></div><div><span>Since</span><b>' + (e.since ? new Date(e.since).toLocaleDateString([], { month: 'short', year: 'numeric' }) : '—') + '</b></div>'
          + '<div><span>Status</span><b>' + (C.me.open ? '<i class="ca-live"></i>On the clock' : 'Off the clock') + '</b></div></div>'
        + '</div>'
        + '<div class="bpx-panel ca-idinfo">' + (e.phone ? '<div><span>Phone</span><b>' + esc(e.phone) + '</b></div>' : '') + (e.email ? '<div><span>Email</span><b>' + esc(e.email) + '</b></div>' : '')
          + '<div><span>Employer</span><b>' + esc(b.name || '') + (b.phone ? ' · ' + esc(b.phone) : '') + '</b></div></div></div>';
    }).catch(fail);
  };

  /* ------------------------------------------ owner: who's on the clock --- */
  window.bpClockNowFill = function () {
    var el = $('bpClockNow'); if (!el || !window.BP_SB) return;
    Promise.resolve(BP_SB.from('time_clock').select('user_id,employee_id,kind,at,job_name,on_site,distance_m').order('at', { ascending: false }).limit(300)).then(function (r) {
      var rows = (r && r.data) || [], last = {};
      rows.forEach(function (x) { if (!last[x.user_id]) last[x.user_id] = x; });
      var on = Object.keys(last).map(function (k) { return last[k]; }).filter(function (x) { return x.kind === 'in'; });
      var name = function (x) { var e = window.bpEmpById && bpEmpById(x.employee_id); return e ? e.name : 'Crew member'; };
      el.innerHTML = '<div class="ca-now"><b><span class="ms">schedule</span>On the clock now</b>' + (on.length ? on.map(function (x) {
        return '<div><i class="ca-live"></i><b>' + esc(name(x)) + '</b><span>' + esc(x.job_name || 'no job') + ' · since ' + clock(x.at) + '</span>'
          + (x.on_site === true ? '<em class="ok">on site</em>' : x.on_site === false ? '<em class="warn">' + (x.distance_m > 1609 ? (x.distance_m / 1609).toFixed(1) + ' mi' : Math.round(x.distance_m || 0) + ' m') + ' away</em>' : '') + '</div>';
      }).join('') : '<div class="bpx-mut">Nobody right now. Crew clock in from their own login.</div>') + '</div>';
    });
  };
})();
