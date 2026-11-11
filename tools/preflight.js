/* Preflight: the checks that must pass before a change goes live.
   Run:  node tools/preflight.js        (needs Playwright; uses the pre-installed
                                         Chromium at /opt/pw-browsers if it's there)

   It never logs in, sends a form, texts, calls or charges anyone. External
   requests other than script/style CDNs are blocked, so pages load as a
   signed-out visitor would see them with no backend.

   1. Every JavaScript file and every inline <script> in the main pages compiles.
   2. The main pages open with no JavaScript errors and show what they should.
   3. The unit tests in tools/*.test.js that check current behaviour pass.
   Exits 1 on any failure, with a list of what failed. */
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const fails = [], notes = [];
const fail = (m) => { fails.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

/* ---------- 1. syntax ---------- */
function compiles(code, where) {
  try { new vm.Script(code, { filename: where }); return true; }
  catch (e) { fail(`${where}: ${String(e.message).split('\n')[0]}`); return false; }
}
console.log('1. JavaScript compiles');
let nFiles = 0;
for (const dir of ['portal', 'site', 'embed-src', 'workers']) {
  const d = path.join(ROOT, dir); if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) if (f.endsWith('.js')) {
    const src = fs.readFileSync(path.join(d, f), 'utf8');
    if (/^\s*(import|export)\s/m.test(src)) continue;           // ES modules: checked by the browser step
    nFiles++; compiles(src, `${dir}/${f}`);
  }
}
const PAGES = ['index.html', 'app.html', 'signup.html', 'command.html', 'help.html', 'compare.html', 'roof-estimator-tool.html', 'terms.html'];
let nInline = 0;
for (const p of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi; let m, i = 0;
  while ((m = re.exec(html))) {
    i++; const attrs = m[1] || '';
    if (/\bsrc=/.test(attrs) || /type=["']?(module|importmap|application\/(ld\+)?json|text\/template)/i.test(attrs) || !m[2].trim()) continue;
    nInline++; compiles(m[2], `${p} <script #${i}>`);
  }
}
if (!fails.length) ok(`${nFiles} files and ${nInline} inline scripts`);

/* ---------- 2. pages in a browser ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.gif': 'image/gif' };
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rsp) => {
      let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, path.normalize(u));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}
// what each page must show (signed out, no backend)
const CHECKS = [
  { page: 'index.html', w: 1366, want: async (p) => { const t = await p.evaluate(() => document.body.innerText); return [['shows $99/$199/$299', /\$99/.test(t) && /\$199/.test(t) && /\$299/.test(t)], ['says the free trial (pilot month or 14 days)', /14[- ]day|14 days|first month free/i.test(t)]]; } },
  { page: 'index.html', w: 390, want: async (p) => [['fits a phone (no sideways scroll)', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)]] },
  { page: 'app.html', w: 1366, want: async (p) => [['log-in form is there', await p.evaluate(() => !!document.getElementById('bpxLoginForm') && !!document.getElementById('bpxPassword'))]] },
  { page: 'app.html', w: 390, want: async (p) => [['log-in form fits a phone', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)]] },
  { page: 'signup.html', w: 1366, want: async (p) => { const t = await p.evaluate(() => document.body.innerText); return [['sign-up shows the plans', /Foundation/i.test(t) && /Enterprise/i.test(t)]]; } },
  { page: 'command.html', w: 1366, want: async (p) => [['Command Center log-in is there', await p.evaluate(() => !!document.getElementById('login'))]] },
  { page: 'roof-estimator-tool.html', w: 1366, want: async (p) => [['calculator has inputs', await p.evaluate(() => document.querySelectorAll('input,select,iframe').length > 0)]] },
  { page: 'help.html', w: 1366, want: async () => [] },
  { page: 'compare.html', w: 1366, want: async () => [] },
];
const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.(googleapis|gstatic)\.com|esm\.sh)\//;
async function browser(base) {
  console.log('2. Main pages open with no errors');
  let chromium; try { ({ chromium } = require('playwright')); } catch { fail('playwright is not installed'); return; }
  const exe = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
  let b; try { b = await chromium.launch(exe); } catch { b = await chromium.launch(); }
  for (const c of CHECKS) {
    const ctx = await b.newContext({ viewport: { width: c.w, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(String(e.message || e).split('\n')[0]));
    await p.route('**/*', (r) => { const u = r.request().url(); return u.startsWith(base) || CDN.test(u) ? r.continue() : r.abort(); });
    const label = `${c.page} @${c.w}px`;
    try {
      await p.goto(base + '/' + c.page, { waitUntil: 'load', timeout: 30000 });
      await p.waitForTimeout(1500);
      const res = await c.want(p);
      const bad = res.filter((x) => !x[1]).map((x) => x[0]);
      // a blocked backend call is expected; real code errors are not
      const real = errs.filter((e) => !/Failed to fetch|NetworkError|net::ERR|Load failed|aborted/i.test(e));
      if (real.length) fail(`${label}: JavaScript error: ${real.slice(0, 3).join(' | ')}`);
      if (bad.length) fail(`${label}: ${bad.join(', ')}`);
      if (!real.length && !bad.length) ok(label + (res.length ? ': ' + res.map((x) => x[0]).join(', ') : ''));
    } catch (e) { fail(`${label}: didn't load (${String(e.message).split('\n')[0]})`); }
    await ctx.close();
  }
  await b.close();
}

/* ---------- 3. unit tests ---------- */
// tests that match today's screens; the others in tools/ check older layouts
const TESTS = ['calc-models', 'crew-cost', 'email-parse', 'gmail-script', 'inbox-split', 'lead-parse', 'mail-senders', 'project-budget'];
async function tests(port) {
  console.log('3. Unit tests');
  const { spawn } = require('child_process');
  for (const t of TESTS) {
    const f = path.join(__dirname, t + '.test.js'); if (!fs.existsSync(f)) continue;
    // run alongside our server (a blocking run would freeze it): the browser tests load the site from :8771
    const r = await new Promise((res) => {
      const c = spawn(process.execPath, [f], { cwd: ROOT, env: { ...process.env, PORT: String(port) } }); let out = '';
      c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d));
      const k = setTimeout(() => c.kill(), 120000);
      c.on('close', (code) => { clearTimeout(k); res({ code, out }); });
    });
    if (r.code === 0) ok(t); else fail(`${t}.test.js: ${r.out.trim().split('\n').slice(-2).join(' ').slice(0, 200)}`);
  }
}

(async () => {
  const s = await serve(), base = `http://127.0.0.1:${s.address().port}`;
  // the older tests are hard-wired to :8771
  const s2 = await new Promise((res) => { const x = http.createServer(s.listeners('request')[0]); x.on('error', () => res(null)); x.listen(8771, () => res(x)); });
  await browser(base);
  await tests(8771);
  s.close(); if (s2) s2.close();
  console.log(fails.length ? `\nPREFLIGHT FAILED: ${fails.length} problem(s)` : '\nPREFLIGHT PASSED');
  process.exit(fails.length ? 1 : 0);
})();
