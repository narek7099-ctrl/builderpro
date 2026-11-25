/* ==================================================================
   Project details sheet.

   bpProjOpen (index.html) still builds every tab, field id and handler;
   this layer reshapes what it drew: a hero header (customer, job, address
   with a map link, status, money and a progress ring, quick actions), an
   icon tab bar that scrolls on a phone, each tab's sections as cards,
   empty states with one clear action, a Permits tab (portal/permits.js),
   a right-side sheet on desktop and full screen on a phone, with an
   animated open and close, Esc to close and focus kept inside.

   Nothing is re-implemented: Save, Delete, the calendar, budget, crew,
   materials, contract, photos, documents and blueprints all run the code
   that was already there, against the same element ids.
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var money = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : '$' + Math.round(+n || 0); };
  var TABS = {
    details: ['Overview', 'dashboard'], money: ['Money', 'payments'], schedule: ['Schedule', 'calendar_month'],
    crew: ['Crew', 'groups'], subs: ['Subs', 'handyman'], materials: ['Materials', 'inventory_2'], permits: ['Permits', 'assignment'],
    contract: ['Contract', 'contract'], cust: ['Customer', 'home'], inspect: ['Inspections', 'fact_check'], photos: ['Photos', 'photo_library'], docs: ['Documents', 'folder'],
    blueprints: ['Blueprints', 'architecture']
  };
  var ORDER = ['details', 'money', 'schedule', 'crew', 'subs', 'materials', 'permits', 'contract', 'cust', 'inspect', 'photos', 'docs', 'blueprints'];
  /* the six used every day stay in the row; the rest sit under More */
  var MAIN = ['details', 'money', 'schedule', 'crew', 'materials', 'photos'];
  var lastFocus = null;

  function job(id) { return (window.bpJobsGet ? bpJobsGet() : []).filter(function (x) { return x.id === (id || window._bpProjId); })[0]; }
  function initials(n) { var p = String(n || '').replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function isCrew() { return !!(window.bpTeamIsCrew && bpTeamIsCrew()); }

  function ring(pct, label) {
    var r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return '<div class="pjs-ring" role="img" aria-label="' + pct + '% ' + label + '"><svg viewBox="0 0 64 64" aria-hidden="true">'
      + '<circle cx="32" cy="32" r="' + r + '" class="tr"/><circle cx="32" cy="32" r="' + r + '" class="fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>'
      + '<span><b>' + pct + '%</b><small>' + label + '</small></span></div>';
  }

  /* 2026-11-25 redesign: one header for phone and computer. Name, job and address on the left,
     the progress ring on the right; the money in one strip; Call, Text, Directions and Done
     as one even row of buttons. */
  function hero(j) {
    var iso = new Date().toISOString().slice(0, 10);
    var today = j.sched && (j.sched.dates || []).indexOf(iso) >= 0;
    var pr = window.bpPlan && bpPlan.progress ? bpPlan.progress(j) : null;
    var est = +j.estimate || 0, paid = +j.collected || 0;
    var pct = pr ? pr.pct : (est > 0 ? Math.min(100, Math.round(paid / est * 100)) : 0);
    var addr = (j.addr || '').trim(), ph = (j.phone || '').replace(/[^\d+]/g, '');
    var status = j.status === 'done' ? '<span class="pjs-pill done"><span class="ms">task_alt</span>Done</span>' : '<span class="pjs-pill live"><i></i>In progress</span>';
    var next = pr && pr.next ? (pr.next.name || pr.next.label || '') : '';
    var stats = isCrew() ? (next ? '<div class="pjs-stat"><small>Next phase</small><b>' + esc(next) + '</b></div>' : '')
      : '<div class="pjs-stat"><small>Estimate</small><b>' + money(est) + '</b></div>'
      + '<div class="pjs-stat"><small>Collected</small><b>' + money(paid) + '</b></div>'
      + '<div class="pjs-stat"><small>Balance</small><b>' + money(Math.max(est - paid, 0)) + '</b></div>'
      + (next ? '<div class="pjs-stat wide"><small>Next phase</small><b>' + esc(next) + '</b></div>' : '');
    var act = function (href, ico, t, dis, extra) {
      return dis ? '<span class="pjs-act dis" aria-disabled="true" title="Nothing to use yet"><span class="ms">' + ico + '</span><span class="pjs-al">' + t + '</span></span>'
        : '<a class="pjs-act" href="' + href + '"' + (extra || '') + '><span class="ms">' + ico + '</span><span class="pjs-al">' + t + '</span></a>';
    };
    return '<header class="pjs-hero">'
      + '<div class="pjs-hero-top">'
      + '<div class="pjs-hero-t">'
      + '<div class="pjs-tags">' + status + (today ? '<span class="pjs-pill today"><span class="ms">engineering</span>Crew on site today</span>' : '') + '<span id="pjs-permit-chip">' + (window.bpPermitChip ? bpPermitChip(j) : '') + '</span></div>'
      + '<h2 id="pjs-title">' + esc(j.name || 'Project') + '</h2>'
      + '<div class="pjs-job">' + esc(j.title || 'Project') + '</div>'
      + (addr ? '<a class="pjs-addr" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr) + '"><span class="ms">location_on</span><span>' + esc(addr) + '</span></a>'
        : '<span class="pjs-addr none"><span class="ms">location_off</span>No address yet</span>')
      + '</div>'
      + ring(pct, pr ? 'built' : 'paid')
      + '<button class="pjs-x" type="button" aria-label="Close project" onclick="bpCloseModal()"><span class="ms">close</span></button>'
      + '</div>'
      + (stats ? '<div class="pjs-stats">' + stats + '</div>' : '')
      + '<div class="pjs-acts">'
      + act('tel:' + ph, 'call', 'Call', !ph)
      + act('sms:' + ph, 'chat_bubble', 'Text', !ph)
      + act('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr), 'near_me', 'Directions', !addr, ' target="_blank" rel="noopener"')
      + (j.status === 'done' || isCrew() ? '' : '<button type="button" class="pjs-act primary" onclick="bpJobDoneOpen(\'' + j.id + '\')"><span class="ms">check</span><span class="pjs-al">' + ((window.innerWidth || 1000) <= 760 ? 'Done' : 'Mark done') + '</span></button>')
      + '</div></header>';
  }

  /* the computer keeps this header as it was (2026-11-25, the owner's call) */
  function heroOld(j) {
    var iso = new Date().toISOString().slice(0, 10);
    var today = j.sched && (j.sched.dates || []).indexOf(iso) >= 0;
    var pr = window.bpPlan && bpPlan.progress ? bpPlan.progress(j) : null;
    var est = +j.estimate || 0, paid = +j.collected || 0;
    var pct = pr ? pr.pct : (est > 0 ? Math.min(100, Math.round(paid / est * 100)) : 0);
    var addr = (j.addr || '').trim(), ph = (j.phone || '').replace(/[^\d+]/g, '');
    var status = j.status === 'done' ? '<span class="pjs-pill done"><span class="ms">task_alt</span>Done</span>' : '<span class="pjs-pill live"><i></i>In progress</span>';
    var stats = isCrew() ? ''
      : '<div class="pjs-stat"><small>Estimate</small><b>' + money(est) + '</b></div>'
      + '<div class="pjs-stat"><small>Collected</small><b>' + money(paid) + '</b></div>'
      + '<div class="pjs-stat"><small>Balance</small><b>' + money(Math.max(est - paid, 0)) + '</b></div>';
    var act = function (href, ico, t, dis, extra) {
      return dis ? '<span class="pjs-act dis" aria-disabled="true" title="No phone number on this job"><span class="ms">' + ico + '</span>' + t + '</span>'
        : '<a class="pjs-act" href="' + href + '"' + (extra || '') + '><span class="ms">' + ico + '</span>' + t + '</a>';
    };
    return '<header class="pjs-hero">'
      + '<div class="pjs-hero-top">'
      + '<div class="pjs-av" aria-hidden="true">' + esc(initials(j.name)) + '</div>'
      + '<div class="pjs-hero-t">'
      + '<div class="pjs-tags">' + status + (today ? '<span class="pjs-pill today"><span class="ms">engineering</span>Crew on site today</span>' : '') + '<span id="pjs-permit-chip">' + (window.bpPermitChip ? bpPermitChip(j) : '') + '</span></div>'
      + '<h2 id="pjs-title">' + esc(j.name || 'Project') + '</h2>'
      + '<div class="pjs-job">' + esc(j.title || 'Project') + '</div>'
      + (addr ? '<a class="pjs-addr" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr) + '"><span class="ms">location_on</span><span>' + esc(addr) + '</span><span class="ms ext">open_in_new</span></a>'
        : '<span class="pjs-addr none"><span class="ms">location_off</span>No address yet</span>')
      + '</div>'
      + '<button class="pjs-x" type="button" aria-label="Close project" onclick="bpCloseModal()"><span class="ms">close</span></button>'
      + '</div>'
      + '<div class="pjs-hero-row">'
      + ring(pct, pr ? 'built' : 'paid')
      + '<div class="pjs-stats">' + stats + (pr && pr.next ? '<div class="pjs-stat wide"><small>Next phase</small><b>' + esc(pr.next.name || pr.next.label || '') + '</b></div>' : '') + '</div>'
      + '<div class="pjs-acts">'
      + act('tel:' + ph, 'call', 'Call', !ph)
      + act('sms:' + ph, 'sms', 'Text', !ph)
      + (j.status === 'done' || isCrew() ? '' : '<button type="button" class="pjs-act primary" onclick="bpJobDoneOpen(\'' + j.id + '\')"><span class="ms">check</span>Mark done</button>')
      + '</div></div></header>';
  }


  /* ---------- on a phone, the project is a screen in an app (2026-11-21) ----------
     A top bar with "‹ Jobs" and Save, the title fading into it as the header scrolls away;
     round action buttons like a contact card; the form as label-and-value rows; Delete as a
     red row at the end; swipe from the left edge to go back. Going back saves what changed. */
  function appify(card, j) {
    var m = document.getElementById('bpx-modal'); if (!m || card.querySelector('.pjs-nav')) return;
    m.classList.add('pjs-app');
    var form = card.querySelector('[data-pj-pane="details"]');
    var snap = function () { return form ? Array.prototype.map.call(form.querySelectorAll('input,textarea,select'), function (e) { return e.value; }).join('\u0001') : ''; };
    var start = snap();
    window.bpPjsBack = function () {
      if (form && snap() !== start && window.bpProjSave) { bpProjSave(); if (window.bpToast) bpToast('Saved'); }
      else if (window.bpCloseModal) bpCloseModal();
    };
    var nav = document.createElement('div'); nav.className = 'pjs-nav';
    nav.innerHTML = '<button type="button" class="pjs-nb" onclick="bpPjsBack()" aria-label="Back to jobs"><span class="ms">chevron_left</span>Jobs</button>'
      + '<b class="pjs-nt">' + esc(j.name || 'Project') + '</b>'
      + '<button type="button" class="pjs-ns" onclick="bpProjSave()">Save</button>';
    card.insertBefore(nav, card.firstChild);
    /* the title shows in the bar once the name has scrolled up under it */
    var h2 = card.querySelector('#pjs-title');
    card.addEventListener('scroll', function () { nav.classList.toggle('t', !!h2 && h2.getBoundingClientRect().bottom < nav.getBoundingClientRect().bottom); }, { passive: true });
    /* Money and Schedule as app screens too (2026-11-21): name each group so the phone styles can
       lay it out as rows; Budget folds shut until it is opened */
    var tagSec = function (sel, cls) { var e = card.querySelector(sel), sec = e && e.closest('.pjs-sec'); if (sec) sec.classList.add(cls); return sec; };
    tagSec('#bpx-pj-est', 'pjs-mrows'); tagSec('#bpx-pj-exps', 'pjs-exp'); tagSec('.bpp-panel', 'pjs-phases'); tagSec('#bpx-pj-cal', 'pjs-days');
    var bud = tagSec('#bpx-pj-budget', 'pjs-fold');
    if (bud && !bud._fold) {
      bud._fold = 1; var bh = bud.querySelector('.pjs-h');
      if (bh) { bh.setAttribute('role', 'button'); bh.setAttribute('tabindex', '0'); bh.onclick = function () { bud.classList.toggle('open'); }; bh.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bud.classList.toggle('open'); } }; }
    }
    /* Delete becomes the last row of the Overview */
    if (form && !form.querySelector('.pjs-delrow')) {
      var d = document.createElement('button'); d.type = 'button'; d.className = 'pjs-delrow'; d.textContent = 'Delete project';
      d.onclick = function () { if (window.bpProjDelete) bpProjDelete(); };
      form.appendChild(d);
    }
    /* swipe from the left edge to go back */
    var x0 = null, y0 = 0;
    card.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX < 28 ? t.clientX : null; y0 = t.clientY; }, { passive: true });
    card.addEventListener('touchmove', function (e) { if (x0 == null) return; var t = e.touches[0], dx = t.clientX - x0; if (Math.abs(t.clientY - y0) > 60) { x0 = null; card.style.transform = ''; return; } if (dx > 0) card.style.transform = 'translateX(' + dx + 'px)'; }, { passive: true });
    card.addEventListener('touchend', function (e) {
      if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (dx > 90) { card.style.transition = 'transform .2s ease-out'; card.style.transform = 'translateX(100%)'; setTimeout(function () { bpPjsBack(); }, 180); }
      else { card.style.transition = 'transform .2s ease-out'; card.style.transform = ''; setTimeout(function () { card.style.transition = ''; }, 220); }
    });
  }

  /* group a pane's top-level nodes into card sections; a label with its own
     top margin was already a section heading in the old layout */
  function cardify(pane, key) {
    if (pane.getAttribute('data-pjs')) return; pane.setAttribute('data-pjs', '1');
    var kids = Array.prototype.slice.call(pane.childNodes), secs = [], cur = null;
    var startsSec = function (n, i) {
      if (n.nodeType !== 1) return false;
      if (n.tagName === 'LABEL' && /margin-top/.test(n.getAttribute('style') || '')) return true;
      if (key === 'details' && n.tagName === 'LABEL' && n.nextElementSibling && n.nextElementSibling.id === 'bpx-pj-title') return true;
      return false;
    };
    kids.forEach(function (n, i) {
      if (!cur || startsSec(n, i)) { cur = document.createElement('section'); cur.className = 'pjs-sec'; secs.push(cur); }
      if (n.nodeType === 1 && n.tagName === 'LABEL' && startsSec(n, i)) { n.classList.add('pjs-h'); n.removeAttribute('style'); }
      cur.appendChild(n);
    });
    if (key === 'details' && secs[0]) {
      var h = document.createElement('div'); h.className = 'pjs-h'; h.textContent = 'Customer & site'; secs[0].insertBefore(h, secs[0].firstChild);
      if (secs[1]) { var l = secs[1].querySelector('label.pjs-h'); if (l) l.textContent = 'Job & notes'; }
    }
    secs.forEach(function (s) { pane.appendChild(s); });
  }

  /* 2026-11-25 redesign: the Overview is the form itself, open straight away (the owner wants
     the boxes there, task #30), laid out as two groups: Customer and Job. Every box keeps its
     id, so Save, offline saving and the other modules work as before. Phone and address boxes
     carry their own Call, Text and Directions buttons, which follow what is typed. */
  function overview(body) {
    var pane = body.querySelector('[data-pj-pane="details"]'); if (!pane || pane.querySelector('.pjs-form')) return;
    var $ = function (id) { return document.getElementById(id); };
    var old = Array.prototype.slice.call(pane.childNodes);
    var field = function (id, label, side) {
      var el = $(id); if (!el) return '';
      return '<div class="pjs-f" data-f="' + id + '"><label for="' + id + '">' + label + '</label><div class="pjs-fi"></div>' + (side || '') + '</div>';
    };
    var a = function (cls, ico, t) { return '<a class="pjs-fb ' + cls + '" aria-label="' + t + '" title="' + t + '"><span class="ms">' + ico + '</span></a>'; };
    var cust = document.createElement('section'); cust.className = 'pjs-sec pjs-form';
    cust.innerHTML = '<div class="pjs-fh"><b>Customer</b>' + (isCrew() ? '' : '<button type="button" class="pjs-fl" onclick="if(window.bpOpenPerson)bpOpenPerson(window._bpProjId||\'\')">Profile<span class="ms">chevron_right</span></button>') + '</div>'
      + field('bpx-pj-name', 'Name')
      + '<div class="pjs-f2">' + field('bpx-pj-phone', 'Phone') + field('bpx-pj-email', 'Email') + '</div>'
      + field('bpx-pj-addr', 'Job site address')
      + '<div class="pjs-cust-ap"></div>';
    var jobs = document.createElement('section'); jobs.className = 'pjs-sec pjs-form';
    jobs.innerHTML = '<div class="pjs-fh"><b>Job</b></div>'
      + '<div class="pjs-f2">' + field('bpx-pj-title', 'Job') + field('bpx-pj-crew', 'Crew') + '</div>'
      + field('bpx-pj-notes', 'Notes');
    /* move each real box into its slot */
    Array.prototype.forEach.call(cust.querySelectorAll('[data-f]'), put); Array.prototype.forEach.call(jobs.querySelectorAll('[data-f]'), put);
    function put(f) { var el = $(f.getAttribute('data-f')); if (el) { el.removeAttribute('style'); f.querySelector('.pjs-fi').appendChild(el); } }
    /* buttons inside the phone and address boxes */
    var phf = cust.querySelector('[data-f="bpx-pj-phone"] .pjs-fi'), adf = cust.querySelector('[data-f="bpx-pj-addr"] .pjs-fi');
    if (phf) phf.insertAdjacentHTML('beforeend', a('pjs-fb-call', 'call', 'Call') + a('pjs-fb-sms', 'chat_bubble', 'Text'));
    if (adf) adf.insertAdjacentHTML('beforeend', a('pjs-fb-dir', 'near_me', 'Directions'));
    var sync = function () {
      var ph = cust.querySelector('#bpx-pj-phone'), ad = cust.querySelector('#bpx-pj-addr'), n = ph ? ph.value.replace(/[^\d+]/g, '') : '', v = ad ? ad.value.trim() : '';
      Array.prototype.forEach.call(cust.querySelectorAll('.pjs-fb-call,.pjs-fb-sms'), function (x) { x.classList.toggle('off', !n); if (n) x.href = (x.classList.contains('pjs-fb-call') ? 'tel:' : 'sms:') + n; else x.removeAttribute('href'); });
      var d = cust.querySelector('.pjs-fb-dir'); if (d) { d.classList.toggle('off', !v); if (v) { d.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(v); d.target = '_blank'; d.rel = 'noopener'; } else d.removeAttribute('href'); }
    };
    sync(); cust.addEventListener('input', sync);
    var t = $('bpx-pj-notes'); if (t) { t.rows = 3; t.placeholder = 'Gate code, parking, materials, anything the crew should know'; }
    /* whatever else other modules put in the pane goes under the Job group; the old labels and wrappers go */
    old.forEach(function (n) {
      if (n.parentNode !== pane) return;
      if (n.nodeType !== 1) { pane.removeChild(n); return; }
      if (n.id === 'ap-row') return;
      if (n.tagName === 'LABEL' || (!n.textContent.trim() && !n.querySelector('input,select,textarea,img,svg,canvas'))) { n.remove(); return; }
      if (n.querySelector && n.querySelector('label') && !n.querySelector('input,select,textarea')) { n.remove(); return; }
      jobs.appendChild(n);
    });
    pane.insertBefore(jobs, pane.firstChild); pane.insertBefore(cust, jobs);
    var ap = $('ap-row'); if (ap) cust.querySelector('.pjs-cust-ap').appendChild(ap);
    pane.setAttribute('data-pjs', '1');
  }

  /* the old panes carry inline sizes, borders and white backgrounds (wrong in dark mode);
     clear them so the sheet's own styles apply, and name the layout grids */
  function tidyPanes(body) {
    Array.prototype.forEach.call(body.querySelectorAll('[data-pj-pane]>:is(label,.bpx-mut), [data-pj-pane] .pjs-sec>:is(label,.bpx-mut), [data-pj-pane] div>div>label, [data-pj-pane] :is(input:not([type=checkbox]):not([type=radio]),select,textarea,#bpx-pj-bal,#bpx-pj-cal)'), function (e) {
      if (e.type === 'file' || e.type === 'hidden' || /display\s*:\s*none/.test(e.getAttribute('style') || '')) return;
      e.removeAttribute('style');
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-pj-pane] div[style*="grid-template-columns"]'), function (g) {
      if (g.classList.contains('bpx-iv-grid') || /repeat\(/.test(g.getAttribute('style')) || g.closest('#bpx-pj-cal')) return;
      var n = (g.getAttribute('style').match(/grid-template-columns:\s*([^;]+)/) || [])[1] || '';
      g.removeAttribute('style'); g.classList.add('pjs-grid', 'pjs-g' + n.trim().split(/\s+/).length);
    });
    var iv = body.querySelector('.bpx-iv-grid'); if (iv) iv.removeAttribute('style');
  }

  /* the computer's Overview, as it was before the 2026-11-25 phone redesign */
  /* Overview opens as a calm read-only summary; the form is one tap away
     behind "Edit details", so nobody changes a phone number by accident. */
  function viewMode(body) {
    var pane = body.querySelector('[data-pj-pane="details"]'); if (!pane || pane.querySelector('.pjs-view')) return;
    var rows = [];
    Array.prototype.forEach.call(pane.querySelectorAll('label'), function (l) {
      var f = l.htmlFor ? document.getElementById(l.htmlFor) : null;
      if (!f) { var n = l.nextElementSibling; f = n && /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) ? n : l.querySelector('input,textarea,select'); }
      if (!f || f.type === 'hidden' || f.type === 'file' || f.type === 'checkbox') return;
      var v = f.tagName === 'SELECT' ? (f.options[f.selectedIndex] || {}).text : f.value;
      var k = (l.textContent || '').replace(/\s+/g, ' ').trim(); if (!k || k.length > 40) return;
      rows.push([k, String(v || '').trim(), f.type]);
    });
    if (!rows.length) return;
    var link = function (r) {
      var v = esc(r[1]); if (!r[1]) return '<span class="pjs-vnone">Not added</span>';
      if (/phone/i.test(r[0]) || r[2] === 'tel') return '<a href="tel:' + esc(r[1].replace(/[^\d+]/g, '')) + '">' + v + '</a>';
      if (/address/i.test(r[0])) return '<a href="https://maps.google.com/?q=' + encodeURIComponent(r[1]) + '" target="_blank" rel="noopener">' + v + '</a>';
      return v;
    };
    var view = document.createElement('section'); view.className = 'pjs-sec pjs-view';
    /* Overview: who the customer is (with ways to reach them) next to the job's facts.
       Anything missing shows a small "Add" that opens the form. */
    var find = function (re) { for (var q = 0; q < rows.length; q++) if (re.test(rows[q][0])) return rows.splice(q, 1)[0]; return null; };
    var nm = find(/name/i), ph = find(/phone|mobile|cell/i), em = find(/e-?mail/i);
    var who = (nm && nm[1]) || '';
    var ini = who.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase() || '?';
    var add = function (what) { return '<button type="button" class="pjs-add" data-pjs-edit><span class="ms">add</span>Add ' + what + '</button>'; };
    var num = ph && ph[1] ? esc(ph[1].replace(/[^\d+]/g, '')) : '';
    var line = function (ico, html) { return '<div class="pjs-cl"><span class="ms">' + ico + '</span>' + html + '</div>'; };
    /* the whole card goes to this person's profile in Leads; its own buttons and links still do their own thing */
    var cust = '<div class="pjs-cust" role="button" tabindex="0" title="Open ' + esc(who || 'the customer') + '\u2019s profile in Leads" onclick="if(!event.target.closest(\'a,button,.pjs-cust-ap\')&&window.bpOpenPerson)bpOpenPerson(window._bpProjId||\'\')" onkeydown="if(event.key===\'Enter\'&&event.target===this&&window.bpOpenPerson)bpOpenPerson(window._bpProjId||\'\')">'
      + '<div class="pjs-cu"><span class="pjs-cu-av">' + esc(ini) + '</span><div class="pjs-cu-t"><small>Customer</small><b>' + (who ? esc(who) : 'No name yet') + '</b></div><span class="pjs-cu-go">Profile<span class="ms">chevron_right</span></span></div>'
      + '<div class="pjs-cls">'
      + line('call', num ? '<a href="tel:' + num + '">' + esc(ph[1]) + '</a><a class="pjs-mini" href="sms:' + num + '">Text</a>' : add('phone'))
      + line('mail', em && em[1] ? '<a href="mailto:' + esc(em[1]) + '">' + esc(em[1]) + '</a>' : add('email'))
      + '</div><div class="pjs-cust-ap"></div></div>';
    var ICO = [[/address|site|location/i, 'location_on'], [/crew|team/i, 'groups'], [/^job|type|scope|work/i, 'construction'], [/note/i, 'sticky_note_2'], [/date|start|end/i, 'event'], [/price|amount|value|budget/i, 'payments']];
    var ico = function (k) { for (var q = 0; q < ICO.length; q++) if (ICO[q][0].test(k)) return ICO[q][1]; return 'info'; };
    var lab = function (k) { return /^job\s*&\s*notes$/i.test(k) ? 'Job' : k; };
    var info = '<div class="pjs-info"><div class="pjs-info-h"><b>Job info</b><button type="button" class="pjs-edit" data-pjs-edit><span class="ms">edit</span>Edit</button></div>'
      + rows.map(function (r) {
        var v = r[1], extra = '';
        if (v && /address/i.test(r[0])) extra = '<a class="pjs-mini" href="https://maps.google.com/?q=' + encodeURIComponent(v) + '" target="_blank" rel="noopener"><span class="ms">near_me</span>Directions</a>';
        return '<div class="pjs-ir"><span class="pjs-ir-i ms">' + ico(r[0]) + '</span><div class="pjs-ir-t"><small>' + esc(lab(r[0])) + '</small>'
          + (v ? '<div>' + esc(v) + '</div>' : '<div>' + add(lab(r[0]).toLowerCase()) + '</div>') + '</div>' + extra + '</div>';
      }).join('') + '</div>';
    view.innerHTML = '<div class="pjs-ov">' + cust + info + '</div>';
    var ap = document.getElementById('ap-row'); if (ap) view.querySelector('.pjs-cust-ap').appendChild(ap);
    pane.insertBefore(view, pane.firstChild);
    /* 2026-11-20: the owner wants the fill-out boxes open straight away, as they used to be;
       the customer card stays on top, the read-only Job info list only shows if pjs-ro is set */
    /* 2026-11-24: on a computer the customer card above already shows name, phone and
       email, so the Customer & site boxes fold under one "Edit" row (the job's other
       boxes stay open). On a phone the boxes are the customer info, so they stay. */
    var cs = pane.querySelector('.pjs-sec:not(.pjs-view)'), csh = cs && cs.querySelector(':scope > .pjs-h');
    if (csh && /customer/i.test(csh.textContent)) {
      cs.classList.add('pjs-cs', 'pjs-cs-shut');
      csh.setAttribute('role', 'button'); csh.tabIndex = 0;
      csh.innerHTML = '<span>Customer &amp; site</span><span class="pjs-cs-tg"><span class="pjs-cs-tl">Edit</span><span class="ms">expand_more</span></span>';
      csh.onclick = function () { cs.classList.toggle('pjs-cs-shut'); };
      csh.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); csh.onclick(); } };
    }
    Array.prototype.forEach.call(view.querySelectorAll('[data-pjs-edit]'), function (b) { b.onclick = function () { pane.classList.remove('pjs-ro'); if (cs) cs.classList.remove('pjs-cs-shut'); var want = /email/i.test(b.textContent) ? 'input[type=email],input[id*=mail]' : /phone/i.test(b.textContent) ? 'input[type=tel],input[id*=phone]' : 'input'; var f = pane.querySelector('.pjs-sec:not(.pjs-view) ' + want) || pane.querySelector('.pjs-sec:not(.pjs-view) input'); if (f) f.focus(); }; });
  }

  function emptyState(ico, title, text, btn, onclick) {
    return '<div class="pjs-empty"><span class="ms">' + ico + '</span><b>' + title + '</b><p>' + text + '</p>'
      + '<button type="button" class="pm-btn" onclick="' + onclick + '"><span class="ms">add</span>' + btn + '</button></div>';
  }
  /* empty tabs: one clear action instead of a line of gray text plus a button */
  function decorate() {
    var j = job(); if (!j) return;
    var set = function (pane, empty, html) {
      var p = document.querySelector('[data-pj-pane="' + pane + '"]'); if (!p) return;
      p.classList.toggle('pjs-is-empty', !!empty);
      var host = p.querySelector('.pjs-emptyhost');
      if (!host) { host = document.createElement('div'); host.className = 'pjs-emptyhost'; p.insertBefore(host, p.firstChild); }
      host.innerHTML = empty ? html : '';
    };
    set('photos', !(j.photos || []).length, emptyState('photo_camera', 'No photos yet', 'Before, during and after shots. The first one becomes the project\'s cover.', 'Add photo', "document.getElementById('bpx-pj-file').click()"));
    set('docs', !(j.docs || []).length, emptyState('folder_open', 'No documents yet', 'Contracts, receipts, change orders: upload a file or scan paper with the camera.', 'Add document', "document.getElementById('bpx-pj-doc').click()"));
    set('blueprints', !(j.blueprints || []).length, emptyState('architecture', 'No blueprints yet', 'Add plan sheets as images or PDFs, then analyze them or mark them up.', 'Add blueprint', "document.getElementById('bpx-pj-bp').click()"));
    counts(j);
  }
  function counts(j) {
    var n = { photos: (j.photos || []).length, docs: (j.docs || []).length, blueprints: (j.blueprints || []).length, permits: (j.permits || []).length };
    Object.keys(n).forEach(function (k) {
      var b = document.querySelector('[data-pj-tab="' + k + '"] .pjs-n'); if (b) b.textContent = n[k] ? String(n[k]) : '';
    });
  }

  function buildTabs(card, j) {
    var bar = card.querySelector('#bpx-pj-tabs'); if (!bar) return;
    var have = Array.prototype.map.call(bar.querySelectorAll('[data-pj-tab]'), function (b) { return b.getAttribute('data-pj-tab'); });
    if (have.indexOf('permits') < 0) have.push('permits');
    if (!isCrew() && window.bpSubsTab && have.indexOf('subs') < 0) have.push('subs');
    if (!isCrew() && window.bpCustTabOpen && have.indexOf('cust') < 0) have.push('cust');
    if (window.bpInspMount && have.indexOf('inspect') < 0) have.push('inspect');
    var keys = ORDER.filter(function (k) { return have.indexOf(k) >= 0; }).concat(have.filter(function (k) { return ORDER.indexOf(k) < 0; }));
    bar.className = 'pjs-tabs'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Project sections');
    var btn = function (k, i) {
      var t = TABS[k] || [k, 'tab'];
      return '<button type="button" class="bpx-jt pjs-tab' + (i === 0 ? ' on' : '') + '" role="tab" aria-selected="' + (i === 0) + '" data-pj-tab="' + k + '" onclick="bpProjTab(\'' + k + '\')">'
        + '<span class="ms">' + t[1] + '</span><span class="pjs-tl">' + t[0] + '</span><span class="pjs-n"></span></button>';
    };
    var M = (window.innerWidth || 1000) <= 760 ? MAIN.filter(function (k) { return k !== 'materials'; }) : MAIN;
    var main = keys.filter(function (k) { return M.indexOf(k) >= 0; }), rest = keys.filter(function (k) { return M.indexOf(k) < 0; });
    if (rest.length < 2) { main = keys; rest = []; }
    bar.innerHTML = main.map(btn).join('')
      + (rest.length ? '<div class="pjs-more"><button type="button" class="bpx-jt pjs-tab pjs-more-b" aria-haspopup="true" aria-expanded="false" onclick="bpPjsMore(event)">' + ((window.innerWidth || 1000) <= 760 ? '<span class="ms pjs-mi">more_horiz</span>' : '') + '<span class="pjs-tl">More</span><span class="ms pjs-chev">expand_more</span></button>'
        + '<div class="pjs-menu" hidden><small class="pjs-menu-h">More sections</small>' + rest.map(function (k) { return btn(k, -1); }).join('') + '</div></div>' : '');
  }

  function enhance(id) {
    var m = document.getElementById('bpx-modal'); if (!m) return;
    var card = m.querySelector('.bpx-modalcard'); if (!card || !card.querySelector('#bpx-pj-tabs')) return;
    var j = job(id); if (!j) return;
    m.classList.add('pjs'); card.removeAttribute('style'); card.classList.add('pjs-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'pjs-title');
    var h3 = card.querySelector(':scope > h3'), sub = card.querySelector(':scope > .bpx-sub');
    if (sub) sub.remove();
    var phone = (window.innerWidth || 1000) <= 760;
    var hh = document.createElement('div'); hh.innerHTML = phone ? hero(j) : heroOld(j);
    if (h3) h3.replaceWith(hh.firstChild); else card.insertBefore(hh.firstChild, card.firstChild);
    buildTabs(card, j);
    /* body: every pane; footer: the old action row */
    var body = document.createElement('div'); body.className = 'pjs-body';
    var panes = card.querySelectorAll(':scope > [data-pj-pane]');
    var perm = document.createElement('div'); perm.setAttribute('data-pj-pane', 'permits'); perm.hidden = true;
    perm.innerHTML = '<div id="bpx-pj-permits"></div>';
    Array.prototype.forEach.call(panes, function (p) { body.appendChild(p); });
    var docs = body.querySelector('[data-pj-pane="docs"]'); body.insertBefore(perm, docs || null);
    /* subcontractors (portal/subs.js): owner and office only */
    if (!isCrew() && window.bpSubsTab) {
      var sp = document.createElement('div'); sp.setAttribute('data-pj-pane', 'subs'); sp.hidden = true;
      sp.innerHTML = '<div id="bpx-pj-subs"></div>';
      body.insertBefore(sp, body.querySelector('[data-pj-pane="materials"]') || null);
    }
    /* the homeowner's page (portal/custportal.js): owner and office only */
    if (!isCrew() && window.bpCustTabOpen) {
      var cp = document.createElement('div'); cp.setAttribute('data-pj-pane', 'cust'); cp.hidden = true;
      cp.innerHTML = '<div id="bpx-pj-cust"></div>';
      body.insertBefore(cp, body.querySelector('[data-pj-pane="photos"]') || null);
    }
    /* inspection reports (portal/inspect.js): the job's, and the lead's from before it was a job */
    if (window.bpInspMount) {
      var ip = document.createElement('div'); ip.setAttribute('data-pj-pane', 'inspect'); ip.hidden = true;
      ip.innerHTML = '<section class="pjs-sec" id="bpx-pj-insp"></section>';
      body.insertBefore(ip, body.querySelector('[data-pj-pane="photos"]') || null);
    }
    var foot = card.querySelector(':scope > div:last-child');
    var tabs = card.querySelector('#bpx-pj-tabs');
    tabs.after(body);
    if (foot && foot !== body) {
      foot.removeAttribute('style'); foot.className = 'pjs-foot';
      Array.prototype.forEach.call(foot.querySelectorAll('button'), function (b) { b.style.cssText = ''; });
      var del = foot.querySelector('button'); if (del) { del.classList.add('pjs-del'); del.innerHTML = '<span class="ms">delete</span><span>Delete project</span>'; }
      card.appendChild(foot);
    }
    Array.prototype.forEach.call(body.querySelectorAll('[data-pj-pane]'), function (p) {
      var k = p.getAttribute('data-pj-pane');
      if (k === 'details' && phone) overview(body);
      else if (k !== 'permits' && k !== 'contract' && k !== 'materials' && k !== 'subs' && k !== 'cust' && k !== 'inspect') cardify(p, k);
      else if (k !== 'permits' && k !== 'subs' && k !== 'cust' && k !== 'inspect') { var s = document.createElement('section'); s.className = 'pjs-sec'; while (p.firstChild) s.appendChild(p.firstChild); p.appendChild(s); }
      p.setAttribute('role', 'tabpanel');
    });
    /* the AI CEO's ranked picks (portal/aiceo.js) at the top of the Crew tab:
       owner and office only, fetched when the tab is first opened */
    var crewPane = body.querySelector('[data-pj-pane="crew"]');
    if (!isCrew() && window.bpCeoReco && crewPane) {
      var rc = document.createElement('section'); rc.className = 'pjs-sec'; rc.id = 'pjs-reco'; rc.hidden = true;
      crewPane.insertBefore(rc, crewPane.firstChild);
      if (!crewPane.hidden) bpCeoReco(j);
    }
    if (phone) tidyPanes(body); else viewMode(body);
    if ((window.innerWidth || 1000) <= 760) appify(card, j);
    if (window.bpPermitsReset) bpPermitsReset();
    if (window.bpPermitsRender) bpPermitsRender(j);
    if (!isCrew() && window.bpSubsTabOpen) bpSubsTabOpen(j);
    if (!isCrew() && window.bpCustTabOpen) bpCustTabOpen(j);
    decorate();
    lastFocus = document.activeElement;
    setTimeout(function () { var x = card.querySelector('.pjs-x'); if (x) x.focus({ preventScroll: true }); }, 30);
  }

  /* -------------------------------------------------------------- hooks --- */
  function hook() {
    if (!window.bpProjOpen || window.bpProjOpen._pjs) return;
    var open = window.bpProjOpen;
    var w = function (id) {
      Array.prototype.forEach.call(document.querySelectorAll('.pjs-closing'), function (x) { x.remove(); });
      var r = open.apply(this, arguments); try { enhance(id); } catch (e) { if (window.console) console.error(e); } return r;
    };
    w._pjs = true; window.bpProjOpen = w;

    var tab = window.bpProjTab;
    window.bpProjTab = function (t) {
      var r = tab.apply(this, arguments);
      var on = document.querySelector('.pjs [data-pj-tab].on');
      var mb = document.querySelector('.pjs .pjs-more-b'), mm = document.querySelector('.pjs .pjs-menu');
      if (mb && mm) {
        var inMore = on && mm.contains(on); mb.classList.toggle('on', !!inMore);
        mb.querySelector('.pjs-tl').textContent = inMore ? on.querySelector('.pjs-tl').textContent : 'More';
        var mi = mb.querySelector('.pjs-mi'), oi = inMore && on.querySelector('.ms'); if (mi) mi.textContent = oi ? oi.textContent : 'more_horiz';
        mm.hidden = true; mb.setAttribute('aria-expanded', 'false');
        if (inMore) on = mb;
      }
      document.querySelectorAll('.pjs [data-pj-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.classList.contains('on'))); });
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      var body = document.querySelector('.pjs .pjs-body'); if (body) body.scrollTop = 0;
      /* phones scroll the whole sheet (flat.css): a new tab starts just under the header */
      var card = document.querySelector('.pjs .pjs-card'), tb = document.querySelector('.pjs .pjs-tabs');
      if (card && tb && card.scrollHeight > card.clientHeight && card.scrollTop > tb.offsetTop) card.scrollTop = tb.offsetTop;
      if (t === 'permits' && window.bpPermitsRender) bpPermitsRender();
      if (t === 'subs' && window.bpSubsTabOpen) bpSubsTabOpen(job());
      if (t === 'crew' && window.bpCeoReco && !isCrew()) bpCeoReco(job());
      if (t === 'cust' && window.bpCustDraw) bpCustDraw();
      if (t === 'inspect' && window.bpInspMount) bpInspMount(document.getElementById('bpx-pj-insp'), bpInspJobCtx(job()));
      return r;
    };

    var close = window.bpCloseModal;
    window.bpCloseModal = function () {
      var m = document.getElementById('bpx-modal');
      if (m && m.classList.contains('pjs')) {
        if (document.querySelector('.bpe')) return;     /* the blueprint editor closes itself first */
        m.id = 'bpx-modal-closing'; m.classList.add('pjs-closing');
        Array.prototype.forEach.call(m.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
        m.style.pointerEvents = 'none';
        setTimeout(function () { m.remove(); }, 230);
        var lf = lastFocus; lastFocus = null;
        if (lf && lf.focus && document.contains(lf)) try { lf.focus({ preventScroll: true }); } catch (e) {}
        return;
      }
      return close.apply(this, arguments);
    };

    ['bpProjPhotosRender', 'bpProjDocsRender'].forEach(function (n) {
      var f = window[n]; if (typeof f !== 'function') return;
      window[n] = function () { var r = f.apply(this, arguments); try { if (document.querySelector('.pjs')) decorate(); } catch (e) {} return r; };
    });
    if (window.bpPF && bpPF.bpRender && !bpPF.bpRender._pjs) {
      var br = bpPF.bpRender;
      bpPF.bpRender = function () { var r = br.apply(this, arguments); try { if (document.querySelector('.pjs')) decorate(); } catch (e) {} return r; };
      bpPF.bpRender._pjs = true;
    }
  }
  window.bpPjsMore = function (e) {
    e.stopPropagation();
    var b = e.currentTarget, m = b.parentNode.querySelector('.pjs-menu') || b._menu; if (!m) return;
    b._menu = m;
    /* 2026-11-20: iPhone Safari clipped the menu because it lived inside the sideways-scrolling tab
       row; it now opens from the sheet itself (and on a phone, as a panel from the bottom) */
    var phoneW = (window.innerWidth || 1000) <= 760;
    /* on a phone the sheet itself scrolls, so the panel hangs off the dark backdrop around it instead */
    var host = (phoneW ? b.closest('.bpx-modal') : null) || b.closest('.pjs-card') || b.closest('#bpx-modal') || document.body;
    if (m.parentNode !== host) host.appendChild(m);
    m.classList.toggle('pjs-menu-sheet', phoneW);
    m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden));
    if (!m.hidden && phoneW) {
      m.style.top = m.style.left = m.style.maxHeight = '';
      setTimeout(function () { document.addEventListener('click', function off(ev) { if (!m.contains(ev.target)) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); } document.removeEventListener('click', off, true); }, true); }, 0);
      return;
    }
    if (!m.hidden) {
      var r = b.getBoundingClientRect();
      /* the sheet is animated, so 'fixed' is measured from the sheet, not the window: find that origin first */
      m.style.top = '0px'; m.style.left = '0px'; var o = m.getBoundingClientRect(), mw = m.offsetWidth || 220;
      m.style.maxHeight = Math.max(180, window.innerHeight - r.bottom - 96) + 'px'; m.style.top = (r.bottom + 6 - o.top) + 'px'; m.style.left = (Math.max(8, Math.min(r.left, window.innerWidth - mw - 12)) - o.left) + 'px';
      setTimeout(function () { document.addEventListener('click', function off(ev) { if (!m.contains(ev.target)) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); } document.removeEventListener('click', off, true); }, true); }, 0);
    }
  };
  hook();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);

  /* Esc closes; Tab stays inside the sheet */
  document.addEventListener('keydown', function (e) {
    var m = document.getElementById('bpx-modal');
    if (!m || !m.classList.contains('pjs') || document.querySelector('.bpe')) return;
    if (e.key === 'Escape') { e.preventDefault(); bpCloseModal(); return; }
    if (e.key !== 'Tab') return;
    var card = m.querySelector('.pjs-card');
    var f = Array.prototype.filter.call(card.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])'),
      function (x) { return x.offsetParent !== null && x.style.display !== 'none'; });
    if (!f.length) return;
    var a = f[0], z = f[f.length - 1];
    if (!card.contains(document.activeElement)) { e.preventDefault(); a.focus(); return; }
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }, true);
})();
