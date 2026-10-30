// Share-preview images (1200x630) for builderpro-os.com: the picture a link
// shows in a text, Facebook, LinkedIn or Slack. One per trade plus a general
// one. Run: node tools/og-cards.js   (writes assets/og/*.png)
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'og');
const LOGO = 'data:image/png;base64,' + require('fs').readFileSync(path.join(__dirname, '..', 'assets', 'brand', 'logo-mark-256.png')).toString('base64');
const CARDS = {
  default: ['Simple software for', 'growing contractors.', 'Lisa answers every call · Estimates · Jobs · Payments'],
  compare: ['BuilderPro vs Jobber,', 'Housecall Pro, ServiceTitan.', 'AI receptionist included · One flat price · No contract'],
  roofing: ['Run your roofing', 'business in one place.', 'Lisa answers every call · Roof calculator · Jobs · Payments'],
  hvac: ['Run your HVAC', 'business in one place.', 'Lisa answers every call · HVAC calculator · Jobs · Payments'],
  plumbing: ['Run your plumbing', 'business in one place.', 'Lisa answers every call · Price calculator · Jobs · Payments'],
  electrical: ['Run your electrical', 'business in one place.', 'Lisa answers every call · Price calculator · Jobs · Payments'],
  painting: ['Run your painting', 'business in one place.', 'Lisa answers every call · Paint calculator · Jobs · Payments'],
  landscaping: ['Run your landscaping', 'business in one place.', 'Lisa answers every call · Price calculator · Jobs · Payments'],
  concrete: ['Run your concrete', 'business in one place.', 'Lisa answers every call · Price calculator · Jobs · Payments'],
  remodeling: ['Run your remodeling', 'business in one place.', 'Lisa answers every call · Price calculator · Jobs · Payments'],
  countertops: ['What will your', 'countertops cost?', 'Free calculator · A real price range in under a minute', 'Free to use'],
  pools: ['What will your', 'pool cost?', 'Free calculator · A real price range in under a minute', 'Free to use'],
  trim: ['What will your', 'trim work cost?', 'Free calculator · A real price range in under a minute', 'Free to use'],
  'roofing-calc': ['What will your', 'new roof cost?', 'Free calculator · A real price range in under a minute', 'Free to use'],
  'hvac-calc': ['What will your', 'HVAC job cost?', 'Free calculator · A real price range in under a minute', 'Free to use'],
  'painting-calc': ['What will your', 'paint job cost?', 'Free calculator · A real price range in under a minute', 'Free to use'],
  'landscaping-calc': ['What will your', 'landscaping cost?', 'Free calculator · A real price range in under a minute', 'Free to use'],
};
const page = ([a, b, c, pill = '14 days free']) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;font-family:Inter,sans-serif;background:#f4f7fc;position:relative;overflow:hidden;color:#001530}
.glow{position:absolute;right:-180px;top:-220px;width:720px;height:720px;border-radius:50%;background:radial-gradient(circle,#cfe0ff 0%,rgba(207,224,255,0) 68%)}
.card{position:absolute;inset:44px;border-radius:36px;background:#fff;border:1px solid #e3e9f3;box-shadow:0 30px 80px rgba(0,21,48,.08);padding:64px 72px;display:flex;flex-direction:column}
.logo{display:flex;align-items:center;gap:14px;font-weight:700;font-size:34px;letter-spacing:-.03em}
.logo img{width:46px;height:46px}.logo b{color:#006fff}
h1{margin-top:auto;font-size:76px;line-height:1.02;letter-spacing:-.045em;font-weight:800}
h1 span{color:#006fff}
p{margin-top:26px;font-size:27px;color:#4c5b70;font-weight:500}
.pill{position:absolute;right:72px;top:64px;background:#001530;color:#fff;font-weight:600;font-size:22px;padding:14px 26px;border-radius:999px}
</style></head><body><div class="glow"></div><div class="card">
<div class="logo"><img src="${LOGO}"><span>Builder<b>Pro</b></span></div>
<div class="pill">${pill}</div>
<h1>${a}<br><span>${b}</span></h1><p>${c}</p></div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1200, height: 630 } });
  for (const [k, v] of Object.entries(CARDS)) {
    await pg.setContent(page(v), { waitUntil: 'networkidle' });
    await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: path.join(OUT, k + '.png') });
  }
  await b.close();
  console.log('wrote', Object.keys(CARDS).length, 'cards to assets/og');
})();
