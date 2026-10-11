/* ==================================================================
   Product tour: shows a new login where things are and what to click.

   It walks the real app, not screenshots. Each stop opens its page, finds
   the actual button to press, scrolls it into view, rings it, and a hand
   taps it while the card says what it does and what to do ("Do this:").
   If the button is not on the page (an empty account, a narrow screen),
   the stop falls back to the sidebar item, then to a card in the middle.

   Three tracks: the owner or office (only the pages their plan opens),
   crew, and subcontractors. The user steps through at their own pace with
   Next and Back, the arrow keys, or Esc to leave.

   One time only. The first sign-in after this ships opens a welcome card:
   "Show me around" or "Skip for now". Either answer, finishing, or closing
   the tour marks it done for that login (Supabase user_metadata, so it
   follows them to every device, plus localStorage as a fast path).
   Help (?) -> "Take the tour" replays it whenever they like.
   bpTour() starts it, bpTour.welcome() shows the welcome card.
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var KEY = 'bp_tour_v2';                 /* user_metadata key, and the localStorage prefix */
  var $ = function (s, r) { try { return (r || document).querySelector(s); } catch (e) { return null; } };
  var nth = function (sel, i) { return function () { var a = document.querySelectorAll(sel); return a[i] || null; }; };

  /* { v: page, at: what to point at (selector, list of selectors, or function),
       nav: sidebar item to fall back to, t: title, d: what it is, act: what to do } */
  var OWNER = [
    { v: 'dashboard', at: ['#bpxViewArea .bpx-rowbtn.primary[onclick*="settings"]', '#bpxViewArea .db-acts .bpx-btn'], nav: 'dashboard', t: 'Your dashboard',
      d: 'Money in, what you kept, new leads and what needs you today. Open it first thing each morning.',
      act: 'Click Do it to finish setting up: your logo, business details and hours.' },
    { v: 'contacts', at: 'button[onclick="bpOpenAdd()"]', nav: 'leads', t: 'Every customer in one list',
      d: 'Calls, web forms, Angi, Thumbtack and your booking page all land here.',
      act: 'Click + New contact to add a customer. Click any name to open their file.' },
    { v: 'messaging', at: ['#bpxViewArea .bpx-rowbtn[onclick*="settings"]', 'button[onclick="bpBulkOpen()"]'], nav: 'convos', t: 'Texts and email',
      d: 'Every conversation with every customer in one inbox. Lisa answers the calls you miss and texts them back.',
      act: 'Connect your business number with Set it up. Then pick a conversation on the left to reply.' },
    { v: 'calendar', at: 'button[onclick*="bpOpenBoo"]', nav: 'calendar', t: 'Calendar and booking',
      d: 'Inspections, estimates and jobs on one calendar. Customers can book themselves from your booking link.',
      act: 'Click Book inspection to put an appointment on the calendar.' },
    { v: 'estimates', at: 'button[onclick="bpEstOpen()"]', nav: 'finances', t: 'Estimates',
      d: 'Professional estimates with your materials, labor and markup. Customers accept online with one tap.',
      act: 'Click + New estimate to quote your first job.' },
    { v: 'invoices', at: ['#bpxViewArea .pjl-b.pri', 'button[onclick="bpInvOpen()"]'], nav: 'finances', t: 'Invoices',
      d: 'An accepted estimate turns into an invoice here, ready to send. Reminders go out until you are paid.',
      act: 'Click Confirm and send on a ready invoice, or + New invoice to start one.' },
    { v: 'payouts', at: 'button[onclick^="bpPayConnect"]', nav: 'finances', t: 'Get paid by card',
      d: 'Customers pay by card or bank right from the invoice, and the money goes to your bank account.',
      act: 'Click Connect with Stripe. You only do this once.' },
    { v: 'finances', at: ['button[onclick="bpFinAddOpen(\'expense\')"]', 'button[onclick="bpFinAddOpen(\'income\')"]'], nav: 'finances', t: 'Know your numbers',
      d: 'Income, costs and profit, by job and by month.',
      act: 'Click + Add expense to log a cost. Your profit updates by itself.' },
    { v: 'activejobs', at: 'button[onclick="bpAddJobOpen()"]', nav: 'projects', t: 'Projects',
      d: 'Each job has its own sheet: schedule, phases, crew, materials, permits, contract, photos and budget.',
      act: 'Click + Add job, or click a project to open its sheet.' },
    { v: 'employees', at: 'button[onclick="bpEmpOpen()"]', nav: 'projects', t: 'Crew and payroll',
      d: 'Your people, their pay rates, hours and pay periods. Crews get their own app to clock in and see their jobs.',
      act: 'Click + Add someone for each person on your crew.' },
    { v: 'matlists', at: null, nav: 'supply', t: 'Materials',
      d: 'Order lists for each job go to your suppliers, and receipts are matched back to the job.',
      act: 'Open a project and build its order list, or start from an estimate.' },
    { v: 'calculator', at: null, nav: 'leads', t: 'Instant-quote calculators',
      d: 'A price calculator for your trade on your website and social pages. Homeowners get a ballpark; you get the lead.',
      act: 'Pick a calculator, set your prices, then copy its link or embed code.' },
    { v: 'marketing', at: 'button[onclick="bpMkLaunch()"]', nav: 'marketing', t: 'Marketing and reviews',
      d: 'Ads, your website, social posts, competitors and your Google, Yelp and Facebook reviews.',
      act: 'Connect your accounts under Connections, then click Launch a campaign.' },
    { v: 'aiteam', at: nth('#bpxViewArea .ai-tab', 1), nav: 'aiteam', t: 'Your AI Team',
      d: 'An AI CEO reads the whole business every morning, with assistants for sales, marketing and the office. Nothing reaches a customer until you approve it.',
      act: 'Click AI CEO to read today\'s briefing or ask it a question.' },
    { v: 'settings', at: 'button[onclick="bpSetTab(\'team\')"]', nav: '', t: 'Bring in your team',
      d: 'Your office and crew each sign in with their own email and see only what their role allows.',
      act: 'Click Team and invite them by email.' }
  ];
  var CREW = [
    { v: 'crewclock', at: '#ca-go', nav: 'crewclock', t: 'Clock in',
      d: 'Your hours go straight to payroll, so clock in at every job.',
      act: 'Pick today\'s job above, then tap Clock in when you get there. Tap it again to clock out.' },
    { v: 'crewprojects', at: '#bpxViewArea .ca-proj', nav: 'crewprojects', t: 'Your jobs',
      d: 'Only the jobs you are on: address, schedule, notes and materials.',
      act: 'Tap a job to open it. Add photos and receipts from inside it.' },
    { v: 'crewhome', at: null, nav: 'crewhome', t: 'Your crew',
      d: 'Who you work with and who is on the clock right now.',
      act: 'Check here before the day starts.' },
    { v: 'crewid', at: '#bpxViewArea .pm-btn', nav: 'crewid', t: 'Your ID',
      d: 'Your photo and a short about-me. Customers see who is coming to their house.',
      act: 'Tap Add a photo, then About me.' },
    { v: 'crewmsgs', at: '#tcText', nav: 'crewmsgs', t: 'Messages',
      d: 'Talk to the office and your crew without giving out your number.',
      act: 'Type here and tap Send.' }
  ];
  var SUB = [
    { v: 'subjobs', at: '#bpxViewArea .sa-job', nav: 'subjobs', t: 'Your jobs',
      d: 'Only the jobs you were hired for: your scope, dates, site contact and documents.',
      act: 'Tap a job to open it.' },
    { v: 'subcomply', at: 'button[onclick="bpSubDocForm()"]', nav: 'subcomply', t: 'Compliance',
      d: 'Your insurance certificate, license and W-9. An expired certificate can hold up your payments.',
      act: 'Tap Upload and add your insurance certificate first.' },
    { v: 'subinvoices', at: 'button[onclick="bpSubInvForm()"]', nav: 'subinvoices', t: 'Invoices',
      d: 'Bill for your work here and watch it go from submitted to approved to paid.',
      act: 'Tap Submit invoice when your part of the job is done.' },
    { v: 'subchanges', at: 'button[onclick="bpSubCoForm()"]', nav: 'subchanges', t: 'Change orders',
      d: 'Extra work or a price change goes here, so it is agreed in writing before you do it.',
      act: 'Tap Request change and describe the extra work.' },
    { v: 'crewmsgs', at: '#tcText', nav: 'crewmsgs', t: 'Messages',
      d: 'Talk to the contractor who hired you.',
      act: 'Type here and tap Send.' }
  ];
  var FINISH = { v: '', at: '#hlTacts .hl-rb.b', nav: '', t: 'You are all set',
    d: 'That is the whole tour. Everything you saw is in the menu on the left.',
    act: 'Want to see it again? Click ? up here, then Take the tour.' };

  function role() { return window.bpTeamIsSub && bpTeamIsSub() ? 'sub' : window.bpTeamIsCrew && bpTeamIsCrew() ? 'crew' : 'owner'; }
  function stepsFor() {
    var r = role(), lk = function (v) { return !!(window.bpLocked && bpLocked(v)); };
    var ok = function (v) { return !v || !window.bpTeamAllows || bpTeamAllows(v); };
    var list = (r === 'sub' ? SUB : r === 'crew' ? CREW : OWNER).filter(function (s) { return !lk(s.v) && ok(s.v); });
    return list.concat([FINISH]);
  }

  /* ---------- where to point ---------- */
  function visible(el) { if (!el || !el.getClientRects().length) return false; var r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; }
  function find(at) {
    if (!at) return null;
    var list = Array.isArray(at) ? at : [at];
    for (var i = 0; i < list.length; i++) {
      var el = typeof list[i] === 'function' ? list[i]() : $(list[i]);
      if (visible(el)) return el;
    }
    return null;
  }
  function sideItem(sec) { if (!sec) return null; var el = $('#bpxNav [data-sec="' + sec + '"]'); return visible(el) ? el : null; }

  var T = { i: 0, el: null, steps: [], keys: null, poll: null, target: null, mode: '' };
  function host() { return document.getElementById('bpx') || document.body; }

  function shell(html) {
    var w = document.createElement('div'); w.className = 'bpt'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'Product tour');
    w.innerHTML = '<div class="bpt-shade"></div><div class="bpt-spot" aria-hidden="true"></div><div class="bpt-ring" aria-hidden="true"></div>'
      + '<div class="bpt-hand" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 11.2V5.5a1.6 1.6 0 0 1 3.2 0v5.2l.3-.1V9.4a1.6 1.6 0 0 1 3.2 0v1.8a1.6 1.6 0 0 1 3.1.6v4.7c0 3.2-2.6 5.7-5.8 5.7h-.6c-1.9 0-3.6-.9-4.7-2.4l-3-4.1a1.6 1.6 0 0 1 2.4-2.1l1.9 1.6z"/></svg><i></i></div>'
      + '<div class="bpt-card" tabindex="-1">' + html + '</div>';
    host().appendChild(w);
    return w;
  }

  /* ---------- the welcome card: show me around, or skip ---------- */
  window.bpTourWelcome = function () {
    if (T.el) close(false);
    var who = role(), name = '';
    try { name = String((window.bpSettingsGet && (bpSettingsGet().owner || {}).name) || '').split(' ')[0]; } catch (e) {}
    var what = who === 'crew' ? 'where to clock in, find your jobs and add photos'
      : who === 'sub' ? 'where your jobs, invoices and paperwork live'
      : 'where everything is and what to click first';
    T.el = shell('<div class="bpt-hero"><img src="assets/brand/logo-mark-128.png" alt="" width="34" height="34"></div>'
      + '<h3 class="bpt-h">Welcome to BuilderPro' + (name ? ', ' + esc(name) : '') + '</h3>'
      + '<p class="bpt-p">A quick tour shows you ' + what + '. It takes about two minutes, and you click through at your own pace.</p>'
      + '<div class="bpt-act bpt-act-w"><button type="button" class="bpt-b ghost" data-t="skip">Skip for now</button>'
      + '<button type="button" class="bpt-b pri" data-t="start"><span>Show me around</span><span class="ms">arrow_forward</span></button></div>'
      + '<p class="bpt-foot"><span class="ms">help</span><span>You can replay it any time: click <b>?</b> at the top right, then <b>Take the tour</b>.</span></p>');
    T.mode = 'welcome';
    var card = T.el.querySelector('.bpt-card'); card.classList.add('mid', 'welcome');
    T.el.classList.add('dim');
    T.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      if (b.getAttribute('data-t') === 'start') { close(false); window.bpTour(); }
      else { close(true); if (window.bpToast) bpToast('No problem. Click ? then Take the tour whenever you want it.'); }
    });
    keys(function (e) { if (e.key === 'Escape') { e.preventDefault(); close(true); } });
    setTimeout(function () { var s = T.el && T.el.querySelector('[data-t="start"]'); if (s) s.focus({ preventScroll: true }); }, 60);
  };

  /* ---------- the tour ---------- */
  window.bpTour = function () {
    if (T.el) close(false);
    T.steps = stepsFor(); T.i = 0; T.mode = 'tour';
    T.el = shell('<div class="bpt-top"><span class="bpt-n"></span><button type="button" class="bpt-x" data-t="close" aria-label="Close the tour"><span class="ms">close</span></button></div>'
      + '<h3 class="bpt-h"></h3><p class="bpt-p"></p>'
      + '<div class="bpt-do"><span class="ms">touch_app</span><span><b>Do this:</b> <span class="bpt-do-t"></span></span></div>'
      + '<div class="bpt-dots" aria-hidden="true">' + T.steps.map(function () { return '<i></i>'; }).join('') + '</div>'
      + '<div class="bpt-act"><button type="button" class="bpt-b ghost" data-t="back" aria-label="Back"><span class="ms">arrow_back</span></button>'
      + '<button type="button" class="bpt-b ghost bpt-skip" data-t="close">Skip tour</button>'
      + '<button type="button" class="bpt-b pri" data-t="next"><span>Next</span><span class="ms">arrow_forward</span></button></div>');
    T.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      var t = b.getAttribute('data-t');
      if (t === 'close') close(true); else if (t === 'next') go(T.i + 1); else if (t === 'back') go(T.i - 1);
    });
    keys(function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(T.i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(T.i - 1); }
    });
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    go(0);
    setTimeout(function () { var c = T.el && T.el.querySelector('.bpt-card'); if (c) c.focus({ preventScroll: true }); }, 60);
  };
  window.bpTour.stop = function () { close(false); };
  window.bpTour.welcome = function () { window.bpTourWelcome(); };

  function keys(fn) {
    if (T.keys) document.removeEventListener('keydown', T.keys, true);
    T.keys = function (e) { if (T.el) fn(e); };
    document.addEventListener('keydown', T.keys, true);
  }

  function go(i) {
    if (!T.el) return;
    if (i >= T.steps.length) { close(true); return; }
    T.i = Math.max(0, i);
    var s = T.steps[T.i];
    if (s.v) { try { if (window._bpCurView !== s.v) bpNav(s.v); } catch (e) {} }
    if (window.bpShell && bpShell.closeAll) try { bpShell.closeAll(); } catch (e) {}
    paint(); hide();
    /* the page may still be drawing: look for the button for a few seconds */
    clearInterval(T.poll);
    var tries = 0, at = T.i;
    T.poll = setInterval(function () {
      if (!T.el || T.i !== at) { clearInterval(T.poll); return; }
      tries++;
      var el = find(s.at);
      if (el || tries > 14) {
        clearInterval(T.poll);
        T.target = el || sideItem(s.nav) || null;
        if (T.target && T.target.scrollIntoView && !T.target.closest('#bpxNav,#hlTacts')) { try { T.target.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) { T.target.scrollIntoView(); } }
        T.pointing = !!el;
        setTimeout(place, 60);
      }
    }, 180);
  }
  function paint() {
    var s = T.steps[T.i], c = T.el, last = T.i === T.steps.length - 1;
    c.querySelector('.bpt-n').textContent = last ? 'Done' : 'Step ' + (T.i + 1) + ' of ' + (T.steps.length - 1);
    c.querySelector('.bpt-h').textContent = s.t;
    c.querySelector('.bpt-p').textContent = s.d;
    c.querySelector('.bpt-do-t').textContent = s.act;
    c.querySelectorAll('.bpt-dots i').forEach(function (d, k) { d.className = k < T.i ? 'done' : k === T.i ? 'on' : ''; });
    c.querySelector('[data-t="back"]').disabled = T.i === 0;
    c.querySelector('.bpt-skip').hidden = last;
    c.querySelector('[data-t="next"]').innerHTML = last ? '<span>Finish</span><span class="ms">check</span>' : '<span>Next</span><span class="ms">arrow_forward</span>';
  }
  function hide() {
    if (!T.el) return;
    ['.bpt-spot', '.bpt-ring', '.bpt-hand'].forEach(function (k) { var e = T.el.querySelector(k); if (e) e.classList.remove('on'); });
    T.el.classList.add('dim');
    var card = T.el.querySelector('.bpt-card'); card.style.cssText = ''; card.classList.add('mid');
  }
  /* ring the button, bring the hand in to tap it, and sit the card beside it */
  function place() {
    if (!T.el || T.mode !== 'tour') return;
    var el = T.target, card = T.el.querySelector('.bpt-card');
    var spot = T.el.querySelector('.bpt-spot'), ring = T.el.querySelector('.bpt-ring'), hand = T.el.querySelector('.bpt-hand');
    if (!el || !visible(el)) { hide(); return; }
    var W = window.innerWidth, H = window.innerHeight, r = el.getBoundingClientRect(), pad = 6;
    var box = { l: r.left - pad, t: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
    spot.style.cssText = 'left:' + box.l + 'px;top:' + box.t + 'px;width:' + box.w + 'px;height:' + box.h + 'px';
    ring.style.cssText = spot.style.cssText;
    spot.classList.add('on'); ring.classList.add('on'); T.el.classList.remove('dim');
    if (T.pointing) {
      hand.style.cssText = 'left:' + (r.left + Math.min(r.width * 0.62, r.width - 8)) + 'px;top:' + (r.top + r.height * 0.55) + 'px';
      hand.classList.remove('on'); void hand.offsetWidth; hand.classList.add('on');
    } else hand.classList.remove('on');
    card.classList.remove('mid');
    if (W <= 640) { card.style.cssText = ''; return; }   /* phones: the card is a bottom sheet (tour.css) */
    var cw = Math.min(380, W - 32), ch = card.offsetHeight || 260, gap = 18, x, y;
    /* below it first (the hand sits on the button, so leave it room), then beside, then above */
    if (r.bottom + gap + 30 + ch <= H - 16) { x = r.left + r.width / 2 - cw / 2; y = r.bottom + gap + 30; }
    else if (r.right + gap + cw <= W - 16) { x = r.right + gap; y = r.top + r.height / 2 - ch / 2; }
    else if (r.left - gap - cw >= 16) { x = r.left - gap - cw; y = r.top + r.height / 2 - ch / 2; }
    else { x = r.left + r.width / 2 - cw / 2; y = r.top - gap - ch; }
    x = Math.max(16, Math.min(x, W - cw - 16)); y = Math.max(16, Math.min(y, H - ch - 16));
    card.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + cw + 'px';
  }

  function close(done) {
    clearInterval(T.poll);
    if (done) markDone();
    if (T.el) { var e = T.el; e.classList.add('out'); setTimeout(function () { e.remove(); }, 200); }
    T.el = null; T.target = null; T.mode = '';
    if (T.keys) { document.removeEventListener('keydown', T.keys, true); T.keys = null; }
    window.removeEventListener('resize', place);
    document.removeEventListener('scroll', place, true);
  }

  /* ---------- once per login ---------- */
  function uid() { return (window.BP_TEAM || {}).uid || ''; }
  function localKey() { return KEY + ':' + uid(); }
  function markDone() {
    try { localStorage.setItem(localKey(), '1'); } catch (e) {}
    try {
      if (window.BP_SB && BP_SB.auth) { var d = {}; d[KEY] = new Date().toISOString(); BP_SB.auth.updateUser({ data: d }).catch(function () {}); }
    } catch (e) {}
  }
  function seen() {
    var local = false; try { local = !!localStorage.getItem(localKey()); } catch (e) { local = true; }
    if (local) return Promise.resolve(true);
    if (!window.BP_SB || !BP_SB.auth) return Promise.resolve(false);
    return BP_SB.auth.getSession().then(function (r) {
      var u = r && r.data && r.data.session && r.data.session.user;
      var meta = (u && u.user_metadata) || {};
      if (meta[KEY]) { try { localStorage.setItem(localKey(), '1'); } catch (e) {} return true; }
      return false;
    }).catch(function () { return true; });
  }
  /* something else already on screen: a dialog, or the set-a-password panel */
  function busy() {
    return ['.bpx-modal.on', '#bpx-modal', '#bpxSetPw'].some(function (k) { return visible($(k)); });
  }
  function firstRun() {
    var tries = 0, t = setInterval(function () {
      tries++;
      var app = $('#bpx .bpx-app.on'), area = document.getElementById('bpxViewArea');
      if (app && area && uid()) {
        clearInterval(t);
        seen().then(function (was) {
          if (was) return;
          setTimeout(function () { if (!T.el && !busy()) window.bpTourWelcome(); }, 1500);
        });
      } else if (tries > 90) clearInterval(t);
    }, 1000);
  }

  /* Help (?) -> Take the tour, for every login */
  function hookHelp() {
    var S = window.bpShell; if (!S || !S.help || S.help._tour) return;
    var help = S.help;
    S.help = function (btn) {
      var menu = S.menu;
      S.menu = function (b, items, o) {
        S.menu = menu;
        items.splice(0, 0, { t: 'Take the tour', ico: 'list', fn: function () { window.bpTour(); } });
        return menu.call(S, b, items, o);
      };
      try { return help.apply(this, arguments); } finally { S.menu = menu; }
    };
    S.help._tour = true;
  }

  function boot() { hookHelp(); firstRun(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(hookHelp, 0);
  /* a later sign-in on the same page (sign out, then in as someone else) gets its own first run */
  if (window.BP_SB && BP_SB.auth && BP_SB.auth.onAuthStateChange) try { BP_SB.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_IN') firstRun(); }); } catch (e) {}
})();
