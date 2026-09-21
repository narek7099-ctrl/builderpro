/* ==================================================================
   One door, one key.

   A claim is worthless if the same house can be claimed twice under two
   spellings — "7710 Highland Ave" and "7710 HIGHLAND AVENUE, Austin"
   have to reduce to the same thing, or two contractors will both be
   told the door is theirs and both knock it.

   This is the only implementation. The scheduled job carries a copy
   because Deno cannot import from the site, and tools/radar-key.test.js
   runs both copies against the same cases and fails if they ever drift.
   Deliberately not a SQL function: a third copy in a language I cannot
   run here is a third chance to disagree.

   It is on purpose that this is boring. Address normalisation gets
   clever and then it gets wrong: the goal is only that two spellings of
   one house agree, not that the result is a valid address.
   ================================================================== */
(function (root) {
  'use strict';

  /* Street suffixes, long and short, dropped together. Both forms have to
     go or "Ave" and "Avenue" end up as different doors — which is the
     exact bug this function exists to prevent. */
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
  function doorKey(addr) {
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

  root.rdDoorKey = doorKey;
  if (typeof module !== 'undefined' && module.exports) module.exports = { doorKey: doorKey };
})(typeof window !== 'undefined' ? window : globalThis);
