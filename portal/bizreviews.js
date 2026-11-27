/* ==================================================================
   Leads → Reviews (2026-11-27): what homeowners said about the business.

   Reads public.review_requests (finished reviews only, used_at set): the
   ones written on the project page (customer-portal, op "review") and the
   ones from the older rate link (worker-review). The owner and office can
   answer each one in public (reply) and report one to BuilderPro
   (flagged_at + flag_reason). They can't change or hide what the homeowner
   wrote: review_requests_guard in
   supabase/migrations/20261127_homeowner_reviews.sql refuses it.

   The page: the average, how many would hire again, the five detail
   averages, then every review with its photos, a reply box and Report.
   Filters: All, Needs a reply, 3 stars or less.
   ================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var escA = function (s) { return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var live = function () { return !!(window.BP_LIVE && window.BP_SB); };
  var toast = function (t, k) { if (window.bpToast) bpToast(t, k); };
  var CATS = [['quality', 'Quality of work'], ['communication', 'Communication'], ['schedule', 'On schedule'], ['cleanup', 'Clean job site'], ['value', 'Fair price']];
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3-4.57-4.46 6.32-.92z"/></svg>';
  var REASONS = ['Not a real customer of mine', 'Wrong business', 'Offensive or personal', 'Something else'];
  var V = { list: [], filter: 'all', open: '', flag: '', urls: {}, loaded: false };

  function area() { return $('bpxViewArea'); }
  function stars(n) { var h = ''; for (var i = 1; i <= 5; i++) h += '<i class="brv-s' + (i <= Math.round(n) ? ' on' : '') + '">' + STAR + '</i>'; return '<span class="brv-stars" role="img" aria-label="' + n + ' out of 5">' + h + '</span>'; }
  function day(at) { try { return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  function byTok(t) { return V.list.filter(function (r) { return r.token === t; })[0]; }

  window.bpReviewsPage = function () {
    var a = area(); if (!a) return;
    a.innerHTML = '<div class="brv"><div class="bpx-panel brv-skel"><i></i><i></i><i></i></div></div>';
    if (window.bpSpin) bpSpin(false);
    if (!live()) { V.list = []; V.loaded = true; draw(); return; }
    Promise.resolve(BP_SB.from('review_requests')
      .select('token,job_id,job_title,customer_name,overall,overall_comment,cats,would_hire,photos,share,used_at,edited_at,reply,reply_at,flagged_at,flag_reason,source,sample')
      .not('used_at', 'is', null).not('overall', 'is', null).order('used_at', { ascending: false }).limit(300))
      .then(function (r) { V.list = (r && r.data) || []; V.loaded = true; draw(); photos(); })
      .catch(function () { V.list = []; V.loaded = true; draw(); });
  };

  /* the photos are the job's own files: a short-lived link each */
  function photos() {
    if (!window.bpPF) return;
    V.list.forEach(function (r) {
      (r.photos || []).forEach(function (ref) {
        if (V.urls[ref]) return;
        bpPF.url(ref).then(function (u) {
          if (!u) return; V.urls[ref] = u;
          document.querySelectorAll('img[data-ref="' + CSS.escape(ref) + '"]').forEach(function (im) { im.src = u; im.closest('.brv-ph') && im.closest('.brv-ph').classList.remove('wait'); });
        });
      });
    });
  }

  function summary() {
    var L = V.list, n = L.length;
    var avg = n ? L.reduce(function (t, r) { return t + (+r.overall || 0); }, 0) / n : 0;
    var hireN = L.filter(function (r) { return r.would_hire !== null && r.would_hire !== undefined; }), hire = hireN.length ? Math.round(hireN.filter(function (r) { return r.would_hire; }).length / hireN.length * 100) : null;
    var cats = CATS.map(function (c) {
      var v = L.map(function (r) { return +((r.cats || {})[c[0]]) || 0; }).filter(function (x) { return x >= 1 && x <= 5; });
      return v.length ? [c[1], v.reduce(function (t, x) { return t + x; }, 0) / v.length] : null;
    }).filter(Boolean);
    var spread = [5, 4, 3, 2, 1].map(function (s) { var k = L.filter(function (r) { return +r.overall === s; }).length; return '<div class="brv-sp"><span>' + s + '</span><i><b style="width:' + (n ? Math.round(k / n * 100) : 0) + '%"></b></i><em>' + k + '</em></div>'; }).join('');
    return '<div class="bpx-panel brv-sum">'
      + '<div class="brv-big"><b>' + (n ? avg.toFixed(1) : '–') + '</b>' + stars(avg) + '<span>' + n + ' review' + (n === 1 ? '' : 's') + '</span></div>'
      + '<div class="brv-spread">' + spread + '</div>'
      + '<div class="brv-side">' + (hire !== null ? '<div class="brv-hire"><span class="ms">thumb_up</span><div><b>' + hire + '%</b><span>would hire you again</span></div></div>' : '')
        + (cats.length ? '<div class="brv-cats">' + cats.map(function (c) { return '<div class="brv-cat"><span>' + c[0] + '</span><i><b style="width:' + (c[1] / 5 * 100).toFixed(0) + '%"></b></i><em>' + c[1].toFixed(1) + '</em></div>'; }).join('') + '</div>' : '')
      + '</div></div>';
  }

  function card(r) {
    var who = String(r.customer_name || 'Homeowner').trim(), open = V.open === r.token, flag = V.flag === r.token;
    var cats = CATS.filter(function (c) { return +((r.cats || {})[c[0]]) > 0; }).map(function (c) { return '<span class="brv-mini">' + c[1] + ' <b>' + r.cats[c[0]] + '</b></span>'; }).join('');
    var reply = r.reply && !open
      ? '<div class="brv-reply"><div class="brv-reply-h"><b>Your reply</b><span>' + esc(day(r.reply_at)) + '</span></div><p>' + esc(r.reply) + '</p>'
        + '<div class="brv-acts"><button type="button" class="bpx-rowbtn" onclick="bpRevReply(\'' + r.token + '\')">Edit</button><button type="button" class="bpx-rowbtn" onclick="bpRevReplyDel(\'' + r.token + '\')">Delete</button></div></div>'
      : open ? '<div class="brv-form"><label for="brvTxt">Your public reply</label><textarea id="brvTxt" rows="4" maxlength="1500" placeholder="Thank ' + escA(who.split(/\s+/)[0]) + ', or explain what happened. Other homeowners will read this.">' + esc(r.reply || '') + '</textarea>'
        + '<div class="brv-acts"><button type="button" class="bpx-btn ghost" onclick="bpRevReplyCancel()">Cancel</button><button type="button" class="bpx-btn" id="brvSave" onclick="bpRevReplySave(\'' + r.token + '\')">Post reply</button></div></div>'
      : '';
    var flagged = r.flagged_at ? '<div class="brv-flagged"><span class="ms">flag</span><div><b>Reported to BuilderPro</b><span>' + esc(r.flag_reason || '') + '. We’ll look at it. It stays up while we check.</span></div><button type="button" class="bpx-rowbtn" onclick="bpRevUnflag(\'' + r.token + '\')">Undo</button></div>' : '';
    var flagForm = flag ? '<div class="brv-form"><label>Why are you reporting this review?</label><div class="brv-reasons">' + REASONS.map(function (x, i) { return '<label><input type="radio" name="brvWhy" value="' + escA(x) + '"' + (i === 0 ? ' checked' : '') + '>' + esc(x) + '</label>'; }).join('') + '</div>'
      + '<div class="brv-acts"><button type="button" class="bpx-btn ghost" onclick="bpRevFlagCancel()">Cancel</button><button type="button" class="bpx-btn" onclick="bpRevFlagSend(\'' + r.token + '\')">Report</button></div></div>' : '';
    return '<div class="bpx-panel brv-card' + (+r.overall <= 3 ? ' low' : '') + '" id="brv-' + r.token + '">'
      + '<div class="brv-h"><div class="brv-who"><span class="brv-av">' + esc((who[0] || '?').toUpperCase()) + '</span><div><b>' + esc(who) + '</b><span>' + esc([r.job_title, day(r.used_at) + (r.edited_at ? ' · edited' : '')].filter(Boolean).join(' · ')) + '</span></div></div>'
        + stars(+r.overall) + '</div>'
      + (r.overall_comment ? '<p class="brv-text">' + esc(r.overall_comment) + '</p>' : '<p class="brv-text none">No written review, just the stars.</p>')
      + (cats || r.would_hire !== null && r.would_hire !== undefined ? '<div class="brv-chips">' + (r.would_hire === true ? '<span class="brv-mini ok"><span class="ms">thumb_up</span>Would hire again</span>' : r.would_hire === false ? '<span class="brv-mini"><span class="ms">thumb_down</span>Wouldn’t hire again</span>' : '') + cats + '</div>' : '')
      + ((r.photos || []).length ? '<div class="brv-phs">' + r.photos.map(function (ref) { var u = V.urls[ref]; return '<span class="brv-ph' + (u ? '' : ' wait') + '"><img data-ref="' + escA(ref) + '"' + (u ? ' src="' + escA(u) + '"' : '') + ' alt="Photo of the work" loading="lazy"></span>'; }).join('') + '</div>' : '')
      + '<div class="brv-meta">' + (r.sample ? '<span class="brv-tag smp">Sample review</span>' : '<span class="brv-tag ok"><span class="ms">verified</span>Verified job</span>')
        + (r.share ? '<span class="brv-tag">On your Find a Pro listing</span>' : '<span class="brv-tag">Private to you</span>') + '</div>'
      + flagged + reply + flagForm
      + (!open && !flag ? '<div class="brv-acts brv-foot">' + (r.reply ? '' : '<button type="button" class="bpx-btn" onclick="bpRevReply(\'' + r.token + '\')"><span class="ms">reply</span>Reply</button>')
        + (r.flagged_at ? '' : '<button type="button" class="bpx-rowbtn brv-report" onclick="bpRevFlag(\'' + r.token + '\')">Report</button>') + '</div>' : '')
      + '</div>';
  }

  function draw() {
    var a = area(); if (!a) return;
    var L = V.list;
    if (!L.length) {
      a.innerHTML = '<div class="brv"><div class="bpx-panel brv-empty"><span class="ms">reviews</span><b>No reviews yet</b>'
        + '<p>When you mark a job done, your customer can review you right on their project page. Good reviews show on your Find a Pro listing and help you win jobs.</p></div></div>';
      return;
    }
    var need = L.filter(function (r) { return !r.reply; }).length, low = L.filter(function (r) { return +r.overall <= 3; }).length;
    var shown = V.filter === 'reply' ? L.filter(function (r) { return !r.reply; }) : V.filter === 'low' ? L.filter(function (r) { return +r.overall <= 3; }) : L;
    var chip = function (k, t, n) { return '<button type="button" class="brv-f' + (V.filter === k ? ' on' : '') + '" onclick="bpRevFilter(\'' + k + '\')">' + t + (n != null ? ' <em>' + n + '</em>' : '') + '</button>'; };
    a.innerHTML = '<div class="brv">' + summary()
      + '<div class="brv-filters">' + chip('all', 'All', L.length) + chip('reply', 'Needs a reply', need) + chip('low', '3 stars or less', low) + '</div>'
      + (shown.length ? shown.map(card).join('') : '<div class="bpx-panel brv-empty sm"><b>' + (V.filter === 'reply' ? 'You’ve replied to every review.' : 'No reviews of 3 stars or less.') + '</b></div>')
      + '<p class="brv-fine"><span class="ms">lock</span>Reviews come from your real customers and can’t be edited or hidden. You can reply to any of them, and report one to BuilderPro if it isn’t genuine.</p>'
      + '</div>';
  }

  window.bpRevFilter = function (k) { V.filter = k; V.open = ''; V.flag = ''; draw(); };
  window.bpRevReply = function (t) { V.open = t; V.flag = ''; draw(); var x = $('brvTxt'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } };
  window.bpRevReplyCancel = function () { V.open = ''; draw(); };
  function save(t, patch, ok) {
    var r = byTok(t); if (!r) return Promise.resolve();
    if (!live()) { Object.assign(r, patch); draw(); return Promise.resolve(); }
    return Promise.resolve(BP_SB.from('review_requests').update(patch).eq('token', t).select('reply,reply_at,flagged_at,flag_reason').single())
      .then(function (res) {
        if (res && res.error) throw res.error;
        Object.assign(r, (res && res.data) || patch); V.open = ''; V.flag = ''; draw(); photos(); if (ok) toast(ok, 'success');
      }).catch(function (e) { toast('Couldn’t save: ' + ((e && e.message) || 'try again'), 'warning'); var b = $('brvSave'); if (b) b.disabled = false; });
  }
  window.bpRevReplySave = function (t) {
    var x = $('brvTxt'), txt = x ? x.value.trim() : '';
    if (!txt) { toast('Write your reply first.', 'warning'); return; }
    var b = $('brvSave'); if (b) b.disabled = true;
    save(t, { reply: txt }, 'Reply posted. The homeowner will see it.');
  };
  window.bpRevReplyDel = function (t) { if (confirm('Delete your reply? The review stays up.')) save(t, { reply: null }, 'Reply deleted.'); };
  window.bpRevFlag = function (t) { V.flag = t; V.open = ''; draw(); };
  window.bpRevFlagCancel = function () { V.flag = ''; draw(); };
  window.bpRevFlagSend = function (t) {
    var w = document.querySelector('input[name="brvWhy"]:checked');
    save(t, { flagged_at: new Date().toISOString(), flag_reason: w ? w.value : 'Something else' }, 'Reported. BuilderPro will take a look.');
  };
  window.bpRevUnflag = function (t) { save(t, { flagged_at: null, flag_reason: null }, 'Report withdrawn.'); };
})();
