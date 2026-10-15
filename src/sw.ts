/// <reference lib="webworker" />
/**
 * Service worker: makes the app shell available offline.
 *
 * Strategy: precache all built files on install; serve them cache-first. Navigations are served
 * from the cached index.html when the network is unreachable — important because the phone has
 * no internet while it is connected to the node's OTA WiFi.
 *
 * Requests to the proxy / GitHub are not cached here: release lists and firmware files are
 * stored in IndexedDB by the app itself.
 */
declare const __PRECACHE__: string[];
declare const __SW_VERSION__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `alpine-ota-shell-${__SW_VERSION__}`;

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(__PRECACHE__)));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('alpine-ota-shell-') && key !== CACHE) await caches.delete(key);
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') void sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 4000);
          const res = await fetch(req, { signal: ctrl.signal });
          clearTimeout(timer);
          return res;
        } catch {
          return (await cache.match('./index.html')) ?? (await cache.match('./')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      return cached ?? fetch(req);
    })(),
  );
});
