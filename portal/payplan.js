/* ==================================================================
   Payment plans: how each customer pays, and what is owed next.

   Every project (and every agreed estimate) can carry j.pay:
     method 'full'       one invoice for the whole job, now or when it is done
            'deposit'    a deposit, optional progress payments, the final balance
            'financing'  a lender pays the contractor; the customer pays the lender
            'insurance'  the homeowner's deductible, then the insurer's checks:
                         first check (ACV), supplements, held-back depreciation

   Money is never tracked twice. Everything paid lands in j.collected, as it
   already does (card payments through stripe-webhook, the HighLevel "Invoice
   Paid" workflow through payment-sync, and "Paid so far" typed by hand).
   A plan's steps are paid in order out of that one number, so a payment
   from anywhere moves the plan along.

   Deposit caps: some states limit the deposit on home improvement work.
   The cap is saved with the plan (pay.dep.max / pay.dep.capPct) so the
   homeowner's page (customer-portal) shows the same amounts.

   Where it shows:
     Finances > Invoices > Ready to invoice   the next payment due on each job
     the project's Money tab                  the plan, its steps, the claim or loan
     the homeowner's page                     the schedule, the loan link, the claim
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var escA = function (s) { return esc(s).replace(/'/g, '&#39;'); };
  var r2 = function (n) { return Math.round((+n || 0) * 100) / 100; };
  var num = function (v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  var m2 = function (n) { var v = r2(n); return (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var m0 = function (n) { return window.bpMoneyFmt ? bpMoneyFmt(n) : m2(n); };
  var uid = function (p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var toast = function (t, k) { if (window.bpToast) bpToast(t, k); };
  var day = function (t) { return t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };

  var P = window.BPP = { draft: null };

  /* ---------- jobs ---------- */
  function jobs() { return window.bpJobsGet ? bpJobsGet() : []; }
  function job(id) {
    var j = jobs().filter(function (x) { return x && x.id === id; })[0];
    if (!j && window.BPQ && BPQ._sample && BPQ._sample.id === id) j = BPQ._sample;
    return j || null;
  }
  function save() { if (window.bpJobsSet) bpJobsSet(jobs()); }

  /* ---------- deposit caps (home improvement) ----------
     California: 10% of the contract or $1,000, whichever is less (B&P 7159.5).
     Maryland and Massachusetts: one third of the contract. */
  var CAPS = {
    CA: { pct: 10, max: 1000, say: 'California caps a home improvement deposit at 10% of the price or $1,000, whichever is less.' },
    MD: { pct: 33.33, say: 'Maryland caps a home improvement deposit at one third of the price.' },
    MA: { pct: 33.33, say: 'Massachusetts caps a home improvement deposit at one third of the price.' }
  };
  function state() { try { var t = window.BPQ && BPQ.stateTax ? BPQ.stateTax() : null; return t ? t.st : ''; } catch (e) { return ''; } }
  P.cap = function () { return CAPS[state()] || null; };
  function defDepPct() { var c = P.cap(); return c ? Math.min(c.pct, 30) : 30; }

  var LENDERS = ['Wisetack', 'GreenSky', 'Service Finance', 'Hearth', 'Enhancify', 'Acorn Finance'];
  function finSettings() { try { return ((window.bpSettingsGet ? bpSettingsGet() : {}) || {}).financing || {}; } catch (e) { return {}; } }

  /* ---------- the maths ---------- */
  P.contract = function (j) {
    if (!j) return 0;
    var calc = function () { try { var c = window.BPQ && BPQ.calc ? BPQ.calc(j.id) : null; return c ? c.total : 0; } catch (e) { return 0; } };
    if (j.status === 'quote' && j.quote) return r2(calc());
    return r2(+j.estimate || (j.quote ? calc() : 0));
  };
  var agreed = function (j) { return j.status === 'active' || j.status === 'done' || !!(j.quote && j.quote.status === 'accepted'); };
  var phases = function (j) { return (j.plan && Array.isArray(j.plan.phases)) ? j.plan.phases : []; };
  var phaseDone = function (j, name) { return phases(j).some(function (p) { return p && p.name === name && p.doneAt; }); };
  var allDone = function (j) { var ph = phases(j); return ph.length > 0 && ph.every(function (p) { return p && p.doneAt; }); };
  var finished = function (j) { return j.status === 'done' || allDone(j); };
  var METHODS = {
    full: ['Pay in full', 'One invoice for the whole job', 'payments'],
    deposit: ['Deposit, then the rest', 'A deposit up front, progress payments if you want them, then the final balance', 'event_repeat'],
    financing: ['Financing', 'The customer borrows from a lender, and the lender pays you', 'account_balance'],
    insurance: ['Insurance claim', 'Their deductible, then the insurance checks', 'shield']
  };
  P.label = function (j) { var p = j && j.pay; return p && METHODS[p.method] ? METHODS[p.method][0] : 'Not set'; };
  function depAmount(pay, C) {
    var d = pay.dep || {}, a = r2(C * (+d.pct || 0) / 100);
    if (+d.capPct > 0) a = Math.min(a, r2(C * d.capPct / 100));
    if (+d.max > 0) a = Math.min(a, +d.max);
    return Math.max(0, a);
  }
  /* insurance: what the insurer has paid so far (checks marked received) */
  function insReceived(ins) { return r2((ins && ins.checks || []).reduce(function (t, c) { return t + (c.status === 'received' ? (+c.amount || 0) : 0); }, 0)); }

  /* every step with its amount, what is paid of it and where it stands */
  P.steps = function (j) {
    var pay = j && j.pay; if (!pay) return [];
    var C = P.contract(j), out = [];
    if (pay.method === 'full') {
      out.push({ id: 'full', kind: 'full', name: 'Full payment', amount: C, when: pay.fullWhen === 'done' ? 'done' : 'now', trig: pay.fullWhen === 'done' ? finished(j) : agreed(j) });
    } else if (pay.method === 'deposit') {
      var dep = depAmount(pay, C), used = dep;
      out.push({ id: 'dep', kind: 'deposit', name: 'Deposit', amount: dep, when: 'now', trig: agreed(j) });
      (pay.progress || []).forEach(function (s) {
        var a = r2(C * (+s.pct || 0) / 100); used += a;
        out.push({ id: s.id, kind: 'progress', name: s.name || 'Progress payment', amount: a, pct: +s.pct || 0, when: s.phase ? 'phase' : 'ready', phase: s.phase || '', trig: !!s.ready || (!!s.phase && phaseDone(j, s.phase)) });
      });
      out.push({ id: 'final', kind: 'final', name: 'Final balance', amount: Math.max(0, r2(C - used)), when: 'done', trig: !!pay.finalReady || finished(j) });
    } else if (pay.method === 'insurance') {
      var ded = r2(+(pay.ins || {}).deductible || 0);
      if (ded > 0) out.push({ id: 'ded', kind: 'deductible', name: 'Deductible', amount: ded, when: 'now', trig: agreed(j) });
    }
    /* paid in order out of what the customer has paid (for a claim, what the homeowner paid) */
    var rem = r2(+j.collected || 0);
    if (pay.method === 'insurance') rem = Math.max(0, r2(rem - insReceived(pay.ins)));
    var sent = pay.sent || {};
    out.forEach(function (s, i) {
      s.n = i + 1; s.of = out.length;
      s.paid = Math.min(s.amount, rem); rem = r2(rem - s.paid);
      s.left = r2(s.amount - s.paid);
      s.sentAt = sent[s.id] ? sent[s.id].at : 0;
      s.state = s.amount <= 0.004 ? 'none' : s.left <= 0.009 ? 'paid' : s.sentAt ? 'sent' : s.trig ? 'due' : 'later';
    });
    return out.filter(function (s) { return s.state !== 'none'; });
  };
  P.next = function (j) { return P.steps(j).filter(function (s) { return s.state === 'due'; })[0] || null; };
  P.step = function (j, id) { return P.steps(j).filter(function (s) { return s.id === id; })[0] || null; };
  P.markSent = function (j, stepId, amount, inv) {
    if (!j || !j.pay || !stepId) return;
    j.pay.sent = j.pay.sent || {}; j.pay.sent[stepId] = { at: Date.now(), amount: r2(amount), inv: inv || '' };
  };
  /* the words for "when" */
  function whenText(s) {
    if (s.when === 'now') return 'Due when the estimate is agreed';
    if (s.when === 'done') return s.kind === 'full' ? 'Due when the job is done' : 'Due when the job is done';
    if (s.when === 'phase') return 'Due when “' + s.phase + '” is done';
    return 'Due when you mark it ready';
  }

  /* ---------- money in: one place ---------- */
  function collect(j, delta) {
    j.collected = r2(Math.max(0, (+j.collected || 0) + delta));
    /* the open project sheet keeps its own "Paid so far" until Save: keep it in step */
    if (window._bpProjId === j.id) { var inp = $('bpx-pj-paid'); if (inp) { inp.value = m0(j.collected); if (window.bpProjBal) try { bpProjBal(); } catch (e) {} } }
  }
  function addExpense(j, key, amt, note) {
    var e = { cat: 'Other', amt: r2(amt), note: note, key: key, when: Date.now() };
    j.expenses = (j.expenses || []).filter(function (x) { return x.key !== key; });
    if (amt > 0) j.expenses.push(e);
    if (window._bpProjId === j.id && Array.isArray(window._bpProjExp)) {
      var list = window._bpProjExp.filter(function (x) { return x.key !== key; });
      if (amt > 0) list.push(Object.assign({}, e));
      window._bpProjExp.length = 0; Array.prototype.push.apply(window._bpProjExp, list);
      if (window.bpProjExpRender) try { bpProjExpRender(); if (window.bpProjBudgetRender) bpProjBudgetRender(); } catch (e2) {}
    }
  }

  /* ================================================================
     The plan picker
     ================================================================ */
  function draftFrom(j) {
    var p = j.pay || {}, fs = finSettings(), ins = p.ins || {};
    var acv = (ins.checks || []).filter(function (c) { return c.kind === 'acv'; })[0] || {};
    var dp = (ins.checks || []).filter(function (c) { return c.kind === 'dep'; })[0] || {};
    var C = P.contract(j);
    return {
      jid: j.id,
      method: p.method || (C >= 2500 ? 'deposit' : 'full'),
      fullWhen: p.fullWhen || 'now',
      depPct: p.dep ? +p.dep.pct : defDepPct(),
      progress: (p.progress || []).map(function (s) { return { id: s.id, name: s.name, pct: s.pct, phase: s.phase || '', ready: !!s.ready }; }),
      lender: (p.fin && p.fin.lender) || fs.lender || 'Wisetack', link: (p.fin && p.fin.link) || fs.link || '', saveLender: true,
      carrier: ins.carrier || '', claim: ins.claim || '', deductible: ins.deductible != null ? ins.deductible : '', acv: acv.amount || '', acvMortgage: !!acv.mortgage,
      dep: dp.amount || '', adjuster: ins.adjuster || '', adjPhone: ins.adjPhone || ''
    };
  }
  /* open the picker: in the given container (the project sheet), else in a modal */
  P.choose = function (jid, hostId) {
    var j = job(jid); if (!j) return;
    P.draft = draftFrom(j); P.draft.host = hostId || '';
    if (!hostId) {
      if (!window.bpModal) return;
      bpModal('<div id="pp-modal-host"></div>');
      var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '720px'; mc.style.width = '95vw'; }
      P.draft.host = 'pp-modal-host'; P.draft.modal = true;
    }
    drawPick();
  };
  function drawPick() {
    var d = P.draft, host = d && $(d.host); if (!host) return;
    var j = job(d.jid); if (!j) return;
    host.innerHTML = '<div class="pp-pick">'
      + '<h3 class="pp-t">How is ' + esc(String(j.name || 'the customer').split(' ')[0]) + ' paying?</h3>'
      + '<p class="pp-s">' + esc(j.title && j.title !== 'New estimate' ? j.title : 'This job') + ' · ' + m2(P.contract(j)) + '</p>'
      + '<div class="pp-opts" role="radiogroup">' + Object.keys(METHODS).map(function (k) {
        var m = METHODS[k];
        return '<button type="button" role="radio" aria-checked="' + (d.method === k) + '" class="pp-opt' + (d.method === k ? ' on' : '') + '" onclick="BPP.dSet(\'method\',\'' + k + '\',1)"><span class="ms">' + m[2] + '</span><b>' + m[0] + '</b><small>' + m[1] + '</small></button>';
      }).join('') + '</div>'
      + '<div class="pp-cfg" id="pp-cfg">' + cfgHtml(j) + '</div>'
      + '<div class="pp-sum" id="pp-sum"></div>'
      + '<div class="qb-msg" id="pp-msg"></div>'
      + '<div class="pp-acts"><button type="button" class="bpx-btn ghost" onclick="BPP.dCancel()">Cancel</button><button type="button" class="bpx-addbtn" onclick="BPP.dSave()">Save payment plan</button></div>'
      + '</div>';
    drawSum();
  }
  function fld(label, inner, hint) { return '<label class="pp-f"><span>' + label + '</span>' + inner + (hint ? '<small>' + hint + '</small>' : '') + '</label>'; }
  function inp(key, val, ph, kind) {
    var money = kind === 'money', pct = kind === 'pct';
    var i = '<input ' + (money || pct ? 'type="number" min="0" step="any" inputmode="decimal" ' : '') + 'value="' + escA(val) + '" placeholder="' + escA(ph || '') + '" oninput="BPP.dSet(\'' + key + '\',this.value)">';
    return money ? '<span class="qx-in"><i>$</i>' + i + '</span>' : pct ? '<span class="qx-in">' + i + '<i>%</i></span>' : i;
  }
  function cfgHtml(j) {
    var d = P.draft, cap = P.cap();
    if (d.method === 'full') {
      return '<div class="pp-seg">' + [['now', 'Bill now'], ['done', 'Bill when the job is done']].map(function (o) {
        return '<button type="button" class="' + (d.fullWhen === o[0] ? 'on' : '') + '" onclick="BPP.dSet(\'fullWhen\',\'' + o[0] + '\',1)">' + o[1] + '</button>';
      }).join('') + '</div><p class="pp-note">Best for small repairs and quick jobs. The invoice shows up in Ready to invoice ' + (d.fullWhen === 'done' ? 'when you mark the job done.' : 'right away.') + '</p>';
    }
    if (d.method === 'deposit') {
      var ph = phases(j).map(function (p) { return p && p.name; }).filter(Boolean);
      return '<div class="pp-grid2">' + fld('Deposit', inp('depPct', d.depPct, '30', 'pct'), cap ? esc(cap.say) + ' We keep it under that.' : 'Due when the estimate is agreed.') + '<div class="pp-calc" id="pp-depamt"></div></div>'
        + '<div class="pp-sub">Progress payments <small>optional, for longer jobs</small></div>'
        + (d.progress.length ? '<div class="pp-prog">' + d.progress.map(function (s, i) {
          return '<div class="pp-pr"><input value="' + escA(s.name) + '" placeholder="e.g. Materials delivered" aria-label="Name" oninput="BPP.dProg(' + i + ',\'name\',this.value)">'
            + '<span class="qx-in"><input type="number" min="0" step="any" value="' + escA(s.pct) + '" placeholder="25" aria-label="Percent of the price" oninput="BPP.dProg(' + i + ',\'pct\',this.value)"><i>%</i></span>'
            + '<select aria-label="When it is due" onchange="BPP.dProg(' + i + ',\'phase\',this.value)"><option value="">When I mark it ready</option>'
            + ph.map(function (n) { return '<option value="' + escA(n) + '"' + (s.phase === n ? ' selected' : '') + '>When “' + esc(n) + '” is done</option>'; }).join('') + '</select>'
            + '<button type="button" class="qb-x" aria-label="Remove" onclick="BPP.dProgDel(' + i + ')">&times;</button></div>';
        }).join('') + '</div>' : '')
        + '<button type="button" class="bpx-rowbtn" onclick="BPP.dProgAdd()">+ Add a progress payment</button>'
        + '<p class="pp-note">The final balance is whatever is left. It shows up in Ready to invoice when you mark the job done' + (ph.length ? ' or every phase is ticked off' : '') + '.</p>';
    }
    if (d.method === 'financing') {
      var opts = LENDERS.indexOf(d.lender) < 0 && d.lender ? LENDERS.concat([d.lender]) : LENDERS;
      return '<div class="pp-grid2">' + fld('Lender', '<select onchange="BPP.dSet(\'lender\',this.value)">' + opts.map(function (n) { return '<option' + (d.lender === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>')
        + fld('Your apply link from the lender', inp('link', d.link, 'https://…'), 'Every lender gives you a link for your customers. It shows on their project page.') + '</div>'
        + '<label class="pp-chk"><input type="checkbox"' + (d.saveLender ? ' checked' : '') + ' onchange="BPP.dSet(\'saveLender\',this.checked)">Offer this lender to all my customers</label>'
        + '<ol class="pp-how"><li>Your customer applies with the lender from their project page, or a link you text them. It is their loan; you never see their credit.</li>'
        + '<li>You see Approved here with the amount.</li><li>You do the job. When it is done, the lender pays you, usually in 1 to 3 days, less their fee.</li>'
        + '<li>Mark it Funded with what landed in your bank. The fee is booked as a cost on the job.</li></ol>';
    }
    return '<div class="pp-grid2">' + fld('Insurance company', inp('carrier', d.carrier, 'e.g. State Farm')) + fld('Claim number', inp('claim', d.claim, ''))
      + fld('Deductible', inp('deductible', d.deductible, '1000', 'money'), 'What the homeowner pays you.') + fld('First check (ACV)', inp('acv', d.acv, 'from the adjuster’s estimate', 'money'), 'Optional now. Add it when the estimate comes in.')
      + fld('Depreciation held back', inp('dep', d.dep, '', 'money'), 'Released when the work is finished.') + '<div></div>'
      + fld('Adjuster', inp('adjuster', d.adjuster, 'Name')) + fld('Adjuster phone', inp('adjPhone', d.adjPhone, '')) + '</div>'
      + '<label class="pp-chk"><input type="checkbox"' + (d.acvMortgage ? ' checked' : '') + ' onchange="BPP.dSet(\'acvMortgage\',this.checked)">The checks are made out to a mortgage company too</label>'
      + '<ol class="pp-how"><li>The homeowner pays you the deductible. It shows up in Ready to invoice.</li>'
      + '<li>The insurer sends the first check (the price less depreciation and the deductible). Mark it received when you have it.</li>'
      + '<li>Found damage the adjuster missed? Add a supplement and track it until it is paid.</li>'
      + '<li>When the work is done, send the insurer the completion invoice from here. They release the held-back depreciation, and you get a reminder if it is late.</li></ol>';
  }
  function drawSum() {
    var d = P.draft, el = $('pp-sum'); if (!el || !d) return;
    var j = job(d.jid); if (!j) return;
    var C = P.contract(j), rows = [];
    if (d.method === 'full') rows.push(['Full payment', C, d.fullWhen === 'done' ? 'when the job is done' : 'now']);
    else if (d.method === 'deposit') {
      var tmp = { dep: depCfg(), progress: d.progress }, dep = depAmount(tmp, C), used = dep;
      rows.push(['Deposit', dep, 'now']);
      d.progress.forEach(function (s) { var a = r2(C * (+s.pct || 0) / 100); used += a; rows.push([s.name || 'Progress payment', a, s.phase ? 'after ' + s.phase : 'when you mark it ready']); });
      rows.push(['Final balance', Math.max(0, r2(C - used)), 'when the job is done']);
      var da = $('pp-depamt'); if (da) da.innerHTML = '= <b>' + m2(dep) + '</b>' + (r2(C * (+d.depPct || 0) / 100) > dep + 0.004 ? '<small>capped</small>' : '');
    } else if (d.method === 'insurance') {
      var ded = num(d.deductible), acv = num(d.acv), dp = num(d.dep);
      rows.push(['Deductible (homeowner)', ded, 'now']);
      if (acv) rows.push(['First check (insurance)', acv, 'when it arrives']);
      if (dp) rows.push(['Depreciation (insurance)', dp, 'after the work is done']);
      if (ded + acv + dp > 0 && Math.abs(r2(ded + acv + dp) - C) > 0.5) rows.push(['Claim total vs your price', r2(ded + acv + dp - C), 'difference']);
    } else {
      rows.push(['Paid by ' + (d.lender || 'the lender'), C, 'after the job is done']);
    }
    el.innerHTML = '<table class="qx-st"><tbody>' + rows.map(function (r) { return '<tr><td>' + esc(r[0]) + ' <small>' + esc(r[2]) + '</small></td><td></td><td>' + m2(r[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function depCfg() { var c = P.cap(), d = P.draft; return { pct: Math.max(0, num(d.depPct)), max: c && c.max ? c.max : 0, capPct: c ? c.pct : 0 }; }
  P.dSet = function (k, v, redraw) {
    var d = P.draft; if (!d) return;
    d[k] = v;
    if (redraw) { var c = $('pp-cfg'); if (k === 'method') return drawPick(); if (c) { var j = job(d.jid); c.innerHTML = cfgHtml(j); } }
    drawSum();
  };
  P.dProg = function (i, k, v) { var s = P.draft.progress[i]; if (!s) return; s[k] = v; drawSum(); };
  P.dProgAdd = function () { P.draft.progress.push({ id: uid('pp'), name: '', pct: '', phase: '' }); var c = $('pp-cfg'); if (c) c.innerHTML = cfgHtml(job(P.draft.jid)); drawSum(); var ins = document.querySelectorAll('.pp-pr input'); if (ins.length) ins[ins.length - 2].focus(); };
  P.dProgDel = function (i) { P.draft.progress.splice(i, 1); var c = $('pp-cfg'); if (c) c.innerHTML = cfgHtml(job(P.draft.jid)); drawSum(); };
  P.dCancel = function () {
    var d = P.draft; P.draft = null;
    if (d && d.modal) { if (window.bpCloseModal) bpCloseModal(); return; }
    if (d) P.render(d.jid);
  };
  P.dSave = function () {
    var d = P.draft, j = d && job(d.jid), msg = $('pp-msg'); if (!j) return;
    var bad = function (t) { if (msg) { msg.className = 'qb-msg err'; msg.textContent = t; } };
    var was = j.pay || {}, pay = { method: d.method, at: Date.now(), sent: was.sent || {} };
    if (d.method === 'full') pay.fullWhen = d.fullWhen === 'done' ? 'done' : 'now';
    if (d.method === 'deposit') {
      pay.dep = depCfg();
      if (!(pay.dep.pct > 0)) return bad('Set the deposit percent.');
      var prog = d.progress.filter(function (s) { return String(s.name || '').trim() || num(s.pct) > 0; });
      for (var i = 0; i < prog.length; i++) if (!(num(prog[i].pct) > 0)) return bad('Give each progress payment a percent, or remove it.');
      var tot = pay.dep.pct + prog.reduce(function (t, s) { return t + num(s.pct); }, 0);
      if (tot >= 100) return bad('The deposit and progress payments add up to ' + r2(tot) + '%. Leave some for the final balance.');
      pay.progress = prog.map(function (s) { var old = (was.progress || []).filter(function (o) { return o.id === s.id; })[0]; return { id: s.id || uid('pp'), name: String(s.name || '').trim() || 'Progress payment', pct: r2(num(s.pct)), phase: s.phase || '', ready: !!(old && old.ready) }; });
      pay.finalReady = !!was.finalReady;
    }
    if (d.method === 'financing') {
      var link = String(d.link || '').trim();
      if (link && !/^https:\/\/[^\s]+\.[^\s]+/i.test(link)) return bad('The apply link has to start with https://');
      pay.fin = Object.assign({ status: 'offered' }, was.fin || {}, { lender: d.lender, link: link });
      if (d.saveLender && window.bpSettingsGet && window.bpSettingsSet) {
        try { var st = bpSettingsGet() || {}; st.financing = { lender: d.lender, link: link }; bpSettingsSet(st); if (window.bpSettingsPush) bpSettingsPush(st); } catch (e) {}
      }
    }
    if (d.method === 'insurance') {
      var oi = was.ins || {}, checks = (oi.checks || []).slice();
      var upsert = function (kind, name, amount, extra) {
        var c = checks.filter(function (x) { return x.kind === kind; })[0];
        if (!c && !(amount > 0)) return;
        if (!c) { c = { id: uid('ic'), kind: kind, name: name, status: kind === 'dep' ? 'held' : 'expected' }; checks.push(c); }
        if (c.status !== 'received') c.amount = r2(amount);
        Object.assign(c, extra || {});
      };
      upsert('acv', 'First check (ACV)', num(d.acv), { mortgage: !!d.acvMortgage });
      upsert('dep', 'Depreciation', num(d.dep), { mortgage: !!d.acvMortgage });
      pay.ins = { carrier: String(d.carrier || '').trim(), claim: String(d.claim || '').trim(), deductible: r2(num(d.deductible)), adjuster: String(d.adjuster || '').trim(), adjPhone: String(d.adjPhone || '').trim(), checks: checks, completionAt: oi.completionAt || 0 };
    }
    j.pay = pay; save();
    var host = d.modal; P.draft = null;
    toast('Payment plan saved: ' + METHODS[pay.method][0] + '.', 'success');
    if (host) { if (window.bpCloseModal) bpCloseModal(); }
    P.render(j.id);
    if (window.bpQbInvs) bpQbInvs();
  };

  /* ================================================================
     The plan on a project (Money tab), or in a modal
     ================================================================ */
  P.open = function (jid) {
    if (!window.bpModal) return;
    bpModal('<div id="pp-panel-modal"></div><div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Close</button></div>');
    var cards = document.querySelectorAll('.bpx-modalcard'), mc = cards[cards.length - 1]; if (mc) { mc.style.maxWidth = '760px'; mc.style.width = '95vw'; }
    P.render(jid);
  };
  function hostOf() { return $('pp-panel-modal') || $('bpx-pj-pay'); }
  P.render = function (jid) {
    var h = hostOf(), j = job(jid); if (!h || !j) return;
    h.setAttribute('data-jid', j.id);
    var pay = j.pay, C = P.contract(j), paid = r2(+j.collected || 0);
    if (!pay) {
      h.innerHTML = '<div class="pjs-h">Payment plan</div>'
        + '<div class="pp-empty"><span class="ms">payments</span><div><b>How is ' + esc(String(j.name || 'the customer').split(' ')[0]) + ' paying?</b><p>Pay in full, a deposit then the rest, financing, or an insurance claim. The next payment due shows up in Ready to invoice.</p></div>'
        + '<button type="button" class="bpx-addbtn" onclick="BPP.choose(\'' + j.id + '\',\'' + h.id + '\')">Choose</button></div>';
      return;
    }
    var head = '<div class="pp-head"><div><div class="pjs-h">Payment plan</div><b class="pp-meth"><span class="ms">' + METHODS[pay.method][2] + '</span>' + METHODS[pay.method][0] + '</b></div>'
      + '<button type="button" class="bpx-rowbtn" onclick="BPP.choose(\'' + j.id + '\',\'' + h.id + '\')">Change</button></div>';
    var body = '';
    if (pay.method === 'full' || pay.method === 'deposit') body = stepsHtml(j);
    if (pay.method === 'financing') body = finHtml(j);
    if (pay.method === 'insurance') body = insHtml(j);
    h.innerHTML = head + body;
  };
  function money3(C, paid, owed) {
    return '<div class="pp-m3"><div><small>Price</small><b>' + m2(C) + '</b></div><div><small>Paid</small><b>' + m2(paid) + '</b></div><div class="due"><small>Still owed</small><b>' + m2(Math.max(0, owed)) + '</b></div></div>';
  }
  var BADGE = { paid: ['Paid', 'ok'], sent: ['Invoice sent', 'on'], due: ['Ready to bill', 'warn'], later: ['Later', ''] };
  function stepsHtml(j) {
    var st = P.steps(j), C = P.contract(j), paid = r2(+j.collected || 0);
    return money3(C, paid, C - paid)
      + '<ol class="pp-steps">' + st.map(function (s) {
        var b = BADGE[s.state], acts = '';
        if (s.state === 'due') acts = '<button type="button" class="bpx-addbtn sm" onclick="BPP.bill(\'' + j.id + '\',\'' + s.id + '\')">Send invoice</button><button type="button" class="bpx-rowbtn" onclick="BPP.paidBy(\'' + j.id + '\',\'' + s.id + '\')">Mark paid</button>';
        if (s.state === 'sent') acts = '<button type="button" class="bpx-rowbtn" onclick="BPP.paidBy(\'' + j.id + '\',\'' + s.id + '\')">Mark paid</button><button type="button" class="bpx-rowbtn" onclick="BPP.bill(\'' + j.id + '\',\'' + s.id + '\')">Send again</button>';
        if (s.state === 'later' && (s.kind === 'progress' || s.kind === 'final')) acts = '<button type="button" class="bpx-rowbtn" onclick="BPP.ready(\'' + j.id + '\',\'' + s.id + '\')">Mark ready to bill</button>';
        return '<li class="pp-st ' + s.state + '"><i>' + (s.state === 'paid' ? '<span class="ms">check</span>' : s.n) + '</i>'
          + '<div class="pp-st-t"><b>' + esc(s.name) + '</b><small>' + (s.state === 'paid' ? 'Paid' : s.state === 'sent' ? 'Invoice sent ' + day(s.sentAt) + (s.paid > 0 ? ' · ' + m2(s.paid) + ' paid' : '') : esc(whenText(s))) + '</small></div>'
          + '<div class="pp-st-a"><b>' + m2(s.amount) + '</b><span class="pjk-tag ' + b[1] + '">' + b[0] + '</span></div>'
          + (acts ? '<div class="pp-st-b">' + acts + '</div>' : '') + '</li>';
      }).join('') + '</ol>'
      + '<p class="pp-note">Card payments and paid invoices come in on their own. Paid by check or cash? Use Mark paid.</p>';
  }
  P.bill = function (jid, stepId) {
    var j = job(jid); if (!j) return;
    if (window.bpCloseModal && document.getElementById('bpx-modal')) bpCloseModal();
    if (window.bpInvoiceFrom) bpInvoiceFrom(jid, 'view', stepId);
  };
  P.paidBy = function (jid, stepId) {
    var j = job(jid), s = j && P.step(j, stepId); if (!s) return;
    if (j.sample) { toast('This is the sample, so nothing is recorded.'); return; }
    if (!confirm('Record ' + m2(s.left) + ' for the ' + s.name.toLowerCase() + ' as paid (check, cash or transfer)?')) return;
    collect(j, s.left); save(); P.render(jid); if (window.bpQbInvs) bpQbInvs();
    toast(m2(s.left) + ' recorded as paid.', 'success');
  };
  P.ready = function (jid, stepId) {
    var j = job(jid); if (!j || !j.pay) return;
    if (stepId === 'final') j.pay.finalReady = true;
    else (j.pay.progress || []).forEach(function (s) { if (s.id === stepId) s.ready = true; });
    save(); P.render(jid); if (window.bpQbInvs) bpQbInvs();
    toast('Ready to bill. It is in Finances > Invoices > Ready to invoice.', 'success');
  };

  /* ---------- financing ---------- */
  var FIN = [['offered', 'Offered'], ['applied', 'Applied'], ['approved', 'Approved'], ['funded', 'Funded']];
  function finHtml(j) {
    var f = j.pay.fin || {}, C = P.contract(j), paid = r2(+j.collected || 0), ix = Math.max(0, FIN.map(function (x) { return x[0]; }).indexOf(f.status || 'offered'));
    var first = String(j.name || '').split(' ')[0], ph = String(j.phone || '').replace(/[^\d+]/g, '');
    var text = 'Hi ' + first + ', you can apply for monthly payments for your project with ' + (f.lender || 'our lender') + ' here: ' + (f.link || '');
    var h = money3(C, paid, C - paid)
      + '<ol class="pp-fin">' + FIN.map(function (x, i) { return '<li class="' + (i < ix ? 'done' : i === ix ? 'now' : '') + '"><i>' + (i < ix || (i === ix && x[0] === 'funded') ? '<span class="ms">check</span>' : i + 1) + '</i><span>' + x[1] + '</span></li>'; }).join('') + '</ol>'
      + '<div class="pp-finbox"><div><small>Lender</small><b>' + esc(f.lender || 'Not set') + '</b></div>'
      + (f.approved ? '<div><small>Approved</small><b>' + m2(f.approved) + '</b></div>' : '')
      + (f.funded ? '<div><small>Paid to you</small><b>' + m2(f.funded) + '</b></div><div><small>Lender fee</small><b>' + m2(f.fee || 0) + '</b></div>' : '') + '</div>';
    if (f.link) h += '<div class="pp-link"><code>' + esc(f.link) + '</code><button type="button" class="bpx-rowbtn" onclick="BPP.copy(\'' + escA(f.link) + '\',this)">Copy</button>'
      + (ph ? '<a class="bpx-rowbtn" href="sms:' + escA(ph) + '?&body=' + escA(encodeURIComponent(text)) + '">Text it to ' + esc(first || 'them') + '</a>' : '') + '</div>';
    else h += '<p class="pp-note">Add your lender’s apply link (Change) so the customer can apply from their project page.</p>';
    if (f.status === 'offered' || !f.status) h += '<div class="pp-row"><button type="button" class="bpx-rowbtn" onclick="BPP.fin(\'' + j.id + '\',\'applied\')">They applied</button></div>';
    if (f.status === 'applied' || f.status === 'offered' || !f.status) h += '<div class="pp-row pp-inl"><span class="qx-in"><i>$</i><input type="number" min="0" step="any" id="pp-fin-appr" placeholder="Approved amount" value="' + (f.approved || C || '') + '"></span><button type="button" class="bpx-addbtn sm" onclick="BPP.fin(\'' + j.id + '\',\'approved\')">Mark approved</button></div>';
    if (f.status === 'approved') {
      h += '<p class="pp-note">' + (finished(j) ? 'The job is done. Ask ' + esc(f.lender || 'the lender') + ' to pay you (in their merchant portal), then record it here.' : 'Do the job. When it is done, ask ' + esc(f.lender || 'the lender') + ' to pay you, then record it here.') + '</p>'
        + '<div class="pp-row pp-inl"><span class="qx-in"><i>$</i><input type="number" min="0" step="any" id="pp-fin-paid" placeholder="What landed in your bank"></span><span class="qx-in"><i>$</i><input type="number" min="0" step="any" id="pp-fin-fee" placeholder="Lender fee"></span><button type="button" class="bpx-addbtn sm" onclick="BPP.fin(\'' + j.id + '\',\'funded\')">Mark funded</button></div>';
    }
    if (f.status === 'funded') h += '<div class="pp-row"><span class="pjk-tag ok">Funded ' + day(f.fundedAt) + '</span><button type="button" class="bpx-rowbtn" onclick="BPP.fin(\'' + j.id + '\',\'undo\')">Undo</button></div>';
    return h;
  }
  P.fin = function (jid, to) {
    var j = job(jid); if (!j || !j.pay) return;
    var f = j.pay.fin = j.pay.fin || {};
    if (to === 'applied') { f.status = 'applied'; f.appliedAt = Date.now(); }
    if (to === 'approved') {
      var a = num(($('pp-fin-appr') || {}).value); if (!(a > 0)) { toast('Type the approved amount.', 'error'); return; }
      f.status = 'approved'; f.approved = r2(a); f.approvedAt = Date.now();
    }
    if (to === 'funded') {
      var got = num(($('pp-fin-paid') || {}).value), fee = num(($('pp-fin-fee') || {}).value);
      if (!(got > 0)) { toast('Type what the lender paid you.', 'error'); return; }
      if (j.sample) { toast('This is the sample, so nothing is recorded.'); return; }
      f.status = 'funded'; f.funded = r2(got); f.fee = r2(fee); f.fundedAt = Date.now();
      /* the customer's price is paid in full: what landed plus the fee the lender kept */
      collect(j, r2(got + fee)); addExpense(j, 'finfee:' + j.id, fee, 'Financing fee (' + (f.lender || 'lender') + ')');
    }
    if (to === 'undo' && f.status === 'funded') {
      if (!confirm('Undo the funding? ' + m2((f.funded || 0) + (f.fee || 0)) + ' comes off Paid so far.')) return;
      collect(j, -r2((f.funded || 0) + (f.fee || 0))); addExpense(j, 'finfee:' + j.id, 0, '');
      f.status = 'approved'; delete f.funded; delete f.fee; delete f.fundedAt;
    }
    save(); P.render(jid); if (window.bpQbInvs) bpQbInvs();
  };
  P.copy = function (t, btn) {
    try { navigator.clipboard.writeText(t); } catch (e) {}
    if (btn) { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1400); }
  };

  /* ---------- insurance ---------- */
  var INS_ST = { expected: ['Expected', ''], held: ['Held back', ''], requested: ['Requested', 'on'], submitted: ['Submitted', 'on'], approved: ['Approved', 'on'], endorse: ['Needs endorsement', 'warn'], received: ['Received', 'ok'], denied: ['Denied', 'late'] };
  function insTotals(j) {
    var ins = j.pay.ins || {}, ded = r2(+ins.deductible || 0), recv = insReceived(ins);
    var homeowner = Math.max(0, r2((+j.collected || 0) - recv)), dedPaid = Math.min(ded, homeowner);
    var claim = r2(ded + (ins.checks || []).reduce(function (t, c) { return t + (c.status === 'denied' || c.status === 'submitted' ? 0 : (+c.amount || 0)); }, 0));
    return { ded: ded, dedPaid: dedPaid, recv: recv, claim: claim, owed: Math.max(0, r2(claim - recv - dedPaid)) };
  }
  P.insTotals = function (j) { return j && j.pay && j.pay.method === 'insurance' ? insTotals(j) : null; };
  function insHtml(j) {
    var ins = j.pay.ins || {}, t = insTotals(j), C = P.contract(j), ded = P.step(j, 'ded');
    var tel = String(ins.adjPhone || '').replace(/[^\d+]/g, '');
    var h = '<div class="pp-claim"><div><small>Insurance</small><b>' + esc(ins.carrier || 'Not set') + '</b></div><div><small>Claim</small><b>' + esc(ins.claim || '—') + '</b></div>'
      + '<div><small>Adjuster</small><b>' + esc(ins.adjuster || '—') + (tel ? ' <a href="tel:' + escA(tel) + '">' + esc(ins.adjPhone) + '</a>' : '') + '</b></div></div>'
      + '<div class="pp-m3"><div><small>Claim total</small><b>' + m2(t.claim) + '</b></div><div><small>Received</small><b>' + m2(t.recv + t.dedPaid) + '</b></div><div class="due"><small>Still owed</small><b>' + m2(t.owed) + '</b></div></div>';
    if (t.claim > 0 && Math.abs(t.claim - C) > 0.5 && j.status !== 'quote') h += '<div class="pp-warn"><span>Your price is ' + m2(C) + ', the claim adds up to ' + m2(t.claim) + '.</span><button type="button" class="bpx-rowbtn" onclick="BPP.insUseClaim(\'' + j.id + '\')">Use the claim total as the price</button></div>';
    h += '<table class="pp-it"><tbody>';
    h += '<tr><td><b>Deductible</b><small>from the homeowner</small></td><td>' + m2(t.ded) + '</td><td><span class="pjk-tag ' + (t.ded > 0 && t.dedPaid >= t.ded - 0.009 ? 'ok">Paid' : ded && ded.state === 'sent' ? 'on">Invoice sent' : '">Due') + '</span></td><td>'
      + (ded && ded.state === 'due' ? '<button type="button" class="bpx-rowbtn" onclick="BPP.bill(\'' + j.id + '\',\'ded\')">Send invoice</button>' : '')
      + (ded && (ded.state === 'due' || ded.state === 'sent') ? '<button type="button" class="bpx-rowbtn" onclick="BPP.paidBy(\'' + j.id + '\',\'ded\')">Mark paid</button>' : '') + '</td></tr>';
    (ins.checks || []).forEach(function (c) {
      var s = INS_ST[c.status] || [c.status, ''], a = '';
      if (c.status === 'expected' || c.status === 'held' || c.status === 'requested' || c.status === 'approved') a = '<button type="button" class="bpx-rowbtn" onclick="BPP.insGot(\'' + j.id + '\',\'' + c.id + '\')">Received</button>';
      if (c.status === 'submitted') a = '<button type="button" class="bpx-rowbtn" onclick="BPP.insSt(\'' + j.id + '\',\'' + c.id + '\',\'approved\')">Approved</button><button type="button" class="bpx-rowbtn" onclick="BPP.insSt(\'' + j.id + '\',\'' + c.id + '\',\'denied\')">Denied</button>';
      if (c.status === 'endorse') a = '<button type="button" class="bpx-rowbtn" onclick="BPP.insEndorsed(\'' + j.id + '\',\'' + c.id + '\')">Endorsed and deposited</button>';
      if (c.status === 'received') a = '<button type="button" class="bpx-rowbtn" onclick="BPP.insUndo(\'' + j.id + '\',\'' + c.id + '\')">Undo</button>';
      if (c.kind === 'supp' && c.status !== 'received') a += '<button type="button" class="qb-x" aria-label="Remove" onclick="BPP.insDel(\'' + j.id + '\',\'' + c.id + '\')">&times;</button>';
      h += '<tr><td><b>' + esc(c.name) + '</b><small>' + (c.kind === 'dep' ? 'released after the work is done' : c.kind === 'supp' ? 'supplement' + (c.note ? ': ' + esc(c.note) : '') : 'from ' + esc(ins.carrier || 'the insurer')) + (c.mortgage ? ' · mortgage co. on the check' : '') + (c.at ? ' · ' + day(c.at) : '') + '</small></td>'
        + '<td>' + m2(c.amount) + '</td><td><span class="pjk-tag ' + s[1] + '">' + s[0] + '</span></td><td>' + a + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="pp-row pp-inl" id="pp-supp"><input id="pp-supp-n" placeholder="Supplement: what was missed"><span class="qx-in"><i>$</i><input type="number" min="0" step="any" id="pp-supp-a" placeholder="Amount"></span><button type="button" class="bpx-rowbtn" onclick="BPP.insSupp(\'' + j.id + '\')">+ Add supplement</button></div>';
    var dep = (ins.checks || []).filter(function (c) { return c.kind === 'dep'; })[0];
    h += '<div class="pp-row"><button type="button" class="bpx-addbtn sm" onclick="BPP.insCompletion(\'' + j.id + '\')">Completion invoice for the insurer</button>'
      + (ins.completionAt ? '<span class="bpx-mut">Sent ' + day(ins.completionAt) + (dep && dep.status !== 'received' ? '. Depreciation not in yet: you get a reminder after 30 days.' : '') + '</span>' : '<span class="bpx-mut">When the work is done. It asks the insurer to release the depreciation.</span>') + '</div>';
    return h;
  }
  function insCheck(j, id) { return ((j.pay.ins || {}).checks || []).filter(function (c) { return c.id === id; })[0]; }
  P.insGot = function (jid, id) {
    var j = job(jid), c = j && insCheck(j, id); if (!c) return;
    if (j.sample) { toast('This is the sample, so nothing is recorded.'); return; }
    if (!(+c.amount > 0)) { toast('This check has no amount yet. Use Change to add it.', 'error'); return; }
    if (c.mortgage) { c.status = 'endorse'; c.at = Date.now(); save(); P.render(jid); toast('Waiting on the mortgage company to endorse it. Mark it when it is deposited.'); return; }
    c.status = 'received'; c.at = Date.now(); collect(j, +c.amount); save(); P.render(jid); toast(m2(c.amount) + ' received from the insurer.', 'success');
  };
  P.insEndorsed = function (jid, id) {
    var j = job(jid), c = j && insCheck(j, id); if (!c) return;
    c.status = 'received'; c.at = Date.now(); collect(j, +c.amount || 0); save(); P.render(jid); toast(m2(c.amount) + ' deposited.', 'success');
  };
  P.insUndo = function (jid, id) {
    var j = job(jid), c = j && insCheck(j, id); if (!c || c.status !== 'received') return;
    if (!confirm('Undo? ' + m2(c.amount) + ' comes off Paid so far.')) return;
    collect(j, -(+c.amount || 0)); c.status = c.kind === 'dep' ? ((j.pay.ins || {}).completionAt ? 'requested' : 'held') : c.kind === 'supp' ? 'approved' : 'expected'; delete c.at;
    save(); P.render(jid);
  };
  P.insSt = function (jid, id, st) { var j = job(jid), c = j && insCheck(j, id); if (!c) return; c.status = st; save(); P.render(jid); };
  P.insDel = function (jid, id) { var j = job(jid); if (!j) return; var ins = j.pay.ins; ins.checks = ins.checks.filter(function (c) { return c.id !== id || c.status === 'received'; }); save(); P.render(jid); };
  P.insSupp = function (jid) {
    var j = job(jid); if (!j) return;
    var n = String(($('pp-supp-n') || {}).value || '').trim(), a = num(($('pp-supp-a') || {}).value);
    if (!(a > 0)) { toast('Type the supplement amount.', 'error'); return; }
    var ins = j.pay.ins = j.pay.ins || { checks: [] }; ins.checks = ins.checks || [];
    var k = ins.checks.filter(function (c) { return c.kind === 'supp'; }).length + 1;
    ins.checks.push({ id: uid('ic'), kind: 'supp', name: 'Supplement ' + k, note: n, amount: r2(a), status: 'submitted', mortgage: (ins.checks.filter(function (c) { return c.kind === 'acv'; })[0] || {}).mortgage || false });
    save(); P.render(jid);
  };
  P.insUseClaim = function (jid) {
    var j = job(jid); if (!j) return; var t = insTotals(j);
    j.estimate = t.claim;
    if (window._bpProjId === j.id) { var e = $('bpx-pj-est'); if (e) { e.value = m0(t.claim); if (window.bpProjBal) try { bpProjBal(); } catch (x) {} } }
    save(); P.render(jid);
  };
  /* the completion invoice: every line of the work, the claim number, a
     certificate of completion. Opens to print or save as PDF. */
  P.insCompletion = function (jid) {
    var j = job(jid); if (!j) return;
    var ins = j.pay.ins || {}, st = {}; try { st = bpSettingsGet() || {}; } catch (e) {}
    var co = st.company || {}, t = insTotals(j), C = P.contract(j);
    var lines = [];
    try { if (j.quote && window.BPQ && BPQ.calc) lines = BPQ.calc(j.id).lines; } catch (e) {}
    if (!lines.length) lines = [{ name: j.title || 'Work performed', qty: 1, price: C }];
    var sub = r2(lines.reduce(function (s, l) { return s + r2(l.qty * l.price); }, 0));
    var dt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    var dep = (ins.checks || []).filter(function (c) { return c.kind === 'dep'; })[0];
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Completion invoice ' + esc(ins.claim || '') + '</title><style>body{font:13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;max-width:780px;margin:32px auto;padding:0 24px}h1{font-size:26px;margin:0}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:left}th:not(:first-child),td:not(:first-child){text-align:right;white-space:nowrap}.m{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-top:18px}.m div{min-width:160px}.m b{display:block}.t td{font-weight:700;border-top:2px solid #111827}.cert{margin-top:28px;padding:16px;border:1px solid #d0d5dd;border-radius:8px}.sig{display:flex;gap:40px;margin-top:36px}.sig div{flex:1;border-top:1px solid #111827;padding-top:6px;font-size:12px;color:#4b5563}@media print{button{display:none}}</style></head><body>'
      + '<button onclick="print()" style="float:right;padding:8px 14px">Print or save PDF</button>'
      + '<h1>Completion invoice</h1><div>' + esc(co.name || '') + (co.phone ? ' · ' + esc(co.phone) : '') + (co.address ? '<br>' + esc(co.address) : '') + '</div>'
      + '<div class="m"><div><b>Insured</b>' + esc(j.name || '') + '<br>' + esc(j.addr || '') + '</div><div><b>Insurance company</b>' + esc(ins.carrier || '') + '</div><div><b>Claim number</b>' + esc(ins.claim || '') + '</div><div><b>Date</b>' + dt + '</div></div>'
      + '<table><thead><tr><th>Work performed</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>'
      + lines.map(function (l) { return '<tr><td>' + esc(l.name) + '</td><td>' + (+l.qty % 1 ? r2(l.qty) : +l.qty) + (l.unit && l.unit !== 'ea' ? ' ' + esc(l.unit) : '') + '</td><td>' + m2(l.price) + '</td><td>' + m2(l.qty * l.price) + '</td></tr>'; }).join('')
      + '<tr class="t"><td>Total for the work</td><td></td><td></td><td>' + m2(sub) + '</td></tr></tbody></table>'
      + '<table><tbody><tr><td>Claim total</td><td>' + m2(t.claim) + '</td></tr><tr><td>Received from the insurer</td><td>' + m2(t.recv) + '</td></tr><tr><td>Deductible (paid by the insured)</td><td>' + m2(t.ded) + '</td></tr>'
      + (dep && dep.status !== 'received' ? '<tr class="t"><td>Recoverable depreciation now due</td><td>' + m2(dep.amount) + '</td></tr>' : '<tr class="t"><td>Balance due</td><td>' + m2(t.owed) + '</td></tr>') + '</tbody></table>'
      + '<div class="cert"><b>Certificate of completion</b><p>The work above at ' + esc(j.addr || 'the insured property') + ' was completed on ' + dt + '. We ask that the recoverable depreciation be released.</p>'
      + '<div class="sig"><div>Contractor signature and date</div><div>Insured signature and date</div></div></div></body></html>';
    var w = window.open('', '_blank');
    if (!w) { toast('Your browser blocked the new tab. Allow pop-ups for this site and try again.', 'error'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    if (!j.sample) {
      ins.completionAt = Date.now();
      (ins.checks || []).forEach(function (c) { if (c.kind === 'dep' && c.status === 'held') c.status = 'requested'; });
      save();
    }
    P.render(jid);
  };

  /* ---------- the project sheet: a Payment plan section at the top of Money ---------- */
  function mountSheet() {
    var pane = document.querySelector('[data-pj-pane="money"]'), id = window._bpProjId;
    if (!pane || !id || (window.bpTeamIsCrew && bpTeamIsCrew())) return;
    if (!$('bpx-pj-pay')) { var s = document.createElement('section'); s.className = 'pjs-sec pp-sec'; s.id = 'bpx-pj-pay'; pane.insertBefore(s, pane.firstChild); }
    P.render(id);
  }
  function hook() {
    if (!window.bpProjOpen || window.bpProjOpen._pp) return;
    var open = window.bpProjOpen;
    var w = function () { var r = open.apply(this, arguments); try { mountSheet(); } catch (e) { if (window.console) console.error(e); } return r; };
    w._pp = true; w._pjs = open._pjs; window.bpProjOpen = w;
  }
  hook();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);

  /* ---------- the bell: payments ready to bill, a late insurance check, a loan to collect ---------- */
  var on = function () { return !!(window.BP_LIVE && window.BP_SB && BP_SB.rpc) && !(window.bpTeamIsCrew && bpTeamIsCrew()) && !(window.bpTeamIsSub && bpTeamIsSub()); };
  function ring(kind, title, body, link, pri, dedupe) {
    return Promise.resolve(BP_SB.rpc('bp_notify_self', { p_kind: kind, p_title: title, p_body: body, p_link: link, p_priority: pri, p_dedupe: dedupe })).catch(function () {});
  }
  function scan() {
    if (!on() || !window._bpFinLoaded) return;
    var mon = new Date().toISOString().slice(0, 7);
    jobs().forEach(function (j) {
      if (!j || !j.pay || j.sample) return;
      var nm = j.name || 'A customer';
      var nx = P.next(j);
      if (nx) ring('needs_invoice', 'Bill ' + nm + ': ' + nx.name.toLowerCase(), m2(nx.left) + ' is ready to invoice for ' + (j.title || 'the job') + '.', 'invoices', 'high', 'pp:' + j.id + ':' + nx.id);
      if (j.pay.method === 'insurance') {
        var ins = j.pay.ins || {}, dep = (ins.checks || []).filter(function (c) { return c.kind === 'dep' && c.status !== 'received'; })[0];
        if (dep && ins.completionAt && Date.now() - ins.completionAt > 30 * 864e5) ring('reminder', 'Depreciation check is late: ' + nm, (ins.carrier || 'The insurer') + ' has not released ' + m2(dep.amount) + ' on claim ' + (ins.claim || '') + '. Call the adjuster.', 'activejobs:' + j.id, 'high', 'ins-dep:' + j.id + ':' + mon);
      }
      if (j.pay.method === 'financing') {
        var f = j.pay.fin || {};
        if (f.status === 'approved' && finished(j)) ring('reminder', 'Collect from ' + (f.lender || 'the lender') + ': ' + nm, 'The job is done. Ask the lender to fund it, then mark it funded.', 'activejobs:' + j.id, 'high', 'fin:' + j.id);
      }
    });
  }
  setTimeout(scan, 15000); setInterval(scan, 600000);
})();
