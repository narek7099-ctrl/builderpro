/* ==================================================================
   A better-looking map for Jobs → Driving routes (2026-11-28).

   The routes map (#pjMap) uses the app's keyless map kit (bpTileLayer in
   app.html: OpenFreeMap vector tiles, Esri imagery, fallbacks). This file
   wraps that kit for #pjMap only:
     - the vector basemap is recolored to the app's palette: pale ground,
       soft blue water, light green parks, white roads, quieter labels
     - a Map / Satellite switch (Esri imagery with place names on top), so a
       roofer can see the actual roof; the choice is remembered on the device
     - the drawn route is restyled: a bold blue line with a white edge
   Pins, stop numbers, the frame and the zoom buttons are styled in dash.css.
   Other maps that use the kit (the AI Team background) are left alone.
   ================================================================== */
(function () {
  'use strict';
  var KEY = 'bpMapKind';
  var kit = window.bpTileLayer;
  if (typeof kit !== 'function' || kit._bpStyled) return;

  function pref() { try { return localStorage.getItem(KEY) === 'satellite' ? 'satellite' : 'street'; } catch (e) { return 'street'; } }
  function save(k) { try { localStorage.setItem(KEY, k); } catch (e) {} }
  function mine(map) { try { var c = map.getContainer(); return c && c.id === 'pjMap'; } catch (e) { return false; } }

  /* ---------- the palette, applied to whatever layers the style has ---------- */
  function tint(gl) {
    var st; try { st = gl.getStyle(); } catch (e) { return; }
    (st && st.layers || []).forEach(function (l) {
      var id = String(l.id || '').toLowerCase(), t = l.type;
      var set = function (p, v) { try { gl.setPaintProperty(l.id, p, v); } catch (e) {} };
      if (t === 'background') set('background-color', '#f1f3f6');
      else if (t === 'fill' && /water|ocean|lake|river/.test(id)) set('fill-color', '#a9cdf3');
      else if (t === 'line' && /water|river|stream|canal/.test(id)) set('line-color', '#9cc3ee');
      else if (t === 'fill' && /park|wood|forest|grass|green|garden|cemetery|pitch|golf|landcover|scrub/.test(id)) { set('fill-color', '#cdebd6'); set('fill-opacity', 0.95); }
      else if (t === 'fill' && /building/.test(id)) { set('fill-color', '#e8ebf0'); set('fill-outline-color', '#dde2e9'); set('fill-opacity', 0.75); }
      else if (t === 'fill' && /residential|landuse|industrial|commercial|retail|school|hospital/.test(id)) set('fill-color', '#eceff3');
      else if (t === 'fill' && /aeroway|airport/.test(id)) set('fill-color', '#e4e8ee');
      else if (t === 'line' && /(highway|road|street|tunnel|bridge|motorway|trunk|primary|secondary|tertiary|minor|service|path)/.test(id)) {
        var big = /motorway|trunk/.test(id), mid = /major|primary|secondary/.test(id);
        if (/casing|outline/.test(id)) set('line-color', big ? '#e6b660' : mid ? '#c2ccd9' : '#d3dae4');
        else if (/path|track|footway|cycle/.test(id)) set('line-color', '#dfe5ed');
        else set('line-color', big ? '#ffd98a' : '#ffffff');
      }
      else if (t === 'line' && /rail/.test(id)) set('line-color', '#cfd6e0');
      else if (t === 'line' && /boundary|admin/.test(id)) set('line-color', '#bcc5d2');
      else if (t === 'symbol') {
        set('text-color', /place|city|town|village|state|country/.test(id) ? '#1d2939' : /water/.test(id) ? '#4a78b5' : '#5d6b80');
        set('text-halo-color', 'rgba(255,255,255,0.95)'); set('text-halo-width', 1.4);
      }
    });
  }
  function tintWhenReady(layer) {
    var gl = layer && layer.getMaplibreMap && layer.getMaplibreMap(); if (!gl) return;
    var go = function () { tint(gl); };
    try { if (gl.isStyleLoaded && gl.isStyleLoaded()) go(); } catch (e) {}
    gl.on('load', go); gl.once && gl.once('styledata', go);
  }

  /* ---------- the route: bold blue with a white edge ---------- */
  function restyle(layer) {
    if (!window.L || !(layer instanceof L.Polyline) || layer._bpRs) return;
    var o = layer.options || {}; layer._bpRs = 1;
    if (o.dashArray) { layer.setStyle({ color: '#006fff', weight: 3, opacity: 0.55, dashArray: '2 8', lineCap: 'round' }); return; }   /* straight-line placeholder */
    if (String(o.color).toLowerCase() === '#fff' || String(o.color).toLowerCase() === '#ffffff') layer.setStyle({ weight: 11, opacity: 1, lineCap: 'round', lineJoin: 'round' });
    else if (/^#2f6bff$/i.test(String(o.color))) layer.setStyle({ color: '#006fff', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' });
  }

  /* ---------- Map / Satellite ---------- */
  function switcher(map) {
    if (!window.L || map._bpSw) return;
    var Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var d = L.DomUtil.create('div', 'pjx-sw');
        d.innerHTML = '<button type="button" data-k="street">Map</button><button type="button" data-k="satellite">Satellite</button>';
        L.DomEvent.disableClickPropagation(d);
        d.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setKind(map, b.getAttribute('data-k')); });
        return d;
      }
    });
    map._bpSw = new Ctl(); map.addControl(map._bpSw); mark(map);
  }
  function mark(map) {
    var d = map.getContainer().querySelector('.pjx-sw'); if (!d) return;
    d.querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-k') === map._bpKind; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    map.getContainer().classList.toggle('pjx-sat', map._bpKind === 'satellite');
  }
  function setKind(map, k) {
    if (map._bpKind === k) return;
    (map._bpBase || []).forEach(function (h) { try { h.remove(); } catch (e) {} });
    map._bpKind = k; save(k);
    map._bpBase = k === 'satellite' ? [kit(map, 'satellite'), kit(map, 'labels')] : [kit(map, 'street')];
    if (k === 'satellite') setTimeout(function () { map.eachLayer(function (l) { if (l.bringToFront && l instanceof L.Polyline) l.bringToFront(); }); }, 50);
    mark(map);
  }

  window.bpTileLayer = function (map, kind, onSwap) {
    if (!mine(map) || (kind && kind !== 'street')) return kit.apply(this, arguments);
    if (!map._bpHooked) {
      map._bpHooked = 1;
      map.on('layeradd', function (e) {
        var l = e.layer;
        if (l && l.getMaplibreMap) { if (map._bpKind !== 'satellite') tintWhenReady(l); }
        else restyle(l);
      });
    }
    var k = pref(); map._bpKind = k;
    map._bpBase = k === 'satellite' ? [kit(map, 'satellite', onSwap), kit(map, 'labels')] : [kit(map, 'street', onSwap)];
    switcher(map);
    return { remove: function () { (map._bpBase || []).forEach(function (h) { try { h.remove(); } catch (e) {} }); } };
  };
  window.bpTileLayer._bpStyled = 1;
})();
