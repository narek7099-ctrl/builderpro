/* The calculator's result screen, made more useful. Loaded by every trade
   calculator (tools/build-embeds.py copies this file to embed/ and adds a
   <script data-trade="..."> tag to each page).

   1. Good / Better / Best: the same job priced three ways, side by side. Each
      price comes from the calculator's own eCalcPrice() with ONE choice
      swapped (the material, the efficiency or the finish level), so all three
      use the homeowner's measurements and the contractor's own prices. The
      homeowner's choice is marked. Plumbing and electrical have no such ladder
      (their "material" is the job itself), so they skip this part.
   2. A monthly payment, only when the contractor turned financing on in
      Customize and entered their lender's APR and term. The payment is always
      shown with the APR, term and down payment next to it, because quoting a
      payment amount in an ad legally requires those terms.
   3. The "Book a Free Inspection" button is gone (there is no booking page):
      the request was already sent when they pressed Generate, so the screen
      says that instead.

   Nothing here changes what was already sent to the contractor. */
(function () {
  var me = document.currentScript;
  var TRADE = (me && me.getAttribute('data-trade')) || '';

  /* the choice to swap per trade, cheapest first; names fall back to the
     calculator's own label for that choice */
  var LADDERS = {
    roofing: { key: 'material', vals: ['asphalt-3tab', 'asphalt-arch', 'metal-standing', 'tile-clay', 'slate-natural'] },
    countertops: { key: 'material', vals: ['laminate', 'butcher', 'solid-surface', 'granite', 'quartz', 'marble', 'porcelain', 'quartzite'] },
    pools: { key: 'material', vals: ['vinyl', 'fiberglass', 'gunite'] },
    concrete: { key: 'material', vals: ['broom', 'exposed', 'stamped', 'pavers'] },
    hvac: { key: 'efficiency', vals: ['standard', 'mid', 'high', 'premium'],
      names: { standard: 'Standard efficiency', mid: 'Mid efficiency', high: 'High efficiency', premium: 'Variable-speed' },
      notes: { standard: '~14–15 SEER2', mid: '~16–17 SEER2', high: '~18–20 SEER2 · often rebate-eligible', premium: '20+ SEER2 · quietest' } },
    flooring: { key: 'quality', vals: ['economy', 'standard', 'premium', 'luxury'],
      names: { economy: 'Economy grade', standard: 'Standard grade', premium: 'Premium grade', luxury: 'Luxury grade' } },
    trim: { key: 'quality', vals: ['economy', 'standard', 'premium', 'luxury'],
      names: { economy: 'Paint-grade MDF / pine', standard: 'Stain-grade pine', premium: 'Hardwood (oak / maple)', luxury: 'Custom profile' } },
    landscaping: { key: 'quality', vals: ['economy', 'standard', 'premium', 'luxury'],
      names: { economy: 'Basic', standard: 'Standard', premium: 'Premium', luxury: 'Estate' } },
    general: { key: 'quality', vals: ['builder', 'standard', 'premium', 'luxury'],
      names: { builder: 'Builder-grade finishes', standard: 'Standard finishes', premium: 'Premium finishes', luxury: 'Custom finishes' } },
    painting: { key: 'project', vals: ['refresh', 'renovation', 'cleanup'],
      names: { refresh: '1 coat refresh', renovation: '2 coats', cleanup: 'Primer + 2 coats' } }
  };

  /* the calculator declares its settings with const, so they're reached by name, not on window */
  var CFG = function () { try { return E_CONFIG; } catch (e) { return {}; } };
  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* the contractor's financing, saved with their calculator prices (Customize) */
  function financing() {
    var f = (window.__bpPricing && window.__bpPricing.financing) || null;
    if (!f || f.on !== true) return null;
    var apr = Number(f.apr), months = Math.round(Number(f.months));
    if (!(apr >= 0 && apr <= 36) || !(months >= 6 && months <= 240)) return null;
    return { apr: apr, months: months, lender: String(f.lender || '').slice(0, 60) };
  }
  function monthly(amount, f) {
    var r = f.apr / 1200;
    return r ? amount * r / (1 - Math.pow(1 + r, -f.months)) : amount / f.months;
  }

  function priceWith(key, val) {
    var S = window.eS, old = S[key];
    S[key] = val;
    try { var p = window.eCalcPrice(); return p && p.high > 0 ? p : null; } catch (e) { return null; } finally { S[key] = old; }
  }
  function labelOf(L, v) {
    if (L.names && L.names[v]) return L.names[v];
    var C = CFG() || {}, p = C.pricing && C.pricing[v];
    return (p && p.label) || v;
  }
  function noteOf(L, v) {
    if (L.notes && L.notes[v]) return L.notes[v];
    var C = CFG() || {}, p = C.pricing && C.pricing[v];
    return (p && p.note) || '';
  }

  function tiers() {
    var L = LADDERS[TRADE], S = window.eS;
    if (!L || !S || typeof window.eCalcPrice !== 'function') return null;
    var cur = S[L.key], i = L.vals.indexOf(cur);
    if (i < 0) return null;
    var start = Math.max(0, Math.min(i - 1, L.vals.length - 3));
    var out = [];
    L.vals.slice(start, start + 3).forEach(function (v) {
      var p = priceWith(L.key, v);
      if (p) out.push({ v: v, low: p.low, high: p.high, mid: (p.low + p.high) / 2, name: labelOf(L, v), note: noteOf(L, v), mine: v === cur });
    });
    if (out.length < 3) return null;
    out.sort(function (a, b) { return a.mid - b.mid; });
    // three options that cost the same aren't a choice
    if (out[2].mid - out[0].mid < out[0].mid * 0.05) return null;
    ['Good', 'Better', 'Best'].forEach(function (t, k) { out[k].tier = t; });
    return out;
  }

  function css() {
    if (document.getElementById('bp-rp-css')) return;
    var s = document.createElement('style'); s.id = 'bp-rp-css';
    s.textContent =
      '#bp-gbb{margin:18px 0 16px}' +
      '#bp-gbb .rp-h{font-weight:700;font-size:15px;margin:0 0 4px}' +
      '#bp-gbb .rp-s{font-size:12.5px;opacity:.7;margin:0 0 12px}' +
      '#bp-gbb .rp-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}' +
      '@media (max-width:620px){#bp-gbb .rp-row{grid-template-columns:1fr}}' +
      '#bp-gbb .rp-c{position:relative;border:1px solid rgba(127,140,160,.35);border-radius:12px;padding:14px 14px 12px;background:rgba(127,140,160,.06)}' +
      '#bp-gbb .rp-c.mine{border:2px solid var(--bp-acc,var(--a,#2f6bff));padding:13px 13px 11px;background:rgba(47,107,255,.06)}' +
      '#bp-gbb .rp-t{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.65}' +
      '#bp-gbb .rp-n{font-weight:700;font-size:14.5px;margin:3px 0 2px;line-height:1.3}' +
      '#bp-gbb .rp-note{font-size:12px;opacity:.65;line-height:1.35;min-height:16px}' +
      '#bp-gbb .rp-p{font-weight:700;font-size:17px;margin-top:8px}' +
      '#bp-gbb .rp-m{font-size:12.5px;opacity:.8;margin-top:2px}' +
      '#bp-gbb .rp-you{position:absolute;top:-10px;right:10px;background:var(--bp-acc,var(--a,#2f6bff));color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px}' +
      '.bp-rp-mo{margin-top:8px;font-size:14px;font-weight:600}' +
      '.bp-rp-fine{font-size:11.5px;line-height:1.45;opacity:.65;margin:10px 0 0}' +
      '#e-rctabtn.bp-rp-hide{display:none !important}' +
      '.bp-rp-done{display:flex;gap:10px;align-items:flex-start;text-align:left;border:1px solid rgba(21,128,61,.35);background:rgba(21,128,61,.07);border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.45;margin:0 0 10px}' +
      '.bp-rp-done b{display:block}';
    document.head.appendChild(s);
  }

  function render() {
    var page = document.getElementById('e-spR'); if (!page) return;
    css();
    var hero = page.querySelector('.e-rhero');
    var f = financing();
    var T = tiers();
    var mine = T && T.filter(function (t) { return t.mine; })[0];

    /* 1. monthly payment under the big price (their own pick) */
    var mo = document.getElementById('bp-rp-mo');
    var lowNow = mine ? mine.low : (function () { try { return window.eCalcPrice().low; } catch (e) { return 0; } })();
    if (f && lowNow > 0 && hero) {
      if (!mo) { mo = document.createElement('div'); mo.id = 'bp-rp-mo'; mo.className = 'bp-rp-mo'; var after = document.getElementById('e-rrange'); (after && after.parentNode === hero ? after : hero.lastChild).insertAdjacentElement('afterend', mo); }
      mo.textContent = 'Financing available: from about ' + money(monthly(lowNow, f)) + '/month*';
    } else if (mo) mo.parentNode.removeChild(mo);

    /* 2. Good / Better / Best */
    var box = document.getElementById('bp-gbb');
    if (T && hero) {
      if (!box) { box = document.createElement('div'); box.id = 'bp-gbb'; hero.insertAdjacentElement('afterend', box); }
      box.innerHTML = '<div class="rp-h">Compare your options</div>'
        + '<div class="rp-s">Same measurements, three levels. Your contractor confirms the final price at the inspection.</div>'
        + '<div class="rp-row">' + T.map(function (t) {
          return '<div class="rp-c' + (t.mine ? ' mine' : '') + '">' + (t.mine ? '<span class="rp-you">Your pick</span>' : '')
            + '<div class="rp-t">' + t.tier + '</div><div class="rp-n">' + esc(t.name) + '</div><div class="rp-note">' + esc(t.note) + '</div>'
            + '<div class="rp-p">' + money(t.low) + ' – ' + money(t.high) + '</div>'
            + (f ? '<div class="rp-m">about ' + money(monthly(t.low, f)) + '/month*</div>' : '') + '</div>';
        }).join('') + '</div>';
    } else if (box) box.parentNode.removeChild(box);

    /* the terms that must sit with any payment amount */
    var fine = document.getElementById('bp-rp-fine');
    if (f) {
      if (!fine) { fine = document.createElement('div'); fine.id = 'bp-rp-fine'; fine.className = 'bp-rp-fine'; ((box && box.parentNode) ? box : hero).insertAdjacentElement('afterend', fine); }
      fine.textContent = '*Estimated payment on the low end of the price with $0 down, at ' + f.apr + '% APR for ' + f.months + ' months'
        + (f.lender ? ' through ' + f.lender : '') + ', with approved credit. Not a loan offer: your rate, term and payment depend on your credit and the final price.';
    } else if (fine) fine.parentNode.removeChild(fine);

    /* 3. no booking page: say the request is in */
    var btn = document.getElementById('e-rctabtn');
    if (btn) {
      btn.classList.add('bp-rp-hide'); btn.style.setProperty('display', 'none', 'important');
      var sub = btn.parentNode.querySelector('.e-rctasub'); if (sub) sub.style.display = 'none';
      if (!document.getElementById('bp-rp-done')) {
        var d = document.createElement('div'); d.id = 'bp-rp-done'; d.className = 'bp-rp-done';
        d.innerHTML = '<span aria-hidden="true">✓</span><span><b>Your request is in.</b>We have your details and will reach out to set up your free inspection. No obligation.</span>';
        btn.parentNode.insertBefore(d, btn);
      }
    }
  }

  /* run after the calculator draws its own result */
  function hook() {
    var orig = window.eShowResult;
    if (typeof orig !== 'function' || orig.__bpRp) return false;
    var wrapped = function () { var r = orig.apply(this, arguments); try { render(); } catch (e) { /* the result still shows */ } return r; };
    wrapped.__bpRp = true;
    window.eShowResult = wrapped;
    return true;
  }
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
  window.__bpResultPlus = { render: render, tiers: tiers };
})();
