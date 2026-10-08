// Phase 8 (docs/WIRING_PLAN.md) -- the shared fetch wrapper every real
// apps/api call goes through, starting with auth (~/lib/auth-api.ts).
// Later Phase 8 slices (dashboard, expenses, groups, settlements,
// profile/settings) add their own typed `~/lib/*-api.ts` files on top of
// this same client rather than each rolling their own fetch logic.
//
// `credentials: 'include'` on every request -- apps/api's session is an
// HttpOnly cookie (apps/api/internal/auth/router.go's setSessionCookie),
// unreadable from JS by design, so the browser must be told to send/
// accept it cross-origin. This only works because apps/api now has CORS
// configured for exactly this origin (apps/api/internal/httpx/cors.go).
// On the free-tier deploy (ADR-012) NEXT_PUBLIC_API_URL is `/api`, a
// same-origin path next.config.mjs forwards to the API, so the same code
// runs without any cross-origin request at all.
//
// Error shape mirrors apps/api/internal/httpx/errors.go's APIError JSON
// envelope: {statusCode, code, message, path, timestamp}.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3201';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  { keepCache = false }: { keepCache?: boolean } = {},
): Promise<T> {
  const isRead = (init?.method ?? 'GET') === 'GET';
  const changesData = !isRead && !keepCache;
  if (changesData) {
    // Anything that changes data can change balances anywhere, so nothing
    // read before it may be reused after it -- but the saved copy is only
    // dropped once the server answered: a write that fails offline must
    // not wipe what the app can still show.
    forgetInFlightReads();
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    // FormData sets its own multipart Content-Type (with the boundary).
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { 'Content-Type': 'application/json', ...init?.headers },
  }).catch(() => {
    // No connection (or the server unreachable): say so plainly rather
    // than a generic failure.
    throw new ApiError(0, 'OFFLINE', "You're offline. Check your connection and try again.");
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (changesData) {
    // Again on completion: a read that started during the change could
    // otherwise cache what the server had before it.
    clearApiCache();
  }

  if (res.status === 401 && (body?.code === 'NO_SESSION' || body?.code === 'INVALID_SESSION')) {
    // Signed out elsewhere or expired: nothing saved may outlive it.
    clearApiCache();
  }
  if (res.status === 401 && redirectToSignIn(body?.code as string | undefined)) {
    // Never settles: the page keeps its loading state while the browser
    // leaves, instead of flashing its error card first.
    return new Promise<T>(() => {});
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (body?.code as string) ?? 'UNKNOWN_ERROR',
      (body?.message as string) ?? 'Something went wrong. Please try again.',
    );
  }

  return body as T;
}

/** A signed-out or expired session (apps/api/internal/auth/middleware.go's
 * NO_SESSION / INVALID_SESSION) sends the browser to sign-in from any
 * protected screen, so no page has to handle it itself. The /auth/*
 * pages are left alone: they expect "not signed in" and handle it.
 * Returns whether it redirected. */
function redirectToSignIn(code: string | undefined): boolean {
  if (
    typeof window === 'undefined' ||
    (code !== 'NO_SESSION' && code !== 'INVALID_SESSION') ||
    window.location.pathname.startsWith('/auth/')
  ) {
    return false;
  }
  window.location.replace('/auth/signin');
  return true;
}

// ---- Read cache (roadmap Phase 2b; saved on the device since ADR-022) ----
// Every screen builds itself from the same few reads (profile, friends,
// groups, balances, expenses, notifications). They are answered
// stale-while-revalidate, the way a native app shows its last data at
// once and refreshes quietly:
//  - A read seen before is answered at once from the cache, whatever its
//    age, so screens open with content instead of a skeleton -- even
//    right after the app starts, or with no connection.
//  - If that answer is older than CACHE_TTL_MS, it is fetched again in the
//    background; when the server's answer differs, `onApiUpdate`
//    listeners (useApiRefresh) re-run their screen's load to show it.
//  - Coming back to the app (tab or installed app becomes visible again)
//    marks everything old, so the screen refreshes a friend's new expense
//    without blanking first.
//  - Any POST/PATCH/DELETE clears it all (before and after), so after you
//    add, edit, settle or delete, no screen shows a balance from before.
//  - `generation` stops a read in flight across a clear from writing its
//    older answer back into the fresh cache.
//  - Only viewing screens (those using useApiRefresh) get old answers.
//    Money flows -- settle up, edit an expense, record a payment -- don't
//    use it, so they always wait for the server instead of pre-filling
//    an amount from yesterday's balances.
//  - Saved in this browser's localStorage (best effort), so it survives
//    closing the app. Signing out (a POST) and an expired session (401)
//    wipe it, so the next person on this device sees nothing of yours.

const CACHE_TTL_MS = 30_000;
const STORAGE_KEY = 'abro.readCache.v1';
const readCache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
const updateListeners = new Set<() => void>();
let generation = 0;
let staleReaders = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadSaved(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
      string,
      { at: number; data: unknown }
    >;
    for (const [path, entry] of Object.entries(saved)) {
      // Never "fresh" after a restart: shown at once, then re-checked.
      readCache.set(path, { at: 0, data: entry.data });
    }
  } catch {
    // Private mode, blocked storage or a garbled value: start empty.
  }
}

function saveSoon(): void {
  if (typeof window === 'undefined' || saveTimer) {
    return;
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(readCache)));
    } catch {
      // Full or blocked: the in-memory cache still works for this visit.
    }
  }, 500);
}

let updateQueued = false;
function announceUpdate(): void {
  // Several reads landing together re-run each screen once, not per read.
  if (updateQueued) {
    return;
  }
  updateQueued = true;
  queueMicrotask(() => {
    updateQueued = false;
    updateListeners.forEach((listener) => listener());
  });
}

/** Makes reads already in flight unable to cache their answer, and every
 * cached read old, without dropping anything. */
function forgetInFlightReads(): void {
  generation += 1;
  inFlight.clear();
  for (const entry of readCache.values()) {
    entry.at = 0;
  }
}

/** Drops every cached read, here and on the device. */
export function clearApiCache(): void {
  generation += 1;
  readCache.clear();
  inFlight.clear();
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved to remove.
  }
}

/** Calls `listener` when a background refresh brought newer data, or the
 * app became visible again. Returns the unsubscribe function. */
export function onApiUpdate(listener: () => void): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

/** Lets reads answer from old cache entries while the returned function
 * hasn't been called (useApiRefresh, for a mounted viewing screen). */
export function allowStaleReads(): () => void {
  staleReaders += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      staleReaders -= 1;
    }
  };
}

/** Keeps every cached read but treats it as old, so screens re-check
 * the server without blanking (coming back to the app, pull to refresh). */
export function markApiCacheStale(): void {
  for (const entry of readCache.values()) {
    entry.at = 0;
  }
  announceUpdate();
}

if (typeof document !== 'undefined') {
  loadSaved();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      markApiCacheStale();
    }
  });
}

function fetchAndCache<T>(path: string): Promise<T> {
  const pending = inFlight.get(path);
  if (pending) {
    return pending as Promise<T>;
  }
  const startedIn = generation;
  const promise = request<T>(path)
    .then((data) => {
      if (startedIn === generation) {
        const before = readCache.get(path);
        readCache.set(path, { at: Date.now(), data });
        saveSoon();
        if (before && JSON.stringify(before.data) !== JSON.stringify(data)) {
          announceUpdate();
        }
      }
      return data;
    })
    .finally(() => {
      if (inFlight.get(path) === promise) {
        inFlight.delete(path);
      }
    });
  inFlight.set(path, promise);
  return promise;
}

function cachedGet<T>(path: string): Promise<T> {
  const hit = readCache.get(path);
  if (!hit) {
    return fetchAndCache<T>(path);
  }
  if (Date.now() - hit.at >= CACHE_TTL_MS) {
    if (staleReaders === 0) {
      return fetchAndCache<T>(path);
    }
    // Offline or failing: keep showing what we have; the screen already
    // has it, and the next visit tries again.
    fetchAndCache<T>(path).catch(() => {});
  }
  return Promise.resolve(hit.data as T);
}

export const api = {
  get: <T>(path: string) => cachedGet<T>(path),
  post: <T>(path: string, data?: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
      headers,
    }),
  /** A POST that can't change any balance or list (re-registering this
   * device for push), so it leaves the read cache alone. */
  postKeepingCache: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }, { keepCache: true }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
};

/** An API-relative path (e.g. a photo's `/users/{id}/avatar/{version}`,
 * ADR-017) as a URL the browser can load: same-origin `/api/...` on the
 * free-tier deploy, the API's origin in dev. Absolute URLs (a Google
 * profile picture) pass through. */
export function apiUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith('/') ? `${API_URL}${pathOrUrl}` : pathOrUrl;
}

/** `${API_URL}/auth/google` is a real page navigation (the OAuth
 * redirect dance), never a `fetch` -- exported so signin/setup-profile
 * link to it directly instead of hardcoding the API origin twice. */
export function googleSignInUrl(): string {
  return `${API_URL}/auth/google`;
}
