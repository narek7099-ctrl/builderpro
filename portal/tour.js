/* ==================================================================
   Product tour: about two and a half minutes through the whole portal.

   It walks the real app, not screenshots: each stop opens its page,
   spotlights the sidebar item, and explains what the page does for a
   contractor doing $200k to $2M a year, in their words. It plays by itself
   (a progress bar runs on each stop) and can be paused, stepped back and
   forward with the buttons or the arrow keys, or closed with Esc.

   Starts once on an owner's first visit (localStorage bp-tour-done), and
   from Help → Take the tour any time after. bpTour(), bpTour.stop().
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var DONE = 'bp-tour-done';
  /* [page to open, sidebar item to light up, title, what to say, seconds] */
  var STEPS = [
    ['dashboard', '', 'Welcome to BuilderPro', 'Everything a growing contracting business runs on, in one place: leads, jobs, crews, money and marketing. This tour takes about two and a half minutes. It plays by itself, or use the arrows.', 9],
    ['dashboard', 'dashboard', 'Your dashboard', 'Revenue, open jobs, what is owed to you and what needs attention today. The AI CEO bar at the top reads the whole business every morning and tells you the three things that matter most.', 11],
    ['contacts', 'leads', 'Every lead in one list', 'Calls, web forms, Angi, Thumbtack and your calculators all land here. Open anyone to see where they are in the pipeline, call or text them, and write inspection reports with photos.', 11],
    ['checks', 'leads', 'Calculator leads', 'Homeowners who use your calculators and checkers land here. They flow straight into your automations, so follow-up is automatic; this page shows how many came in, how urgent they are and where from.', 10],
    ['calculator', 'leads', 'Instant-quote calculators', 'Put a price calculator for your trade on your website and social pages. Homeowners get a ballpark in a minute, and you get their name, number and project details.', 10],
    ['messaging', 'convos', 'Texts and email', 'Every conversation with every customer, in one inbox. Your AI receptionist answers calls you miss and texts them back, so no lead goes cold while you are on a roof.', 10],
    ['calendar', 'calendar', 'Calendar and booking', 'Inspections, estimates and jobs on one calendar. Share your booking link and customers pick a time themselves.', 9],
    ['activejobs', 'projects', 'Projects', 'Each job has its own sheet: schedule, crew, materials, permits, contract with e-signature, photos, documents, blueprints you can measure on, and inspection reports. Budgets show if a job is making money.', 13],
    ['estimates', 'finances', 'Estimates and invoices', 'Send professional estimates customers accept online, then deposit and final invoices. Reminders go out on their own until you are paid.', 10],
    ['payouts', 'finances', 'Get paid', 'Connect your Stripe account once and customers pay by card or bank right from the invoice. The money goes straight to your bank account.', 9],
    ['finances', 'finances', 'Know your numbers', 'Income, expenses and profit by job and by month, every dollar in and out, recurring costs and QuickBooks sync, so you always know what you actually made.', 9],
    ['employees', 'projects', 'Crew and payroll', 'Add your employees and subcontractors. Crews get their own app to clock in, see their jobs and add photos. Hours roll up into each pay period for payroll.', 10],
    ['matlists', 'supply', 'Materials', 'Build order lists for each job, send them to your suppliers and track receipts, so materials are on site when the crew shows up.', 9],
    ['aiteam', 'aiteam', 'Your AI Team', 'An AI CEO watches the whole business, with assistants for sales, marketing, research, customers, projects, permits and workflows. They work every day, and nothing reaches a customer until you approve it.', 11],
    ['marketing', 'marketing', 'Marketing and reputation', 'Ads, your website, social posts and competitor tracking, plus review requests that build your rating. You are all set. Replay this tour any time from the Help button.', 11]
  ];
  var T = { i: 0, el: null, timer: null, start: 0, left: 0, paused: false, keys: null };

  function total() { return STEPS.reduce(function (s, x) { return s + x[4]; }, 0); }
  function host() { return document.getElementById('bpx') || document.body; }

  function build() {
    var w = document.createElement('div'); w.className = 'bpt'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'false'); w.setAttribute('aria-label', 'Product tour');
    w.innerHTML = '<div class="bpt-spot" aria-hidden="true"></div>'
      + '<div class="bpt-card" tabindex="-1"><div class="bpt-bar"><i></i></div>'
      + '<div class="bpt-top"><span class="bpt-n"></span><button type="button" class="bpt-x" data-t="close" aria-label="Close the tour"><span class="ms">close</span></button></div>'
      + '<h3 class="bpt-h"></h3><p class="bpt-p" aria-live="polite"></p>'
      + '<div class="bpt-dots" aria-hidden="true">' + STEPS.map(function () { return '<i></i>'; }).join('') + '</div>'
      + '<div class="bpt-act"><button type="button" class="bpt-b ghost" data-t="back" aria-label="Back"><span class="ms">arrow_back</span></button>'
      + '<button type="button" class="bpt-b ghost" data-t="pause"><span class="ms">pause</span><span>Pause</span></button>'
      + '<button type="button" class="bpt-b pri" data-t="next"><span>Next</span><span class="ms">arrow_forward</span></button></div></div>';
    host().appendChild(w);
    w.addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      var t = b.getAttribute('data-t');
      if (t === 'close') stop(true); else if (t === 'next') go(T.i + 1); else if (t === 'back') go(T.i - 1); else if (t === 'pause') pause(!T.paused);
    });
    T.keys = function (e) {
      if (!T.el) return;
      if (e.key === 'Escape') { e.preventDefault(); stop(true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(T.i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(T.i - 1); }
      else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); pause(!T.paused); }
    };
    document.addEventListener('keydown', T.keys, true);
    window.addEventListener('resize', place);
    return w;
  }

  /* sidebar item: on a phone the sidebar is a drawer, so light the page instead */
  function target(sec) {
    if (!sec) return null;
    var el = document.querySelector('#bpxNav [data-sec="' + sec + '"]');
    if (!el || !el.offsetParent) return null;
    var r = el.getBoundingClientRect(); return r.width ? el : null;
  }
  function place() {
    if (!T.el) return;
    var s = STEPS[T.i], el = target(s[1]), spot = T.el.querySelector('.bpt-spot'), card = T.el.querySelector('.bpt-card');
    var W = window.innerWidth, H = window.innerHeight;
    if (el) {
      var r = el.getBoundingClientRect(), pad = 4;
      spot.style.cssText = 'left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
      spot.classList.add('on');
      var cw = Math.min(380, W - 32), x = r.right + 18, y = Math.max(16, Math.min(r.top - 20, H - card.offsetHeight - 16));
      if (x + cw > W - 16) x = W - cw - 16;
      card.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + cw + 'px';
      card.classList.remove('mid');
    } else {
      spot.classList.remove('on'); spot.style.cssText = '';
      card.style.cssText = ''; card.classList.add('mid');
    }
  }
  function paint() {
    var s = STEPS[T.i], c = T.el;
    c.querySelector('.bpt-n').textContent = (T.i + 1) + ' of ' + STEPS.length;
    c.querySelector('.bpt-h').textContent = s[2];

    c.querySelector('.bpt-p').textContent = s[3];
    c.querySelectorAll('.bpt-dots i').forEach(function (d, k) { d.className = k < T.i ? 'done' : k === T.i ? 'on' : ''; });
    c.querySelector('[data-t="back"]').disabled = T.i === 0;
    var nx = c.querySelector('[data-t="next"]');
    nx.innerHTML = T.i === STEPS.length - 1 ? '<span>Finish</span><span class="ms">check</span>' : '<span>Next</span><span class="ms">arrow_forward</span>';
    place();
  }
  function run(ms) {
    clearTimeout(T.timer);
    var bar = T.el.querySelector('.bpt-bar i');
    bar.style.transition = 'none'; bar.style.width = (100 - ms / (STEPS[T.i][4] * 1000) * 100) + '%';
    void bar.offsetWidth;
    bar.style.transition = 'width ' + ms + 'ms linear'; bar.style.width = '100%';
    T.start = Date.now(); T.left = ms;
    T.timer = setTimeout(function () { go(T.i + 1); }, ms);
  }
  function pause(on) {
    if (!T.el) return;
    T.paused = on;
    var b = T.el.querySelector('[data-t="pause"]'), bar = T.el.querySelector('.bpt-bar i');
    b.innerHTML = on ? '<span class="ms">play_arrow</span><span>Play</span>' : '<span class="ms">pause</span><span>Pause</span>';
    if (on) {
      clearTimeout(T.timer); T.left = Math.max(400, T.left - (Date.now() - T.start));
      var w = getComputedStyle(bar).width; bar.style.transition = 'none'; bar.style.width = w;
    } else run(T.left);
  }
  function go(i) {
    if (!T.el) return;
    if (i >= STEPS.length) { stop(true); return; }
    T.i = Math.max(0, i);
    var s = STEPS[T.i];
    try { if (window.bpNav && (!window.bpTeamAllows || bpTeamAllows(s[0]))) bpNav(s[0]); } catch (e) {}
    if (window.bpShell && bpShell.closeAll) try { bpShell.closeAll(); } catch (e) {}
    paint();
    setTimeout(place, 350);
    var full = s[4] * 1000;
    if (T.paused) { T.left = full; var bar = T.el.querySelector('.bpt-bar i'); bar.style.transition = 'none'; bar.style.width = '0%'; }
    else run(full);
  }
  function stop(done) {
    clearTimeout(T.timer);
    if (done) try { localStorage.setItem(DONE, '1'); } catch (e) {}
    if (T.el) { var e = T.el; e.classList.add('out'); setTimeout(function () { e.remove(); }, 200); }
    T.el = null;
    if (T.keys) document.removeEventListener('keydown', T.keys, true);
    window.removeEventListener('resize', place);
  }

  window.bpTour = function () {
    if (T.el) stop(false);
    T.paused = false; T.el = build(); go(0);
    setTimeout(function () { var c = T.el && T.el.querySelector('.bpt-card'); if (c) c.focus({ preventScroll: true }); }, 60);
  };
  window.bpTour.stop = function () { stop(false); };
  window.bpTour.seconds = total;

  /* Help → Take the tour */
  function hookHelp() {
    var S = window.bpShell; if (!S || !S.help || S.help._tour) return;
    var help = S.help;
    S.help = function (btn) {
      var menu = S.menu;
      S.menu = function (b, items, o) {
        S.menu = menu;
        if (!(window.bpTeamIsCrew && bpTeamIsCrew())) items.splice(2, 0, { t: 'Take the tour (2 min)', ico: 'list', fn: function () { bpTour(); } });
        return menu.call(S, b, items, o);
      };
      try { return help.apply(this, arguments); } finally { S.menu = menu; }
    };
    S.help._tour = true;
  }

  /* first visit: the owner (not crew, not a sub) sees it once, after the portal settles */
  function firstRun() {
    var seen = ''; try { seen = localStorage.getItem(DONE) || ''; } catch (e) { seen = '1'; }
    if (seen) return;
    var tries = 0, t = setInterval(function () {
      tries++;
      var app = document.querySelector('#bpx .bpx-app.on'), area = document.getElementById('bpxViewArea');
      var T2 = window.BP_TEAM || {};
      if (app && area && T2.uid && !(window.bpTeamIsCrew && bpTeamIsCrew())) {
        clearInterval(t);
        setTimeout(function () { if (!T.el && !document.querySelector('.bpx-modal.on,#bpx-modal:not([hidden])')) bpTour(); }, 1500);
      } else if (tries > 60) clearInterval(t);
    }, 1000);
  }

  function boot() { hookHelp(); firstRun(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(hookHelp, 0);
})();
