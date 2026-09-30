/* ==================================================================
   Prices: see into what your suppliers sell and charge.

   Not a shop. Two ways to look at the same data:
   - All suppliers: one row per product, one column per supplier, the
     cheapest real price in each row marked.
   - One supplier: their catalog, with SKU, unit, price and when that
     price was last updated, plus inline editing of a price.

   Prices keep the three tiers supply.js uses and never blur them:
     yours    off the contractor's own price book (sheet, bill, typed in)
     typical  the catalog's ballpark, only for chains that carry the item
     none     "—", the supplier does not carry it (as far as we know)

   Data: SP.index() (catalog joined to price books), SP.sup, SP.db.
   Adding to a job's material list goes through window.bpMatAddItem
   (matlists.js).
   ================================================================== */
(function () {
  'use strict';
  var PR = window.PR = { sel: '', q: '', cat: '', n: 60, mine: false, edit: null, menu: null, menuSup: {} };
  var PAGE = 60;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.bpEsc ? bpEsc(s) : String(s == null ? '' : s); };
  var money = function (n) { n = +n || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var norm = function (s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' '); };
  var SPok = function () { return !!(window.SP && SP.index); };

  /* ---------- the data ---------- */
  function sups() {
    if (!SPok()) return [];
    return SP.sup.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }
  function supById(id) { return sups().filter(function (s) { return s.id === id; })[0] || null; }
  PR.mid = function (g) { return g.lo && g.hi ? Math.round((g.lo + g.hi) / 2 * 100) / 100 : (g.lo || g.hi || 0); };
  function when(o) { return o ? (Date.parse(o.updated_at || o.source_at || o.stock_at || 0) || 0) : 0; }
  /* one supplier's price for one product */
  function cell(g, s) {
    var mine = g.offers.filter(function (o) { return o.supplier_id === s.id; })
      .sort(function (a, b) { return (+a.price || Infinity) - (+b.price || Infinity); })[0];
    if (mine) return { kind: 'yours', price: +mine.price || 0, sku: mine.sku || '', unit: mine.unit || g.unit, at: when(mine), item: mine, sup: s };
    var ch = SP.chainOf ? SP.chainOf(s) : '';
    var mid = PR.mid(g);
    if (ch && (g.car || []).indexOf(ch) >= 0 && mid) return { kind: 'typical', price: mid, sku: '', unit: g.unit, sup: s };
    return { kind: 'none', sup: s };
  }
  PR.cell = cell;
  PR.cells = function (g) { return sups().map(function (s) { return cell(g, s); }); };
  /* index of the cheapest real price; typical only counts when nobody has a real one */
  PR.best = function (cells) {
    var pick = function (kind) {
      var bi = null;
      cells.forEach(function (c, i) { if (c.kind === kind && c.price > 0 && (bi == null || c.price < cells[bi].price)) bi = i; });
      return bi;
    };
    var b = pick('yours'); return b != null ? b : null;
  };

  /* the rows on screen, before paging */
  function rows() {
    if (!SPok()) return { all: [], cats: {} };
    var ss = PR.sel ? [supById(PR.sel)].filter(Boolean) : sups();
    var qt = norm(PR.q).split(/[\s,()\-]+/).filter(Boolean);
    var cats = {}, out = [];
    SP.index().forEach(function (g) {
      var cs = ss.map(function (s) { return cell(g, s); });
      if (!cs.some(function (c) { return c.kind !== 'none'; })) return;
      if (PR.sel && PR.mine && cs[0].kind !== 'yours') return;
      if (qt.length) {
        /* each word has to start a word in the name (or a SKU), so "ridge" is not "cartridge" */
        var words = g.name.toLowerCase().split(/[\s,()\-]+/).concat(g.offers.map(function (o) { return String(o.sku || '').toLowerCase(); }));
        if (!qt.every(function (t) { return words.some(function (w) { return w.indexOf(t) === 0; }); })) return;
      }
      var cat = g.cat || (SP.catOf ? SP.catOf({ name: g.name }) : 'Other');
      cats[cat] = (cats[cat] || 0) + 1;
      if (PR.cat && cat !== PR.cat) return;
      out.push({ g: g, cells: cs, cat: cat });
    });
    /* what they have real prices for first, then the ballparks; each by category, then name */
    out.forEach(function (r) { r.real = r.cells.some(function (c) { return c.kind === 'yours'; }) ? 0 : 1; });
    out.sort(function (a, b) { return a.real - b.real || a.cat.localeCompare(b.cat) || a.g.name.localeCompare(b.g.name); });
    return { all: out, cats: cats };
  }

  /* ---------- rendering ---------- */
  function ico() { return ''; }
  function date(ts) { return ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function priceHtml(c, ri, cheap) {
    var key = ri + ':' + c.sup.id;
    if (PR.edit === key) {
      return '<input class="pr-in" id="pr-in" type="number" min="0" step="0.01" inputmode="decimal" value="' + (c.kind === 'yours' ? c.price.toFixed(2) : '') + '" placeholder="' + (c.price ? c.price.toFixed(2) : '0.00') + '"'
        + ' onkeydown="if(event.key===\'Enter\'){this.blur();}else if(event.key===\'Escape\'){PR.edit=null;bpPrices();}" onblur="PR.save(' + ri + ',\'' + c.sup.id + '\',this.value)" aria-label="Your price at ' + esc(c.sup.name) + '">';
    }
    var click = ' onclick="PR.editOpen(' + ri + ',\'' + c.sup.id + '\')" title="Click to set your price at ' + esc(c.sup.name) + '"';
    if (c.kind === 'yours') return '<button class="pr-p pr-yours' + (cheap ? ' pr-cheap' : '') + '"' + click + '>' + money(c.price) + (cheap ? '<span class="pr-lo">lowest</span>' : '') + '</button>';
    if (c.kind === 'typical') return '<button class="pr-p pr-typ"' + click + '>~' + money(c.price).replace(/\.00$/, '') + '</button>';
    return '<span class="pr-none" title="Not carried, as far as we know">&mdash;</span>';
  }
  function addBtn(ri) {
    return '<button class="bpx-rowbtn pr-add" onclick="event.stopPropagation();PR.menuOpen(' + ri + ')">+ Add to list</button>' + (PR.menu === ri ? menuHtml(ri) : '');
  }
  function menuHtml(ri) {
    var r = PR._rows[ri]; if (!r) return '';
    var js = (window.bpJobsGet ? bpJobsGet() : []).filter(function (j) { return j.status !== 'done'; });
    var priced = r.cells.filter(function (c) { return c.kind !== 'none'; });
    var h = '<div class="pr-menu" onclick="event.stopPropagation()"><div class="pr-menu-h">Add <b>' + esc(r.g.name) + '</b></div>';
    if (!PR.sel && priced.length) {
      var b = PR.best(r.cells), def = PR.menuSup[ri] || (b != null ? r.cells[b].sup.id : priced[0].sup.id);
      PR.menuSup[ri] = def;
      h += '<label class="pr-menu-l">From<select onchange="PR.menuSup[' + ri + ']=this.value">' + priced.map(function (c) {
        return '<option value="' + c.sup.id + '"' + (c.sup.id === def ? ' selected' : '') + '>' + esc(c.sup.name) + ' — ' + (c.kind === 'typical' ? '~' : '') + money(c.price) + '</option>';
      }).join('') + '</select></label>';
    }
    h += '<div class="pr-menu-l">To the material list for</div>' + (js.length ? js.map(function (j) {
      return '<button class="pr-menu-j" onclick="PR.add(' + ri + ',\'' + j.id + '\')">' + esc(j.name || 'Job') + (j.title ? ' <span class="bpx-mut">' + esc(j.title) + '</span>' : '') + '</button>';
    }).join('') : '<div class="bpx-mut pr-small">No open jobs yet. Add a project first.</div>');
    return h + '</div>';
  }

  function pills(list) {
    var p = [['', 'All suppliers']].concat(list.map(function (s) { return [s.id, s.name + (s.branch ? ' · ' + s.branch : '')]; }));
    return '<div class="pr-pills">' + p.map(function (x) {
      return '<button class="pr-pill' + (PR.sel === x[0] ? ' on' : '') + '" onclick="PR.pick(\'' + x[0] + '\')">' + esc(x[1]) + '</button>';
    }).join('') + '</div>';
  }
  function chips(cats) {
    var ks = Object.keys(cats).sort();
    if (PR.cat && ks.indexOf(PR.cat) < 0) ks.unshift(PR.cat);
    return '<div class="pr-cats"><button class="pr-cat' + (!PR.cat ? ' on' : '') + '" onclick="PR.catSet(\'\')">All</button>' + ks.map(function (k) {
      return '<button class="pr-cat' + (PR.cat === k ? ' on' : '') + '" data-c="' + esc(k) + '" onclick="PR.catSet(this.dataset.c)">' + esc(k) + ' <small>' + (cats[k] || 0) + '</small></button>';
    }).join('') + '</div>';
  }
  function supHead(s) {
    var y = 0, t = 0; SP.index().forEach(function (g) { var k = cell(g, s).kind; if (k === 'yours') y++; else if (k === 'typical') t++; });
    return '<div class="bpx-panel pr-sup"><div class="pr-sup-t"><b>' + esc(s.name) + '</b><span class="bpx-mut">' + [s.branch, s.account_no ? 'Account #' + s.account_no : 'No account # on file', s.tier].filter(Boolean).map(esc).join(' &middot; ') + '</span>'
      + '<span class="pr-sup-n"><b>' + y + '</b> with your price &middot; <b>' + t + '</b> typical only</span></div>'
      + '<div class="pr-sup-a"><button class="bpx-rowbtn ml-primary" onclick="PR.upload(\'' + s.id + '\')">Upload price sheet or bill</button>'
      + (SP.importOpen ? '<button class="bpx-rowbtn" onclick="SP.importOpen(\'' + s.id + '\')">Import a CSV</button>' : '')
      + '<button class="bpx-rowbtn" onclick="bpNav(\'suppliers\')">Supplier details</button></div></div>';
  }

  window.bpPrices = function () {
    var area = $('bpxViewArea'); if (!area) return;
    var done = function () { window.bpSpin && bpSpin(false); };
    var tabs = window.ML && ML.tabs ? ML.tabs('prices') : '';
    if (!SPok()) { area.innerHTML = tabs + '<div class="bpx-panel bpx-mut">Prices are not available right now.</div>'; done(); return; }
    if (!SP.loaded) { SP.load(); area.innerHTML = tabs + '<div class="bpx-panel"><div class="bpx-skel" style="width:40%"></div><div class="bpx-skel"></div></div>'; done(); return; }
    var list = sups();
    if (PR.sel && !supById(PR.sel)) PR.sel = '';
    var h = tabs + '<div class="pr-note"><span>Your prices come from your price sheets and bills. Typical prices (~) are ballparks until you add yours.</span>'
      + '<button class="bpx-rowbtn" onclick="PR.upload(PR.sel)">Upload a price sheet or bill</button></div>';
    if (!list.length) {
      area.innerHTML = h + '<div class="bpx-panel pr-empty"><b>No suppliers yet.</b><div class="bpx-mut">Add the places you buy from, or look around with three example suppliers first.</div>'
        + '<div class="pr-sup-a"><button class="bpx-rowbtn ml-primary" onclick="bpNav(\'suppliers\')">Add where I buy</button>' + (SP.addSamples ? '<button class="bpx-rowbtn" onclick="SP.addSamples()">Show example suppliers</button>' : '') + '</div></div>';
      done(); return;
    }
    var R = rows(), all = R.all, shown = all.slice(0, PR.n);
    PR._rows = shown;
    var active = document.activeElement && document.activeElement.id === 'pr-q';
    h += '<div class="pr-top">' + pills(list)
      + '<div class="pr-search"><span class="ms">search</span><input id="pr-q" style="border:0!important;box-shadow:none!important;background:transparent!important;border-radius:0!important" placeholder="Search products or SKUs" autocomplete="off" value="' + esc(PR.q) + '" oninput="PR.search(this.value)"></div>'
      + (PR.sel ? '<label class="ml-chk pr-mine"><input type="checkbox"' + (PR.mine ? ' checked' : '') + ' onchange="PR.mine=this.checked;PR.n=' + PAGE + ';bpPrices()"> Only my prices</label>' : '')
      + '</div>' + chips(R.cats);
    var s = PR.sel ? supById(PR.sel) : null;
    if (s) h += supHead(s);
    h += '<div class="bpx-panel pr-panel">';
    if (!all.length) h += '<div class="ml-empty bpx-mut">' + (PR.q || PR.cat || PR.mine ? 'Nothing matches. Try another word or category.' : 'No products yet for this supplier. Upload a price sheet or bill.') + '</div>';
    else if (!s) {
      h += '<div class="pr-count bpx-mut">' + all.length.toLocaleString() + ' products across ' + list.length + ' suppliers &middot; click a price to set yours</div>'
        + '<div class="pr-scroll"><table class="bpx-table pr-tbl"><thead><tr><th class="pr-stick">Product</th>' + list.map(function (x) { return '<th class="ml-n pr-col"><button class="pr-colbtn" onclick="PR.pick(\'' + x.id + '\')">' + esc(x.name) + '</button></th>'; }).join('') + '<th></th></tr></thead><tbody>'
        + shown.map(function (r, ri) {
          var b = PR.best(r.cells);
          return '<tr><td class="pr-stick"><div class="pr-prod">' + ico(r.cat) + '<span><span class="pr-name">' + esc(r.g.name) + '</span><small class="bpx-mut">per ' + esc(r.g.unit || 'ea') + '</small></span></div></td>'
            + r.cells.map(function (c, ci) { return '<td class="ml-n">' + priceHtml(c, ri, ci === b && r.cells.filter(function (x) { return x.kind === 'yours'; }).length > 1) + '</td>'; }).join('')
            + '<td class="ml-x pr-addc">' + addBtn(ri) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } else {
      h += '<div class="pr-scroll"><table class="bpx-table pr-tbl pr-one"><thead><tr><th class="pr-stick">Product</th><th>SKU</th><th>Unit</th><th class="ml-n">Price</th><th>Updated</th><th></th></tr></thead><tbody>'
        + shown.map(function (r, ri) {
          var c = r.cells[0];
          return '<tr><td class="pr-stick"><div class="pr-prod">' + ico(r.cat) + '<span class="pr-name">' + esc(r.g.name) + '</span></div></td>'
            + '<td class="bpx-mut pr-small">' + esc(c.sku || '—') + '</td><td>' + esc(c.unit || r.g.unit || 'ea') + '</td>'
            + '<td class="ml-n">' + priceHtml(c, ri, false) + '<div class="pr-tier">' + (c.kind === 'yours' ? 'your price' : 'typical') + '</div></td>'
            + '<td class="bpx-mut pr-small">' + (c.kind === 'yours' ? esc(date(c.at) || '—') : '') + '</td>'
            + '<td class="ml-x pr-addc">' + addBtn(ri) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (all.length > shown.length) h += '<div class="pr-more"><button class="bpx-rowbtn" onclick="PR.n+=' + PAGE + ';bpPrices()">Show ' + Math.min(PAGE, all.length - shown.length) + ' more</button><span class="bpx-mut pr-small">' + shown.length + ' of ' + all.length.toLocaleString() + '</span></div>';
    h += '</div>';
    area.innerHTML = h; done();
    if (active) { var q = $('pr-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
    placeMenu();
    if (PR.edit) { var inp = $('pr-in'); if (inp) { inp.focus(); inp.select(); } }
  };

  /* ---------- actions ---------- */
  var reset = function () { PR.n = PAGE; PR.edit = null; PR.menu = null; PR.menuSup = {}; };
  PR.pick = function (id) { PR.sel = id || ''; PR.mine = false; reset(); bpPrices(); };
  PR.catSet = function (c) { PR.cat = c || ''; reset(); bpPrices(); };
  var qT = null;
  PR.search = function (v) { PR.q = v; clearTimeout(qT); qT = setTimeout(function () { reset(); bpPrices(); }, 120); };
  PR.menuOpen = function (ri) { PR.menu = PR.menu === ri ? null : ri; PR.edit = null; bpPrices(); };
  PR.upload = function (id) {
    if (SP.scanOpen) { SP.scanOpen(); return; }
    if (id && SP.importOpen) { SP.importOpen(id); return; }
    bpNav('suppliers');
  };
  PR.editOpen = function (ri, sid) { PR.edit = ri + ':' + sid; PR.menu = null; bpPrices(); };
  PR.save = function (ri, sid, v) {
    if (PR.edit !== ri + ':' + sid) return;
    PR.edit = null;
    var r = PR._rows[ri], s = supById(sid); if (!r || !s) { bpPrices(); return; }
    var p = parseFloat(String(v).replace(/[^0-9.]/g, ''));
    if (!isFinite(p) || p <= 0) { bpPrices(); return; }
    p = Math.round(p * 100) / 100;
    var c = cell(r.g, s), now = new Date().toISOString(), ex = c.kind === 'yours' ? c.item : null;
    var row = { supplier_id: sid, sku: ex ? ex.sku : 'MY-' + hash(norm(r.g.name)),
      name: ex ? ex.name : r.g.name, category: ex ? (ex.category || r.cat) : r.cat, unit: (ex && ex.unit) || r.g.unit || 'ea', price: p,
      list_price: ex ? (ex.list_price == null ? null : ex.list_price) : null, updated_at: now, source: 'manual', source_at: now };
    if (ex && ex.stock !== undefined) { row.stock = ex.stock; row.stock_at = ex.stock_at || null; }
    SP.db.upsertItems([row]).then(function () {
      if (ex) { Object.assign(ex, { price: p, updated_at: now, source: 'manual', source_at: now }); bpPrices(); }
      else SP.reload();
      toast('Your price at ' + s.name + ': ' + money(p));
    }).catch(function (e) { toast('Could not save the price. ' + ((e && e.message) || '')); bpPrices(); });
  };
  PR.add = function (ri, jid) {
    var r = PR._rows[ri]; if (!r) return;
    var c = PR.sel ? r.cells[0] : r.cells.filter(function (x) { return x.sup.id === PR.menuSup[ri]; })[0];
    var j = (window.bpJobsGet ? bpJobsGet() : []).filter(function (x) { return x.id === jid; })[0];
    if (!c || !j || !window.bpMatAddItem) return;
    var ok = bpMatAddItem(jid, { name: r.g.name, sku: c.sku || '', supplierId: c.sup.id, supplierName: c.sup.name, unit: c.unit || r.g.unit || 'ea', price: c.kind === 'none' ? 0 : c.price });
    PR.menu = null; bpPrices();
    if (ok) toast('Added to ' + (j.name || 'Job') + (j.title ? ' — ' + j.title : ''));
  };
  document.addEventListener('click', function () { if (PR.menu != null && window._bpCurView === 'prices') { PR.menu = null; bpPrices(); } });

  function hash(t) { var h = 5381; for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return h.toString(36).toUpperCase().slice(0, 6); }
  /* the menu is fixed to the viewport so the table's scroll box never clips it */
  function placeMenu() {
    var m = document.querySelector('#bpx .pr-menu'); if (!m) return;
    var b = m.parentNode.querySelector('.pr-add'); if (!b) return;
    var rc = b.getBoundingClientRect(), w = m.offsetWidth, hgt = m.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var left = Math.max(8, Math.min(rc.right - w, vw - w - 8));
    var top = rc.bottom + 4; if (top + hgt > vh - 8) top = Math.max(8, rc.top - hgt - 4);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    /* an ancestor with a transform becomes the containing block: correct for it */
    var got = m.getBoundingClientRect();
    m.style.left = (left - (got.left - left)) + 'px'; m.style.top = (top - (got.top - top)) + 'px'; m.style.visibility = 'visible';
  }
  window.addEventListener('scroll', function () { if (PR.menu != null && window._bpCurView === 'prices') placeMenu(); }, true);
  window.addEventListener('resize', function () { if (PR.menu != null && window._bpCurView === 'prices') placeMenu(); });
  function toast(t) {
    var el = $('pr-toast');
    if (!el) { el = document.createElement('div'); el.id = 'pr-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.className = 'on';
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.className = ''; }, 2600);
  }
  PR.toast = toast;

  /* ---------- styles ---------- */
  var css = '#bpx .pr-note{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:9px 12px;border-radius:10px;background:var(--soft);font-size:13px;margin-bottom:12px}'
    + '#bpx .pr-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}'
    + '#bpx .pr-pills{display:flex;gap:6px;overflow-x:auto;max-width:100%;padding-bottom:2px;flex:1 1 auto;min-width:0}'
    + '#bpx .pr-pill{flex:0 0 auto;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;color:inherit}'
    + '#bpx .pr-pill.on{background:var(--ink,#0b1021);color:#fff;border-color:var(--ink,#0b1021)}'
    + '#bpx .pr-search{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:10px;padding:2px 10px;background:#fff;flex:0 1 280px;min-width:0}#bpx .pr-search .ms{color:var(--grey);font-size:19px}'
    + '#bpx .pr-search input#pr-q,#bpx .pr-search input#pr-q:focus{border:0!important;outline:0;box-shadow:none!important;padding:7px 0!important;margin:0!important;font:inherit;font-size:13.5px;background:transparent!important;width:100%;min-width:0;height:auto}'
    + '#bpx .pr-cats{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px;max-width:100%}'
    + '#bpx .pr-cat{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line-2,var(--line));background:#fff;border-radius:8px;padding:4px 9px;font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap;color:inherit}'
    + '#bpx .pr-cat .sp-ic{width:15px;height:15px}#bpx .pr-cat small{color:var(--grey);font-size:11px}#bpx .pr-cat.on{border-color:var(--blue,#006fff);background:rgba(0,111,255,.07);color:var(--blue,#006fff)}'
    + '#bpx .pr-panel{padding:12px 14px;min-width:0}#bpx .pr-count{font-size:12.5px;margin-bottom:6px}'
    + '#bpx .pr-scroll{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch}'
    + '#bpx .pr-tbl{min-width:100%;border-collapse:separate;border-spacing:0}#bpx .pr-tbl td{vertical-align:middle;padding:7px 8px}#bpx .pr-tbl th{padding:8px;white-space:nowrap}'
    + '#bpx .pr-stick{position:sticky;left:0;background:var(--card,#fff);z-index:1;min-width:220px}'
    + '#bpx .pr-prod{display:flex;align-items:center;gap:9px}#bpx .pr-prod>span{display:flex;flex-direction:column;min-width:0}#bpx .pr-name{font-weight:600;font-size:13.5px}#bpx .pr-prod small{font-size:11.5px}'
    + '#bpx .pr-ic{flex:0 0 auto}#bpx .pr-col{min-width:110px}#bpx .pr-colbtn{border:0;background:none;font:inherit;font-weight:inherit;color:inherit;cursor:pointer;padding:0;text-transform:inherit;letter-spacing:inherit}#bpx .pr-colbtn:hover{color:var(--blue,#006fff)}'
    + '#bpx .pr-p{border:1px solid transparent;background:none;font:inherit;font-size:13.5px;cursor:pointer;padding:3px 7px;border-radius:7px;white-space:nowrap;color:inherit}#bpx .pr-p:hover{border-color:var(--line);background:var(--soft)}'
    + '#bpx .pr-yours{font-weight:700}#bpx .pr-typ{color:var(--grey)}#bpx .pr-none{color:var(--grey);padding:0 8px}'
    + '#bpx .pr-cheap{background:rgba(31,170,90,.12);color:#146c3c}#bpx .pr-lo{display:block;font-size:10px;font-weight:600;letter-spacing:.02em}'
    + '#bpx .pr-tier{font-size:10.5px;color:var(--grey);padding-right:8px}'
    + '#bpx .pr-in{width:92px;text-align:right;border:1px solid var(--blue,#006fff);border-radius:7px;padding:5px 7px;font:inherit;font-size:13.5px}'
    + '#bpx .pr-one td:nth-child(2){white-space:nowrap}#bpx .pr-addc{position:relative}#bpx .pr-add{white-space:nowrap}'
    + '#bpx .pr-menu{position:fixed;visibility:hidden;z-index:30;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 30px rgba(10,20,40,.14);padding:10px;width:260px;text-align:left;white-space:normal}'
    + '#bpx .pr-menu-h{font-size:12.5px;margin-bottom:8px}#bpx .pr-menu-l{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:600;color:var(--grey);margin:0 0 6px}'
    + '#bpx .pr-menu-l select{font:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;color:var(--ink,#0b1021);font-weight:400}'
    + '#bpx .pr-menu-j{display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--line-2,var(--line));background:none;padding:8px 4px;font:inherit;font-size:13px;cursor:pointer;color:inherit}#bpx .pr-menu-j:hover{background:var(--soft)}'
    + '#bpx .pr-more{display:flex;align-items:center;gap:10px;justify-content:center;padding-top:10px}#bpx .pr-small{font-size:12px}'
    + '#bpx .pr-sup{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;margin-bottom:12px}#bpx .pr-sup-t{display:flex;flex-direction:column;gap:2px;min-width:0}#bpx .pr-sup-t>b{font-size:16px}#bpx .pr-sup-t span{font-size:12.5px}'
    + '#bpx .pr-sup-a{display:flex;gap:6px;flex-wrap:wrap}#bpx .pr-mine{margin:0}#bpx .pr-empty{display:flex;flex-direction:column;gap:8px;padding:18px}'
    + '#pr-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);background:#0b1021;color:#fff;padding:10px 16px;border-radius:10px;font:13.5px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;opacity:0;pointer-events:none;transition:all .2s;z-index:99999;max-width:calc(100vw - 32px)}#pr-toast.on{opacity:1;transform:translate(-50%,0)}'
    + '@media(max-width:600px){#bpx .pr-search{flex:1 1 100%}#bpx .pr-pills{flex:1 1 100%}#bpx .pr-stick{min-width:150px;max-width:170px}#bpx .pr-name{font-size:12.5px}#bpx .pr-col{min-width:92px}'
    + '#bpx .pr-panel{padding:10px 8px}#bpx .pr-menu{width:230px}#bpx .pr-sup-a .bpx-rowbtn{flex:1 1 auto}}';
  var st = document.createElement('style'); st.id = 'pr-css'; st.textContent = css; document.head.appendChild(st);
})();
