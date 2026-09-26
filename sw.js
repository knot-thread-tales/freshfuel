// FreshFuel service worker
// IMPORTANT: this only caches the static app shell (HTML/CSS/JS/icons).
// It deliberately never caches Supabase API responses — menu availability
// and prices must always come from the network, never from a stale cache,
// since a customer scanning the stall QR code needs to see real stock status.

const CACHE_NAME = 'freshfuel-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never intercept writes (order inserts, admin updates, etc.)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept cross-origin requests — Supabase (menu/price/availability
  // data), Google Fonts, the UPI QR generator. These must always hit the
  // network so the customer always sees live, current information.
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first, so a returning visitor gets the latest
  // deployed version, falling back to the cached shell only when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate for fast repeat loads
  // that still pick up updates in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
