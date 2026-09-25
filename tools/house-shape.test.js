/* The house's shape from the map outline: squaring up crooked outlines, and
   the roof built over them.

   Run: node tools/house-shape.test.js

   Map outlines are traced by hand from imagery, so walls that are straight
   in life come in a degree or two off, with one-foot jogs. straighten() must
   square those up — without touching a genuinely angled building — and
   polyModel() must build a house whose footprint is that squared outline.
   Both are pulled out of embed-src/roof-scan.html as text, so this tests the
   code that ships (roofing and the other nine share it). */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'embed-src', 'roof-scan.html'), 'utf8');
const a = src.indexOf('  function ringArea'), b = src.indexOf('  /* the map’s outline of THIS building') >= 0
  ? src.indexOf('  /* the map’s outline of THIS building') : src.indexOf("  /* the map's outline of THIS building");
if (a < 0 || b < 0) { console.log('FAIL could not find the house-shape code'); process.exit(1); }
const m = new Function(src.slice(a, b) + '\nreturn {ringArea:ringArea, straighten:straighten, polyModel:polyModel};')();

let fails = 0;
const check = (what, ok, got) => { if (!ok) { fails++; console.log('  FAIL ' + what + (got !== undefined ? '\n    got ' + JSON.stringify(got) : '')); } };
const rot = (p, t) => [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)];
const offGrid = (pts) => {
  /* the worst angle between any two edges, folded to 90°: 0 when square */
  const ang = []; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; ang.push(Math.atan2(q[1] - p[1], q[0] - p[0])); }
  let worst = 0; for (const x of ang) { const d = ((x - ang[0]) * 180 / Math.PI % 90 + 90) % 90; worst = Math.max(worst, Math.min(d, 90 - d)); }
  return worst;
};

/* an L-shaped house turned 20°, every corner nudged up to ±0.6 ft, and a
   one-foot jog added along the front wall */
const L = [[-26, -16], [26, -16], [26, 38], [6, 38], [6, 16], [-26, 16]];
let s = 7;
const jit = () => { s = (s * 9301 + 49297) % 233280; return (s / 233280 - 0.5) * 1.2; };
let crooked = L.map(p => rot([p[0] + jit(), p[1] + jit()], 0.349));
crooked.splice(1, 0, rot([0, -16.8], 0.349), rot([1, -16.8], 0.349));

check('the crooked outline really is crooked', offGrid(crooked) > 1, offGrid(crooked));
const sq = m.straighten(crooked);
check('six corners after the jog is dropped', sq.length === 6, sq.length);
check('every edge square to the others', offGrid(sq) < 0.01, offGrid(sq));
const a0 = Math.abs(m.ringArea(crooked)), a1 = Math.abs(m.ringArea(sq));
check('area kept within 2%', Math.abs(a1 - a0) / a0 < 0.02, [a0, a1]);

/* a building that is meant to have angles is left exactly as mapped */
const oct = [...Array(8)].map((_, i) => [30 * Math.cos(i * Math.PI / 4), 30 * Math.sin(i * Math.PI / 4)]);
check('an octagon is left alone', m.straighten(oct) === oct);

/* and the house built from the crooked outline stands on the squared one */
const house = m.polyModel(crooked, 25);
check('a house is built', !!house);
if (house) {
  const foot = house.foot[0].map(v => [v[0], v[2]]);
  check('its footprint is square', offGrid(foot) < 0.01, offGrid(foot));
  check('walls for every edge', house.faces.filter(f => f.kind === 'wall').length === foot.length, house.faces.length);
  const ys = house.faces.filter(f => f.kind === 'roof').flatMap(f => f.v.map(v => v[1]));
  check('roof rises above the eaves', Math.max(...ys) > 10.5, Math.max(...ys));
}

console.log(fails ? '\n' + fails + ' FAILED' : 'house shape behaves · crooked outlines square up, angled ones stay, the house stands on the squared outline');
process.exit(fails ? 1 : 0);
