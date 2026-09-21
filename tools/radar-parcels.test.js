/* The precedence rule is the part that would quietly produce bad leads if it
   were wrong: a house whose roof was replaced in 2015 must NOT be offered as
   a 27-year-old roof just because the house was built in 1998. */
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'portal', 'radar-key.js'));
require(path.join(__dirname, '..', 'portal', 'radar-parcels.js'));
const RDP = global.RDP;
global.rdScore = (age, t) => Math.round(30 + 62 * (1 - Math.pow(Math.min(1, Math.abs(age - t.peak) / 8), 1.35)));

const t = { lo: 15, hi: 30, peak: 22, unit: 'roof' };
const yr = y => y;
let fail = 0;
const ok = (cond, what) => { if (!cond) { fail++; console.log('  FAIL ' + what); } };

/* 1. a re-roof permit beats the year the house was built */
const permitLead = { addr: '10 Oak St', lat: 30.2, lng: -97.7, kind: 'due', ageExact: 10, age: 10, year: 2015, base: 55 };
let merged = RDP.merge([permitLead], [
  { addr: '10 OAK STREET', lat: 30.2, lng: -97.7, builtYear: yr(1998), value: 480000, sqft: 2200, landUse: 'Single Family' },
], t);
ok(merged.length === 1, 'the same house must not appear twice');
ok(merged[0].age === 10, 'the permit keeps the age it established, not the build year');
ok(merged[0].value === 480000, 'the parcel still enriches what the permit did not know');

/* 2. no permit: the original roof is as old as the house */
merged = RDP.merge([], [
  { addr: '12 Oak St', lat: 30.2, lng: -97.7, builtYear: yr(new Date().getFullYear() - 24), landUse: 'Single Family' },
], t);
ok(merged.length === 1 && merged[0].kind === 'due', 'an unpermitted 24-year-old house is a lead');
ok(/original/.test(merged[0].why), 'and it says why');

/* 3. too new, no sale: not a lead */
merged = RDP.merge([], [{ addr: '14 Oak St', lat: 30.2, lng: -97.7, builtYear: yr(new Date().getFullYear() - 3), landUse: 'Single Family' }], t);
ok(merged.length === 0, 'a three-year-old house is not a roofing lead');

/* 4. too new BUT just sold: a lead of a different kind */
merged = RDP.merge([], [{ addr: '16 Oak St', lat: 30.2, lng: -97.7, builtYear: yr(new Date().getFullYear() - 3),
  lastSaleAt: Date.now() - 60 * 864e5, landUse: 'Single Family' }], t);
ok(merged.length === 1 && merged[0].kind === 'newowner', 'a recent sale is its own reason to knock');

/* 5. not a home.
   The age has to sit INSIDE the window for this to test anything: with a
   1990 build these all came back empty because 35 years is past the band,
   so every assertion passed without the land-use filter being consulted
   once. A test that cannot fail is not a test. */
const DUE = new Date().getFullYear() - 22;
['Vacant Land', 'Commercial', 'Church', 'Parking'].forEach(u => {
  const m = RDP.merge([], [{ addr: '1 ' + u + ' Rd', lat: 30.2, lng: -97.7, builtYear: yr(DUE), landUse: u }], t);
  ok(m.length === 0, 'must not send a roofer to a ' + u.toLowerCase());
});
ok(RDP.merge([], [{ addr: '9 Home St', lat: 30.2, lng: -97.7, builtYear: yr(DUE), landUse: 'Single Family Residential' }], t).length === 1,
  'but a house classed as residential, at the same age, is still a house');

/* 6. junk years are nulls in disguise — and the control above proves the
   window itself is not what is rejecting them */
[0, 1, '', 'N/A', 19000101].forEach(v => {
  const m = RDP.merge([], [{ addr: '7 Junk St', lat: 30.2, lng: -97.7, builtYear: v, landUse: 'Single Family' }], t);
  ok(m.length === 0, 'year built of "' + v + '" must not become a lead');
});

/* 7. nested vendor payloads */
const attom = RDP.normalise({ address: { line1: '3 Deep Way' }, location: { latitude: '30.1', longitude: '-97.8' },
  summary: { yearbuilt: '1999', proptype: 'SFR' }, building: { size: { livingsize: '2400' } },
  assessment: { assessed: { assdttlvalue: '350000' } } }, 'attom');
ok(attom && attom.builtYear === 1999 && attom.sqft === 2400 && attom.value === 350000, 'a nested payload reads through');

/* 8. inert until a provider is chosen */
ok(RDP.configured() === false, 'no source configured means the module does nothing');

console.log(fail ? '\n' + fail + ' failed' : 'parcel merge behaves · every rule held');
process.exit(fail ? 1 : 0);
