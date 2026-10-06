// ABRO service worker -- what makes the web app installable as a phone
// app (docs/DECISIONS.md ADR-015). Hand-written on purpose: it does three
// small things and nothing else.
//
//  1. Next's content-hashed build files (/_next/static/*) and the app
//     icons are cached on first use, so the installed app opens fast.
//     Their names change on every deploy, so a cached copy is never stale.
//  2. Page navigations always go to the network first. Only when that
//     fails (no connection) is the cached offline.html shown instead -- a
//     plain page with no app JavaScript, since Next's bundles for it may
//     not be cached.
//     Pages themselves are never served from cache, so a deploy shows up
//     on the next open.
//  3. Everything else -- above all the API under /api/* and any other
//     origin -- is left to the browser untouched. Balances and expenses
//     are never cached: they must always be current, and they belong to
//     whoever is signed in.
//
// Bump VERSION to drop every cache this worker created.

const VERSION = 'v2';
const STATIC_CACHE = `abro-static-${VERSION}`;
const OFFLINE_CACHE = `abro-offline-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('abro-') && ![STATIC_CACHE, OFFLINE_CACHE].includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })
          .then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ??
            fetch(request).then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            }),
        ),
      ),
    );
  }
});
