/* MGSF FieldOS — offline-first service worker
   Bump CACHE on every deploy so crews pull the new build. */
const CACHE = 'mgsf-fieldos-2026-06-28f-ai-roi5-profit-mroi-hubspot-cl2-deposit-esign';
const CORE = ['./', './index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App shell / navigations: network-first, fall back to cache (works offline).
  const isShell = req.mode === 'navigate' ||
                  url.pathname === '/' ||
                  url.pathname.endsWith('/index.html');
  if (isShell) {
    e.respondWith(
      fetch(req).then(res => {
        caches.open(CACHE).then(c => c.put('./index.html', res.clone()));
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Everything else (e.g. logo CDN): cache-first, populate in background.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
