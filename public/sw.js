// Service worker: keeps the app's files on the phone so it opens without network.
// Trip data is stored separately by the app (localStorage), not here.
const CACHE = 'trip-splitter-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch('/index.html', { cache: 'no-store' });
      const html = await res.clone().text();
      await cache.put('/index.html', res);
      // Save the JS/CSS files the page uses (their names change on every build).
      const urls = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
      await cache.addAll([...new Set(urls)]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Supabase calls go straight to the network

  if (req.mode === 'navigate') {
    // Try the network briefly (weak signal in the mountains), otherwise open the saved app.
    event.respondWith(
      (async () => {
        try {
          const res = await Promise.race([fetch(req), timeout(4000)]);
          if (res.ok) (await caches.open(CACHE)).put('/index.html', res.clone());
          return res;
        } catch {
          return (await caches.match('/index.html')) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })()
  );
});
