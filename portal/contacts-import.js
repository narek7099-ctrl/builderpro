/* ==================================================================
   Import contacts from a spreadsheet (Leads > Contacts > Import).

   A contractor switching from Jobber, Housecall Pro, ServiceTitan or a
   spreadsheet exports their customer list as a CSV and brings it in here:
     1. pick the file      parsed in the browser (quotes, commas, BOM,
                           comma / semicolon / tab separated)
     2. check the columns  matched by their headings (name, first + last,
                           phone, email, address, notes, tags); each can be
                           changed
     3. import             new people become rows in public.contacts, tagged
                           "Imported"; anyone already in Contacts (same phone
                           or email) and empty rows are skipped
   Imported people are NOT texted: an old customer list isn't permission to
   text, so Lisa only reaches out to leads that come in or are added one by
   one with the box ticked.
   ================================================================== */
(function () {
  'use strict';
  var MAX = 5000;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var I = window.bpImport = { rows: [], head: [], map: {} };

  /* ---------- CSV ---------- */
  function parse(text) {
    text = String(text || '').replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var cnt = function (ch) { return first.split(ch).length - 1; };
    var sep = [',', ';', '\t'].sort(function (a, b) { return cnt(b) - cnt(a); })[0];
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function (x) { return x.trim(); })) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell); if (row.some(function (x) { return x.trim(); })) rows.push(row);
    return rows;
  }

  /* ---------- which column is which ---------- */
  var FIELDS = [
    ['name', 'Full name', /^(full ?name|name|display ?name|client( ?name)?|customer( ?name)?|contact( ?name)?)$/],
    ['first', 'First name', /first/],
    ['last', 'Last name', /last ?name|surname|family/],
    ['company', 'Company', /company|business|organi[sz]ation/],
    ['phone', 'Phone', /mobile|cell/, /phone|tel/],
    ['email', 'Email', /e-?mail/],
    ['address', 'Address', /^(street|address|street address|address ?1|address line 1|service address|billing address|property address)$/, /address|street/],
    ['city', 'City', /^city$|town/],
    ['state', 'State', /^state$|province|region/],
    ['zip', 'ZIP', /zip|postal|post ?code/],
    ['notes', 'Notes', /note|comment|description/],
    ['tags', 'Tags', /^tags?$|label|lead ?source|source/]
  ];
  function guess(head) {
    var h = head.map(function (x) { return String(x).toLowerCase().trim(); }), used = {}, map = {};
    FIELDS.forEach(function (f) {
      for (var p = 2; p < f.length && map[f[0]] === undefined; p++) {
        for (var i = 0; i < h.length; i++) if (!used[i] && f[p].test(h[i])) { map[f[0]] = i; used[i] = 1; break; }
      }
    });
    return map;
  }

  /* ---------- turn a row into a contact ---------- */
  var digits = function (p) { return String(p || '').replace(/\D/g, '').slice(-10); };
  function person(r) {
    var g = function (k) { var i = I.map[k]; return i === undefined || i === '' ? '' : String(r[+i] || '').trim(); };
    var name = g('name') || [g('first'), g('last')].filter(Boolean).join(' ') || g('company');
    var addr = [g('address'), g('city'), [g('state'), g('zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    var notes = [addr ? 'Address: ' + addr : '', g('company') && g('company') !== name ? 'Company: ' + g('company') : '', g('notes')].filter(Boolean).join('\n');
    var tags = ['Imported'].concat(g('tags').split(/[,;|]/).map(function (t) { return t.trim(); }).filter(Boolean)).slice(0, 10);
    var phone = g('phone'), email = g('email').toLowerCase();
    if (!/@/.test(email)) email = '';
    return { name: name || phone || email, phone: phone, email: email, notes: notes.slice(0, 2000), tags: tags };
  }
  function plan() {
    var have = {};
    (window._bpContacts || []).forEach(function (c) { var p = digits(c.phone), e = String(c.email || '').toLowerCase(); if (p) have['p' + p] = 1; if (e) have['e' + e] = 1; });
    var out = { add: [], dupe: 0, empty: 0 }, seen = {};
    I.rows.forEach(function (r) {
      var c = person(r), p = digits(c.phone), e = c.email;
      if (!c.name && !p && !e) { out.empty++; return; }
      if ((p && (have['p' + p] || seen['p' + p])) || (e && (have['e' + e] || seen['e' + e]))) { out.dupe++; return; }
      if (p) seen['p' + p] = 1; if (e) seen['e' + e] = 1;
      out.add.push(c);
    });
    return out;
  }

  /* ---------- the modal ---------- */
  I.open = function () {
    if (!window.bpModal) return;
    I.rows = []; I.head = []; I.map = {};
    bpModal('<h3>Import contacts</h3>'
      + '<p style="font-size:13.5px;color:var(--mu,#5b6678);margin:0 0 12px">Bring your customer list from your old software or a spreadsheet. Export it as a <b>CSV file</b> (most software has an Export button on its customers or clients page; in Excel or Google Sheets, use <b>Save as / Download &rsaquo; CSV</b>), then pick it here.</p>'
      + '<label class="bpx-btn ghost" style="display:block;text-align:center;cursor:pointer;margin:0">Choose CSV file<input type="file" accept=".csv,text/csv,.txt" style="display:none" onchange="bpImport.file(this)"></label>'
      + '<div id="bpImpBody"></div><div class="bpx-mmsg" id="bpx-mmsg"></div>'
      + '<div class="row"><button class="bpx-btn ghost" onclick="bpCloseModal()">Cancel</button><button class="bpx-btn" id="bpx-savebtn" disabled onclick="bpImport.go()">Import</button></div>');
  };
  I.file = function (inp) {
    var f = inp.files && inp.files[0], msg = $('bpx-mmsg'); if (!f) return;
    if (f.size > 10 * 1024 * 1024) { msg.style.color = '#dc2626'; msg.textContent = 'That file is over 10 MB. Split it into smaller files and import each.'; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var all = parse(rd.result);
      if (all.length < 2) { msg.style.color = '#dc2626'; msg.textContent = 'That file has no rows under the column headings.'; return; }
      I.head = all[0]; I.rows = all.slice(1, MAX + 1); I.map = guess(I.head);
      msg.textContent = all.length - 1 > MAX ? 'Only the first ' + MAX + ' rows are imported at a time.' : '';
      msg.style.color = '';
      draw();
    };
    rd.onerror = function () { msg.style.color = '#dc2626'; msg.textContent = 'Could not read that file.'; };
    rd.readAsText(f);
  };
  I.set = function (k, v) { I.map[k] = v === '' ? undefined : +v; draw(); };
  function draw() {
    var body = $('bpImpBody'); if (!body) return;
    var opts = function (k) { return '<option value="">Not in the file</option>' + I.head.map(function (h, i) { return '<option value="' + i + '"' + (I.map[k] === i ? ' selected' : '') + '>' + esc(h || 'Column ' + (i + 1)) + '</option>'; }).join(''); };
    var shown = ['name', 'first', 'last', 'phone', 'email', 'address', 'notes'];
    var p = plan(), ex = p.add.slice(0, 3);
    body.innerHTML = '<div style="margin:14px 0 6px;font-weight:600;font-size:14px">Which column is which</div>'
      + '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;font-size:13px">'
      + shown.map(function (k) { var f = FIELDS.filter(function (x) { return x[0] === k; })[0]; return '<span>' + f[1] + '</span><select style="margin:0" onchange="bpImport.set(\'' + k + '\',this.value)">' + opts(k) + '</select>'; }).join('')
      + '</div>'
      + '<div style="margin:12px 0 4px;font-size:13px;color:var(--mu,#5b6678)">City, state, ZIP, company and tags are picked up too when the file has them.</div>'
      + (ex.length ? '<div style="margin-top:10px;border:1px solid var(--line,#e5e8ef);border-radius:10px;font-size:13px">' + ex.map(function (c) {
          return '<div style="padding:8px 12px;border-bottom:1px solid var(--line,#e5e8ef)"><b>' + esc(c.name) + '</b><div style="color:var(--mu,#5b6678)">' + esc([c.phone, c.email].filter(Boolean).join(' · ') || 'No phone or email') + '</div></div>';
        }).join('') + '</div>' : '')
      + '<p style="font-size:13.5px;margin:12px 0 0"><b>' + p.add.length + ' new ' + (p.add.length === 1 ? 'contact' : 'contacts') + '</b> to import'
      + (p.dupe ? ' &middot; ' + p.dupe + ' already in Contacts' : '') + (p.empty ? ' &middot; ' + p.empty + ' empty rows' : '') + ' (skipped).</p>'
      + '<p style="font-size:12.5px;color:var(--mu,#5b6678);margin:6px 0 0">They\'re saved with the tag <b>Imported</b>. Nobody gets a text from an import.</p>';
    var b = $('bpx-savebtn'); if (b) { b.disabled = !p.add.length; b.textContent = p.add.length ? 'Import ' + p.add.length : 'Import'; }
  }
  I.go = async function () {
    var b = $('bpx-savebtn'), msg = $('bpx-mmsg'), p = plan();
    if (!p.add.length) return;
    if (!(window.BP_LIVE && window.BP_SB)) { msg.style.color = '#dc2626'; msg.textContent = 'Importing works on live accounts.'; return; }
    var owner = window.bpOwnerId ? bpOwnerId() : null, done = 0;
    b.disabled = true;
    for (var i = 0; i < p.add.length; i += 200) {
      b.textContent = 'Importing ' + Math.min(i + 200, p.add.length) + ' of ' + p.add.length + '…';
      var chunk = p.add.slice(i, i + 200).map(function (c) { var r = { name: c.name, phone: c.phone, email: c.email, notes: c.notes, tags: c.tags }; if (owner) r.owner = owner; return r; });
      var res = await BP_SB.from('contacts').insert(chunk);
      if (res.error) {
        msg.style.color = '#dc2626';
        msg.textContent = (done ? done + ' imported, then it stopped: ' : 'Could not import: ') + res.error.message;
        b.disabled = false; b.textContent = 'Try again';
        if (done && window.bpLoadContacts) bpLoadContacts();
        return;
      }
      done += chunk.length;
    }
    msg.style.color = '#15803d';
    msg.textContent = done + (done === 1 ? ' contact' : ' contacts') + ' imported.';
    b.textContent = 'Done';
    setTimeout(function () { if (window.bpCloseModal) bpCloseModal(); if (window.bpLoadContacts) bpLoadContacts(); }, 1200);
  };
  I._parse = parse; I._guess = guess;   /* for tests */
})();
