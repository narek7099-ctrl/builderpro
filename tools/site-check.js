// Daily website check for builderpro-os.com (.github/workflows/site-check.yml).
// Opens the live site like a visitor and checks that it works. Never fills in or
// sends a form, so it costs nothing and texts no one. Analytics are blocked so
// the check doesn't count as visits.
//   1. every page in sitemap.xml answers, with a title
//   2. homepage on a computer and a phone: nav, 3 plan prices, FAQ, no errors,
//      no sideways scrolling
//   3. a few trade pages, the compare page and sign-up: nav and live calculator
//   4. all 36 tools (/embed/*.html): they show their first step
//   5. the app's log-in screen (/?portal=1) opens
// Writes site-check.json, and posts it to the health-check function when
// SITE_CHECK_KEY is set, so problems show in the Command Center and the bell.
// Exits 1 when something is wrong, so GitHub emails you too.
//   node tools/site-check.js [base-url]
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = (process.argv[2] || 'https://builderpro-os.com').replace(/\/$/, '');
const FN = 'https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/health-check';
const BLOCK = /googletagmanager|google-analytics|embed\/track\.js|functions\/v1\/site-track|facebook\.net|clarity\.ms/;
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1440, height: 900 } };
const problems = [];
const bad = (area, text) => { problems.push({ area: 'Website', text: area + ': ' + text }); console.log('PROBLEM', area, '-', text); };

async function visit(browser, url, ctxOpts, test, tries = 2) {
  for (let t = 1; t <= tries; t++) {
    const ctx = await browser.newContext(ctxOpts), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 140)));
    await pg.route(BLOCK, (r) => r.abort());
    let why = '';
    try {
      const res = await pg.goto(url, { waitUntil: 'load', timeout: 45000 });
      if (!res || res.status() >= 400) why = 'answered ' + (res ? res.status() : 'nothing');
      else { await pg.waitForTimeout(2500); why = (await test(pg)) || ''; }
      if (!why && errs.length) why = 'script error: ' + errs[0];
    } catch (e) { why = String(e.message || e).split('\n')[0].slice(0, 160); }
    await ctx.close();
    if (!why) return '';
    if (t === tries) return why;
  }
}
const noSideScroll = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - innerWidth > 2 ? 'the page scrolls sideways on a phone' : '');

(async () => {
  const started = Date.now();
  // 1. sitemap
  let urls = [];
  try {
    const xml = await (await fetch(BASE + '/sitemap.xml')).text();
    urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://builderpro-os.com', BASE));
    if (urls.length < 10) bad('Sitemap', 'only ' + urls.length + ' pages listed');
  } catch (e) { bad('Sitemap', 'could not be read'); }
  for (let i = 0; i < urls.length; i += 8) {
    await Promise.all(urls.slice(i, i + 8).map(async (u) => {
      for (let t = 0; t < 2; t++) {
        try { const r = await fetch(u); const s = await r.text(); if (r.ok && /<title>[^<]+/.test(s)) return; if (t) bad(u.replace(BASE, '') || '/', r.ok ? 'has no title' : 'answered ' + r.status); }
        catch (e) { if (t) bad(u.replace(BASE, '') || '/', 'did not answer'); }
      }
    }));
  }

  const browser = await chromium.launch();
  // 2. homepage
  const home = async (pg) => {
    const r = await pg.evaluate(() => ({
      nav: !!document.querySelector('.pnav_bar') && getComputedStyle(document.querySelector('.pnav')).display !== 'none',
      prices: (document.querySelector('#pricing') || { innerText: '' }).innerText.match(/\$\d+/g) || [],
      faq: document.querySelectorAll('#faq .qa').length,
    }));
    if (!r.nav) return 'the nav bar is missing';
    if (r.prices.length < 3) return 'the plan prices are missing';
    if (r.faq < 5) return 'the FAQ is missing';
    return '';
  };
  let w = await visit(browser, BASE + '/', DESK, home); if (w) bad('Homepage (computer)', w);
  w = await visit(browser, BASE + '/', PHONE, async (pg) => (await home(pg)) || noSideScroll(pg)); if (w) bad('Homepage (phone)', w);

  // 3. trade pages, compare, sign-up
  const trade = async (pg) => {
    if (!(await pg.$('.pnav_bar'))) return 'the nav bar is missing';
    const f = await pg.$('.mk-frame iframe'); if (!f) return 'the live calculator is missing';
    await f.scrollIntoViewIfNeeded(); await pg.waitForTimeout(3000);
    const fr = await f.contentFrame(); const n = fr ? await fr.evaluate(() => document.body.innerText.trim().length).catch(() => 0) : 0;
    return n > 40 ? '' : 'the live calculator stays blank';
  };
  for (const p of ['roofing-crm-software.html', 'ai-receptionist-for-hvac.html', 'pool-cost-calculator.html']) {
    w = await visit(browser, BASE + '/' + p, DESK, trade); if (w) bad(p + ' (computer)', w);
    w = await visit(browser, BASE + '/' + p, PHONE, async (pg) => (await trade(pg)) || noSideScroll(pg)); if (w) bad(p + ' (phone)', w);
  }
  w = await visit(browser, BASE + '/compare.html', PHONE, async (pg) => (await pg.$('.pnav_bar')) ? noSideScroll(pg) : 'the nav bar is missing'); if (w) bad('compare.html', w);
  w = await visit(browser, BASE + '/signup.html', PHONE, async (pg) => (await pg.evaluate(() => [...document.querySelectorAll('#view button, #view input')].some((b) => b.offsetParent))) ? noSideScroll(pg) : 'the sign-up form is missing'); if (w) bad('signup.html', w);

  // 4. the 36 tools
  const trades = ['roofing', 'hvac', 'general', 'plumbing', 'electrical', 'painting', 'landscaping', 'concrete', 'countertops', 'pools', 'trim', 'flooring'];
  const tools = trades.flatMap((t) => [t, 'damage-' + t, 'health-' + t]);
  const tool = async (pg) => {
    const r = await pg.evaluate(() => ({ text: document.body.innerText.trim().length, btn: [...document.querySelectorAll('button, input, a.e-btn')].some((b) => b.offsetParent) }));
    return r.text > 40 && r.btn ? '' : 'shows nothing to tap';
  };
  for (let i = 0; i < tools.length; i += 4) {
    const res = await Promise.all(tools.slice(i, i + 4).map((t) => visit(browser, BASE + '/embed/' + t + '.html', PHONE, tool).then((x) => [t, x])));
    for (const [t, x] of res) if (x) bad('Tool ' + t, x);
  }

  // 5. the app's log-in screen
  w = await visit(browser, BASE + '/?portal=1', PHONE, async (pg) => {
    await pg.waitForSelector('#bpxPassword', { state: 'visible', timeout: 12000 }).catch(() => {});
    return (await pg.$('#bpxPassword:visible')) ? '' : "the app's log-in screen doesn't open";
  });
  if (w) bad('App log-in', w);
  await browser.close();

  const out = { ok: problems.length === 0, problems, pages: urls.length, tools: tools.length, at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000) };
  fs.writeFileSync('site-check.json', JSON.stringify(out, null, 2));
  console.log(out.ok ? 'All good' : problems.length + ' problem(s)', '-', urls.length, 'pages,', tools.length, 'tools,', out.seconds + 's');
  if (process.env.SITE_CHECK_KEY) {
    const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-site-check-key': process.env.SITE_CHECK_KEY }, body: JSON.stringify({ op: 'site_report', ...out }) }).catch(() => null);
    console.log('reported to health-check:', r ? r.status : 'failed');
  } else console.log('SITE_CHECK_KEY not set: not reported to the Command Center');
  process.exit(out.ok ? 0 : 1);
})();
