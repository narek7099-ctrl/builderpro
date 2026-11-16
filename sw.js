/* BuilderPro service worker: makes the site installable as an app, and lets
   the app open and work with no signal (2026-11-15, offline mode).

   - The app page (/app, /app.html, /app/) is fetched fresh whenever there is
     a connection (a stale app is worse than a slow one) and a copy of the
     last good one is kept; with no connection that copy opens instead.
   - Versioned scripts and styles (?v=...), icons, fonts and the outside
     libraries the app runs on (cdn.jsdelivr.net, unpkg.com, cdnjs) are kept as
     they load: a new version gets a new address, so a kept copy is never stale.
     When a newer version of a file arrives, the older copies of it are dropped.
   - After each online load the app sends the list of everything it used
     ('warm'), and anything not yet kept is fetched in the background, so the
     offline copy is complete without anyone opening things ahead of time.
   - Other pages: fresh from the network, offline.html when there is none.
   - Job and inspection photos (Supabase storage, project-files) are kept as
     they are viewed, filed by the photo's path rather than its short-lived
     link, so a photo seen once still shows with no signal (2026-11-16). The
     newest 400 are kept.
   - Nothing else from Supabase, HighLevel, Stripe or any other API is ever
     kept here: the app keeps its own data and queues its own changes
     (portal/offline.js). */
const VERSION = 'bp-sw-3';
const PAGE = '/app.html';
const SHELL = ['/offline.html', '/assets/app/logo-256.png', '/assets/app/icon-192.png', '/assets/app/icon-512.png'];
const PHOTOS = 'bp-photos';
const SB = 'https://ttzwzouhiwdwamuimhpo.supabase.co';
const CDN = ['https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://cdnjs.cloudflare.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  /* carry the kept app page over from the last version, then drop old caches */
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== PHOTOS).map((k) =>
    caches.open(k).then((old) => old.match(PAGE)).then((hit) => hit && caches.open(VERSION).then((c) => c.match(PAGE).then((have) => have || c.put(PAGE, hit))))
      .then(() => caches.delete(k))))).then(() => self.clients.claim()));
});

const isApp = (u) => u.origin === self.location.origin && /^\/app(\.html|\/(index\.html)?)?$/.test(u.pathname);
const cacheable = (u) =>
  (u.origin === self.location.origin && (/[?&]v=/.test(u.search) || /^\/assets\/(app|brand|portal|site)\//.test(u.pathname) || /^\/portal\/.+\.(png|jpe?g|webp|svg)$/.test(u.pathname))) ||
  u.origin === 'https://fonts.gstatic.com' || u.origin === 'https://fonts.googleapis.com' ||
  CDN.indexOf(u.origin) >= 0;

/* keep a response; a newer ?v= of the same file replaces the older ones */
function keep(c, req, res) {
  const u = new URL(req.url);
  if (u.origin === self.location.origin && /[?&]v=/.test(u.search)) {
    c.keys().then((ks) => ks.forEach((k) => { const o = new URL(k.url); if (o.pathname === u.pathname && o.search !== u.search) c.delete(k); }));
  }
  return c.put(req, res);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (req.mode === 'navigate') {
    if (isApp(u)) {
      /* the app: fresh when online (and kept), the kept copy when not */
      /* asked for as a web page (Accept: text/html): inside the Android app, Capacitor only adds
         its native bridge (camera, push, Face ID) to pages fetched that way */
      e.respondWith(fetch(new Request(self.location.origin + PAGE + u.search, { cache: 'no-cache', credentials: 'same-origin', headers: { Accept: req.headers.get('accept') || 'text/html,application/xhtml+xml,*/*;q=0.8' } }))
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(PAGE, copy)); }
          return res;
        })
        .catch(() => caches.open(VERSION).then((c) => c.match(PAGE)).then((hit) => hit || caches.match('/offline.html'))));
      return;
    }
    e.respondWith(fetch(req, { cache: 'no-cache' }).catch(() => caches.match('/offline.html')));
    return;
  }
  /* videos and audio are fetched in byte ranges, which a cache can't hold, and Safari won't
     play a video handed over by a service worker: leave them to the browser */
  if (req.headers.has('range') || req.destination === 'video' || req.destination === 'audio' || /\.(mp4|webm|mov|m4v|mp3|m4a)$/i.test(u.pathname)) return;
  if (u.origin === SB && /^\/storage\/v1\/object\/(sign|public)\/project-files\//.test(u.pathname)) {
    /* fresh when there's a signal (kept by path), the kept copy when there isn't */
    const key = SB + u.pathname.replace('/object/sign/', '/object/public/');
    e.respondWith(fetch(u.href, { mode: 'cors', credentials: 'omit' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(PHOTOS).then((c) => c.put(key, copy).then(() => trim(c))); }
      return res;
    }).catch(() => caches.open(PHOTOS).then((c) => c.match(key)).then((hit) => hit || Response.error())));
    return;
  }
  if (!cacheable(u)) return; // the browser handles it as if there were no service worker
  e.respondWith(caches.open(VERSION).then((c) => c.match(req).then((hit) => {
    if (hit) return hit;
    return fetch(req).then((res) => { if (res.ok || res.type === 'opaque') keep(c, req, res.clone()); return res; });
  })));
});

let trimming = false;
function trim(c) {
  if (trimming) return; trimming = true;
  c.keys().then((ks) => Promise.all(ks.slice(0, Math.max(0, ks.length - 400)).map((k) => c.delete(k)))).then(() => { trimming = false; }, () => { trimming = false; });
}

/* the app's list of what it loaded: keep anything not kept yet, quietly */
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'warm' || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(d.urls.slice(0, 400).map((s) => {
    let u; try { u = new URL(s, self.location.origin); } catch (err) { return null; }
    if (!cacheable(u) || /\.(mp4|webm|mov|m4v|mp3|m4a)$/i.test(u.pathname)) return null;
    const req = new Request(u.href, u.origin === self.location.origin ? {} : { mode: 'no-cors' });
    return c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') return keep(c, req, res); }).catch(() => null));
  }))));
});
