/* BuilderPro service worker: makes the site installable as an app and shows
   a friendly page when there's no connection.

   Deliberately small. Pages are always fetched fresh from the network (the app
   changes often, and a stale app is worse than an offline notice); only when
   the network fails do we show offline.html. Versioned scripts and styles
   (?v=...), icons and fonts are cached because a new version gets a new URL.
   Nothing from Supabase, HighLevel, Stripe or any other API is ever cached. */
const VERSION = 'bp-sw-1';
const SHELL = ['/offline.html', '/assets/app/logo-256.png', '/assets/app/icon-192.png', '/assets/app/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const cacheable = (u) =>
  (u.origin === self.location.origin && (/[?&]v=/.test(u.search) || /^\/assets\/(app|brand)\//.test(u.pathname))) ||
  u.origin === 'https://fonts.gstatic.com' || u.origin === 'https://fonts.googleapis.com';

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (!cacheable(u)) return; // the browser handles it as if there were no service worker
  e.respondWith(caches.open(VERSION).then((c) => c.match(req).then((hit) => {
    if (hit) return hit;
    return fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; });
  })));
});
