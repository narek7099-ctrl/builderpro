/* ==================================================================
   Project schedules -> the HighLevel Jobs calendar.

   Every day booked on an active project is one appointment on the Jobs
   calendar in HighLevel, at that day's time (the day's own slot, else the
   project's time, else 8:00-4:00). Wherever the dates change (the project
   sheet, the schedule board, dragging on the Calendar) the save goes
   through bpJobsSet, so that is the one place this listens: a short while
   after any save it compares each project's days with what it already put
   in HighLevel and creates, moves or cancels to match.

   What it put there is remembered on the project, j.sched.ghl =
   { 'YYYY-MM-DD': { id, sig } }, so the Calendar page can leave those out
   of the HighLevel list (it already draws project days itself) and nothing
   is booked twice. Customers are not texted: the calendar function books
   these with notifications off. Crew and subs never sync; example
   projects never sync.
   ================================================================== */
(function () {
  'use strict';
  var live = function () { return !!(window.BP_LIVE && window.BP_SB && window.GHL_CAL_URL); };
  var post = function (url, body) {
    return fetch(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + window.BP_ANON, 'apikey': window.BP_ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  };
  var cal = function (b) { b.cal = 'jobs'; b.ignoreValidation = true; return post(window.GHL_CAL_URL, b); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var mins = function (t) { var p = String(t || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
  var hhmm = function (m) { m = Math.max(0, Math.min(1439, m)); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  function offset(d, t) {
    try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'longOffset' }).formatToParts(new Date(d + 'T' + t + ':00')).find(function (x) { return x.type === 'timeZoneName'; }).value.replace('GMT', '') || '-08:00'; }
    catch (e) { return '-08:00'; }
  }
  var iso = function (d, t) { return d + 'T' + t + ':00' + offset(d, t); };

  /* the day's appointment, as BuilderPro sees it */
  function want(j, d) {
    var s = j.sched || {}, sl = (s.slots && s.slots[d]) || null;
    var t = (sl && sl.t) || s.time || '08:00', from = mins(t), to;
    if (sl && sl.t) to = from + (+sl.dur || 120);
    else if (s.time && s.end) to = mins(s.end);
    else to = from + (+s.dur || 480);
    if (!(to > from)) to = from + 60;
    var title = (j.title || 'Job') + ' · ' + (j.name || 'Customer');
    return { start: iso(d, hhmm(from)), end: iso(d, hhmm(to)), title: title, address: j.addr || '' };
  }
  var sigOf = function (w) { return w.start + '|' + w.end + '|' + w.title + '|' + w.address; };

  /* the HighLevel contact for a project: the one it already has, else a match by phone/email/name, else a new one */
  async function contactFor(j) {
    if (j.contactId) return j.contactId;
    try { if (window.bpEnsureContacts) await window.bpEnsureContacts(); } catch (e) {}
    var all = window._bpContacts || [], digits = function (s) { return String(s || '').replace(/\D/g, '').slice(-10); };
    var m = all.filter(function (c) {
      return (j.phone && digits(c.phone) && digits(c.phone) === digits(j.phone))
        || (j.email && c.email && String(c.email).toLowerCase() === String(j.email).toLowerCase());
    })[0] || all.filter(function (c) { return j.name && c.name && String(c.name).trim().toLowerCase() === String(j.name).trim().toLowerCase(); })[0];
    if (m && m.id) return m.id;
    if (!window.GHL_CONTACTS_URL) return '';
    var r = await post(window.GHL_CONTACTS_URL, { action: 'create', name: j.name || 'Customer', phone: j.phone || '', email: j.email || '' }).catch(function () { return null; });
    return (r && ((r.contact && r.contact.id) || r.id || (r.data && r.data.contact && r.data.contact.id))) || '';
  }

  var timer = null, running = false, again = false, seen = {};
  window.bpGhlSchedSync = function (now) {
    if (!live() || (window.bpTeamIsCrew && bpTeamIsCrew())) return;
    clearTimeout(timer); timer = setTimeout(run, now ? 0 : 2500);
  };
  /* appointments that are project days, so the Calendar can skip them */
  window.bpGhlSyncedIds = function () {
    var ids = {};
    (window.bpJobsGet ? bpJobsGet() : []).forEach(function (j) { var g = j.sched && j.sched.ghl; if (g) Object.keys(g).forEach(function (d) { if (g[d] && g[d].id) ids[g[d].id] = 1; }); });
    Object.keys(seen).forEach(function (jid) { Object.keys(seen[jid] || {}).forEach(function (d) { var x = seen[jid][d]; if (x && x.id) ids[x.id] = 1; }); });
    return ids;
  };

  async function run() {
    if (running) { again = true; return; }
    running = true;
    try {
      var jobs = bpJobsGet(), byId = {}, changed = false, fail = 0;
      jobs.forEach(function (j) { byId[j.id] = j; });
      /* a project deleted this session takes its appointments with it */
      for (var gone in seen) {
        if (byId[gone]) continue;
        for (var d0 in seen[gone]) { var r0 = await cal({ action: 'delete', id: seen[gone][d0].id }).catch(function () { return null; }); if (!r0 || !r0.ok) fail++; }
        delete seen[gone];
      }
      for (var i = 0; i < jobs.length; i++) {
        var j = jobs[i]; if (!j || j.sample) continue;
        var s = j.sched || {}, have = s.ghl || {}, days = j.status === 'active' ? (s.dates || []) : [];
        /* a finished project keeps its past appointments; only days still ahead are cancelled */
        var today = new Date().toISOString().slice(0, 10);
        var drop = Object.keys(have).filter(function (d) { return days.indexOf(d) < 0 && (j.status === 'active' || d >= today); });
        var add = days.filter(function (d) { return !have[d]; });
        var move = days.filter(function (d) { return have[d] && have[d].sig !== sigOf(want(j, d)); });
        if (!drop.length && !add.length && !move.length) { if (Object.keys(have).length) seen[j.id] = have; continue; }
        var next = Object.assign({}, have), cid = add.length ? await contactFor(j) : '';
        if (cid && !j.contactId) { j.contactId = cid; changed = true; }
        for (var a = 0; a < drop.length; a++) {
          var rd = await cal({ action: 'delete', id: have[drop[a]].id }).catch(function () { return null; });
          if (rd && rd.ok) delete next[drop[a]]; else fail++;
        }
        for (var b = 0; b < move.length; b++) {
          var w = want(j, move[b]);
          var rm = await cal({ action: 'update', id: have[move[b]].id, startTime: w.start, endTime: w.end, title: w.title, address: w.address }).catch(function () { return null; });
          if (rm && rm.ok) next[move[b]] = { id: have[move[b]].id, sig: sigOf(w) };
          else if (rm && rm.status === 404) delete next[move[b]];   /* removed in HighLevel: book it again next pass */
          else fail++;
        }
        for (var c = 0; c < add.length && cid; c++) {
          var wa = want(j, add[c]);
          var rc = await cal({ action: 'create', contactId: cid, startTime: wa.start, endTime: wa.end, title: wa.title, address: wa.address }).catch(function () { return null; });
          if (rc && rc.ok && rc.id) next[add[c]] = { id: rc.id, sig: sigOf(wa) }; else fail++;
        }
        if (add.length && !cid) fail += add.length;
        j.sched = Object.assign({}, s, { ghl: next }); changed = true;
        seen[j.id] = next;
      }
      if (changed) {
        /* write back onto the newest copy, so an edit made meanwhile is not lost */
        var fresh = bpJobsGet();
        fresh.forEach(function (f) { var o = byId[f.id]; if (!o) return; if (o.contactId && !f.contactId) f.contactId = o.contactId; if (o.sched && o.sched.ghl) { f.sched = f.sched || {}; f.sched.ghl = o.sched.ghl; } });
        _set(fresh);
      }
      if (fail && window.bpToast) bpToast('Some project days could not be put on the HighLevel Jobs calendar. They will be tried again on the next save.', 'warning');
    } catch (e) { /* the next save tries again */ }
    running = false;
    if (again) { again = false; window.bpGhlSchedSync(); }
  }

  /* listen on the one place projects are saved */
  var _set = window.bpJobsSet;
  if (typeof _set === 'function') {
    window.bpJobsSet = function (a) { var r = _set.apply(this, arguments); window.bpGhlSchedSync(); return r; };
  }
})();
