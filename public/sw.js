/* Klyfton AI offline shell.
   Rural MT/WY job sites often have zero signal — this caches the app so Klyfton
   opens and every on-device tool (quotes, estimator, calculators, Ops logs) works
   with no connection. Live-only features (AI chat, weather, sync) fail gracefully.
   Shell is network-FIRST so new deploys land immediately when there IS signal, with
   a cached fallback when there isn't. Bump CACHE to force old clients to refresh. */
const CACHE = 'klyfton-v46';
const CORE = ['./', 'index.html', 'estimator.html', 'lead.html', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                          // POSTs (AI, sync) never cached
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // cross-origin (AI API, weather, banners) → straight to network
  if (url.pathname.startsWith('/api/')) return;              // never cache API

  const isShell = req.mode === 'navigate' || /\.(html?|webmanifest)$/.test(url.pathname) || url.pathname === '/';
  if (isShell) {
    // Network-first: get the latest deploy when online, fall back to cache offline.
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
    );
    return;
  }
  // Other same-origin assets: cache-first with background refresh.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit))
  );
});
