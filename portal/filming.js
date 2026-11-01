/* Filming mode: for recording demo and launch videos.
   Turn on:  open app.html?portal=1&film=1   (stays on in this browser)
   Turn off: open app.html?portal=1&film=0
   While on:
     - no red counts on the bell, no "Finish setting up" bar or card, no
       "Upgrade to unlock" list, no "Connect your business number" banner
     - "(sample)" is hidden wherever it shows on screen (names, jobs, contacts).
       Only text on screen changes: form fields are left alone, so saving a
       form never drops the label from the data.
     - the Texts inbox shows sample conversations instead
       of asking HighLevel, so the missed-call text-back can be filmed while
       texting isn't connected. Nothing is sent anywhere: a message typed in a
       sample conversation only appears on this screen.
   Nothing else changes, and nothing is saved. */
(function () {
  'use strict';
  var KEY = 'bpFilm';
  try {
    var q = new URLSearchParams(location.search).get('film');
    if (q === '1') localStorage.setItem(KEY, '1');
    if (q === '0') localStorage.removeItem(KEY);
  } catch (e) {}
  var on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}
  window.bpFilming = function () { return on; };
  if (!on) return;
  document.documentElement.classList.add('bp-film');

  /* ---------- sample conversations for the Texts inbox ---------- */
  var biz = function () { try { return ((bpSettingsGet().company || {}).name) || 'our team'; } catch (e) { return 'our team'; } };
  var ai = function () { return window.BP_AI_NAME || 'Lisa'; };
  var ago = function (min) { return new Date(Date.now() - min * 60000).toISOString(); };
  function convos() {
    return [
      { id: 'film1', contactId: 'film1', name: "Kevin O'Brien (sample)", phone: '(555) 010-8989', unread: 1, dir: 'inbound', last: 'Yes, tomorrow at 9 works. Thanks!',
        msgs: [{ activity: 'Missed call · 4:52 PM', date: ago(38) },
          { dir: 'outbound', body: "Hi Kevin, this is " + ai() + " with " + biz() + ". Sorry we missed your call! How can we help?", date: ago(38) },
          { dir: 'inbound', body: "Hey, I've got water coming through the ceiling in the back bedroom after the rain.", date: ago(35) },
          { dir: 'outbound', body: "I'm sorry about that. We can send someone out to take a look. Would tomorrow at 9 AM work for a free inspection?", date: ago(34) },
          { dir: 'inbound', body: 'Yes, tomorrow at 9 works. Thanks!', date: ago(33) },
          { activity: 'Inspection booked · tomorrow 9:00 AM', date: ago(33) }] },
      { id: 'film2', contactId: 'film2', name: 'Carlos Rivera (sample)', phone: '(555) 010-8383', unread: 0, dir: 'outbound', last: 'Got it. Luis will be there between 8 and 9.',
        msgs: [{ dir: 'inbound', body: 'Is someone still coming today for the leak?', date: ago(140) },
          { dir: 'outbound', body: 'Got it. Luis will be there between 8 and 9.', date: ago(130) }] },
      { id: 'film3', contactId: 'film3', name: 'Priya Shah (sample)', phone: '(555) 010-8484', unread: 0, dir: 'outbound', last: 'Here are your three options. Tap the link to pick one.',
        msgs: [{ activity: 'Used the roof calculator on your website', date: ago(320) },
          { dir: 'outbound', body: 'Hi Priya, thanks for checking your roof price! Want an exact quote? We can measure this week.', date: ago(318) },
          { dir: 'inbound', body: 'Yes please, Thursday afternoon?', date: ago(300) },
          { dir: 'outbound', body: 'Here are your three options. Tap the link to pick one.', date: ago(60) }] },
      { id: 'film4', contactId: 'film4', name: 'Mike Johnson (sample)', phone: '(555) 010-8181', unread: 0, dir: 'inbound', last: 'Looks great, thank you guys!',
        msgs: [{ dir: 'outbound', body: 'Your repair is done. Photos are on your project page.', date: ago(1500) },
          { dir: 'inbound', body: 'Looks great, thank you guys!', date: ago(1480) }] }
    ];
  }
  var LIST = null;
  function fake(body) { return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  function hook() {
    var real = window.bpFx; if (!real || real._film) return !!(real && real._film);
    var wrapped = function (url, payload) {
      if (/\/functions\/v1\/ghl-messaging/.test(String(url)) && payload) {
        LIST = LIST || convos();
        if (payload.action === 'list') return Promise.resolve(fake({ conversations: LIST.map(function (c) { var o = {}; for (var k in c) if (k !== 'msgs') o[k] = c[k]; return o; }) }));
        if (payload.action === 'thread') { var c = LIST.filter(function (x) { return x.id === payload.id; })[0]; if (c) c.unread = 0; return Promise.resolve(fake({ messages: c ? c.msgs : [] })); }
        if (payload.action === 'send') {
          var t = LIST.filter(function (x) { return x.contactId === payload.contactId; })[0];
          if (t) { t.msgs.push({ dir: 'outbound', body: payload.message, date: new Date().toISOString() }); t.last = payload.message; t.dir = 'outbound'; }
          return Promise.resolve(fake({ ok: true, sample: true }));
        }
      }
      return real.apply(this, arguments);
    };
    wrapped._film = true;
    window.bpFx = wrapped;
    return true;
  }
  if (!hook()) { var n = 0, t = setInterval(function () { if (hook() || ++n > 40) clearInterval(t); }, 250); }

  /* ---------- hide "(sample)" on screen ---------- */
  // "Mike Johnson (sample)" -> "Mike Johnson", "mike.sample@example.com" -> "mike@example.com"
  var SAMPLE = /\s*\(sample\)|\.sample(?=@)/gi;
  function clean(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (SAMPLE.test(root.nodeValue)) { SAMPLE.lastIndex = 0; root.nodeValue = root.nodeValue.replace(SAMPLE, ''); } SAMPLE.lastIndex = 0; return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(root.nodeName)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, hits = [];
    while ((n = w.nextNode())) if (/\(sample\)|\.sample@/i.test(n.nodeValue)) hits.push(n);
    hits.forEach(function (t) { var pn = t.parentNode; if (pn && /^(SCRIPT|STYLE|TEXTAREA)$/.test(pn.nodeName)) return; t.nodeValue = t.nodeValue.replace(SAMPLE, ''); });
    var els = root.querySelectorAll ? root.querySelectorAll('[title*="sample" i],[aria-label*="sample" i],[alt*="sample" i]') : [];
    Array.prototype.forEach.call(els, function (e) {
      ['title', 'aria-label', 'alt'].forEach(function (a) { var v = e.getAttribute(a); if (v && /\(sample\)|\.sample@/i.test(v)) e.setAttribute(a, v.replace(SAMPLE, '')); });
    });
  }
  function watch() {
    clean(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === 'characterData') clean(m.target);
        else for (var i = 0; i < m.addedNodes.length; i++) clean(m.addedNodes[i]);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);

  /* ---------- quiet chrome ---------- */
  var st = document.createElement('style');
  st.textContent = 'html.bp-film #hlBellN,html.bp-film .bp-badge,html.bp-film .hl-badge,html.bp-film .dash-mini,html.bp-film .mh2-setup,html.bp-film .bpx-a2p,'
    + 'html.bp-film .hl-lockhd,html.bp-film .bp-tabbar .hl-n,html.bp-film .bp-tabbar em{display:none !important}';
  (document.head || document.documentElement).appendChild(st);
})();
