// ABRO service worker -- what makes the web app installable as a phone
// app (docs/DECISIONS.md ADR-015) and shows push notifications (ADR-021).
// Hand-written on purpose: it does four small things and nothing else.
//
//  1. Next's content-hashed build files (/_next/static/*) and the app
//     icons are cached on first use, so the installed app opens fast.
//     Their names change on every deploy, so a cached copy is never stale.
//  2. Pages go to the network first, and each one that loads is kept, so
//     the installed app opens with no connection (ADR-022): if the network
//     fails, or takes longer than NAVIGATION_TIMEOUT_MS, the kept copy is
//     shown and the screens fill from the data saved on the device. The
//     main tabs (and the files they need) are kept on install, so they
//     open offline even before being visited. A page never kept falls
//     back to offline.html. Pages hold no personal data -- every screen
//     is filled in the browser -- so keeping them is safe; online, the
//     network copy wins, so a deploy shows up on the next open.
//  3. Everything else -- above all the API under /api/* and any other
//     origin -- is left to the browser untouched. The data screens show
//     offline is saved by the app itself (lib/api-client.ts), per
//     account, and wiped on sign-out -- never by this worker.
//  4. A push from apps/api (internal/push) is shown as a notification;
//     tapping it marks it read and opens what it's about in the app.
//
// Bump VERSION to drop every cache this worker created.

const VERSION = 'v4';
const STATIC_CACHE = `abro-static-${VERSION}`;
const OFFLINE_CACHE = `abro-offline-${VERSION}`;
const PAGE_CACHE = `abro-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const NAVIGATION_TIMEOUT_MS = 4000;
// The bottom-bar tabs and the screens they lead to most, kept on install.
const APP_PAGES = ['/home', '/friends', '/groups', '/activity', '/notifications', '/balances'];

/** Keeps a page and the build files its HTML names, best effort. */
async function keepPage(path) {
  const response = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
  if (!response.ok || response.redirected) {
    return;
  }
  const html = await response.clone().text();
  await (await caches.open(PAGE_CACHE)).put(path, response);
  const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(
    [...new Set(assets)].map((asset) =>
      statics.match(asset).then((hit) => hit ?? statics.add(asset).catch(() => {})),
    ),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      // Never fail the install over a page that didn't load.
      .then(() => Promise.all(APP_PAGES.map((path) => keepPage(path).catch(() => {}))))
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
              (key) =>
                key.startsWith('abro-') && ![STATIC_CACHE, OFFLINE_CACHE, PAGE_CACHE].includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Network first; the kept copy when the network fails or is too slow. */
async function navigate(request, url, event) {
  const key = url.pathname;
  const network = fetch(request).then((response) => {
    // Keep only real pages, not redirects (e.g. to sign-in) or errors.
    if (response.ok && !response.redirected && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(PAGE_CACHE).then((cache) => cache.put(key, copy)));
    }
    return response;
  });
  const kept = await caches.match(key, { cacheName: PAGE_CACHE });
  if (!kept) {
    return network.catch(() =>
      caches
        .match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })
        .then((offline) => offline ?? Response.error()),
    );
  }
  // Slow or no connection: open from the kept copy rather than wait.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(kept), NAVIGATION_TIMEOUT_MS));
  event.waitUntil(network.catch(() => {}));
  return Promise.race([network.catch(() => kept), timeout]);
}

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
    event.respondWith(navigate(request, url, event));
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

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // Not ours or garbled: still show something, as browsers require.
  }
  event.waitUntil(
    self.registration.showNotification(message.title || 'ABRO', {
      body: message.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      // Same notification id twice (a retry) replaces rather than stacks.
      tag: message.id || undefined,
      data: { id: message.id, link: message.link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { id, link } = event.notification.data || {};
  // Notifications without a link open the list, which knows where each
  // type goes.
  const target = new URL(link || '/notifications', self.location.origin).href;

  event.waitUntil(
    Promise.all([
      id
        ? fetch(`/api/notifications/${id}/read`, {
            method: 'PATCH',
            credentials: 'same-origin',
          }).catch(() => {})
        : null,
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
        if (open) {
          return open.focus().then((w) => w.navigate(target));
        }
        return self.clients.openWindow(target);
      }),
    ]),
  );
});
