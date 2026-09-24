/* The roof scan's street map: its vector-tile reader and the conversion to
   the scan's world (north-up feet around the address).

   Run: node tools/roof-map.test.js

   The fixture (tools/fixtures/roof-map-14.mvt) was encoded with the reference
   encoder, geojson-vt + vt-pbf, with OpenMapTiles layer names — the format
   OpenFreeMap serves. It holds a square house ~33 m around the address, a
   minor road ~67 m south, a primary road ~115 m west, a footpath (which must
   be left out), a second building and a lake.

   The reader is pulled out of embed-src/roof-scan.html as text, so this tests
   the code that ships, not a copy of it. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'embed-src', 'roof-scan.html'), 'utf8');
const a = src.indexOf('  var RS_TILEJSON'), b = src.indexOf('  function rsFetch');
if (a < 0 || b < 0) { console.log('FAIL could not find the map reader in roof-scan.html'); process.exit(1); }
const mod = new Function(src.slice(a, b) + '\nreturn {rsMvt:rsMvt, rsGeom:rsGeom, rsMapFromTiles:rsMapFromTiles};')();

const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'roof-map-14.json'), 'utf8'));
const buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'roof-map-14.mvt'));

let fails = 0;
const check = (what, ok, got) => { if (!ok) { fails++; console.log('  FAIL ' + what + (got !== undefined ? '\n    got ' + JSON.stringify(got) : '')); } };
const near = (x, want, tol) => Math.abs(x - want) <= tol;

/* ---- decoding ---------------------------------------------------------- */
const layers = mod.rsMvt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
check('three layers', ['transportation', 'building', 'water'].every(n => layers[n]), Object.keys(layers));
check('extent read', layers.building && layers.building.extent === 4096, layers.building && layers.building.extent);
check('road features', layers.transportation && layers.transportation.feats.length === 3, layers.transportation && layers.transportation.feats.length);
const cls = layers.transportation.feats.map(F => {
  const o = {}; for (let i = 0; i < F.tags.length; i += 2) o[layers.transportation.keys[F.tags[i]]] = layers.transportation.vals[F.tags[i + 1]]; return o['class'];
}).sort();
check('road classes decoded', JSON.stringify(cls) === JSON.stringify(['minor', 'path', 'primary']), cls);
const ring = mod.rsGeom(layers.building.feats[0].geom)[0];
check('polygon closes', ring && ring.length >= 5 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1], ring);

/* ---- into the scan's world ---------------------------------------------- */
const map = mod.rsMapFromTiles([{ z: meta.z, x: meta.x, y: meta.y, layers }], meta.origin);
check('path left out, two roads kept', map.roads.length === 2, map.roads.map(r => r.w));
check('widest road drawn last', map.roads.length === 2 && map.roads[1].w > map.roads[0].w, map.roads.map(r => r.w));

/* the house: a square of ±0.0003° around the address = about ±96 ft east-west
   at this latitude and ±109 ft north-south */
const house = map.blds.find(r => {
  const xs = r.map(p => p[0]), zs = r.map(p => p[1]);
  return Math.min(...xs) < 0 && Math.max(...xs) > 0 && Math.min(...zs) < 0 && Math.max(...zs) > 0;
});
check('house found around the origin', !!house);
if (house) {
  const xs = house.map(p => p[0]), zs = house.map(p => p[1]);
  const wFt = Math.max(...xs) - Math.min(...xs), dFt = Math.max(...zs) - Math.min(...zs);
  check('house width in feet (≈192)', near(wFt, 192, 6), wFt);
  check('house depth in feet (≈218)', near(dFt, 218, 6), dFt);
}

/* the minor road runs east-west ~0.0006° south: z is +south, so ≈ +218 ft */
const minor = map.roads.find(r => r.w === 28);
check('minor road found', !!minor);
if (minor) {
  const zs = minor.pts.map(p => p[1]);
  check('minor road ≈218 ft south', zs.every(z => near(z, 218, 6)), zs);
}
/* the primary road runs north-south ~0.0012° west: x is +east, so ≈ −385 ft */
const primary = map.roads.find(r => r.w === 48);
if (primary) {
  const xs = primary.pts.map(p => p[0]);
  check('primary road ≈385 ft west', xs.every(x => near(x, -385, 8)), xs);
}
check('lake kept', map.water.length === 1, map.water.length);

/* ---- robustness --------------------------------------------------------- */
let threw = false;
try { mod.rsMvt(new ArrayBuffer(0)); } catch (e) { threw = true; }
check('empty tile does not throw', !threw);

console.log(fails ? '\n' + fails + ' FAILED' : 'roof map behaves · tiles decode, the footpath stays out, streets land where they are');
process.exit(fails ? 1 : 0);
