// frames raw app screens for the stores: navy background, two-line headline, device frame
const { chromium } = require('playwright'); const fs = require('fs');
const path = require('path'), ROOT = path.resolve(__dirname, '../..');
const RAW = (process.env.RAW || path.join(__dirname, 'raw')) + '/', OUT = ROOT + '/docs/store-screenshots/';
const SHOTS = [
  ['1-dash', 'Your whole business', 'on one screen'],
  ['2-jobs', 'Every job, and', 'what\u2019s still owed'],
  ['3-money', 'See your profit', 'on every job'],
  ['4-calendar', 'Book visits,', 'send your crew'],
  ['5-crew', 'Your crew clocks in', 'from their phone'],
  ['6-homeowner', 'Customers follow', 'every step'],
];
const DEV = {
  iphone: { W: 440, H: 956, D: 3, raw: 'i', rw: 430, rh: 932, fw: 0, top: 214, bottom: 44, hs: 40, ht: 84, bez: 9, rad: 54 },
  android: { W: 360, H: 640, D: 3, raw: 'i', rw: 430, rh: 932, fw: 0, top: 138, bottom: 30, hs: 29, ht: 46, bez: 7, rad: 38 },
  ipad: { W: 1032, H: 1376, D: 2, raw: 'p', rw: 1032, rh: 1376, fw: 0, top: 252, bottom: 60, hs: 58, ht: 92, bez: 14, rad: 40 },
};
const b64 = f => fs.readFileSync(f).toString('base64');
const page = (d, img, l1, l2) => `<html><head><style>
*{margin:0;box-sizing:border-box}body{width:${d.W}px;height:${d.H}px;overflow:hidden;font-family:'Inter Display','Inter',sans-serif;
background:radial-gradient(120% 60% at 50% 0%,#0b3f97 0%,#062a66 35%,#031634 75%,#020d22 100%)}
h1{position:absolute;left:0;right:0;top:${d.ht}px;text-align:center;color:#fff;font-weight:800;font-size:${d.hs}px;line-height:1.08;letter-spacing:-.025em}
h1 span{display:block;color:#4b99fe}
.dev{position:absolute;left:50%;top:${d.top}px;width:${d.fw}px;transform:translateX(-50%);padding:${d.bez}px;background:#0b1220;border-radius:${d.rad}px;
box-shadow:0 0 0 1.5px rgba(255,255,255,.14),0 30px 80px rgba(0,0,0,.55)}
.dev img{display:block;width:100%;border-radius:${d.rad - d.bez}px}
</style></head><body><h1>${l1}<span>${l2}</span></h1><div class="dev"><img src="data:image/png;base64,${img}"></div></body></html>`;
// the whole device fits in the picture: its width follows from the room left under the headline
for (const d of Object.values(DEV)) { const room = d.H - d.top - d.bottom; d.fw = Math.round((room - 2 * d.bez) * d.rw / d.rh + 2 * d.bez); }
(async () => {
  const b = await chromium.launch();
  for (const [k, d] of Object.entries(DEV)) {
    const p = await b.newPage({ viewport: { width: d.W, height: d.H }, deviceScaleFactor: d.D });
    for (let i = 0; i < SHOTS.length; i++) {
      const [name, l1, l2] = SHOTS[i];
      await p.setContent(page(d, b64(RAW + d.raw + (i + 1) + '.png'), l1, l2)); await p.waitForTimeout(250);
      await p.screenshot({ path: OUT + k + '-' + name + '.png' });
    }
    await p.close();
  }
  // Google Play banner, 1024 x 500
  const p = await b.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const logo = b64(ROOT + '/assets/app/icon-512.png');
  await p.setContent(`<html><head><style>*{margin:0;box-sizing:border-box}body{width:1024px;height:500px;overflow:hidden;font-family:'Inter Display','Inter',sans-serif;
  background:radial-gradient(90% 120% at 20% 10%,#0b3f97 0%,#062a66 40%,#031634 80%)}
  .l{position:absolute;left:60px;top:110px;width:430px}.brand{display:flex;align-items:center;gap:16px;color:#fff;font-weight:800;font-size:34px;letter-spacing:-.02em}
  .brand img{width:64px;height:64px;border-radius:15px}h1{margin-top:26px;color:#fff;font-weight:800;font-size:52px;line-height:1.04;letter-spacing:-.03em}h1 span{color:#4b99fe}
  p{margin-top:18px;color:#b9c7dd;font-family:Inter,sans-serif;font-size:20px;line-height:1.4}
  .ph{position:absolute;width:230px;padding:7px;background:#0b1220;border-radius:34px;box-shadow:0 0 0 1.5px rgba(255,255,255,.14),0 24px 60px rgba(0,0,0,.6)}.ph img{display:block;width:100%;border-radius:27px}
  </style></head><body><div class="l"><div class="brand"><img src="data:image/png;base64,${logo}">BuilderPro</div><h1>Run jobs, crews<br>and <span>customers</span></h1>
  <p>Leads, estimates, payments and your crew, in one app.</p></div>
  <div class="ph" style="left:560px;top:90px;transform:rotate(-6deg)"><img src="data:image/png;base64,${b64(RAW + 'i5.png')}"></div>
  <div class="ph" style="left:760px;top:40px;transform:rotate(5deg)"><img src="data:image/png;base64,${b64(RAW + 'i1.png')}"></div></body></html>`);
  await p.waitForTimeout(250); await p.screenshot({ path: OUT + 'android-feature-graphic.png' });
  await b.close();
})();
