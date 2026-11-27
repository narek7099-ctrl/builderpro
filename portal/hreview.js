/* ==================================================================
   Homeowner reviews (2026-11-27).

   The homeowner's side, on their project page (#home=<token>, app.html
   bpHpRender): once the job is marked done the Overview asks "How did
   <business> do?". The review sheet takes overall stars, five detail
   ratings (quality, communication, on schedule, clean job site, fair
   price), "Would you hire them again?", their words, up to 6 of the job's
   shared photos, and whether to show it on the contractor's Find a Pro
   listing (first name and last initial only). Posting again edits it.
   It goes through the customer-portal function (op "review"), which is
   the only thing allowed to write a homeowner's review
   (supabase/migrations/20261127_homeowner_reviews.sql).

   Also here: what the Find a Pro listing shows on top of the stars (the
   detail averages, "would hire again", review photos and the contractor's
   reply), used by bpPrDetail in app.html.
   ================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var escA = function (s) { return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var $ = function (id) { return document.getElementById(id); };
  var CATS = [['quality', 'Quality of work'], ['communication', 'Communication'], ['schedule', 'On schedule'], ['cleanup', 'Clean job site'], ['value', 'Fair price']];
  var WORD = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3-4.57-4.46 6.32-.92z"/></svg>';
  var R = { rating: 0, cats: {}, hire: null, text: '', photos: [], share: true, busy: false };

  function biz() { var d = window._bpHp && _bpHp.d; return ((d && d.business && d.business.name) || 'your contractor').replace(/\.+$/, ''); }
  function day(at) { try { return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  /* a row of five stars; tappable when fn is given */
  function stars(n, k, fn, cls) {
    var h = '';
    for (var i = 1; i <= 5; i++) {
      h += fn ? '<button type="button" class="hrv-s' + (i <= n ? ' on' : '') + '" onclick="' + fn + '(\'' + k + '\',' + i + ')" aria-label="' + i + ' star' + (i > 1 ? 's' : '') + '">' + STAR + '</button>'
        : '<i class="hrv-s' + (i <= Math.round(n) ? ' on' : '') + '">' + STAR + '</i>';
    }
    return '<span class="hrv-stars' + (cls ? ' ' + cls : '') + '" data-k="' + k + '"' + (fn ? ' role="radiogroup"' : ' role="img" aria-label="' + n + ' out of 5"') + '>' + h + '</span>';
  }

  /* ---------------------------------------------- the Overview card --- */
  window.bpHpRevCard = function (d) {
    if (!d || !d.reviewable) return '';
    var r = d.review, b = esc(biz());
    if (!r) {
      return '<section class="hx-card hrv-ask"><div class="hx-h"><small>How did ' + b + ' do?</small></div>'
        + '<p class="hrv-p">Your job is finished. A short review helps other homeowners choose, and it helps ' + b + ' too.</p>'
        + stars(0, 'ask', 'bpHpRevOpen', 'lg') + '</section>';
    }
    var chips = (r.hire === true ? '<span class="hrv-chip ok"><span class=ms>thumb_up</span>Would hire again</span>' : r.hire === false ? '<span class="hrv-chip"><span class=ms>thumb_down</span>Wouldn’t hire again</span>' : '');
    return '<section class="hx-card hrv-mine"><div class="hx-h"><small>Your review</small><button type="button" class="hx-link" onclick="bpHpRevOpen()">Edit</button></div>'
      + '<div class="hrv-line">' + stars(r.rating, 'mine', '', 'md') + '<span>' + esc(day(r.at)) + (r.edited ? ' · edited' : '') + '</span></div>'
      + (r.text ? '<p class="hrv-text">' + esc(r.text) + '</p>' : '')
      + (chips ? '<div class="hrv-chips">' + chips + '</div>' : '')
      + ((r.photos || []).length ? '<div class="hrv-thumbs">' + r.photos.map(function (u) { return '<img src="' + escA(u) + '" alt="" loading="lazy">'; }).join('') + '</div>' : '')
      + (r.reply ? '<div class="hrv-reply"><b>Reply from ' + b + '</b><p>' + esc(r.reply) + '</p></div>' : '')
      + (r.share ? '' : '<p class="hrv-fine"><span class=ms>lock</span>Only ' + b + ' can see this review.</p>')
      + '</section>';
  };

  /* --------------------------------------------------- the sheet --- */
  window.bpHpRevOpen = function (k, n) {
    var d = window._bpHp && _bpHp.d; if (!d) return;
    var r = d.review;
    var shared = d.photos || [], base = function (u) { return String(u || '').split('?')[0]; };
    R = { rating: r ? r.rating : 0, cats: Object.assign({}, (r && r.cats) || {}), hire: r ? r.hire : null, text: r ? r.text : '', photos: [], share: r ? r.share : true, busy: false };
    /* their picked photos, found again in the shared list (same file, a fresh signed link) */
    if (r && (r.photos || []).length) { var mine = r.photos.map(base); R.photos = shared.filter(function (p) { return mine.indexOf(base(p.url)) >= 0; }).map(function (p) { return p.k; }); }
    if (k === 'ask' && n) R.rating = n;
    draw();
  };
  window.bpHpRevClose = function () { var el = $('hrv'); if (el) el.remove(); document.documentElement.classList.remove('hrv-lock'); };
  window.bpHpRevStar = function (k, n) {
    if (k === 'overall') R.rating = n; else R.cats[k] = R.cats[k] === n ? 0 : n;
    paint();
  };
  window.bpHpRevHire = function (v) { R.hire = R.hire === v ? null : v; paint(); };
  window.bpHpRevPhoto = function (k) { var i = R.photos.indexOf(k); if (i >= 0) R.photos.splice(i, 1); else if (R.photos.length < 6) R.photos.push(k); paint(); };

  function draw() {
    var d = _bpHp.d, b = esc(biz()), ph = d.photos || [], first = String((d.job && d.job.customer) || '').trim();
    var old = $('hrv'); if (old) old.remove();
    var el = document.createElement('div'); el.id = 'hrv'; el.className = 'hrv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Review ' + biz());
    el.innerHTML = '<div class="hrv-bg" onclick="bpHpRevClose()"></div><div class="hrv-card"><i class="hrv-grab"></i>'
      + '<div class="hrv-h"><b>' + (d.review ? 'Edit your review' : 'Review ' + b) + '</b><button type="button" class="hrv-x" onclick="bpHpRevClose()" aria-label="Close">×</button></div>'
      + '<div class="hrv-body">'
        + '<div class="hrv-sec hrv-top"><span class="hrv-lbl">Overall</span><div id="hrvOverall"></div><span class="hrv-word" id="hrvWord"></span></div>'
        + '<div class="hrv-sec"><span class="hrv-lbl">The details <small>optional</small></span><div class="hrv-rows" id="hrvCats"></div></div>'
        + '<div class="hrv-sec"><span class="hrv-lbl">Would you hire ' + b + ' again?</span><div class="hrv-yn" id="hrvYn"></div></div>'
        + '<div class="hrv-sec"><label class="hrv-lbl" for="hrvText">Tell other homeowners about it</label>'
          + '<textarea id="hrvText" rows="5" maxlength="2000" placeholder="What did they do for you? How was the work, the crew, the timing and the price?">' + esc(R.text) + '</textarea>'
          + '<small class="hrv-count" id="hrvCount"></small></div>'
        + (ph.length ? '<div class="hrv-sec"><span class="hrv-lbl">Add photos of the work <small>up to 6</small></span><div class="hrv-ph" id="hrvPh"></div></div>' : '')
        + '<label class="hrv-share"><input type="checkbox" id="hrvShare"' + (R.share ? ' checked' : '') + '><span><b>Show it on ' + b + '’s BuilderPro profile</b>'
          + '<small>Shown as ' + esc(first || 'your first name') + ' and your last initial. Your address and contact details are never shown.</small></span></label>'
      + '</div>'
      + '<div class="hrv-foot"><p class="hrv-err" id="hrvErr" role="alert"></p><button type="button" class="hx-btn pri" id="hrvGo" onclick="bpHpRevSend()">' + (d.review ? 'Save changes' : 'Post review') + '</button></div>'
      + '</div>';
    document.body.appendChild(el);
    document.documentElement.classList.add('hrv-lock');
    var t = $('hrvText'); if (t) t.addEventListener('input', function () { R.text = t.value; count(); });
    var s = $('hrvShare'); if (s) s.addEventListener('change', function () { R.share = s.checked; });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') bpHpRevClose(); });
    paint(); count();
  }
  function count() { var c = $('hrvCount'); if (c) { var n = (R.text || '').trim().length; c.textContent = n < 40 ? (n ? (40 - n) + ' more characters makes it more helpful' : '') : n + ' / 2000'; } }
  function paint() {
    var o = $('hrvOverall'); if (o) o.innerHTML = stars(R.rating, 'overall', 'bpHpRevStar', 'xl');
    var w = $('hrvWord'); if (w) w.textContent = WORD[R.rating] || 'Tap a star';
    var c = $('hrvCats'); if (c) c.innerHTML = CATS.map(function (x) { return '<div class="hrv-row"><span>' + x[1] + '</span>' + stars(R.cats[x[0]] || 0, x[0], 'bpHpRevStar', 'sm') + '</div>'; }).join('');
    var y = $('hrvYn'); if (y) y.innerHTML = '<button type="button" class="' + (R.hire === true ? 'on' : '') + '" onclick="bpHpRevHire(true)"><span class=ms>thumb_up</span>Yes</button>'
      + '<button type="button" class="' + (R.hire === false ? 'on no' : '') + '" onclick="bpHpRevHire(false)"><span class=ms>thumb_down</span>No</button>';
    var p = $('hrvPh'); if (p) p.innerHTML = (_bpHp.d.photos || []).map(function (x) {
      var on = R.photos.indexOf(x.k) >= 0;
      return '<button type="button" class="' + (on ? 'on' : '') + '" onclick="bpHpRevPhoto(' + x.k + ')" aria-pressed="' + on + '"><img src="' + escA(x.url) + '" alt="" loading="lazy"><i class="ms">' + (on ? 'check_circle' : 'add_circle') + '</i></button>';
    }).join('');
    var g = $('hrvGo'); if (g) g.disabled = !R.rating || R.busy;
  }
  window.bpHpRevSend = function () {
    if (!R.rating || R.busy) return;
    var e = $('hrvErr'), g = $('hrvGo'), wasNew = !(_bpHp.d && _bpHp.d.review);
    R.busy = true; if (e) e.textContent = ''; if (g) { g.disabled = true; g.textContent = 'Posting…'; }
    var cats = {}; CATS.forEach(function (x) { if (R.cats[x[0]]) cats[x[0]] = R.cats[x[0]]; });
    bpHpApi('review', { rating: R.rating, cats: cats, hire: R.hire, text: (R.text || '').trim(), photos: R.photos, share: R.share }).then(function (d) {
      R.busy = false;
      if (!d || !d.ok) { if (e) e.textContent = (d && d.error) || 'Couldn’t post your review. Try again.'; if (g) { g.textContent = wasNew ? 'Post review' : 'Save changes'; } paint(); return; }
      _bpHp.d = d; bpHpRevClose(); bpHpRender(); thanks(d, wasNew);
    }).catch(function () { R.busy = false; if (e) e.textContent = 'Couldn’t reach the server. Check your connection and try again.'; if (g) g.textContent = wasNew ? 'Post review' : 'Save changes'; paint(); });
  };
  /* after posting: thank them, and point a happy customer at Google too */
  function thanks(d, wasNew) {
    var r = d.review || {}, b = esc(biz()), g = r.rating >= 4 && d.reviewUrl;
    var el = document.createElement('div'); el.id = 'hrv'; el.className = 'hrv done'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="hrv-bg" onclick="bpHpRevClose()"></div><div class="hrv-card"><div class="hrv-done">'
      + '<span class="hrv-done-ic"><span class=ms>volunteer_activism</span></span>'
      + '<b>' + (wasNew ? 'Thank you for your review!' : 'Your review is updated') + '</b>'
      + '<p>' + (r.share ? 'It’s on ' + b + '’s profile now, where other homeowners can read it.' : 'Only ' + b + ' can see it.') + '</p>'
      + (g ? '<p class="hrv-g">Would you post it on Google too? It helps ' + b + ' a lot. We’ll copy your words so you can paste them.</p>'
        + '<button type="button" class="hx-btn pri" onclick="bpHpRevGoogle()"><span class=ms>open_in_new</span>Post on Google</button>' : '')
      + '<button type="button" class="hx-btn" onclick="bpHpRevClose()">Done</button></div></div>';
    document.body.appendChild(el);
  }
  window.bpHpRevGoogle = function () {
    var d = _bpHp.d || {}, t = (d.review && d.review.text) || '';
    try { if (t && navigator.clipboard) navigator.clipboard.writeText(t); } catch (e) {}
    if (d.reviewUrl) window.open(d.reviewUrl, '_blank', 'noopener');
    bpHpRevClose();
  };

  /* ----------------------------------------- the Find a Pro listing --- */
  /* detail averages and "would hire again", under the big score */
  window.bpPrRevDetail = function (bp) {
    if (!bp) return '';
    var c = bp.cats || {}, rows = CATS.filter(function (x) { return +c[x[0]] > 0; });
    var out = '';
    if (bp.hire != null) out += '<div class="prv-hire"><span class=ms>thumb_up</span><b>' + Math.round(bp.hire) + '%</b> would hire them again</div>';
    if (rows.length) out += '<div class="prv-cats">' + rows.map(function (x) {
      var v = +c[x[0]];
      return '<div class="prv-cat"><span>' + x[1] + '</span><i><b style="width:' + Math.max(0, Math.min(100, v / 5 * 100)).toFixed(0) + '%"></b></i><em>' + v.toFixed(1) + '</em></div>';
    }).join('') + '</div>';
    return out ? '<div class="prv-detail">' + out + '</div>' : '';
  };
  /* under one review: would hire, photos, the contractor's reply */
  window.bpPrRevExtra = function (r, bizName) {
    if (!r) return '';
    var out = '';
    if (r.hire === true) out += '<span class="prv-chip"><span class=ms>thumb_up</span>Would hire again</span>';
    if ((r.photos || []).length) out += '<div class="prv-ph">' + r.photos.slice(0, 6).map(function (u) { return '<img src="' + escA(u) + '" alt="Photo of the work" loading="lazy">'; }).join('') + '</div>';
    if (r.reply) out += '<div class="prv-reply"><b>Response from ' + esc(bizName || 'the business') + '</b><p>' + esc(r.reply) + '</p></div>';
    return out;
  };
})();
