/* =====================================================================
   Lisa does it (2026-11-22)
   The in-app assistant (Ask AI) can return a "task" (supabase/functions/
   ai-chat, owner mode). This opens the matching screen and fills it in:
   estimate, invoice, new contact, new job, a visit, an expense.

   It never sends, saves, charges or texts. The owner checks what was filled
   in and taps the button, the same as if they had typed it.

   Also here: the microphone in the Ask AI box (the phone's own speech to
   text, free and on the device when it can be), and bpLisaCtx(), the
   owner's job and customer names sent along so "invoice Bob Lee" finds Bob.
   ===================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var NAME = function () { return window.BP_AI_NAME || 'Lisa'; };
  var phone = function () { var x = $('bpx'); return !!(x && x.classList.contains('bp-m')) || window.innerWidth <= 760; };
  var low = function (s) { return String(s || '').toLowerCase().replace(/\(sample\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); };

  /* ------------------------------------------------ what Lisa is told --- */
  window.bpLisaCtx = function () {
    var jobs = ((window.bpJobsGet && bpJobsGet()) || []).filter(function (j) { return j && j.status !== 'archived'; }).slice(0, 40)
      .map(function (j) { return { id: j.id, name: j.name || '', title: j.title || '', status: j.status || '', estimate: +j.estimate || 0, collected: +j.collected || 0 }; });
    var contacts = (window._bpContacts || []).map(function (c) { return c && c.name; }).filter(Boolean).slice(0, 80);
    return { jobs: jobs, contacts: contacts };
  };

  /* ------------------------------------------------------- matching --- */
  function score(a, b) {
    a = low(a); b = low(b); if (!a || !b) return 0;
    if (a === b) return 3;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 2;
    var fa = a.split(' ')[0], wb = b.split(' ');
    return wb.indexOf(fa) >= 0 || (a.split(' ').slice(-1)[0] === wb.slice(-1)[0] && wb.length > 1) ? 1 : 0;
  }
  function best(list, name, key) {
    var top = null, s0 = 0;
    (list || []).forEach(function (x) { var s = score(name, key(x)); if (s > s0) { s0 = s; top = x; } });
    return top;
  }
  async function contactFor(name) {
    if (!name) return null;
    if (window.bpEnsureContacts) { try { await bpEnsureContacts(); } catch (e) {} }
    return best(window._bpContacts, name, function (c) { return c.name; });
  }
  function jobFor(idOrName, customer) {
    var js = (window.bpJobsGet && bpJobsGet()) || [];
    var byId = idOrName && js.filter(function (j) { return j.id === idOrName; })[0];
    if (byId) return byId;
    var live = js.filter(function (j) { return j.status === 'active' || j.status === 'quote'; });
    return best(live, idOrName || customer, function (j) { return j.name + ' ' + (j.title || ''); }) || (customer ? best(live, customer, function (j) { return j.name; }) : null);
  }
  function setVal(id, v) { var e = $(id); if (!e || v == null || v === '') return; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function pickOpt(id, text) {
    var e = $(id); if (!e || !text) return false;
    var o = Array.prototype.filter.call(e.options || [], function (x) { return x.value && score(text, x.textContent) > 0; })[0];
    if (!o) return false; e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }
  async function until(fn, ms) { for (var t = 0; t < (ms || 3000); t += 100) { var v = fn(); if (v) return v; await wait(100); } return null; }
  function money(n) { return '$' + (+n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

  /* the owner sees what Lisa filled in, and what is left for them to do */
  function told(what, verb) {
    var t = NAME() + ' filled in ' + what + '. Check it, then tap ' + (verb || 'Save') + '.';
    if (window.bpToast) bpToast(t, 'success');
    /* a soft glow on the screen she filled */
    setTimeout(function () {
      var m = document.querySelector('.bpx-modal .bpx-modalcard') || document.querySelector('#bpxViewArea');
      if (m) { m.classList.add('bp-lisa-fill'); setTimeout(function () { m.classList.remove('bp-lisa-fill'); }, 2400); }
    }, 250);
  }

  /* ------------------------------------------------------- the tasks --- */
  var DO = {
    contact: async function (t) {
      bpNav('contacts'); await wait(350);
      bpOpenAdd(); await until(function () { return $('bpx-f-name'); });
      setVal('bpx-f-name', t.name || t.customer); setVal('bpx-f-phone', t.phone); setVal('bpx-f-email', t.email);
      var l = $('bpx-f-lisa'); if (l) l.checked = false;
      told('the new contact' + (t.name ? ' for ' + t.name : ''), 'Create');
    },
    job: async function (t) {
      bpNav('activejobs'); await wait(350);
      bpAddJobOpen(); await until(function () { return $('bpx-nj-name'); });
      setVal('bpx-nj-name', t.customer || t.name); setVal('bpx-nj-title', t.title); if (t.price) setVal('bpx-nj-est', money(t.price));
      told('the new job' + (t.customer ? ' for ' + t.customer : ''), 'Add job');
    },
    expense: async function (t) {
      var j = t.job ? jobFor(t.job) : null;
      if (j && window.bpProjOpen) {
        bpProjOpen(j.id); await until(function () { return document.querySelector('.pjs-card'); });
        if (window.bpProjTab) bpProjTab('money');
        var list = window._bpProjExp;
        if (Array.isArray(list) && window.bpProjExpRender) {
          list.push({ cat: t.category || 'Materials', amt: t.amount || '', note: t.note || '' });
          bpProjExpRender(); if (window.bpProjBudgetRender) bpProjBudgetRender();
          setTimeout(function () { var r = document.querySelectorAll('.bpx-exprow'), last = r[r.length - 1]; if (last) last.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 200);
        }
        told('a ' + money(t.amount) + ' expense on ' + (j.name || 'the job'), 'Save');
        return;
      }
      bpNav('finexpenses'); await wait(350);
      bpFinAddOpen('expense'); await until(function () { return $('bpx-fa-amt'); });
      if (t.amount) setVal('bpx-fa-amt', money(t.amount));
      if (t.category) pickOpt('bpx-fa-cat', t.category);
      setVal('bpx-fa-note', t.note);
      told('the expense', 'Add');
    },
    visit: async function (t) {
      bpNav('calendar'); await wait(500);
      if (!window.bpOpenBook) return;
      bpOpenBook(); await until(function () { return $('bpx-bk-title'); }, 6000);
      var c = await contactFor(t.customer);
      if (c && $('bpx-bk-contact')) { $('bpx-bk-contact').value = c.id; $('bpx-bk-contact').dispatchEvent(new Event('change', { bubbles: true })); }
      var tm = t.time && t.time.length === 4 ? '0' + t.time : t.time;
      setVal('bpx-bk-title', t.title); setVal('bpx-bk-addr', t.address);
      /* a job booking has plain date and time boxes */
      setVal('bpx-bk-date', t.date); setVal('bpx-bk-time', tm);
      /* a visit: either the day and time boxes (no booking calendar) or the month, day, time picker */
      await until(function () { var el = $('bpx-bk-slots'); return $('bpx-bk-mday') || (el && (el.querySelector('.mdt3') || !/Finding/.test(el.textContent))); }, 6000);
      if ($('bpx-bk-mday')) { setVal('bpx-bk-mday', t.date); setVal('bpx-bk-mtime', tm); }
      else if (t.date) {
        var pick = function (sel) { var b = document.querySelector('#bpx-bk-slots ' + sel); if (b) b.click(); return !!b; };
        if (pick('[data-m="' + t.date.slice(0, 7) + '"]') && pick('[data-d="' + t.date + '"]') && tm) {
          var bs = document.querySelectorAll('#bpx-bk-slots [data-t]');
          Array.prototype.some.call(bs, function (b) { var d = new Date(b.getAttribute('data-t')), hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); if (hm === tm) { b.click(); return true; } return false; });
        }
      }
      told('the visit' + (t.customer ? ' for ' + t.customer : ''), 'Book');
    },
    estimate: async function (t) {
      if (!window.bpQuoteDraft) return;
      var c = await contactFor(t.customer);
      await bpQuoteDraft(c ? c.id : null, { customer: t.customer, title: t.title, addr: t.address, note: t.note, lines: t.lines || [] });
      told('the estimate' + (t.customer ? ' for ' + t.customer : ''), 'Send');
    },
    invoice: async function (t) {
      if (!window.bpInvOpen) return;
      var j = jobFor(t.job, t.customer), c = (j && j.contactId) ? null : await contactFor(t.customer || (j && j.name));
      await bpInvOpen(j && j.contactId ? j.contactId : (c ? c.id : null), j ? j.id : null);
      var Q = window.BPQ;
      if (t.amount && Q && Q.inv) {
        Q.inv.lines = [{ id: 'il' + Date.now().toString(36), name: t.what || (j ? (j.title || 'Project') : 'Invoice'), desc: '', qty: 1, price: t.amount }];
        Q.inv.baseManual = false; if (Q.inv.contactId) Q.inv.step = 'amt';
        if (Q.invType) Q.invType('full');
      }
      told('the invoice' + (t.customer || (j && j.name) ? ' for ' + (t.customer || j.name) : '') + (t.amount ? ' (' + money(t.amount) + ')' : ''), 'Send');
    }
  };

  window.bpLisaDo = async function (task, node) {
    var f = task && DO[task.type]; if (!f) return;
    if (phone() && window.bpShell && bpShell.aiClose) bpShell.aiClose();   /* the form needs the screen */
    try { await f(task); } catch (e) { if (window.bpToast) bpToast('Could not open that. Try again, or do it from the menu.', 'error'); }
    /* in the chat, a way back to it */
    if (node && node.parentNode && !node.querySelector('.oaw-redo')) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'oaw-redo'; b.textContent = 'Open it again';
      b.onclick = function () { window.bpLisaDo(task); }; node.appendChild(document.createElement('br')); node.appendChild(b);
    }
  };

  /* ------------------------------------------------------- the mic --- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function css() {
    if ($('bpLisaCss')) return;
    var s = document.createElement('style'); s.id = 'bpLisaCss';
    s.textContent = '.oaw-mic{flex:none;width:42px;height:42px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;background:rgba(0,111,255,.1);color:#006fff;padding:0;transition:background .2s,color .2s}'
      + '.oaw-mic svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
      + '.oaw-mic.on{background:#006fff;color:#fff;animation:oawMic 1.2s ease-out infinite}'
      + '@keyframes oawMic{0%{box-shadow:0 0 0 0 rgba(0,111,255,.5)}80%{box-shadow:0 0 0 12px rgba(0,111,255,0)}100%{box-shadow:0 0 0 0 rgba(0,111,255,0)}}'
      + '.oaw-redo{all:unset;margin-top:6px;color:#006fff;font-weight:600;cursor:pointer;font-size:14px}'
      + '.bp-lisa-fill{animation:bpLisaFill 2.2s ease-out}'
      + '@keyframes bpLisaFill{0%{box-shadow:0 0 0 0 rgba(0,111,255,.0)}20%{box-shadow:0 0 0 4px rgba(0,111,255,.45)}100%{box-shadow:0 0 0 0 rgba(0,111,255,0)}}'
      + '@media (prefers-reduced-motion:reduce){.oaw-mic.on,.bp-lisa-fill{animation:none}}';
    document.head.appendChild(s);
  }
  function mic() {
    var row = document.querySelector('.oaw-in'), inp = $('oawIn');
    if (!row || !inp || row.querySelector('.oaw-mic') || !SR) return;
    css();
    var b = document.createElement('button'); b.type = 'button'; b.className = 'oaw-mic'; b.setAttribute('aria-label', 'Talk to ' + NAME());
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    row.insertBefore(b, inp);
    var rec = null, said = '';
    b.onclick = function () {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.continuous = false; said = '';
      rec.onresult = function (e) { said = ''; for (var i = 0; i < e.results.length; i++) said += e.results[i][0].transcript; inp.value = said; };
      rec.onerror = function (e) { if (e.error === 'not-allowed' && window.bpToast) bpToast('Allow the microphone to talk to ' + NAME() + '.', 'error'); };
      rec.onend = function () { b.classList.remove('on'); rec = null; if (said.trim() && window.bpLisaAsk) window.bpLisaAsk(said.trim()); };
      b.classList.add('on'); inp.placeholder = 'Listening…';
      try { rec.start(); } catch (e) { b.classList.remove('on'); rec = null; }
      setTimeout(function () { inp.placeholder = 'Ask ' + NAME() + ' anything'; }, 6000);
    };
  }
  var tries = 0; (function go() { mic(); if (!document.querySelector('.oaw-mic') && SR && ++tries < 40) setTimeout(go, 500); })();
})();
