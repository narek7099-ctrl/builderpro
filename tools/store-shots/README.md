# Store screenshots

Makes the pictures in `docs/store-screenshots/` (iPhone, iPad, Android and the Google Play banner).

1. **Capture raw screens** from the demo contractor account. Run `dress.js` in the page and call
   `__dress()` before each capture. It renames things in the picture only (nothing is saved):
   the business shows as "Summit Roofing Co" and "(sample)" tags are hidden.
   - Phone: 430 x 932 at scale 3, saved as `raw/i1.png` to `raw/i6.png`
   - iPad: 1032 x 1376 at scale 2, saved as `raw/p1.png` to `raw/p6.png`
   - Order: 1 dashboard, 2 jobs, 3 finances, 4 calendar, 5 crew "Today" page, 6 homeowner page
2. **Frame them:** `NODE_PATH=$(npm root -g) node tools/store-shots/compose.cjs`. Set `RAW=<folder>`
   if the raw screens are somewhere else. Headlines are in the `SHOTS` list at the top.

`raw/` is not committed. Never put a login key or a customer link in these files.
