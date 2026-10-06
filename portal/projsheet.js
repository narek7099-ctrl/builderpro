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
  var lastFocus = null;

  function job(id) { return (window.bpJobsGet ? bpJobsGet() : []).filter(function (x) { return x.id === (id || window._bpProjId); })[0]; }
  function initials(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function isCrew() { return !!(window.bpTeamIsCrew && bpTeamIsCrew()); }

  function ring(pct, label) {
    var r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return '<div class="pjs-ring" role="img" aria-label="' + pct + '% ' + label + '"><svg viewBox="0 0 64 64" aria-hidden="true">'
      + '<circle cx="32" cy="32" r="' + r + '" class="tr"/><circle cx="32" cy="32" r="' + r + '" class="fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>'
      + '<span><b>' + pct + '%</b><small>' + label + '</small></span></div>';
  }

  function hero(j) {
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

  function emptyState(ico, title, text, btn, onclick) {
    return '<div class="pjs-empty"><span class="ms">' + ico + '</span><b>' + title + '</b><p>' + text + '</p>'
      + '<button type="button" class="pm-btn" onclick="' + onclick + '"><span class="ms">add</span>' + btn + '</button></div>';
  }
  /* empty tabs: one clear action instead of a line of grey text plus a button */
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
    bar.innerHTML = keys.map(function (k, i) {
      var t = TABS[k] || [k, 'tab'];
      return '<button type="button" class="bpx-jt pjs-tab' + (i === 0 ? ' on' : '') + '" role="tab" aria-selected="' + (i === 0) + '" data-pj-tab="' + k + '" onclick="bpProjTab(\'' + k + '\')">'
        + '<span class="ms">' + t[1] + '</span><span class="pjs-tl">' + t[0] + '</span><span class="pjs-n"></span></button>';
    }).join('');
  }

  function enhance(id) {
    var m = document.getElementById('bpx-modal'); if (!m) return;
    var card = m.querySelector('.bpx-modalcard'); if (!card || !card.querySelector('#bpx-pj-tabs')) return;
    var j = job(id); if (!j) return;
    m.classList.add('pjs'); card.removeAttribute('style'); card.classList.add('pjs-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'pjs-title');
    var h3 = card.querySelector(':scope > h3'), sub = card.querySelector(':scope > .bpx-sub');
    if (sub) sub.remove();
    var hh = document.createElement('div'); hh.innerHTML = hero(j);
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
      if (k !== 'permits' && k !== 'contract' && k !== 'materials' && k !== 'subs' && k !== 'cust' && k !== 'inspect') cardify(p, k);
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
      document.querySelectorAll('.pjs [data-pj-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.classList.contains('on'))); });
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      var body = document.querySelector('.pjs .pjs-body'); if (body) body.scrollTop = 0;
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
