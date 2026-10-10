/* ==================================================================
   Pipeline alerts: tells the owner/office what the next step is.
     inspection done, no estimate yet            -> needs_estimate
     lead waiting 2+ days, no inspection/estimate -> needs_inspection
     estimate accepted, no invoice yet           -> needs_invoice
     paid, but no project made                   -> start_job
     unread texts                                -> text_message
     to-dos due today (or overdue)               -> reminder
   Written to the person's own bell through bp_notify_self (deduped), so each
   item rings once. Runs after sign-in and every 10 minutes.
   ================================================================== */
(function () {
  'use strict';
  var on = function () { return !!(window.BP_LIVE && window.BP_SB && BP_SB.rpc) && !(window.bpTeamIsCrew && bpTeamIsCrew()) && !(window.bpTeamIsSub && bpTeamIsSub()); };
  var tagsOf = function (c) { return (c.tags || []).map(function (t) { return String(t).toLowerCase(); }); };
  function stepOf(t) {
    var h = function (k) { return t.indexOf(k) > -1; };
    if (h('job-complete')) return 6; if (h('paid-in-full')) return 5;
    if (h('final-sent') || h('deposit-sent')) return 4;
    if (h('estimate-accepted') || h('customer')) return 3;
    if (h('estimate-sent') || h('estimate')) return 2;
    return h('contacted') ? 1 : 0;
  }
  var digits = function (s) { return String(s || '').replace(/\D/g, ''); };
  var week = function () { var d = new Date(); return d.getFullYear() + '-' + Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 6048e5); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function send(kind, title, body, link, pri, dedupe) {
    return Promise.resolve(BP_SB.rpc('bp_notify_self', { p_kind: kind, p_title: title, p_body: body, p_link: link, p_priority: pri, p_dedupe: dedupe }))
      .then(function (r) { return r && r.data; }).catch(function () { return 0; });
  }
  async function run() {
    if (!on()) return;
    var made = 0, out = [];
    try { if (window.bpEnsureContacts) await bpEnsureContacts(); } catch (e) {}
    var contacts = window._bpContacts || [];
    var reps = [];
    try { var r = await BP_SB.from('inspection_reports').select('contact_id,contact_name,status,updated_at').limit(500); reps = (r && r.data) || []; } catch (e) {}
    var inspected = {}; reps.forEach(function (x) { if (x.contact_id && x.status === 'final') inspected[x.contact_id] = x; });
    var jobs = typeof bpJobsGet === 'function' ? bpJobsGet() : [];
    var hasJob = function (c) { return jobs.some(function (j) { return (j.contactId && j.contactId === c.id) || (c.name && j.name === c.name) || (c.phone && j.phone && digits(j.phone) === digits(c.phone)); }); };
    contacts.forEach(function (c) {
      var t = tagsOf(c), st = stepOf(t), nm = c.name || 'A customer', link = 'contacts:' + c.id;
      var age = c.dateAdded ? (Date.now() - new Date(c.dateAdded).getTime()) / 864e5 : 0;
      if (st < 2 && inspected[c.id]) out.push(['needs_estimate', 'Send ' + nm + ' an estimate', 'The inspection is done. Next step: the estimate.', link, 'high', 'pl-est:' + c.id]);
      else if (st < 2 && age >= 2 && age <= 60) out.push(['needs_inspection', nm + ' is waiting on you', 'Book an inspection, or send an estimate if it is a quick job.', link, 'normal', 'pl-new:' + c.id + ':' + week()]);
      if (st === 3 && t.indexOf('job-complete') < 0) out.push(['needs_invoice', 'Send ' + nm + ' an invoice', 'They accepted the estimate. Next step: the deposit invoice.', link, 'high', 'pl-inv:' + c.id]);
      if (st >= 4 && st < 6 && !hasJob(c)) out.push(['start_job', 'Start the job for ' + nm, 'The invoice is out or paid, but there is no project yet.', link, 'high', 'pl-job:' + c.id + ':' + st]);
    });
    /* unread texts */
    try {
      if (window.GHL_MSG_URL) {
        var m = await (window.bpFx ? bpFx(GHL_MSG_URL, { action: 'list' }) : fetch(GHL_MSG_URL, { method: 'POST', headers: { 'Authorization': 'Bearer ' + BP_ANON, 'apikey': BP_ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) }));
        var d = await m.json();
        ((d && d.conversations) || []).forEach(function (c) {
          if (c.unread > 0 && c.dir !== 'outbound') out.push(['text_message', 'New message from ' + (c.name || 'a contact'), String(c.last || '').slice(0, 140), 'messaging', 'high', 'pl-msg:' + c.id + ':' + (c.lastDate || c.dateUpdated || c.last || '')]);
        });
      }
    } catch (e) {}
    /* to-dos due today or overdue */
    try {
      var tk = today(), notes = JSON.parse(localStorage.getItem('bpCalNotes') || '[]');
      notes.forEach(function (n) {
        if (n.kind === 'todo' && !n.done && n.day && n.day <= tk) out.push(['reminder', (n.day < tk ? 'Overdue: ' : 'Today: ') + String(n.text || 'To-do').slice(0, 120), n.at ? 'At ' + n.at : '', 'calendar', n.day < tk ? 'high' : 'normal', 'pl-todo:' + n.id + ':' + tk]);
      });
    } catch (e) {}
    for (var i = 0; i < out.length && i < 60; i++) made += (await send.apply(null, out[i])) || 0;
    if (made && window.bpNotify && bpNotify.load) try { bpNotify.load(); } catch (e) {}
  }
  window.bpPipelineScan = run;
  setTimeout(run, 8000);
  setInterval(function () { if (document.visibilityState === 'visible') run(); }, 6e5);
})();
