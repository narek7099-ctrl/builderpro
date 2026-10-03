/* ==================================================================
   The crew's own BuilderPro: five pages and nothing else.

     Clock in    live clock, status with a running timer, job picker,
                 optional on-site location check, today / this week hours,
                 recent shifts. Punches go to public.time_clock through
                 crew_clock(); clocking out also writes the shift to
                 time_entries, which is what the owner's Employees → Hours
                 and Pay period read.
     Projects    active jobs assigned to them or their crew. Tapping one
                 opens a read-only project sheet in the owner's style
                 (Overview, Schedule, Crew, Materials, Permits, Photos,
                 Documents, Blueprints). No money, no editing; adding
                 photos / documents / blueprints is allowed.
     My crew     who they work with, and how to reach the office
     My ID       their badge, with a profile photo they can change
     Messages    portal/teamchat.js

   All of it comes from crew_me() / crew_clock() / crew_add_file() /
   crew_set_photo() in the database, which is where the limits are
   enforced: a crew login can't read the projects table, pay rates or
   anyone else's clock.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var C = window.BP_CREWAPP = { me: null, busy: null, job: null, tab: 'details', log: null, tick: null };
  var ONSITE_M = 250;   /* within this many metres of the job counts as on site */
  var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  function area() { return $('bpxViewArea'); }
  function load(force) {
    if (C.me && !force) return Promise.resolve(C.me);
    if (C.busy && !force) return C.busy;
    C.busy = Promise.resolve(BP_SB.rpc('crew_me')).then(function (r) {
      C.busy = null;
      if (r && r.error) throw r.error;
      C.me = r.data || {}; paintMe(); return C.me;
    });
    return C.busy;
  }
  function wait(msg) { var a = area(); if (a) a.innerHTML = '<div class="bpx-panel"><div class="bpx-mut" style="font-size:14px">' + (msg || 'Loading…') + '</div></div>'; }
  function fail() { var a = area(); if (a) a.innerHTML = '<div class="bpx-panel"><div class="bpx-empty2">Couldn’t load this just now. Check your signal and try again.</div></div>'; }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function t12(hhmm) { var p = String(hhmm || '').split(':'), h = +p[0]; if (isNaN(h)) return ''; return (h % 12 || 12) + (p[1] && p[1] !== '00' ? ':' + p[1] : '') + (h >= 12 ? ' PM' : ' AM'); }
  function clock(ts) { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function dayLbl(d) { return d === iso(new Date()) ? 'Today' : new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
  function pretty(d) { if (!d) return ''; var x = new Date(String(d).length <= 10 ? d + 'T12:00:00' : d); return isNaN(x) ? esc(d) : x.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  function onToday(j) { return ((j.sched && j.sched.dates) || []).indexOf(iso(new Date())) > -1; }
  function slotLbl(j, day) {
    var s = j.sched || {}, sl = s.slots && s.slots[day], t = (sl && sl.t) || s.time; if (!t) return '';
    var d = +(sl && sl.dur) || +s.dur || 0, p = t.split(':'), m = (+p[0]) * 60 + (+p[1] || 0) + d;
    return t12(t) + (d ? ' – ' + t12(('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2)) : '');
  }
  function hm(ms) { var m = Math.max(0, Math.floor(ms / 60000)); return Math.floor(m / 60) + 'h ' + ('0' + (m % 60)).slice(-2) + 'm'; }
  function hms(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + ':' + ('0' + Math.floor(s % 3600 / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2); }
  function initials(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function telOf(p) { return String(p || '').replace(/[^\d+]/g, ''); }
  /* no employee record with this login's email: nothing to show yet */
  function unlinked() {
    var a = area(); if (!a) return true;
    if (C.me && C.me.employee) return false;
    a.innerHTML = '<div class="bpx-panel ca-empty"><span class="ms">badge</span><b>You’re not set up yet</b>'
      + '<p>Ask your boss to add you under <b>Employees</b> with this email address, then put you in a crew:</p>'
      + '<code>' + esc((window.BP_TEAM && BP_TEAM.email) || (window._bpEmail || 'your email')) + '</code></div>';
    return true;
  }
  function stopTick() { if (C.tick) { clearInterval(C.tick); C.tick = null; } }

  /* ========================================================= avatars ===
     A profile photo is stored at <owner>/employees/<id>/avatar.jpg in the
     private project-files bucket; employees.photo_url keeps
     "sb:<path>#<version>" (the version only busts caches). */
  var AV = window.bpAvatar = { cache: {} };
  AV.url = function (ref) {
    if (!ref) return Promise.resolve('');
    if (String(ref).indexOf('sb:') !== 0) return Promise.resolve(ref);
    var c = AV.cache[ref]; if (c && c.until > Date.now()) return Promise.resolve(c.url);
    if (!(window.BP_SB && BP_SB.storage)) return Promise.resolve('');
    var path = ref.slice(3).split('#')[0];
    return Promise.resolve(BP_SB.storage.from('project-files').createSignedUrl(path, 3600)).then(function (r) {
      var u = (r && r.data && r.data.signedUrl) || '';
      if (u) AV.cache[ref] = { url: u, until: Date.now() + 50 * 60 * 1000 };
      return u;
    }).catch(function () { return ''; });
  };
  /* <span class="av"> with initials, the photo laid over it once it resolves */
  AV.html = function (ref, name, cls, style) {
    return '<span class="bp-av ' + (cls || '') + '"' + (style ? ' style="' + style + '"' : '') + '><span>' + esc(initials(name)) + '</span>'
      + (ref ? '<img alt="" data-av="' + esc(ref) + '" hidden>' : '') + '</span>';
  };
  AV.fill = function (root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('img[data-av]'), function (im) {
      var ref = im.getAttribute('data-av'); im.removeAttribute('data-av');
      AV.url(ref).then(function (u) { if (!u) return; im.onload = function () { im.hidden = false; }; im.src = u; });
    });
  };
  /* pick a picture (camera on a phone), crop it to a circle, resolve to a 512px JPEG blob */
  AV.pick = function (title) {
    return new Promise(function (resolve) {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.style.display = 'none'; document.body.appendChild(inp);
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; inp.remove(); if (!f) return resolve(null);
        var rd = new FileReader();
        rd.onload = function () { AV.crop(rd.result, title).then(resolve); };
        rd.onerror = function () { resolve(null); };
        rd.readAsDataURL(f);
      };
      inp.click();
    });
  };
  AV.crop = function (src, title) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        var S = 260, st = { z: 1, x: 0, y: 0 }, base = S / Math.min(im.width, im.height);
        bpModal('<h3>' + esc(title || 'Your photo') + '</h3><div class="bpx-sub">Drag to move, slide to zoom.</div>'
          + '<div class="av-crop" id="avCrop" style="width:' + S + 'px;height:' + S + 'px"><img id="avImg" src="' + src + '" alt="" draggable="false"></div>'
          + '<input type="range" id="avZoom" class="av-zoom" min="1" max="3" step="0.01" value="1" aria-label="Zoom">'
          + '<div class="row"><button class="bpx-btn ghost" id="avNo">Cancel</button><button class="bpx-btn" id="avYes">Use photo</button></div>');
        var img = $('avImg'), box = $('avCrop'), done = false;
        var clamp = function () {
          var w = im.width * base * st.z, h = im.height * base * st.z;
          st.x = Math.min(0, Math.max(S - w, st.x)); st.y = Math.min(0, Math.max(S - h, st.y));
          img.style.width = w + 'px'; img.style.height = h + 'px'; img.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px)';
        };
        st.x = (S - im.width * base) / 2; st.y = (S - im.height * base) / 2; clamp();
        $('avZoom').oninput = function () {
          var nz = +this.value, cx = S / 2 - st.x, cy = S / 2 - st.y, k = nz / st.z;
          st.z = nz; st.x = S / 2 - cx * k; st.y = S / 2 - cy * k; clamp();
        };
        var drag = null;
        box.onpointerdown = function (e) { drag = { x: e.clientX - st.x, y: e.clientY - st.y }; try { box.setPointerCapture(e.pointerId); } catch (x) {} };
        box.onpointermove = function (e) { if (!drag) return; st.x = e.clientX - drag.x; st.y = e.clientY - drag.y; clamp(); };
        box.onpointerup = box.onpointercancel = function () { drag = null; };
        var finish = function (v) { if (done) return; done = true; bpCloseModal(); resolve(v); };
        $('avNo').onclick = function () { finish(null); };
        $('avYes').onclick = function () {
          var cv = document.createElement('canvas'); cv.width = cv.height = 512;
          var k = 512 / S, sc = base * st.z * k;
          var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512);
          g.drawImage(im, st.x * k, st.y * k, im.width * sc, im.height * sc);
          cv.toBlob(function (b) { finish(b); }, 'image/jpeg', 0.86);
        };
      };
      im.onerror = function () { resolve(null); };
      im.src = src;
    });
  };
  /* upload a cropped photo for an employee; resolves to the stored reference */
  AV.upload = function (owner, empId, blob) {
    var path = owner + '/employees/' + empId + '/avatar.jpg';
    return Promise.resolve(BP_SB.storage.from('project-files').upload(path, blob, { contentType: 'image/jpeg', upsert: true }))
      .then(function (r) { if (r && r.error) throw r.error; return 'sb:' + path + '#' + Date.now().toString(36); });
  };

  /* the crew member's photo in the top bar and on the sidebar account card */
  function paintMe() {
    if (!(window.bpTeamIsCrew && bpTeamIsCrew())) return;
    var e = (C.me && C.me.employee) || null; if (!e) return;
    window.bpMeAvatar = { ref: e.photo || '', name: e.name || '' };
    var av = $('hlAv');
    if (av) {
      av.classList.add('has-ph'); av.innerHTML = '<span>' + esc(initials(e.name)) + '</span>';
      if (e.photo) AV.url(e.photo).then(function (u) { if (u && $('hlAv')) $('hlAv').innerHTML = '<img src="' + esc(u) + '" alt="">'; });
    }
    var lg = $('hlAcctLogo'), bz = $('hlBiz');
    if (bz) bz.textContent = e.name || 'BuilderPro';
    if (lg) {
      lg.classList.add('ca-me');
      lg.innerHTML = '<span class="ca-mei">' + esc(initials(e.name)) + '</span>';
      if (e.photo) AV.url(e.photo).then(function (u) { var l = $('hlAcctLogo'); if (u && l) l.innerHTML = '<img src="' + esc(u) + '" alt="">'; });
    }
  }
  window.bpCrewPaintMe = paintMe;

  /* ----------------------------------------------------------- clock --- */
  function weekStart() { var d = new Date(); d.setHours(0, 0, 0, 0); var k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return d; }
  /* turn punches (newest first) into shifts {in, out|null, job, onSite, ms} */
  function shifts(rows) {
    var asc = rows.slice().sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); }), out = [], cur = null;
    asc.forEach(function (x) {
      if (x.kind === 'in') { if (cur) out.push(cur); cur = { inAt: x.at, outAt: null, job: x.job_name, onSite: x.on_site, hours: null }; }
      else if (cur) { cur.outAt = x.at; cur.hours = x.hours; out.push(cur); cur = null; }
    });
    if (cur) out.push(cur);
    out.forEach(function (s) { s.ms = (s.outAt ? Date.parse(s.outAt) : Date.now()) - Date.parse(s.inAt); });
    return out.reverse();
  }
  function totals(list) {
    var t0 = new Date(); t0.setHours(0, 0, 0, 0); var w0 = weekStart(), now = Date.now(), day = 0, week = 0, n = 0;
    list.forEach(function (s) {
      var a = Date.parse(s.inAt), b = s.outAt ? Date.parse(s.outAt) : now;
      day += Math.max(0, b - Math.max(a, t0.getTime()));
      week += Math.max(0, b - Math.max(a, w0.getTime()));
      if (b > w0.getTime()) n++;
    });
    return { day: day, week: week, n: n };
  }
  function jobLabel(j) { return (j.name || 'Project') + (j.title ? ' — ' + j.title : ''); }

  window.bpCrewClock = function () {
    stopTick(); wait();
    load(true).then(function () {
      if (unlinked()) return;
      var me = C.me, open = me.open, jobs = me.projects || [], day = iso(new Date());
      var today = jobs.filter(onToday), rest = jobs.filter(function (j) { return !onToday(j); });
      var geoOn = LS.get('caGeo') !== '0';
      var status, action, picker = '';
      if (open) {
        var openJob = jobs.filter(function (j) { return j.id === open.job_id; })[0];
        status = '<div class="ck-status on"><div class="ck-pulse"><i></i></div><div class="ck-st">'
          + '<small>On the clock</small><b>Clocked in at ' + clock(open.at) + '</b>'
          + '<span>' + (open.job_name ? 'on ' + esc(openJob ? (openJob.name || '') + ' job' : open.job_name) : 'No job picked') + '</span>'
          + (open.on_site === true ? '<em class="ok"><span class="ms">where_to_vote</span>Verified on site</em>' : open.on_site === false ? '<em class="warn"><span class="ms">wrong_location</span>Clocked in away from the job</em>' : '')
          + '</div><div class="ck-timer"><small>Running</small><b id="ck-run">' + hms(Date.now() - Date.parse(open.at)) + '</b></div></div>';
        action = '<button class="ck-btn out" id="ca-go" onclick="bpCrewClockGo(\'out\')"><span class="ms">logout</span><span>Clock out</span></button>';
      } else {
        status = '<div class="ck-status"><div class="ck-pulse"><i></i></div><div class="ck-st"><small>Off the clock</small><b>Not clocked in</b>'
          + '<span>Pick the job you’re at, then clock in.</span></div></div>';
        var opt = function (j, dflt) {
          return '<label class="ck-job"><input type="radio" name="ca-job" value="' + esc(j.id) + '"' + (dflt ? ' checked' : '') + '>'
            + '<span class="ck-jr"></span><div><b>' + esc(j.name || 'Project') + '</b><span>' + esc(j.title || '') + (j.addr ? ' · ' + esc(j.addr) : '') + '</span>'
            + (onToday(j) ? '<small>Booked today' + (slotLbl(j, day) ? ' · ' + slotLbl(j, day) : '') + '</small>' : '') + '</div></label>';
        };
        picker = '<div class="ck-sec"><div class="ck-h">Which job?</div>'
          + (jobs.length ? (today.length ? today.map(function (j, i) { return opt(j, i === 0); }).join('') : '')
              + rest.map(function (j, i) { return opt(j, !today.length && i === 0); }).join('')
              + '<label class="ck-job"><input type="radio" name="ca-job" value=""><span class="ck-jr"></span><div><b>No specific job</b><span>Shop time, pickup, travel</span></div></label>'
            : '<div class="bpx-mut" style="margin:4px 0 8px">No projects assigned to you right now. You can still clock in.</div>')
          + '</div>';
        action = '<button class="ck-btn" id="ca-go" onclick="bpCrewClockGo(\'in\')"><span class="ms">login</span><span>Clock in</span></button>';
      }
      var hi = new Date().getHours(), hello = hi < 12 ? 'Good morning' : hi < 17 ? 'Good afternoon' : 'Good evening';
      area().innerHTML = '<div class="ca-wrap ck">'
        + '<div class="ck-hero"><div><div class="ck-hello">' + hello + ', ' + esc((me.employee.name || '').split(' ')[0]) + '</div>'
          + '<div class="ck-time" id="ck-time">' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '<small id="ck-sec">:' + ('0' + new Date().getSeconds()).slice(-2) + '</small></div>'
          + '<div class="ck-date">' + new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '</div></div>'
          + '<div class="ck-biz">' + esc((me.business && me.business.name) || '') + '</div></div>'
        + '<div class="ck-grid"><div class="bpx-panel ck-main">' + status + picker
          + '<label class="ck-geo"><input type="checkbox" id="ck-geo"' + (geoOn ? ' checked' : '') + ' onchange="bpCrewGeo(this.checked)"><span class="ck-sw"></span>'
            + '<div><b>Share my location</b><span>Confirms you’re on site. Only saved with the punch.</span></div></label>'
          + action + '<div class="ca-msg" id="ca-msg"></div>'
          + '<div class="ck-sync"><span class="ms">cloud_done</span>Punches go straight to your timesheet in ' + esc((me.business && me.business.name) || 'BuilderPro') + '.</div></div>'
        + '<div class="ck-side"><div class="bpx-panel ck-sum"><div><small>Today</small><b id="ck-day">—</b></div><div><small>This week</small><b id="ck-week">—</b></div><div><small>Shifts this week</small><b id="ck-n">—</b></div></div>'
          + '<div class="bpx-panel"><div class="bpx-ptitle">Recent punches</div><div id="ca-log" class="bpx-mut">Loading…</div></div></div></div></div>';
      history();
      C.tick = setInterval(function () {
        var t = $('ck-time'); if (!t) return stopTick();
        var n = new Date();
        t.innerHTML = n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '<small>:' + ('0' + n.getSeconds()).slice(-2) + '</small>';
        var r = $('ck-run'); if (r && C.me.open) r.textContent = hms(Date.now() - Date.parse(C.me.open.at));
        if (n.getSeconds() === 0 && C.log) paintTotals();
      }, 1000);
    }).catch(fail);
  };
  window.bpCrewGeo = function (on) { LS.set('caGeo', on ? '1' : '0'); };
  function paintTotals() {
    var t = totals(C.log || []);
    var s = function (id, v) { var e = $(id); if (e) e.textContent = v; };
    s('ck-day', hm(t.day)); s('ck-week', hm(t.week)); s('ck-n', String(t.n));
  }
  function history() {
    var since = new Date(weekStart().getTime() - 14 * 86400000).toISOString();
    Promise.resolve(BP_SB.from('time_clock').select('kind,at,job_name,on_site,hours').gte('at', since).order('at', { ascending: false }).limit(200)).then(function (r) {
      var el = $('ca-log'); if (!el) return;
      var rows = (r && r.data) || [];
      C.log = shifts(rows); paintTotals();
      if (!C.log.length) { el.textContent = 'No shifts yet. Your punches show up here.'; return; }
      el.className = '';
      el.innerHTML = '<div class="ck-log">' + C.log.slice(0, 10).map(function (s) {
        var d = iso(new Date(s.inAt));
        return '<div class="' + (s.outAt ? '' : 'live') + '"><div class="ck-ld"><b>' + new Date(s.inAt).getDate() + '</b><small>' + new Date(s.inAt).toLocaleDateString([], { weekday: 'short' }) + '</small></div>'
          + '<div class="ck-lt"><b>' + clock(s.inAt) + ' – ' + (s.outAt ? clock(s.outAt) : 'now') + '</b><span>' + (d === iso(new Date()) ? 'Today' : new Date(s.inAt).toLocaleDateString([], { month: 'short', day: 'numeric' })) + (s.job ? ' · ' + esc(s.job) : '') + '</span></div>'
          + '<div class="ck-lh"><b>' + (s.outAt && s.hours != null ? (+s.hours).toFixed(2) + ' h' : hm(s.ms)) + '</b>'
            + (s.onSite === true ? '<em class="ok">on site</em>' : s.onSite === false ? '<em class="warn">off site</em>' : '') + '</div></div>';
      }).join('') + '</div>';
    }).catch(function () { var el = $('ca-log'); if (el) el.textContent = 'Couldn’t load your punches.'; });
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
    var geo = !!($('ck-geo') || {}).checked;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ms">' + (geo ? 'my_location' : 'hourglass_top') + '</span><span>' + (geo ? 'Checking your location…' : 'Saving…') + '</span>'; }
    (geo ? where() : Promise.resolve(null)).then(function (pos) {
      var dist = null, onSite = null;
      if (pos && job && job.geo && isFinite(job.geo.lat)) { dist = Math.round(metres(pos, job.geo)); onSite = dist <= Math.max(ONSITE_M, pos.acc || 0); }
      return Promise.resolve(BP_SB.rpc('crew_clock', {
        p_kind: kind, p_job: jobId, p_job_name: job ? jobLabel(job) : '',
        p_lat: pos ? pos.lat : null, p_lng: pos ? pos.lng : null, p_acc: pos ? pos.acc : null, p_dist: dist, p_on_site: onSite
      })).then(function (r) {
        if (r && r.error) throw r.error;
        var d = r.data || {};
        if (!d.ok) { bpCrewClock(); setTimeout(function () { var m = $('ca-msg'); if (m) { m.className = 'ca-msg bad'; m.textContent = d.error === 'already clocked in' ? 'You’re already clocked in.' : d.error === 'not clocked in' ? 'You’re not clocked in.' : 'That didn’t go through.'; } }, 400); return; }
        bpCrewClock();
        setTimeout(function () {
          var m = $('ca-msg'); if (!m) return;
          m.className = 'ca-msg ' + (onSite === false ? 'warn' : 'ok');
          m.textContent = kind === 'in'
            ? (onSite === true ? 'Clocked in on site.' : onSite === false ? 'Clocked in, ' + (dist > 1609 ? (dist / 1609).toFixed(1) + ' mi' : dist + ' m') + ' from the job. Your boss will see that.' : !geo ? 'Clocked in.' : pos ? 'Clocked in. This job has no map location, so your spot was saved without a check.' : 'Clocked in without your location (it was blocked or unavailable).')
            : 'Clocked out. ' + (+d.hours || 0).toFixed(2) + ' hours added to your timesheet.';
        }, 400);
      });
    }).catch(function () { if (msg) { msg.className = 'ca-msg bad'; msg.textContent = 'Couldn’t reach the server. Try again.'; } if (btn) { btn.disabled = false; btn.innerHTML = '<span class="ms">' + (kind === 'in' ? 'login' : 'logout') + '</span><span>' + (kind === 'in' ? 'Clock in' : 'Clock out') + '</span>'; } });
  };

  /* ------------------------------------------------------------ crew --- */
  function personRow(m, color, me) {
    return '<div class="ca-mate">' + AV.html(m.photo, m.name, 'ca-av', 'background:' + esc(color || '#475467')) + '<div><b>' + esc(m.name) + (me ? ' <small>(you)</small>' : '') + '</b><span>' + esc(m.trade || '') + '</span></div>'
      + (m.phone && !me ? '<a class="ca-call" href="tel:' + esc(telOf(m.phone)) + '" aria-label="Call ' + esc(m.name) + '"><span class="ms">call</span></a>' : '') + '</div>';
  }
  window.bpCrewHome = function () {
    stopTick(); wait();
    load(true).then(function () {
      if (unlinked()) return;
      var c = C.me.crew, b = C.me.business || {};
      area().innerHTML = '<div class="ca-wrap">'
        + (c ? '<div class="bpx-panel"><div class="ca-crewh"><i style="background:' + esc(c.color) + '"></i><div><b>' + esc(c.name) + '</b><span>' + (c.members || []).length + ' in this crew</span></div></div>'
            + '<div class="ca-mates">' + (c.members || []).map(function (m) { return personRow(m, c.color, m.name === C.me.employee.name); }).join('') + '</div></div>'
          : '<div class="bpx-panel ca-empty"><span class="ms">groups</span><b>You’re not in a crew yet</b><p>Your boss puts you in one under Employees → Crews.</p></div>')
        + '<div class="bpx-panel"><div class="bpx-ptitle">The office</div><div class="ca-mate"><div class="ca-av" style="background:#0b1220"><span class="ms" style="font-size:18px">storefront</span></div><div><b>' + esc(b.name || 'Your company') + '</b><span>' + esc(b.phone || '') + '</span></div>'
          + (b.phone ? '<a class="ca-call" href="tel:' + esc(telOf(b.phone)) + '"><span class="ms">call</span></a>' : '') + '</div></div></div>';
      AV.fill(area());
    }).catch(fail);
  };

  /* -------------------------------------------------------- projects --- */
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  window.bpCrewProjects = function () {
    stopTick(); wait();
    load(true).then(function () {
      if (unlinked()) return;
      var jobs = C.me.projects || [];
      area().innerHTML = '<div class="ca-wrap">' + (jobs.length ? jobs.map(function (j) {
          var next = ((j.sched && j.sched.dates) || []).filter(function (d) { return d >= iso(new Date()); })[0];
          var files = [[(j.photos || []).length, 'photo', 'photos'], [(j.docs || []).length, 'doc', 'docs'], [(j.blueprints || []).length, 'blueprint', 'blueprints']]
            .filter(function (x) { return x[0]; }).map(function (x) { return plural(x[0], x[1], x[2]); }).join(' · ');
          return '<button class="bpx-panel ca-proj" onclick="bpCrewJob(\'' + esc(j.id) + '\')"><div><b>' + esc(j.name || 'Project') + '</b><span>' + esc(j.title || '') + '</span>'
            + (j.addr ? '<small><span class="ms">location_on</span>' + esc(j.addr) + '</small>' : '')
            + (next ? '<small><span class="ms">event</span>' + dayLbl(next) + (slotLbl(j, next) ? ' · ' + slotLbl(j, next) : '') + '</small>' : '')
            + (files ? '<small class="ca-files-line">' + files + '</small>' : '') + '</div>'
            + '<span class="ms ca-chev" aria-hidden="true">chevron_right</span></button>';
        }).join('') : '<div class="bpx-panel ca-empty"><span class="ms">construction</span><b>No projects for you yet</b><p>When your boss puts you (or your crew) on a job, it shows up here.</p></div>') + '</div>';
      if (C.job && jobs.some(function (j) { return j.id === C.job; }) && !$('bpx-modal')) sheet();
    }).catch(fail);
  };
  window.bpCrewJob = function (id) { C.job = id; C.tab = 'details'; sheet(); };

  /* ---------------------------------------------- read-only project sheet --- */
  var TABS = [['details', 'Overview', 'dashboard'], ['schedule', 'Schedule', 'calendar_month'], ['crew', 'Crew', 'groups'], ['materials', 'Materials', 'inventory_2'],
    ['permits', 'Permits', 'assignment'], ['photos', 'Photos', 'photo_library'], ['docs', 'Documents', 'folder'], ['blueprints', 'Blueprints', 'architecture']];
  function curJob() { return (C.me && C.me.projects || []).filter(function (x) { return x.id === C.job; })[0]; }
  function phasesOf(j) {
    if (j.plan && Array.isArray(j.plan.phases) && j.plan.phases.length) return j.plan.phases.map(function (p) { return { name: p.name, due: p.due, done: !!p.doneAt, days: +p.days || 1 }; });
    if (Array.isArray(j.phases)) return j.phases.map(function (p) { return { name: p.name || p.label, due: p.due, done: !!(p.done || p.doneAt), days: +p.days || 1 }; });
    return [];
  }
  function progress(j) {
    var ph = phasesOf(j); if (!ph.length) return null;
    var tot = 0, dn = 0, next = null;
    ph.forEach(function (p) { tot += p.days; if (p.done) dn += p.days; else if (!next) next = p; });
    return { pct: tot ? Math.round(dn / tot * 100) : 0, next: next, finish: ph[ph.length - 1].due };
  }
  function ring(pct) {
    var r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return '<div class="pjs-ring" role="img" aria-label="' + pct + '% built"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="' + r + '" class="tr"/>'
      + '<circle cx="32" cy="32" r="' + r + '" class="fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg><span><b>' + pct + '%</b><small>built</small></span></div>';
  }
  function hero(j) {
    var addr = (j.addr || '').trim(), ph = telOf(j.phone), pr = progress(j);
    var upcoming = ((j.sched && j.sched.dates) || []).filter(function (d) { return d >= iso(new Date()); })[0];
    var act = function (href, ico, t, dis, ext) { return dis ? '<span class="pjs-act dis" aria-disabled="true"><span class="ms">' + ico + '</span>' + t + '</span>' : '<a class="pjs-act" href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '><span class="ms">' + ico + '</span>' + t + '</a>'; };
    return '<header class="pjs-hero"><div class="pjs-hero-top"><div class="pjs-av" aria-hidden="true">' + esc(initials(j.name)) + '</div><div class="pjs-hero-t">'
      + '<div class="pjs-tags"><span class="pjs-pill live"><i></i>In progress</span>' + (onToday(j) ? '<span class="pjs-pill today"><span class="ms">engineering</span>On site today</span>' : '')
        + '<span class="pjs-pill ro"><span class="ms">visibility</span>View only</span></div>'
      + '<h2 id="pjs-title">' + esc(j.name || 'Project') + '</h2><div class="pjs-job">' + esc(j.title || 'Project') + '</div>'
      + (addr ? '<a class="pjs-addr" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr) + '"><span class="ms">location_on</span><span>' + esc(addr) + '</span><span class="ms ext">open_in_new</span></a>'
        : '<span class="pjs-addr none"><span class="ms">location_off</span>No address yet</span>')
      + '</div><button class="pjs-x" type="button" aria-label="Close project" onclick="bpCloseModal()"><span class="ms">close</span></button></div>'
      + '<div class="pjs-hero-row">' + (pr ? ring(pr.pct) : '')
      + '<div class="pjs-stats">'
        + (pr && pr.next ? '<div class="pjs-stat wide"><small>Next phase</small><b>' + esc(pr.next.name || '') + (pr.next.due ? ' · ' + pretty(pr.next.due) : '') + '</b></div>' : '')
        + (upcoming ? '<div class="pjs-stat wide"><small>Next work day</small><b>' + dayLbl(upcoming) + (slotLbl(j, upcoming) ? ' · ' + slotLbl(j, upcoming) : '') + '</b></div>' : '')
        + (pr && pr.finish ? '<div class="pjs-stat wide"><small>Finish</small><b>' + pretty(pr.finish) + '</b></div>' : '') + '</div>'
      + '<div class="pjs-acts">' + act('tel:' + ph, 'call', 'Call', !ph) + act('sms:' + ph, 'sms', 'Text', !ph)
        + act('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr), 'directions', 'Directions', !addr, true) + '</div></div></header>';
  }
  function sec(title, body) { return '<section class="pjs-sec">' + (title ? '<div class="pjs-h">' + title + '</div>' : '') + body + '</section>'; }
  function kv(rows) { rows = rows.filter(function (r) { return r[1]; }); return rows.length ? '<dl class="cs-kv">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' : ''; }
  function none(ico, t, p) { return '<div class="pjs-empty sm"><span class="ms">' + ico + '</span><b>' + t + '</b>' + (p ? '<p>' + p + '</p>' : '') + '</div>'; }
  function pane(j, t) {
    var s = j.sched || {};
    if (t === 'details') {
      var ph = telOf(j.phone);
      return sec('Customer & site', kv([
          ['Customer', esc(j.name || '')],
          ['Phone', j.phone ? '<a href="tel:' + esc(ph) + '">' + esc(j.phone) + '</a>' : ''],
          ['Email', j.email ? '<a href="mailto:' + esc(j.email) + '">' + esc(j.email) + '</a>' : ''],
          ['Address', j.addr ? '<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(j.addr) + '">' + esc(j.addr) + '</a>' : ''],
          ['Job', esc(j.title || '')]]) || '<div class="bpx-mut">No customer details on this job.</div>')
        + sec('Notes', (s.notes || j.notes) ? '<p class="cs-notes">' + esc(s.notes || j.notes) + '</p>' : '<div class="bpx-mut">No notes. Gate codes, parking and anything else the office adds shows up here.</div>');
    }
    if (t === 'schedule') {
      var dates = (s.dates || []).slice().sort(), td = iso(new Date());
      var up = dates.filter(function (d) { return d >= td; }), past = dates.filter(function (d) { return d < td; });
      var phs = phasesOf(j);
      return sec('Work days', dates.length ? '<div class="cs-days">' + up.concat(past.slice(-3).reverse()).map(function (d) {
            return '<div class="' + (d < td ? 'past' : d === td ? 'today' : '') + '"><b>' + dayLbl(d) + '</b><span>' + (slotLbl(j, d) || 'Time not set') + '</span>'
              + (s.slots && s.slots[d] && s.slots[d].note ? '<small>' + esc(s.slots[d].note) + '</small>' : '') + '</div>';
          }).join('') + '</div>' : '<div class="bpx-mut">No work days booked yet.</div>')
        + sec('Phases', phs.length ? '<div class="cs-phases">' + phs.map(function (p) {
            var late = !p.done && p.due && p.due < td;
            return '<div class="' + (p.done ? 'done' : late ? 'late' : '') + '"><span class="ms">' + (p.done ? 'check_circle' : 'radio_button_unchecked') + '</span><b>' + esc(p.name || 'Phase') + '</b><span>' + (p.due ? (p.done ? 'Due ' : late ? 'Was due ' : 'Due ') + pretty(p.due) : '') + '</span></div>';
          }).join('') + '</div>' : '<div class="bpx-mut">No phases planned for this job.</div>')
        + (s.notes ? sec('Schedule notes', '<p class="cs-notes">' + esc(s.notes) + '</p>') : '');
    }
    if (t === 'crew') {
      var cr = j.crew && typeof j.crew === 'object' ? j.crew : null, ppl = j.assignees || [], myName = (C.me.employee || {}).name;
      if (!cr && !ppl.length && C.me.crew) cr = null;
      return (cr ? sec('<i class="cs-dot" style="background:' + esc(cr.color || '#4e6ef2') + '"></i>' + esc(cr.name || 'Crew'), (cr.members || []).length ? (cr.members || []).map(function (m) { return personRow(m, cr.color, m.name === myName); }).join('') : '<div class="bpx-mut">Nobody in this crew yet.</div>') : '')
        + (ppl.length ? sec('Assigned to this job', ppl.map(function (m) { return personRow(m, '#475467', m.name === myName); }).join('')) : '')
        + (!cr && !ppl.length ? none('groups', 'Nobody listed', 'The office hasn’t put a crew or people on this job yet.') : '');
    }
    if (t === 'materials') {
      var it = j.materials || [];
      return it.length ? sec('Material list' + (j.materialsStatus ? ' <span class="cs-tag">' + esc(j.materialsStatus) + '</span>' : ''), '<div class="cs-mat"><div class="cs-mh"><span>Item</span><span>Qty</span></div>' + it.map(function (x) {
          return '<div><span><b>' + esc(x.name || 'Item') + '</b>' + (x.note || x.supplier ? '<small>' + esc([x.supplier, x.note].filter(Boolean).join(' · ')) + '</small>' : '') + '</span><span>' + esc(x.qty == null ? '' : x.qty) + (x.unit ? ' ' + esc(x.unit) : '') + '</span></div>';
        }).join('') + '</div>') : none('inventory_2', 'No material list yet', 'When the office builds the list for this job, it shows up here.');
    }
    if (t === 'permits') {
      var pm = j.permits || [];
      return pm.length ? '<div class="pm-list">' + pm.map(function (p) {
          var st = p.status || 'Not applied', cls = /Passed|Closed/.test(st) ? 'ok' : /Failed/.test(st) ? 'bad' : /Approved|scheduled/.test(st) ? 'info' : 'idle';
          var insp = (p.inspections || []).filter(function (x) { return x.date || x.kind; });
          return '<div class="pm-card"><div class="pm-top"><div class="pm-ico"><span class="ms">assignment</span></div><div class="pm-t"><b>' + esc(p.type || 'Permit') + (p.number ? ' <span class="pm-no">#' + esc(p.number) + '</span>' : '') + '</b><small>' + esc(p.office || '') + '</small></div><span class="pm-st ' + cls + '">' + esc(st) + '</span></div>'
            + kv([['Applied', pretty(p.applied)], ['Approved', pretty(p.approved)], ['Expires', pretty(p.expires)]])
            + (insp.length ? '<div class="cs-insp"><div class="pjs-h">Inspections</div>' + insp.map(function (x) { return '<div><span class="ms">event_available</span><b>' + esc(x.kind || 'Inspection') + '</b><span>' + pretty(x.date) + (x.result ? ' · ' + esc(x.result) : '') + '</span></div>'; }).join('') + '</div>' : '')
            + (p.notes ? '<p class="cs-notes">' + esc(p.notes) + '</p>' : '') + '</div>';
        }).join('') + '</div>' : none('assignment', 'No permits on this job', 'Permit numbers and inspection dates show up here once the office adds them.');
    }
    /* photos, docs, blueprints: view, and add (no edits, no deletes) */
    var list = j[t] || [], what = t === 'photos' ? 'photos' : t === 'docs' ? 'documents' : 'blueprints';
    var add = '<label class="ca-add"><span class="ms">' + (t === 'photos' ? 'add_a_photo' : 'upload_file') + '</span>Add ' + what
      + '<input type="file" hidden multiple ' + (t === 'photos' ? 'accept="image/*"' : t === 'blueprints' ? 'accept="image/*,application/pdf"' : '') + ' onchange="bpCrewAdd(this)"></label><div class="ca-msg" id="ca-fmsg"></div>';
    return sec('', add + (list.length ? (t === 'photos'
        ? '<div class="ca-grid">' + list.map(function (p, i) { return '<a class="ca-ph" data-ref="' + esc(p) + '" target="_blank" rel="noopener"><img alt="Photo ' + (i + 1) + '"></a>'; }).join('') + '</div>'
        : '<div class="ca-files">' + list.map(function (f) { return '<a class="ca-file" data-ref="' + esc(f.d || '') + '" target="_blank" rel="noopener"><span class="ms">' + (t === 'docs' ? 'description' : 'architecture') + '</span><b>' + esc(f.n || 'File') + '</b>' + (f.t ? '<small>' + pretty(f.t) + (f.by ? ' · ' + esc(f.by) : '') + '</small>' : '') + '</a>'; }).join('') + '</div>')
      : '<div class="bpx-mut" style="margin-top:12px">No ' + what + ' yet.</div>'));
  }
  function counts(j) {
    return { photos: (j.photos || []).length, docs: (j.docs || []).length, blueprints: (j.blueprints || []).length, permits: (j.permits || []).length, materials: (j.materials || []).length };
  }
  function sheet() {
    var j = curJob(); if (!j) { C.job = null; return; }
    var n = counts(j);
    bpModal(hero(j)
      + '<nav class="pjs-tabs" role="tablist" aria-label="Project sections">' + TABS.map(function (t) {
          return '<button type="button" class="bpx-jt pjs-tab' + (C.tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (C.tab === t[0]) + '" data-cs-tab="' + t[0] + '" onclick="bpCrewJobTab(\'' + t[0] + '\')">'
            + '<span class="ms">' + t[2] + '</span><span class="pjs-tl">' + t[1] + '</span><span class="pjs-n">' + (n[t[0]] || '') + '</span></button>';
        }).join('') + '</nav>'
      + '<div class="pjs-body" id="cs-body"></div>');
    var m = $('bpx-modal'); if (!m) return;
    m.classList.add('pjs', 'cs-sheet');
    var card = m.querySelector('.bpx-modalcard'); card.classList.add('pjs-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'pjs-title');
    body();
  }
  function body() {
    var j = curJob(), b = $('cs-body'); if (!j || !b) return;
    b.innerHTML = '<div data-pj-pane="' + C.tab + '" role="tabpanel">' + pane(j, C.tab) + '</div>';
    b.scrollTop = 0;
    AV.fill(b);
    /* files in storage are private: fetch a short-lived link for each */
    b.querySelectorAll('[data-ref]').forEach(function (a) {
      var ref = a.getAttribute('data-ref'); if (!ref) return;
      var put = function (u) { if (!u) return; a.href = u; var im = a.querySelector('img'); if (im) im.src = u; };
      if (window.bpPF && bpPF.isRef(ref)) bpPF.url(ref).then(put); else put(ref);
    });
  }
  window.bpCrewJobTab = function (t) {
    C.tab = t;
    document.querySelectorAll('.cs-sheet [data-cs-tab]').forEach(function (x) { var on = x.getAttribute('data-cs-tab') === t; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); if (on && x.scrollIntoView) x.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    body();
  };
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
      body();
      var j = curJob(); if (j) { var n = counts(j); document.querySelectorAll('.cs-sheet [data-cs-tab]').forEach(function (x) { var c = x.querySelector('.pjs-n'); if (c) c.textContent = n[x.getAttribute('data-cs-tab')] || ''; }); }
      var mm = $('ca-fmsg'); if (mm) { mm.className = 'ca-msg ' + (done ? 'ok' : 'bad'); mm.textContent = done ? done + ' added.' : 'Nothing was added. Files must be under 25 MB.'; }
    }).catch(function () { var mm = $('ca-fmsg'); if (mm) { mm.className = 'ca-msg bad'; mm.textContent = 'Upload failed. Try again.'; } });
  };

  /* ------------------------------------------------------------- ID --- */
  window.bpCrewId = function () {
    stopTick(); wait();
    load(true).then(function () {
      if (unlinked()) return;
      var e = C.me.employee, c = C.me.crew, b = C.me.business || {};
      var code = String(e.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
      area().innerHTML = '<div class="ca-wrap"><div class="ca-badge" style="--crew:' + esc((c && c.color) || '#2f6bff') + '">'
        + '<div class="ca-bt">' + (b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : '<span class="ms">storefront</span>') + '<b>' + esc(b.name || 'BuilderPro') + '</b></div>'
        + '<button type="button" class="ca-bav" onclick="bpCrewPhoto()" aria-label="Change your photo">' + AV.html(e.photo, e.name, 'ca-bavi') + '<span class="ca-bcam"><span class="ms">photo_camera</span></span></button>'
        + '<div class="ca-bn">' + esc(e.name) + '</div><div class="ca-br">' + esc(e.trade || 'Crew') + '</div>'
        + (c ? '<div class="ca-bc"><i></i>' + esc(c.name) + '</div>' : '')
        + '<div class="ca-bf"><div><span>ID</span><b>' + code + '</b></div><div><span>Since</span><b>' + (e.since ? new Date(e.since).toLocaleDateString([], { month: 'short', year: 'numeric' }) : '—') + '</b></div>'
          + '<div><span>Status</span><b>' + (C.me.open ? '<i class="ca-live"></i>On the clock' : 'Off the clock') + '</b></div></div>'
        + '</div>'
        + '<div class="ca-phacts"><button class="pm-btn" onclick="bpCrewPhoto()"><span class="ms">photo_camera</span>' + (e.photo ? 'Change photo' : 'Add a photo') + '</button>'
          + (e.photo ? '<button class="pm-btn ghost" onclick="bpCrewPhotoRemove()"><span class="ms">delete</span>Remove</button>' : '') + '</div><div class="ca-msg" id="ca-phmsg" style="text-align:center"></div>'
        + '<div class="bpx-panel ca-idinfo">' + (e.phone ? '<div><span>Phone</span><b>' + esc(e.phone) + '</b></div>' : '') + (e.email ? '<div><span>Email</span><b>' + esc(e.email) + '</b></div>' : '')
          + '<div><span>Employer</span><b>' + esc(b.name || '') + (b.phone ? ' · ' + esc(b.phone) : '') + '</b></div></div>'
        + recordHtml(e, C.me.stats, C.me.reviews) + '</div>';
      AV.fill(area());
    }).catch(fail);
  };
  /* My record: jobs completed, what customers said (first names only),
     experience. No money: crew_me() leaves job value out. */
  function starsHtml(r, sz) {
    if (window.bpStars) return bpStars(r, sz);
    var h = ''; for (var i = 1; i <= 5; i++) h += '<span class="rv-st' + (r >= i - .25 ? ' on' : '') + '">\u2605</span>'; return '<span class="rv-stars">' + h + '</span>';
  }
  function recordHtml(e, st, revs) {
    st = st || {}; revs = Array.isArray(revs) ? revs : [];
    var yr = new Date().getFullYear(), exp = +e.startedTradeYear ? Math.max(0, yr - (+e.startedTradeYear)) : null;
    var hired = e.hiredOn || e.since, hd = hired ? new Date(String(hired).length <= 10 ? hired + 'T12:00:00' : hired) : null;
    var mo = hd && !isNaN(hd) ? Math.max(0, Math.round((Date.now() - hd.getTime()) / (30.44 * 864e5))) : null;
    var ten = mo == null ? '—' : mo < 12 ? (mo <= 1 ? 'New' : mo + ' mo') : Math.floor(mo / 12) + ' yr' + (Math.floor(mo / 12) === 1 ? '' : 's');
    var n = +st.reviews || 0, avg = +st.rating || 0, skills = Array.isArray(e.skills) ? e.skills.filter(Boolean) : [];
    return '<div class="bpx-panel ca-rec"><div class="ca-recp"><h4>My record</h4><button class="bpx-rowbtn" onclick="bpCrewProfileEdit()"><span class="ms" style="font-size:15px;vertical-align:-3px">edit</span> About me</button></div>'
      + '<div class="ca-rech">' + (n ? '<b>' + avg.toFixed(1) + '</b>' + starsHtml(avg, 20) + '<span class="bpx-mut" style="font-size:13px">' + n + ' review' + (n === 1 ? '' : 's') + '</span>'
          : '<span class="bpx-mut" style="font-size:13.5px">No customer ratings yet. They show up here after a job is finished.</span>') + '</div>'
      + '<div class="ca-recg"><div><b>' + (+st.jobsDone || 0) + '</b><span>jobs completed</span></div>'
        + '<div><b>' + (exp == null ? '—' : exp) + '</b><span>' + (exp == null ? 'years experience' : 'yr' + (exp === 1 ? '' : 's') + ' experience') + '</span></div>'
        + '<div><b>' + ten + '</b><span>with ' + esc((C.me.business && C.me.business.name) || 'the company') + '</span></div></div>'
      + (e.bio ? '<p class="rv-bio" style="margin:12px 0 0">' + esc(e.bio) + '</p>' : '')
      + (skills.length ? '<div class="rv-chips" style="margin-top:10px">' + skills.map(function (k) { return '<span>' + esc(k) + '</span>'; }).join('') + '</div>' : '')
      + (e.certifications ? '<div class="rv-cert" style="margin-top:6px"><span class="ms">workspace_premium</span>' + esc(e.certifications) + '</div>' : '')
      + (revs.length ? '<div class="ca-recs">' + revs.slice(0, 6).map(function (r) {
          return '<div class="rv-rev"><div class="rv-revh">' + starsHtml(+r.rating || 0, 13) + '<b>' + esc(r.customer || 'Customer') + '</b><em>' + pretty(r.at) + '</em></div>'
            + (r.comment ? '<p>' + esc(r.comment) + '</p>' : '') + '</div>';
        }).join('') + '</div>' : '')
      + '</div>';
  }
  window.bpCrewProfileEdit = function () {
    var e = C.me && C.me.employee; if (!e) return;
    bpModal('<h3>About me</h3><div class="bpx-sub">Your boss sees this on your profile. Your experience and start date are set by the office.</div>'
      + '<label>A line about you</label><textarea id="ca-bio" rows="3" maxlength="600" placeholder="e.g. Ten years on steep roofs, love a clean job site.">' + esc(e.bio || '') + '</textarea>'
      + '<label>Skills <span class="bpx-mut" style="font-weight:400">(comma separated)</span></label><input id="ca-skills" placeholder="Shingle, Flat roof, Gutters" value="' + esc((e.skills || []).join(', ')) + '">'
      + '<div class="ca-msg" id="ca-pmsg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" id="ca-pgo" onclick="bpCrewProfileSave()">Save</button></div>');
  };
  window.bpCrewProfileSave = function () {
    var bio = (($('ca-bio') || {}).value || '').trim(), sk = (($('ca-skills') || {}).value || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var go = $('ca-pgo'); if (go) { go.disabled = true; go.textContent = 'Saving…'; }
    Promise.resolve(BP_SB.rpc('crew_set_profile', { p_bio: bio, p_skills: sk })).then(function (r) {
      if (r && r.error) throw r.error; if (!r || !r.data) throw new Error('not saved');
      bpCloseModal(); bpCrewId();
    }).catch(function () { if (go) { go.disabled = false; go.textContent = 'Save'; } var m = $('ca-pmsg'); if (m) { m.className = 'ca-msg bad'; m.textContent = 'Couldn’t save. Try again.'; } });
  };
  function phMsg(t, cls) { var m = $('ca-phmsg'); if (m) { m.className = 'ca-msg ' + (cls || ''); m.textContent = t; } }
  function setPhoto(ref) {
    return Promise.resolve(BP_SB.rpc('crew_set_photo', { p_url: ref || null })).then(function (r) {
      if (r && r.error) throw r.error;
      if (!r || !r.data) throw new Error('not saved');
    });
  }
  window.bpCrewPhoto = function () {
    var e = C.me && C.me.employee; if (!e) return;
    AV.pick('Your ID photo').then(function (blob) {
      if (!blob) return;
      phMsg('Saving your photo…');
      var owner = e.owner || (window.bpOwnerId && bpOwnerId());
      return AV.upload(owner, e.id, blob).then(function (ref) { return setPhoto(ref); })
        .then(function () { return load(true); }).then(function () { bpCrewId(); setTimeout(function () { phMsg('Photo saved. Your boss sees it too.', 'ok'); }, 300); });
    }).catch(function () { phMsg('Couldn’t save the photo. Try again.', 'bad'); });
  };
  window.bpCrewPhotoRemove = function () {
    var e = C.me && C.me.employee; if (!e || !confirm('Remove your photo?')) return;
    setPhoto(null).then(function () {
      var p = String(e.photo || ''); if (p.indexOf('sb:') === 0) BP_SB.storage.from('project-files').remove([p.slice(3).split('#')[0]]).catch(function () {});
      return load(true);
    }).then(function () { bpCrewId(); }).catch(function () { phMsg('Couldn’t remove it. Try again.', 'bad'); });
  };

  /* ------------------------------------------ owner: who's on the clock --- */
  window.bpClockNowFill = function () {
    var el = $('bpClockNow'); if (!el || !window.BP_SB) return;
    Promise.resolve(BP_SB.from('time_clock').select('user_id,employee_id,kind,at,job_name,on_site,distance_m').order('at', { ascending: false }).limit(300)).then(function (r) {
      var rows = (r && r.data) || [], last = {};
      rows.forEach(function (x) { if (!last[x.user_id]) last[x.user_id] = x; });
      var on = Object.keys(last).map(function (k) { return last[k]; }).filter(function (x) { return x.kind === 'in'; });
      var emp = function (x) { return window.bpEmpById && bpEmpById(x.employee_id); };
      el.innerHTML = '<div class="ca-now"><b><span class="ms">schedule</span>On the clock now</b>' + (on.length ? on.map(function (x) {
        var e = emp(x);
        return '<div>' + AV.html(e && e.photo_url, e ? e.name : '?', 'ca-nav') + '<b>' + esc(e ? e.name : 'Crew member') + '</b><span>' + esc(x.job_name || 'no job') + ' · since ' + clock(x.at) + ' · ' + hm(Date.now() - Date.parse(x.at)) + '</span>'
          + (x.on_site === true ? '<em class="ok">on site</em>' : x.on_site === false ? '<em class="warn">' + (x.distance_m > 1609 ? (x.distance_m / 1609).toFixed(1) + ' mi' : Math.round(x.distance_m || 0) + ' m') + ' away</em>' : '') + '</div>';
      }).join('') : '<div class="bpx-mut">Nobody right now. Crew clock in from their own login.</div>') + '</div>';
      AV.fill(el);
    });
  };
})();
