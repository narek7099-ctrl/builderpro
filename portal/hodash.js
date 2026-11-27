/* ==================================================================
   The homeowner's Home (#my, app.html bpMyEnter / bpHoDraw), 2026-11-27.

   What a homeowner wants when they open the app, top to bottom:
     at a glance   active projects, the next crew visit, what's left to pay
     quick actions Message, Payments, Photos, Find a pro (like the
                   contractor's phone Home: four round buttons)
     up next       booked visits across their projects, else what's
                   being worked on now and when it should finish
     latest photos the newest progress photos from every project
     home care     three seasonal jobs for the house, each one tap from
                   Find a pro (the month decides which)
   The project cards themselves (bpHoProj) get a cover photo and their own
   Message / Photos / Pay buttons.
   A project page opens on a tab with #home=<token>&tab=<tab> (bpHpLoad).
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var escA = function (s) { return window.bpHpEscA ? bpHpEscA(s) : esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var $ = function (id) { return document.getElementById(id); };
  var usd = function (n) { return window.bpHoUsd ? bpHoUsd(n) : '$' + Math.round(+n || 0).toLocaleString('en-US'); };
  var today = function () { return window.bpHoToday ? bpHoToday() : new Date().toISOString().slice(0, 10); };
  var day = function (iso, o) { return window.bpHpDay ? bpHpDay(iso, o) : iso; };
  var go = function (tok, tab) { return "bpGo('#home=" + escA(tok) + (tab ? '&tab=' + tab : '') + "')"; };

  function active(live) { return live.filter(function (x) { return (x.d.job || {}).status !== 'done'; }); }
  /* every booked day from today on, across projects, soonest first */
  function visits(live) {
    var t = today(), out = [];
    live.forEach(function (x) {
      var j = x.d.job || {};
      (j.schedule || []).forEach(function (v) { if (v.date >= t) out.push({ x: x, date: v.date, time: v.time || '' }); });
      if (!(j.schedule || []).length && j.next_visit && j.next_visit >= t) out.push({ x: x, date: j.next_visit, time: j.time || '' });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time < b.time ? -1 : 1); });
  }
  function t12(t) { var m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return t || ''; var h = +m[1]; return ((h % 12) || 12) + (m[2] !== '00' ? ':' + m[2] : '') + (h < 12 ? ' AM' : ' PM'); }
  function dueOf(d) { var s = ((d.plan || {}).steps || []).filter(function (x) { return x.state === 'due'; })[0]; return s ? Math.max(0, (+s.amount || 0) - (+s.paid || 0)) : 0; }

  /* ------------------------------------------------- at a glance --- */
  window.bpHoGlance = function (live) {
    var el = $('hoGlance'); if (!el) return;
    var act = active(live);
    if (!live.length) { el.innerHTML = ''; return; }
    var v = visits(act)[0];
    var left = act.reduce(function (t, x) { return t + Math.max(0, +((x.d.money || {}).due) || 0); }, 0);
    var due = act.reduce(function (t, x) { return t + dueOf(x.d); }, 0);
    var tile = function (ic, k, val, sub, on, cls) {
      return '<button type="button" class="hd-g' + (cls ? ' ' + cls : '') + '"' + (on ? ' onclick="' + on + '"' : ' disabled') + '><span class="hd-g-ic"><span class=ms>' + ic + '</span></span>'
        + '<small>' + k + '</small><b>' + val + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</button>';
    };
    el.innerHTML = '<div class="hd-glance">'
      + tile('construction', 'In progress', String(act.length), act.length === 1 ? esc((act[0].d.job || {}).title || 'Project') : act.length ? 'projects' : 'All done', act.length ? go(act[0].token) : '')
      + tile('event', 'Next visit', v ? esc(day(v.date, { month: 'short', day: 'numeric' })) : 'None yet', v ? esc(day(v.date, { weekday: 'long' })) + (v.time ? ' · ' + t12(v.time) : '') : 'Not booked', v ? go(v.x.token, 'sched') : (act[0] ? go(act[0].token, 'sched') : ''))
      + tile('account_balance_wallet', due > 0 ? 'Due now' : 'Left to pay', due > 0 ? usd(due) : left > 0 ? usd(left) : 'Paid up', due > 0 ? 'Tap to pay' : left > 0 ? 'over the project' : 'Nothing owed', act[0] ? go((act.filter(function (x) { return dueOf(x.d) > 0; })[0] || act[0]).token, 'pay') : '', due > 0 ? 'due' : '')
      + '</div>';
  };

  /* ------------------------------------------------ quick actions --- */
  window.bpHoActions = function (live) {
    var el = $('hoActs'); if (!el) return;
    var act = active(live), x = act[0] || live[0];
    var btn = function (ic, label, on, cls) { return '<button type="button" class="hd-act' + (cls ? ' ' + cls : '') + '" onclick="' + on + '"><span class="hd-act-c"><span class=ms>' + ic + '</span></span><span class="hd-act-l">' + label + '</span></button>'; };
    el.innerHTML = '<div class="hd-acts">'
      + (x ? btn('chat', 'Message', go(x.token, 'msgs'), 'pri') + btn('payments', 'Payments', go(x.token, 'pay')) + btn('photo_library', 'Photos', go(x.token, 'photos')) : '')
      + btn('person_search', 'Find a pro', "bpGo('#pros')")
      + '</div>';
  };

  /* ------------------------------------------------------ up next --- */
  window.bpHoNext = function (live) {
    var el = $('hoNext'); if (!el) return;
    var act = active(live);
    if (!act.length) { el.innerHTML = ''; return; }
    var vs = visits(act).slice(0, 3), rows = '';
    if (vs.length) {
      rows = vs.map(function (v) {
        var d = new Date(v.date + 'T12:00:00'), j = v.x.d.job || {}, crew = ((v.x.d.crew || [])[0] || {}).name;
        return '<button type="button" class="hd-up" onclick="' + go(v.x.token, 'sched') + '"><span class="hd-date"><small>' + d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() + '</small><b>' + d.getDate() + '</b></span>'
          + '<div><b>' + esc(d.toLocaleDateString('en-US', { weekday: 'long' })) + (v.time ? ', ' + t12(v.time) : '') + '</b><span>' + esc([crew ? crew + ' and the crew' : 'Crew visit', j.title].filter(Boolean).join(' · ')) + '</span></div><span class="ms hd-chev">chevron_right</span></button>';
      }).join('');
    } else {
      rows = act.map(function (x) {
        var j = x.d.job || {}, now = (j.phases || []).filter(function (p) { return !p.done; })[0];
        return '<button type="button" class="hd-up" onclick="' + go(x.token, 'sched') + '"><span class="hd-date ic"><span class=ms>construction</span></span>'
          + '<div><b>' + (now ? 'Now: ' + esc(now.name) : 'Getting started') + '</b><span>' + esc([j.title, now && now.due ? (now.due < today() ? 'was due ' : 'finishes ') + day(now.due, { weekday: 'short', month: 'short', day: 'numeric' }) : ''].filter(Boolean).join(' · ')) + '</span></div><span class="ms hd-chev">chevron_right</span></button>';
      }).join('') + '<p class="hd-fine">No crew visits are booked yet. They show up here as soon as your contractor schedules them.</p>';
    }
    el.innerHTML = window.bpHoSec ? bpHoSec('Up next', '<div class="ho-card hd-next">' + rows + '</div>') : '';
  };

  /* ------------------------------------------------ latest photos --- */
  window.bpHoPhotos = function (live) {
    var el = $('hoPhotos'); if (!el) return;
    var ph = [];
    active(live).concat(live.filter(function (x) { return (x.d.job || {}).status === 'done'; })).forEach(function (x) {
      (x.d.photos || []).slice().reverse().slice(0, 6).forEach(function (p) { ph.push({ x: x, url: p.url }); });
    });
    if (!ph.length) { el.innerHTML = ''; return; }
    el.innerHTML = bpHoSec('Latest photos', '<div class="hd-photos">' + ph.slice(0, 10).map(function (p) {
      return '<button type="button" onclick="' + go(p.x.token, 'photos') + '" aria-label="Photos of ' + escA((p.x.d.job || {}).title || 'your project') + '"><img src="' + escA(p.url) + '" alt="" loading="lazy"></button>';
    }).join('') + '</div>');
  };

  /* -------------------------------------------- home care, by season --- */
  var CARE = {
    winter: [['roofing', 'Watch for ice dams and roof leaks', 'Stains on the ceiling or icicles along the edge mean water is backing up.', 'Roofing'],
      ['plumbing', 'Keep pipes from freezing', 'Let faucets drip on the coldest nights and insulate pipes in the garage or crawl space.', 'Plumbing'],
      ['mode_fan', 'Change the furnace filter', 'Every 1 to 3 months keeps the heat running clean and cheaper.', 'HVAC']],
    spring: [['roofing', 'Look over the roof after winter', 'Missing or curled shingles are easiest to fix before the spring rains.', 'Roofing'],
      ['mode_fan', 'Service the AC before summer', 'A tune-up now beats a breakdown on the first hot day.', 'HVAC'],
      ['water_drop', 'Clean gutters and downspouts', 'Clogged gutters send water into the walls and foundation.', 'Gutters']],
    summer: [['deck', 'Check the deck and fence', 'Tighten loose boards and reseal wood before it dries out and cracks.', 'Decks'],
      ['mode_fan', 'Change the AC filter', 'A clean filter cools faster and lowers the power bill.', 'HVAC'],
      ['format_paint', 'Look for peeling paint outside', 'Touching it up now protects the siding from rot.', 'Painting']],
    fall: [['water_drop', 'Clean gutters after the leaves fall', 'Full gutters freeze, overflow and pull away from the house.', 'Gutters'],
      ['mode_fan', 'Furnace tune-up before winter', 'Have it checked before you need it every night.', 'HVAC'],
      ['window', 'Seal drafty windows and doors', 'New caulk and weatherstripping keep the heat in.', 'Windows & doors']]
  };
  function season() { var m = new Date().getMonth(); return m === 11 || m < 2 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'fall'; }
  window.bpHoCare = function (live) {
    var el = $('hoCare'); if (!el) return;
    var a = String((live[0] && live[0].d.job && live[0].d.job.addr) || ''), z = /\b(\d{5})(?:-\d{4})?\s*$/.exec(a), c = /([^,]+),\s*([A-Za-z]{2})\b/.exec(a);
    var loc = z ? z[1] : c ? c[1].trim() + ', ' + c[2].toUpperCase() : '';
    var s = season(), name = { winter: 'this winter', spring: 'this spring', summer: 'this summer', fall: 'this fall' }[s];
    el.innerHTML = bpHoSec('Home care ' + name, '<div class="ho-card hd-care">' + CARE[s].map(function (t) {
      return '<div class="hd-tip"><span class="hd-tip-ic"><span class=ms>' + t[0] + '</span></span><div><b>' + esc(t[1]) + '</b><span>' + esc(t[2]) + '</span></div>'
        + '<button type="button" class="hd-tip-go" onclick="bpGo(\'#pros?q=' + encodeURIComponent(t[3]) + (loc ? '&loc=' + encodeURIComponent(loc) : '') + '\')">Find a pro</button></div>';
    }).join('') + '</div>');
  };
})();
