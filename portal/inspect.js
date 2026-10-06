/* ==================================================================
   Inspection reports: the write-up from a site visit.

   Typed like a document (headings, bold, lists, checkboxes), with photos
   that carry a caption, a Draft / Final status and a print-ready PDF.

   Where they live:
     Contacts → a contact → Inspections tab     reports on that lead
     Projects → a project → Inspections tab      reports on the job, plus
                                                 every report written on its
                                                 contact before it became a job
     Employee portal → Projects → a project      same tab, crew can write one
   bpInspMount(el, ctx) draws the list into any element; ctx is
   { contactId, jobId, name, addr }.

   Rows: public.inspection_reports (supabase/migrations/20261019000000_
   inspection_reports.sql). Photos: project-files bucket, under
   <owner>/<report id>/inspection/ (portal/pfiles.js). Signed out, reports
   stay on this device (localStorage) so the page still works in a demo.
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB && BP_SB.from); };
  var LSK = 'bpInsp';
  var MAXPH = 40;
  var I = window.BP_INSP = { cur: null, ctx: null, el: null, list: [], t: null, dirty: false, saving: false };

  /* ------------------------------------------------------------ store --- */
  function lsAll() { try { return JSON.parse(localStorage.getItem(LSK) || '[]'); } catch (e) { return []; } }
  function lsPut(a) { try { localStorage.setItem(LSK, JSON.stringify(a)); } catch (e) {} }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function norm(s) { return String(s || '').trim().toLowerCase(); }
  function matches(r, ctx) {
    return (ctx.jobId && r.job_id === ctx.jobId) || (ctx.contactId && r.contact_id === ctx.contactId)
      || (!ctx.contactId && ctx.name && norm(r.contact_name) === norm(ctx.name) && !r.job_id);
  }
  function fetchList(ctx) {
    if (!live()) return Promise.resolve(lsAll().filter(function (r) { return matches(r, ctx); }));
    var ors = [];
    if (ctx.jobId) ors.push('job_id.eq.' + ctx.jobId);
    if (ctx.contactId) ors.push('contact_id.eq.' + ctx.contactId);
    if (!ors.length) return Promise.resolve([]);
    return Promise.resolve(BP_SB.from('inspection_reports').select('*').or(ors.join(',')).order('updated_at', { ascending: false }).limit(100))
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function fields(r) {
    return { contact_id: r.contact_id || '', contact_name: r.contact_name || '', address: r.address || '', job_id: r.job_id || '',
      title: r.title || 'Inspection report', kind: r.kind || 'inspection', body: r.body || '', photos: r.photos || [],
      status: r.status === 'final' ? 'final' : 'draft', author_name: r.author_name || '', inspected_on: r.inspected_on || null };
  }
  function persist(r) {
    if (!live()) {
      var a = lsAll(), i = a.findIndex(function (x) { return x.id === r.id; });
      r.updated_at = new Date().toISOString(); if (!r.created_at) r.created_at = r.updated_at;
      if (i < 0) a.unshift(r); else a[i] = r; lsPut(a);
      return Promise.resolve(r);
    }
    var q = r._new ? BP_SB.from('inspection_reports').insert(Object.assign({ id: r.id }, fields(r))).select().single()
      : BP_SB.from('inspection_reports').update(fields(r)).eq('id', r.id).select().single();
    return Promise.resolve(q).then(function (x) { if (x.error) throw x.error; delete r._new; r.updated_at = x.data.updated_at; r.author = x.data.author; return r; });
  }
  function destroy(r) {
    (r.photos || []).forEach(function (p) { if (window.bpPF) bpPF.remove(p.ref); });
    if (!live() || r._new) { lsPut(lsAll().filter(function (x) { return x.id !== r.id; })); return Promise.resolve(); }
    return Promise.resolve(BP_SB.from('inspection_reports').delete().eq('id', r.id)).then(function (x) { if (x.error) throw x.error; });
  }

  /* ---------------------------------------------------------- helpers --- */
  function myName() {
    var T = window.BP_TEAM || {};
    var crew = window.BP_CREWAPP && BP_CREWAPP.me && BP_CREWAPP.me.employee;
    return (crew && crew.name) || T.name || ((window.bpSettingsGet && bpSettingsGet().company) || {}).owner || '';
  }
  function biz() { var c = (window.bpSettingsGet && bpSettingsGet().company) || {}; return { name: c.name || c.business || '', phone: c.phone || '', logo: c.logo || '', trade: c.trade || (window._bpAcct || {}).trade || '', lic: c.license || c.lic || '' }; }
  function day(d) { if (!d) return ''; var x = new Date(String(d).length <= 10 ? d + 'T12:00:00' : d); return isNaN(x) ? '' : x.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  function iso(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function excerpt(html) { var d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<\/(h2|h3|p|li|div|blockquote)>/gi, ' </$1>'); return (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140); }
  function canEdit(r) {
    if (!window.bpTeamIsCrew || !bpTeamIsCrew()) return true;
    var T = window.BP_TEAM || {};
    return !r.author || r._new || r.author === T.uid;
  }

  /* only the formatting the toolbar makes survives a save */
  var KEEP = { P: 1, H2: 1, H3: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, UL: 1, OL: 1, LI: 1, BR: 1, HR: 1, BLOCKQUOTE: 1, DIV: 1, SPAN: 1 };
  function clean(html) {
    var doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html'), root = doc.body.firstChild;
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1) { c.remove(); return; }
        walk(c);
        if (!KEEP[c.tagName]) { while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c); c.remove(); return; }
        var chk = c.tagName === 'UL' && c.getAttribute('data-check') != null, done = c.tagName === 'LI' && c.getAttribute('data-done') != null;
        Array.prototype.slice.call(c.attributes).forEach(function (a) { c.removeAttribute(a.name); });
        if (chk) c.setAttribute('data-check', ''); if (done) c.setAttribute('data-done', '');
      });
    })(root);
    return root.innerHTML.trim();
  }

  /* ---------------------------------------------------------- templates --- */
  function sec(h, items) { return '<h2>' + h + '</h2>' + (items ? '<ul data-check>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '<p><br></p>'); }
  /* one template per trade; std() wraps a trade's own sections in the
     summary / recommendations / next steps every report shares */
  function std(overview, checks, extra) {
    return function () {
      return sec('Summary') + sec(overview[0], overview[1]) + sec(checks[0], checks[1]) + (extra || []).map(function (x) { return sec(x[0], x[1]); }).join('')
        + sec('Recommendations') + sec('Next steps');
    };
  }
  var TRADE_TPL = {
    roof: { t: 'Roof inspection', re: /roof/i, b: std(['Roof overview', ['Roof type / material:', 'Approximate age:', 'Layers:', 'Pitch:']],
      ['Condition', ['Shingles / surface', 'Flashing (chimney, walls, valleys)', 'Vents and boots', 'Gutters and downspouts', 'Decking (soft spots)', 'Attic ventilation']],
      [['Damage found', ['Hail', 'Wind / missing shingles', 'Leaks / water stains']]]) },
    hvac: { t: 'HVAC inspection', re: /hvac|heating|\bair\b|cooling|furnace|a\/c\b/i, b: std(['System overview', ['Equipment type (split, package, heat pump, furnace):', 'Make / model / serial:', 'Age:', 'Tonnage / BTU:', 'Refrigerant:']],
      ['Checks', ['Thermostat operation', 'Air filter', 'Condenser coil and fins', 'Evaporator coil', 'Refrigerant pressures / superheat / subcool', 'Capacitors and contactor', 'Blower motor and wheel', 'Condensate drain and pan', 'Ductwork and returns', 'Burner, heat exchanger and flue', 'Carbon monoxide test']],
      [['Readings', ['Supply temp:', 'Return temp:', 'Temperature split:', 'Static pressure:', 'Amp draw:']]]) },
    plumbing: { t: 'Plumbing inspection', re: /plumb/i, b: std(['System overview', ['Supply pipe material:', 'Drain / waste material:', 'Water heater type / age:', 'Main shutoff location:']],
      ['Checks', ['Water pressure', 'Visible leaks', 'Fixtures and faucets', 'Toilets', 'Drains (speed / clogs)', 'Water heater (anode, T&P valve, venting)', 'Sewer line / cleanouts', 'Shutoff valves', 'Hose bibs', 'Signs of corrosion']],
      [['Readings', ['Static pressure (psi):', 'Water heater temp:']]]) },
    electrical: { t: 'Electrical inspection', re: /electric/i, b: std(['Service overview', ['Service size (amps):', 'Panel make / age:', 'Main breaker:', 'Service entrance / meter condition:', 'Grounding and bonding:']],
      ['Checks', ['Panel labelling', 'Breaker condition / double taps', 'Aluminum or knob-and-tube wiring', 'GFCI protection (kitchen, baths, exterior, garage)', 'AFCI protection', 'Outlets and switches', 'Smoke and CO detectors', 'Exterior and outbuilding wiring', 'Signs of overheating']],
      [['Readings', ['Voltage L1-L2:', 'Load notes:']]]) },
    general: { t: 'Remodel walkthrough', re: /general|remodel|contract/i, b: std(['Scope', ['Rooms / areas:', 'What the customer wants:', 'Budget range:', 'Timeline:']],
      ['Existing conditions', ['Structure / framing', 'Walls and ceilings', 'Floors', 'Plumbing in the area', 'Electrical in the area', 'HVAC in the area', 'Moisture / mold', 'Permits likely needed']],
      [['Measurements']]) },
    landscaping: { t: 'Landscape assessment', re: /landscap|lawn|yard|garden/i, b: std(['Property overview', ['Lot size:', 'Sun / shade:', 'Soil type:', 'Slope:']],
      ['Checks', ['Lawn condition', 'Trees and shrubs', 'Beds and mulch', 'Irrigation (zones, heads, leaks)', 'Drainage / standing water', 'Hardscape (patio, walls, paths)', 'Fencing', 'Lighting']],
      [['Measurements']]) },
    pools: { t: 'Pool inspection', re: /pool|spa/i, b: std(['Pool overview', ['Type (gunite, vinyl, fiberglass):', 'Size / gallons:', 'Age:', 'Heater:']],
      ['Checks', ['Surface / liner', 'Tile and coping', 'Deck', 'Pump', 'Filter', 'Heater', 'Plumbing / visible leaks', 'Skimmers and returns', 'Lights and bonding', 'Safety (fence, gate, drain covers)']],
      [['Water chemistry', ['pH:', 'Free chlorine:', 'Alkalinity:', 'Calcium hardness:', 'Cyanuric acid:']]]) },
    trim: { t: 'Trim & carpentry assessment', re: /trim|carpent|millwork/i, b: std(['Scope', ['Rooms / areas:', 'Profile / style wanted:', 'Material (MDF, pine, poplar, PVC):', 'Paint or stain grade:']],
      ['Existing conditions', ['Baseboard', 'Door casing', 'Window casing', 'Crown', 'Wainscoting / panels', 'Wall straightness', 'Gaps / caulk', 'Water damage or rot']],
      [['Measurements (linear feet)']]) },
    painting: { t: 'Paint assessment', re: /paint/i, b: std(['Scope', ['Interior / exterior:', 'Rooms or elevations:', 'Colors / sheen:', 'Number of coats:']],
      ['Surface condition', ['Peeling / flaking', 'Cracks and holes', 'Water stains', 'Wood rot', 'Mildew', 'Caulk', 'Lead paint risk (pre-1978)', 'Prep and repairs needed']],
      [['Measurements (sq ft)']]) },
    countertops: { t: 'Countertop measure & assessment', re: /counter|granite|quartz|stone/i, b: std(['Scope', ['Material wanted:', 'Edge profile:', 'Sink type / mount:', 'Cooktop / appliance cutouts:', 'Backsplash:']],
      ['Existing conditions', ['Cabinets level and secure', 'Cabinet support for stone', 'Existing top removal', 'Plumbing to disconnect', 'Walls square', 'Seam locations']],
      [['Measurements (sq ft)']]) },
    concrete: { t: 'Concrete & paving assessment', re: /concrete|paving|asphalt|driveway/i, b: std(['Scope', ['Area (driveway, patio, walk, slab):', 'Remove and replace or overlay:', 'Finish wanted:', 'Thickness:']],
      ['Existing conditions', ['Cracks', 'Settling / heaving', 'Spalling / scaling', 'Drainage and slope', 'Tree roots', 'Base / subgrade', 'Access for trucks']],
      [['Measurements (sq ft)']]) },
    flooring: { t: 'Flooring assessment', re: /floor/i, b: std(['Scope', ['Rooms:', 'Flooring wanted:', 'Existing flooring to remove:', 'Stairs:', 'Transitions:']],
      ['Subfloor & conditions', ['Subfloor level / flat', 'Squeaks or soft spots', 'Moisture (concrete test)', 'Door clearances', 'Baseboard to remove / reinstall', 'Furniture to move']],
      [['Measurements (sq ft)']]) }
  };
  var TPL = {
    damage: { t: 'Damage / insurance report', b: function () {
      return sec('Date of loss and cause') + sec('Areas affected', ['Roof', 'Siding', 'Windows / screens', 'Gutters', 'Interior'])
        + sec('Damage details') + sec('Measurements') + sec('Recommended scope of repair') + sec('Notes for the adjuster'); } },
    site: { t: 'Site inspection', b: function () {
      return sec('Summary') + sec('What the customer wants') + sec('Existing conditions') + sec('Measurements')
        + sec('Issues found') + sec('Recommendations') + sec('Next steps'); } },
    blank: { t: 'Inspection notes', b: function () { return '<p><br></p>'; } }
  };
  Object.keys(TRADE_TPL).forEach(function (k) { TPL[k] = TRADE_TPL[k]; });
  /* the business's trade template; the job's own trade wins when it names one */
  function tplFor(hint) {
    var keys = Object.keys(TRADE_TPL), pick = function (txt) { return keys.filter(function (k) { return txt && TRADE_TPL[k].re.test(txt); })[0]; };
    return pick(hint) || pick(biz().trade) || 'site';
  }
  /* chips: this trade first, then the shared ones */
  function chipKeys(k) { return (TRADE_TPL[k] ? [k] : []).concat(['site', 'damage', 'blank']); }

  /* ------------------------------------------------------------- list --- */
  window.bpInspMount = function (el, ctx) {
    if (!el) return;
    I.el = el; I.ctx = ctx || {};
    el.innerHTML = '<div class="insp-head"><div><b>Inspection reports</b><small>Notes, findings and photos from the site visit. Print one as a PDF for the customer or the adjuster.</small></div>'
      + '<button type="button" class="bpx-btn insp-new" onclick="bpInspNew()"><span class="ms">add</span>New report</button></div>'
      + '<div class="insp-list" id="insp-list"><div class="bpx-mut" style="font-size:13px;padding:8px 0">Loading reports…</div></div>';
    fetchList(I.ctx).then(function (rows) { I.list = rows; drawList(); }).catch(function () {
      var l = document.getElementById('insp-list'); if (l) l.innerHTML = '<div class="insp-empty"><span class="ms">cloud_off</span><b>Couldn’t load reports</b><small>Check your connection and open this tab again.</small></div>';
    });
  };
  function drawList() {
    var l = document.getElementById('insp-list'); if (!l) return;
    var n = I.list.length;
    var tb = document.querySelector('[data-pj-tab="inspect"] .pjs-n, [data-cs-tab="inspect"] .pjs-n, [data-ct-tab="inspect"] .pjs-n'); if (tb) tb.textContent = n ? String(n) : '';
    if (!n) {
      l.innerHTML = '<div class="insp-empty"><span class="ms">fact_check</span><b>No inspection reports yet</b><small>Write up what you found on site, add photos, and it stays with this customer, and with the project once they sign.</small>'
        + '<button type="button" class="bpx-btn" onclick="bpInspNew()">Write a report</button></div>';
      return;
    }
    l.innerHTML = I.list.map(function (r, i) {
      var ph = r.photos || [], first = ph[0];
      var from = I.ctx.jobId && r.job_id !== I.ctx.jobId ? '<span class="insp-from">From the lead</span>' : '';
      return '<button type="button" class="insp-card" onclick="bpInspOpen(' + i + ')">'
        + '<div class="insp-thumb">' + (first && window.bpPF ? bpPF.img(first.ref, 'alt=""') : '<span class="ms">description</span>') + '</div>'
        + '<div class="insp-ct"><div class="insp-t"><b>' + esc(r.title || 'Inspection report') + '</b><span class="insp-st ' + (r.status === 'final' ? 'fin' : '') + '">' + (r.status === 'final' ? 'Final' : 'Draft') + '</span>' + from + '</div>'
        + '<small>' + esc(day(r.inspected_on || r.created_at)) + (r.author_name ? ' · ' + esc(r.author_name) : '') + ' · ' + ph.length + ' photo' + (ph.length === 1 ? '' : 's') + '</small>'
        + '<p>' + esc(excerpt(r.body) || 'Empty report') + '</p></div><span class="ms insp-go">chevron_right</span></button>';
    }).join('');
  }
  function refresh() { if (I.el && document.body.contains(I.el)) fetchList(I.ctx).then(function (rows) { I.list = rows; drawList(); }).catch(function () {}); }

  window.bpInspNew = function () {
    var c = I.ctx || {}, k = tplFor(c.trade);
    var r = { id: uuid(), _new: true, contact_id: c.contactId || '', contact_name: c.name || '', address: c.addr || '', job_id: c.jobId || '',
      title: TPL[k].t, kind: k, body: TPL[k].b(), photos: [], status: 'draft', author_name: myName(), inspected_on: iso(), _fresh: true };
    editor(r);
  };
  window.bpInspOpen = function (i) { var r = I.list[i]; if (r) editor(JSON.parse(JSON.stringify(r))); };

  /* ----------------------------------------------------------- editor --- */
  var TOOLS = [['h2', 'title', 'Heading'], ['h3', 'text_fields', 'Subheading'], ['bold', 'format_bold', 'Bold'], ['italic', 'format_italic', 'Italic'], ['underline', 'format_underlined', 'Underline'], ['|'],
    ['ul', 'format_list_bulleted', 'Bullet list'], ['ol', 'format_list_numbered', 'Numbered list'], ['check', 'checklist', 'Checklist'], ['hr', 'horizontal_rule', 'Divider'], ['|'], ['photo', 'add_a_photo', 'Add photos']];
  function editor(r) {
    I.cur = r; I.dirty = false;
    var ro = !canEdit(r);
    var host = document.getElementById('bpx') || document.body;
    var old = document.getElementById('insp-ed'); if (old) old.remove();
    var w = document.createElement('div'); w.id = 'insp-ed'; w.className = 'insp-ed'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'Inspection report');
    var tplRow = r._fresh ? '<div class="insp-tpl" id="insp-tpl"><span>Start from</span>' + chipKeys(r.kind).map(function (k) { return '<button type="button" class="' + (k === r.kind ? 'on' : '') + '" onclick="bpInspTpl(\'' + k + '\')">' + esc(TPL[k].t) + '</button>'; }).join('') + '</div>' : '';
    w.innerHTML = '<div class="insp-bar">'
      + '<button type="button" class="insp-ib" onclick="bpInspClose()" aria-label="Close"><span class="ms">arrow_back</span></button>'
      + '<input class="insp-title" id="insp-title" value="' + esc(r.title) + '" aria-label="Report title"' + (ro ? ' readonly' : '') + '>'
      + '<span class="insp-saved" id="insp-saved">' + (r._new ? 'Not saved yet' : 'Saved') + '</span>'
      + (ro ? '' : '<div class="insp-seg" role="group" aria-label="Status"><button type="button" data-st="draft" class="' + (r.status !== 'final' ? 'on' : '') + '" onclick="bpInspStatus(\'draft\')">Draft</button><button type="button" data-st="final" class="' + (r.status === 'final' ? 'on' : '') + '" onclick="bpInspStatus(\'final\')">Final</button></div>')
      + '<button type="button" class="insp-ib" onclick="bpInspPrint()" title="Print or save as PDF" aria-label="Print or save as PDF"><span class="ms">picture_as_pdf</span></button>'
      + (ro || r._new ? '' : '<button type="button" class="insp-ib del" onclick="bpInspDelete()" title="Delete report" aria-label="Delete report"><span class="ms">delete</span></button>')
      + '</div>'
      + (ro ? '' : '<div class="insp-tools" role="toolbar" aria-label="Formatting">' + TOOLS.map(function (t) { return t[0] === '|' ? '<i></i>' : '<button type="button" title="' + t[2] + '" aria-label="' + t[2] + '" onmousedown="event.preventDefault()" onclick="bpInspCmd(\'' + t[0] + '\')"><span class="ms">' + t[1] + '</span></button>'; }).join('')
        + '<input type="file" id="insp-file" accept="image/*" multiple hidden onchange="bpInspPhotos(this)"></div>')
      + '<div class="insp-scroll"><div class="insp-paper">'
      + tplRow
      + '<div class="insp-meta">'
      + meta('Customer', 'contact_name', r.contact_name, ro) + meta('Address', 'address', r.address, ro)
      + '<label><span>Inspected</span><input type="date" data-f="inspected_on" value="' + esc(r.inspected_on || '') + '"' + (ro ? ' readonly' : '') + '></label>'
      + meta('Inspector', 'author_name', r.author_name, ro) + '</div>'
      + '<div class="insp-doc" id="insp-doc"' + (ro ? '' : ' contenteditable="true"') + ' spellcheck="true" aria-label="Report">' + (r.body || '<p><br></p>') + '</div>'
      + '<div class="insp-ph"><div class="insp-ph-h"><b>Photos</b><small id="insp-phn"></small>' + (ro ? '' : '<button type="button" class="bpx-btn ghost" onclick="document.getElementById(\'insp-file\').click()"><span class="ms">add_a_photo</span>Add photos</button>') + '</div>'
      + '<div class="insp-ph-g" id="insp-ph-g"></div></div>'
      + '</div></div>';
    host.appendChild(w);
    document.documentElement.classList.add('insp-open');
    drawPhotos();
    var doc = document.getElementById('insp-doc');
    if (!ro) {
      doc.addEventListener('input', touch);
      doc.addEventListener('click', function (e) { var li = e.target.closest && e.target.closest('ul[data-check] > li'); if (li && e.offsetX < 24) { li.toggleAttribute('data-done'); touch(); } });
      doc.addEventListener('paste', function (e) {
        var cd = e.clipboardData; if (!cd) return;
        var files = Array.prototype.filter.call(cd.files || [], function (f) { return /^image\//.test(f.type); });
        if (files.length) { e.preventDefault(); addFiles(files); return; }
        var h = cd.getData('text/html'); if (h) { e.preventDefault(); document.execCommand('insertHTML', false, clean(h)); }
      });
      w.querySelector('#insp-title').addEventListener('input', touch);
      w.querySelectorAll('[data-f]').forEach(function (x) { x.addEventListener('input', touch); });
    }
    w.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); bpInspClose(); } });
    setTimeout(function () { if (!ro && r._fresh) { var h = doc.querySelector('p'); place(h || doc); } }, 40);
  }
  function meta(lbl, f, v, ro) { return '<label><span>' + lbl + '</span><input data-f="' + f + '" value="' + esc(v || '') + '"' + (ro ? ' readonly' : '') + '></label>'; }
  function place(n) { try { var s = window.getSelection(), rg = document.createRange(); rg.selectNodeContents(n); rg.collapse(true); s.removeAllRanges(); s.addRange(rg); document.getElementById('insp-doc').focus({ preventScroll: true }); } catch (e) {} }

  function collect() {
    var r = I.cur, w = document.getElementById('insp-ed'); if (!r || !w) return r;
    r.title = (document.getElementById('insp-title').value || '').trim() || 'Inspection report';
    w.querySelectorAll('[data-f]').forEach(function (x) { r[x.getAttribute('data-f')] = x.value || (x.type === 'date' ? null : ''); });
    r.body = clean(document.getElementById('insp-doc').innerHTML);
    return r;
  }
  function saved(t) { var s = document.getElementById('insp-saved'); if (s) s.textContent = t; }
  function touch() { I.dirty = true; saved('Saving…'); clearTimeout(I.t); I.t = setTimeout(save, 1100); }
  function save() {
    clearTimeout(I.t);
    var r = collect(); if (!r || !canEdit(r)) return Promise.resolve();
    if (I.saving) { I.again = true; return I.saving; }
    I.dirty = false; delete r._fresh;
    var tp = document.getElementById('insp-tpl'); if (tp) tp.remove();
    I.saving = persist(r).then(function () {
      I.saving = null; saved('Saved');
      if (I.again) { I.again = false; return save(); }
    }).catch(function (e) {
      I.saving = null; I.dirty = true; saved('Not saved: ' + ((e && e.message) || 'try again').slice(0, 60));
    });
    return I.saving;
  }

  window.bpInspTpl = function (k) {
    var r = I.cur; if (!r || !TPL[k]) return;
    r.kind = k; document.getElementById('insp-doc').innerHTML = TPL[k].b();
    var t = document.getElementById('insp-title'); if (t && (!t.value || Object.keys(TPL).some(function (x) { return TPL[x].t === t.value; }))) t.value = TPL[k].t;
    document.querySelectorAll('#insp-tpl button').forEach(function (b) { b.classList.toggle('on', b.textContent === TPL[k].t); });
  };
  window.bpInspCmd = function (c) {
    var d = document.getElementById('insp-doc'); if (!d) return;
    if (c === 'photo') { document.getElementById('insp-file').click(); return; }
    d.focus();
    if (c === 'h2' || c === 'h3') {
      var cur = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      document.execCommand('formatBlock', false, cur === c ? 'p' : c);
    } else if (c === 'ul') document.execCommand('insertUnorderedList');
    else if (c === 'ol') document.execCommand('insertOrderedList');
    else if (c === 'hr') document.execCommand('insertHorizontalRule');
    else if (c === 'check') {
      var s = window.getSelection(), n = s && s.anchorNode, ul = n && (n.nodeType === 1 ? n : n.parentNode).closest && (n.nodeType === 1 ? n : n.parentNode).closest('ul');
      if (ul && d.contains(ul)) { ul.toggleAttribute('data-check'); }
      else {
        document.execCommand('insertUnorderedList');
        s = window.getSelection(); n = s && s.anchorNode;
        ul = n && (n.nodeType === 1 ? n : n.parentNode).closest('ul'); if (ul) ul.setAttribute('data-check', '');
      }
    } else document.execCommand(c);
    touch();
  };
  window.bpInspStatus = function (st) {
    if (!I.cur) return; I.cur.status = st;
    document.querySelectorAll('.insp-seg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-st') === st); });
    touch();
  };
  window.bpInspClose = function () {
    var r = I.cur, w = document.getElementById('insp-ed');
    var finish = function () { if (w) w.remove(); document.documentElement.classList.remove('insp-open'); I.cur = null; refresh(); };
    if (r && canEdit(r) && (I.dirty || (r._new && !r._fresh))) { save().then(finish, finish); return; }
    finish();
  };
  window.bpInspDelete = function () {
    var r = I.cur; if (!r || !confirm('Delete "' + (r.title || 'this report') + '" and its photos? This can\'t be undone.')) return;
    clearTimeout(I.t); I.dirty = false;
    destroy(r).then(function () { I.cur = null; bpInspClose(); }).catch(function (e) { alert('Couldn’t delete it: ' + ((e && e.message) || 'try again')); });
  };

  /* ----------------------------------------------------------- photos --- */
  function drawPhotos() {
    var r = I.cur, g = document.getElementById('insp-ph-g'); if (!r || !g) return;
    var ro = !canEdit(r), ph = r.photos || [];
    var n = document.getElementById('insp-phn'); if (n) n.textContent = ph.length ? ph.length + ' of ' + MAXPH : '';
    if (!ph.length) { g.innerHTML = '<div class="insp-ph-e">' + (ro ? 'No photos on this report.' : 'Take photos on site or add them from your phone. Paste works too.') + '</div>'; return; }
    g.innerHTML = ph.map(function (p, i) {
      return '<figure class="insp-fig">' + (window.bpPF ? bpPF.img(p.ref, 'alt="" onclick="bpInspView(' + i + ')"') : '')
        + (p.busy ? '<span class="insp-busy">Uploading…</span>' : '')
        + (ro ? (p.cap ? '<figcaption>' + esc(p.cap) + '</figcaption>' : '')
          : '<input class="insp-cap" placeholder="Caption, e.g. Hail hit on north slope" value="' + esc(p.cap || '') + '" oninput="bpInspCap(' + i + ',this.value)">'
            + '<button type="button" class="insp-rm" title="Remove photo" aria-label="Remove photo" onclick="bpInspRm(' + i + ')"><span class="ms">close</span></button>')
        + '</figure>';
    }).join('');
    if (window.bpPF) bpPF.hydrate(g);
  }
  window.bpInspCap = function (i, v) { var p = I.cur && I.cur.photos[i]; if (p) { p.cap = v; touch(); } };
  window.bpInspRm = function (i) {
    var r = I.cur, p = r && r.photos[i]; if (!p) return;
    if (window.bpPF) bpPF.remove(p.ref); r.photos.splice(i, 1); drawPhotos(); touch();
  };
  window.bpInspView = function (i) { var p = I.cur && I.cur.photos[i]; if (p && window.bpPF) bpPF.open(p.ref, 'image/jpeg'); };
  function shrink(file) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () {
        var im = new Image();
        im.onload = function () {
          var M = 1800, s = Math.min(1, M / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.82));
        };
        im.onerror = function () { res(fr.result); };
        im.src = fr.result;
      };
      fr.onerror = function () { res(null); };
      fr.readAsDataURL(file);
    });
  }
  function addFiles(files) {
    var r = I.cur; if (!r) return;
    var room = MAXPH - (r.photos || []).length;
    if (room <= 0) { alert('Up to ' + MAXPH + ' photos per report.'); return; }
    Array.prototype.slice.call(files, 0, room).forEach(function (f) {
      shrink(f).then(function (data) {
        if (!data || I.cur !== r) return;
        var p = { ref: data, cap: '', at: Date.now(), busy: live() };
        r.photos.push(p); drawPhotos(); touch();
        if (!live() || !window.bpPF) { p.busy = false; return; }
        bpPF.upload(r.id, 'inspection', data, f.name || 'photo.jpg').then(function (ref) {
          p.ref = ref; p.busy = false; if (I.cur === r) { drawPhotos(); touch(); }
        }).catch(function () { p.busy = false; if (I.cur === r) drawPhotos(); });
      });
    });
  }
  window.bpInspPhotos = function (inp) { if (inp.files && inp.files.length) addFiles(inp.files); inp.value = ''; };

  /* ------------------------------------------------------------ print --- */
  window.bpInspPrint = function () {
    var r = collect(); if (!r) return;
    var w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print the report.'); return; }
    w.document.write('<p style="font:14px system-ui;padding:24px">Preparing the report…</p>');
    var b = biz();
    Promise.all((r.photos || []).map(function (p) { return window.bpPF ? bpPF.url(p.ref).catch(function () { return ''; }) : Promise.resolve(p.ref); })).then(function (urls) {
      var photos = (r.photos || []).map(function (p, i) { return urls[i] ? '<figure><img src="' + esc(urls[i]) + '" alt=""><figcaption><b>Photo ' + (i + 1) + '</b>' + (p.cap ? ' · ' + esc(p.cap) : '') + '</figcaption></figure>' : ''; }).join('');
      var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(r.title) + (r.contact_name ? ' - ' + esc(r.contact_name) : '') + '</title><style>'
        + '@page{size:letter;margin:16mm 15mm}*{box-sizing:border-box}body{font:11pt/1.55 -apple-system,"Segoe UI",Inter,Arial,sans-serif;color:#101828;margin:0}'
        + 'header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #101828;padding-bottom:12px;margin-bottom:16px}'
        + 'header img{max-height:54px;max-width:180px}.biz b{font-size:14pt;display:block}.biz small{color:#475467}h1{font-size:19pt;margin:0 0 4px;letter-spacing:-.01em}'
        + '.tag{display:inline-block;font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 8px;border-radius:99px;border:1px solid #98a2b3;color:#344054}'
        + 'dl{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 16px;margin:14px 0 18px;padding:12px 14px;background:#f2f4f7;border-radius:6px}dt{font-size:8pt;text-transform:uppercase;letter-spacing:.06em;color:#667085;font-weight:600}dd{margin:2px 0 0;font-weight:600}'
        + 'h2{font-size:13pt;margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid #e4e7ec;break-after:avoid}h3{font-size:11.5pt;margin:12px 0 4px}p{margin:0 0 8px}ul,ol{margin:0 0 8px;padding-left:22px}'
        + 'ul[data-check]{list-style:none;padding-left:4px}ul[data-check]>li{padding-left:24px;position:relative;margin:3px 0}ul[data-check]>li:before{content:"";position:absolute;left:0;top:3px;width:12px;height:12px;border:1.5px solid #475467;border-radius:3px}'
        + 'ul[data-check]>li[data-done]:before{background:#101828;border-color:#101828}ul[data-check]>li[data-done]:after{content:"";position:absolute;left:4px;top:5px;width:4px;height:7px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}'
        + 'hr{border:0;border-top:1px solid #d0d5dd;margin:14px 0}blockquote{margin:8px 0;padding:6px 12px;border-left:3px solid #d0d5dd;color:#344054}'
        + '.ph{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}figure{margin:0;break-inside:avoid}figure img{width:100%;height:230px;object-fit:cover;border-radius:4px;border:1px solid #e4e7ec}figcaption{font-size:9pt;color:#475467;margin-top:4px}'
        + 'footer{margin-top:28px;padding-top:10px;border-top:1px solid #e4e7ec;font-size:8.5pt;color:#667085;display:flex;justify-content:space-between}'
        + '</style></head><body><header><div class="biz">' + (b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : '') + '<b>' + esc(b.name || '') + '</b><small>' + esc([b.phone, b.lic ? 'Lic. ' + b.lic : ''].filter(Boolean).join(' · ')) + '</small></div>'
        + '<div style="text-align:right"><h1>' + esc(r.title) + '</h1><span class="tag">' + (r.status === 'final' ? 'Final report' : 'Draft') + '</span></div></header>'
        + '<dl><div><dt>Customer</dt><dd>' + esc(r.contact_name || '—') + '</dd></div><div><dt>Property</dt><dd>' + esc(r.address || '—') + '</dd></div><div><dt>Inspected</dt><dd>' + esc(day(r.inspected_on) || '—') + '</dd></div><div><dt>Inspector</dt><dd>' + esc(r.author_name || '—') + '</dd></div></dl>'
        + '<main>' + (r.body || '') + '</main>'
        + (photos ? '<h2>Photos</h2><div class="ph">' + photos + '</div>' : '')
        + '<footer><span>' + esc(b.name || '') + '</span><span>Prepared ' + esc(day(new Date().toISOString())) + '</span></footer>'
        + '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>';
      w.document.open(); w.document.write(html); w.document.close();
    });
  };

  /* ------------------------------------------- contact page: two tabs --- */
  function hookContact() {
    if (!window.bpContactPage || window.bpContactPage._insp) return;
    var orig = window.bpContactPage;
    var f = function (id, tab) {
      var res = orig.apply(this, arguments);
      try {
        var area = document.getElementById('bpxViewArea'), grid = area && area.querySelector('.bpx-set-grid');
        var c = (window._bpContacts || []).filter(function (x) { return x.id === id; })[0] || {};
        if (!grid) return res;
        var bar = document.createElement('div'); bar.className = 'pjs-tabs insp-ctabs'; bar.setAttribute('role', 'tablist');
        bar.innerHTML = [['over', 'Overview', 'person'], ['inspect', 'Inspections', 'fact_check']].map(function (t) {
          return '<button type="button" class="bpx-jt pjs-tab" role="tab" data-ct-tab="' + t[0] + '" onclick="bpCtTab(\'' + t[0] + '\')"><span class="ms">' + t[2] + '</span><span class="pjs-tl">' + t[1] + '</span><span class="pjs-n"></span></button>';
        }).join('');
        grid.parentNode.insertBefore(bar, grid);
        grid.setAttribute('data-ct-pane', 'over');
        var p = document.createElement('div'); p.setAttribute('data-ct-pane', 'inspect'); p.className = 'bpx-panel insp-pane'; p.hidden = true;
        grid.after(p);
        I.cctx = { contactId: id, name: c.name || '', addr: c.address1 || c.address || [c.city, c.state].filter(Boolean).join(', ') };
        bpCtTab(tab === 'inspect' ? 'inspect' : 'over');
        /* the count on the tab, without waiting for it to be opened */
        fetchList(I.cctx).then(function (rows) { var n = document.querySelector('[data-ct-tab="inspect"] .pjs-n'); if (n) n.textContent = rows.length ? String(rows.length) : ''; }).catch(function () {});
      } catch (e) { if (window.console) console.error(e); }
      return res;
    };
    f._insp = true; window.bpContactPage = f;
  }
  window.bpCtTab = function (t) {
    document.querySelectorAll('[data-ct-tab]').forEach(function (b) { var on = b.getAttribute('data-ct-tab') === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('[data-ct-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-ct-pane') !== t; });
    if (t === 'inspect') bpInspMount(document.querySelector('[data-ct-pane="inspect"]'), I.cctx || {});
  };

  /* project context for the project sheet and the crew sheet */
  window.bpInspJobCtx = function (j) {
    if (!j) return {};
    var cid = j.contactId || '';
    if (!cid && window._bpContacts) {
      var d = function (s) { return String(s || '').replace(/\D/g, ''); };
      var c = _bpContacts.filter(function (x) { return (j.phone && x.phone && d(x.phone) === d(j.phone)) || (j.name && x.name === j.name); })[0];
      if (c) cid = c.id;
    }
    return { jobId: j.id, contactId: cid, name: j.name || '', addr: j.addr || '', trade: [j.trade, j.type, j.title].filter(Boolean).join(' ') };
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookContact); else hookContact();
  setTimeout(hookContact, 0);
})();
