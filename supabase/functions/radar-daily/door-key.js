/* A copy of portal/radar-key.js, which is the canonical one.
   Deno cannot import from the site, so this is duplicated on purpose — and
   tools/radar-key.test.js runs both over the same addresses and fails the
   build if they ever disagree. A claim that can be taken twice, because two
   spellings of one house produced two keys, is worse than no claim at all.
   Change the portal file first, then mirror it here, then run the test. */
var SUFFIX = ('STREET ST AVENUE AVE AV ROAD RD DRIVE DR LANE LN BOULEVARD BLVD '
  + 'COURT CT PLACE PL TERRACE TER CIRCLE CIR HIGHWAY HWY PARKWAY PKWY '
  + 'TRAIL TRL SQUARE SQ LOOP RUN PASS COVE CV BEND CROSSING XING').split(' ');

/* Directionals are kept — North Main and South Main are different
   streets — but reduced to one spelling. */
var DIR = { NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW' };

/* Everything from the comma onwards goes, zip included.

   The zip looks like it should help — "12 Oak Ln" exists in more than one
   of them — but the feeds give it on some rows and not others, so keying
   on it splits one house into two doors the moment a row arrives without
   one. That is the failure that matters: two keys for one house means two
   contractors are each told it is theirs and both knock it. One key for
   two houses only means somebody is briefly holding a door they are not
   working, which nobody sees and the fourteen-day sweep undoes.

   So when in doubt, collapse. A rare collision between two streets of the
   same name is the cheaper mistake by a wide margin. */
export function doorKey(addr) {
  var s = String(addr == null ? '' : addr).toUpperCase();
  s = s.split(',')[0];                                  /* street line only */
  s = s.replace(/\s+(?:APT|UNIT|STE|SUITE|FL|FLOOR|RM|ROOM|#)\s*[A-Z0-9-]+/g, ' ');
  s = s.replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!s) return '';

  var out = [];
  s.split(' ').forEach(function (w) {
    if (!w) return;
    if (DIR[w]) { out.push(DIR[w]); return; }
    if (SUFFIX.indexOf(w) >= 0) return;                 /* suffix carries no identity */
    out.push(w);
  });
  if (!out.length) return '';
  return out.join('-');
}
