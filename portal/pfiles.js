/* ==================================================================
   Project files: photos, documents and blueprints.

   Up to 24 photos, 32 documents and 8 blueprints a project. Those used to
   live inside the project record as data URLs, which cannot scale to this
   (the browser's localStorage holds about 5 MB for everything). So each
   file goes to the private `project-files` bucket
   (supabase/migrations/20260927000000_project_files.sql) and the project
   keeps a reference, "sb:<path>".

   The swap is invisible to the code that adds files: a file is pushed as a
   data URL straight away, so it shows at once, then uploaded, and the entry
   is replaced with its reference when the upload lands. Signed out, or if
   the upload fails, the data URL simply stays, as before.

   Anything that shows a stored file uses <img data-pf="ref">; an observer
   on the portal fills in a short-lived signed URL.
   ================================================================== */
(function () {
  'use strict';
  var PF = window.bpPF = {};
  PF.MAX = { photos: 24, docs: 32, blueprints: 8 };
  var BUCKET = 'project-files';
  var live = function () { return !!(window.BP_LIVE && window.BP_SB && BP_SB.storage); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var cache = {};   /* ref -> { url, until } */

  PF.isRef = function (s) { return typeof s === 'string' && s.indexOf('sb:') === 0; };

  function dataToBlob(d) {
    var p = String(d).split(','), mime = (p[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    var bin = atob(p[1] || ''), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime });
  }
  function safe(n) { return String(n || 'file').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-60) || 'file'; }

  /* upload one file; resolves to its "sb:" reference */
  PF.upload = function (jobId, kind, data, name) {
    if (!live()) return Promise.reject(new Error('offline'));
    var owner = (window.bpOwnerId && bpOwnerId()) || '';
    if (!owner) return Promise.reject(new Error('no owner'));
    var blob = data instanceof Blob ? data : dataToBlob(data);
    var path = owner + '/' + jobId + '/' + kind + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '-' + safe(name);
    return BP_SB.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false })
      .then(function (r) { if (r.error) throw r.error; return 'sb:' + path; });
  };

  /* after a file has been pushed as a data URL, move it to storage and swap
     the entry for its reference. get(j) returns the value to swap, set(j, ref)
     writes it back, so photos (strings) and documents (objects) share this. */
  PF.adopt = function (j, kind, data, name, get, set) {
    if (!live() || !j) return;
    PF.upload(j.id, kind, data, name).then(function (ref) {
      if (get(j) !== data) return;         /* removed or replaced meanwhile */
      set(j, ref);
      try { if (window.bpJobsSet && window.bpJobsGet) bpJobsSet(bpJobsGet()); } catch (e) {}
    }).catch(function () { /* stays a data URL; nothing lost */ });
  };

  /* a URL that can be shown or opened */
  PF.url = function (ref) {
    if (!PF.isRef(ref)) return Promise.resolve(ref || '');
    var c = cache[ref];
    if (c && c.until > Date.now()) return Promise.resolve(c.url);
    if (!live()) return Promise.resolve('');
    return BP_SB.storage.from(BUCKET).createSignedUrl(ref.slice(3), 3600).then(function (r) {
      var u = (r && r.data && r.data.signedUrl) || '';
      if (u) cache[ref] = { url: u, until: Date.now() + 50 * 60 * 1000 };
      return u;
    });
  };
  PF.remove = function (ref) { if (PF.isRef(ref) && live()) BP_SB.storage.from(BUCKET).remove([ref.slice(3)]).catch(function () {}); };
  PF.open = function (ref, mime) {
    var w = window.open('', '_blank');
    PF.url(ref).then(function (u) {
      if (!u) { if (w) w.close(); alert('That file could not be opened. Sign in and try again.'); return; }
      if (u.indexOf('data:') === 0) {
        try { u = URL.createObjectURL(dataToBlob(u)); } catch (e) {}
      }
      if (w) w.location.href = u; else window.open(u, '_blank');
    });
  };
  PF.img = function (ref, attrs) {
    return '<img data-pf="' + esc(ref) + '"' + (PF.isRef(ref) ? '' : ' src="' + esc(ref) + '"') + ' ' + (attrs || '') + '>';
  };
  function hydrate(root) {
    (root || document).querySelectorAll('img[data-pf]:not([data-pf-done])').forEach(function (im) {
      var ref = im.getAttribute('data-pf'); im.setAttribute('data-pf-done', '1');
      if (!PF.isRef(ref)) { if (!im.getAttribute('src')) im.src = ref; return; }
      PF.url(ref).then(function (u) { if (u) im.src = u; });
    });
  }
  PF.hydrate = hydrate;
  function watch() {
    var root = document.getElementById('bpx'); if (!root || !window.MutationObserver) return;
    new MutationObserver(function () { hydrate(root); }).observe(root, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  /* ---------------------------------------------------------------- blueprints --- */
  function job() { return (window.bpJobsGet ? bpJobsGet() : []).filter(function (x) { return x.id === window._bpProjId; })[0]; }
  function trade() { return (((window.bpSettingsGet && bpSettingsGet().company) || {}).trade) || ''; }

  PF.bpPane = function (j) {
    var n = (j.blueprints || []).length;
    return '<label style="margin-top:0">Blueprints (' + n + '/' + PF.MAX.blueprints + ')</label>'
      + '<div class="bpx-mut" style="font-size:12px;margin-bottom:8px">Plan sheets, roof plans, floor plans, elevations. '
      + 'Tap <b>Analyze</b> and the AI reads the drawing: what it shows, the measurements on it, a materials takeoff for your trade, and anything to check before you quote.</div>'
      + '<div id="bpx-pj-bps"></div>'
      + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
      + '<button class="bpx-btn" style="width:auto;margin-top:0" onclick="document.getElementById(\'bpx-pj-bp\').click()">+ Add blueprint</button></div>'
      + '<input type="file" id="bpx-pj-bp" accept="application/pdf,image/*" style="display:none" onchange="bpPF.bpAdd(event)">';
  };

  function analysisHtml(a) {
    if (!a) return '';
    var meas = (a.measurements || []).map(function (m) {
      return '<div class="pf-m"><span>' + esc(m.label) + '</span><b>' + esc(m.value) + '</b><em class="' + (m.source === 'printed' ? 'p' : 'e') + '">' + (m.source === 'printed' ? 'on the drawing' : 'estimated') + '</em></div>';
    }).join('');
    var take = (a.takeoff || []).map(function (t) {
      return '<tr><td><b>' + esc(t.item) + '</b>' + (t.basis ? '<div class="bpx-mut" style="font-size:11.5px">' + esc(t.basis) + '</div>' : '') + '</td><td style="white-space:nowrap;text-align:right">' + esc(String(t.qty)) + ' ' + esc(t.unit) + '</td></tr>';
    }).join('');
    return '<div class="pf-ai">'
      + '<div class="pf-ai-h"><span class="bpx-badge">' + esc(a.sheet_type || 'drawing') + '</span>' + (a.scale ? '<span class="bpx-mut">scale ' + esc(a.scale) + '</span>' : '')
      + '<span class="bpx-mut">' + Math.round((a.confidence || 0) * 100) + '% legible</span></div>'
      + '<p>' + esc(a.summary || '') + '</p>'
      + (meas ? '<div class="pf-sec">Measurements</div><div class="pf-ms">' + meas + '</div>' : '')
      + (take ? '<div class="pf-sec">Takeoff</div><table class="bpx-ctable pf-tk"><tbody>' + take + '</tbody></table>'
        + '<button class="bpx-rowbtn" style="margin-top:8px" onclick="bpPF.bpToList(' + '\'' + '%I%' + '\'' + ')">Put the takeoff on a materials list</button>' : '')
      + ((a.flags || []).length ? '<div class="pf-sec">Check before you quote</div><ul class="pf-flags">' + a.flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '')
      + '<div class="bpx-mut" style="font-size:11.5px;margin-top:8px">Read by AI from the drawing. Check the figures marked estimated against the plans before ordering.</div>'
      + '</div>';
  }

  PF.bpRender = function (j) {
    var el = document.getElementById('bpx-pj-bps'); if (!el) return;
    var list = j.blueprints || [];
    el.innerHTML = list.map(function (b, i) {
      var isImg = /^image\//.test(b.t || '');
      return '<div class="pf-bp">'
        + '<div class="pf-bp-r"><div class="pf-bp-th">' + (isImg ? PF.img(b.d, 'alt=""') : '<span class="ms">description</span>') + '</div>'
        + '<div class="pf-bp-n"><b>' + esc(b.n || 'Blueprint') + '</b><small>' + (b.a ? 'Analyzed ' + new Date(b.a.analyzed_at).toLocaleDateString() : (b.busy ? 'Reading the drawing…' : 'Not analyzed yet')) + '</small></div>'
        + '<button class="bpx-rowbtn" onclick="bpPF.bpOpen(' + i + ')">View</button>'
        + '<button class="bpx-rowbtn primary" ' + (b.busy ? 'disabled' : '') + ' onclick="bpPF.bpAnalyze(' + i + ')">' + (b.a ? 'Re-analyze' : 'Analyze') + '</button>'
        + '<button class="bpx-exprm" onclick="bpPF.bpDel(' + i + ')" aria-label="Remove">×</button></div>'
        + (b.err ? '<div class="pf-err">' + esc(b.err) + '</div>' : '')
        + analysisHtml(b.a).replace('%I%', String(i))
        + '</div>';
    }).join('') || '<div class="bpx-mut" style="font-size:12.5px">No blueprints yet.</div>';
    var tab = document.querySelector('[data-pj-tab="blueprints"]'); if (tab) tab.textContent = 'Blueprints · ' + list.length;
  };

  PF.bpAdd = function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    var j = job(); if (!j) return;
    j.blueprints = j.blueprints || [];
    if (j.blueprints.length >= PF.MAX.blueprints) { alert('Up to ' + PF.MAX.blueprints + ' blueprints per project.'); return; }
    if (f.size > 25 * 1024 * 1024) { alert('That file is over 25 MB. Send the sheets you need as a smaller PDF.'); return; }
    var r = new FileReader();
    r.onload = function () {
      var entry = { n: f.name, t: f.type || 'application/pdf', d: r.result };
      j.blueprints.push(entry); PF.bpRender(j);
      PF.adopt(j, 'blueprints', entry.d, f.name, function () { return entry.d; }, function (_, ref) { entry.d = ref; });
    };
    r.readAsDataURL(f);
  };
  PF.bpOpen = function (i) { var j = job(), b = j && (j.blueprints || [])[i]; if (b) PF.open(b.d, b.t); };
  PF.bpDel = function (i) {
    var j = job(), b = j && (j.blueprints || [])[i]; if (!b) return;
    if (!confirm('Remove "' + (b.n || 'this blueprint') + '" from the project?')) return;
    PF.remove(b.d); j.blueprints.splice(i, 1); PF.bpRender(j);
    try { bpJobsSet(bpJobsGet()); } catch (e) {}
  };
  PF.bpAnalyze = function (i) {
    var j = job(), b = j && (j.blueprints || [])[i]; if (!b) return;
    if (!live()) { b.err = 'Sign in to analyze blueprints.'; PF.bpRender(j); return; }
    b.busy = true; b.err = ''; PF.bpRender(j);
    PF.url(b.d).then(function (u) { return fetch(u); }).then(function (r) { return r.blob(); }).then(function (blob) {
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1]); }; fr.readAsDataURL(blob); })
        .then(function (b64) { return { b64: b64, mime: blob.type || b.t }; });
    }).then(function (x) {
      return window.bpAuthApi(window.BP_URL + '/functions/v1/blueprint-ai', { op: 'analyze', mime: x.mime, data: x.b64, trade: trade() });
    }).then(function (r) {
      b.busy = false;
      if (r && r.ok) { b.a = r.analysis; try { bpJobsSet(bpJobsGet()); } catch (e) {} }
      else b.err = (r && (r.reason || r.error)) || 'The analysis did not come back. Try again.';
      PF.bpRender(j);
    }).catch(function () { b.busy = false; b.err = 'Could not reach the analyzer. Check the connection and try again.'; PF.bpRender(j); });
  };
  /* the takeoff onto a materials list, through the same path the picker uses */
  PF.bpToList = function (i) {
    var j = job(), b = j && (j.blueprints || [])[i]; if (!b || !b.a) return;
    var lines = (b.a.takeoff || []).map(function (t) { return (t.qty || 1) + ' ' + (t.unit || '') + ' ' + t.item; }).join('\n');
    if (window.SP && SP.pasteList) { window.bpCloseModal && bpCloseModal(); bpNav('supply'); setTimeout(function () { SP.pasteList(lines, j.id); }, 120); return; }
    try { navigator.clipboard.writeText(lines); alert('Takeoff copied. Paste it into Order materials to price it.'); } catch (e) { prompt('Copy the takeoff:', lines); }
  };
})();
